begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- --------------------------------------------------------------------------
-- DB-001 & DB-002: location_memberships.role column exists with location_role enum type
-- --------------------------------------------------------------------------
select has_column(
  'public',
  'location_memberships',
  'role',
  'DB-001: public.location_memberships.role column exists'
);

select col_type_is(
  'public',
  'location_memberships',
  'role',
  'public.location_role',
  'DB-002: public.location_memberships.role is of type public.location_role'
);

-- --------------------------------------------------------------------------
-- Test identities and fixtures (0053 namespace)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000053000'::uuid, 'creator53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053001'::uuid, 'john53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053002'::uuid, 'jack53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053003'::uuid, 'sam53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053004'::uuid, 'tom53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053005'::uuid, 'assistant53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053006'::uuid, 'staff53@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053007'::uuid, 'overall53@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000053000'::uuid, 'Creator 53'),
  ('00000000-0000-0000-0000-000000053001'::uuid, 'John Mixed-Role'),
  ('00000000-0000-0000-0000-000000053002'::uuid, 'Jack Manager Everywhere'),
  ('00000000-0000-0000-0000-000000053003'::uuid, 'Sam Staff'),
  ('00000000-0000-0000-0000-000000053004'::uuid, 'Tom Monks'),
  ('00000000-0000-0000-0000-000000053005'::uuid, 'Alice Assistant Manager'),
  ('00000000-0000-0000-0000-000000053006'::uuid, 'Bob Staff Non-Manager'),
  ('00000000-0000-0000-0000-000000053007'::uuid, 'Charlie Overall');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000530a1'::uuid, 'Monks Pub 53', 'monks-pub-53', '00000000-0000-0000-0000-000000053000'::uuid),
  ('00000000-0000-0000-0000-0000000530a2'::uuid, 'Liquor Tap Lounge 53', 'liquor-tap-53', '00000000-0000-0000-0000-000000053000'::uuid);

-- Monks has 1 location: Webster
-- Liquor Tap has 2 locations: NASA and League City
insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-0000000530a1'::uuid, 'Webster', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-0000000530a2'::uuid, 'NASA', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000530b3'::uuid, '00000000-0000-0000-0000-0000000530a2'::uuid, 'League City', 'America/Chicago');

-- Organization memberships
-- Creator: owner in both
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a1'::uuid, '00000000-0000-0000-0000-000000053000'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053000'::uuid, array['owner']::public.app_role[], true);

-- John: member in both Liquor Tap and Monks
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a1'::uuid, '00000000-0000-0000-0000-000000053001'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053001'::uuid, array['general_manager']::public.app_role[], true);

-- Jack: owner/GM in both
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a1'::uuid, '00000000-0000-0000-0000-000000053002'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053002'::uuid, array['owner']::public.app_role[], true);

-- Sam: member in Liquor Tap (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053003'::uuid, array['server']::public.app_role[], true);

-- Tom: member in Monks (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a1'::uuid, '00000000-0000-0000-0000-000000053004'::uuid, array['server']::public.app_role[], true);

-- Alice: assistant manager in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053005'::uuid, array['shift_manager']::public.app_role[], true);

-- Bob: staff in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000530a2'::uuid, '00000000-0000-0000-0000-000000053006'::uuid, array['server']::public.app_role[], true);

-- Charlie: Overall role only (no org memberships)
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000053007'::uuid, 'owner'::public.overall_role);

-- --------------------------------------------------------------------------
-- DB-003, DB-004, DB-005: John Mixed-Role Acceptance Scenario
-- John at Liquor Tap / NASA -> Manager
-- John at Liquor Tap / League City -> Assistant Manager
-- John at Monks / Webster -> Manager
-- --------------------------------------------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000053001'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000530b3'::uuid, '00000000-0000-0000-0000-000000053001'::uuid, 'assistant_manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-000000053001'::uuid, 'manager'::public.location_role, true);

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b2'::uuid),
  'manager',
  'DB-003: John holds Manager role at NASA'
);

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b3'::uuid),
  'assistant_manager',
  'DB-004: John simultaneously holds Assistant Manager role at League City'
);

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b1'::uuid),
  'manager',
  'DB-005: John simultaneously holds Manager role at Webster'
);

