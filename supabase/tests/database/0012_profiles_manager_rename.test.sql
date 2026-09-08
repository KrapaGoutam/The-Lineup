begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Feature 024. Two organizations, so a same-app cross-org rename attempt
-- is meaningfully tested (not just "no membership row at all").
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000024001', '024-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024002', '024-manager@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024003', '024-staff@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024004', '024-server@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024005', '024-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000024001', 'PGTAP 024 Owner'),
  ('00000000-0000-0000-0000-000000024002', 'PGTAP 024 Manager'),
  ('00000000-0000-0000-0000-000000024003', 'PGTAP 024 Staff'),
  ('00000000-0000-0000-0000-000000024004', 'PGTAP 024 Server'),
  ('00000000-0000-0000-0000-000000024005', 'PGTAP 024 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000024101', 'PGTAP 024 Org', 'pgtap-024-org', '00000000-0000-0000-0000-000000024001'),
  ('00000000-0000-0000-0000-000000024102', 'PGTAP 024 Other Org', 'pgtap-024-other-org', '00000000-0000-0000-0000-000000024005');

-- A second owner, seeded here (mirroring canChangeDesignation's "owner
-- is unrestricted, even toward another owner" rule in designations.ts) --
-- must happen before `set local role authenticated` below, same as
-- every other seed row; authenticated has no INSERT privilege on
-- auth.users.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-000000024006', '024-owner-two@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000024006', 'PGTAP 024 Owner Two');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000024101', '00000000-0000-0000-0000-000000024001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024101', '00000000-0000-0000-0000-000000024002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024101', '00000000-0000-0000-0000-000000024003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024101', '00000000-0000-0000-0000-000000024004', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000024102', '00000000-0000-0000-0000-000000024005', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024101', '00000000-0000-0000-0000-000000024006', array['owner']::public.app_role[], true);

set local role authenticated;

-- Owner renames anyone in their org, including another owner.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024001', true);

select lives_ok(
  $$ update public.profiles set display_name = 'Renamed by Owner' where id = '00000000-0000-0000-0000-000000024006' $$,
  'owner renames another owner'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000024006'),
  'Renamed by Owner',
  'the rename actually took effect'
);

-- Manager renames staff (an assistant_manager-level target), but is
-- blocked from renaming the owner -- exactly canChangeDesignation's
-- boundary.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024002', true);

select lives_ok(
  $$ update public.profiles set display_name = 'Renamed by Manager' where id = '00000000-0000-0000-0000-000000024003' $$,
  'manager renames an assistant-manager-tier target'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000024003'),
  'Renamed by Manager',
  'the rename actually took effect'
);

select results_eq(
  $$ update public.profiles set display_name = 'Blocked' where id = '00000000-0000-0000-0000-000000024001' returning 1 $$,
  $$ select 1 where false $$,
  'manager cannot rename the owner -- update matches zero rows under RLS, not an error'
);

-- A deactivated member cannot be renamed, even by the owner -- matches
-- every other personnel action's active-only rule.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024001', true);
select results_eq(
  $$ update public.profiles set display_name = 'Blocked' where id = '00000000-0000-0000-0000-000000024004' returning 1 $$,
  $$ select 1 where false $$,
  'owner cannot rename a deactivated member'
);

-- Cross-organization: the outsider owner has no membership in this org at
-- all, so can_manage_member finds no matching target row.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024005', true);
select results_eq(
  $$ update public.profiles set display_name = 'Blocked' where id = '00000000-0000-0000-0000-000000024003' returning 1 $$,
  $$ select 1 where false $$,
  'an owner of a different organization cannot rename this org''s staff'
);

-- Self-rename still works via the untouched profiles_update_self policy
-- -- a staff member with no membership-write capability at all can still
-- rename themselves.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024003', true);
select lives_ok(
  $$ update public.profiles set display_name = 'Self Renamed' where id = '00000000-0000-0000-0000-000000024003' $$,
  'a staff member can still rename themselves via profiles_update_self, unaffected by the new policy'
);

select * from finish();
rollback;
