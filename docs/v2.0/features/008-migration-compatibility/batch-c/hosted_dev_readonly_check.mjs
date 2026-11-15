#!/usr/bin/env node
// V2-008 Batch C - READ-ONLY migration-state verifier.
//
//   node hosted_dev_readonly_check.mjs --target local  [--expect 88|89|90|91]
//   node hosted_dev_readonly_check.mjs --target hosted [--expect 88|89|90|91]
//   node hosted_dev_readonly_check.mjs --target hosted --snapshot before.json
//   node hosted_dev_readonly_check.mjs --target hosted --compare  before.json --expect 91
//
// What it does: runs SELECT-only statements inside `begin read only` and prints ONLY counts,
// versions and md5 fingerprints. It never prints, stores or returns row contents, secrets or tokens.
//   --target hosted  Supabase Management API for the DEV project ref below. The ref is hard-coded;
//                    the Production ref is refused. Needs LINEUP_SUPABASE_ACCESS_TOKEN in the environment.
//   --target local   the disposable local docker database (container from REHEARSAL_DB_CONTAINER).
//   --expect N       classify the ledger + function fingerprints against the expected state and exit 1
//                    on any mismatch. A mixed/unknown function fingerprint is reported as PARTIAL.
//   --snapshot FILE  write per-table {rows, md5-of-all-rows} for public/private + auth users/sessions/
//                    identities/refresh_tokens (hashes only). Take it immediately before an apply.
//   --compare FILE   diff the current hashes against a snapshot; every table must be identical.
//
// It cannot write: statements are guarded to start with select/with and exclude write keywords.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DEV_REF = "opmujepkemwcdxxorhfd";
const PROD_REF = "ftadewtkjlaotfdvtjcv";
const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = opt("--target");
if (!["hosted", "local"].includes(target ?? "")) {
  console.error("--target hosted|local is required");
  process.exit(2);
}
const expectState = opt("--expect");
const snapshotFile = opt("--snapshot");
const compareFile = opt("--compare");

const expected = JSON.parse(
  fs.readFileSync(path.join(here, "expected-fingerprints.json"), "utf8"),
);

function assertReadOnly(sql) {
  const bare = sql.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''");
  if (!/^\s*(with|select)\b/i.test(bare))
    throw new Error("only SELECT/WITH allowed");
  if (
    /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|do|copy|vacuum|reindex|refresh|notify|listen|lock|set\s+role|execute)\b/i.test(
      bare,
    )
  ) {
    throw new Error("write keyword refused");
  }
}

