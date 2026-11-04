begin;

create extension if not exists pgtap with schema extensions;

select plan(96);

-- --------------------------------------------------------------------------
-- V2-002.005 Location Lifecycle Integrity (0059 namespace)
--
-- Actors
--   ...59000 Overall Owner            ...59001 Overall Manager
--   ...59002 Overall Assistant Mgr    ...59003 Monks Owner
--   ...59004 Monks GM                 ...59005 Liquor Tap Owner
--   ...59006 Liquor Tap GM            ...59007 NASA location manager (org: server)
--   ...59008 Liquor Tap server        ...59009 Revoked creator of Liquor Tap
-- Organizations: Monks (Webster) and Liquor Tap (NASA, League City, Downtown)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-00000005900' || n)::uuid, 'u59' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(0, 9) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-00000005900' || n)::uuid, 'User 59' || n
from generate_series(0, 9) n;

insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000059000'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000059001'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000059002'::uuid, 'assistant_manager'::public.overall_role);

insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000590a1'::uuid, 'Monks 59', 'monks-59', '00000000-0000-0000-0000-000000059003'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, 'Liquor Tap 59', 'liquor-tap-59', '00000000-0000-0000-0000-000000059009'::uuid, '{}'::jsonb);

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000590a1'::uuid, '00000000-0000-0000-0000-000000059003'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a1'::uuid, '00000000-0000-0000-0000-000000059004'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-000000059005'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-000000059006'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-000000059007'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-000000059008'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-000000059009'::uuid, array['owner']::public.app_role[], false);

insert into public.locations (id, organization_id, name, time_zone, address)
values
  ('00000000-0000-0000-0000-0000000590b1'::uuid, '00000000-0000-0000-0000-0000000590a1'::uuid, 'Webster', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000590b2'::uuid, '00000000-0000-0000-0000-0000000590a2'::uuid, 'NASA', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000590b3'::uuid, '00000000-0000-0000-0000-0000000590a2'::uuid, 'League City', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000590b4'::uuid, '00000000-0000-0000-0000-0000000590a2'::uuid, 'Downtown', 'America/Chicago', '{}'::jsonb);

insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000590b2'::uuid, '00000000-0000-0000-0000-000000059007'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000590b2'::uuid, '00000000-0000-0000-0000-000000059008'::uuid, 'staff'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000590b3'::uuid, '00000000-0000-0000-0000-000000059008'::uuid, 'staff'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000590b4'::uuid, '00000000-0000-0000-0000-000000059008'::uuid, 'staff'::public.location_role, true);

-- Operational fixtures. Downtown: a PLANNED session (warning on deactivate,
-- hard on archive). NASA: an ACTIVE session (hard) + a draft tip pool.
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values
  (590001, '00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b4'::uuid, current_date, 'dinner', 'planned'),
  (590002, '00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b2'::uuid, current_date, 'dinner', 'active');

insert into public.tip_pools (id, organization_id, location_id, service_date, status)
overriding system value
values (590001, '00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b2'::uuid, current_date, 'draft');

-- Snapshots used by later "unchanged" assertions
create temp table snap_b3 as
  select active, archived_at, updated_at, name from public.locations
  where id = '00000000-0000-0000-0000-0000000590b3'::uuid;
grant select on snap_b3 to authenticated;

-- --------------------------------------------------------------------------
-- Structure / compatibility (DB-025)
-- --------------------------------------------------------------------------
select has_column('public', 'locations', 'archived_at', 'DB-025a: locations.archived_at lifecycle column exists');
select has_column('public', 'locations', 'active', 'DB-025b: legacy locations.active column preserved');
select throws_ok(
  $$ update public.locations set archived_at = now() where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '23514', null,
  'DB-025c: active=true with archived_at set is rejected (no contradictory state)'
);
select is(
  (select count(*)::int from public.locations where active and organization_id = '00000000-0000-0000-0000-0000000590a2'::uuid),
  3,
  'DB-025d: legacy active-only readers still see every active location'
);
select ok(
  not exists (
    select 1 from pg_proc p, unnest(coalesce(p.proargnames, '{}')) a
    where p.proname = 'transition_location_lifecycle' and a ilike '%actor%'
  ),
  'DB-007a: transition RPC has no actor parameter (identity is server-derived)'
);

-- --------------------------------------------------------------------------
-- DB-001 / DB-013 / DB-007 / DB-020: valid deactivation by an Org Owner
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);