-- --------------------------------------------------------------------------
-- DB-006 & DB-007: Independence across branches
-- --------------------------------------------------------------------------
-- Update NASA role from manager to staff
update public.location_memberships
set role = 'staff'::public.location_role
where profile_id = '00000000-0000-0000-0000-000000053001'::uuid
  and location_id = '00000000-0000-0000-0000-0000000530b2'::uuid;

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b3'::uuid),
  'assistant_manager',
  'DB-006: Modifying John NASA role does not leak to or alter League City assignment'
);

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b1'::uuid),
  'manager',
  'DB-007: Modifying John NASA role does not leak to or alter Webster assignment'
);

-- Restore John NASA role to manager
update public.location_memberships
set role = 'manager'::public.location_role
where profile_id = '00000000-0000-0000-0000-000000053001'::uuid
  and location_id = '00000000-0000-0000-0000-0000000530b2'::uuid;

-- --------------------------------------------------------------------------
-- DB-008: Same role assigned at multiple locations (Jack is Manager at Webster, NASA, League City)
-- --------------------------------------------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-000000053002'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000053002'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000530b3'::uuid, '00000000-0000-0000-0000-000000053002'::uuid, 'manager'::public.location_role, true);

select is(
  (select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053002'::uuid and role = 'manager'::public.location_role),
  3,
  'DB-008: Same role (manager) can be held by one person across multiple locations'
);

-- --------------------------------------------------------------------------
-- DB-009: Different people have different roles at the same location (NASA: John=manager, Sam=staff)
-- --------------------------------------------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000053003'::uuid, 'staff'::public.location_role, true);

select is(
  (select count(*)::int from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000530b2'::uuid and active = true),
  3, -- Jack (manager), John (manager), Sam (staff)
  'DB-009: Different people hold different roles at the same location (NASA)'
);

-- --------------------------------------------------------------------------
-- DB-010: Role requires valid profile/location relationship (FK integrity)
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role) values ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'staff'::public.location_role)$$,
  '23503',
  null,
  'DB-010a: Role assignment with non-existent profile_id is rejected by FK constraint'
);

select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role) values ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000053003'::uuid, 'staff'::public.location_role)$$,
  '23503',
  null,
  'DB-010b: Role assignment with non-existent location_id is rejected by FK constraint'
);

-- --------------------------------------------------------------------------
-- Helper function to evaluate effective location role in SQL
-- --------------------------------------------------------------------------
create or replace function pg_temp.get_effective_location_role(p_profile_id uuid, p_location_id uuid)
returns public.location_role language sql stable as $$
  select lm.role
  from public.location_memberships lm
  join public.locations l on l.id = lm.location_id
  join public.memberships m on m.organization_id = l.organization_id and m.profile_id = lm.profile_id
  where lm.profile_id = p_profile_id
    and lm.location_id = p_location_id
    and lm.active = true
    and m.active = true
    and l.active = true;
$$;

-- --------------------------------------------------------------------------
-- DB-011: Inactive org membership invalidates effective role
-- --------------------------------------------------------------------------
-- Deactivate John Liquor Tap membership
update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-0000000530a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000053001'::uuid;

select is(
  pg_temp.get_effective_location_role('00000000-0000-0000-0000-000000053001'::uuid, '00000000-0000-0000-0000-0000000530b2'::uuid),
  null,
  'DB-011: Inactive organization membership invalidates effective role (John at NASA yields NULL)'
);

select is(
  (pg_temp.get_effective_location_role('00000000-0000-0000-0000-000000053001'::uuid, '00000000-0000-0000-0000-0000000530b1'::uuid))::text,
  'manager',
  'DB-011b: John retains effective Manager role at Webster because Monks membership remains active'
);

-- Restore John Liquor Tap membership
update public.memberships
set active = true
where organization_id = '00000000-0000-0000-0000-0000000530a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000053001'::uuid;

-- --------------------------------------------------------------------------
-- DB-012: Inactive location membership invalidates effective role
-- --------------------------------------------------------------------------
update public.location_memberships
set active = false
where location_id = '00000000-0000-0000-0000-0000000530b2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000053001'::uuid;

select is(
  pg_temp.get_effective_location_role('00000000-0000-0000-0000-000000053001'::uuid, '00000000-0000-0000-0000-0000000530b2'::uuid),
  null,
  'DB-012: Inactive location assignment invalidates effective role (yields NULL)'
);

