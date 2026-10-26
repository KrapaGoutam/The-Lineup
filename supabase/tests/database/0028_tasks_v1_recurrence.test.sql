begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------
-- Tasks V1 / T6 -- recurrence: rule -> independent occurrences.
-- Cast (org A): manager Mona, staff Ann / Bea. Org B: owner Otto.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000028002', '0281-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028004', '0281-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028005', '0281-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028008', '0281-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000028002', 'PGTAP 0281 Mona'),
  ('00000000-0000-0000-0000-000000028004', 'PGTAP 0281 Ann'),
  ('00000000-0000-0000-0000-000000028005', 'PGTAP 0281 Bea'),
  ('00000000-0000-0000-0000-000000028008', 'PGTAP 0281 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000028011', 'PGTAP 0281 Org', 'pgtap-0281-org', '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-000000028012', 'PGTAP 0281 Other', 'pgtap-0281-other', '00000000-0000-0000-0000-000000028008');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000028021', '00000000-0000-0000-0000-000000028011', 'PGTAP 0281 Loc', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000028022', '00000000-0000-0000-0000-000000028012', 'PGTAP 0281 Other Loc', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028012', '00000000-0000-0000-0000-000000028008', array['owner']::public.app_role[], true);

select set_config('t.today', ((now() at time zone 'America/Chicago')::date)::text, true);

-- 1. Pattern generation (pure date logic, fixed dates) -------------------------
insert into public.task_recurrence_rules (id, organization_id, location_id, title, frequency, weekdays, day_of_month, starts_on, end_type, ends_on, max_occurrences, created_by)
values
  ('00000000-0000-0000-0000-0000000280a1', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'weekly', 'weekly', '{5}', null, '2026-11-06', 'never', null, null, '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-0000000280a2', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'weekdays', 'weekdays', null, null, '2026-11-02', 'never', null, null, '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-0000000280a3', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'selected', 'selected_weekdays', '{1,3}', null, '2026-11-02', 'never', null, null, '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-0000000280a4', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'monthly', 'monthly', null, 31, '2026-01-31', 'never', null, null, '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-0000000280a5', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'count', 'daily', null, null, '2026-11-02', 'after_count', null, 3, '00000000-0000-0000-0000-000000028002'),
  ('00000000-0000-0000-0000-0000000280a6', '00000000-0000-0000-0000-000000028011', '00000000-0000-0000-0000-000000028021', 'until', 'daily', null, null, '2026-11-02', 'on_date', '2026-11-04', null, '00000000-0000-0000-0000-000000028002');

-- These fixtures only exercise the date logic; keep them out of generation.
update public.task_recurrence_rules set active = false;

select is(
  (select count(*)::int from private.recurrence_dates('00000000-0000-0000-0000-0000000280a1', '2026-11-01', '2026-12-05')),
  5, 'TASK-041 weekly repeats on the start date''s weekday'
);
select is(
  (select count(*)::int from private.recurrence_dates('00000000-0000-0000-0000-0000000280a2', '2026-11-02', '2026-11-08')),
  5, 'weekdays skips the weekend'
);
select is(
  (select count(*)::int from private.recurrence_dates('00000000-0000-0000-0000-0000000280a3', '2026-11-02', '2026-11-15')),
  4, 'TASK-042 selected weekdays'
);
select is(
  (select array_agg(d::text order by d) from private.recurrence_dates('00000000-0000-0000-0000-0000000280a4', '2026-01-01', '2026-04-30') d),
  array['2026-01-31','2026-02-28','2026-03-31','2026-04-30'],
  'monthly on the 31st clamps to the last day of shorter months'
);
select is(
  (select count(*)::int from private.recurrence_dates('00000000-0000-0000-0000-0000000280a5', '2026-11-01', '2027-11-01')),
  3, 'TASK-044 an occurrence count ends the series'
);
select is(
  (select count(*)::int from private.recurrence_dates('00000000-0000-0000-0000-0000000280a6', '2026-11-01', '2027-11-01')),
  3, 'TASK-044 an end date ends the series'
);

