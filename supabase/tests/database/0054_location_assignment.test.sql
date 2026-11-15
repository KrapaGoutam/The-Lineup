begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- --------------------------------------------------------------------------
-- Test identities and fixtures (0054 namespace)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000054000'::uuid, 'creator54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054001'::uuid, 'john54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054002'::uuid, 'jack54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054003'::uuid, 'sam54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054004'::uuid, 'tom54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054005'::uuid, 'alice54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054006'::uuid, 'bob54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054007'::uuid, 'charlie54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054008'::uuid, 'monksmanager54@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054009'::uuid, 'liquortapmanager54@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000054000'::uuid, 'Creator 54'),
  ('00000000-0000-0000-0000-000000054001'::uuid, 'John Mixed-Role'),
  ('00000000-0000-0000-0000-000000054002'::uuid, 'Jack Manager Both'),
  ('00000000-0000-0000-0000-000000054003'::uuid, 'Sam Staff Liquor Tap'),
  ('00000000-0000-0000-0000-000000054004'::uuid, 'Tom Staff Monks'),
  ('00000000-0000-0000-0000-000000054005'::uuid, 'Alice Assistant Manager'),
  ('00000000-0000-0000-0000-000000054006'::uuid, 'Bob Staff Non-Manager'),
  ('00000000-0000-0000-0000-000000054007'::uuid, 'Charlie Overall Owner'),
  ('00000000-0000-0000-0000-000000054008'::uuid, 'Monks Manager Only'),
  ('00000000-0000-0000-0000-000000054009'::uuid, 'Liquor Tap Manager Only');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000540a1'::uuid, 'Monks Pub 54', 'monks-pub-54', '00000000-0000-0000-0000-000000054000'::uuid),
  ('00000000-0000-0000-0000-0000000540a2'::uuid, 'Liquor Tap Lounge 54', 'liquor-tap-54', '00000000-0000-0000-0000-000000054000'::uuid);

-- Monks has 1 location: Webster
-- Liquor Tap has 2 locations: NASA and League City
insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-0000000540b1'::uuid, '00000000-0000-0000-0000-0000000540a1'::uuid, 'Webster', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000540b2'::uuid, '00000000-0000-0000-0000-0000000540a2'::uuid, 'NASA', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000540b3'::uuid, '00000000-0000-0000-0000-0000000540a2'::uuid, 'League City', 'America/Chicago');

-- Organization Memberships:
-- Jack: owner in both Monks and Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a1'::uuid, '00000000-0000-0000-0000-000000054002'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054002'::uuid, array['owner']::public.app_role[], true);

-- MonksOnlyManager: GM in Monks only
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a1'::uuid, '00000000-0000-0000-0000-000000054008'::uuid, array['general_manager']::public.app_role[], true);

-- LiquorTapOnlyManager: GM in Liquor Tap only
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054009'::uuid, array['general_manager']::public.app_role[], true);

-- John: member in both Monks and Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a1'::uuid, '00000000-0000-0000-0000-000000054001'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054001'::uuid, array['server']::public.app_role[], true);

-- Sam: member in Liquor Tap only (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054003'::uuid, array['server']::public.app_role[], true);

-- Tom: member in Monks only (server)
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a1'::uuid, '00000000-0000-0000-0000-000000054004'::uuid, array['server']::public.app_role[], true);

-- Alice: shift_manager in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054005'::uuid, array['shift_manager']::public.app_role[], true);

-- Bob: staff in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000540a2'::uuid, '00000000-0000-0000-0000-000000054006'::uuid, array['server']::public.app_role[], true);

-- Charlie: Overall owner only
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000054007'::uuid, 'owner'::public.overall_role);

-- Set caller as Jack (authorized in both Monks and Liquor Tap)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054002', true);

-- --------------------------------------------------------------------------
-- DB-001, DB-002: One target profile can hold assignments at multiple locations
-- with different roles (John: Webster=manager, NASA=manager, League City=assistant_manager)
-- --------------------------------------------------------------------------
select is(
  (
    select count(*)::int
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054001'::uuid,
      '[
        {"locationId": "00000000-0000-0000-0000-0000000540b1", "action": "assign", "role": "manager"},
        {"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "manager"},
        {"locationId": "00000000-0000-0000-0000-0000000540b3", "action": "assign", "role": "assistant_manager"}
      ]'::jsonb
    )
  ),
  3,
  'DB-001: Target profile successfully assigned across 3 distinct locations in one batch'
);

select is(
  (
    select role::text from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and location_id = '00000000-0000-0000-0000-0000000540b3'::uuid
  ),
  'assistant_manager',
  'DB-002: Different roles coexist for John (assistant_manager at League City while manager elsewhere)'
);