-- Restore John assignment
update public.location_memberships
set active = true
where location_id = '00000000-0000-0000-0000-0000000530b2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000053001'::uuid;

-- --------------------------------------------------------------------------
-- DB-013: Unsupported role value rejected
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role) values ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-000000053004'::uuid, 'owner'::public.location_role)$$,
  '22P02',
  null,
  'DB-013a: "owner" is rejected as an invalid location_role enum value'
);

select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role) values ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-000000053004'::uuid, 'lead'::public.location_role)$$,
  '22P02',
  null,
  'DB-013b: "lead" is rejected as an invalid location_role enum value'
);

-- --------------------------------------------------------------------------
-- DB-014, DB-015, DB-016: Write security & self-promotion prevention
-- --------------------------------------------------------------------------
-- Setup assignment for Bob (staff) and Alice (assistant manager)
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000053005'::uuid, 'assistant_manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-000000053006'::uuid, 'staff'::public.location_role, true);

-- Authenticate as Bob (staff)
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000053006';

-- DB-014: Normal staff cannot promote themselves
update public.location_memberships
set role = 'manager'::public.location_role
where profile_id = '00000000-0000-0000-0000-000000053006'::uuid;

select is(
  (select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053006'::uuid and role = 'manager'::public.location_role),
  0,
  'DB-014: Normal staff cannot self-promote to Manager via direct client UPDATE (0 rows affected)'
);

-- DB-015: Normal staff cannot modify another user role
update public.location_memberships
set role = 'staff'::public.location_role
where profile_id = '00000000-0000-0000-0000-000000053001'::uuid;

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053001'::uuid and location_id = '00000000-0000-0000-0000-0000000530b2'::uuid),
  'manager',
  'DB-015: Normal staff cannot modify another user role (John remains Manager)'
);

-- Authenticate as Alice (assistant manager)
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000053005';

-- DB-016: Assistant Manager cannot self-promote to Manager
update public.location_memberships
set role = 'manager'::public.location_role
where profile_id = '00000000-0000-0000-0000-000000053005'::uuid;

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053005'::uuid and location_id = '00000000-0000-0000-0000-0000000530b2'::uuid),
  'assistant_manager',
  'DB-016: Assistant Manager cannot self-promote to Manager (Alice remains assistant_manager)'
);

-- Reset back to postgres role
reset role;

-- --------------------------------------------------------------------------
-- DB-017: No automatic role assignment to sibling branches
-- --------------------------------------------------------------------------
-- Tom is assigned to Webster
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000530b1'::uuid, '00000000-0000-0000-0000-000000053004'::uuid, 'staff'::public.location_role, true);

select ok(
  not exists (
    select 1 from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000053004'::uuid
      and location_id in ('00000000-0000-0000-0000-0000000530b2'::uuid, '00000000-0000-0000-0000-0000000530b3'::uuid)
  ),
  'DB-017: Assigning Tom to Webster does not automatically create assignments for Liquor Tap branches'
);

-- --------------------------------------------------------------------------
-- DB-018: No location role required for Overall Role storage
-- --------------------------------------------------------------------------
select ok(
  exists (select 1 from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000053007'::uuid)
  and not exists (select 1 from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053007'::uuid),
  'DB-018: Charlie holds Overall Owner role without requiring any location_memberships rows'
);

-- --------------------------------------------------------------------------
-- DB-019: No Overall role duplicated into location role storage
-- --------------------------------------------------------------------------
select is(
  (select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000053007'::uuid),
  0,
  'DB-019: No fake location membership rows are duplicated for Overall role users'
);

-- --------------------------------------------------------------------------
-- DB-020: Cross-organization role leakage denied
-- --------------------------------------------------------------------------
select is(
  pg_temp.get_effective_location_role('00000000-0000-0000-0000-000000053004'::uuid, '00000000-0000-0000-0000-0000000530b2'::uuid),
  null,
  'DB-020: Tom Webster role in Monks does NOT leak to Liquor Tap NASA'
);

-- --------------------------------------------------------------------------
-- DB-021: Partial index on (location_id, role) exists
-- --------------------------------------------------------------------------
select has_index(
  'public',
  'location_memberships',
  'location_memberships_location_role_idx',
  'location_memberships_location_role_idx exists for efficient role lookup'
);

select * from finish();

rollback;
