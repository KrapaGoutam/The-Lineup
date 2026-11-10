begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- --------------------------------------------------------------------------
-- V2-006 R2 - native Payroll identity (Option A), atomic consumption ledger,
-- correction-after-confirmation review boundary, source-transition safety.
-- Real authenticated JWT subjects and synthetic data only. No payments are made.
-- Concurrency (two simultaneous sessions) is proven by the separate harness
-- documented in .tmp/v2-006-attendance-handoff (a single pgTAP transaction cannot race).
-- --------------------------------------------------------------------------

-- Subjects (user n = ...0760nn):
--  01 org A owner          02 b1 location manager (org role: server)   03 P3 happy path (b1+b2)
--  04 P4 dual identity     05 org B owner                              06 revoked b1 manager
--  07 P7 unclassified brk  08 P8 open session                          09 P9 crosses month end
--  10 P10 stale draft      11 P11 (stale after lock)                   12 P12 org B, no rate
--  13 P13 dual, native 1st 14 P14 rate override                        15 P15 unlinked, both keys
--  16 P16 unrelated staff
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000760' || lpad(n::text, 2, '0'))::uuid, 'u76_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 16) n;
insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000760' || lpad(n::text, 2, '0'))::uuid, 'User76 ' || n from generate_series(1, 16) n;
insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000760a1', 'Org76', 'org-76', '00000000-0000-0000-0000-000000076001', '{}'),
  ('00000000-0000-0000-0000-0000000760a2', 'OtherOrg76', 'other-org-76', '00000000-0000-0000-0000-000000076005', '{}');
insert into public.memberships (organization_id, profile_id, roles, active)
select '00000000-0000-0000-0000-0000000760a1', ('00000000-0000-0000-0000-0000000760' || lpad(n::text, 2, '0'))::uuid,
       case when n = 1 then array['owner']::public.app_role[] else array['server']::public.app_role[] end,
       n <> 6
from generate_series(1, 16) n where n not in (5, 12);
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000760a2', '00000000-0000-0000-0000-000000076005', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a2', '00000000-0000-0000-0000-000000076012', array['server']::public.app_role[], true);
insert into public.locations (id, organization_id, name, time_zone, address, active, attendance_mode) values
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-0000000760a1', 'B1', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000760b2', '00000000-0000-0000-0000-0000000760a1', 'B2', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000760b3', '00000000-0000-0000-0000-0000000760a2', 'B3', 'America/Chicago', '{}', true, 'internal_the_lineup');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076002', 'manager', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076006', 'manager', true);

insert into public.payroll_settings (organization_id, default_rate_cents, updated_by)
values ('00000000-0000-0000-0000-0000000760a1', 1500, '00000000-0000-0000-0000-000000076001');
-- P14 has a native override of $20.00/h
insert into public.payroll_rates (organization_id, attendance_source, profile_id, neon_user_id, rate_cents, updated_by)
values ('00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076014', null, 2000, '00000000-0000-0000-0000-000000076001');

-- Fixed payroll month: the first day of the month two months ago (always in the past).
create temp table t76 as select (date_trunc('month', now() at time zone 'UTC') - interval '2 months')::date as m;
grant select on t76 to authenticated;

