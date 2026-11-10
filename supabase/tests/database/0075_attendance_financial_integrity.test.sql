begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

-- --------------------------------------------------------------------------
-- V2-006.006/.007 Batch C - financial integrity of native attendance.
-- Proves, with real authenticated JWT subjects and synthetic data only, that:
--   * attendance corrections can never reach confirmed payroll or tips;
--   * confirmed/locked financial rows stay protected at the database level;
--   * no financial table grants TRUNCATE (the Batch A ledger-bypass class);
--   * the source rows Payroll/Tips would read are tenant- and location-isolated;
--   * a correction after a snapshot is detectable (version / last_corrected_at).
-- No migration is added by Batch C: this suite guards the EXISTING schema.
-- --------------------------------------------------------------------------

-- Fixtures ---------------------------------------------------------------------------
-- 01 org owner, 02 b1 location manager, 03 staff A, 04 staff B, 05 b2 manager (other location),
-- 06 other-org owner, 07 revoked b1 manager
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000750' || lpad(n::text, 2, '0'))::uuid, 'u75_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 7) n;
insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000750' || lpad(n::text, 2, '0'))::uuid, 'User75 ' || n from generate_series(1, 7) n;
insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000750a1', 'Org75', 'org-75', '00000000-0000-0000-0000-000000075001', '{}'),
  ('00000000-0000-0000-0000-0000000750a2', 'OtherOrg75', 'other-org-75', '00000000-0000-0000-0000-000000075006', '{}');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-000000075007', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000750a2', '00000000-0000-0000-0000-000000075006', array['owner']::public.app_role[], true);
insert into public.locations (id, organization_id, name, time_zone, address, active, attendance_mode) values
  ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-0000000750a1', 'B1', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000750b2', '00000000-0000-0000-0000-0000000750a1', 'B2', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000750b3', '00000000-0000-0000-0000-0000000750a2', 'B3', 'America/Chicago', '{}', true, 'internal_the_lineup');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-000000075002', 'manager', true),
  ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-000000075003', 'staff', true),
  ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-000000075004', 'staff', true),
  ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-000000075007', 'manager', true),
  ('00000000-0000-0000-0000-0000000750b2', '00000000-0000-0000-0000-000000075005', 'manager', true);

-- Sessions, all in the past, relative to a fixed base instant (whole hour, 60h ago).
--   f1  staff A  completed 0h..8h   gross 28800  breaks: 30m + 15m, both UNCLASSIFIED
--   f2  staff B  completed 12h..18h gross 21600  no breaks (resolved)
--   f3  staff B  active since 40h   (open)
--   f6  staff A  completed 20h..24h gross 14400  (to be VOIDED)
--   f4  b2 manager (05) completed   (other location, same org)
--   f5  other-org owner (06) completed at b3
create temp table t75 as select date_trunc('hour', now()) - interval '60 hours' as base, clock_timestamp() as t_before_snapshot;
grant select on t75 to authenticated;

insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select s.id, s.org, s.loc, s.prof, ((t.base + s.i) at time zone 'America/Chicago')::date, s.st, t.base + s.i, case when s.o is null then null else t.base + s.o end, s.g, s.tb, s.prof
from t75 t, (values
  ('00000000-0000-0000-0000-00000075f001'::uuid, '00000000-0000-0000-0000-0000000750a1'::uuid, '00000000-0000-0000-0000-0000000750b1'::uuid, '00000000-0000-0000-0000-000000075003'::uuid, 'completed'::public.attendance_session_status, interval '0 hours',  interval '8 hours',  28800, 2700),
  ('00000000-0000-0000-0000-00000075f002'::uuid, '00000000-0000-0000-0000-0000000750a1'::uuid, '00000000-0000-0000-0000-0000000750b1'::uuid, '00000000-0000-0000-0000-000000075004'::uuid, 'completed'::public.attendance_session_status, interval '12 hours', interval '18 hours', 21600, 0),
  ('00000000-0000-0000-0000-00000075f003'::uuid, '00000000-0000-0000-0000-0000000750a1'::uuid, '00000000-0000-0000-0000-0000000750b1'::uuid, '00000000-0000-0000-0000-000000075004'::uuid, 'active'::public.attendance_session_status,    interval '40 hours', null,                14400 * 0, 0),
  ('00000000-0000-0000-0000-00000075f006'::uuid, '00000000-0000-0000-0000-0000000750a1'::uuid, '00000000-0000-0000-0000-0000000750b1'::uuid, '00000000-0000-0000-0000-000000075003'::uuid, 'completed'::public.attendance_session_status, interval '20 hours', interval '24 hours', 14400, 0),
  ('00000000-0000-0000-0000-00000075f004'::uuid, '00000000-0000-0000-0000-0000000750a1'::uuid, '00000000-0000-0000-0000-0000000750b2'::uuid, '00000000-0000-0000-0000-000000075005'::uuid, 'completed'::public.attendance_session_status, interval '5 hours',  interval '9 hours',  14400, 0),
  ('00000000-0000-0000-0000-00000075f005'::uuid, '00000000-0000-0000-0000-0000000750a2'::uuid, '00000000-0000-0000-0000-0000000750b3'::uuid, '00000000-0000-0000-0000-000000075006'::uuid, 'completed'::public.attendance_session_status, interval '5 hours',  interval '9 hours',  14400, 0)
) as s(id, org, loc, prof, st, i, o, g, tb);
-- the open session has no gross yet
update public.attendance_sessions set gross_elapsed_seconds = null where id = '00000000-0000-0000-0000-00000075f003';

