begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Synthetic past periods do not strand future work or block archival.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000060001', 'owner60@test.internal'),
  ('00000000-0000-0000-0000-000000060002', 'staff60@test.internal'),
  ('00000000-0000-0000-0000-000000060003', 'foreign60@test.internal');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000060001', 'Owner60'),
  ('00000000-0000-0000-0000-000000060002', 'Staff60'),
  ('00000000-0000-0000-0000-000000060003', 'Foreign60');
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-0000-0000-0000000600a1', 'Publication60', 'publication-60', '00000000-0000-0000-0000-000000060001'),
  ('00000000-0000-0000-0000-0000000600a2', 'Foreign60', 'publication-foreign-60', '00000000-0000-0000-0000-000000060003');
insert into public.memberships (organization_id, profile_id, roles) values
  ('00000000-0000-0000-0000-0000000600a1', '00000000-0000-0000-0000-000000060001', array['owner']::public.app_role[]),
  ('00000000-0000-0000-0000-0000000600a1', '00000000-0000-0000-0000-000000060002', array['server']::public.app_role[]),
  ('00000000-0000-0000-0000-0000000600a2', '00000000-0000-0000-0000-000000060003', array['owner']::public.app_role[]);
insert into public.locations (id, organization_id, name, time_zone)
select ('00000000-0000-0000-0000-0000000600b' || n)::uuid,
  '00000000-0000-0000-0000-0000000600a1', 'Location60-' || n, 'America/Chicago'
from generate_series(1,3) n;
insert into public.schedule_periods (id, organization_id, location_id, starts_on, ends_on)
overriding system value
select 600000 + n, '00000000-0000-0000-0000-0000000600a1',
  ('00000000-0000-0000-0000-0000000600b' || n)::uuid, '2020-01-01', '2020-01-07'
from generate_series(1,3) n;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060001', true);
select lives_ok($$update public.schedule_periods set status='published', published_version=1, published_at=now() where id=600001$$,
  'ACTIVE location publishes a valid draft through authenticated UPDATE');
select is((select status::text from public.schedule_periods where id=600001), 'published', 'publication persisted');
select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000600b2', 'deactivate', 'Synthetic closure', 'active');
select throws_ok($$update public.schedule_periods set status='published', published_version=1, published_at=now() where id=600002$$,
  '55000', null, 'INACTIVE location rejects direct publication');
select is((select status::text || '/' || published_version || '/' || (published_at is null)::text from public.schedule_periods where id=600002),
  'draft/0/true', 'failed publication leaves all publication fields unchanged');
select lives_ok($$update public.schedule_periods set ends_on='2020-01-08' where id=600002$$,
  'historical draft corrections remain allowed while inactive');
select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000600b2', 'archive', 'Synthetic archive', 'inactive');
select throws_ok($$update public.schedule_periods set status='published', published_version=1 where id=600002$$,
  '55000', null, 'ARCHIVED location rejects direct publication');
select is((select status::text from public.schedule_periods where id=600002), 'draft', 'archived failed publication retains draft');
select lives_ok($$update public.schedule_periods set status='archived' where id=600002$$,
  'closing historical schedule remains allowed');
select throws_ok($$update public.schedule_periods set status='published' where id=600002$$,
  '55000', null, 'restoring an archived period cannot bypass activation guard');
select lives_ok($$update public.schedule_periods set status='published' where id=600003$$,
  'sibling ACTIVE location remains publishable');
select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000600b1', 'deactivate', 'Synthetic history check', 'active');
select lives_ok($$update public.schedule_periods set published_by='00000000-0000-0000-0000-000000060001' where id=600001$$,
  'correction to already-published history remains allowed');
select lives_ok($$update public.schedule_periods set status='archived' where id=600001$$,
  'finalizing published history remains allowed');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060002', true);
select is_empty($$update public.schedule_periods set status='published' where id=600001 returning id$$,
  'ordinary staff cannot update schedule through RLS');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060003', true);
select is_empty($$update public.schedule_periods set status='published' where id=600001 returning id$$,
  'cross-organization owner cannot update schedule through RLS');
reset role;
select is((select status::text from public.schedule_periods where id=600001), 'archived', 'unauthorized attempts changed nothing');
select throws_ok($$update public.schedule_periods set status='published' where id=600001$$,
  '55000', null, 'privileged direct SQL also cannot bypass lifecycle guard');
select is((select count(*)::int from public.schedule_periods where id between 600001 and 600003), 3,
  'all historical schedule rows preserved');
set local role anon;
select throws_ok($$update public.schedule_periods set status='published' where id=600001$$,
  '42501', null, 'anonymous publication denied');
reset role;
select * from finish();
rollback;