-- Session factory. in_off/out_off are offsets from (month + day) 15:00 UTC.
create temp table s76 (id uuid, org uuid, loc uuid, prof uuid, day_off int, hours numeric, brk_min int);
insert into s76 values
  ('00000000-0000-0000-0000-00000076f001', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003', 10, 8, 30),  -- P3 b1 8h, 30m break
  ('00000000-0000-0000-0000-00000076f002', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b2', '00000000-0000-0000-0000-000000076003', 12, 6, 0),   -- P3 b2 6h
  ('00000000-0000-0000-0000-00000076f004', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004', 10, 4, 0),   -- P4 4h
  ('00000000-0000-0000-0000-00000076f007', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076007', 10, 8, 20),  -- P7 8h, 20m break (stays unclassified)
  ('00000000-0000-0000-0000-00000076f010', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076010', 10, 8, 0),   -- P10 8h
  ('00000000-0000-0000-0000-00000076f011', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076011', 10, 8, 0),   -- P11 8h
  ('00000000-0000-0000-0000-00000076f012', '00000000-0000-0000-0000-0000000760a2', '00000000-0000-0000-0000-0000000760b3', '00000000-0000-0000-0000-000000076012', 10, 5, 0),   -- P12 org B 5h
  ('00000000-0000-0000-0000-00000076f013', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076013', 10, 3, 0),   -- P13 3h
  ('00000000-0000-0000-0000-00000076f014', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076014', 10, 2, 0);   -- P14 2h

insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select q.id, q.org, q.loc, q.prof, (q.ci at time zone 'America/Chicago')::date, 'completed', q.ci,
       q.ci + make_interval(hours => q.hours::int), (q.hours * 3600)::int, q.brk_min * 60, q.prof
from (select s.*, ((t.m + s.day_off) + time '15:00')::timestamp at time zone 'UTC' as ci from s76 s, t76 t) q;

-- P8: an OPEN session in the month. P9: a shift that ends after the month does.
insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select '00000000-0000-0000-0000-00000076f008', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076008',
       ((((t.m + 11) + time '15:00')::timestamp at time zone 'UTC') at time zone 'America/Chicago')::date,
       'active', ((t.m + 11) + time '15:00')::timestamp at time zone 'UTC', null, null, 0, '00000000-0000-0000-0000-000000076008'
from t76 t;
insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select '00000000-0000-0000-0000-00000076f009', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076009',
       (((((t.m + interval '1 month')::date - 1) + time '20:00')::timestamp at time zone 'UTC') at time zone 'America/Chicago')::date,
       'completed',
       ((((t.m + interval '1 month')::date - 1) + time '20:00')::timestamp at time zone 'UTC'),
       (((t.m + interval '1 month')::date + time '08:00')::timestamp at time zone 'UTC'),
       43200, 0, '00000000-0000-0000-0000-000000076009'
from t76 t;

insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select '00000000-0000-0000-0000-00000076f015', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076015',
       (q.ci at time zone 'America/Chicago')::date, 'completed', q.ci, q.ci + interval '4 hours', 14400, 900, '00000000-0000-0000-0000-000000076015'
from (select ((t.m + 13) + time '15:00')::timestamp at time zone 'UTC' as ci from t76 t) q;

-- Breaks: P3's is classified UNPAID (so P3 is payable); P7's stays UNCLASSIFIED.
insert into public.attendance_breaks (id, session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds, pay_classification, classified_by, classified_at)
overriding system value
select 7601, s.id, s.organization_id, s.location_id, s.profile_id, s.clock_in_at + interval '3 hours', s.clock_in_at + interval '3 hours 30 minutes', 1800, 'unpaid', '00000000-0000-0000-0000-000000076002', now()
from public.attendance_sessions s where s.id = '00000000-0000-0000-0000-00000076f001';
insert into public.attendance_breaks (id, session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds)
overriding system value
select 7607, s.id, s.organization_id, s.location_id, s.profile_id, s.clock_in_at + interval '3 hours', s.clock_in_at + interval '3 hours 20 minutes', 1200
from public.attendance_sessions s where s.id = '00000000-0000-0000-0000-00000076f007';

insert into public.attendance_breaks (id, session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds)
overriding system value
select 7615, s.id, s.organization_id, s.location_id, s.profile_id, s.clock_in_at + interval '1 hour', s.clock_in_at + interval '1 hour 15 minutes', 900
from public.attendance_sessions s where s.id = '00000000-0000-0000-0000-00000076f015';

-- Identity fixtures. P4 <-> Neon 4001 (dual). P13 <-> Neon 4013 (dual). Neon-only employees 5001/5002.
insert into public.attendance_identity_links (organization_id, profile_id, neon_user_id, linked_by) values
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076004', 4001, '00000000-0000-0000-0000-000000076001'),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076013', 4013, '00000000-0000-0000-0000-000000076001');
-- Legacy-shaped inserts (no new columns): the defaults make them Neon-keyed.
insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by, locked_at, locked_by)
select '00000000-0000-0000-0000-0000000760a1', v.n, t.m, 10.0, 1500, 15000, 'locked', '00000000-0000-0000-0000-000000076001', now(), '00000000-0000-0000-0000-000000076001'
from t76 t, (values (4001), (5001)) v(n);
insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by)
select '00000000-0000-0000-0000-0000000760a1', 5002, t.m, 4.0, 1500, 6000, 'draft', '00000000-0000-0000-0000-000000076001' from t76 t;
insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
values ('00000000-0000-0000-0000-0000000760a1', 5001, 1800, '00000000-0000-0000-0000-000000076001');

-- Digest of every Neon-keyed row, to prove the native work never touches legacy history.
create temp table d76 as
select 'before'::text as phase,
       md5(coalesce((select string_agg(row_to_json(x)::text, '|' order by x.id) from public.payroll_periods x where x.neon_user_id in (4001, 5001, 5002)), '')) as periods,
       md5(coalesce((select string_agg(row_to_json(x)::text, '|' order by x.id) from public.payroll_rates x where x.neon_user_id = 5001), '')) as rates;

-- helper tables used by assertions that run as an authenticated subject
create temp table r76 (k text, v jsonb);
create temp table g76 (r jsonb);
create temp table m76 (v text);
grant all on r76, g76, m76 to authenticated;

-- ===========================================================================
-- A. Structure and constraints
-- ===========================================================================
select has_column('public', 'payroll_periods', 'attendance_source', 'payroll_periods has attendance_source');
select has_column('public', 'payroll_periods', 'profile_id', 'payroll_periods has profile_id');
select col_is_null('public', 'payroll_periods', 'neon_user_id', 'neon_user_id is nullable (native rows never carry a Neon id)');
select is((select attendance_source from public.payroll_periods where neon_user_id = 4001 limit 1), 'external_neon', 'a legacy-shaped insert defaults to external_neon');
select is((select profile_id from public.payroll_periods where neon_user_id = 4001 limit 1), null::uuid, 'a legacy row carries no profile id');

select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, profile_id, attendance_source, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 6001, '00000000-0000-0000-0000-000000076016', 'external_neon', '2020-01-01', 1, 1, 1, '00000000-0000-0000-0000-000000076001') $$,
  '23514', null, 'an external_neon period cannot also carry a profile id');
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, profile_id, attendance_source, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 6002, '00000000-0000-0000-0000-000000076016', 'internal_the_lineup', '2020-01-01', 1, 1, 1, '00000000-0000-0000-0000-000000076001') $$,
  '23514', null, 'a native period cannot also carry a Neon id (no fabricated Neon integers)');
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, profile_id, attendance_source, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', null, null, 'internal_the_lineup', '2020-01-01', 1, 1, 1, '00000000-0000-0000-0000-000000076001') $$,
  '23514', null, 'a period with no identity at all is refused');
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, profile_id, attendance_source, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', null, '00000000-0000-0000-0000-000000076005', 'internal_the_lineup', '2020-01-01', 1, 1, 1, '00000000-0000-0000-0000-000000076001') $$,
  '23503', null, 'a profile that is not a member of the organization is refused (foreign-organization identity)');