insert into public.attendance_breaks (id, session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds)
overriding system value
select v.id, '00000000-0000-0000-0000-00000075f001', '00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-000000075003', t.base + v.s, t.base + v.e, v.d
from t75 t, (values
  (7501::bigint, interval '3 hours', interval '3 hours 30 minutes', 1800),
  (7502::bigint, interval '5 hours', interval '5 hours 15 minutes', 900)
) as v(id, s, e, d);

insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, event_time, service_date, source, actor_profile_id)
select s.id, s.organization_id, s.location_id, s.profile_id, e.t, case e.t when 'clock_in' then s.clock_in_at else s.clock_out_at end, s.service_date, 'web', s.profile_id
from public.attendance_sessions s, (values ('clock_in'::public.attendance_event_type), ('clock_out'::public.attendance_event_type)) e(t)
where s.id in ('00000000-0000-0000-0000-00000075f001', '00000000-0000-0000-0000-00000075f002', '00000000-0000-0000-0000-00000075f006')
  and (e.t = 'clock_in' or s.clock_out_at is not null);

-- Confirmed financial records (synthetic): a LOCKED payroll period with a CONFIRMED payment and an
-- adjustment, and a FINALIZED tip pool with an interval, participants and allocations.
insert into public.payroll_periods (id, organization_id, location_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by, locked_at, locked_by)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', null, 9001, (select date_trunc('month', base)::date from t75), 8.0, 1500, 12000, 'locked',
        '00000000-0000-0000-0000-000000075001', now(), '00000000-0000-0000-0000-000000075001');
insert into public.payroll_periods (id, organization_id, location_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by, locked_at, locked_by)
overriding system value
values (75002, '00000000-0000-0000-0000-0000000750a1', null, 9002, (select (date_trunc('month', base) - interval '1 month')::date from t75), 4.0, 1500, 6000, 'locked',
        '00000000-0000-0000-0000-000000075001', now(), '00000000-0000-0000-0000-000000075001');
insert into public.payroll_payments (id, organization_id, payroll_period_id, amount_cents, payment_date, status, created_by, confirmed_at, confirmed_by)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', 75001, 12000, current_date, 'confirmed',
        '00000000-0000-0000-0000-000000075001', now(), '00000000-0000-0000-0000-000000075001');
insert into public.payroll_adjustments (id, organization_id, payroll_period_id, delta_cents, reason, created_by)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', 75001, -500, 'synthetic prior adjustment', '00000000-0000-0000-0000-000000075001');

insert into public.tip_pools (id, organization_id, location_id, service_date, status, finalized_at, finalized_by)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', '00000000-0000-0000-0000-0000000750b1', (select base::date from t75), 'finalized', now(), '00000000-0000-0000-0000-000000075001');
insert into public.tip_intervals (id, organization_id, tip_pool_id, starts_at, ends_at, amount_cents)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', 75001, (select base + interval '1 hour' from t75), (select base + interval '5 hours' from t75), 10000);
insert into public.tip_interval_participants (organization_id, tip_interval_id, profile_id) values
  ('00000000-0000-0000-0000-0000000750a1', 75001, '00000000-0000-0000-0000-000000075003'),
  ('00000000-0000-0000-0000-0000000750a1', 75001, '00000000-0000-0000-0000-000000075004');
insert into public.tip_allocations (id, organization_id, tip_pool_id, profile_id, amount_cents)
overriding system value
values (75001, '00000000-0000-0000-0000-0000000750a1', 75001, '00000000-0000-0000-0000-000000075003', 5000),
       (75002, '00000000-0000-0000-0000-0000000750a1', 75001, '00000000-0000-0000-0000-000000075004', 5000);