select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'deactivate', 'Closing for renovation', 'active') $$,
  'DB-001a: Org Owner deactivates an active location (planned session is only a warning)'
);
reset role;

select is(
  (select active::text || '/' || coalesce(archived_at::text, 'null') from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'false/null',
  'DB-001b: location is INACTIVE (active=false, archived_at null)'
);
select is(
  (select count(*)::int from public.location_lifecycle_events
   where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid
     and action = 'deactivate' and previous_state = 'active' and new_state = 'inactive'
     and reason = 'Closing for renovation'
     and organization_id = '00000000-0000-0000-0000-0000000590a2'::uuid),
  1,
  'DB-013: exactly one audit event generated with state, reason and organization'
);
select is(
  (select actor_profile_id from public.location_lifecycle_events where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  '00000000-0000-0000-0000-000000059005'::uuid,
  'DB-007b: audit actor is the authenticated caller (auth.uid())'
);
select ok(
  (select blockers_snapshot @> '[{"code":"PLANNED_SERVICE_SESSIONS","deactivate":"warning"}]'::jsonb
   from public.location_lifecycle_events where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'DB-013b: audit snapshot records the acknowledged warning'
);
select is(
  (select count(*)::int from public.location_memberships
   where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid and active),
  1,
  'DB-020a: deactivation did not alter staff assignments at the location'
);
select is(
  (select count(*)::int from public.location_memberships where active),
  4,
  'DB-020b: no staff membership anywhere was mutated by the transition'
);

-- --------------------------------------------------------------------------
-- DB-021 / DB-023: inactive location refuses new operational work
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ select * from public.apply_location_assignment_changes('00000000-0000-0000-0000-000000059008'::uuid,
       '[{"locationId":"00000000-0000-0000-0000-0000000590b4","action":"assign","role":"staff"}]'::jsonb) $$,
  '22023', null,
  'DB-021a: assignment RPC rejects a new assignment at an INACTIVE location'
);
reset role;
select throws_ok(
  $$ insert into public.location_memberships (location_id, profile_id, role, active)
     values ('00000000-0000-0000-0000-0000000590b4'::uuid, '00000000-0000-0000-0000-000000059007'::uuid, 'staff', true) $$,
  '55000', null,
  'DB-021b: direct insert of an active assignment at an INACTIVE location is rejected'
);
select throws_ok(
  $$ insert into public.service_sessions (organization_id, location_id, service_date, meal_period, status)
     values ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b4'::uuid, current_date, 'lunch', 'planned') $$,
  '55000', null,
  'DB-023a: new service session at an INACTIVE location is rejected'
);
select throws_ok(
  $$ update public.service_sessions set status = 'active' where id = 590001 $$,
  '55000', null,
  'DB-023b: activating a planned session at an INACTIVE location is rejected'
);
select throws_ok(
  $$ insert into public.schedule_periods (organization_id, location_id, starts_on, ends_on)
     values ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b4'::uuid, current_date, current_date + 6) $$,
  '55000', null,
  'DB-023c: new schedule period at an INACTIVE location is rejected'
);
select throws_ok(
  $$ insert into public.tip_pools (organization_id, location_id, service_date)
     values ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b4'::uuid, current_date) $$,
  '55000', null,
  'DB-023d: new tip pool at an INACTIVE location is rejected'
);
select throws_ok(
  $$ insert into public.tasks (organization_id, location_id, title, created_by)
     values ('00000000-0000-0000-0000-0000000590a2'::uuid, '00000000-0000-0000-0000-0000000590b4'::uuid, 'New task',
             '00000000-0000-0000-0000-000000059006'::uuid) $$,
  '55000', null,
  'DB-023e: new task at an INACTIVE location is rejected'
);
select is(
  (select count(*)::int from pg_trigger
   where tgname like '%\_location\_lifecycle\_guard' and not tgisinternal),
  13,
  'DB-023f: insert guard installed on 12 operational tables + location_memberships'
);
-- Historical corrections stay possible: closing the planned session is allowed.
select lives_ok(
  $$ update public.service_sessions set status = 'closed', closed_at = now() where id = 590001 $$,
  'DB-023g: closing an existing session at an INACTIVE location is still allowed'
);

-- --------------------------------------------------------------------------
-- DB-002 / DB-011: reactivation by Org GM, then Overall Manager
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059006', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'reactivate', 'Renovation finished', 'inactive') $$,
  'DB-002a: Org General Manager reactivates an INACTIVE location'
);
reset role;
select is(
  (select active::text || '/' || coalesce(archived_at::text, 'null') from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'true/null',
  'DB-002b: location is ACTIVE again'
);
select is(
  (select count(*)::int from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid and active),
  1,
  'DB-002c: reactivation did not silently restore or create any assignment'
);

-- Deactivate again (Overall Manager, not a member of Liquor Tap -> DB-011)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059001', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'deactivate', 'Overall manager decision', 'active') $$,
  'DB-011a: Overall Manager (no org membership) may deactivate'
);
reset role;

-- --------------------------------------------------------------------------
-- DB-003 / DB-018: archive is blocked by the open planned session? No -- it was
-- closed above -- so archive now succeeds, with the history untouched.
-- --------------------------------------------------------------------------
select is(
  (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid and status = 'closed'),
  1,
  'DB-018a: closed session history present before archive'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'archive', 'Permanently closed branch', 'inactive') $$,
  'DB-003a: Overall Owner archives an INACTIVE location (DB-011b)'
);
reset role;
select is(
  (select active::text || '/' || (archived_at is not null)::text from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'false/true',
  'DB-003b: location is ARCHIVED (active=false, archived_at set)'
);
select ok(
  exists (select 1 from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid)
  and (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid and status = 'closed') = 1
  and (select count(*)::int from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid) = 1,
  'DB-018b: archive preserved the location UUID, session history and assignments'
);

-- DB-005 / DB-004 / DB-022
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'reactivate', 'Try to reopen', null) $$,
  'LC002', null,
  'DB-005a: ARCHIVED location cannot be reactivated directly'
);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'deactivate', 'Nothing to deactivate', null) $$,
  'LC002', null,
  'DB-004a: deactivating an ARCHIVED location is an invalid transition'
);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'archive', 'Skip the inactive step', null) $$,
  'LC002', null,
  'DB-004b: archiving an ACTIVE location (skipping INACTIVE) is invalid'
);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'delete', 'Remove it', null) $$,
  '22023', null,
  'DB-004c: unknown action (e.g. delete) is rejected'
);
select throws_ok(
  $$ select * from public.apply_location_assignment_changes('00000000-0000-0000-0000-000000059008'::uuid,
       '[{"locationId":"00000000-0000-0000-0000-0000000590b4","action":"update","role":"manager"}]'::jsonb) $$,
  '22023', null,
  'DB-022a: assignment RPC rejects changes at an ARCHIVED location'
);
reset role;
select throws_ok(
  $$ insert into public.location_memberships (location_id, profile_id, role, active)
     values ('00000000-0000-0000-0000-0000000590b4'::uuid, '00000000-0000-0000-0000-000000059007'::uuid, 'staff', true) $$,
  '55000', null,
  'DB-022b: direct insert of an active assignment at an ARCHIVED location is rejected'
);
select is(
  (select active::text || '/' || (archived_at is not null)::text from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'false/true',
  'DB-005b: location stayed ARCHIVED after the rejected reactivation'
);

-- Restore archive -> INACTIVE (never straight to ACTIVE)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059006', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b4'::uuid, 'restore_archive', 'Archived by mistake', 'archived') $$,
  'DB-005c: restore_archive succeeds'
);
reset role;
select is(
  (select active::text || '/' || coalesce(archived_at::text, 'null') from public.locations where id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  'false/null',
  'DB-005d: restored location is INACTIVE, not ACTIVE'
);
select is(
  (select count(*)::int from public.location_lifecycle_events where location_id = '00000000-0000-0000-0000-0000000590b4'::uuid),
  5,
  'DB-013c: every successful transition produced an event (5 total) and rejected ones none'
);

-- --------------------------------------------------------------------------
-- DB-006: reason required
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', null, null) $$,
  '22023', null, 'DB-006a: NULL reason rejected');
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', '     ', null) $$,
  '22023', null, 'DB-006b: whitespace-only reason rejected');
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'ab', null) $$,
  '22023', null, 'DB-006c: too-short reason rejected');