/** Returns the rows of ONE select as an array of objects. */
async function rows(sql) {
  const body = sql.replace(/--.*$/gm, "").trim().replace(/;\s*$/, "");
  assertReadOnly(body);
  const wrapped = `select coalesce(jsonb_agg(q_), '[]'::jsonb) as j from (${body}) q_`;
  if (target === "local") {
    const out = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        process.env.REHEARSAL_DB_CONTAINER ?? "supabase_db_restaurant-roster",
        "psql",
        "-U",
        "postgres",
        "-X",
        "-q",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "begin read only",
        "-c",
        wrapped,
        "-c",
        "rollback",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(out.split("\n").find((l) => l.startsWith("[")) ?? "[]");
  }
  const token = process.env.LINEUP_SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("LINEUP_SUPABASE_ACCESS_TOKEN is not set");
  if (DEV_REF === PROD_REF) throw new Error("refusing the Production ref");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${DEV_REF}/database/query`,
    {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: `begin read only; ${wrapped}; rollback;` }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text)[0].j;
}

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

let failed = false;
const fail = (m) => {
  failed = true;
  console.log(`FAIL  ${m}`);
};
const pass = (m) => console.log(`ok    ${m}`);
const check = (cond, okMsg, failMsg) => {
  if (cond) pass(okMsg);
  else fail(failMsg);
};

// ---- 1. ledger -------------------------------------------------------------------------
const [{ n, max }] = await rows(
  "select count(*)::int as n, max(version) as max from supabase_migrations.schema_migrations",
);
const present = (
  await rows(
    `select version from supabase_migrations.schema_migrations where version in (${expected.ledger.pending.map((v) => `'${v}'`).join(",")}) order by 1`,
  )
).map((r) => r.version);
console.log(
  `ledger: ${n} applied, max ${max}, pending versions present: [${present.join(", ") || "none"}]`,
);

// ---- 2. function fingerprint -> state ----------------------------------------------------
const fnRows = await rows(read("function_fingerprint.sql"));
const fnLines = fnRows.map((r) =>
  [r.sig, r.def_md5, r.secdef ? "t" : "f", r.cfg, r.acl, r.owner].join("|"),
);
const fnMd5 = md5(fnLines.join("\n"));
const states = expected.functionFingerprint.states;
const matched =
  Object.entries(states).find(([, s]) => s.md5 === fnMd5)?.[0] ?? null;
console.log(
  `functions: ${fnLines.length} fingerprinted, md5 ${fnMd5} -> ${matched ?? "UNKNOWN/PARTIAL"}`,
);

// ---- 3. schema fingerprint ----------------------------------------------------------------
const sch = Object.fromEntries(
  (await rows(read("schema_fingerprint.sql"))).map((r) => [
    r.k,
    { n: r.n, h: r.h },
  ]),
);
console.log(
  "schema:",
  Object.entries(sch)
    .map(([k, v]) => `${k}=${v.n}`)
    .join(" "),
);

if (expectState) {
  const key = `ledger${expectState}`;
  const want = states[key];
  if (!want) throw new Error("--expect must be 88, 89, 90 or 91");
  const wantCount = 88 + want.migrationsApplied;
  check(
    n === wantCount,
    `ledger count ${n}`,
    `ledger count ${n}, expected ${wantCount}`,
  );
  const wantMax =
    want.migrationsApplied === 0
      ? expected.ledger.before.max
      : expected.ledger.pending[want.migrationsApplied - 1];
  check(
    max === wantMax,
    `ledger max ${max}`,
    `ledger max ${max}, expected ${wantMax}`,
  );
  const wantPresent = expected.ledger.pending.slice(0, want.migrationsApplied);
  check(
    JSON.stringify(present) === JSON.stringify(wantPresent),
    "pending versions present exactly as expected",
    `pending versions present [${present}], expected [${wantPresent}]`,
  );
  check(
    fnMd5 === want.md5,
    `function fingerprint == ledger ${expectState}`,
    `function fingerprint is ${matched ?? "UNKNOWN/PARTIAL"}, expected ledger ${expectState}`,
  );
  const schWant =
    expectState === "88"
      ? expected.schemaFingerprint.ledger88
      : expectState === "91"
        ? expected.schemaFingerprint.ledger91
        : null;
  if (schWant) {
    const bad = Object.keys(schWant).filter(
      (k) => sch[k]?.h !== schWant[k].h || sch[k]?.n !== schWant[k].n,
    );
    check(
      bad.length === 0,
      "schema fingerprint (8 categories) matches",
      `schema categories differ: ${bad.join(", ")}`,
    );
  }
}

// ---- 4. data hashes (counts + md5 only) ---------------------------------------------------
if (snapshotFile || compareFile) {
  const tables = (
    await rows(
      `select table_schema||'.'||table_name as t from information_schema.tables where table_type='BASE TABLE' and (table_schema in ('public','private') or (table_schema='auth' and table_name in ('users','sessions','identities','refresh_tokens'))) order by 1`,
    )
  ).map((r) => r.t);
  const sql = tables
    .map(
      (t) =>
        `select '${t}' as k, count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x`,
    )
    .join("\nunion all\n");
  const cur = Object.fromEntries(
    (await rows(sql)).map((r) => [r.k, { n: r.n, h: r.h }]),
  );
  if (snapshotFile) {
    fs.writeFileSync(
      snapshotFile,
      JSON.stringify(
        { takenAt: new Date().toISOString(), target, tables: cur },
        null,
        1,
      ),
    );
    console.log(
      `snapshot: ${tables.length} tables, ${Object.values(cur).reduce((s, v) => s + v.n, 0)} rows (hashes only) -> ${snapshotFile}`,
    );
  }
  if (compareFile) {
    const prior = JSON.parse(fs.readFileSync(compareFile, "utf8")).tables;
    const changed = [
      ...new Set([...Object.keys(prior), ...Object.keys(cur)]),
    ].filter((k) => prior[k]?.h !== cur[k]?.h || prior[k]?.n !== cur[k]?.n);
    check(
      changed.length === 0,
      `all ${tables.length} tables identical to the snapshot`,
      `tables changed since the snapshot: ${changed.join(", ")}`,
    );
  }
}

process.exit(failed ? 1 : 0);