-- 1. No financial table grants TRUNCATE (nor any write to anon/public) ---------------------------
select is(
  (select count(*)::int from unnest(array[
      'public.payroll_periods','public.payroll_payments','public.payroll_adjustments','public.payroll_rates',
      'public.payroll_settings','public.tip_pools','public.tip_intervals','public.tip_interval_participants',
      'public.tip_allocations','public.attendance_identity_links']) t(r)
   where has_table_privilege('authenticated', t.r, 'TRUNCATE') or has_table_privilege('anon', t.r, 'TRUNCATE')),
  0, 'no financial table grants TRUNCATE to authenticated or anon (TRUNCATE bypasses RLS and row triggers)');
select is(
  (select count(*)::int from unnest(array[
      'public.payroll_periods','public.payroll_payments','public.payroll_adjustments','public.payroll_rates',
      'public.payroll_settings','public.tip_pools','public.tip_intervals','public.tip_interval_participants',
      'public.tip_allocations']) t(r)
   where has_table_privilege('anon', t.r, 'INSERT') or has_table_privilege('anon', t.r, 'UPDATE')
      or has_table_privilege('anon', t.r, 'DELETE') or has_table_privilege('anon', t.r, 'SELECT')),
  0, 'anon has no privilege at all on the payroll and tip tables');
select is(has_table_privilege('authenticated', 'public.payroll_adjustments', 'DELETE'), false, 'payroll_adjustments is append-only: no delete privilege');
select is(has_table_privilege('authenticated', 'public.payroll_adjustments', 'UPDATE'), false, 'payroll_adjustments is append-only: no update privilege');
select is(has_table_privilege('authenticated', 'public.payroll_periods', 'DELETE'), false, 'payroll_periods cannot be deleted by authenticated');

-- 2. Attendance and financial structures are independent (no path for a correction to reach money) -
-- R2 (V2-006): the ONLY sanctioned bridge between the attendance ledger and money is the payroll-side
-- consumption ledger (payroll_attendance_consumptions). Everything else stays isolated. Matched by relname +
-- schema (the older regclass::text form drops the schema under the default search_path and matched nothing).
select is(
  (select count(*)::int from pg_constraint c
    join pg_class cr on cr.oid = c.conrelid join pg_namespace cn on cn.oid = cr.relnamespace
    join pg_class fr on fr.oid = c.confrelid join pg_namespace fn on fn.oid = fr.relnamespace
    where c.contype = 'f' and cn.nspname = 'public' and fn.nspname = 'public'
      and cr.relname <> 'payroll_attendance_consumptions'
      and ((cr.relname like 'attendance_%' and cr.relname <> 'attendance_identity_links'
            and (fr.relname like 'payroll_%' or fr.relname like 'tip_%'))
        or ((cr.relname like 'payroll_%' or cr.relname like 'tip_%') and fr.relname in ('attendance_sessions','attendance_breaks','attendance_events')))),
  0, 'no foreign key links the attendance ledger and payroll/tip tables in either direction (except the sanctioned consumption ledger)');
select is(
  (select array_agg(distinct fr.relname::text order by fr.relname::text) from pg_constraint c
    join pg_class cr on cr.oid = c.conrelid join pg_class fr on fr.oid = c.confrelid
    where c.contype = 'f' and cr.relname = 'payroll_attendance_consumptions'),
  array['attendance_sessions','payroll_periods','profiles'],
  'the consumption ledger references exactly the session, the period and the actor profile - nothing else');
select is(
  (select count(*)::int from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    join pg_class cr on cr.oid = t.tgrelid join pg_namespace cn on cn.oid = cr.relnamespace
    where not t.tgisinternal and cn.nspname = 'public'
      and cr.relname in ('attendance_sessions', 'attendance_breaks', 'attendance_events')
      and p.prosrc ~* '(payroll_|tip_pools|tip_intervals|tip_allocations)'),
  0, 'no trigger on an attendance ledger table (sessions, breaks, events) touches payroll or tip tables');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.proname like 'attendance\_%'
      and p.prosrc ~* '(payroll_periods|payroll_payments|payroll_adjustments|tip_pools|tip_allocations|tip_intervals)'),
  0, 'no attendance function reads or writes payroll or tip tables');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'attendance\_%' and p.prosecdef
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""' or c = 'search_path=')) ),
  0, 'every SECURITY DEFINER attendance RPC pins an empty search_path');