select throws_ok(
  format($$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', %L, null) $$, repeat('x', 501)),
  '22023', null, 'DB-006d: over-long reason rejected');
reset role;

-- --------------------------------------------------------------------------
-- DB-008 / DB-009 / DB-010: authorization denials (all on League City)
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059004', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'Cross tenant attempt', null) $$,
  '42501', null, 'DB-008a: Monks GM cannot deactivate a Liquor Tap location');
select throws_ok(
  $$ select public.get_location_lifecycle_readiness('00000000-0000-0000-0000-0000000590b3'::uuid) $$,
  '42501', null, 'DB-008b: Monks GM cannot read Liquor Tap lifecycle readiness');
select is(
  (select count(*)::int from public.location_lifecycle_events),
  0,
  'DB-008c: cross-tenant manager reads no Liquor Tap lifecycle audit rows'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059008', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'Staff attempt', null) $$,
  '42501', null, 'DB-009a: ordinary staff denied');
select is(
  (select count(*)::int from public.location_lifecycle_events),
  0,
  'DB-009b: ordinary staff read no lifecycle audit rows'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059007', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'deactivate', 'Location manager attempt', null) $$,
  '42501', null, 'DB-009c: a Location Manager gains no organization-wide lifecycle authority');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059002', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'Assistant attempt', null) $$,
  '42501', null, 'DB-009d: Overall Assistant Manager denied');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059009', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'Revoked creator attempt', null) $$,
  '42501', null, 'DB-010: revoked organization creator is denied (Issue #106 regression)');
