// V2-004.004 rollout readiness report (READ-ONLY).
//
// Answers one question for an environment: does EVERY active location have an
// explicit configuration row for EVERY configurable module? Backend module
// enforcement may be activated only when the answer is yes (the database
// itself refuses activation otherwise -- this script is the human-readable
// preview of that same rule).
//
//   node scripts/module-enforcement-readiness.mjs --env-file .env.development.local
//   node scripts/module-enforcement-readiness.mjs --url http://127.0.0.1:54321 --key-env LOCAL_KEY
//   add --summary to print counts only (no organization/location names)
//
// Safety
//   * Only HTTP GET. It never inserts, defaults, backfills or repairs a row.
//   * Refuses the PRODUCTION project outright; accepts the DEV project or a
//     loopback (local) stack only.
//   * Never prints a key. Detailed output is for the operator's terminal --
//     do not attach it to public CI artifacts or issues (use --summary there).
//   * A failed or partial read is NOT a successful result: exit code 2.
// Exit codes: 0 ready, 1 not ready, 2 could not determine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_REF = "opmujepkemwcdxxorhfd";
export const PROD_REF = "ftadewtkjlaotfdvtjcv";

/** Mirrors `public.location_module_key`; verified against the registry by a unit test. */
export const EXPECTED_MODULE_KEYS = [
  "attendance",
  "bar_inventory",
  "payroll",
  "recipes",
  "schedule",
  "table_allocation",
  "tasks",
  "team",
  "tips",
];

/**
 * Same rule as `private.module_enforcement_readiness()` and the TypeScript
 * `evaluateModuleReadiness`: active = active && not archived; ready = every
 * expected key present. Unknown keys and other locations' rows never count.
 */
export function evaluateReadiness(
  locations,
  configs,
  expected = EXPECTED_MODULE_KEYS,
) {
  const keys = [...expected].sort();
  const byLocation = new Map();
  for (const config of configs) {
    const set = byLocation.get(config.location_id) ?? new Set();
    set.add(config.module_key);
    byLocation.set(config.location_id, set);
  }
  const rows = locations
    .filter((l) => l.active === true && (l.archived_at ?? null) === null)
    .map((l) => {
      const present = byLocation.get(l.id) ?? new Set();
      const configured = keys.filter((k) => present.has(k));
      const missing = keys.filter((k) => !present.has(k));
      return {
        organizationId: l.organization_id,
        organizationName: l.organizations?.name ?? "",
        locationId: l.id,
        locationName: l.name ?? "",
        expected: keys,
        configured,
        missing,
        ready: missing.length === 0,
      };
    });
  const ready = rows.filter((r) => r.ready).length;
  return {
    activeLocations: rows.length,
    readyLocations: ready,
    notReadyLocations: rows.length - ready,
    ready: rows.length === ready,
    rows,
  };
}

export function assertAllowedTarget(url) {
  if (typeof url !== "string" || url === "") {
    throw new Error("No Supabase URL was provided.");
  }
  if (url.includes(PROD_REF)) {
    throw new Error("Refusing to read the PRODUCTION project.");
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("The Supabase URL is not valid.");
  }
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
  const dev = url === `https://${DEV_REF}.supabase.co`;
  if (!loopback && !dev) {
    throw new Error("Only the DEV project or a loopback stack is allowed.");
  }
}

async function getAll(baseUrl, key, resource) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
      method: "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        range: `${from}-${from + 999}`,
        "range-unit": "items",
      },
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(
        `Read of ${resource.split("?")[0]} failed (${response.status}).`,
      );
    }
    const page = await response.json();
    if (!Array.isArray(page))
      throw new Error(`Unexpected response for ${resource}.`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

function parseArgs(argv) {
  const args = { summary: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--summary") args.summary = true;
    else if (a === "--env-file") args.envFile = argv[++i];
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--key-env") args.keyEnv = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let url = args.url;
  let key = args.keyEnv ? process.env[args.keyEnv] : undefined;
  if (args.envFile) {
    const env = parseEnvFile(
      fs.readFileSync(path.resolve(args.envFile), "utf8"),
    );
    url = url ?? env.NEXT_PUBLIC_SUPABASE_URL;
    key = key ?? env.SUPABASE_SECRET_KEY;
  }
  assertAllowedTarget(url);
  if (!key) throw new Error("No service key was provided.");

  const locations = await getAll(
    url,
    key,
    "locations?select=id,organization_id,name,active,archived_at,organizations(name)&order=id",
  );
  const configs = await getAll(
    url,
    key,
    "location_module_configs?select=location_id,module_key&order=location_id",
  );
  const report = evaluateReadiness(locations, configs);

  const target = url.includes(DEV_REF) ? "hosted DEV" : "local stack";
  console.log(`Module enforcement readiness (${target})`);
  console.log(`  active locations:            ${report.activeLocations}`);
  console.log(`  with complete configuration: ${report.readyLocations}`);
  console.log(`  missing configuration:       ${report.notReadyLocations}`);
  console.log(`  configuration rows read:     ${configs.length}`);
  console.log(`  RESULT: ${report.ready ? "READY" : "NOT READY"}`);
  if (!args.summary) {
    for (const row of report.rows) {
      console.log(
        `${row.ready ? "ready    " : "NOT READY"} | ${row.organizationName} | ${row.locationName} | configured ${row.configured.length}/${row.expected.length}` +
          (row.missing.length ? ` | missing: ${row.missing.join(", ")}` : ""),
      );
    }
  }
  process.exitCode = report.ready ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Readiness could not be determined: ${error.message}`);
    process.exitCode = 2;
  });
}