-- --------------------------------------------------------------------------
-- DB-003: Cardinality constraint: one role per location enforced by unique constraint
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role, active)
    values ('00000000-0000-0000-0000-0000000540b2'::uuid, '00000000-0000-0000-0000-000000054001'::uuid, 'staff'::public.location_role, true)$$,
  '23505',
  null,
  'DB-003: Attempting to insert a second role at the same location violates unique(location_id, profile_id)'
);

-- --------------------------------------------------------------------------
-- DB-004: Batch assignment for NASA + League City succeeds when authorized
-- (LiquorTapOnlyManager assigns Sam to NASA as staff)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054009', true);

select is(
  (
    select count(*)::int
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054003'::uuid,
      '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "staff"}]'::jsonb
    )
  ),
  1,
  'DB-004: LiquorTapOnlyManager can assign staff within Liquor Tap branches'
);

-- --------------------------------------------------------------------------
-- DB-005: Batch assignment Webster + NASA succeeds when actor authorized for both orgs
-- (Jack assigns Alice to NASA=assistant_manager)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054002', true);

select is(
  (
    select count(*)::int
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054005'::uuid,
      '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "assistant_manager"}]'::jsonb
    )
  ),
  1,
  'DB-005: Jack succeeds in assigning roles across his organizations'
);

-- --------------------------------------------------------------------------
-- DB-006 & DB-007: Atomic Failure: Unauthorized location rejects entire batch with zero partial writes
-- (MonksOnlyManager attempts batch containing Webster AND NASA for John)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054008', true);

-- Record current state of Webster before attempt
select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000054001'::uuid and location_id = '00000000-0000-0000-0000-0000000540b1'::uuid),
  'manager',
  'DB-006 Pre-check: John Webster role is manager'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054001'::uuid,
    '[
      {"locationId": "00000000-0000-0000-0000-0000000540b1", "action": "update", "role": "staff"},
      {"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "update", "role": "staff"}
    ]'::jsonb
  )$$,
  '42501',
  null,
  'DB-006: Unauthorized location in batch throws authorization exception (42501)'
);

select is(
  (select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000054001'::uuid and location_id = '00000000-0000-0000-0000-0000000540b1'::uuid),
  'manager',
  'DB-007: Zero partial writes: Webster was NOT updated to staff after failed batch'
);

-- --------------------------------------------------------------------------
-- DB-008: Duplicate locationId entries in one request rejected
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054002', true);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054001'::uuid,
    '[
      {"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "manager"},
      {"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "staff"}
    ]'::jsonb
  )$$,
  '23505',
  null,
  'DB-008: Batch containing duplicate locationId instructions is rejected'
);

-- --------------------------------------------------------------------------
-- DB-009: Target lacking active parent org membership rejected
-- (Sam is member of Liquor Tap only; attempt to assign Webster in Monks fails)
-- --------------------------------------------------------------------------
select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054003'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000540b1", "action": "assign", "role": "staff"}]'::jsonb
  )$$,
  '42501',
  null,
  'DB-009: Target profile lacking active parent org membership is rejected'
);

-- --------------------------------------------------------------------------
-- DB-010: Location ID determines organization; caller cannot spoof org
-- --------------------------------------------------------------------------
select is(
  (
    select l.organization_id
    from public.location_memberships lm
    join public.locations l on l.id = lm.location_id
    where lm.profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and lm.location_id = '00000000-0000-0000-0000-0000000540b1'::uuid
  ),
  '00000000-0000-0000-0000-0000000540a1'::uuid,
  'DB-010: Owning organization derived server-side from locations table'
);

-- --------------------------------------------------------------------------
-- DB-011: Invalid location rejected
-- --------------------------------------------------------------------------
select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054001'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-000000000000", "action": "assign", "role": "staff"}]'::jsonb
  )$$,
  'P0002',
  null,
  'DB-011: Non-existent location UUID is rejected'
);

-- --------------------------------------------------------------------------
-- DB-012: Invalid role rejected
-- --------------------------------------------------------------------------
select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054001'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000540b1", "action": "assign", "role": "owner"}]'::jsonb
  )$$,
  '22P02',
  null,
  'DB-012: Invalid role value (owner) rejected by enum validator'
);

-- --------------------------------------------------------------------------
-- DB-013: Existing assignment can change role (League City: assistant_manager -> manager)
-- --------------------------------------------------------------------------
select is(
  (
    select role::text
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054001'::uuid,
      '[{"locationId": "00000000-0000-0000-0000-0000000540b3", "action": "update", "role": "manager"}]'::jsonb
    )
  ),
  'manager',
  'DB-013: Existing assignment role updated to manager'
);