select throws_ok(
  $$ update public.payroll_periods set neon_user_id = 7777 where neon_user_id = 5002 $$,
  '42501', null, 'the Neon identity of a period can never change, even for the table owner');
select throws_ok(
  $$ update public.payroll_periods set attendance_source = 'internal_the_lineup', profile_id = '00000000-0000-0000-0000-000000076016', neon_user_id = null where neon_user_id = 5002 $$,
  '42501', null, 'a Neon period cannot be re-keyed to a native identity');
select throws_ok(
  $$ update public.payroll_rates set profile_id = '00000000-0000-0000-0000-000000076016', attendance_source = 'internal_the_lineup', neon_user_id = null where neon_user_id = 5001 $$,
  '42501', null, 'a rate override cannot be re-keyed either');

-- ===========================================================================
-- B. Grants and RLS posture of the new objects
-- ===========================================================================
select is((select count(*)::int from unnest(array[
    'public.payroll_attendance_consumptions','public.payroll_attendance_consumption_reviews',
    'public.attendance_financial_activation']) t(r)
  where has_table_privilege('authenticated', t.r, 'INSERT') or has_table_privilege('authenticated', t.r, 'UPDATE')
     or has_table_privilege('authenticated', t.r, 'DELETE') or has_table_privilege('authenticated', t.r, 'TRUNCATE')
     or has_table_privilege('anon', t.r, 'SELECT') or has_table_privilege('anon', t.r, 'INSERT')),
  0, 'clients have no write privilege and anon has no privilege on the ledger, the reviews or the activation switch');
select is(has_table_privilege('authenticated', 'public.attendance_financial_activation', 'SELECT'), false, 'clients cannot even read the activation switch');
select is((select relrowsecurity from pg_class where oid = 'public.payroll_attendance_consumptions'::regclass), true, 'RLS enabled on the ledger');
select is((select relrowsecurity from pg_class where oid = 'public.payroll_attendance_consumption_reviews'::regclass), true, 'RLS enabled on the reviews');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and (p.proname like 'payroll\_%native%' or p.proname like 'payroll\_%consumption%' or p.proname like 'payroll\_source\_transition%' or p.proname = 'attendance_session_payable')
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""' or c = 'search_path='))),
  0, 'every new SECURITY DEFINER function pins an empty search_path');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('payroll_generate_native_period', 'payroll_raise_consumption_reviews', 'payroll_resolve_consumption_review', 'payroll_source_transition_readiness')
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))),
  0, 'no new public RPC is executable by anon or PUBLIC');

-- ===========================================================================
-- C. Activation is OFF: native financial processing cannot run
-- ===========================================================================
select is(private.attendance_financial_activated(), false, 'native financial processing is not activated by default');

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  '55000', null, 'even the organization owner cannot generate a native period while the switch is off (NOT_ACTIVATED)');
reset role;
select is((select count(*)::int from public.payroll_periods where attendance_source = 'internal_the_lineup'), 0, 'nothing was written while the switch is off');

-- Source switching is unchanged before activation and before any consumption exists.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select lives_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000760b2', 'external') $$,
  'pre-activation the Batch A switch is unchanged (internal -> external with no open sessions)');
select lives_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000760b2', 'internal_the_lineup') $$,
  'and back again');
reset role;

-- ===========================================================================
-- D. Activate (superuser, evidence recorded) and exercise generation
-- ===========================================================================
update public.attendance_financial_activation set enabled = true, evidence = 'pgTAP 0076 local activation inside a rolled-back transaction';
select is(private.attendance_financial_activated(), true, 'the switch is on inside this rolled-back test');

-- D1. Authority: org-wide payroll authority only, uniform denial.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002'; -- b1 location manager, not org-wide
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  '42501', null, 'a location manager cannot generate an organization-level native period');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076005'; -- other-org owner
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  '42501', null, 'a foreign-organization owner is denied');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076006'; -- revoked manager
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  '42501', null, 'a revoked manager is denied');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076003'; -- the employee themself
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  '42501', null, 'staff cannot generate their own payroll');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001'; -- org owner
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076005', (select m from t76)) $$,
  '42501', null, 'a profile that is not a member of the organization cannot be paid by it');
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m + 5 from t76)) $$,
  '22023', null, 'the payroll month must be the first day of a month');

-- D2. Eligibility is proved in the database.
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076008', (select m from t76)) $$,
  'ATTENDANCE_NOT_PAYABLE: open 1%', 'an open session blocks generation');
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076007', (select m from t76)) $$,
  'ATTENDANCE_NOT_PAYABLE: open 0, auto clock-out 0, unclassified or open breaks 1%', 'an unclassified break prevents payable-hour finalization (never zero, never auto-deducted)');
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076009', (select m from t76)) $$,
  '%crosses month end 1%', 'a shift that crosses the payroll month end is refused, not split');
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076016', (select m from t76)) $$,
  'NO_ATTENDANCE_HOURS%', 'no attendance is not silently a zero-hour period');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076005'; -- org B owner
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a2', '00000000-0000-0000-0000-000000076012', (select m from t76)) $$,
  'NO_RATE_CONFIGURED%', 'no rate and no default is a refusal, not $0');
