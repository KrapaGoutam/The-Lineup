begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- V2-005.003 final security corrections. Unlike 0066, every assertion here that
-- is about RLS runs as the real `authenticated` role with a live session.
--
-- Users
--   67001 mgrA     location manager at A, plain staff at B (org role: server)
--   67002 staffA1  staff at A
--   67003 staffB   staff at B only
--   67004 overall  Overall manager, NO tenant membership
--   67005 hist     was staff at A (participated + finalized history), later removed from A
--   67006 mgrB     location manager at B only
--   67007 nobody   profile with no membership and no Overall role
--   67008 mgrC     location manager in a DIFFERENT organization
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000067001', 'tipsf-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000067002', 'tipsf-staffa1@test.invalid'),
 ('00000000-0000-4000-8000-000000067003', 'tipsf-staffb@test.invalid'),
 ('00000000-0000-4000-8000-000000067004', 'tipsf-overall@test.invalid'),
 ('00000000-0000-4000-8000-000000067005', 'tipsf-hist@test.invalid'),
 ('00000000-0000-4000-8000-000000067006', 'tipsf-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000067007', 'tipsf-nobody@test.invalid'),
 ('00000000-0000-4000-8000-000000067008', 'tipsf-mgrc@test.invalid');

insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'tipsf-%@test.invalid';

insert into public.profiles(id, display_name)
select id, replace(split_part(email, '@', 1), 'tipsf-', 'N-') from auth.users where email like 'tipsf-%@test.invalid';

