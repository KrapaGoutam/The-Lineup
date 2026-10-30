// Local-only, real two-session PostgreSQL concurrency tests (RC-045/112/114).
// Usage: node scripts/recipes/test-management-concurrency.mjs
// Uses the repository's local Docker database, never a hosted connection.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);
const container = "supabase_db_opmujepkemwcdxxorhfd";
const args = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-At",
  "-v",
  "ON_ERROR_STOP=1",
];
const ids = new Map();
const id = (n) => {
  if (!ids.has(n)) ids.set(n, randomUUID());
  return ids.get(n);
};
const org = id("011"),
  actor = id("001"),
  category = id("021"),
  recipe = id("031");
const sessions = [];
async function query(sql) {
  const { stdout } = await exec("docker", [...args, "-c", sql], {
    timeout: 15000,
  });
  return stdout.trim();
}
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
    `set application_name='recipes-r2-${label}'; set statement_timeout='10s'; begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true);`,
  );
  const s = { child, send, done, output: () => output };
  sessions.push(s);
  return s;
}
async function until(check, message) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(message);
}
async function blocked(label) {
  await until(
    async () =>
      (await query(
        `select exists(select 1 from pg_stat_activity where application_name='recipes-r2-${label}' and wait_event='advisory')`,
      )) === "t",
    `${label} never waited on the organization lock`,
  );
}
const save = (number, name, existing = "null", version = "null") =>
  `select public.bar_recipe_save('${org}',${existing},${version},jsonb_build_object('category_id','${category}','recipe_number',${number},'name','${name}','variants','{"perfect":{}}'::jsonb));`;
