begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- --------------------------------------------------------------------------
-- DB-001: location_memberships table exists
-- --------------------------------------------------------------------------
select has_table(
  'public',
  'location_memberships',
  'DB-001: public.location_memberships table exists'
);

-- --------------------------------------------------------------------------
-- DB-002: Required identity/location columns exist
-- --------------------------------------------------------------------------
select has_column('public', 'location_memberships', 'id', 'DB-002a: location_memberships.id exists');
select has_column('public', 'location_memberships', 'location_id', 'DB-002b: location_memberships.location_id exists');
select has_column('public', 'location_memberships', 'profile_id', 'DB-002c: location_memberships.profile_id exists');
select has_column('public', 'location_memberships', 'active', 'DB-002d: location_memberships.active exists');
select has_column('public', 'location_memberships', 'created_at', 'DB-002e: location_memberships.created_at exists');
select has_column('public', 'location_memberships', 'updated_at', 'DB-002f: location_memberships.updated_at exists');

-- --------------------------------------------------------------------------
-- DB-003: Foreign keys and unique constraint
-- --------------------------------------------------------------------------
select col_is_pk('public', 'location_memberships', 'id', 'DB-003a: id is primary key');
select col_is_unique('public', 'location_memberships', array['location_id', 'profile_id'], 'DB-003b: (location_id, profile_id) is unique');

-- --------------------------------------------------------------------------
-- Test identities and fixtures
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000052000'::uuid, 'creator52@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000052001'::uuid, 'jack52@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000052002'::uuid, 'sam52@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000052003'::uuid, 'tom52@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000052004'::uuid, 'jerry52@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000052005'::uuid, 'server52@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000052000'::uuid, 'Creator 52'),
  ('00000000-0000-0000-0000-000000052001'::uuid, 'Jack Multi-Location'),
  ('00000000-0000-0000-0000-000000052002'::uuid, 'Sam Single-Branch'),
  ('00000000-0000-0000-0000-000000052003'::uuid, 'Tom Monks'),
  ('00000000-0000-0000-0000-000000052004'::uuid, 'Jerry Scoped'),
  ('00000000-0000-0000-0000-000000052005'::uuid, 'Server Non-Manager');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000520a1'::uuid, 'Monks Pub', 'monks-pub-52', '00000000-0000-0000-0000-000000052000'::uuid),
  ('00000000-0000-0000-0000-0000000520a2'::uuid, 'Liquor Tap Lounge', 'liquor-tap-52', '00000000-0000-0000-0000-000000052000'::uuid);

-- Monks has 1 location: Webster
-- Liquor Tap has 2 locations: NASA and League City
insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-0000000520a1'::uuid, 'Webster', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000520b2'::uuid, '00000000-0000-0000-0000-0000000520a2'::uuid, 'NASA', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000520b3'::uuid, '00000000-0000-0000-0000-0000000520a2'::uuid, 'League City', 'America/Chicago');

-- Organization memberships
-- Jack: Monks (owner), Liquor Tap (owner)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000520a1'::uuid, '00000000-0000-0000-0000-000000052001'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000520a2'::uuid, '00000000-0000-0000-0000-000000052001'::uuid, array['owner']::public.app_role[], true);

-- Sam: Liquor Tap (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000520a2'::uuid, '00000000-0000-0000-0000-000000052002'::uuid, array['server']::public.app_role[], true);

-- Tom: Monks (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000520a1'::uuid, '00000000-0000-0000-0000-000000052003'::uuid, array['server']::public.app_role[], true);

-- Jerry: Monks (server), Liquor Tap (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000520a1'::uuid, '00000000-0000-0000-0000-000000052004'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000520a2'::uuid, '00000000-0000-0000-0000-000000052004'::uuid, array['server']::public.app_role[], true);

-- Server non-manager in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000520a2'::uuid, '00000000-0000-0000-0000-000000052005'::uuid, array['server']::public.app_role[], true);

-- --------------------------------------------------------------------------
-- DB-004, DB-005, DB-006, DB-007: Jack explicit multi-location assignments
-- --------------------------------------------------------------------------
insert into public.location_memberships (location_id, profile_id, active)
values
  ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052001'::uuid, true), -- Webster
  ('00000000-0000-0000-0000-0000000520b2'::uuid, '00000000-0000-0000-0000-000000052001'::uuid, true), -- NASA
  ('00000000-0000-0000-0000-0000000520b3'::uuid, '00000000-0000-0000-0000-000000052001'::uuid, true); -- League City

select is(
  (select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000052001'::uuid and active = true),
  3,
  'DB-004..007: One profile (Jack) holds multiple explicit location assignments across orgs (Webster, NASA, League City)'
);

-- --------------------------------------------------------------------------
-- DB-008: Duplicate assignment is rejected
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id) values ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052001'::uuid)$$,
  '23505',
  null,
  'DB-008: Duplicate (location_id, profile_id) assignment is rejected by unique constraint'
);

-- --------------------------------------------------------------------------
-- DB-009: Several users can share one location (NASA contains Jack, Sam, Jerry)
-- --------------------------------------------------------------------------
insert into public.location_memberships (location_id, profile_id, active)
values
  ('00000000-0000-0000-0000-0000000520b2'::uuid, '00000000-0000-0000-0000-000000052002'::uuid, true), -- Sam -> NASA
  ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052003'::uuid, true), -- Tom -> Webster
  ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052004'::uuid, true), -- Jerry -> Webster
  ('00000000-0000-0000-0000-0000000520b2'::uuid, '00000000-0000-0000-0000-000000052004'::uuid, true); -- Jerry -> NASA

select is(
  (select count(*)::int from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000520b2'::uuid and active = true),
  3,
  'DB-009: Multiple people (Jack, Sam, Jerry) are assigned to the same location (NASA)'
);

-- --------------------------------------------------------------------------
-- DB-010: Organization membership alone does NOT create location assignment
-- --------------------------------------------------------------------------
select ok(
  not exists(
    select 1 from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000052002'::uuid -- Sam
      and location_id = '00000000-0000-0000-0000-0000000520b3'::uuid -- League City
  ),
  'DB-010: Sam has Liquor Tap org membership, but has NO assignment to League City'
);

-- --------------------------------------------------------------------------
-- DB-011 & DB-012: Effective scoped access query considering org membership + location assignment
-- --------------------------------------------------------------------------
-- Function replicating canonical effective scoped access evaluation in SQL
create or replace function pg_temp.has_effective_access(p_profile_id uuid, p_location_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.location_memberships lm
    join public.locations l on l.id = lm.location_id
    join public.memberships m on m.organization_id = l.organization_id and m.profile_id = lm.profile_id
    where lm.profile_id = p_profile_id
      and lm.location_id = p_location_id
      and lm.active = true
      and m.active = true
      and l.active = true
  );
$$;

-- Sam effective access
select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052002'::uuid, '00000000-0000-0000-0000-0000000520b2'::uuid),
  true,
  'DB-011a: Sam has effective access to NASA (active org + active location)'
);
select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052002'::uuid, '00000000-0000-0000-0000-0000000520b3'::uuid),
  false,
  'DB-011b: Sam has NO effective access to League City (active org, but no location assignment)'
);
select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052002'::uuid, '00000000-0000-0000-0000-0000000520b1'::uuid),
  false,
  'DB-011c: Sam has NO effective access to Monks/Webster (no org, no location)'
);