insert into public.organizations(id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000067010', 'Tips Final Org', 'tips-final-org', '00000000-0000-4000-8000-000000067001'),
 ('00000000-0000-4000-8000-000000067020', 'Tips Final Other Org', 'tips-final-other-org', '00000000-0000-4000-8000-000000067008');

insert into public.locations(id, organization_id, name) values
 ('00000000-0000-4000-8000-000000067011', '00000000-0000-4000-8000-000000067010', 'Loc A'),
 ('00000000-0000-4000-8000-000000067012', '00000000-0000-4000-8000-000000067010', 'Loc B'),
 ('00000000-0000-4000-8000-000000067021', '00000000-0000-4000-8000-000000067020', 'Loc C');

insert into public.memberships(organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067001', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067005', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067006', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000067020', '00000000-0000-4000-8000-000000067008', array['server']::public.app_role[]);

insert into public.location_memberships(location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000067011', '00000000-0000-4000-8000-000000067001', 'manager'),
 ('00000000-0000-4000-8000-000000067012', '00000000-0000-4000-8000-000000067001', 'staff'),
 ('00000000-0000-4000-8000-000000067011', '00000000-0000-4000-8000-000000067002', 'staff'),
 ('00000000-0000-4000-8000-000000067012', '00000000-0000-4000-8000-000000067003', 'staff'),
 ('00000000-0000-4000-8000-000000067011', '00000000-0000-4000-8000-000000067005', 'staff'),
 ('00000000-0000-4000-8000-000000067012', '00000000-0000-4000-8000-000000067006', 'manager'),
 ('00000000-0000-4000-8000-000000067021', '00000000-0000-4000-8000-000000067008', 'manager');

insert into public.overall_roles(profile_id, role) values
 ('00000000-0000-4000-8000-000000067004', 'manager');

-- ---------------------------------------------------------------------------
-- Build history at A through the real RPCs: mgrA adds an interval with staffA1
-- and hist, the Overall manager finalizes it. Then hist leaves location A.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067001"}', true);
select lives_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000067010'::uuid,
       '00000000-0000-4000-8000-000000067011'::uuid,
       current_date, now(), now() + interval '2 hours', 10001,
       array['00000000-0000-4000-8000-000000067002'::uuid, '00000000-0000-4000-8000-000000067005'::uuid]) $$,
  'mgrA adds a $100.01 interval for staffA1 + hist at Loc A'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067004"}', true);
select lives_ok(
  $$ select public.tips_finalize_pool(
       '00000000-0000-4000-8000-000000067010'::uuid,
       '00000000-0000-4000-8000-000000067011'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011'::uuid and service_date = current_date)) $$,
  'Overall manager (no membership) finalizes the Loc A pool'
);

reset role;
update public.location_memberships set active = false
 where location_id = '00000000-0000-4000-8000-000000067011'
   and profile_id = '00000000-0000-4000-8000-000000067005';

-- Rows written by other modules / other locations, to prove Tips authority does not reach them.
insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id, reason) values
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011', '00000000-0000-4000-8000-000000067001', 'published', 'schedule_period', 'sp-1', null),
 ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067012', '00000000-0000-4000-8000-000000067006', 'finalized', 'tip_pool', '9999', null);

-- ---------------------------------------------------------------------------
-- Roster: current vs historical, staff privacy, cross-location / cross-org
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067001"}', true);

select is(
  (select eligible from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011')
    where profile_id = '00000000-0000-4000-8000-000000067002'),
  true, 'current Loc A staff is eligible'
);
select is(
  (select eligible from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011')
    where profile_id = '00000000-0000-4000-8000-000000067005'),
  false, 'historical-only participant stays listed but is NOT eligible'
);
select is(
  (select eligible from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011')
    where profile_id = '00000000-0000-4000-8000-000000067004'),
  false, 'Overall finalizer (no membership) stays listed for history but is NOT eligible'
);
select is(
  (select count(*)::int from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011')
    where profile_id in ('00000000-0000-4000-8000-000000067003', '00000000-0000-4000-8000-000000067006')),
  0, 'Loc B-only people are absent from the Loc A roster'
);
select is(
  (select count(*)::int from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067012')),
  1, 'mgrA is only staff at Loc B: Loc B roster is reduced to their own row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067002"}', true);
select results_eq(
  $$ select profile_id from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011') $$,
  $$ values ('00000000-0000-4000-8000-000000067002'::uuid) $$,
  'staff sees only their own roster row (no co-worker names)'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067003"}', true);
select throws_ok(
  $$ select * from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011') $$,
  '42501', null, 'Loc B staff denied the Loc A roster'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067008', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067008"}', true);
select throws_ok(
  $$ select * from public.tips_location_roster('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011') $$,
  '42501', null, 'other-organization manager denied the roster'
);
select throws_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000067010'::uuid, '00000000-0000-4000-8000-000000067011'::uuid,
       current_date + 3, now(), now() + interval '1 hour', 100,
       array['00000000-0000-4000-8000-000000067002'::uuid]) $$,
  '42501', null, 'other-organization manager cannot add intervals (forged ids)'
);

-- ---------------------------------------------------------------------------
-- Staff day data + direct reads
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067002"}', true);
select is(
  (public.tips_get_day_data('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011', current_date)->'audit_log'),
  '[]'::jsonb, 'staff day data carries no audit log'
);
select is(
  (public.tips_get_day_data('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011', current_date)->>'status'),
  'finalized', 'staff day data reports the finalized status'
);
select is((select count(*)::int from public.tip_pools), 0, 'staff cannot read tip_pools directly');
select is((select count(*)::int from public.tip_intervals), 0, 'staff cannot read tip_intervals directly');
select is((select count(*)::int from public.tip_interval_participants), 0, 'staff cannot read participants directly');
select is((select count(*)::int from public.audit_events), 0, 'staff cannot read audit_events directly');
select is(
  (select count(*)::int from public.tip_allocations where profile_id = '00000000-0000-4000-8000-000000067002'),
  1, 'staff reads their own allocation directly (no permission error, RLS helper is definer)'
);
select is(
  (select count(*)::int from public.tip_allocations where profile_id <> '00000000-0000-4000-8000-000000067002'),
  0, 'staff sees no one else''s allocations'
);

-- ---------------------------------------------------------------------------
-- Shared audit_events: Tips authority is limited to tip_pool events at the
-- caller's own managed location. Nothing else becomes writable or readable.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067001"}', true);
select lives_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067001', 'finalized', 'tip_pool', '1') $$,
  'location manager may record a tip_pool audit event at the location they manage'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067001', 'published', 'schedule_period', '1') $$,
  '42501', null, 'location manager cannot fabricate another module''s audit record'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067001', 'purged', 'tip_pool', '1') $$,
  '42501', null, 'tip_pool audit insert is limited to finalized/reopened actions'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067012',
             '00000000-0000-4000-8000-000000067001', 'finalized', 'tip_pool', '1') $$,
  '42501', null, 'manager of A cannot record tip audit at Loc B where they are only staff'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067002', 'finalized', 'tip_pool', '1') $$,
  '42501', null, 'cannot attribute an audit event to someone else'
);
select is(
  (select count(*)::int from public.audit_events where entity_type = 'schedule_period'),
  0, 'location manager cannot read other modules'' audit events'
);
select is(
  (select count(*)::int from public.audit_events where location_id = '00000000-0000-4000-8000-000000067012'),
  0, 'location manager cannot read audit events of a location where they are only staff'
);
select ok(
  (select count(*) from public.audit_events where entity_type = 'tip_pool' and location_id = '00000000-0000-4000-8000-000000067011') >= 1,
  'location manager reads tip_pool audit events at their own location'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067004"}', true);
select lives_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067004', 'reopened', 'tip_pool', '1') $$,
  'Overall manager without a membership keeps real attribution on a tip_pool audit event'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067004', 'published', 'schedule_period', '1') $$,
  '42501', null, 'Overall manager has no blanket audit_events insert for other modules'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067008', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067008"}', true);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067008', 'finalized', 'tip_pool', '1') $$,
  '23503', null, 'other-organization manager cannot write tip audit into this tenant (rejected by the actor trigger)'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067004"}', true);