reset role;

set local role anon;
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b3'::uuid, 'deactivate', 'Anonymous attempt', null) $$,
  '42501', null, 'DB-009e: anon role has no EXECUTE on the transition RPC');
reset role;

select is(
  (select active from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid),
  true,
  'DB-009f: League City untouched by every denied attempt'
);

-- --------------------------------------------------------------------------
-- DB-012: direct state-update bypass denied; metadata edits still work
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ update public.locations set active = false where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '42501', null, 'DB-012a: Org Owner cannot flip locations.active directly');
select throws_ok(
  $$ update public.locations set archived_at = now() where id = '00000000-0000-0000-0000-0000000590b4'::uuid $$,
  '42501', null, 'DB-012b: Org Owner cannot set archived_at directly');
select throws_ok(
  $$ update public.locations set active = true where id = '00000000-0000-0000-0000-0000000590b4'::uuid $$,
  '42501', null, 'DB-012c: Org Owner cannot reactivate directly');
select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone, active)
     values ('00000000-0000-0000-0000-0000000590a2'::uuid, 'Born Inactive', 'America/Chicago', false) $$,
  '42501', null, 'DB-012d: direct insert of a non-active location is rejected');
select lives_ok(
  $$ update public.locations set cover_weight = 0.5 where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  'DB-012e: ordinary metadata update remains permitted');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select throws_ok(
  $$ update public.locations set active = false where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '42501', null, 'DB-012f: even an Overall Owner cannot bypass the RPC with a direct update');
reset role;
select is(
  (select active from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid),
  true,
  'DB-012g: League City still active after the bypass attempts'
);

-- --------------------------------------------------------------------------
-- DB-016 / DB-017: blockers on NASA (active session = hard blocker)
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select ok(
  (public.get_location_lifecycle_readiness('00000000-0000-0000-0000-0000000590b2'::uuid) -> 'blockers')
    @> '[{"code":"ACTIVE_SERVICE_SESSIONS","count":1,"deactivate":"hard","archive":"hard"}]'::jsonb,
  'DB-016a: readiness reports the active service session as a hard blocker with a real count'
);
select is(
  (public.get_location_lifecycle_readiness('00000000-0000-0000-0000-0000000590b2'::uuid) ->> 'canDeactivate')::boolean,
  false,
  'DB-016b: readiness says NASA cannot be deactivated'
);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'deactivate', 'Try with live session', 'active') $$,
  'LC001', null,
  'DB-016c: transition re-checks blockers transactionally and refuses'
);
reset role;
select is(
  (select active::text || '/' || coalesce(archived_at::text, 'null') from public.locations where id = '00000000-0000-0000-0000-0000000590b2'::uuid)
  || '/' || (select count(*)::text from public.location_lifecycle_events where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid),
  'true/null/0',
  'DB-017: blocked transition left NASA unchanged and wrote no audit event'
);

-- Resolve the blocker explicitly (the system never closes it for the user).
update public.service_sessions set status = 'closed', closed_at = now() where id = 590002;

