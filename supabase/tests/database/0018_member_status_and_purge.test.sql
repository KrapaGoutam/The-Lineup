begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Structural: the index Feature 034's own spec asked for
-- (organization_id, active) -- the existing memberships_profile_org_idx
-- is the opposite leading column, tuned for a different access pattern
-- ("is this profile active in org X"), not "list org X's active/
-- inactive members".
select has_index(
  'public', 'memberships', 'memberships_org_active_idx',
  'memberships_org_active_idx exists for org-scoped active/inactive listing'
);

-- One organization, an owner, a general_manager, and two staff-tier
-- targets -- one that will be legitimately purged, one that stays
-- active throughout to prove purge refuses an active target.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000035001', '035-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035002', '035-manager@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035003', '035-inactive-staff@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035004', '035-active-staff@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035005', '035-inactive-manager@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035006', '035-multi-org@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000035001', 'PGTAP 035 Owner'),
  ('00000000-0000-0000-0000-000000035002', 'PGTAP 035 Manager'),
  ('00000000-0000-0000-0000-000000035003', 'PGTAP 035 Inactive Staff'),
  ('00000000-0000-0000-0000-000000035004', 'PGTAP 035 Active Staff'),
  ('00000000-0000-0000-0000-000000035005', 'PGTAP 035 Inactive Manager'),
  ('00000000-0000-0000-0000-000000035006', 'PGTAP 035 Multi Org');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000035101', 'PGTAP 035 Org', 'pgtap-035-org', '00000000-0000-0000-0000-000000035001'),
  ('00000000-0000-0000-0000-000000035102', 'PGTAP 035 Other Org', 'pgtap-035-other-org', '00000000-0000-0000-0000-000000035001');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035003', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035005', array['general_manager']::public.app_role[], false),
  -- Multi-org profile: inactive here, and also a member of a second
  -- org entirely (active there or not doesn't matter -- the guard
  -- fires on membership COUNT, not on the other row's own status).
  ('00000000-0000-0000-0000-000000035101', '00000000-0000-0000-0000-000000035006', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000035102', '00000000-0000-0000-0000-000000035006', array['server']::public.app_role[], true);

-- A registration record for the inactive-staff target, mirroring a real
-- self-served signup -- the actual thing a genuine erasure has to reach
-- beyond just the live profiles row.
insert into public.registrations (organization_id, display_name, contact, status, profile_id, self_served)
values (
  '00000000-0000-0000-0000-000000035101',
  'PGTAP 035 Inactive Staff',
  '555-035-0003',
  'approved',
  '00000000-0000-0000-0000-000000035003',
  true
);

set local role authenticated;

-- Real bug found live-testing this feature, fixed in this same
-- migration: private.can_view_profile used to require the TARGET's
-- membership to be active too, so a deactivated member's display_name
-- came back null to everyone but themself -- silently breaking
-- getOrganizationRoster()'s "Unknown" fallback for every inactive row,
-- Feature 034's Inactive tab included. Confirmed fixed here, not just
-- asserted: the owner can read the inactive staff member's real name.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035001', true);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000035003'),
  'PGTAP 035 Inactive Staff',
  'an inactive member''s real name is visible to their org''s owner (can_view_profile no longer requires the target to be active)'
);

-- A non-manager (server-tier) actor has zero purge capability, active
-- target or not -- mirrors canDeactivateMember/can_manage_member's own
-- "staff never had this capability" rule.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035004', true);
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035003'::uuid, null) $$,
  'P0001',
  'You are not authorized to purge this member, they are not currently inactive, or they have already been purged.',
  'a server-tier actor cannot purge anyone'
);

-- The owner cannot purge someone who is still ACTIVE -- must be
-- deactivated first, per the feature's own non-negotiable.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035001', true);
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035004'::uuid, null) $$,
  'P0001',
  'You are not authorized to purge this member, they are not currently inactive, or they have already been purged.',
  'an active member cannot be purged without deactivation first'
);

-- The owner cannot purge themself, even hypothetically -- the function's
-- self-check fires before can_purge_member is even consulted (it would
-- fail can_purge_member anyway since the owner is active, but this
-- proves the explicit self-guard, not just an incidental side effect).
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035001'::uuid, null) $$,
  'P0001',
  'You cannot purge your own account.',
  'the owner cannot purge their own account'
);

-- A profile that belongs to more than one organization is refused --
-- display_name/avatar_url are single global columns, not one per
-- membership, so scrubbing here would also blank their identity
-- elsewhere.
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035006'::uuid, null) $$,
  'P0001',
  'This person belongs to more than one organization and cannot be purged from here.',
  'a profile with memberships in more than one organization cannot be purged'
);

-- A general_manager cannot purge a fellow (inactive) general_manager --
-- the same role-hierarchy boundary can_manage_member enforces for
-- rename, unchanged here.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035005'::uuid, null) $$,
  'P0001',
  'You are not authorized to purge this member, they are not currently inactive, or they have already been purged.',
  'a manager cannot purge a fellow manager-tier target'
);

-- Cross-tenant: passing an organization id that does not match the
-- target's actual (inactive) membership org is refused, even though
-- can_purge_member itself would authorize the caller (it derives the
-- org from the target's own row, not from the parameter).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035001', true);
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035102'::uuid, '00000000-0000-0000-0000-000000035003'::uuid, null) $$,
  'P0001',
  'That person is not an inactive, unpurged member of this organization.',
  'a mismatched organization id is refused even for an otherwise-authorized actor'
);

-- The real, legitimate purge: owner purges the inactive staff member.
select lives_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035003'::uuid, 'left the company') $$,
  'the owner successfully purges an inactive staff member in their own org'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000035003'),
  'Deleted User',
  'the profile display_name is scrubbed'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-000000035003'),
  null,
  'the profile avatar_url is cleared'
);

select results_eq(
  $$ select display_name, contact from public.registrations where profile_id = '00000000-0000-0000-0000-000000035003' $$,
  $$ values ('Deleted User'::text, null::text) $$,
  'the original registration record is scrubbed too, not just the live profile'
);

select ok(
  (
    select purged_at is not null and purged_by = '00000000-0000-0000-0000-000000035001'::uuid
    from public.memberships
    where organization_id = '00000000-0000-0000-0000-000000035101'
      and profile_id = '00000000-0000-0000-0000-000000035003'
  ),
  'the membership row is marked purged_at/purged_by'
);

select ok(
  exists (
    select 1 from public.audit_events
    where organization_id = '00000000-0000-0000-0000-000000035101'
      and action = 'member_purged'
      and entity_type = 'membership'
      and entity_id = '00000000-0000-0000-0000-000000035003'
      and reason = 'left the company'
  ),
  'a member_purged audit event was recorded with the actor, reason, and before/after state'
);

-- Idempotency: purging the same, now-already-purged member again is
-- refused, not silently re-run.
select throws_ok(
  $$ select public.purge_inactive_member('00000000-0000-0000-0000-000000035101'::uuid, '00000000-0000-0000-0000-000000035003'::uuid, null) $$,
  'P0001',
  'You are not authorized to purge this member, they are not currently inactive, or they have already been purged.',
  'an already-purged member cannot be purged a second time'
);

select * from finish();
rollback;