-- 2. Permissions and creation -----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028004', true);
select throws_ok(
  $$select public.task_series_create('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021','Staff series',null,'other','normal','anyone','{}',null,null,'daily',null,null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$,
  '42501', null, 'staff cannot create a series'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select throws_ok(
  $$select public.task_series_create('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021','Bad',null,'other','normal','anyone','{}',null,null,'selected_weekdays','{}',null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$,
  '22023', null, 'selected weekdays needs at least one weekday'
);
select throws_ok(
  $$select public.task_series_create('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021','Bad',null,'other','normal','anyone','{}',null,null,'daily',null,null,(now() at time zone 'America/Chicago')::date,'after_count',null,null)$$,
  '22023', null, 'a count-limited series needs a count'
);
select lives_ok(
  $$select public.task_series_create('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021','Clean ice machine','Descale it','cleaning','normal','individual',array['00000000-0000-0000-0000-000000028004']::uuid[],'15:00',null,'daily',null,null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$,
  'TASK-040 manager creates a daily series'
);
reset role;

select set_config('t.rule', (select id::text from public.task_recurrence_rules where title = 'Clean ice machine'), true);

select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid),
  15, 'occurrences exist for today and the next 14 days'
);
select is(
  (select count(distinct id)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid),
  15, 'each occurrence is its own task row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028005', true);
select is(
  public.task_recurrence_generate('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021'),
  0, 'generation is idempotent and any member may run it'
);
select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid),
  0, 'an unassigned member does not see another person''s occurrences'
);
reset role;

-- 3. Independence and history ----------------------------------------------
select set_config('t.day1', (select id::text from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and occurrence_date = current_setting('t.today')::date), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028004', true);
select lives_ok(
  format($$select public.task_complete(%L, 'done today')$$, current_setting('t.day1')),
  'the assignee completes today''s occurrence'
);
select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid),
  15, 'the assignee sees every occurrence of their series'
);
reset role;

select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and status = 'completed'),
  1, 'TASK-043 completing one occurrence leaves the others untouched'
);
select ok(
  (select active from public.task_recurrence_rules where id = current_setting('t.rule')::uuid),
  'and never changes the rule'
);

-- 4. This-and-future edit ----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028005', true);
select throws_ok(
  format($$select public.task_series_update(%L,'x',null,'other','normal','anyone','{}',null,null,'daily',null,null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$, current_setting('t.rule')),
  '42501', null, 'staff cannot edit a series'
);
select throws_ok(
  format($$select public.task_series_stop(%L)$$, current_setting('t.rule')),
  '42501', null, 'staff cannot stop a series'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select lives_ok(
  format($$select public.task_series_update(%L,'Descale ice machine',null,'cleaning','high','individual',array['00000000-0000-0000-0000-000000028004']::uuid[],'16:30',null,'daily',null,null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$, current_setting('t.rule')),
  'TASK-045 manager edits this and future occurrences'
);
reset role;

select is(
  (select title from public.tasks where id = current_setting('t.day1')::uuid),
  'Clean ice machine', 'a completed occurrence keeps its original content'
);
select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and title = 'Descale ice machine' and priority = 'high'),
  14, 'untouched future occurrences were rewritten'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select lives_ok(
  format($$select public.task_series_update(%L,'Descale ice machine',null,'cleaning','high','individual',array['00000000-0000-0000-0000-000000028004']::uuid[],'16:30',null,'selected_weekdays','{1}',null,(now() at time zone 'America/Chicago')::date,'never',null,null)$$, current_setting('t.rule')),
  'the pattern can change to Mondays only'
);
reset role;
select ok(
  (select count(*) from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and status = 'cancelled') >= 10,
  'future occurrences the new pattern no longer produces are cancelled, not deleted'
);
select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and status = 'completed'),
  1, 'history is preserved after the pattern change'
);

-- 5. Stop ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select lives_ok(
  format($$select public.task_series_stop(%L)$$, current_setting('t.rule')),
  'manager ends the series'
);
reset role;
select is(
  (select count(*)::int from public.tasks where recurrence_rule_id = current_setting('t.rule')::uuid and status in ('open', 'in_progress')),
  0, 'no future work remains after stopping'
);

-- 6. Integrity and privacy ------------------------------------------------------
select throws_ok(
  format($$insert into public.tasks (organization_id, location_id, title, created_by, recurrence_rule_id, occurrence_date)
           values ('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021','dup','00000000-0000-0000-0000-000000028002', %L, %L)$$,
         current_setting('t.rule'), current_setting('t.today')),
  '23505', null, 'a date can only have one occurrence per rule'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028004', true);
select is((select count(*)::int from public.task_recurrence_rules), 0, 'staff cannot read series definitions');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028008', true);
select throws_ok(
  $$select public.task_recurrence_generate('00000000-0000-0000-0000-000000028011','00000000-0000-0000-0000-000000028021')$$,
  '42501', null, 'TASK-070 another organization cannot run generation here'
);
reset role;

select * from finish();
rollback;