-- --------------------------------------------------------------------------
-- DB-014: failed audit insert rolls the state change back
-- --------------------------------------------------------------------------
create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin raise exception 'simulated audit failure' using errcode = 'XX999'; end $$;
create trigger zz_fail_audit before insert on public.location_lifecycle_events
  for each row execute function pg_temp.fail_audit();

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'deactivate', 'Audit will fail', 'active') $$,
  'XX999', null,
  'DB-014a: audit insert failure aborts the transition'
);
reset role;
drop trigger zz_fail_audit on public.location_lifecycle_events;
select is(
  (select active from public.locations where id = '00000000-0000-0000-0000-0000000590b2'::uuid),
  true,
  'DB-014b: location unchanged because the state change rolled back with the audit failure'
);

-- --------------------------------------------------------------------------
-- DB-024: concurrency -- expected-state guard + row lock + share-locking guards
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'reactivate', 'Stale UI state', 'inactive') $$,
  'LC003', null,
  'DB-024a: stale expected state is rejected deterministically'
);
reset role;
select ok(
  pg_get_functiondef('public.transition_location_lifecycle(uuid,text,text,text)'::regprocedure) ~* 'for no key update',
  'DB-024b: transition serializes on the location row (FOR NO KEY UPDATE)'
);
select ok(
  pg_get_functiondef('private.guard_location_operational_write()'::regprocedure) ~* 'for share',
  'DB-024c: operational writers take FOR SHARE on the location row, serializing with transitions'
);

-- --------------------------------------------------------------------------
-- Warnings do not block deactivation; they do block archive until resolved.
-- Historical data is preserved; corrections stay possible (DB-018).
-- --------------------------------------------------------------------------
create temp table pre_b2 as
  select
    (select count(*) from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid) as sessions,
    (select count(*) from public.tip_pools where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid) as pools,
    (select count(*) from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid) as members;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select ok(
  (public.get_location_lifecycle_readiness('00000000-0000-0000-0000-0000000590b2'::uuid) -> 'blockers')
    @> '[{"code":"DRAFT_TIP_POOLS","deactivate":"warning","archive":"hard"}]'::jsonb,
  'DB-016d: a draft tip pool is a WARNING for deactivation and HARD for archive'
);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'deactivate', 'Seasonal closure', 'active') $$,
  'DB-001c: warnings alone do not block deactivation'
);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'archive', 'Close the books', 'inactive') $$,
  'LC001', null,
  'DB-016e: archive is refused while a draft tip pool is unresolved'
);
reset role;

-- Finalizing the tip pool is a legitimate correction at an INACTIVE location.
select lives_ok(
  $$ update public.tip_pools set status = 'finalized', finalized_at = now(),
       finalized_by = '00000000-0000-0000-0000-000000059006'::uuid where id = 590001 $$,
  'DB-018c: finalizing an existing tip pool at an INACTIVE location is allowed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b2'::uuid, 'archive', 'Close the books', 'inactive') $$,
  'DB-003c: archive succeeds once the hard blocker is resolved (finalized pool is historical)'
);
reset role;

select is(
  (select row(
     (select count(*) from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid),
     (select count(*) from public.tip_pools where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid),
     (select count(*) from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000590b2'::uuid)
   )::text),
  (select row(sessions, pools, members)::text from pre_b2),
  'DB-018d: sessions, tip pools and assignments are all preserved through deactivate + archive'
);
select is(
  (select status::text from public.tip_pools where id = 590001),
  'finalized',
  'DB-018e: lifecycle transitions never unfinalize or alter tip pools'
);

-- --------------------------------------------------------------------------
-- DB-019: sibling location unchanged
-- --------------------------------------------------------------------------
select is(
  (select row(active, archived_at, updated_at, name)::text from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid),
  (select row(active, archived_at, updated_at, name)::text from snap_b3),
  'DB-019a: League City row identical after NASA and Downtown lifecycle changes'
) ;

-- --------------------------------------------------------------------------
-- DB-015: hard delete denied everywhere
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ delete from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '42501', null, 'DB-015a: Org Owner has no DELETE privilege on locations');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select throws_ok(
  $$ delete from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '42501', null, 'DB-015b: Overall Owner has no DELETE privilege on locations');
select throws_ok(
  $$ truncate public.locations $$,
  '42501', null, 'DB-015c: TRUNCATE on locations is not permitted for clients');
reset role;

