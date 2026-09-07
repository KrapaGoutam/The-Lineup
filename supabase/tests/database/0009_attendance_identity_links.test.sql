begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table(
  'public',
  'attendance_identity_links',
  'attendance identity links exist'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.attendance_identity_links'::regclass),
  'attendance identity links have RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.attendance_identity_links', 'SELECT')
  and not has_table_privilege('anon', 'public.attendance_identity_links', 'INSERT'),
  'anon cannot read or create attendance identity links'
);
select ok(
  has_table_privilege('authenticated', 'public.attendance_identity_links', 'SELECT')
  and has_table_privilege('authenticated', 'public.attendance_identity_links', 'INSERT')
  and has_table_privilege('authenticated', 'public.attendance_identity_links', 'UPDATE')
  and has_table_privilege('authenticated', 'public.attendance_identity_links', 'DELETE'),
  'authenticated reaches every required operation through RLS'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000019001', '019-creator@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000019002', '019-manager@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000019003', '019-server-one@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000019004', '019-server-two@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000019005', '019-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000019006', '019-assistant@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000019001', 'PGTAP 019 Creator'),
  ('00000000-0000-0000-0000-000000019002', 'PGTAP 019 Manager'),
  ('00000000-0000-0000-0000-000000019003', 'PGTAP 019 Server One'),
  ('00000000-0000-0000-0000-000000019004', 'PGTAP 019 Server Two'),
  ('00000000-0000-0000-0000-000000019005', 'PGTAP 019 Outsider'),
  ('00000000-0000-0000-0000-000000019006', 'PGTAP 019 Assistant Manager');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000019101', 'PGTAP 019 Org', 'pgtap-019-org', '00000000-0000-0000-0000-000000019001'),
  ('00000000-0000-0000-0000-000000019102', 'PGTAP 019 Other Org', 'pgtap-019-other-org', '00000000-0000-0000-0000-000000019005');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019006', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000019102', '00000000-0000-0000-0000-000000019005', array['owner']::public.app_role[], true);

insert into public.attendance_identity_links
  (organization_id, profile_id, neon_user_id, linked_by)
values
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019003', 101, '00000000-0000-0000-0000-000000019002'),
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019004', 102, '00000000-0000-0000-0000-000000019002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000019003', true);

select is(
  (select count(*) from public.attendance_identity_links),
  1::bigint,
  'a regular member reads only their own link'
);
select is(
  (select neon_user_id from public.attendance_identity_links),
  101,
  'the regular member sees their own Neon identity'
);
select throws_ok(
  $$
    insert into public.attendance_identity_links
      (organization_id, profile_id, neon_user_id, linked_by)
    values
      ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019002', 103, '00000000-0000-0000-0000-000000019003')
  $$,
  '42501',
  'new row violates row-level security policy for table "attendance_identity_links"',
  'a regular member cannot create a link'
);

update public.attendance_identity_links
set neon_user_id = 999
where profile_id = '00000000-0000-0000-0000-000000019003';
select is(
  (select neon_user_id from public.attendance_identity_links),
  101,
  'a regular member cannot update their own link'
);

delete from public.attendance_identity_links
where profile_id = '00000000-0000-0000-0000-000000019003';
select is(
  (select count(*) from public.attendance_identity_links),
  1::bigint,
  'a regular member cannot delete their own link'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000019002', true);
select is(
  (select count(*) from public.attendance_identity_links),
  2::bigint,
  'a manager reads every link in their organization'
);
select lives_ok(
  $$
    insert into public.attendance_identity_links
      (organization_id, profile_id, neon_user_id, linked_by)
    values
      ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019002', 103, '00000000-0000-0000-0000-000000019002')
  $$,
  'a manager can create a link'
);
select lives_ok(
  $$
    update public.attendance_identity_links
    set neon_user_id = 202
    where organization_id = '00000000-0000-0000-0000-000000019101'
      and profile_id = '00000000-0000-0000-0000-000000019004'
  $$,
  'a manager can update a link'
);
select lives_ok(
  $$
    delete from public.attendance_identity_links
    where organization_id = '00000000-0000-0000-0000-000000019101'
      and profile_id = '00000000-0000-0000-0000-000000019002'
  $$,
  'a manager can delete a link'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000019006', true);
select lives_ok(
  $$
    update public.attendance_identity_links
    set linked_by = '00000000-0000-0000-0000-000000019006'
    where organization_id = '00000000-0000-0000-0000-000000019101'
      and profile_id = '00000000-0000-0000-0000-000000019003'
  $$,
  'an assistant manager can manage attendance links'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000019002', true);
select throws_ok(
  $$
    insert into public.attendance_identity_links
      (organization_id, profile_id, neon_user_id, linked_by)
    values
      ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019002', 101, '00000000-0000-0000-0000-000000019002')
  $$,
  '23505',
  'duplicate key value violates unique constraint "attendance_identity_links_organization_id_neon_user_id_key"',
  'the database rejects two profiles claiming one Neon identity'
);
select throws_ok(
  $$
    insert into public.attendance_identity_links
      (organization_id, profile_id, neon_user_id, linked_by)
    values
      ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-000000019005', 105, '00000000-0000-0000-0000-000000019002')
  $$,
  '23503',
  'insert or update on table "attendance_identity_links" violates foreign key constraint "attendance_identity_links_profile_member_fk"',
  'the database rejects a target profile from another organization'
);

select * from finish();
rollback;