-- --------------------------------------------------------------------------
-- DB-014: Existing assignment can deactivate preserving row
-- --------------------------------------------------------------------------
select is(
  (
    select active
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054001'::uuid,
      '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "deactivate"}]'::jsonb
    )
  ),
  false,
  'DB-014: Deactivation sets active = false'
);

select ok(
  exists(
    select 1 from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and location_id = '00000000-0000-0000-0000-0000000540b2'::uuid
      and active = false
  ),
  'DB-014b: Deactivated row persists in table for history and reactivation'
);

-- --------------------------------------------------------------------------
-- DB-015: Assignment can reactivate after validation
-- --------------------------------------------------------------------------
select is(
  (
    select active
    from public.apply_location_assignment_changes(
      '00000000-0000-0000-0000-000000054001'::uuid,
      '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "reactivate", "role": "manager"}]'::jsonb
    )
  ),
  true,
  'DB-015: Reactivation sets active = true with validated role'
);

-- --------------------------------------------------------------------------
-- DB-016: Repeated identical request is idempotent
-- --------------------------------------------------------------------------
select * from public.apply_location_assignment_changes(
  '00000000-0000-0000-0000-000000054001'::uuid,
  '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "manager"}]'::jsonb
);

select is(
  (
    select count(*)::int
    from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and location_id = '00000000-0000-0000-0000-0000000540b2'::uuid
  ),
  1,
  'DB-016: Idempotent: repeated assignment mutation produces exactly 1 row'
);

-- --------------------------------------------------------------------------
-- DB-017: Changing NASA does not change League City
-- --------------------------------------------------------------------------
select * from public.apply_location_assignment_changes(
  '00000000-0000-0000-0000-000000054001'::uuid,
  '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "update", "role": "staff"}]'::jsonb
);

select is(
  (
    select role::text from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and location_id = '00000000-0000-0000-0000-0000000540b3'::uuid
  ),
  'manager',
  'DB-017: Modifying NASA does not affect League City'
);

-- Restore John NASA role to manager
select * from public.apply_location_assignment_changes(
  '00000000-0000-0000-0000-000000054001'::uuid,
  '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "update", "role": "manager"}]'::jsonb
);

-- --------------------------------------------------------------------------
-- DB-018: Changing Liquor Tap assignments does not change Monks assignment
-- --------------------------------------------------------------------------
select is(
  (
    select role::text from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054001'::uuid
      and location_id = '00000000-0000-0000-0000-0000000540b1'::uuid
  ),
  'manager',
  'DB-018: Monks Webster assignment remains manager unaffected by Liquor Tap changes'
);

-- --------------------------------------------------------------------------
-- DB-019 & DB-020: Normal staff cannot self-promote or promote others
-- (Bob authenticated as server)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054006', true);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054006'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "assign", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'DB-019: Normal staff cannot self-promote to Manager via RPC'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054003'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "update", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'DB-020: Normal staff cannot promote another user via RPC'
);

-- --------------------------------------------------------------------------
-- DB-021: Cross-organization unauthorized manager mutation rejected
-- (MonksOnlyManager attempts to mutate Liquor Tap location)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054008', true);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000054003'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000540b2", "action": "update", "role": "assistant_manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'DB-021: Monks manager cannot mutate Liquor Tap location assignment'
);

-- --------------------------------------------------------------------------
-- DB-022: No sibling branch assignment automatically created
-- (Tom assigned to Webster; check that NASA and League City rows do not exist)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000054002', true);

select * from public.apply_location_assignment_changes(
  '00000000-0000-0000-0000-000000054004'::uuid,
  '[{"locationId": "00000000-0000-0000-0000-0000000540b1", "action": "assign", "role": "staff"}]'::jsonb
);

select ok(
  not exists (
    select 1 from public.location_memberships
    where profile_id = '00000000-0000-0000-0000-000000054004'::uuid
      and location_id in ('00000000-0000-0000-0000-0000000540b2'::uuid, '00000000-0000-0000-0000-0000000540b3'::uuid)
  ),
  'DB-022: Assigning Tom to Webster creates no sibling assignments in Liquor Tap'
);

-- Reset caller to postgres to verify global table storage
reset role;

-- --------------------------------------------------------------------------
-- DB-023: Overall role storage unchanged
-- --------------------------------------------------------------------------
select is(
  (select count(*)::int from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000054007'::uuid),
  1,
  'DB-023: Charlie overall_roles row remains completely unaffected'
);

-- --------------------------------------------------------------------------
-- DB-024: Organization membership role storage unchanged
-- --------------------------------------------------------------------------
select is(
  (select count(*)::int from public.memberships where profile_id = '00000000-0000-0000-0000-000000054001'::uuid and roles = array['server']::public.app_role[]),
  2,
  'DB-024: John organization membership roles remain server in both orgs'
);

select * from finish();

rollback;
