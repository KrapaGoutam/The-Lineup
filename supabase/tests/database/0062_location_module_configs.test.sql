begin;

create extension if not exists pgtap with schema extensions;

select plan(92);

-- --------------------------------------------------------------------------
-- V2-004.001 Per-Location Module Configuration Contract (0062 namespace)
--
-- Actors
--   ...620000 Overall Owner            ...620001 Overall Manager
--   ...620002 Overall Assistant Mgr    ...620003 Monks Owner
--   ...620004 Monks GM                 ...620005 Liquor Tap Owner
--   ...620006 Liquor Tap GM            ...620007 NASA location manager (org: server)
--   ...620008 Liquor Tap server, assigned to NASA only (staff)
--   ...620009 Liquor Tap GM, membership REVOKED (inactive)
--   ...620010 Liquor Tap shift_manager, assigned nowhere
--   ...620011 Monks server assigned to Webster (staff)
-- Organizations: Monks (Webster) and Liquor Tap (NASA, League City, Archive Me)
-- --------------------------------------------------------------------------

-- MC-013 / MC-014 (first): the migration itself inserts nothing.
select is(
  (select count(*)::int from public.location_module_configs),
  0,
  'MC-013a: migration inserted no configuration rows (nothing guessed or backfilled)'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000620' || lpad(n::text, 2, '0'))::uuid, 'u62' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(0, 11) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000620' || lpad(n::text, 2, '0'))::uuid, 'User 62' || n
from generate_series(0, 11) n;

insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000062000'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000062001'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000062002'::uuid, 'assistant_manager'::public.overall_role);

insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000620a1'::uuid, 'Monks 62', 'monks-62', '00000000-0000-0000-0000-000000062003'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, 'Liquor Tap 62', 'liquor-tap-62', '00000000-0000-0000-0000-000000062005'::uuid, '{}'::jsonb);

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000620a1'::uuid, '00000000-0000-0000-0000-000000062003'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a1'::uuid, '00000000-0000-0000-0000-000000062004'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a1'::uuid, '00000000-0000-0000-0000-000000062011'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062005'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062006'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062007'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062008'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062009'::uuid, array['general_manager']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000620a2'::uuid, '00000000-0000-0000-0000-000000062010'::uuid, array['shift_manager']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address)
values
  ('00000000-0000-0000-0000-0000000620b1'::uuid, '00000000-0000-0000-0000-0000000620a1'::uuid, 'Webster', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000620b2'::uuid, '00000000-0000-0000-0000-0000000620a2'::uuid, 'NASA', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000620b3'::uuid, '00000000-0000-0000-0000-0000000620a2'::uuid, 'League City', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000620b4'::uuid, '00000000-0000-0000-0000-0000000620a2'::uuid, 'Archive Me', 'America/Chicago', '{}'::jsonb);

insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000620b1'::uuid, '00000000-0000-0000-0000-000000062011'::uuid, 'staff'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000620b2'::uuid, '00000000-0000-0000-0000-000000062007'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000620b2'::uuid, '00000000-0000-0000-0000-000000062008'::uuid, 'staff'::public.location_role, true);

-- Rows an UPDATE statement actually affected (RLS silently filters, it does not raise)
create function pg_temp.affected(p_sql text) returns int
language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$f$;
grant execute on function pg_temp.affected(text) to authenticated;

-- Snapshots of every authority table (MC-008: configuration never changes them)
create temp table snap_authority as
select
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from public.memberships m) as memberships,
  (select md5(coalesce(string_agg(l::text, '|' order by l.id), '')) from public.location_memberships l) as location_memberships,
  (select md5(coalesce(string_agg(o::text, '|' order by o.profile_id), '')) from public.overall_roles o) as overall_roles;
grant select on snap_authority to authenticated;

-- --------------------------------------------------------------------------
-- MC-001: schema applies and has the intended structure
-- --------------------------------------------------------------------------
select has_table('public', 'location_module_configs', 'MC-001a: table exists');
select enum_has_labels(
  'public', 'location_module_key',
  array['table_allocation','tasks','schedule','tips','team','attendance','payroll','bar_inventory','recipes'],
  'MC-001b: canonical module keys, in registry order (settings is system-required and absent)'
);
select col_is_pk('public', 'location_module_configs', array['location_id', 'module_key'],
  'MC-001c: natural primary key (location_id, module_key)');
select hasnt_column('public', 'location_module_configs', 'organization_id',
  'MC-001d: organization is derived from the owning location, never duplicated (cannot drift)');