reset role;
select is((select count(*)::int from public.payroll_periods where attendance_source = 'internal_the_lineup'), 0, 'no refusal left a partial period behind');
select is((select count(*)::int from public.payroll_attendance_consumptions), 0, 'no refusal left a ledger row behind');

-- D3. Happy path: P3 (two locations, one unpaid break) -> one organization-level period.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
insert into r76 select 'p3_first', public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76));
select is((select v ->> 'outcome' from r76 where k = 'p3_first'), 'created', 'P3: first call creates the period');
select is((select (v ->> 'hours')::numeric from r76 where k = 'p3_first'), 13.5, 'P3 hours = (8h - 30m unpaid) + 6h = 13.5, summed across both locations');
select is((select (v ->> 'grossCents')::int from r76 where k = 'p3_first'), 20250, 'P3 gross uses the organization default rate with a single rounding');
reset role;
select is((select count(*)::int from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003'), 1, 'exactly one P3 period');
select is((select neon_user_id from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003'), null::int, 'the native period carries no Neon id');
select is((select location_id from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003'), null::uuid, 'the period is organization-level (location_id NULL), per the unchanged contract');
select is((select count(*)::int from public.payroll_attendance_consumptions where consumer_ref = (select id from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003') and status = 'active'), 2, 'two active ledger rows (one per session)');
select is((select sum(net_payable_seconds)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076003'), 48600, 'ledger seconds reconcile to the snapshot');
select is((select reconciles from public.payroll_native_period_reconciliation where profile_id = '00000000-0000-0000-0000-000000076003'), true, 'the reconciliation view agrees');
select is((select source_version from public.payroll_attendance_consumptions where session_id = '00000000-0000-0000-0000-00000076f001'), 1, 'the ledger records the source version consumed');

-- D4. Idempotent replay (retry after timeout): no new rows, same period.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
insert into r76 select 'p3_second', public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76));
select is((select v ->> 'outcome' from r76 where k = 'p3_second'), 'unchanged', 'a replay is a no-op');
select is((select v ->> 'periodId' from r76 where k = 'p3_second'), (select v ->> 'periodId' from r76 where k = 'p3_first'), 'and returns the same period');
reset role;
select is((select count(*)::int from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003'), 1, 'still exactly one period after the replay');
select is((select count(*)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076003'), 2, 'still exactly two ledger rows after the replay');

-- D5. A native override rate (P14) is used; the dual-identity employee keeps one rate.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
insert into r76 select 'p14', public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076014', (select m from t76));
select is((select (v ->> 'grossCents')::int from r76 where k = 'p14'), 4000, 'P14 uses their $20.00 override: 2h = 4000 cents');
reset role;

-- D6. Clients cannot fabricate or edit a native financial record.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, attendance_source, profile_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076016', '2020-02-01', 999, 1500, 1498500, '00000000-0000-0000-0000-000000076001') $$,
  '42501', null, 'an organization owner cannot hand-insert a native period (hours would be fabricated)');
select throws_ok(
  $$ update public.payroll_periods set hours_snapshot = 99, gross_cents = 148500 where profile_id = '00000000-0000-0000-0000-000000076003' $$,
  '42501', null, 'nor edit a native snapshot directly');
select throws_ok(
  $$ insert into public.payroll_attendance_consumptions (organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by)
     select organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by
     from public.payroll_attendance_consumptions limit 1 $$,
  '42501', null, 'no client can insert a ledger row');
reset role;

-- D7. Database-side ledger guards (any writer, even the table owner).
select throws_ok(
  $$ insert into public.payroll_attendance_consumptions (organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by)
     select organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by
     from public.payroll_attendance_consumptions where session_id = '00000000-0000-0000-0000-00000076f001' $$,
  '23505', null, 'the same session cannot be consumed twice for the same live period (at-most-once)');
select throws_ok(
  $$ insert into public.payroll_attendance_consumptions (organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by)
     select c.organization_id, c.location_id, c.profile_id, '00000000-0000-0000-0000-00000076f013', c.consumer_type, c.consumer_ref, c.period_month, c.service_date, 1, 10800, 0, 10800, c.consumed_by
     from public.payroll_attendance_consumptions c where c.session_id = '00000000-0000-0000-0000-00000076f001' $$,
  '23503', null, 'another employee''s session cannot be attached to this employee''s period (tenant/employee binding)');
-- A fresh, still-unconsumed P14 shift at b1 (so the unique index cannot answer before the FK does).
insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select '00000000-0000-0000-0000-00000076f020', '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076014',
       (q.ci at time zone 'America/Chicago')::date, 'completed', q.ci, q.ci + interval '2 hours', 7200, 0, '00000000-0000-0000-0000-000000076014'
from (select ((t.m + 20) + time '15:00')::timestamp at time zone 'UTC' as ci from t76 t) q;
select throws_ok(
  $$ insert into public.payroll_attendance_consumptions (organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by)
     select p.organization_id, '00000000-0000-0000-0000-0000000760b2', p.profile_id, '00000000-0000-0000-0000-00000076f020', 'payroll_period', p.id, p.period_month,
            s.service_date, 1, 7200, 0, 7200, p.generated_by
     from public.payroll_periods p, public.attendance_sessions s
     where p.profile_id = '00000000-0000-0000-0000-000000076014' and s.id = '00000000-0000-0000-0000-00000076f020' $$,
  '23503', null, 'a ledger row cannot lie about the session''s location (composite FK to the session)');
select throws_ok(
  $$ update public.payroll_attendance_consumptions set net_payable_seconds = 1, gross_elapsed_seconds = 1, unpaid_break_seconds = 0 where session_id = '00000000-0000-0000-0000-00000076f001' $$,
  '23514', null, 'a consumed amount is frozen (not even the table owner can change it)');
select throws_ok($$ delete from public.payroll_attendance_consumptions $$, '23514', null, 'the ledger cannot be deleted from');
select throws_ok($$ truncate public.payroll_attendance_consumptions $$, '0A000', null, 'the ledger cannot be truncated (refused: the review history references it)');
select is((select count(*)::int from pg_trigger where tgrelid = 'public.payroll_attendance_consumptions'::regclass and tgname = 'payroll_consumption_no_truncate' and not tgisinternal), 1, 'and an explicit no-truncate trigger backs that up');
select throws_ok($$ truncate public.payroll_attendance_consumption_reviews $$, '23514', null, 'the review history cannot be truncated');

-- Stale source version at the ledger door (a reader holding an old version).
select throws_ok(
  $$ insert into public.payroll_attendance_consumptions (organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month, service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by)
     select p.organization_id, s.location_id, s.profile_id, s.id, 'payroll_period', p.id, p.period_month, s.service_date, 99, s.gross_elapsed_seconds, 0, s.gross_elapsed_seconds, p.generated_by
     from public.payroll_periods p, public.attendance_sessions s
     where p.profile_id = '00000000-0000-0000-0000-000000076014' and s.id = '00000000-0000-0000-0000-00000076f014' $$,
  'P0004', null, 'a stale source version is refused (the record changed since it was read)');

-- ===========================================================================
-- E. Dual identity: nobody is paid twice
-- ===========================================================================
-- E1. P4 (linked to Neon 4001, already paid for the month under Neon): native generation refused.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076004', (select m from t76)) $$,
  'DUAL_IDENTITY_DUPLICATE%', 'same employee under both identities: native generation is refused when the Neon identity already holds the month');
reset role;
select is((select count(*)::int from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076004'), 0, 'and left no native period or ledger rows behind (atomic)');
select is((select count(*)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076004'), 0, 'no ledger rows for P4');

-- E2. The reverse direction: P13 gets a native period first, then a Neon period for the same person/month is refused.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select lives_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076013', (select m from t76)) $$,
  'P13 (dual identity, nothing paid yet) generates natively');
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 4013, (select m from t76), 3, 1500, 4500, '00000000-0000-0000-0000-000000076001') $$,
  '23505', null, 'the linked Neon identity cannot then be paid for the same month (cross-key guard, other direction)');
reset role;
select throws_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 4013, (select m from t76), 3, 1500, 4500, '00000000-0000-0000-0000-000000076001') $$,
  '23505', null, 'the guard also binds the table owner');
select lives_ok(
  $$ insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 4013, (select (m - interval '1 month')::date from t76), 3, 1500, 4500, '00000000-0000-0000-0000-000000076001') $$,
  'a DIFFERENT month under the Neon identity is fine (history is preserved, only the same month is protected)');

-- E3. Rate overrides follow the same rule.
select throws_ok(
  $$ insert into public.payroll_rates (organization_id, attendance_source, profile_id, neon_user_id, rate_cents, updated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076004', null, 1700, '00000000-0000-0000-0000-000000076001'),
            ('00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076004', null, 1700, '00000000-0000-0000-0000-000000076001') $$,
  '23505', null, 'duplicate native rate overrides for one employee are refused');
insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
values ('00000000-0000-0000-0000-0000000760a1', 4001, 1900, '00000000-0000-0000-0000-000000076001');
select throws_like(
  $$ insert into public.payroll_rates (organization_id, attendance_source, profile_id, neon_user_id, rate_cents, updated_by)
     values ('00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076004', null, 1700, '00000000-0000-0000-0000-000000076001') $$,
  'DUAL_IDENTITY_DUPLICATE%', 'a native override cannot be added beside the linked Neon override');

-- E4. The link itself cannot be edited into a hole.
select throws_like($$ delete from public.attendance_identity_links where profile_id = '00000000-0000-0000-0000-000000076013' $$,
  'IDENTITY_LINK_IN_USE%', 'a link protecting native payroll history cannot be removed');
select throws_like($$ update public.attendance_identity_links set neon_user_id = 4999 where profile_id = '00000000-0000-0000-0000-000000076013' $$,
  'IDENTITY_LINK_IN_USE%', 'nor repointed at another Neon identity');
select throws_like($$ delete from public.attendance_identity_links where profile_id = '00000000-0000-0000-0000-000000076004' $$,
  'IDENTITY_LINK_IN_USE%', 'a link with Neon history AND native attendance (dual activity) cannot be removed either');
insert into public.payroll_periods (organization_id, attendance_source, profile_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
select '00000000-0000-0000-0000-0000000760a1', 'internal_the_lineup', '00000000-0000-0000-0000-000000076015', null, t.m, 1, 1500, 1500, '00000000-0000-0000-0000-000000076001' from t76 t;
insert into public.payroll_periods (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
select '00000000-0000-0000-0000-0000000760a1', 4015, t.m, 1, 1500, 1500, '00000000-0000-0000-0000-000000076001' from t76 t;
select throws_ok(
  $$ insert into public.attendance_identity_links (organization_id, profile_id, neon_user_id, linked_by)
     values ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076015', 4015, '00000000-0000-0000-0000-000000076001') $$,
  '23505', null, 'linking two identities that were already paid separately for one month is refused');

-- ===========================================================================
-- F. Self-read (Neon branch preserved, native branch added)
-- ===========================================================================
-- P3's period is still a draft: invisible to P3. Then it is locked and becomes visible.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076003';
select is((select count(*)::int from public.payroll_periods), 0, 'a draft native period is invisible to its employee');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076004'; -- P4, linked to Neon 4001, locked Neon period exists
select is((select count(*)::int from public.payroll_periods), 1, 'a dual-identity employee still reads their LOCKED Neon period through the link (existing policy preserved)');
select is((select attendance_source from public.payroll_periods limit 1), 'external_neon', 'and it is the Neon row');
reset role;

-- ===========================================================================
-- G. Lock, then correction after confirmation (Q6)
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select lives_ok(
  $$ update public.payroll_periods set status = 'locked', locked_at = now(), locked_by = '00000000-0000-0000-0000-000000076001' where profile_id = '00000000-0000-0000-0000-000000076003' $$,
  'a consistent native period can be locked');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076003';
select is((select count(*)::int from public.payroll_periods), 1, 'a LOCKED native period becomes visible to its own employee');
select is((select gross_cents from public.payroll_periods), 20250, 'with the frozen gross');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076016';
select is((select count(*)::int from public.payroll_periods), 0, 'an unrelated employee reads nothing');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076005';
select is((select count(*)::int from public.payroll_periods), 0, 'a foreign-organization owner reads nothing');
select is((select count(*)::int from public.payroll_attendance_consumptions), 0, 'nor any ledger row');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076003';
select is((select count(*)::int from public.payroll_attendance_consumptions), 0, 'the employee cannot read the ledger (manager-only)');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_like(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', (select m from t76)) $$,
  'PERIOD_FROZEN%', 'a locked period can never be regenerated');
reset role;

-- Digest of the locked native snapshot, to prove the correction below cannot change it.
create temp table h76 as
select md5(row_to_json(p)::text) as h from public.payroll_periods p where profile_id = '00000000-0000-0000-0000-000000076003';

-- The b1 location manager reclassifies P3's break from UNPAID to PAID (+30 min payable) after lock.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000076f001', 1, 'break was paid per house policy',
       null, null, '[{"id": 7601, "pay_classification": "paid"}]'::jsonb) $$,
  'a manager can reclassify a break (Q1), with reason, actor and history');
reset role;
select is((select pay_classification::text from public.attendance_breaks where id = 7601), 'paid', 'the break is now paid');
select is((select classified_by from public.attendance_breaks where id = 7601), '00000000-0000-0000-0000-000000076002'::uuid, 'the classifier is recorded');
select ok((select count(*) from public.attendance_events where session_id = '00000000-0000-0000-0000-00000076f001' and is_manager_correction and correction_reason = 'break was paid per house policy') = 1, 'the correction event carries the reason');
select is((select version from public.attendance_sessions where id = '00000000-0000-0000-0000-00000076f001'), 2, 'the session version moved to 2');
select is((select md5(row_to_json(p)::text) from public.payroll_periods p where profile_id = '00000000-0000-0000-0000-000000076003'), (select h from h76),
  'the CONFIRMED snapshot is byte-identical after the correction (nothing silently recalculated)');
select is((select consumed_version || '>' || current_version || ' frozen=' || period_frozen from public.payroll_attendance_consumption_staleness where session_id = '00000000-0000-0000-0000-00000076f001'),
  '1>2 frozen=true', 'the correction is detected against the consumed version');
select is((select source_version from public.payroll_attendance_consumptions where session_id = '00000000-0000-0000-0000-00000076f001' and status = 'active'), 1, 'the ledger still records the version that was paid');

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select throws_ok($$ select public.payroll_raise_consumption_reviews('00000000-0000-0000-0000-0000000760a1') $$, '42501', null, 'a location manager cannot raise organization payroll reviews');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select is(public.payroll_raise_consumption_reviews('00000000-0000-0000-0000-0000000760a1'), 1, 'owner raises exactly one pending review');
select is(public.payroll_raise_consumption_reviews('00000000-0000-0000-0000-0000000760a1'), 0, 'raising again creates no duplicate review');
select is((select count(*)::int from public.payroll_attendance_consumption_reviews where state = 'pending_review'), 1, 'one pending review');
select throws_ok(
  $$ select public.payroll_resolve_consumption_review((select id from public.payroll_attendance_consumption_reviews), 'adjustment_recorded', 'owner approves the extra half hour', null) $$,
  '22023', null, 'an adjustment decision must link a real adjustment (no money is invented here)');
select throws_ok(
  $$ select public.payroll_resolve_consumption_review((select id from public.payroll_attendance_consumption_reviews), 'adjustment_recorded', '', 1) $$,
  '22023', null, 'a decision needs a note');
-- The adjustment itself is created through the EXISTING audited flow (append-only, reasoned, signed).
insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
select organization_id, id, 750, 'Break reclassified as paid: +30 min at $15.00', '00000000-0000-0000-0000-000000076001'
from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003';
select is(
  (public.payroll_resolve_consumption_review((select id from public.payroll_attendance_consumption_reviews), 'adjustment_recorded', 'owner approves the extra half hour', (select max(id) from public.payroll_adjustments where reason like 'Break reclassified%'))) ->> 'deltaNetSeconds',
  '1800', 'the review records the independently reviewable difference: +1800 seconds');
select throws_ok(
  $$ select public.payroll_resolve_consumption_review((select id from public.payroll_attendance_consumption_reviews), 'no_adjustment_needed', 'second decision', null) $$,
  '55000', null, 'a decided review cannot be decided again');
reset role;
select is((select md5(row_to_json(p)::text) from public.payroll_periods p where profile_id = '00000000-0000-0000-0000-000000076003'), (select h from h76),
  'resolving a review still does not touch the confirmed snapshot');
select is((select count(*)::int from public.payroll_payments), 0, 'and creates no payment');
select is((select count(*)::int from public.payroll_adjustments), 1, 'and no adjustment beyond the one the owner recorded');
select is((select count(*)::int from public.audit_events where action = 'payroll_consumption_review_decided'), 1, 'the decision is audited');

-- A second correction (back to unpaid): the baseline includes the earlier adjusted delta -> -1800, not a re-pay.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000076f001', 2, 'break was in fact unpaid',
       null, null, '[{"id": 7601, "pay_classification": "unpaid"}]'::jsonb) $$,
  'a second correction on the same session');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select is(public.payroll_raise_consumption_reviews('00000000-0000-0000-0000-0000000760a1'), 1, 'a second review is raised for the new version');
insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
select organization_id, id, -750, 'Break reclassified back to unpaid: -30 min', '00000000-0000-0000-0000-000000076001'
from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076003';
select throws_ok(
  $$ select public.payroll_resolve_consumption_review((select max(id) from public.payroll_attendance_consumption_reviews), 'adjustment_recorded', 'reuse the old adjustment', (select min(id) from public.payroll_adjustments)) $$,
  '22023', null, 'an adjustment recorded before the review cannot be reused (no duplicate adjustments)');
select is(
  (public.payroll_resolve_consumption_review((select max(id) from public.payroll_attendance_consumption_reviews), 'adjustment_recorded', 'reverse the earlier extra half hour', (select max(id) from public.payroll_adjustments))) ->> 'deltaNetSeconds',
  '-1800', 'the baseline includes the earlier adjusted +1800, so the difference is -1800 (never a fresh payable shift)');
reset role;
select throws_ok(
  $$ insert into public.payroll_attendance_consumption_reviews (organization_id, location_id, profile_id, consumption_id, period_id, session_id, consumed_version, observed_version, state, decided_by, decided_at, decision_note, payroll_adjustment_id, delta_net_seconds)
     select organization_id, location_id, profile_id, consumption_id, period_id, session_id, consumed_version, 9, 'adjustment_recorded', decided_by, decided_at, 'x y z', payroll_adjustment_id, -1800
     from public.payroll_attendance_consumption_reviews where state = 'adjustment_recorded' limit 1 $$,
  '23505', null, 'one adjustment can be linked to at most one review');
select throws_ok($$ update public.payroll_attendance_consumption_reviews set decision_note = 'rewritten history' $$, '23514', null, 'a decided review is immutable');

-- ===========================================================================
-- H. Correction during DRAFT: regenerate supersedes, never double-counts
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
insert into r76 select 'p10_first', public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076010', (select m from t76));
select is((select (v ->> 'hours')::numeric from r76 where k = 'p10_first'), 8.0, 'P10 draft: 8h');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000076f010', 1, 'left an hour early',
       null, (select ((m + 10) + time '15:00')::timestamp at time zone 'UTC' + interval '7 hours' from t76)) $$,
  'a correction lands while the period is still a draft');
reset role;
select is((select count(*)::int from public.payroll_attendance_consumption_staleness where session_id = '00000000-0000-0000-0000-00000076f010' and not period_frozen), 1, 'the draft consumption is stale, not frozen');
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_like(
  $$ update public.payroll_periods set status = 'locked', locked_at = now(), locked_by = '00000000-0000-0000-0000-000000076001' where profile_id = '00000000-0000-0000-0000-000000076010' $$,
  'PERIOD_NOT_FINAL%', 'a draft holding stale attendance cannot be locked (stale corrected attendance is never silently consumed)');
insert into r76 select 'p10_second', public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076010', (select m from t76));
select is((select v ->> 'outcome' from r76 where k = 'p10_second'), 'regenerated', 'regeneration picks up the corrected version');
select is((select (v ->> 'hours')::numeric from r76 where k = 'p10_second'), 7.0, 'now 7h');
reset role;
select is((select count(*)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076010' and status = 'active'), 1, 'exactly one active ledger row for the session');
select is((select count(*)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076010' and status = 'superseded'), 1, 'the old row is kept as superseded history');
select is((select source_version from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076010' and status = 'active'), 2, 'the new row records the corrected version');
select is((select reconciles from public.payroll_native_period_reconciliation where profile_id = '00000000-0000-0000-0000-000000076010'), true, 'and still reconciles');
select throws_ok(
  $$ update public.payroll_attendance_consumptions set status = 'active', superseded_at = null, superseded_by = null, superseded_reason = null where profile_id = '00000000-0000-0000-0000-000000076010' and status = 'superseded' $$,
  '23514', null, 'a superseded row can never be revived');

-- ===========================================================================
-- I. Q1: classification gates payable time
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000076f007'), null::int, 'unclassified: payable time is NULL (never zero, never auto-deducted)');
select is((select gross_elapsed_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000076f007'), 28800, 'gross elapsed time stays independently visible');
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000076f007', 1, 'unpaid 20 minute meal break',
       null, null, '[{"id": 7607, "pay_classification": "unpaid"}]'::jsonb) $$,
  'classifying the break (with actor and reason) resolves the policy');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select is(round(((public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076007', (select m from t76))) ->> 'hours')::numeric * 3600)::int, 27600, 'P7: 8h minus the classified 20 unpaid minutes = 27600 payable seconds, no rounding rule invented');
reset role;

-- ===========================================================================
-- J. Atomicity: a failure inside generation leaves nothing
-- ===========================================================================
create function public.t76_fail() returns trigger language plpgsql as $$ begin raise exception 'forced failure' using errcode = 'XX000'; end; $$;
create trigger t76_fail_trg before insert on public.payroll_attendance_consumptions
  for each row when (new.profile_id = '00000000-0000-0000-0000-000000076011') execute function public.t76_fail();
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_ok(
  $$ select public.payroll_generate_native_period('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076011', (select m from t76)) $$,
  'XX000', 'forced failure', 'a mid-transaction failure aborts the generation');
reset role;
select is((select count(*)::int from public.payroll_periods where profile_id = '00000000-0000-0000-0000-000000076011'), 0, 'no partial period survived the failed transaction');
select is((select count(*)::int from public.payroll_attendance_consumptions where profile_id = '00000000-0000-0000-0000-000000076011'), 0, 'no partial ledger row survived');
select is((select count(*)::int from public.audit_events where entity_type = 'payroll_period' and after_state ->> 'profile_id' = '00000000-0000-0000-0000-000000076011'), 0, 'no audit row for work that did not happen');
drop trigger t76_fail_trg on public.payroll_attendance_consumptions;

-- ===========================================================================
-- K. Source-transition safety (Q9b)
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
insert into g76 select public.payroll_source_transition_readiness('00000000-0000-0000-0000-0000000760b1', 'external');
reset role;
select is((select (r ->> 'enforced')::boolean from g76), true, 'the gate is enforced once native financial processing is active');
select ok((select r -> 'blockers' ? 'open_sessions' from g76), 'readiness: an open session blocks the change');
select ok((select r -> 'blockers' ? 'unresolved_breaks' from g76), 'readiness: unclassified breaks block the change');
select ok((select r -> 'blockers' ? 'pending_consumption' from g76), 'readiness: closed, payable attendance not yet consumed blocks the change');
select ok((select r -> 'blockers' ? 'ambiguous_identity' from g76), 'readiness: a dual-identity month under Neon with unconsumed native attendance blocks the change');
select is((select (r -> 'blockers' ? 'not_period_boundary')::text from g76),
  (extract(day from (now() at time zone 'America/Chicago')::date) <> 1)::text, 'the payroll-month boundary is judged in the location time zone');
select is((select r ->> 'time_zone' from g76), 'America/Chicago', 'the readiness reports the location time zone');

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000760b1', 'external', null, 'switching sources') $$,
  '55000', null, 'a source switch with open sessions / unresolved dependencies is refused');
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000760b2', 'external') $$,
  '22023', null, 'a source switch needs a reason once the gate is enforced');
-- b2 holds only P3's consumed shift: the sole remaining blocker is the month boundary (date-dependent).
do $$
begin
  begin
    perform public.set_location_attendance_mode('00000000-0000-0000-0000-0000000760b2', 'external', null, 'planned switch at the boundary');
    insert into m76 values ('ok');
  exception when sqlstate '55000' then
    insert into m76 values ('blocked:' || sqlerrm);
  end;
end $$;
reset role;
select is((select v like 'blocked:SOURCE_TRANSITION_BLOCKED%' from m76),
  extract(day from (now() at time zone 'America/Chicago')::date) <> 1,
  'b2: the switch is refused off the boundary and permitted on it (b2 has no other unresolved dependency)');

-- ===========================================================================
-- L. Neon history is byte-identical after all native work
-- ===========================================================================
create temp table e76 as
select md5(coalesce((select string_agg(row_to_json(x)::text, '|' order by x.id) from public.payroll_periods x where x.neon_user_id in (4001, 5001, 5002)), '')) as periods,
       md5(coalesce((select string_agg(row_to_json(x)::text, '|' order by x.id) from public.payroll_rates x where x.neon_user_id = 5001), '')) as rates;
select is((select periods from e76), (select periods from d76), 'every pre-existing Neon period is byte-identical after all native work');
select is((select rates from e76), (select rates from d76), 'the Neon rate override is byte-identical');
-- mutation control: the digest really detects a change
update public.payroll_periods set gross_cents = gross_cents + 1 where neon_user_id = 5002;
select isnt(
  md5(coalesce((select string_agg(row_to_json(x)::text, '|' order by x.id) from public.payroll_periods x where x.neon_user_id in (4001, 5001, 5002)), '')),
  (select periods from e76), 'control: the digest detects a one-cent change to a Neon period');

select * from finish();
rollback;
