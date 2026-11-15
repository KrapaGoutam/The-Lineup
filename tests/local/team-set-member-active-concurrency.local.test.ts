import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runFile = promisify(execFile);
const container = "supabase_db_restaurant-roster";
const org = "00000000-0000-4000-8000-000000084101";
const ownerA = "00000000-0000-4000-8000-000000084001";
const ownerB = "00000000-0000-4000-8000-000000084002";
const target = "00000000-0000-4000-8000-000000084003";

async function sql(statement: string) {
  try {
    const result = await runFile(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=verbose",
        "-At",
        "-c",
        statement,
      ],
      { maxBuffer: 1024 * 1024, timeout: 15_000 },
    );
    return { ok: true, output: result.stdout + result.stderr };
  } catch (error) {
    const result = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  }
}

function transition(
  actor: string,
  member: string,
  active: boolean,
  hold = false,
) {
  return sql(`begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${actor}', true);
    select set_config('request.jwt.claims', jsonb_build_object('sub','${actor}','role','authenticated','session_id','${actor}')::text, true);
    select public.team_set_member_active('${org}', '${member}', ${active}, 'Concurrent F-5 test');
    ${hold ? "select pg_sleep(1.5);" : ""}
    commit;`);
}

async function stagger() {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

describe("F-5 concurrency with two real local Postgres connections", () => {
  beforeAll(async () => {
    const identity = await sql(
      "select current_database(),count(*) from pg_foreign_server",
    );
    if (!identity.ok || !identity.output.includes("postgres|0")) {
      throw Error("Disposable local Postgres identity was not verified");
    }
    const setup = await sql(`
      insert into auth.users(id,email) values
      ('${ownerA}','f5-concurrency-a@test.invalid'),
      ('${ownerB}','f5-concurrency-b@test.invalid'),
      ('${target}','f5-concurrency-target@test.invalid');
      insert into auth.sessions(id,user_id,created_at,updated_at)
      select id,id,now(),now() from auth.users where id in ('${ownerA}','${ownerB}','${target}');
      insert into public.profiles(id,display_name)
      select id,split_part(email,'@',1) from auth.users where id in ('${ownerA}','${ownerB}','${target}');
      insert into public.organizations(id,name,slug,created_by)
      values ('${org}','F5 concurrency','f5-concurrency','${ownerA}');
      insert into public.memberships(organization_id,profile_id,roles) values
      ('${org}','${ownerA}',array['owner']::public.app_role[]),
      ('${org}','${ownerB}',array['owner']::public.app_role[]),
      ('${org}','${target}',array['server']::public.app_role[]);
      insert into public.passcode_credentials(organization_id,profile_id,locator,synthetic_email)
      values ('${org}','${target}',repeat('b',64),'f5-concurrency-credential@test.invalid');
    `);
    if (!setup.ok) throw Error(setup.output);
  }, 30_000);

  afterAll(async () => {
    const cleaned =
      await sql(`delete from public.organizations where id='${org}';
      delete from auth.users where id in ('${ownerA}','${ownerB}','${target}');
      select count(*) from auth.users where id in ('${ownerA}','${ownerB}','${target}');`);
    if (!cleaned.ok || !cleaned.output.endsWith("0\n"))
      throw Error(`F-5 concurrency cleanup failed: ${cleaned.output}`);
  }, 30_000);

  it("serializes opposing owner deactivations and leaves one active owner", async () => {
    const first = transition(ownerA, ownerB, false, true);
    await stagger();
    const second = transition(ownerB, ownerA, false);
    const results = await Promise.all([first, second]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.output).toContain("42501");
    const state = await sql(
      `select count(*) from public.memberships where organization_id='${org}' and active and 'owner'=any(roles)`,
    );
    expect(state.output.trim()).toBe("1");
  }, 15_000);

  it("serializes deactivate then reactivate on the same member", async () => {
    const first = transition(ownerA, target, false, true);
    await stagger();
    const second = transition(ownerA, target, true);
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.ok)).toBe(true);
    const state = await sql(`select m.active,c.active,
      (select count(*) from public.audit_events where organization_id='${org}' and entity_id='${target}')
      from public.memberships m join public.passcode_credentials c
      on c.organization_id=m.organization_id and c.profile_id=m.profile_id
      where m.organization_id='${org}' and m.profile_id='${target}'`);
    expect(state.output.trim()).toBe("t|t|2");
  }, 15_000);

  it("serializes credential rotation during reactivation without losing active", async () => {
    const inactive = await transition(ownerA, target, false);
    expect(inactive.ok).toBe(true);
    const first = transition(ownerA, target, true, true);
    await stagger();
    const second =
      sql(`begin; update public.passcode_credentials set locator=repeat('c',64)
      where organization_id='${org}' and profile_id='${target}'; commit;`);
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.ok)).toBe(true);
    const state =
      await sql(`select active,locator=repeat('c',64) from public.passcode_credentials
      where organization_id='${org}' and profile_id='${target}'`);
    expect(state.output.trim()).toBe("t|t");
  }, 15_000);
});
