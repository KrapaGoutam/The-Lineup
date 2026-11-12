// Local Docker only. Usage: node scripts/kiosk/test-local-concurrency.mjs
// Requires the schema-only rehearsal DB described in CONTINUATION_VALIDATION.md.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);
const args = [
  "exec",
  "-i",
  "supabase_db_restaurant-roster",
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  "lineup_kiosk_continuation_20261111",
  "-At",
  "-v",
  "ON_ERROR_STOP=1",
];
const actor = randomUUID(),
  org = randomUUID(),
  loc = randomUUID();
const prefix = `kiosk-race-${randomUUID().slice(0, 8)}`;
const query = async (sql) =>
  (
    await exec("docker", [...args, "-c", sql], { timeout: 15000 })
  ).stdout.trim();
const sessions = [];
function session(label) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stderr.on("data", (b) => {
    output += b;
  });
  const done = new Promise((resolve) =>
    child.on("close", (code) => resolve({ code, output })),
  );
  const send = (sql) => child.stdin.write(sql + "\n");
  send(
    `set application_name='${prefix}-${label}'; set statement_timeout='10s'; begin; set local role service_role;`,
  );
  const s = { child, send, done, output: () => output };
  sessions.push(s);
  return s;
}
async function until(check, message) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(message);
}
async function race(firstSql, secondSql, waitEvent) {
  const label = randomUUID().slice(0, 6);
  const a = session(`${label}-a`),
    b = session(`${label}-b`);
  a.send(`${firstSql}; select 'first-ready';`);
  await until(() => {
    if (a.output().includes("ERROR")) throw new Error(a.output());
    return a.output().includes("first-ready");
  }, "first transaction did not finish mutation").catch((err) => {
    throw new Error(err.message + a.output());
  });
  b.send(`${secondSql}; commit;`);
  b.child.stdin.end();
  await until(
    async () =>
      (await query(
        `select exists(select 1 from pg_stat_activity where application_name='${prefix}-${label}-b' and wait_event_type='Lock' ${waitEvent ? `and wait_event='${waitEvent}'` : ""})`,
      )) === "t",
    "second transaction never waited on first",
  );
  a.send("commit;");
  a.child.stdin.end();
  const results = await Promise.all([a.done, b.done]);
  for (const r of results) assert.equal(r.code, 0, r.output);
  return results.map((r) => r.output);
}
try {
  await query(`insert into auth.users(id,email) values('${actor}','${actor}@kiosk.invalid');
    insert into public.profiles(id,display_name) values('${actor}','Kiosk concurrency');
    insert into public.organizations(id,name,slug,created_by) values('${org}','Kiosk concurrency','${prefix}','${actor}');
    insert into public.memberships(organization_id,profile_id,roles,active) values('${org}','${actor}',array['owner']::public.app_role[],true);
    insert into public.locations(id,organization_id,name,time_zone,attendance_mode) values('${loc}','${org}','Local rehearsal','America/Chicago','internal_the_lineup');
    insert into public.kiosk_pairing_codes(organization_id,location_id,device_name,code_hash,created_by) values('${org}','${loc}','Concurrent tablet','${prefix}-code','${actor}');`);

  const consume = (source, token, code = `${prefix}-code`) =>
    `select public.kiosk_consume_pairing_code('${code}',repeat('${token}',64),'${prefix}-${source}')`;
  const [paired, reused] = await race(consume("a", "a"), consume("b", "b"));
  assert.match(paired, /"success": true/);
  assert.match(reused, /ALREADY_USED/);
  assert.equal(
    await query(
      `select count(*) from public.kiosk_devices where organization_id='${org}'`,
    ),
    "1",
  );
  assert.equal(
    await query(
      `select count(*) from public.audit_events where organization_id='${org}' and action='kiosk_device_paired'`,
    ),
    "1",
  );
  console.log(
    "PASS: different sources consume one code once, with one audit event",
  );

  await query(
    `insert into public.kiosk_pairing_attempts(code_hash,client_identifier,succeeded) select '${prefix}-unknown','${prefix}-limited',false from generate_series(1,9)`,
  );
  const [lastAllowed, denied] = await race(
    consume("limited", "c", `${prefix}-unknown`),
    consume("limited", "d", `${prefix}-another-unknown`),
    "advisory",
  );
  assert.match(lastAllowed, /NOT_FOUND/);
  assert.match(denied, /RATE_LIMITED/);
  assert.equal(
    await query(
      `select count(*) from public.kiosk_pairing_attempts where client_identifier='${prefix}-limited' and not succeeded`,
    ),
    "11",
  );
  console.log(
    "PASS: concurrent unknown-code attempts serialize; committed failures survive denial",
  );

  const device = await query(
    `select id from public.kiosk_devices where organization_id='${org}'`,
  );
  const upsert = (
    token,
  ) => `insert into public.kiosk_sessions(device_id,organization_id,location_id,profile_id,display_name,session_token_hash,encrypted_access_token,expires_at)
    values('${device}','${org}','${loc}','${actor}','Concurrency','${prefix}-${token}','synthetic-encrypted-token',now()+interval '3 minutes')
    on conflict(device_id) do update set session_token_hash=excluded.session_token_hash, encrypted_access_token=excluded.encrypted_access_token, expires_at=excluded.expires_at returning session_token_hash`;
  await race(upsert("session-a"), upsert("session-b"));
  assert.equal(
    await query(
      `select count(*) from public.kiosk_sessions where device_id='${device}'`,
    ),
    "1",
  );
  assert.equal(
    await query(
      `select session_token_hash from public.kiosk_sessions where device_id='${device}'`,
    ),
    `${prefix}-session-b`,
  );
  console.log(
    "PASS: concurrent device-session upserts leave one valid replacement token",
  );
} finally {
  for (const s of sessions)
    if (!s.child.stdin.destroyed) s.child.stdin.end("rollback;\n");
  await Promise.all(sessions.map((s) => s.done));
  await query(`delete from public.kiosk_pairing_attempts where client_identifier like '${prefix}%';
    delete from public.organizations where id='${org}'; delete from auth.users where id='${actor}';`);
  assert.equal(
    await query(`select count(*) from public.organizations where id='${org}'`),
    "0",
  );
  console.log("PASS: synthetic fixtures removed");
}