select col_hasnt_default('public', 'location_module_configs', 'is_enabled',
  'MC-001e: is_enabled has no default (every row is an explicit decision)');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.location_module_configs'::regclass),
  'MC-001f: row level security is enabled'
);
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.location_module_configs'::regclass and contype = 'f'
     and confrelid = 'public.locations'::regclass),
  'r',
  'MC-001g: FK to locations is ON DELETE RESTRICT'
);
select policies_are(
  'public', 'location_module_configs',
  array['location_module_configs_select', 'location_module_configs_insert_manager', 'location_module_configs_update_manager'],
  'MC-001h: exactly select/insert/update policies; no delete policy'
);
select table_privs_are('public', 'location_module_configs', 'anon', array[]::text[],
  'MC-001i: anon holds no privilege');
select table_privs_are('public', 'location_module_configs', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'MC-001j: authenticated holds select/insert/update only (no delete, no truncate)');

-- --------------------------------------------------------------------------
-- MC-002 / MC-007: authorized management; independent per-location config
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);

select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'bar_inventory', true),
            ('00000000-0000-0000-0000-0000000620b2'::uuid, 'tasks', true),
            ('00000000-0000-0000-0000-0000000620b3'::uuid, 'tasks', false) $$,
  'MC-002a/MC-007a: Org Owner configures modules at two locations of the same organization'
);
select lives_ok(
  $$ update public.location_module_configs set is_enabled = false, metadata = '{"note":"Seasonal"}'
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'tasks' $$,
  'MC-007b: Org Owner updates an enabled flag and informational note'
);
reset role;

select is(
  (select is_enabled::text from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory')
  || '/' ||
  (select count(*)::text from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b3'::uuid and module_key = 'bar_inventory'),
  'true/0',
  'MC-002b: same organization, different locations: NASA enabled bar_inventory, League City has no row (independent; absence is not enabled)'
);
select is(
  (select is_enabled::text from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'tasks')
  || '/' ||
  (select is_enabled::text from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b3'::uuid and module_key = 'tasks'),
  'false/false',
  'MC-002c: update of one location does not touch another location''s row for the same module'
);
select is(
  (select updated_by from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'tasks'),
  '00000000-0000-0000-0000-000000062005'::uuid,
  'MC-007c: updated_by is the authenticated caller'
);
select ok(
  (select updated_at >= created_at from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'tasks'),
  'MC-007d: updated_at is stamped on update and never precedes created_at'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062006', true);
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'payroll', true) $$,
  'MC-007e: Org General Manager may manage module configuration of the organization'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062001', true);
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b1'::uuid, 'recipes', true), ('00000000-0000-0000-0000-0000000620b2'::uuid, 'team', true) $$,
  'MC-007f: Overall Manager may manage configuration in any organization'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062000', true);
select lives_ok(
  $$ update public.location_module_configs set is_enabled = false where location_id = '00000000-0000-0000-0000-0000000620b1'::uuid and module_key = 'recipes' $$,
  'MC-007g: Overall Owner may manage configuration in any organization'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062003', true);
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b1'::uuid, 'tasks', true) $$,
  'MC-002d: another organization configures the same module independently'
);
reset role;

-- --------------------------------------------------------------------------
-- MC-003: duplicate location/module pair
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'bar_inventory', false) $$,
  '23505', null,
  'MC-003: duplicate (location, module) is rejected'
);

-- --------------------------------------------------------------------------
-- MC-004: unknown / forged / system-required module keys
-- --------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'not_a_module', true) $$,
  '22P02', null,
  'MC-004a: unknown module key is rejected'
);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'settings', false) $$,
  '22P02', null,
  'MC-004b: system-required Settings cannot be stored, so it can never be disabled'
);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'barInventory', true) $$,
  '22P02', null,
  'MC-004c: client AppTab spelling is not a database identifier'
);