select is(
  (select count(*)::int from public.audit_events where entity_type = 'schedule_period'),
  0, 'Overall manager has no blanket audit_events read for other modules'
);

-- audit_events actor integrity trigger (replaces the dropped composite FK)
reset role;
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', '00000000-0000-4000-8000-000000067011',
             '00000000-0000-4000-8000-000000067007', 'finalized', 'tip_pool', '1') $$,
  '23503', null, 'actor with no membership and no Overall role is rejected for any module'
);
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', null, '00000000-0000-4000-8000-000000067008', 'x', 'schedule_period', '1') $$,
  '23503', null, 'a member of a different organization cannot be the actor (cross-tenant attribution)'
);
select lives_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000067010', null, null, 'system', 'schedule_period', '1') $$,
  'system events with no actor are still allowed'
);
select ok(
  (select count(*) from public.audit_events where entity_type = 'schedule_period' and actor_profile_id = '00000000-0000-4000-8000-000000067001') = 1,
  'historical audit rows are intact'
);

-- ---------------------------------------------------------------------------
-- Finalized pool: direct authenticated writes cannot change financial records
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Direct participant inserts (what the pre-RPC app does) run the WITH CHECK as the
-- calling role: eligible people succeed, ineligible/historical people are refused.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067001"}', true);
select lives_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000067010'::uuid, '00000000-0000-4000-8000-000000067011'::uuid,
       current_date + 1, now(), now() + interval '1 hour', 900,
       array['00000000-0000-4000-8000-000000067002'::uuid]) $$,
  'draft pool for tomorrow created through the RPC'
);
select lives_ok(
  $$ insert into public.tip_interval_participants(organization_id, tip_interval_id, profile_id)
     values ('00000000-0000-4000-8000-000000067010',
             (select i.id from public.tip_intervals i join public.tip_pools p on p.id = i.tip_pool_id
               where p.location_id = '00000000-0000-4000-8000-000000067011' and p.service_date = current_date + 1),
             '00000000-0000-4000-8000-000000067001') $$,
  'direct participant insert of a current workforce member succeeds for the location manager'
);
select throws_ok(
  $$ insert into public.tip_interval_participants(organization_id, tip_interval_id, profile_id)
     values ('00000000-0000-4000-8000-000000067010',
             (select i.id from public.tip_intervals i join public.tip_pools p on p.id = i.tip_pool_id
               where p.location_id = '00000000-0000-4000-8000-000000067011' and p.service_date = current_date + 1),
             '00000000-0000-4000-8000-000000067005') $$,
  '42501', null, 'direct insert of a historical-only (departed) person is refused'
);
select throws_ok(
  $$ insert into public.tip_interval_participants(organization_id, tip_interval_id, profile_id)
     values ('00000000-0000-4000-8000-000000067010',
             (select i.id from public.tip_intervals i join public.tip_pools p on p.id = i.tip_pool_id
               where p.location_id = '00000000-0000-4000-8000-000000067011' and p.service_date = current_date + 1),
             '00000000-0000-4000-8000-000000067003') $$,
  '42501', null, 'direct insert of a Loc B-only employee into a Loc A interval is refused'
);
-- Independent review fixes: direct pool state changes cannot forge attribution, allocations
-- cannot be written directly, and recalculation does not reveal which pool ids exist.
select throws_ok(
  $$ update public.tip_pools set status = 'finalized', finalized_at = now(),
       finalized_by = '00000000-0000-4000-8000-000000067002'
     where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date + 1 $$,
  '42501', null, 'direct finalize cannot attribute the pool to someone else'
);
select lives_ok(
  $$ update public.tip_pools set status = 'finalized', finalized_at = now(),
       finalized_by = '00000000-0000-4000-8000-000000067001'
     where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date + 1 $$,
  'direct finalize attributed to the caller is still accepted (pre-RPC app compatibility)'
);
select lives_ok(
  $$ update public.tip_pools set status = 'draft', finalized_at = null, finalized_by = null
     where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date + 1 $$,
  'direct reopen still accepted for the pre-RPC app'
);
select throws_ok(
  $$ insert into public.tip_allocations(organization_id, tip_pool_id, profile_id, amount_cents)
     values ('00000000-0000-4000-8000-000000067010',
             (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date + 1),
             '00000000-0000-4000-8000-000000067005', 99999) $$,
  '42501', null, 'managers cannot write allocations directly (no payee can be forged)'
);
create temp table before_pool_probe as
select id as pool_id from public.tip_pools
 where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date + 1;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067008', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067008"}', true);