-- --------------------------------------------------------------------------
-- DB-012: Inactive organization membership invalidates effective location access
-- --------------------------------------------------------------------------
-- Deactivate Jerry's Liquor Tap membership
update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-0000000520a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000052004'::uuid;

select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052004'::uuid, '00000000-0000-0000-0000-0000000520b2'::uuid),
  false,
  'DB-012: Jerry is denied NASA access when Liquor Tap membership is inactive, despite persisted location row'
);
select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052004'::uuid, '00000000-0000-0000-0000-0000000520b1'::uuid),
  true,
  'DB-012b: Jerry retains Webster access because Monks membership remains active'
);

-- Restore Jerry's membership for subsequent checks
update public.memberships
set active = true
where organization_id = '00000000-0000-0000-0000-0000000520a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000052004'::uuid;

-- --------------------------------------------------------------------------
-- DB-013: Inactive location assignment denies effective access
-- --------------------------------------------------------------------------
update public.location_memberships
set active = false
where location_id = '00000000-0000-0000-0000-0000000520b2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000052002'::uuid;

select is(
  pg_temp.has_effective_access('00000000-0000-0000-0000-000000052002'::uuid, '00000000-0000-0000-0000-0000000520b2'::uuid),
  false,
  'DB-013: Sam is denied NASA access when location assignment itself is set to inactive'
);

-- Restore Sam's assignment
update public.location_memberships
set active = true
where location_id = '00000000-0000-0000-0000-0000000520b2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000052002'::uuid;

-- --------------------------------------------------------------------------
-- DB-014 & DB-015: Unauthorized self-assignment and cross-user assignment rejected by RLS
-- --------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000052005'; -- Server non-manager

-- Attempt self-assignment to Webster
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id) values ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052005'::uuid)$$,
  '42501',
  null,
  'DB-014: Non-manager cannot self-assign a location via direct INSERT'
);

-- Attempt cross-user assignment (assigning Sam to Webster)
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id) values ('00000000-0000-0000-0000-0000000520b1'::uuid, '00000000-0000-0000-0000-000000052002'::uuid)$$,
  '42501',
  null,
  'DB-015: Non-manager cannot assign another person to a location via direct INSERT'
);

reset role;

-- --------------------------------------------------------------------------
-- DB-016: Cross-organization tenant isolation
-- --------------------------------------------------------------------------
select ok(
  not exists(
    select 1 from public.location_memberships lm
    join public.locations l on l.id = lm.location_id
    where lm.profile_id = '00000000-0000-0000-0000-000000052003'::uuid -- Tom (Monks only)
      and l.organization_id = '00000000-0000-0000-0000-0000000520a2'::uuid -- Liquor Tap
  ),
  'DB-016: Tom (Monks only) has zero location assignments in Liquor Tap'
);

-- --------------------------------------------------------------------------
-- DB-017: No automatic "all branches" expansion
-- --------------------------------------------------------------------------
select is(
  (
    select count(*)::int
    from public.location_memberships lm
    join public.locations l on l.id = lm.location_id
    where lm.profile_id = '00000000-0000-0000-0000-000000052002'::uuid -- Sam
      and l.organization_id = '00000000-0000-0000-0000-0000000520a2'::uuid
  ),
  1,
  'DB-017: Sam has exactly 1 location in Liquor Tap; no automatic all-branch expansion'
);

-- --------------------------------------------------------------------------
-- DB-018: Overall roles are not represented as fake location rows
-- --------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from public.location_memberships
    where profile_id not in (select id from public.profiles)
  ),
  'DB-018: All location_memberships strictly map to real profiles; no fake overall role placeholders'
);

rollback;