-- --------------------------------------------------------------------------
-- MC-005: invalid metadata payloads
-- --------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '["a"]') $$,
  '23514', null, 'MC-005a: non-object metadata is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"roles":["owner"]}') $$,
  '23514', null, 'MC-005b: role/permission data cannot be stored in metadata (unknown key)');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"token":"x"}') $$,
  '23514', null, 'MC-005c: credential-like data cannot be stored in metadata');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, jsonb_build_object('note', repeat('x', 281))) $$,
  '23514', null, 'MC-005d: note longer than 280 characters is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"note":"   "}') $$,
  '23514', null, 'MC-005e: blank note is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"note":42}') $$,
  '23514', null, 'MC-005f: non-string note is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"settings":{"x":1}}') $$,
  '23514', null, 'MC-005g: settings are reserved and must be empty in this phase');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, '{"schemaVersion":2}') $$,
  '23514', null, 'MC-005h: unknown schemaVersion is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, jsonb_build_object('note', 'ok', 'settings', '{}'::jsonb, 'schemaVersion', 1) || jsonb_build_object('pad', repeat('y', 2100))) $$,
  '23514', null, 'MC-005i: oversized payload is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', true, null) $$,
  '23502', null, 'MC-005j: null metadata is rejected');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule') $$,
  '23502', null, 'MC-005k: is_enabled must be stated explicitly (no implicit enable)');
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, metadata)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'schedule', false, '{"schemaVersion":1,"note":"Not used here","settings":{}}') $$,
  'MC-005l: a valid envelope is accepted');
reset role;

-- --------------------------------------------------------------------------
-- MC-006: anonymous callers
-- --------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-006a: anonymous insert is denied');
select throws_ok(
  $$ update public.location_module_configs set is_enabled = true $$,
  '42501', null, 'MC-006b: anonymous update is denied');
select throws_ok(
  $$ select count(*) from public.location_module_configs $$,
  '42501', null, 'MC-006c: anonymous read is denied');
select throws_ok(
  $$ delete from public.location_module_configs $$,
  '42501', null, 'MC-006d: anonymous delete is denied');
reset role;

-- --------------------------------------------------------------------------
-- MC-008: staff / location managers / other tiers cannot write
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062008', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-008a: assigned staff cannot insert configuration at their own location');
select is(
  pg_temp.affected($q$update public.location_module_configs set is_enabled = true where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'tasks'$q$),
  0, 'MC-008b: assigned staff cannot update configuration (no row is affected)');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062007', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-008c: a LOCATION manager (not org owner/GM) cannot write configuration');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062010', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-008d: an organization shift manager cannot write configuration');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062002', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-008e: Overall Assistant Manager cannot write configuration');
reset role;

-- --------------------------------------------------------------------------
-- MC-009: cross-organization isolation and forged location identifiers
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062003', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-009a: Monks owner cannot insert into a Liquor Tap location');
select is(
  pg_temp.affected($q$update public.location_module_configs set is_enabled = false where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid$q$),
  0, 'MC-009b: Monks owner cannot modify Liquor Tap configuration');
select is(
  (select count(*)::int from public.location_module_configs where location_id <> '00000000-0000-0000-0000-0000000620b1'::uuid),
  0, 'MC-009c: Monks owner cannot even see Liquor Tap configuration');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620ff'::uuid, 'tasks', true) $$,
  '42501', null, 'MC-009d: a forged (non-existent) location id grants nothing');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select is(
  pg_temp.affected($q$update public.location_module_configs set is_enabled = false where location_id = '00000000-0000-0000-0000-0000000620b1'::uuid$q$),
  0, 'MC-009e: Liquor Tap owner cannot modify Monks configuration');
select is(
  (select count(*)::int from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b1'::uuid),
  0, 'MC-009f: Liquor Tap owner cannot see Monks configuration');
reset role;

-- --------------------------------------------------------------------------
-- Read policy matrix
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062008', true);
select is(
  (select string_agg(distinct location_id::text, ',') from public.location_module_configs),
  '00000000-0000-0000-0000-0000000620b2',
  'RD-1: staff assigned to NASA read NASA configuration only (not League City, not Monks)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062007', true);
select ok(
  (select count(*) from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid) > 0,
  'RD-2: a location manager reads their location''s configuration');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062011', true);
select is(
  (select string_agg(distinct location_id::text, ',') from public.location_module_configs),
  '00000000-0000-0000-0000-0000000620b1',
  'RD-3: Monks staff read Webster configuration only');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062010', true);
select is(
  (select count(*)::int from public.location_module_configs),
  0, 'RD-4: an organization member assigned to no location reads nothing');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062006', true);
select is(
  (select count(distinct location_id)::int from public.location_module_configs),
  2, 'RD-5: Org GM reads every location of its organization (NASA, League City) and no other organization');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062002', true);
select is(
  (select count(distinct location_id)::int from public.location_module_configs),
  3, 'RD-6: any Overall role reads every organization (Webster, NASA, League City)');
reset role;

-- --------------------------------------------------------------------------
-- MC-008 (cont.): configuration writes never alter any authority table
-- --------------------------------------------------------------------------
select is(
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from public.memberships m),
  (select memberships from snap_authority),
  'MC-008f: memberships are byte-identical after every configuration write above (no role elevation)'
);
select is(
  (select md5(coalesce(string_agg(l::text, '|' order by l.id), '')) from public.location_memberships l),
  (select location_memberships from snap_authority),
  'MC-008g: location assignments are unchanged (no automatic location assignment)'
);
select is(
  (select md5(coalesce(string_agg(o::text, '|' order by o.profile_id), '')) from public.overall_roles o),
  (select overall_roles from snap_authority),
  'MC-008h: overall roles are unchanged'
);