-- 3. Snapshot of every confirmed financial row, taken BEFORE any correction ------------------------
create temp table h75 as
select 'before'::text as phase, 'payroll_periods'::text as t, md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) as h, count(*)::int as n from public.payroll_periods x
union all select 'before', 'payroll_payments',  md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.payroll_payments x
union all select 'before', 'payroll_adjustments', md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.payroll_adjustments x
union all select 'before', 'tip_pools',            md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_pools x
union all select 'before', 'tip_intervals',        md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_intervals x
union all select 'before', 'tip_interval_participants', md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.tip_interval_id, x.profile_id), '')), count(*)::int from public.tip_interval_participants x
union all select 'before', 'tip_allocations',      md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_allocations x;
select is((select min(n) from h75 where t in ('payroll_periods','payroll_payments','payroll_adjustments','tip_pools','tip_intervals','tip_allocations')), 1,
  'sanity: every financial fixture table holds at least one confirmed row to protect');

-- 4. Source-view scope for Payroll/Tips readers (the query the reader runs) -------------------------
-- count(session) per actor for (org A, location b1), as the native reader would ask.
create temp table scope_q (loc uuid, org uuid);
insert into scope_q values ('00000000-0000-0000-0000-0000000750b1', '00000000-0000-0000-0000-0000000750a1');
grant select on scope_q to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075002'; -- b1 manager
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000750b1'), true, 'b1 manager passes the reader''s authority gate at b1');
select is((select count(*)::int from public.attendance_session_summaries s, scope_q q where s.location_id = q.loc and s.organization_id = q.org), 4,
  'b1 manager sees exactly the four b1 sessions (f1, f2, f3, f6)');
select is((select count(*)::int from public.attendance_session_summaries where location_id = '00000000-0000-0000-0000-0000000750b2'), 0, 'b1 manager sees none of b2');

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075005'; -- b2 manager
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000750b1'), false, 'b2 manager fails the authority gate at b1 (so the reader returns ACCESS_DENIED, not an empty report)');
select is((select count(*)::int from public.attendance_session_summaries s, scope_q q where s.location_id = q.loc), 0, 'and RLS shows them zero b1 rows (the gate exists because empty would look like no hours)');

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075006'; -- other-org owner
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000750b1'), false, 'foreign-org owner fails the gate at b1');
select is((select count(*)::int from public.attendance_session_summaries where organization_id = '00000000-0000-0000-0000-0000000750a1'), 0, 'foreign-org owner reads zero rows of org A');

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075003'; -- staff A
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000750b1'), false, 'staff fails the management gate');
select is((select count(*)::int from public.attendance_session_summaries s, scope_q q where s.location_id = q.loc), 2, 'staff A reads only their own two sessions (f1, f6)');

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075007'; -- revoked manager
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000750b1'), false, 'revoked manager fails the gate');
select is((select count(*)::int from public.attendance_session_summaries s, scope_q q where s.location_id = q.loc), 0, 'revoked manager reads nothing');

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075001'; -- org owner
select is((select count(*)::int from public.attendance_session_summaries s, scope_q q where s.location_id = q.loc), 4, 'org owner reads all four b1 sessions');

-- 5. Payable time is NULL (unresolved) until every break is decided, never zero -----------------------
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), null::int,
  'f1 (two unclassified breaks): payable is NULL, not 0');
select is((select break_policy_resolved from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), false, 'f1 break policy unresolved');
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f003'), null::int, 'f3 (open): payable is NULL, not 0');
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f002'), 21600, 'f2 (no breaks, completed): payable = gross = 6h = 21600');

-- 6. Real manager corrections (b1 manager, JWT) -------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075002';
-- f1: decide the breaks: 30m UNPAID (7501), 15m PAID (7502).
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000075f001', 1, 'break policy decided by manager',
       null, null, '[{"id":7501,"pay_classification":"unpaid"},{"id":7502,"pay_classification":"paid"}]'::jsonb) $$,
  'manager classifies both breaks on f1');
-- f2: shorten the shift by an hour (clock-out 17h).
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000075f002', 1, 'left an hour early',
       null, (select base + interval '17 hours' from t75)) $$,
  'manager corrects the clock-out on f2');
-- f6: void.
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000075f006', 1, 'entered by mistake',
       null, null, '[]'::jsonb, true) $$,
  'manager voids f6');

-- 7. Independent expected values after the corrections -------------------------------------------------
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), 27000,
  'f1 payable = 8h (28800) − 30m unpaid (1800) = 27000; the 15m paid break does not reduce it');
select is((select break_policy_resolved from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), true, 'f1 break policy now resolved');
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f002'), 18000,
  'f2 payable = corrected 5h = 18000 (effective value, not the original 21600)');
