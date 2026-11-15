import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestFile = join(root, "scripts/release/approved-migrations.json");
const migrationsDir = join(root, "supabase/migrations");
const versionPattern = /^\d{14}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`Production release guard: ${message}`);
}

export function assertReleaseContext(input) {
  if (input.eventName !== "workflow_dispatch") fail("manual trigger required");
  if (input.ref !== "refs/heads/main") fail("main branch required");
  if (!shaPattern.test(input.headSha ?? "")) fail("invalid main SHA");
  if (input.inputSha !== input.headSha || input.approvedSha !== input.headSha)
    fail("approved, dispatched, and checked-out SHA must match");
  if (input.checkoutSha !== input.headSha) fail("checkout SHA mismatch");
  if (input.projectRef !== "ftadewtkjlaotfdvtjcv")
    fail("Production project ref mismatch");
  if (input.approvedEnvironment !== "production")
    fail("approved Production environment required");
  if (
    !digestPattern.test(input.inputReceipt ?? "") ||
    input.approvedReceipt !== input.inputReceipt
  )
    fail("owner-approved isolation receipt digest required");
}

export function digestMigrationSet(files) {
  return createHash("sha256")
    .update(
      files.map((file) => `${file.name}\0${file.sha256}\n`).join(""),
      "utf8",
    )
    .digest("hex");
}

export function assertLocalMigrations(files, manifest) {
  if (files.length !== 98 || manifest.versions?.length !== 98)
    fail("exactly 98 approved local migration files required");
  if (manifest.baselineCount !== 62 || manifest.targetCount !== 98)
    fail("approved ledger counts changed");
  if (
    manifest.baselineMainSha !== "5e5b7747693b6e81014eafdf299b87e56c3f033d" ||
    manifest.acceptedDevelopmentSha !==
      "ec06ce95faa8d6bf0f8127b2a92b3bb2a8818ad4"
  )
    fail("immutable source baseline changed");
  if (manifest.projectRef !== "ftadewtkjlaotfdvtjcv")
    fail("manifest project mismatch");
  for (let index = 0; index < files.length; index++) {
    if (
      !versionPattern.test(files[index].version) ||
      files[index].version !== manifest.versions[index] ||
      (index > 0 && files[index].version <= files[index - 1].version)
    )
      fail("local migration versions differ from approved set");
  }
  if (files.some((file) => file.version === "20261113120000"))
    fail("shelved executor migration is present");
  if (digestMigrationSet(files) !== manifest.fileSetSha256)
    fail("approved migration file content changed");
}

export function assertRemoteLedger(rows, manifest, phase) {
  const expectedLength =
    phase === "before"
      ? manifest.baselineCount
      : phase === "after"
        ? manifest.targetCount
        : fail("unknown ledger phase");
  if (!Array.isArray(rows) || rows.length !== expectedLength)
    fail(`unexpected ${phase} migration ledger count`);
  for (let index = 0; index < expectedLength; index++) {
    if (rows[index]?.version !== manifest.versions[index])
      fail(`unexpected ${phase} migration ledger version`);
  }
}

function readLocalMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      version: name.slice(0, 14),
      sha256: createHash("sha256")
        .update(readFileSync(join(migrationsDir, name)))
        .digest("hex"),
    }));
}

async function readRemoteLedger(projectRef, token) {
  if (!token) fail("Management access token missing");
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "select version from supabase_migrations.schema_migrations order by version",
        read_only: true,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    fail(`read-only ledger query failed: HTTP ${response.status}`);
  const payload = await response.json();
  // Management API is beta. Unknown response shapes must fail before db push.
  if (!Array.isArray(payload)) fail("unrecognized ledger response");
  return payload;
}

async function main() {
  const phase = process.argv[2];
  if (!["preflight", "ledger-before", "ledger-after"].includes(phase))
    fail("unknown guard command");
  const input = {
    eventName: process.env.RELEASE_EVENT,
    ref: process.env.RELEASE_REF,
    headSha: process.env.RELEASE_HEAD_SHA,
    inputSha: process.env.RELEASE_INPUT_SHA,
    approvedSha: process.env.RELEASE_APPROVED_SHA,
    checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    projectRef: process.env.RELEASE_PROJECT_REF,
    approvedEnvironment: process.env.RELEASE_APPROVED_ENVIRONMENT,
    inputReceipt: process.env.RELEASE_INPUT_RECEIPT,
    approvedReceipt: process.env.RELEASE_APPROVED_RECEIPT,
  };
  assertReleaseContext(input);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  assertLocalMigrations(readLocalMigrations(), manifest);
  if (phase !== "preflight") {
    const rows = await readRemoteLedger(
      input.projectRef,
      process.env.SUPABASE_ACCESS_TOKEN,
    );
    assertRemoteLedger(
      rows,
      manifest,
      phase === "ledger-before" ? "before" : "after",
    );
  }
  process.stdout.write(
    `Release guard ${phase} passed; no fence was reopened.\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