select throws_ok(
  $$ select public.recalculate_tip_pool((select pool_id from before_pool_probe)) $$,
  'P0002', null, 'other-organization caller gets the same not-found error as for a missing pool'
);
select throws_ok(
  $$ select public.recalculate_tip_pool(-1) $$,
  'P0002', null, 'missing pool returns not-found'
);
select ok(
  pg_get_functiondef('public.tips_finalize_pool(uuid,uuid,bigint)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.tips_reopen_pool(uuid,uuid,bigint,text)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.recalculate_tip_pool(bigint)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.tips_add_interval(uuid,uuid,date,timestamptz,timestamptz,integer,uuid[])'::regprocedure) ~* 'for update',
  'finalize, reopen, add-interval and recalculation lock the pool row (no finalize/edit interleaving)'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067002"}', true);
select ok(
  not has_function_privilege('authenticated', 'private.tips_workforce_eligible(uuid,uuid,uuid)', 'execute'),
  'workforce probe helper stays private (cannot be used to enumerate who works where)'
);
reset role;

create temp table before_state as
select
  (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date) as pool_id,
  (select sum(amount_cents) from public.tip_intervals) as interval_cents,
  (select count(*) from public.tip_intervals) as intervals,
  (select count(*) from public.tip_interval_participants) as participants,
  (select sum(amount_cents) from public.tip_allocations) as allocation_cents,
  (select count(*) from public.tip_allocations) as allocations;
grant select on before_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067001"}', true);

select throws_ok(
  $$ insert into public.tip_intervals(organization_id, tip_pool_id, starts_at, ends_at, amount_cents)
     values ('00000000-0000-4000-8000-000000067010',
             (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date),
             now(), now() + interval '1 hour', 500) $$,
  '42501', null, 'manager cannot insert an interval into a finalized pool'
);
select lives_ok(
  $$ update public.tip_intervals set amount_cents = 1 where tip_pool_id = (select pool_id from before_state) $$, 'direct interval update is a no-op on finalized pools');
select lives_ok($$ delete from public.tip_intervals where tip_pool_id = (select pool_id from before_state) $$, 'direct interval delete is a no-op on finalized pools');
select throws_ok(
  $$ insert into public.tip_interval_participants(organization_id, tip_interval_id, profile_id)
     values ('00000000-0000-4000-8000-000000067010', (select id from public.tip_intervals limit 1), '00000000-0000-4000-8000-000000067002') $$,
  '42501', null, 'manager cannot add a participant to a finalized interval'
);
select lives_ok($$ delete from public.tip_interval_participants where tip_interval_id in (select id from public.tip_intervals where tip_pool_id = (select pool_id from before_state)) $$, 'direct participant delete is a no-op on finalized pools');
select throws_ok(
  $$ insert into public.tip_allocations(organization_id, tip_pool_id, profile_id, amount_cents)
     values ('00000000-0000-4000-8000-000000067010',
             (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date),
             '00000000-0000-4000-8000-000000067002', 999999) $$,
  '42501', null, 'manager cannot insert an allocation into a finalized pool'
);
select lives_ok($$ update public.tip_allocations set amount_cents = 1 where tip_pool_id = (select pool_id from before_state) $$, 'direct allocation update is a no-op on finalized pools');
select lives_ok($$ delete from public.tip_allocations where tip_pool_id = (select pool_id from before_state) $$, 'direct allocation delete is a no-op on finalized pools');
select throws_ok(
  $$ select public.tips_add_interval(
       '00000000-0000-4000-8000-000000067010'::uuid, '00000000-0000-4000-8000-000000067011'::uuid,
       current_date, now(), now() + interval '1 hour', 700,
       array['00000000-0000-4000-8000-000000067002'::uuid]) $$,
  '22023', null, 'RPC refuses to add an interval to a finalized pool'
);
select throws_ok(
  $$ select public.recalculate_tip_pool((select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date)) $$,
  'P0002', null, 'recalculation refuses a finalized pool'
);

-- Forged ids against RPCs: a pool belongs to its own location only
select throws_ok(
  $$ select public.tips_finalize_pool('00000000-0000-4000-8000-000000067010'::uuid, '00000000-0000-4000-8000-000000067012'::uuid,
       (select id from public.tip_pools where location_id = '00000000-0000-4000-8000-000000067011' and service_date = current_date)) $$,
  '42501', null, 'mgrA (staff at B) cannot finalize via Loc B'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000067006', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000067006"}', true);
select throws_ok(
  $$ select public.tips_reopen_pool('00000000-0000-4000-8000-000000067010'::uuid, '00000000-0000-4000-8000-000000067012'::uuid,
       (select pool_id from before_state), 'forged location') $$,
  'P0002', null, 'manager of B cannot reopen Loc A''s pool by claiming Loc B'
);

reset role;
select is(
  (select row(interval_cents, intervals, participants, allocation_cents, allocations)::text from before_state),
  (select row(
     (select sum(amount_cents) from public.tip_intervals),
     (select count(*) from public.tip_intervals),
     (select count(*) from public.tip_interval_participants),
     (select sum(amount_cents) from public.tip_allocations),
     (select count(*) from public.tip_allocations))::text),
  'finalized financial records are byte-for-byte unchanged after all direct write attempts'
);

select * from finish();
rollback;