-- --------------------------------------------------------------------------
-- MC-010: revoked / inactive membership loses access (live, same transaction)
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062009', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-010a: a GM whose membership is inactive cannot write');
select is(
  (select count(*)::int from public.location_module_configs),
  0, 'MC-010b: ...and cannot read');
reset role;

update public.memberships set active = false
where organization_id = '00000000-0000-0000-0000-0000000620a2'::uuid and profile_id = '00000000-0000-0000-0000-000000062006'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062006', true);
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b2'::uuid, 'attendance', true) $$,
  '42501', null, 'MC-010c: authority is lost the moment the membership is deactivated');
reset role;

update public.location_memberships set active = false
where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and profile_id = '00000000-0000-0000-0000-000000062008'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062008', true);
select is(
  (select count(*)::int from public.location_module_configs),
  0, 'MC-010d: revoking the location assignment removes read access');
reset role;
update public.location_memberships set active = true
where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and profile_id = '00000000-0000-0000-0000-000000062008'::uuid;

update public.memberships set active = false
where organization_id = '00000000-0000-0000-0000-0000000620a2'::uuid and profile_id = '00000000-0000-0000-0000-000000062008'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062008', true);
select is(
  (select count(*)::int from public.location_module_configs),
  0, 'MC-010e: an active assignment without an active organization membership reads nothing');
reset role;

-- --------------------------------------------------------------------------
-- MC-011: ownership is immutable; audit columns cannot be forged
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select throws_ok(
  $$ update public.location_module_configs set location_id = '00000000-0000-0000-0000-0000000620b3'::uuid
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '22023', null, 'MC-011a: configuration cannot be reassigned to another location of the same organization');
select throws_ok(
  $$ update public.location_module_configs set location_id = '00000000-0000-0000-0000-0000000620b1'::uuid
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '22023', null, 'MC-011b: configuration cannot be reassigned to another organization''s location');
select throws_ok(
  $$ update public.location_module_configs set module_key = 'recipes'
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '22023', null, 'MC-011c: module key is immutable');
select throws_ok(
  $$ update public.location_module_configs set created_at = '2000-01-01'
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '22023', null, 'MC-011d: created_at is immutable');
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled, created_at, updated_at, updated_by)
     values ('00000000-0000-0000-0000-0000000620b3'::uuid, 'recipes', true, '2000-01-01', '2000-01-01', '00000000-0000-0000-0000-000000062000'::uuid) $$,
  'MC-011e: client-supplied audit columns are accepted but overwritten');
reset role;
select is(
  (select updated_by::text || '/' || (created_at > now() - interval '1 minute')::text
   from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b3'::uuid and module_key = 'recipes'),
  '00000000-0000-0000-0000-000000062005/true',
  'MC-011f: updated_by and timestamps are server-stamped, not forgeable');
select throws_ok(
  $$ update public.location_module_configs set location_id = '00000000-0000-0000-0000-0000000620b3'::uuid
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '22023', null, 'MC-011g: immutability also binds privileged sessions');

-- --------------------------------------------------------------------------
-- MC-012: foreign keys and lifecycle
-- --------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620ff'::uuid, 'tasks', true) $$,
  '23503', null, 'MC-012a: a configuration for a non-existent location violates the FK');
select throws_ok(
  $$ delete from public.locations where id = '00000000-0000-0000-0000-0000000620b2'::uuid $$,
  '23503', null, 'MC-012b: a location that owns configuration cannot be hard-deleted');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select throws_ok(
  $$ delete from public.location_module_configs
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '42501', null,
  'MC-012c: no DELETE privilege exists for a client role');
reset role;

