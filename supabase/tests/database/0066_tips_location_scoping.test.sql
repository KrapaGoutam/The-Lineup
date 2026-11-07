begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Fixture identities
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000066001', 'tips-mgr-a@test.invalid'),
 ('00000000-0000-4000-8000-000000066002', 'tips-staff-a@test.invalid'),
 ('00000000-0000-4000-8000-000000066003', 'tips-staff-b@test.invalid'),
 ('00000000-0000-4000-8000-000000066004', 'tips-overall-mgr@test.invalid'),
 ('00000000-0000-4000-8000-000000066005', 'tips-staff-multi@test.invalid');

insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'tips-%@test.invalid';

insert into public.profiles(id, display_name)
select id, email from auth.users where email like 'tips-%@test.invalid';

insert into public.organizations(id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000066010', 'Tips Test Org', 'tips-test-org', '00000000-0000-4000-8000-000000066001');

insert into public.locations(id, organization_id, name) values
 ('00000000-0000-4000-8000-000000066011', '00000000-0000-4000-8000-000000066010', 'Loc A'),
 ('00000000-0000-4000-8000-000000066012', '00000000-0000-4000-8000-000000066010', 'Loc B');

insert into public.memberships(organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066001', array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066005', array['server']::public.app_role[]);

insert into public.location_memberships(location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000066011', '00000000-0000-4000-8000-000000066001', 'manager'),
 ('00000000-0000-4000-8000-000000066012', '00000000-0000-4000-8000-000000066001', 'staff'),
 ('00000000-0000-4000-8000-000000066011', '00000000-0000-4000-8000-000000066002', 'staff'),
 ('00000000-0000-4000-8000-000000066012', '00000000-0000-4000-8000-000000066003', 'staff'),
 ('00000000-0000-4000-8000-000000066011', '00000000-0000-4000-8000-000000066005', 'staff'),
 ('00000000-0000-4000-8000-000000066012', '00000000-0000-4000-8000-000000066005', 'staff');

insert into public.overall_roles(profile_id, role) values
 ('00000000-0000-4000-8000-000000066004', 'manager');

-- 1. Security privileges
select ok(not has_function_privilege('anon', 'public.tips_location_roster(uuid,uuid)', 'execute'), 'anon tips_location_roster denied');
select ok(has_function_privilege('authenticated', 'public.tips_location_roster(uuid,uuid)', 'execute'), 'authenticated tips_location_roster granted');
select ok(not has_function_privilege('anon', 'public.tips_location_authorized(uuid,uuid)', 'execute'), 'anon tips_location_authorized denied');
select ok(has_function_privilege('authenticated', 'public.tips_location_authorized(uuid,uuid)', 'execute'), 'authenticated tips_location_authorized granted');
select ok(not has_function_privilege('anon', 'public.tips_add_interval(uuid,uuid,date,timestamptz,timestamptz,integer,uuid[])', 'execute'), 'anon tips_add_interval denied');
select ok(has_function_privilege('authenticated', 'public.tips_add_interval(uuid,uuid,date,timestamptz,timestamptz,integer,uuid[])', 'execute'), 'authenticated tips_add_interval granted');
select ok(not has_function_privilege('anon', 'public.tips_finalize_pool(uuid,uuid,bigint)', 'execute'), 'anon tips_finalize_pool denied');
select ok(has_function_privilege('authenticated', 'public.tips_finalize_pool(uuid,uuid,bigint)', 'execute'), 'authenticated tips_finalize_pool granted');
select ok(not has_function_privilege('anon', 'public.tips_reopen_pool(uuid,uuid,bigint,text)', 'execute'), 'anon tips_reopen_pool denied');
select ok(has_function_privilege('authenticated', 'public.tips_reopen_pool(uuid,uuid,bigint,text)', 'execute'), 'authenticated tips_reopen_pool granted');
select ok(not has_function_privilege('anon', 'public.tips_get_day_data(uuid,uuid,date)', 'execute'), 'anon tips_get_day_data denied');
select ok(has_function_privilege('authenticated', 'public.tips_get_day_data(uuid,uuid,date)', 'execute'), 'authenticated tips_get_day_data granted');

-- 2. Private helper privileges
select ok(not has_function_privilege('authenticated', 'private.tips_profile_level(uuid,uuid,uuid)', 'execute'), 'tips_profile_level private');
select ok(not has_function_privilege('authenticated', 'private.tips_workforce_eligible(uuid,uuid,uuid)', 'execute'), 'tips_workforce_eligible private');
select ok(not has_function_privilege('authenticated', 'private.tips_live_session()', 'execute'), 'tips_live_session private');
select ok(not has_function_privilege('authenticated', 'private.tips_can_access_location(uuid,uuid)', 'execute'), 'tips_can_access_location private');

-- 3. Schema constraints
select ok(exists(select 1 from pg_constraint where conname='tip_pools_finalized_by_profile_fk' and convalidated), 'tip_pools finalized_by profile FK exists');
select ok(not exists(select 1 from pg_constraint where conname='audit_events_actor_member_fk'), 'audit_events membership FK retired');

-- 4. Search path hygiene
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and p.proname in ('tips_profile_level','tips_workforce_eligible','tips_live_session','tips_can_access_location','tips_is_manager','tips_location_authorized','tips_location_roster','tips_add_interval','tips_finalize_pool','tips_reopen_pool','tips_get_day_data','recalculate_tip_pool')
  and (not p.prosecdef or not ('search_path=""'=any(p.proconfig)))
), 'all tips procedures have fixed empty search path');