-- Defense in depth: even if a DELETE grant + policy were ever added by mistake,
-- the trigger still refuses client roles.
grant delete on public.locations to authenticated;
create policy zz_tmp_delete on public.locations for delete to authenticated using (true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select throws_ok(
  $$ delete from public.locations where id = '00000000-0000-0000-0000-0000000590b3'::uuid $$,
  '42501', 'Locations cannot be deleted; deactivate and archive them instead',
  'DB-015d: trigger refuses client-role deletes even with a (mistaken) grant and policy');
reset role;
drop policy zz_tmp_delete on public.locations;
revoke delete on public.locations from authenticated;

select throws_ok(
  $$ delete from public.locations where id = '00000000-0000-0000-0000-0000000590b2'::uuid $$,
  '23503', null,
  'DB-015e: a location with lifecycle history cannot be removed even by a privileged session (FK)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosrc ~* 'delete\s+from\s+(only\s+)?public\.locations'),
  0,
  'DB-015f: no function in public/private deletes from public.locations (no definer-routed hard delete)'
);
select is(
  (select count(*)::int from public.locations where organization_id = '00000000-0000-0000-0000-0000000590a2'::uuid),
  3,
  'DB-015g: all three Liquor Tap locations still exist'
);

-- --------------------------------------------------------------------------
-- Audit table integrity and read scope
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059005', true);
select throws_ok(
  $$ insert into public.location_lifecycle_events (location_id, organization_id, actor_profile_id, action, previous_state, new_state, reason)
     values ('00000000-0000-0000-0000-0000000590b3'::uuid, '00000000-0000-0000-0000-0000000590a2'::uuid,
             '00000000-0000-0000-0000-000000059005'::uuid, 'deactivate', 'active', 'inactive', 'forged entry') $$,
  '42501', null, 'DB-013d: clients cannot insert audit events directly (no forged history)');
select throws_ok(
  $$ update public.location_lifecycle_events set reason = 'tampered' $$,
  '42501', null, 'DB-013e: clients cannot update audit events');
select throws_ok(
  $$ delete from public.location_lifecycle_events $$,
  '42501', null, 'DB-013f: clients cannot delete audit events');
select is(
  (select count(*)::int from public.location_lifecycle_events),
  7,
  'DB-013g: Org Owner reads the full audit trail of their own organization (7 events)'
);
reset role;
select throws_ok(
  $$ update public.location_lifecycle_events set reason = 'tampered' $$,
  '23514', null, 'DB-013h: audit events are append-only even for privileged sessions (UPDATE)');
select throws_ok(
  $$ delete from public.location_lifecycle_events $$,
  '23514', null, 'DB-013i: audit events are append-only even for privileged sessions (DELETE)');
select throws_ok(
  $$ truncate public.location_lifecycle_events $$,
  '23514', null, 'DB-013j: audit events cannot be truncated');
select throws_ok(
  $$ insert into public.location_lifecycle_events (location_id, organization_id, actor_profile_id, action, previous_state, new_state, reason)
     values ('00000000-0000-0000-0000-0000000590b3'::uuid, '00000000-0000-0000-0000-0000000590a2'::uuid,
             '00000000-0000-0000-0000-000000059005'::uuid, 'reactivate', 'archived', 'active', 'impossible transition') $$,
  '23514', null, 'DB-004d: audit constraint rejects a transition the state machine forbids');

-- --------------------------------------------------------------------------
-- Cross-organization sanity: Overall Owner reaches Monks Webster; Monks-only
-- manager reads Webster's own empty audit scope.
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b1'::uuid, 'deactivate', 'Overall decision for Webster', 'active') $$,
  'DB-011c: Overall Owner (no Monks membership) deactivates a Monks location');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059004', true);
select is(
  (select count(*)::int from public.location_lifecycle_events),
  1,
  'DB-008d: Monks GM sees only the Monks audit event, never Liquor Tap history');
select lives_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590b1'::uuid, 'reactivate', 'Monks GM reopens Webster', 'inactive') $$,
  'DB-008e: Monks GM may manage lifecycle inside their own organization');
reset role;

-- Not-found handling
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000059000', true);
select throws_ok(
  $$ select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000590ff'::uuid, 'deactivate', 'Ghost location', null) $$,
  'P0002', null, 'DB-004e: unknown location raises P0002');
reset role;

select * from finish();

rollback;