grant delete on table public.location_module_configs to authenticated;
create policy tmp_delete_all on public.location_module_configs for delete to authenticated using (true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select throws_ok(
  $$ delete from public.location_module_configs
     where location_id = '00000000-0000-0000-0000-0000000620b2'::uuid and module_key = 'bar_inventory' $$,
  '42501', 'Module configuration cannot be deleted; set is_enabled = false instead',
  'MC-012d: even if a privilege AND a permissive policy were ever added, the trigger still rejects client-role deletes (third layer)');
reset role;
drop policy tmp_delete_all on public.location_module_configs;
revoke delete on table public.location_module_configs from authenticated;

insert into public.location_module_configs (location_id, module_key, is_enabled)
values ('00000000-0000-0000-0000-0000000620b4'::uuid, 'recipes', true);
select lives_ok(
  $$ delete from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b4'::uuid and module_key = 'recipes' $$,
  'MC-012e: a privileged maintenance session can still remove a row (break-glass / teardown)'
);

-- Lifecycle: ACTIVE -> INACTIVE -> ARCHIVED -> INACTIVE for "Archive Me"
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000062005', true);
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b4'::uuid, 'tasks', true) $$,
  'MC-012f: configuration can be written at an ACTIVE location');
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000620b4'::uuid, 'deactivate', 'Closing for the season', 'active') $$,
  'MC-012g: (setup) deactivate the location');
select lives_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b4'::uuid, 'schedule', false) $$,
  'MC-012h: configuration can still be prepared at an INACTIVE location (not operational activity)');
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000620b4'::uuid, 'archive', 'Permanently closed', 'inactive') $$,
  'MC-012i: (setup) archive the location');
select throws_ok(
  $$ insert into public.location_module_configs (location_id, module_key, is_enabled)
     values ('00000000-0000-0000-0000-0000000620b4'::uuid, 'payroll', true) $$,
  '55000', null, 'MC-012j: no new configuration at an ARCHIVED location');
select throws_ok(
  $$ update public.location_module_configs set is_enabled = false
     where location_id = '00000000-0000-0000-0000-0000000620b4'::uuid and module_key = 'tasks' $$,
  '55000', null, 'MC-012k: configuration of an ARCHIVED location is frozen');
select is(
  (select count(*)::int from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000620b4'::uuid),
  2, 'MC-012l: ...but historical configuration stays readable and is retained');
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000620b4'::uuid, 'restore_archive', 'Reopening', 'archived') $$,
  'MC-012m: (setup) restore from the archive');
select lives_ok(
  $$ update public.location_module_configs set is_enabled = false
     where location_id = '00000000-0000-0000-0000-0000000620b4'::uuid and module_key = 'tasks' $$,
  'MC-012n: configuration is editable again once the location is restored');
reset role;

-- --------------------------------------------------------------------------
-- MC-013 / MC-014: the migration touches nothing operational
-- --------------------------------------------------------------------------
select is(
  (select count(*)::int
   from pg_policy p
   join pg_class c on c.oid = p.polrelid
   where c.oid <> 'public.location_module_configs'::regclass
     and (pg_get_expr(p.polqual, p.polrelid) ilike '%location_module_config%'
          or pg_get_expr(p.polwithcheck, p.polrelid) ilike '%location_module_config%')),
  0, 'MC-014a: no policy on any other table consults module configuration (behaviour unchanged)');
select is(
  (select count(*)::int
   from pg_trigger t
   join pg_proc f on f.oid = t.tgfoid
   where not t.tgisinternal
     and t.tgrelid <> 'public.location_module_configs'::regclass
     and f.proname like 'location\_module\_config%'),
  0, 'MC-014b: no trigger on any other table invokes module-configuration functions');
select is(
  (select count(*)::int
   from pg_proc f
   join pg_namespace n on n.oid = f.pronamespace
   where n.nspname in ('public', 'private')
     and f.prokind = 'f'
     and f.proname not like '%location\_module\_config%'
     and f.proname not like 'can\_%\_location\_module\_configs'
     -- V2-004.004 adds exactly these two readers (covered by 0063); every
     -- pre-existing function must still be oblivious to module configuration.
     and f.proname not in ('location_module_allows', 'module_enforcement_readiness')
     and f.prosrc ilike '%location_module_config%'),
  0, 'MC-014c: no pre-existing function (provision_location, guards, resolvers) reads module configuration');
select is(
  (select count(*)::int from pg_constraint
   where confrelid = 'public.location_module_configs'::regclass),
  0, 'MC-013b: no existing table references the new table (no operational coupling)');
select is(
  (select count(*)::int from pg_depend d
   join pg_class c on c.oid = d.objid
   where d.refobjid = 'public.location_module_key'::regtype and c.relkind = 'r'
     and c.oid <> 'public.location_module_configs'::regclass),
  0, 'MC-013c: the module-key enum is used by no other table');

select * from finish();
rollback;
