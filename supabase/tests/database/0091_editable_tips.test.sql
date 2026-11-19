begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

-- Fixture ---------------------------------------------------------------------------------
-- M manager@A, AM assistant@A, S1..S3 staff@A, OLD staff@A (leaves later), SB staff@B, X nobody.
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000091001', 'et-mgr@test.invalid'),
 ('00000000-0000-4000-8000-000000091002', 'et-am@test.invalid'),
 ('00000000-0000-4000-8000-000000091003', 'et-s1@test.invalid'),
 ('00000000-0000-4000-8000-000000091004', 'et-s2@test.invalid'),
 ('00000000-0000-4000-8000-000000091005', 'et-s3@test.invalid'),
 ('00000000-0000-4000-8000-000000091006', 'et-sb@test.invalid'),
 ('00000000-0000-4000-8000-000000091007', 'et-x@test.invalid'),
 ('00000000-0000-4000-8000-000000091008', 'et-old@test.invalid');
insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'et-%@test.invalid';
insert into public.profiles(id, display_name)
select id, email from auth.users where email like 'et-%@test.invalid';
insert into public.organizations(id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000091010', 'Editable Tips Org', 'editable-tips-org', '00000000-0000-4000-8000-000000091001');
insert into public.locations(id, organization_id, name, time_zone) values
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091010', 'Loc A', 'America/Chicago'),
 ('00000000-0000-4000-8000-000000091012', '00000000-0000-4000-8000-000000091010', 'Loc B', 'America/Chicago');
insert into public.memberships(organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091001', array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091002', array['shift_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091004', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091005', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091006', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091008', array['server']::public.app_role[]);
insert into public.location_memberships(location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091001', 'manager'),
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091002', 'assistant_manager'),
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091003', 'staff'),
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091004', 'staff'),
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091005', 'staff'),
 ('00000000-0000-4000-8000-000000091011', '00000000-0000-4000-8000-000000091008', 'staff'),
 ('00000000-0000-4000-8000-000000091012', '00000000-0000-4000-8000-000000091006', 'staff');

create temp table ids(k text primary key, v bigint);
grant all on ids to public;
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claims', json_build_object('session_id', u::text)::text, true);
$$;
create function pg_temp.save(
  p_interval bigint, p_rev integer, p_start text, p_end text, p_cash integer, p_card integer,
  p_people uuid[], p_reason text, p_date date default '2026-03-10', p_loc uuid default '00000000-0000-4000-8000-000000091011'
) returns jsonb language sql as $$
  select public.tips_save_interval('00000000-0000-4000-8000-000000091010', p_loc, p_date,
    p_start::timestamptz, p_end::timestamptz, p_cash, p_card, p_people, p_interval, p_rev, p_reason);
$$;

-- 1. Privileges ------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.tips_save_interval(uuid,uuid,date,timestamptz,timestamptz,integer,integer,uuid[],bigint,integer,text)', 'execute')
      and not has_function_privilege('anon', 'public.tips_void_interval(uuid,uuid,bigint,integer,text)', 'execute')
      and not has_function_privilege('anon', 'public.tips_recalculate_pool(uuid,uuid,bigint)', 'execute')
      and not has_function_privilege('anon', 'public.tips_get_range(uuid,uuid,date,date,boolean)', 'execute'), 'anon cannot execute any new Tips RPC');
select ok(has_function_privilege('authenticated', 'public.tips_save_interval(uuid,uuid,date,timestamptz,timestamptz,integer,integer,uuid[],bigint,integer,text)', 'execute')
      and has_function_privilege('authenticated', 'public.tips_void_interval(uuid,uuid,bigint,integer,text)', 'execute')
      and has_function_privilege('authenticated', 'public.tips_recalculate_pool(uuid,uuid,bigint)', 'execute')
      and has_function_privilege('authenticated', 'public.tips_get_range(uuid,uuid,date,date,boolean)', 'execute'), 'authenticated can execute the new Tips RPCs');
select ok(has_table_privilege('authenticated', 'public.tip_revisions', 'select')
      and not has_table_privilege('authenticated', 'public.tip_revisions', 'insert')
      and not has_table_privilege('authenticated', 'public.tip_revisions', 'update')
      and not has_table_privilege('authenticated', 'public.tip_revisions', 'delete')
      and not has_table_privilege('anon', 'public.tip_revisions', 'select'), 'tip_revisions is read-only for authenticated and invisible to anon');
select ok(not has_function_privilege('authenticated', 'private.tips_interval_shares(bigint)', 'execute')
      and not has_function_privilege('authenticated', 'private.tips_capture_direct_write()', 'execute'), 'allocation + audit helpers are private');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.proname in ('tips_save_interval','tips_void_interval','tips_recalculate_pool','tips_get_range','tips_interval_shares','tips_interval_snapshot','tips_distribution_snapshot','tips_capture_direct_write')
    and (not p.prosecdef or not ('search_path=""' = any(p.proconfig)))
), 'every new function is SECURITY DEFINER with a fixed empty search_path');

-- 2. Create: cash + card reconcile exactly ----------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select lives_ok($$ insert into ids select 'i1', (pg_temp.save(null, null, '2026-03-10T12:00:00-05:00', '2026-03-10T14:00:00-05:00', 1001, 500,
  array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004','00000000-0000-4000-8000-000000091005']::uuid[], null) ->> 'interval_id')::bigint $$,
  'manager saves a cash + card interval');
select is((select sum(cash_cents)::int from public.tip_allocations), 1001, 'allocations sum to the original CASH total');
select is((select sum(card_cents)::int from public.tip_allocations), 500, 'allocations sum to the original CARD total');
select is((select sum(amount_cents)::int from public.tip_allocations), 1501, 'allocations sum to the combined total (no penny lost or duplicated)');
select is((select array_agg(amount_cents order by profile_id) from public.tip_allocations), array[501,500,500], 'total split is the legacy split (remainder to the first rank)');
select is((select array_agg(cash_cents order by profile_id) from public.tip_allocations), array[334,334,333], 'cash remainder is deterministic');
select is((select array_agg(card_cents order by profile_id) from public.tip_allocations), array[167,166,167], 'card is each person''s total minus cash (never negative)');
select is((select count(*)::int from public.tip_revisions where tip_interval_id = (select v from ids where k = 'i1')), 1, 'creating writes exactly one revision (RPC path is not double-recorded by the trigger)');
select is((select action || ':' || source || ':' || editor_profile_id::text from public.tip_revisions where tip_interval_id = (select v from ids where k = 'i1')),
  'interval_created:rpc:00000000-0000-4000-8000-000000091001', 'revision records action, source and editor');

-- 3. Fairness of the tender split for a tiny interval -------------------------------------------
select lives_ok($$ insert into ids select 'i2', (pg_temp.save(null, null, '2026-03-10T14:00:00-05:00', '2026-03-10T15:00:00-05:00', 1, 1,
  array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004']::uuid[], null) ->> 'interval_id')::bigint $$, 'tiny 1c cash + 1c card interval saves');
select is((select array_agg(cash_cents order by share_rank) from private.tips_interval_shares((select v from ids where k='i2'))), array[1,0], '1c cash goes to rank 1');
select is((select array_agg(card_cents order by share_rank) from private.tips_interval_shares((select v from ids where k='i2'))), array[0,1], '1c card goes to rank 2 so both people receive 1c in total');

-- 4. Validation ----------------------------------------------------------------------------------
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 0, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22003', null, 'zero total rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', -1, 5, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22003', null, 'negative cash rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 10000001, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22003', null, 'absurd amount rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T17:00:00-05:00', '2026-03-10T16:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22023', null, 'end before start rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T10:00:00-05:00', '2026-03-11T12:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22023', null, 'more than 25 hours rejected (a fall-back day really has 25)');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-11T01:00:00-05:00', '2026-03-11T02:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22023', null, 'interval starting on another local date than the service date rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 100, 0, array[]::uuid[], null) $$, '22023', null, 'no participants rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T13:00:00-05:00', '2026-03-10T14:30:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '22023', 'Tip intervals cannot overlap.', 'overlapping interval rejected by the database');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091007']::uuid[], null) $$, '42501', null, 'participant without workforce status at the location rejected');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091006']::uuid[], null) $$, '42501', null, 'participant who works only at another location rejected');

-- 5. Update: reason, concurrency, before/after, participant removal ----------------------------------
select throws_ok($$ select pg_temp.save((select v from ids where k='i1'), 1, '2026-03-10T12:00:00-05:00', '2026-03-10T14:00:00-05:00', 1200, 300, array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004']::uuid[], '') $$, '22023', null, 'an update without a reason is rejected');
select lives_ok($$ select pg_temp.save((select v from ids where k='i1'), 1, '2026-03-10T12:00:00-05:00', '2026-03-10T14:00:00-05:00', 1200, 300,
  array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004']::uuid[], 'Counted again') $$, 'manager updates amounts and removes a participant with a reason');
select throws_ok($$ select pg_temp.save((select v from ids where k='i1'), 1, '2026-03-10T12:00:00-05:00', '2026-03-10T14:00:00-05:00', 1, 1, array['00000000-0000-4000-8000-000000091003']::uuid[], 'stale tab') $$, 'P0409', null, 'a stale revision cannot overwrite a newer save');
select is((select revision from public.tip_intervals where id = (select v from ids where k='i1')), 2, 'revision token advanced exactly once');
select is((select sum(amount_cents)::int from public.tip_allocations), 1502, 'distribution recalculated: 1500 + 2');
select is((select (before_state -> 'interval' ->> 'cash_cents') || '>' || (after_state -> 'interval' ->> 'cash_cents') || ':' || reason
           from public.tip_revisions where action = 'interval_updated' and tip_interval_id = (select v from ids where k='i1')),
  '1001>1200:Counted again', 'revision keeps previous value, updated value and the reason');
select ok((select '00000000-0000-4000-8000-000000091005' = any (affected_profile_ids::text[]) from public.tip_revisions where action = 'interval_updated' and tip_interval_id = (select v from ids where k='i1')),
  'the removed employee is recorded as affected');
select is((select jsonb_array_length(before_state -> 'distribution') || '/' || jsonb_array_length(after_state -> 'distribution')
           from public.tip_revisions where action = 'interval_updated' and tip_interval_id = (select v from ids where k='i1')), '3/2', 'before and after distributions are both stored');
select is((select count(*)::int from public.tip_allocations where profile_id = '00000000-0000-4000-8000-000000091005'), 0, 'removed employee no longer holds an allocation');

-- 6. Cross-midnight + DST ------------------------------------------------------------------------
select lives_ok($$ insert into ids select 'i3', (pg_temp.save(null, null, '2026-03-10T23:00:00-05:00', '2026-03-11T01:00:00-05:00', 0, 1000,
  array['00000000-0000-4000-8000-000000091004','00000000-0000-4000-8000-000000091005']::uuid[], null) ->> 'interval_id')::bigint $$, 'a cross-midnight interval starting on the service date saves');
select lives_ok($$ select pg_temp.save(null, null, '2026-03-08T01:00:00-06:00', '2026-03-08T04:00:00-05:00', 600, 0,
  array['00000000-0000-4000-8000-000000091003']::uuid[], null, '2026-03-08') $$, 'spring-forward day: 1:00 CST to 4:00 CDT (real duration 2h) saves');
select lives_ok($$ select pg_temp.save(null, null, '2026-11-01T01:30:00-05:00', '2026-11-01T01:30:00-06:00', 0, 400,
  array['00000000-0000-4000-8000-000000091003']::uuid[], null, '2026-11-01') $$, 'fall-back day: the repeated 1:30 hour (real duration 1h) saves');

-- 7. Void is an audited soft delete ----------------------------------------------------------------
select throws_ok($$ select public.tips_void_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',(select v from ids where k='i3'),1,'') $$, '22023', null, 'void needs a reason');
select lives_ok($$ select public.tips_void_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',(select v from ids where k='i3'),1,'Entered on the wrong day') $$, 'manager voids an incorrect interval with a reason');
select throws_ok($$ select public.tips_void_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',(select v from ids where k='i3'),2,'again') $$, '22023', null, 'an already voided interval cannot be voided twice');
select is((select count(*)::int from public.tip_intervals where id = (select v from ids where k='i3')), 1, 'the voided interval row is preserved (no destructive delete)');
select is((select count(*)::int from public.tip_interval_participants where tip_interval_id = (select v from ids where k='i3')), 2, 'its participant snapshot is preserved');
select is((select sum(amount_cents)::int from public.tip_allocations a join public.tip_pools p on p.id = a.tip_pool_id where p.service_date = '2026-03-10'), 1502, 'a voided interval no longer counts in the distribution');
select is((select action || ':' || (after_state -> 'interval' ->> 'void_reason') from public.tip_revisions where tip_interval_id = (select v from ids where k='i3') and action = 'interval_voided'),
  'interval_voided:Entered on the wrong day', 'void is audited with its reason');
select throws_ok($$ select pg_temp.save((select v from ids where k='i3'), 2, '2026-03-10T23:00:00-05:00', '2026-03-11T01:00:00-05:00', 0, 5, array['00000000-0000-4000-8000-000000091004']::uuid[], 'edit voided') $$, '22023', null, 'a voided interval cannot be edited');

-- 8. A person who left keeps their place; cannot be newly added -------------------------------------
select lives_ok($$ select pg_temp.save((select v from ids where k='i2'), 1, '2026-03-10T14:00:00-05:00', '2026-03-10T15:00:00-05:00', 1, 1,
  array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004','00000000-0000-4000-8000-000000091008']::uuid[], 'Added OLD') $$, 'current workforce member added on update');
reset role;
update public.location_memberships set active = false where profile_id = '00000000-0000-4000-8000-000000091008';
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select lives_ok($$ select pg_temp.save((select v from ids where k='i2'), 2, '2026-03-10T14:00:00-05:00', '2026-03-10T15:00:00-05:00', 2, 4,
  array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004','00000000-0000-4000-8000-000000091008']::uuid[], 'Fix amounts') $$,
  'a participant who has since left stays on the interval (snapshot preserved)');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T18:00:00-05:00', '2026-03-10T19:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091008']::uuid[], null) $$, '42501', null, 'but they cannot be newly added');

-- 9. Explicit recalculation is idempotent and never consults attendance -------------------------------
select is((public.tips_recalculate_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',
  (select tip_pool_id from public.tip_intervals where id = (select v from ids where k='i1'))) ->> 'changed')::boolean, false, 'recalculating an up-to-date day changes nothing');
reset role;
delete from public.tip_allocations where tip_pool_id = (select tip_pool_id from public.tip_intervals where id = (select v from ids where k='i1'));
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select is((public.tips_recalculate_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',
  (select tip_pool_id from public.tip_intervals where id = (select v from ids where k='i1'))) ->> 'changed')::boolean, true, 'recalculation repairs a stale distribution');
select is((select count(*)::int from public.tip_revisions where action = 'pool_recalculated'), 1, 'and records that repair');

-- 10. Reads: manager vs staff -------------------------------------------------------------------------
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools'), 1, 'manager reads the day');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools' -> 0 -> 'intervals'), 3, 'manager sees voided intervals too (flagged)');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools' -> 0 -> 'revisions'), 0, 'revisions are only loaded on request');
select cmp_ok(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10', true) -> 'pools' -> 0 -> 'revisions'), '>=', 6, 'manager can load the audit trail');
select throws_ok($$ select public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-01-01','2027-03-01') $$, '22023', null, 'ranges over 400 days are rejected');
select throws_ok($$ select public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-09') $$, '22023', null, 'inverted ranges are rejected');

select pg_temp.as_user('00000000-0000-4000-8000-000000091003');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools'), 1, 'staff reads their own day');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools' -> 0 -> 'intervals'), 2, 'staff see only intervals they took part in (not the voided one)');
select ok(position('00000000-0000-4000-8000-000000091004' in (public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10', true))::text) = 0, 'staff payload never contains a co-worker''s identity');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10', true) -> 'pools' -> 0 -> 'revisions'), 0, 'staff never receive the audit trail');
select is((public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools' -> 0 -> 'allocations' -> 0 ->> 'profile_id'), '00000000-0000-4000-8000-000000091003', 'staff see only their own allocation');
select ok(not ((public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools' -> 0 -> 'intervals' -> 0) ? 'amount_cents'), 'staff do not receive an interval''s combined total');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T18:00:00-05:00', '2026-03-10T19:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, '42501', null, 'staff cannot save');
select throws_ok($$ select public.tips_void_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',(select v from ids where k='i1'),2,'nope') $$, '42501', null, 'staff cannot void');
select throws_ok($$ select public.tips_recalculate_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',1) $$, '42501', null, 'staff cannot recalculate');

select pg_temp.as_user('00000000-0000-4000-8000-000000091005');
select is(jsonb_array_length(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') -> 'pools'), 0, 'a person removed from every interval has nothing to see for that day');

select pg_temp.as_user('00000000-0000-4000-8000-000000091002');
select lives_ok($$ select pg_temp.save(null, null, '2026-03-10T20:00:00-05:00', '2026-03-10T21:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null) $$, 'an assistant manager can save');

-- 11. Tenant and location isolation ----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-10T16:00:00-05:00', '2026-03-10T17:00:00-05:00', 100, 0, array['00000000-0000-4000-8000-000000091006']::uuid[], null, '2026-03-10', '00000000-0000-4000-8000-000000091012') $$, '42501', null, 'a Loc A manager cannot save at Loc B');
select throws_ok($$ select public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091012','2026-03-10','2026-03-10') $$, '42501', null, 'a Loc A manager cannot read Loc B');
select pg_temp.as_user('00000000-0000-4000-8000-000000091007');
select throws_ok($$ select public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') $$, '42501', null, 'a user with no membership cannot read');
select pg_temp.as_user('00000000-0000-4000-8000-000000091006');
select throws_ok($$ select public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10') $$, '42501', null, 'staff of Loc B cannot read Loc A');

-- 12. Direct table writes are CLOSED for authenticated; privileged writes are still captured ---------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
set local role authenticated;
select throws_ok($$ update public.tip_intervals set note = 'direct edit' where id = (select v from ids where k='i2') $$, '42501', null, 'a manager cannot update an interval directly (RPC-only)');
select throws_ok($$ update public.tip_intervals set voided_at = now(), voided_by = '00000000-0000-4000-8000-000000091001', void_reason = 'sneaky' where id = (select v from ids where k='i2') $$, '42501', null, 'a manager cannot void directly (bypassing revision and recalculation)');
select throws_ok($$ delete from public.tip_pools where id = (select tip_pool_id from public.tip_intervals where id = (select v from ids where k='i2')) $$, '42501', null, 'a manager cannot delete a whole day directly');
select throws_ok($$ insert into public.tip_intervals(organization_id, tip_pool_id, starts_at, ends_at, amount_cents) values ('00000000-0000-4000-8000-000000091010', (select tip_pool_id from public.tip_intervals where id = (select v from ids where k='i2')), now(), now() + interval '1 hour', 100) $$, '42501', null, 'a manager cannot insert an interval directly');
select throws_ok($$ delete from public.tip_interval_participants where tip_interval_id = (select v from ids where k='i2') $$, '42501', null, 'a manager cannot change participants directly');
reset role;
-- A privileged (service-role / migration) write still happens, and is never invisible.
update public.tip_intervals set note = 'direct edit' where id = (select v from ids where k='i2');
select is((select count(*)::int from public.tip_revisions where source = 'direct' and action = 'direct_interval_update' and editor_profile_id = '00000000-0000-4000-8000-000000091001'), 1, 'a privileged direct interval update is captured with its editor');
select is((select after_state ->> 'note' from public.tip_revisions where action = 'direct_interval_update'), 'direct edit', 'with the before/after row');
select throws_ok($$ update public.tip_intervals set amount_cents = 5 where id = (select v from ids where k='i2') $$, '23514', null, 'even a privileged write cannot desynchronise total and tender');
select pg_temp.as_user('00000000-0000-4000-8000-000000091003');
set local role authenticated;
select is((select count(*)::int from public.tip_revisions), 0, 'RLS: staff read zero audit rows');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
set local role authenticated;
select cmp_ok((select count(*)::int from public.tip_revisions), '>=', 8, 'RLS: a location manager reads the audit rows of their location');
select throws_ok($$ insert into public.tip_revisions(organization_id, location_id, tip_pool_id, action, source) values ('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',1,'interval_created','rpc') $$, '42501', null, 'RLS: nobody can forge an audit row');
reset role;

-- 12b. Overlap is judged across adjacent service dates; the legacy RPC delegates to the same rules ---------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select lives_ok($$ select pg_temp.save(null, null, '2026-03-20T22:00:00-05:00', '2026-03-21T00:30:00-05:00', 500, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null, '2026-03-20') $$, 'a late interval running past midnight saves on its service date');
select throws_ok($$ select pg_temp.save(null, null, '2026-03-21T00:00:00-05:00', '2026-03-21T01:00:00-05:00', 500, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null, '2026-03-21') $$, '22023', 'Tip intervals cannot overlap.', 'an interval on the NEXT service date that overlaps the previous day''s after-midnight interval is rejected (no double pay)');
select lives_ok($$ select pg_temp.save(null, null, '2026-03-21T00:30:00-05:00', '2026-03-21T01:30:00-05:00', 500, 0, array['00000000-0000-4000-8000-000000091003']::uuid[], null, '2026-03-21') $$, 'back-to-back across the day boundary is allowed');
select throws_ok($$ select public.tips_add_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10','2026-03-10T12:30:00-05:00','2026-03-10T13:30:00-05:00',500,array['00000000-0000-4000-8000-000000091003']::uuid[]) $$, '22023', 'Tip intervals cannot overlap.', 'the legacy tips_add_interval delegates to tips_save_interval and inherits its overlap rule');

-- 13. Legacy rows and locked days ---------------------------------------------------------------------------------
insert into public.tip_pools(id, organization_id, location_id, service_date, status)
overriding system value values (9100001, '00000000-0000-4000-8000-000000091010', '00000000-0000-4000-8000-000000091011', '2026-03-12', 'draft');
insert into public.tip_intervals(id, organization_id, tip_pool_id, starts_at, ends_at, amount_cents)
overriding system value values (9100002, '00000000-0000-4000-8000-000000091010', 9100001, '2026-03-12T12:00:00-05:00', '2026-03-12T14:00:00-05:00', 1000);
insert into public.tip_interval_participants(organization_id, tip_interval_id, profile_id) values
 ('00000000-0000-4000-8000-000000091010', 9100002, '00000000-0000-4000-8000-000000091003'),
 ('00000000-0000-4000-8000-000000091010', 9100002, '00000000-0000-4000-8000-000000091004');
select pg_temp.as_user('00000000-0000-4000-8000-000000091001');
select lives_ok($$ select public.recalculate_tip_pool(9100001) $$, 'legacy recalculation still works');
select is((select cash_cents + card_cents from public.tip_allocations where tip_pool_id = 9100001 limit 1), 0, 'a legacy interval has no recorded tender (not split)');
select is((select sum(amount_cents)::int from public.tip_allocations where tip_pool_id = 9100001), 1000, 'but its money is unchanged');
select is(((public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-12','2026-03-12') -> 'pools' -> 0 -> 'intervals' -> 0) ->> 'tender_recorded')::boolean, false, 'readers flag legacy intervals as tender not recorded');
select lives_ok($$ select public.tips_finalize_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',9100001) $$, 'a legacy day can be finalized by the old route');
select throws_ok($$ select pg_temp.save(9100002, 1, '2026-03-12T12:00:00-05:00', '2026-03-12T14:00:00-05:00', 1, 1, array['00000000-0000-4000-8000-000000091003']::uuid[], 'try', '2026-03-12') $$, '22023', null, 'a finalized legacy day rejects edits');
select throws_ok($$ select public.tips_void_interval('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',9100002,1,'try') $$, '22023', null, 'a finalized legacy day rejects voids');
select throws_ok($$ select public.tips_recalculate_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',9100001) $$, '22023', null, 'a finalized legacy day rejects recalculation');
select lives_ok($$ select public.tips_reopen_pool('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011',9100001,'Correct the split') $$, 'the audited reopen route still unlocks it');
select lives_ok($$ select pg_temp.save(9100002, 1, '2026-03-12T12:00:00-05:00', '2026-03-12T14:00:00-05:00', 700, 300, array['00000000-0000-4000-8000-000000091003','00000000-0000-4000-8000-000000091004']::uuid[], 'Add tender', '2026-03-12') $$, 'after the audited reopen the day is editable and gains a tender split');
select is((select sum(cash_cents)::int || '/' || sum(card_cents)::int from public.tip_allocations where tip_pool_id = 9100001), '700/300', 'and reconciles to cash/card');

select is((select array_agg(e ->> 'action' order by e ->> 'action') filter (where (e ->> 'action') like 'legacy_%')
          from jsonb_array_elements(public.tips_get_range('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-12','2026-03-12', true) -> 'pools' -> 0 -> 'revisions') e),
  array['legacy_finalized','legacy_reopened'], 'the earlier workflow finalize/reopen audit events appear in the same audit feed');

-- 14. Legacy day reader hides voided intervals --------------------------------------------------------------------------
select is(jsonb_array_length(public.tips_get_day_data('00000000-0000-4000-8000-000000091010','00000000-0000-4000-8000-000000091011','2026-03-10') -> 'intervals'), 3, 'legacy day reader omits the voided interval (3 live of 4)');

select * from finish();
rollback;
