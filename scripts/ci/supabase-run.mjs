// Runs the local-Supabase steps of the Database workflow (`start`, `reset`,
// `test`), surviving transient container-registry pull failures without
// hiding real ones.
//
//   node scripts/ci/supabase-run.mjs start|reset|test
//
// Why: `supabase start` pulls images from public.ecr.aws anonymously and
// GitHub-hosted runners share IPs, so it intermittently fails with
// "toomanyrequests: Data limit exceeded" before any database check runs.
// The CLI does not use `docker login` credentials, so the fix is to pull
// from a mirror (SUPABASE_INTERNAL_IMAGE_REGISTRY) and fall back to the
// other registries that carry the same pinned tags. `db reset` and `test db`
// pull images too (e.g. pg_prove), so every step goes through this wrapper,
// and the registry that worked is exported to later steps via GITHUB_ENV.
//
// Policy (see docs/features/dev-preview-ci-reliability/PLAN.md, INFRA-B):
//   - only failures classified "registry-transient" are retried;
//   - at most MAX_ATTEMPTS attempts, one registry per attempt, with backoff;
//   - any other failure (SQL, migration, config, unknown) fails immediately;
//   - each retry is logged as a workflow warning so it is observable.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Same reduced service list the workflow used before this script existed:
// only the database and auth are needed by the migrations and pgTAP.
export const EXCLUDED_SERVICES = [
  "studio",
  "imgproxy",
  "edge-runtime",
  "logflare",
  "vector",
  "mailpit",
  "realtime",
  "storage-api",
  "postgres-meta",
  "supavisor",
];

export const COMMANDS = {
  start: ["start", "-x", EXCLUDED_SERVICES.join(",")],
  reset: ["db", "reset"],
  test: ["test", "db"],
};

// Order matters: ghcr.io first (no AWS data-egress cap on public packages).
export const REGISTRIES = ["ghcr.io", "public.ecr.aws", "docker.io"];
export const MAX_ATTEMPTS = 3;
export const BACKOFF_SECONDS = [15, 45];

const NON_TRANSIENT =
  /SQLSTATE|syntax error at|failed to apply|Error parsing config|invalid (config|toml)|permission denied for (table|schema|function)/i;
const PULL_CONTEXT = /pull|image|registry|manifest/i;
const TRANSIENT =
  /toomanyrequests|Data limit exceeded|429 Too Many Requests|TLS handshake timeout|i\/o timeout|connection reset by peer|unexpected EOF|Client\.Timeout exceeded|temporary failure in name resolution/i;

/** @returns {"registry-transient" | "other"} */
export function classifyStartFailure(output) {
  if (NON_TRANSIENT.test(output)) return "other";
  if (PULL_CONTEXT.test(output) && TRANSIENT.test(output)) {
    return "registry-transient";
  }
  return "other";
}

/** Pure planning helper so the policy is testable without a container runtime. */
export function nextStep({ attempt, output, registry }) {
  const kind = classifyStartFailure(output);
  if (kind !== "registry-transient") return { retry: false, kind };
  if (attempt >= MAX_ATTEMPTS) return { retry: false, kind };
  return {
    retry: true,
    kind,
    registry:
      REGISTRIES[(REGISTRIES.indexOf(registry) + 1) % REGISTRIES.length],
    waitSeconds: BACKOFF_SECONDS[attempt - 1] ?? 45,
  };
}

function run(args, env) {
  const r = spawnSync("npx", ["supabase", ...args], {
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  process.stdout.write(output);
  return { ok: r.status === 0, output };
}

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function main(name) {
  const args = COMMANDS[name];
  if (!args) {
    console.error(
      `::error::unknown command "${name}" (expected start|reset|test)`,
    );
    return 2;
  }
  let registry = process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY || REGISTRIES[0];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(
      `::group::supabase ${name} attempt ${attempt}/${MAX_ATTEMPTS} (image registry: ${registry})`,
    );
    const env = { ...process.env, SUPABASE_INTERNAL_IMAGE_REGISTRY: registry };
    const result = run(args, env);
    console.log("::endgroup::");
    if (result.ok) {
      console.log(`supabase ${name} succeeded via ${registry}`);
      if (process.env.GITHUB_ENV) {
        fs.appendFileSync(
          process.env.GITHUB_ENV,
          `SUPABASE_INTERNAL_IMAGE_REGISTRY=${registry}
`,
        );
      }
      return 0;
    }
    const step = nextStep({ attempt, output: result.output, registry });
    if (!step.retry) {
      console.log(
        `::error title=supabase ${name} failed::classification=${step.kind}; not retrying.`,
      );
      return 1;
    }
    console.log(
      `::warning title=Registry pull failed::classification=${step.kind} on ${registry}; retrying via ${step.registry} after ${step.waitSeconds}s (attempt ${attempt}/${MAX_ATTEMPTS}).`,
    );
    if (name === "start") run(["stop", "--no-backup"], env); // clear partial containers
    sleep(step.waitSeconds);
    registry = step.registry;
  }
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv[2] ?? "start"));
}