select is((select status::text from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f006'), 'voided', 'f6 is voided');
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f006'), null::int, 'a voided session has NULL payable (never consumed, never zero)');
select is((select is_closed from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f006'), false, 'a voided session is not "closed" for financial purposes');

-- 8. A correction after a snapshot is detectable (the Q6 detection source) ---------------------------------
select is((select version from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), 2, 'f1 version bumped to 2 by the correction');
select is((select correction_count from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001'), 1, 'f1 correction_count = 1');
select ok((select last_corrected_at from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f001') > (select t_before_snapshot from t75),
  'f1 last_corrected_at is later than a snapshot taken before the correction');
select is((select correction_count from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000075f003'), 0, 'an untouched session (f3) reports zero corrections');

-- 9. Confirmed financial rows are BYTE-IDENTICAL after the corrections -------------------------------------
reset role;
insert into h75
select 'after', 'payroll_periods', md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.payroll_periods x
union all select 'after', 'payroll_payments',  md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.payroll_payments x
union all select 'after', 'payroll_adjustments', md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.payroll_adjustments x
union all select 'after', 'tip_pools',            md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_pools x
union all select 'after', 'tip_intervals',        md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_intervals x
union all select 'after', 'tip_interval_participants', md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.tip_interval_id, x.profile_id), '')), count(*)::int from public.tip_interval_participants x
union all select 'after', 'tip_allocations',      md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')), count(*)::int from public.tip_allocations x;
select is((select h from h75 where phase = 'after' and t = 'payroll_periods'),     (select h from h75 where phase = 'before' and t = 'payroll_periods'),     'confirmed payroll_periods unchanged by attendance corrections');
select is((select h from h75 where phase = 'after' and t = 'payroll_payments'),    (select h from h75 where phase = 'before' and t = 'payroll_payments'),    'confirmed payroll_payments unchanged by attendance corrections');
select is((select h from h75 where phase = 'after' and t = 'payroll_adjustments'), (select h from h75 where phase = 'before' and t = 'payroll_adjustments'), 'payroll_adjustments unchanged: no adjustment was auto-created');
select is((select h from h75 where phase = 'after' and t = 'tip_pools'),           (select h from h75 where phase = 'before' and t = 'tip_pools'),           'finalized tip_pools unchanged by attendance corrections');
select is((select h from h75 where phase = 'after' and t = 'tip_intervals'),       (select h from h75 where phase = 'before' and t = 'tip_intervals'),       'tip_intervals unchanged by attendance corrections');
select is((select h from h75 where phase = 'after' and t = 'tip_interval_participants'), (select h from h75 where phase = 'before' and t = 'tip_interval_participants'), 'tip_interval_participants unchanged by attendance corrections');
select is((select h from h75 where phase = 'after' and t = 'tip_allocations'),     (select h from h75 where phase = 'before' and t = 'tip_allocations'),     'confirmed tip_allocations unchanged by attendance corrections');

-- 10. The existing protections still hold against a signed-in org owner ---------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000075001';
select throws_ok($$ update public.payroll_periods set hours_snapshot = 5.5, gross_cents = 8250 where id = 75001 $$, 'P0001', null,
  'a paid period''s snapshot cannot be rewritten once a payment exists (not even by the org owner)');
select throws_ok($$ update public.payroll_periods set hours_snapshot = 2.0, gross_cents = 3000 where id = 75002 $$, '42501', 'Cannot change the snapshot of a locked payroll period.',
  'a LOCKED period with no payment still refuses a snapshot rewrite (42501) until it is explicitly unlocked');
select throws_ok($$ update public.payroll_payments set amount_cents = 1 where id = 75001 $$, null, null, 'a confirmed payment cannot be edited');
with d as (delete from public.payroll_payments where id = 75001 returning id) select is((select count(*)::int from d), 0, 'RLS lets nobody delete a confirmed payment (only drafts): 0 rows affected, no silent success');
reset role;
select is((select count(*)::int from public.payroll_payments where id = 75001), 1, 'the confirmed payment still exists after the delete attempt');
select throws_ok($$ delete from public.payroll_payments where id = 75001 $$, null, 'Cannot delete a confirmed payment; record a correction instead.',
  'even a privileged role without RLS is stopped by the confirmed-payment trigger');
select is((select gross_cents from public.payroll_periods where id = 75001), 12000, 'the paid snapshot is still 12000 after every rejected rewrite');
select is((select gross_cents from public.payroll_periods where id = 75002), 6000, 'the locked-without-payment snapshot is still 6000');

select * from finish();
rollback;
