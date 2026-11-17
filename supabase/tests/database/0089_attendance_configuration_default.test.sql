begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select col_default_is('public', 'locations', 'attendance_mode',
  'internal_the_lineup'::public.attendance_mode,
  'new locations receive the persisted Internal default');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-000000089001', 'owner89@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000089002', 'staff89@test.internal', 'hash', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000089001', 'Owner 89'),
  ('00000000-0000-0000-0000-000000089002', 'Staff 89');
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-0000-0000-0000000890a1', 'First 89', 'first-89', '00000000-0000-0000-0000-000000089001'),
  ('00000000-0000-0000-0000-0000000890a2', 'Second 89', 'second-89', '00000000-0000-0000-0000-000000089001');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000890a1', '00000000-0000-0000-0000-000000089001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000890a1', '00000000-0000-0000-0000-000000089002', array['server']::public.app_role[], true);

-- Model three pre-existing configurations explicitly; the migration has no UPDATE.
insert into public.locations (id, organization_id, name, time_zone, attendance_mode) values
  ('00000000-0000-0000-0000-0000000890b1', '00000000-0000-0000-0000-0000000890a1', 'Legacy 89', 'UTC', null),
  ('00000000-0000-0000-0000-0000000890b2', '00000000-0000-0000-0000-0000000890a1', 'External 89', 'UTC', 'external'),
  ('00000000-0000-0000-0000-0000000890b3', '00000000-0000-0000-0000-0000000890a1', 'Disabled 89', 'UTC', 'disabled');

select ok((select attendance_mode is null from public.locations where id = '00000000-0000-0000-0000-0000000890b1'), 'explicit legacy NULL remains NULL');
select is((select attendance_mode from public.locations where id = '00000000-0000-0000-0000-0000000890b2'), 'external'::public.attendance_mode, 'explicit External remains External');
select is((select attendance_mode from public.locations where id = '00000000-0000-0000-0000-0000000890b3'), 'disabled'::public.attendance_mode, 'explicit Disabled remains Disabled');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000089002', true);
select throws_ok($$ select public.provision_location('00000000-0000-0000-0000-0000000890a1', 'Staff denied 89') $$,
  '42501', 'Unauthorized: location provisioning requires management authority', 'staff cannot provision');
select throws_ok($$ select public.provision_location('00000000-0000-0000-0000-0000000890a2', 'Cross tenant denied 89') $$,
  '42501', 'Unauthorized: location provisioning requires management authority', 'cross-tenant staff cannot provision');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000089001', true);
select lives_ok($$ select public.provision_location('00000000-0000-0000-0000-0000000890a1', 'New branch 89') $$,
  'authorized branch creation succeeds');
select is((select attendance_mode from public.locations where name = 'New branch 89'),
  'internal_the_lineup'::public.attendance_mode, 'authorized new branch persists Internal');
select is((select organization_id from public.locations where name = 'New branch 89'),
  '00000000-0000-0000-0000-0000000890a1'::uuid, 'new branch remains in target tenant');
select is((select count(*)::int from public.location_module_configs c join public.locations l on l.id = c.location_id where l.name = 'New branch 89'),
  0, 'provisioning enables no modules');
select is((select count(*)::int from public.kiosk_devices k join public.locations l on l.id = k.location_id where l.name = 'New branch 89'),
  0, 'provisioning registers no kiosk');
select is((select count(*)::int from public.attendance_sessions s join public.locations l on l.id = s.location_id where l.name = 'New branch 89'),
  0, 'provisioning starts no attendance session');

select * from finish();
rollback;