-- 5. Location role evaluation
-- Manager at A
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066001"}', true);
select ok(private.tips_can_access_location('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Manager can access Loc A');
select ok(private.tips_is_manager('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Manager is manager at Loc A');
select ok(not private.tips_is_manager('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066012'), 'Loc A manager is only Staff at Loc B');

-- Staff at A
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066002"}', true);
select ok(private.tips_can_access_location('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Staff A can access Loc A');
select ok(not private.tips_is_manager('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Staff A is not manager at Loc A');
select ok(not private.tips_can_access_location('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066012'), 'Staff A cannot access Loc B');

-- Multi-location employee
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066005', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066005"}', true);
select ok(private.tips_can_access_location('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Multi staff can access Loc A');
select ok(private.tips_can_access_location('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066012'), 'Multi staff can access Loc B');

-- Overall Manager
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066004"}', true);
select ok(private.tips_is_manager('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066011'), 'Overall manager is manager at Loc A');
select ok(private.tips_is_manager('00000000-0000-4000-8000-000000066010', '00000000-0000-4000-8000-000000066012'), 'Overall manager is manager at Loc B');

-- 6. Operational lifecycle & mutations
-- Loc A Manager adds interval at Loc A with valid workforce participants
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066001"}', true);

select lives_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       current_date,
       now(),
       now() + interval '2 hours',
       10000,
       array['00000000-0000-4000-8000-000000066002'::uuid, '00000000-0000-4000-8000-000000066005'::uuid]
     ) $$,
  'Manager can add tip interval with Loc A workforce'
);

-- Attempting to add Loc B staff (66003) to Loc A interval must FAIL
select throws_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       current_date,
       now() + interval '3 hours',
       now() + interval '5 hours',
       5000,
       array['00000000-0000-4000-8000-000000066003'::uuid]
     ) $$,
  '42501',
  null,
  'Ineligible Loc B employee rejected from Loc A tip interval'
);

-- Verify recalculation split: $100.00 split 2 ways = $50.00 each
select is(
  (select amount_cents from public.tip_allocations
   where profile_id = '00000000-0000-4000-8000-000000066002'
     and organization_id = '00000000-0000-4000-8000-000000066010'),
  5000,
  'Allocation split for participant 1 is exact'
);
select is(
  (select amount_cents from public.tip_allocations
   where profile_id = '00000000-0000-4000-8000-000000066005'
     and organization_id = '00000000-0000-4000-8000-000000066010'),
  5000,
  'Allocation split for participant 2 is exact'
);

-- Staff at Loc A cannot finalize
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066002"}', true);
select throws_ok(
  $$ select public.tips_finalize_pool(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid)
     ) $$,
  '42501',
  null,
  'Staff cannot finalize tip pool'
);

-- Overall Manager can finalize without membership
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066004"}', true);
select lives_ok(
  $$ select public.tips_finalize_pool(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid)
     ) $$,
  'Overall Manager can finalize Loc A pool'
);

-- Pool is finalized and audit event recorded with overall actor
select is(
  (select status::text from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid),
  'finalized',
  'Tip pool status is finalized'
);
select is(
  (select finalized_by from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid),
  '00000000-0000-4000-8000-000000066004'::uuid,
  'Finalized by Overall Manager profile id'
);

-- Manager reopens with reason
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066001"}', true);
select throws_ok(
  $$ select public.tips_reopen_pool(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid),
       'no'
     ) $$,
  '22023',
  null,
  'Short reason rejected on reopen'
);

select lives_ok(
  $$ select public.tips_reopen_pool(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid),
       'Late cash tip added'
     ) $$,
  'Reopened with valid reason'
);
select is(
  (select status::text from public.tip_pools where location_id = '00000000-0000-4000-8000-000000066011'::uuid),
  'draft',
  'Tip pool status returned to draft'
);

-- Staff gets only own interval in day data
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066002"}', true);
select is(
  jsonb_array_length((public.tips_get_day_data(
    '00000000-0000-4000-8000-000000066010'::uuid,
    '00000000-0000-4000-8000-000000066011'::uuid,
    current_date
  )->>'intervals')::jsonb),
  1,
  'Staff A sees 1 interval where they participated'
);

-- Staff at Loc B (66003) has 0 intervals in Loc A day data (and cannot access Loc A)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000066003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000066003"}', true);
select throws_ok(
  $$ select public.tips_get_day_data(
       '00000000-0000-4000-8000-000000066010'::uuid,
       '00000000-0000-4000-8000-000000066011'::uuid,
       current_date
     ) $$,
  '42501',
  null,
  'Staff B denied Loc A day data'
);

select * from finish();
rollback;