const restore = `select public.bar_recipe_set_archived('${org}','${recipe}',1,false);`;
const deactivate = `select public.bar_recipe_category_set_active('${org}','${category}',1,false);`;
try {
  assert.equal(
    await query(`select count(*) from public.organizations where id='${org}'`),
    "0",
    "fixture id must be unused",
  );
  await query(
    `insert into auth.users(id,email) values('${actor}','${actor}@harness.invalid'); insert into public.profiles(id,display_name) values('${actor}','Concurrency'); insert into public.organizations(id,name,slug,created_by) values('${org}','R2 concurrency','pgtap-r2-${org}','${actor}'); insert into public.memberships(organization_id,profile_id,roles,active) values('${org}','${actor}',array['owner']::public.app_role[],true); insert into public.bar_recipe_categories(id,organization_id,name,slug,created_by) values('${category}','${org}','Concurrent','concurrent','${actor}'); insert into public.bar_recipes(id,organization_id,category_id,recipe_number,name,slug,is_active,archived_at,created_by) values('${recipe}','${org}','${category}',1,'Restore','restore',false,now(),'${actor}');`,
  );
  // Restore wins first: deactivation waits, then sees the restored recipe.
  let a = session("restore-first"),
    b = session("deactivate-second");
  a.send(restore + "\n\\echo RESTORED");
  await until(() => a.output().includes("RESTORED"), "restore did not finish");
  b.send(deactivate);
  await blocked("deactivate-second");
  a.send("commit;\n\\q");
  b.send("commit;\n\\q");
  assert.equal((await a.done).code, 0);
  assert.match((await b.done).output, /cannot be deactivated/);
  assert.equal(
    await query(
      `select is_active from public.bar_recipe_categories where id='${category}'`,
    ),
    "t",
  );
  console.log(
    "PASS restore-first: deactivation waits and rejects active recipe",
  );
  // Deactivation wins first: restore waits, then rejects the inactive category.
  await query(
    `update public.bar_recipes set is_active=false,archived_at=now(),version=1 where id='${recipe}';`,
  );
  a = session("deactivate-first");
  b = session("restore-second");
  a.send(deactivate + "\n\\echo DEACTIVATED");
  await until(
    () => a.output().includes("DEACTIVATED"),
    "deactivate did not finish",
  );
  b.send(restore);
  await blocked("restore-second");
  a.send("commit;\n\\q");
  b.send("commit;\n\\q");
  assert.equal((await a.done).code, 0);
  assert.match((await b.done).output, /Choose an active category/);
  assert.equal(
    await query(
      `select is_active from public.bar_recipes where id='${recipe}'`,
    ),
    "f",
  );
  console.log(
    "PASS deactivate-first: restore waits and rejects inactive category",
  );
  await query(
    `update public.bar_recipe_categories set is_active=true where id='${category}'`,
  );
  // Concurrent creates see the newly committed slug before choosing a suffix.
  a = session("create-first");
  b = session("create-second");
  a.send(save(2, "Concurrent Drink") + "\n\\echo CREATED");
  await until(() => a.output().includes("CREATED"), "create did not finish");
  b.send(save(3, "Concurrent Drink"));
  await blocked("create-second");
  a.send("commit;\n\\q");
  b.send("commit;\n\\q");
  assert.equal((await a.done).code, 0);
  assert.equal((await b.done).code, 0);
  assert.equal(
    await query(
      `select string_agg(slug,',' order by recipe_number) from public.bar_recipes where organization_id='${org}' and recipe_number in (2,3)`,
    ),
    "concurrent-drink,concurrent-drink-2",
  );
  console.log("PASS concurrent create: distinct collision-suffixed slugs");
  a = session("number-first");
  b = session("number-second");
  a.send(save(4, "Number Winner") + "\n\\echo NUMBERED");
  await until(
    () => a.output().includes("NUMBERED"),
    "number create did not finish",
  );
  b.send("\\set VERBOSITY verbose\n" + save(4, "Number Loser"));
  await blocked("number-second");
  a.send("commit;\n\\q");
  b.send("commit;\n\\q");
  assert.equal((await a.done).code, 0);
  const duplicate = await b.done;
  assert.match(duplicate.output, /23505/);
  const detail = JSON.parse(
    duplicate.output.match(/DETAIL:\s*(\{[^\n]+\})/)[1],
  );
  assert.equal(detail.existing_label, "4 Number Winner");
  assert.equal(
    detail.existing_id,
    await query(
      `select id from public.bar_recipes where organization_id='${org}' and recipe_number=4`,
    ),
  );
  console.log(
    "PASS concurrent duplicate: UNIQUE violation includes committed winner id and label",
  );
  // Same expected version: precisely one save commits, second raises PT409.
  const existing = `'${await query(`select id from public.bar_recipes where organization_id='${org}' and recipe_number=2`)}'`;
  a = session("save-first");
  b = session("save-second");
  a.send(save(2, "First", existing, "1") + "\n\\echo SAVED");
  await until(() => a.output().includes("SAVED"), "save did not finish");
  b.send("\\set VERBOSITY verbose\n" + save(2, "Second", existing, "1"));
  await blocked("save-second");
  a.send("commit;\n\\q");
  b.send("commit;\n\\q");
  assert.equal((await a.done).code, 0);
  assert.match((await b.done).output, /PT409/);
  assert.equal(
    await query(
      `select name || ':' || version from public.bar_recipes where id=${existing}`,
    ),
    "First:2",
  );
  console.log(
    "PASS concurrent save: exactly one winner, stale PT409 for second",
  );
} finally {
  for (const s of sessions) {
    if (s.child.exitCode === null) s.send("rollback;\n\\q");
  }
  await Promise.all(sessions.map((s) => s.done));
  await query(
    `delete from public.organizations where id='${org}' and slug='pgtap-r2-${org}'; delete from public.profiles where id='${actor}'; delete from auth.users where id='${actor}';`,
  );
  assert.equal(
    await query(
      `select count(*) from public.bar_recipes where organization_id='${org}'`,
    ),
    "0",
  );
  console.log("PASS concurrency fixture cleanup");
}
