begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(108);

-- ---------------------------------------------------------------------
-- Tasks V1.1 / T-4 -- Opening reminder engine (PLAN D-4, #154).
-- Stages open / plus_15 / plus_30 for incomplete Opening work, decided by the
-- database from an injected clock (private.tasks_opening_reminders_run), never
-- by a client.
--
-- Cast, org A: managers Mona (general_manager), Olive (owner), Asa
--   (shift_manager = Assistant Manager); staff Ann / Bea (server), Hal (host);
--   inactive Cal. Org B: owner Otto.
-- Locations, org A: Main (Chicago, 09:00), Second (Chicago, hours rows),
--   NY (New York), Rpc (Chicago, opens 00:00 -- real clock, RPC path).
-- Every Opening day has four items: U (anyone), Ann (individual Ann),
--   Bea (individual Bea), Team (all_team). Scope: managers 4, Ann 3, Bea 3, Hal 2.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000042101', '0421-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042102', '0421-olive@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042103', '0421-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042104', '0421-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042105', '0421-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042106', '0421-hal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042107', '0421-cal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000042108', '0421-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000042101', 'PGTAP 0421 Mona'),
  ('00000000-0000-0000-0000-000000042102', 'PGTAP 0421 Olive'),
  ('00000000-0000-0000-0000-000000042103', 'PGTAP 0421 Asa'),
  ('00000000-0000-0000-0000-000000042104', 'PGTAP 0421 Ann'),
  ('00000000-0000-0000-0000-000000042105', 'PGTAP 0421 Bea'),
  ('00000000-0000-0000-0000-000000042106', 'PGTAP 0421 Hal'),
  ('00000000-0000-0000-0000-000000042107', 'PGTAP 0421 Cal'),
  ('00000000-0000-0000-0000-000000042108', 'PGTAP 0421 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000042111', 'PGTAP 0421 Org', 'pgtap-0421-org', '00000000-0000-0000-0000-000000042101'),
  ('00000000-0000-0000-0000-000000042112', 'PGTAP 0421 Other', 'pgtap-0421-other', '00000000-0000-0000-0000-000000042108');

insert into public.locations (id, organization_id, name, time_zone, opening_local, closing_local)
values
  ('00000000-0000-0000-0000-000000042121', '00000000-0000-0000-0000-000000042111', 'PGTAP 0421 Main', 'America/Chicago', '09:00', '23:00'),
  ('00000000-0000-0000-0000-000000042122', '00000000-0000-0000-0000-000000042112', 'PGTAP 0421 Other Loc', 'America/Chicago', '09:00', '23:00'),
  ('00000000-0000-0000-0000-000000042123', '00000000-0000-0000-0000-000000042111', 'PGTAP 0421 Second', 'America/Chicago', '09:00', '23:00'),
  ('00000000-0000-0000-0000-000000042124', '00000000-0000-0000-0000-000000042111', 'PGTAP 0421 NY', 'America/New_York', '09:00', '23:00'),
  ('00000000-0000-0000-0000-000000042125', '00000000-0000-0000-0000-000000042111', 'PGTAP 0421 Rpc', 'America/Chicago', '00:00', '23:00');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042101', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042102', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042103', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042105', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', array['host']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042107', array['host']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000042112', '00000000-0000-0000-0000-000000042108', array['owner']::public.app_role[], true);

-- One Opening template (with the four items) per location.
insert into public.checklist_templates (id, organization_id, location_id, kind, name, created_by)
values
  ('00000000-0000-0000-0000-000000042131', '00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121', 'opening', 'Opening', '00000000-0000-0000-0000-000000042101'),
  ('00000000-0000-0000-0000-000000042132', '00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042123', 'opening', 'Opening', '00000000-0000-0000-0000-000000042101'),
  ('00000000-0000-0000-0000-000000042133', '00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042124', 'opening', 'Opening', '00000000-0000-0000-0000-000000042101');
insert into public.checklist_template_items (id, template_id, organization_id, title, category, sort_order)
select ('00000000-0000-0000-0000-0000000421' || n::text)::uuid, t.id, '00000000-0000-0000-0000-000000042111', x.title, 'opening', x.pos
from (values
  ('00000000-0000-0000-0000-000000042131'::uuid, 41, 'U', 1), ('00000000-0000-0000-0000-000000042131'::uuid, 42, 'Ann', 2),
  ('00000000-0000-0000-0000-000000042131'::uuid, 43, 'Bea', 3), ('00000000-0000-0000-0000-000000042131'::uuid, 44, 'Team', 4),
  ('00000000-0000-0000-0000-000000042132'::uuid, 51, 'U', 1), ('00000000-0000-0000-0000-000000042132'::uuid, 52, 'Ann', 2),
  ('00000000-0000-0000-0000-000000042132'::uuid, 53, 'Bea', 3), ('00000000-0000-0000-0000-000000042132'::uuid, 54, 'Team', 4),
  ('00000000-0000-0000-0000-000000042133'::uuid, 61, 'U', 1), ('00000000-0000-0000-0000-000000042133'::uuid, 62, 'Ann', 2),
  ('00000000-0000-0000-0000-000000042133'::uuid, 63, 'Bea', 3), ('00000000-0000-0000-0000-000000042133'::uuid, 64, 'Team', 4)
) as x(tpl, n, title, pos)
join public.checklist_templates t on t.id = x.tpl;

-- Fixture helpers (superuser only).
create function pg_temp.mk_day(p_loc uuid, p_date date) returns uuid
language plpgsql as $f$
declare
  v_tpl uuid := case p_loc
    when '00000000-0000-0000-0000-000000042121' then '00000000-0000-0000-0000-000000042131'::uuid
    when '00000000-0000-0000-0000-000000042123' then '00000000-0000-0000-0000-000000042132'::uuid
    else '00000000-0000-0000-0000-000000042133'::uuid end;
  v_base int := case p_loc
    when '00000000-0000-0000-0000-000000042121' then 40
    when '00000000-0000-0000-0000-000000042123' then 50
    else 60 end;
  v_inst uuid;
  v_titles text[] := array['U', 'Ann', 'Bea', 'Team'];
  v_modes text[] := array['anyone', 'individual', 'individual', 'all_team'];
  v_who uuid[] := array[null, '00000000-0000-0000-0000-000000042104', '00000000-0000-0000-0000-000000042105', null]::uuid[];
  i int;
begin
  insert into public.checklist_instances (organization_id, location_id, template_id, kind, name, service_date, generated_by)
  values ('00000000-0000-0000-0000-000000042111', p_loc, v_tpl, 'opening', 'Opening', p_date, '00000000-0000-0000-0000-000000042101')
  returning id into v_inst;
  for i in 1..4 loop
    perform private.tasks_insert(
      '00000000-0000-0000-0000-000000042111', p_loc, 'opening'::public.task_kind, v_titles[i], null, 'opening',
      'normal'::public.task_priority, v_modes[i]::public.task_assignment_mode,
      case when v_who[i] is null then '{}'::uuid[] else array[v_who[i]] end,
      null, p_date, null, 'before_opening'::public.task_due_window, '00000000-0000-0000-0000-000000042101',
      null, null, null, v_inst, ('00000000-0000-0000-0000-0000000421' || (v_base + i)::text)::uuid, i, false);
  end loop;
  return v_inst;
end $f$;

create function pg_temp.item(p_loc uuid, p_date date, p_title text) returns uuid
language sql as $f$
  select t.id from public.tasks t
  join public.checklist_instances ci on ci.id = t.checklist_instance_id
  where ci.location_id = p_loc and ci.service_date = p_date and t.title = p_title;
$f$;

-- Records a status change the way the lifecycle RPCs would (row + audit event),
-- at an explicit instant so history can be arranged.
create function pg_temp.finish(p_task uuid, p_what text, p_at timestamptz) returns void
language plpgsql as $f$
declare
  v_mona uuid := '00000000-0000-0000-0000-000000042101';
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if p_what = 'completed' then
    update public.tasks set status = 'completed', completed_by = v_mona, completed_at = p_at where id = p_task;
  elsif p_what = 'cancelled' then
    update public.tasks set status = 'cancelled', cancelled_by = v_mona, cancelled_at = p_at where id = p_task;
  elsif p_what = 'reopened' then
    update public.tasks set status = 'open', completed_by = null, completed_at = null where id = p_task;
  end if;
  insert into public.task_events (organization_id, task_id, checklist_instance_id, event_type, actor_profile_id, created_at)
  values (t.organization_id, p_task, t.checklist_instance_id, p_what::public.task_event_type, v_mona, p_at);
end $f$;

create function pg_temp.finish_all(p_loc uuid, p_date date, p_what text, p_at timestamptz) returns void
language sql as $f$
  select pg_temp.finish(t.id, p_what, p_at)
  from public.tasks t join public.checklist_instances ci on ci.id = t.checklist_instance_id
  where ci.location_id = p_loc and ci.service_date = p_date;
$f$;

create function pg_temp.at(p_date date, p_time text, p_tz text default 'America/Chicago') returns timestamptz
language sql as $f$ select ((p_date + p_time::time) at time zone p_tz) $f$;

create function pg_temp.run(p_loc uuid, p_now timestamptz) returns integer
language sql as $f$
  select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', p_loc, p_now)
$f$;

create function pg_temp.rows(p_date date, p_stage text, p_loc uuid default '00000000-0000-0000-0000-000000042121') returns integer
language sql as $f$
  select count(*)::int from public.task_notifications
  where type = 'opening_reminder' and payload ->> 'service_date' = p_date::text
    and payload ->> 'stage' = p_stage and payload ->> 'location_id' = p_loc::text
$f$;

create function pg_temp.profile_rows(p_profile uuid, p_date date, p_stage text) returns integer
language sql as $f$
  select count(*)::int from public.task_notifications
  where type = 'opening_reminder' and recipient_profile_id = p_profile
    and payload ->> 'service_date' = p_date::text and payload ->> 'stage' = p_stage
$f$;

select set_config('t.main', '00000000-0000-0000-0000-000000042121', true);
select set_config('t.second', '00000000-0000-0000-0000-000000042123', true);
select set_config('t.ny', '00000000-0000-0000-0000-000000042124', true);

-- A legacy ordinary notification written before this engine: it must survive.
insert into public.tasks (id, organization_id, location_id, kind, title, created_by)
values ('00000000-0000-0000-0000-000000042901', '00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121', 'task', 'Legacy task', '00000000-0000-0000-0000-000000042101');
insert into public.task_notifications (organization_id, recipient_profile_id, type, task_id, title, body)
values ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'assigned', '00000000-0000-0000-0000-000000042901', 'Old assignment', 'Legacy task');

-- Mon 2026-06-01 base day (Main + Second), 09:00 CDT = 14:00Z.
select pg_temp.mk_day('00000000-0000-0000-0000-000000042121', date '2026-06-01');
select pg_temp.mk_day('00000000-0000-0000-0000-000000042123', date '2026-06-01');

-- ===== 1. Function shape and privileges (TS-038, security-definer review) ============
select is(
  (select proargnames from pg_proc where oid = 'public.task_opening_reminders_sweep(uuid, uuid)'::regprocedure),
  array['p_organization_id', 'p_location_id'],
  'TS-038 the sweep takes only the tenant: no recipient, stage, date or time argument'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.task_opening_reminders_sweep(uuid, uuid)'::regprocedure,
     'private.tasks_opening_reminders_run(uuid, uuid, timestamptz)'::regprocedure,
     'private.tasks_profile_can_access_location(uuid, uuid, uuid)'::regprocedure,
     'private.tasks_notify(uuid, uuid, public.task_notification_type, uuid, uuid, text, text, text, jsonb)'::regprocedure)),
  'every new or replaced function is SECURITY DEFINER with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.task_opening_reminders_sweep(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.task_opening_reminders_sweep(uuid, uuid)', 'execute'),
  'the sweep RPC is callable by authenticated and not by anon'
);
select ok(
  not has_function_privilege('authenticated', 'private.tasks_opening_reminders_run(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'private.tasks_opening_reminders_run(uuid, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.tasks_notify(uuid, uuid, public.task_notification_type, uuid, uuid, text, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.tasks_profile_can_access_location(uuid, uuid, uuid)', 'execute'),
  'the clock-injectable evaluator, the writer and the recipient helper are not callable by clients'
);

-- ===== 2. Before opening, then OPEN (TS-021) ============================================
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '08:59:59')), 0, 'no reminder one second before opening');
select is((select count(*)::int from public.task_notifications where type = 'opening_reminder'), 0, 'nothing stored before opening');

select is(
  pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:00:00')),
  6, 'TS-021 OPEN stores one reminder per eligible recipient: 3 management + Ann + Bea + Hal'
);
select is(
  (select array_agg(recipient_profile_id::text order by recipient_profile_id::text)
   from public.task_notifications where type = 'opening_reminder' and payload ->> 'stage' = 'open'),
  array['00000000-0000-0000-0000-000000042101', '00000000-0000-0000-0000-000000042102', '00000000-0000-0000-0000-000000042103',
        '00000000-0000-0000-0000-000000042104', '00000000-0000-0000-0000-000000042105', '00000000-0000-0000-0000-000000042106'],
  'recipients are Owner, Manager, Assistant Manager and the three authorized staff -- not inactive Cal, not org B'
);
select is(pg_temp.profile_rows('00000000-0000-0000-0000-000000042107', date '2026-06-01', 'open'), 0, 'an inactive member gets nothing');
select is(pg_temp.profile_rows('00000000-0000-0000-0000-000000042108', date '2026-06-01', 'open'), 0, 'another organization''s owner gets nothing');

-- Counts: scope-local (TS-039).
select is(
  (select array_agg((payload ->> 'incomplete_count')::int order by recipient_profile_id::text)
   from public.task_notifications where type = 'opening_reminder' and payload ->> 'stage' = 'open'),
  array[4, 4, 4, 3, 3, 2],
  'TS-039 management count covers all 4 items; Ann 3, Bea 3, Hal 2 -- each only their own scope'
);

-- Staff privacy, in the stored data (TS-033).
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder' and (task_id is not null or checklist_instance_id is not null)),
  0, 'TS-033 no reminder references a task or a checklist instance'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder'
     and (title || ' ' || coalesce(body, '') || ' ' || payload::text) ~* '\m(Ann|Bea|Hal|Cal|Mona|Olive|Asa|Otto|Unlock|Team)\M'),
  0, 'TS-033 no reminder text or payload names a person or a task'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder' and recipient_profile_id = '00000000-0000-0000-0000-000000042104'
     and (payload ->> 'incomplete_count')::int = 3 and body = '3 Opening tasks are not complete'),
  1, 'Ann''s OPEN says 3, never the management total of 4'
);
select is(
  (select count(*)::int from public.task_notifications n, jsonb_object_keys(n.payload) k
   where n.id = (select min(id) from public.task_notifications where type = 'opening_reminder')),
  6, 'the payload is the minimal contract: stage, service_date, location_id, stage_at, incomplete_count, incomplete_now'
);
select is(
  (select payload ->> 'stage_at' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'stage' = 'open' limit 1),
  '2026-06-01T14:00:00Z', 'the stage instant is stored as an absolute UTC time (09:00 CDT)'
);
select is(
  (select title from public.task_notifications where type = 'opening_reminder' and payload ->> 'stage' = 'open' limit 1),
  'Opening tasks are not complete', 'OPEN title'
);

-- Idempotency (TS-026 / TS-028).
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:00:00')), 0, 'TS-026 repeating the same evaluation stores nothing');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:14:59')), 0, 'TS-022 plus_15 is not due one second early');
select is((select count(*)::int from public.task_notifications where type = 'opening_reminder'), 6, 'still 6 rows: no duplicates after retries');

-- ===== 3. plus_15 and plus_30, nothing after (TS-022 / 023 / 035) =======================
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:15:00')), 6, 'TS-022 plus_15 is stored at +15:00 for the same six recipients');
select is(
  (select distinct payload ->> 'stage_at' from public.task_notifications where type = 'opening_reminder' and payload ->> 'stage' = 'plus_15'),
  '2026-06-01T14:15:00Z', 'plus_15 is exactly 15 minutes after opening'
);
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:29:59')), 0, 'TS-023 plus_30 is not due one second early');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', '09:30:00')), 6, 'TS-023 plus_30 is stored at +30:00');
select is(
  (select distinct payload ->> 'stage_at' from public.task_notifications where type = 'opening_reminder' and payload ->> 'stage' = 'plus_30'),
  '2026-06-01T14:30:00Z', 'plus_30 is exactly 30 minutes after opening'
);
select is(
  (select coalesce(sum(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-01', x))), 0)::int
   from unnest(array['09:31', '09:45', '10:00', '13:00', '23:59:59']) as x),
  0, 'TS-035 no stage after plus_30: evaluations at 09:31, 09:45, 10:00, 13:00 and 23:59 store nothing'
);
select is((select count(*)::int from public.task_notifications where type = 'opening_reminder'), 18, '3 stages x 6 recipients = 18 rows, never more');
select is(
  (select count(*)::int from (select recipient_profile_id, dedupe_key from public.task_notifications
    where type = 'opening_reminder' group by 1, 2 having count(*) > 1) d),
  0, 'recipient-stage uniqueness: no (recipient, dedupe_key) pair is stored twice'
);
select is(
  (select count(distinct dedupe_key)::int from public.task_notifications where type = 'opening_reminder'),
  3, 'one dedupe key per stage: opening_reminder:<location>:<date>:<stage>'
);
select is(
  (select min(dedupe_key) from public.task_notifications where type = 'opening_reminder'),
  'opening_reminder:00000000-0000-0000-0000-000000042121:2026-06-01:open', 'the key encodes location, service date and stage'
);

-- Cross-location isolation (TS-037): the Second location had its own items.
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.second')),
  0, 'TS-037 sweeping Main stored nothing about Second''s items'
);
select is(
  pg_temp.run(current_setting('t.second')::uuid, pg_temp.at(date '2026-06-01', '09:00')),
  6, 'TS-037 Second evaluates on its own with its own key'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.main')),
  18, 'TS-037 and Main''s rows are untouched'
);

-- ===== 4. Completed / cancelled work (TS-020 / 024 / 025 / 045) =========================
-- 4a. Everything done before opening: no reminder at all.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-02');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-02', 'completed', pg_temp.at(date '2026-06-02', '08:50'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-02', '09:00')), 0, 'TS-020 Opening complete before opening: no OPEN');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-02', '09:45')), 0, 'TS-020 and no catch-up stage later either');

-- 4b. Everything cancelled: cancelled items never count (TS-045).
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-03');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-03', 'cancelled', pg_temp.at(date '2026-06-03', '08:30'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-03', '09:00')), 0, 'TS-045 all Opening items cancelled before OPEN: no reminder for anyone');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-03', '09:40')), 0, 'TS-045 still none at +30 and beyond');

-- 4c. Complete at T+8: OPEN already stored; no +15, no +30 (TS-024).
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-05');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-05', '09:00')), 6, 'TS-024 OPEN is stored while the work is open');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-05', 'completed', pg_temp.at(date '2026-06-05', '09:08'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-05', '09:16')), 0, 'TS-024 completed at T+8: no plus_15');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-05', '09:31')), 0, 'TS-024 completed at T+8: no plus_30');

-- 4d. Complete T+5, reopen T+20, first look at T+31 (TS-025). OPEN and plus_30
-- were truly incomplete at their instants; plus_15 was complete at its own.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-08');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-08', 'completed', pg_temp.at(date '2026-06-08', '09:05'));
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-08', 'reopened', pg_temp.at(date '2026-06-08', '09:20'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-08', '09:31')), 12, 'TS-025 a late first look stores OPEN and plus_30 (2 stages x 6)');
select is(pg_temp.rows(date '2026-06-08', 'open'), 6, 'TS-025 OPEN was incomplete at 09:00 (work done at 09:05)');
select is(pg_temp.rows(date '2026-06-08', 'plus_15'), 0, 'TS-025 plus_15 is NOT back-filled: the work was complete at 09:15');
select is(pg_temp.rows(date '2026-06-08', 'plus_30'), 6, 'TS-025 plus_30 is stored: reopened at 09:20, incomplete at 09:30');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-08', '09:31')), 0, 'TS-028 re-evaluating the same moment stores nothing');

-- 4e. Cancelled between stages (spec 11).
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-09');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-09', '09:00')), 6, 'OPEN stored before the cancellation');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-09', 'cancelled', pg_temp.at(date '2026-06-09', '09:10'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-09', '09:40')), 0, 'cancelled before +15: no plus_15 and no plus_30');

select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-10');
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-10', '09:15')), 12, 'OPEN and plus_15 stored while the work is open');
select pg_temp.finish_all(current_setting('t.main')::uuid, date '2026-06-10', 'cancelled', pg_temp.at(date '2026-06-10', '09:20'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-10', '09:31')), 0, 'cancelled before +30: no plus_30');

-- 4f. Staff with no authorized incomplete item get nothing while management does (TS-046).
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-11');
select pg_temp.finish(pg_temp.item(current_setting('t.main')::uuid, date '2026-06-11', 'U'), 'completed', pg_temp.at(date '2026-06-11', '08:00'));
select pg_temp.finish(pg_temp.item(current_setting('t.main')::uuid, date '2026-06-11', 'Ann'), 'completed', pg_temp.at(date '2026-06-11', '08:00'));
select pg_temp.finish(pg_temp.item(current_setting('t.main')::uuid, date '2026-06-11', 'Team'), 'completed', pg_temp.at(date '2026-06-11', '08:00'));
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-11', '09:00')), 4, 'TS-046 only Bea''s own item is open: 3 management + Bea');
select is(
  (select array_agg(recipient_profile_id::text order by recipient_profile_id::text) from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'service_date' = '2026-06-11'),
  array['00000000-0000-0000-0000-000000042101', '00000000-0000-0000-0000-000000042102', '00000000-0000-0000-0000-000000042103', '00000000-0000-0000-0000-000000042105'],
  'TS-046 Ann and Hal (nothing authorized and open) get nothing, Bea gets hers'
);
select is(
  (select payload ->> 'incomplete_count' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'service_date' = '2026-06-11' and recipient_profile_id = '00000000-0000-0000-0000-000000042105'),
  '1', 'Bea''s count is her single item'
);

-- 4g. Recipients are judged when the stage is stored, not when the day was built.
-- Deactivated between generation and evaluation: nothing for them.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-12');
update public.memberships set active = false
where organization_id = '00000000-0000-0000-0000-000000042111' and profile_id = '00000000-0000-0000-0000-000000042106';
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-12', '09:00')), 5, 'a member deactivated before the stage is not a recipient (3 management + Ann + Bea)');
select is(pg_temp.profile_rows('00000000-0000-0000-0000-000000042106', date '2026-06-12', 'open'), 0, 'the deactivated member has no reminder');
update public.memberships set active = true
where organization_id = '00000000-0000-0000-0000-000000042111' and profile_id = '00000000-0000-0000-0000-000000042106';

-- Role change: a host promoted to Assistant Manager is judged as management.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-17');
update public.memberships set roles = array['shift_manager']::public.app_role[]
where organization_id = '00000000-0000-0000-0000-000000042111' and profile_id = '00000000-0000-0000-0000-000000042106';
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-17', '09:00')), 6, 'a role change is honoured at evaluation: still six recipients');
select is(
  (select (payload ->> 'incomplete_count')::int from public.task_notifications
   where recipient_profile_id = '00000000-0000-0000-0000-000000042106' and payload ->> 'service_date' = '2026-06-17'),
  4, 'the promoted member''s scope is the whole checklist (4), no longer the 2 items a host could work'
);
update public.memberships set roles = array['host']::public.app_role[]
where organization_id = '00000000-0000-0000-0000-000000042111' and profile_id = '00000000-0000-0000-0000-000000042106';

-- Reassignment: Ann's individual item moves to Bea before the stage.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-18');
update public.task_assignments set profile_id = '00000000-0000-0000-0000-000000042105'
where task_id = pg_temp.item(current_setting('t.main')::uuid, date '2026-06-18', 'Ann');
select pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-18', '09:00'));
select is(
  (select (payload ->> 'incomplete_count')::int from public.task_notifications
   where recipient_profile_id = '00000000-0000-0000-0000-000000042104' and payload ->> 'service_date' = '2026-06-18'),
  2, 'after reassignment Ann can work only U and Team (2)');
select is(
  (select (payload ->> 'incomplete_count')::int from public.task_notifications
   where recipient_profile_id = '00000000-0000-0000-0000-000000042105' and payload ->> 'service_date' = '2026-06-18'),
  4, 'and Bea now works U, Ann''s old item, her own and Team (4)');

-- ===== 5. Late evaluation (TS-034) =======================================================
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-04');
select is(
  pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-04', '09:34')),
  18, 'TS-034 a first look at T+34 on still-open work persists every truly missed stage once (3 x 6), nothing more'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'service_date' = '2026-06-04' and recipient_profile_id = '00000000-0000-0000-0000-000000042104'),
  3, 'TS-034 bounded: at most one row per stage per recipient per service date'
);
select is(pg_temp.run(current_setting('t.main')::uuid, pg_temp.at(date '2026-06-04', '09:35')), 0, 'TS-034 and a later look adds none');

-- ===== 6. Time zone, hours, business date (TS-029 / 036) ==================================
-- Run under a different session time zone: the location's zone must decide.
set local timezone = 'Pacific/Auckland';
select pg_temp.mk_day(current_setting('t.ny')::uuid, date '2026-06-01');
select is(
  private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-06-01 12:59:59+00'),
  0, 'TS-029 09:00 New York (EDT) has not arrived at 12:59:59Z'
);
select is(
  private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-06-01 13:00:00+00'),
  6, 'TS-029 New York opens at 13:00Z, regardless of the session time zone'
);
select is(
  (select distinct payload ->> 'stage_at' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.ny') and payload ->> 'stage' = 'open'),
  '2026-06-01T13:00:00Z', 'TS-029 the same wall time is a different instant in each location (Main was 14:00Z)'
);
reset timezone;

-- Operating hours override the location fallback; a closed day emits nothing.
insert into public.operating_hours (organization_id, location_id, day_of_week, opening_local, closing_local, closed)
values
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042123', 3, null, null, true),
  ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042123', 4, '10:30', '22:00', false);
select pg_temp.mk_day(current_setting('t.second')::uuid, date '2026-06-10');
select is(pg_temp.run(current_setting('t.second')::uuid, pg_temp.at(date '2026-06-10', '13:00')), 0, 'TS-036 a closed day emits nothing');
select pg_temp.mk_day(current_setting('t.second')::uuid, date '2026-06-11');
select is(pg_temp.run(current_setting('t.second')::uuid, pg_temp.at(date '2026-06-11', '09:00')), 0, 'TS-036 operating_hours 10:30 wins over the 09:00 fallback: nothing at 09:00');
select is(pg_temp.run(current_setting('t.second')::uuid, pg_temp.at(date '2026-06-11', '10:30')), 6, 'TS-036 ... and OPEN fires at 10:30');
select is(
  (select distinct payload ->> 'stage_at' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.second') and payload ->> 'service_date' = '2026-06-11'),
  '2026-06-11T15:30:00Z', 'TS-036 10:30 CDT is 15:30Z');

-- Business date: the location's local date, not the UTC date.
select pg_temp.mk_day(current_setting('t.main')::uuid, date '2026-06-15');
select is(
  private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.main')::uuid, timestamptz '2026-06-16 04:30:00+00'),
  18, 'business date: 04:30Z on 06-16 is 23:30 on 06-15 in Chicago, so it evaluates 06-15''s Opening'
);
select is(pg_temp.rows(date '2026-06-15', 'open'), 6, 'the reminders carry service_date 2026-06-15, not the UTC date');
select is(pg_temp.rows(date '2026-06-16', 'open'), 0, 'nothing is filed under the UTC date 2026-06-16');
select is(
  private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.main')::uuid, timestamptz '2026-06-16 05:00:00+00'),
  0, 'at local midnight the service date rolls to 06-16, which has no Opening: yesterday''s work is not re-announced'
);

-- ===== 7. DST (TS-030): stage instants are absolute, never offset-shifted ====================
-- Spring forward, New York, Sun 2026-03-08 (02:00 EST jumps to 03:00 EDT).
insert into public.operating_hours (organization_id, location_id, day_of_week, opening_local, closing_local, closed)
values ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042124', 0, '01:50', '22:00', false);
select pg_temp.mk_day(current_setting('t.ny')::uuid, date '2026-03-08');
select is(
  private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-03-08 08:00:00+00'),
  18, 'DST spring-forward: opening 01:50 EST, all three stages are due by 08:00Z'
);
select is(
  (select array_agg(distinct payload ->> 'stage_at' order by payload ->> 'stage_at') from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.ny') and payload ->> 'service_date' = '2026-03-08'),
  array['2026-03-08T06:50:00Z', '2026-03-08T07:05:00Z', '2026-03-08T07:20:00Z'],
  'DST spring-forward: 01:50 EST, then +15 and +30 are 07:05Z / 07:20Z (03:05 and 03:20 EDT) -- exactly 15 minutes apart as instants'
);
-- Same location, ordinary days either side of the change: the offset moved, not the wall time.
select pg_temp.mk_day(current_setting('t.ny')::uuid, date '2026-03-07');
select pg_temp.mk_day(current_setting('t.ny')::uuid, date '2026-03-09');
select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-03-07 15:00:00+00');
select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-03-09 15:00:00+00');
select is(
  (select payload ->> 'stage_at' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.ny') and payload ->> 'service_date' = '2026-03-07' and payload ->> 'stage' = 'open' limit 1),
  '2026-03-07T14:00:00Z', 'DST: 09:00 on 03-07 is 14:00Z (EST)'
);
select is(
  (select payload ->> 'stage_at' from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.ny') and payload ->> 'service_date' = '2026-03-09' and payload ->> 'stage' = 'open' limit 1),
  '2026-03-09T13:00:00Z', 'DST: 09:00 on 03-09 is 13:00Z (EDT) -- a fixed UTC offset would be wrong'
);

-- Spring-forward gap: 02:30 does not exist on 03-08. The opening must still be a
-- single valid instant with stages exactly 15 / 30 minutes apart.
update public.operating_hours set opening_local = '02:30'
where location_id = '00000000-0000-0000-0000-000000042124' and day_of_week = 0;
delete from public.task_notifications where payload ->> 'service_date' = '2026-03-08';
select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-03-08 09:00:00+00');
select is(
  (select (max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'plus_30')
         - max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'open'))
   from public.task_notifications where type = 'opening_reminder' and payload ->> 'service_date' = '2026-03-08'),
  interval '30 minutes', 'DST gap: an opening time that does not exist still yields +30 exactly 30 minutes after OPEN'
);

-- Fall back, New York, Sun 2026-11-01 (02:00 EDT returns to 01:00 EST).
update public.operating_hours set opening_local = '00:50'
where location_id = '00000000-0000-0000-0000-000000042124' and day_of_week = 0;
select pg_temp.mk_day(current_setting('t.ny')::uuid, date '2026-11-01');
select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-11-01 08:00:00+00');
select is(
  (select array_agg(distinct payload ->> 'stage_at' order by payload ->> 'stage_at') from public.task_notifications
   where type = 'opening_reminder' and payload ->> 'location_id' = current_setting('t.ny') and payload ->> 'service_date' = '2026-11-01'),
  array['2026-11-01T04:50:00Z', '2026-11-01T05:05:00Z', '2026-11-01T05:20:00Z'],
  'DST fall-back: 00:50 EDT, +15 = 01:05 EDT, +30 = 01:20 EDT, exactly 15 minutes apart'
);
-- Ambiguous opening (01:50 happens twice): one valid instant, exact 15/30 gaps.
update public.operating_hours set opening_local = '01:50'
where location_id = '00000000-0000-0000-0000-000000042124' and day_of_week = 0;
delete from public.task_notifications where payload ->> 'service_date' = '2026-11-01';
select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', current_setting('t.ny')::uuid, timestamptz '2026-11-01 12:00:00+00');
select is(
  (select max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'plus_30')
        - max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'open')
   from public.task_notifications where type = 'opening_reminder' and payload ->> 'service_date' = '2026-11-01'),
  interval '30 minutes', 'DST ambiguous hour: an opening time that occurs twice still yields +30 exactly 30 minutes after OPEN'
);
select is(
  (select max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'plus_15')
        - max((payload ->> 'stage_at')::timestamptz) filter (where payload ->> 'stage' = 'open')
   from public.task_notifications where type = 'opening_reminder' and payload ->> 'service_date' = '2026-11-01'),
  interval '15 minutes', 'DST ambiguous hour: plus_15 is exactly 15 minutes after OPEN'
);

-- ===== 8. The writer gate: fail closed (spec 25) ============================================
-- A valid direct call is stored; every malformed or cross-tenant variant is not.
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'valid', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-01:open',
  jsonb_build_object('stage', 'open', 'service_date', '2026-07-01', 'location_id', '00000000-0000-0000-0000-000000042121'));
select is((select count(*)::int from public.task_notifications where body = 'valid'), 1, 'a structured reminder passes the gate');
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'bad key', 'opening_reminder:wrong', jsonb_build_object('stage', 'open', 'service_date', '2026-07-01', 'location_id', '00000000-0000-0000-0000-000000042121'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'bad stage', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-01:plus_45', jsonb_build_object('stage', 'plus_45', 'service_date', '2026-07-01', 'location_id', '00000000-0000-0000-0000-000000042121'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'foreign location', 'opening_reminder:00000000-0000-0000-0000-000000042122:2026-07-01:open', jsonb_build_object('stage', 'open', 'service_date', '2026-07-01', 'location_id', '00000000-0000-0000-0000-000000042122'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'no payload', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-02:open', null);
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder', null, null,
  't', 'garbage', 'opening_reminder:x:y:open', jsonb_build_object('stage', 'open', 'service_date', 'not-a-date', 'location_id', 'not-a-uuid'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder',
  pg_temp.item(current_setting('t.main')::uuid, date '2026-06-01', 'U'), null,
  't', 'with task', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-03:open',
  jsonb_build_object('stage', 'open', 'service_date', '2026-07-03', 'location_id', '00000000-0000-0000-0000-000000042121'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042106', 'opening_reminder',
  pg_temp.item(current_setting('t.main')::uuid, date '2026-06-01', 'U'), null, 't', 'task but no payload', null, null);
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042107', 'opening_reminder', null, null,
  't', 'inactive', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-04:open', jsonb_build_object('stage', 'open', 'service_date', '2026-07-04', 'location_id', '00000000-0000-0000-0000-000000042121'));
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042108', 'opening_reminder', null, null,
  't', 'foreign recipient', 'opening_reminder:00000000-0000-0000-0000-000000042121:2026-07-05:open', jsonb_build_object('stage', 'open', 'service_date', '2026-07-05', 'location_id', '00000000-0000-0000-0000-000000042121'));
select is(
  (select count(*)::int from public.task_notifications
   where body in ('bad key', 'bad stage', 'foreign location', 'no payload', 'garbage', 'with task', 'task but no payload', 'inactive', 'foreign recipient')),
  0, 'wrong key, unknown stage, foreign location, no payload, garbage, task reference, inactive and cross-org recipient all store nothing'
);

-- T-3 regression: ordinary notifications stay suppressed; checklist announcements and Opening/Closing task events stay allowed.
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'assigned', '00000000-0000-0000-0000-000000042901', null, 't', 'still dropped', null);
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'overdue', '00000000-0000-0000-0000-000000042901', null, 't', 'still dropped', 'k');
select is((select count(*)::int from public.task_notifications where body = 'still dropped'), 0, 'T-3 regression: ordinary kind=task notifications are still suppressed');
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'checklist_available', null, null, 't', 'announce', 'checklist:regress');
select private.tasks_notify('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'assigned', pg_temp.item(current_setting('t.main')::uuid, date '2026-06-01', 'U'), null, 't', 'opening assigned', null);
select is((select count(*)::int from public.task_notifications where body in ('announce', 'opening assigned')), 2, 'T-3 regression: checklist_available and Opening-task notifications still pass the gate');
select is((select count(*)::int from public.task_notifications where title = 'Old assignment'), 1, 'existing notifications are not deleted');
select is(
  (select count(*)::int from public.task_events where event_type not in ('completed', 'cancelled', 'reopened')),
  0, 'the engine and the gate write no audit events of their own: only the history this test arranged is in task_events'
);

-- ===== 9. Authorization through the RPC (TS-038) =============================================
set local role anon;
select throws_ok(
  $$select public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121')$$,
  '42501', null, 'TS-038 anon cannot call the sweep'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042108', true);
select throws_ok(
  $$select public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121')$$,
  '42501', null, 'TS-038/037 a member of another organization is rejected'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042107', true);
select throws_ok(
  $$select public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121')$$,
  '42501', null, 'TS-038 an inactive member is rejected'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042104', true);
select throws_ok(
  $$select public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042122')$$,
  '42501', null, 'TS-037 a location of another organization is rejected even for a valid member'
);
select throws_ok(
  $$select private.tasks_opening_reminders_run('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121', now())$$,
  '42501', null, 'the clock-injectable evaluator is not reachable from a client session'
);
select throws_ok(
  $$insert into public.task_notifications (organization_id, recipient_profile_id, type, title, dedupe_key)
    values ('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042104', 'opening_reminder', 'forged', 'x')$$,
  '42501', null, 'a client cannot write a reminder directly (no table write grant)'
);
-- A valid member's sweep for "today": no Opening exists for the real today in
-- this fixture, so it is a safe no-op that still proves the happy path runs.
select is(
  public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042121'),
  0, 'an active member may call the sweep; nothing is due for a day with no Opening'
);

-- Privacy as enforced by RLS: each person reads only their own reminders.
select is(
  (select count(*)::int from public.task_notifications where type = 'opening_reminder' and recipient_profile_id <> '00000000-0000-0000-0000-000000042104'),
  0, 'TS-033 Ann reads only her own reminders'
);
select is(
  (select count(*)::int from public.task_notifications where type = 'opening_reminder' and payload ->> 'service_date' = '2026-06-01' and payload ->> 'stage' = 'open' and payload ->> 'location_id' = current_setting('t.main')),
  1, 'Ann sees exactly one Main OPEN for 06-01'
);
select is(
  (select (payload ->> 'incomplete_count')::int from public.task_notifications where type = 'opening_reminder' and payload ->> 'service_date' = '2026-06-01' and payload ->> 'stage' = 'open' and payload ->> 'location_id' = current_setting('t.main')),
  3, 'and it counts only her three items'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042108', true);
select is((select count(*)::int from public.task_notifications), 0, 'TS-037 org B''s owner reads no org A notification at all');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042107', true);
select is((select count(*)::int from public.task_notifications), 0, 'an inactive member reads nothing');
reset role;

-- ===== 10. Real RPC path with the real clock (TS-026) =========================================
-- Rpc opens at 00:00 local, so OPEN is always due. Mona starts the day, Ann sweeps.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042101', true);
select public.checklist_template_save('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125', null, 'opening', 'Rpc Opening', '{0,1,2,3,4,5,6}', true,
  '[{"title":"Unlock","assignment_mode":"anyone"},{"title":"Ann job","assignment_mode":"individual","assignee_ids":["00000000-0000-0000-0000-000000042104"]}]'::jsonb);
select public.checklist_generate_daily('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042104', true);
select ok(
  public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125') >= 6,
  'the real RPC stores OPEN for 3 management + Ann + Bea + Hal (and more stages if the clock is already past +15 / +30)'
);
select is(
  public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125'),
  0, 'TS-026 a second call from the same tab stores nothing'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042106', true);
select is(
  public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125'),
  0, 'TS-026 a different member''s call (a second tab or device) stores nothing either'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042104', true);
select is(
  (select count(*)::int from public.task_notifications where type = 'opening_reminder' and payload ->> 'location_id' = '00000000-0000-0000-0000-000000042125' and payload ->> 'stage' = 'open'),
  1, 'Ann reads exactly one OPEN of her own'
);
-- Work gets finished through the real lifecycle RPCs: no further reminder.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000042101', true);
select public.task_complete(t.id, null) from public.tasks t
  join public.checklist_instances ci on ci.id = t.checklist_instance_id
  where ci.location_id = '00000000-0000-0000-0000-000000042125' and ci.service_date = (now() at time zone 'America/Chicago')::date;
select is(
  public.task_opening_reminders_sweep('00000000-0000-0000-0000-000000042111', '00000000-0000-0000-0000-000000042125'),
  0, 'with every item completed through the real RPC, a sweep stores nothing'
);
reset role;

-- ===== 11. Real concurrency: two backends, committed fixtures =================================
create temporary table rem_concurrent_results (caller text primary key, stored integer not null);
create temporary table rem_notify_results (caller text primary key, ok boolean not null);
do $rem$
declare
  v_connection text := 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres';
begin
  perform extensions.dblink_connect('rem_setup', v_connection);
  perform extensions.dblink_connect('rem_c1', v_connection);
  perform extensions.dblink_connect('rem_c2', v_connection);

  perform extensions.dblink_exec('rem_setup', 'begin');
  perform extensions.dblink_exec('rem_setup', 'set constraints all deferred');
  perform extensions.dblink_exec('rem_setup', $$delete from public.organizations where id = '00000000-0000-0000-0000-000000042911'$$);
  perform extensions.dblink_exec('rem_setup', $$delete from auth.users where id in ('00000000-0000-0000-0000-000000042901','00000000-0000-0000-0000-000000042902')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
    ('00000000-0000-0000-0000-000000042901','0429-owner@passcode.internal','x',now(),'authenticated','authenticated'),
    ('00000000-0000-0000-0000-000000042902','0429-staff@passcode.internal','x',now(),'authenticated','authenticated')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.profiles (id, display_name) values
    ('00000000-0000-0000-0000-000000042901','REM Concurrent Owner'),('00000000-0000-0000-0000-000000042902','REM Concurrent Staff')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.organizations (id, name, slug, created_by)
    values ('00000000-0000-0000-0000-000000042911','REM Concurrent Org','rem-concurrent-org','00000000-0000-0000-0000-000000042901')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.locations (id, organization_id, name, time_zone, opening_local, closing_local)
    values ('00000000-0000-0000-0000-000000042921','00000000-0000-0000-0000-000000042911','REM Concurrent Loc','America/Chicago','09:00','23:00')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.memberships (organization_id, profile_id, roles, active) values
    ('00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042901',array['owner']::public.app_role[],true),
    ('00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042902',array['server']::public.app_role[],true)$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.checklist_templates (id, organization_id, location_id, kind, name, created_by)
    values ('00000000-0000-0000-0000-000000042931','00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042921','opening','Opening','00000000-0000-0000-0000-000000042901')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.checklist_template_items (id, template_id, organization_id, title, category, sort_order)
    values ('00000000-0000-0000-0000-000000042941','00000000-0000-0000-0000-000000042931','00000000-0000-0000-0000-000000042911','Unlock','opening',1)$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.checklist_instances (id, organization_id, location_id, template_id, kind, name, service_date, generated_by)
    values ('00000000-0000-0000-0000-000000042951','00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042921','00000000-0000-0000-0000-000000042931','opening','Opening','2026-06-01','00000000-0000-0000-0000-000000042901')$$);
  perform extensions.dblink_exec('rem_setup', $$insert into public.tasks (organization_id, location_id, kind, title, category, assignment_mode, due_date, checklist_instance_id, template_item_id, sort_order, created_by)
    values ('00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042921','opening','Unlock','opening','anyone','2026-06-01','00000000-0000-0000-0000-000000042951','00000000-0000-0000-0000-000000042941',1,'00000000-0000-0000-0000-000000042901')$$);
  perform extensions.dblink_exec('rem_setup', 'commit');

  -- Both evaluate the same instant at the same moment (the sleep holds each
  -- request in flight so the two really overlap).
  perform extensions.dblink_send_query('rem_c1', $$select private.tasks_opening_reminders_run(
    '00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042921', timestamptz '2026-06-01 14:00:00+00')
    from (select pg_sleep(0.25)) gate$$);
  perform extensions.dblink_send_query('rem_c2', $$select private.tasks_opening_reminders_run(
    '00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042921', timestamptz '2026-06-01 14:00:00+00')
    from (select pg_sleep(0.25)) gate$$);
end;
$rem$;
insert into rem_concurrent_results select 'c1', n from extensions.dblink_get_result('rem_c1') as r(n integer);
insert into rem_concurrent_results select 'c2', n from extensions.dblink_get_result('rem_c2') as r(n integer);

select is(
  (select sum(stored)::int from rem_concurrent_results), 2,
  'concurrent evaluators together store exactly one OPEN per recipient (owner + staff), not 4'
);
select is(
  (select min(stored) from rem_concurrent_results), 0,
  'the evaluator that lost the race stores nothing and reports 0'
);
select is(
  (select count(*)::int from extensions.dblink('rem_setup',
    $$select recipient_profile_id from public.task_notifications
      where organization_id = '00000000-0000-0000-0000-000000042911' and type = 'opening_reminder'$$) as t(r uuid)),
  2, 'exactly two committed rows after the race'
);
select is(
  (select count(distinct r)::int from extensions.dblink('rem_setup',
    $$select recipient_profile_id from public.task_notifications
      where organization_id = '00000000-0000-0000-0000-000000042911' and type = 'opening_reminder'$$) as t(r uuid)),
  2, 'one row per recipient: recipient-stage uniqueness under concurrency'
);

-- The gate itself is also race-safe with no help from the evaluator's lock.
-- (A dblink connection must be drained to an empty result before it accepts
-- another query.)
do $drain$
begin
  perform count(*) from extensions.dblink_get_result('rem_c1') as r(n integer);
  perform count(*) from extensions.dblink_get_result('rem_c2') as r(n integer);
end;
$drain$;
do $rem2$
begin
  perform extensions.dblink_send_query('rem_c1', $$select private.tasks_notify(
    '00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042902','opening_reminder',null,null,'t','race',
    'opening_reminder:00000000-0000-0000-0000-000000042921:2026-06-02:open',
    jsonb_build_object('stage','open','service_date','2026-06-02','location_id','00000000-0000-0000-0000-000000042921'))
    from (select pg_sleep(0.25)) gate$$);
  perform extensions.dblink_send_query('rem_c2', $$select private.tasks_notify(
    '00000000-0000-0000-0000-000000042911','00000000-0000-0000-0000-000000042902','opening_reminder',null,null,'t','race',
    'opening_reminder:00000000-0000-0000-0000-000000042921:2026-06-02:open',
    jsonb_build_object('stage','open','service_date','2026-06-02','location_id','00000000-0000-0000-0000-000000042921'))
    from (select pg_sleep(0.25)) gate$$);
end;
$rem2$;
insert into rem_notify_results select 'c1', true from extensions.dblink_get_result('rem_c1') as r(x text);
insert into rem_notify_results select 'c2', true from extensions.dblink_get_result('rem_c2') as r(x text);
select is(
  (select count(*)::int from extensions.dblink('rem_setup',
    $$select 1 from public.task_notifications where organization_id = '00000000-0000-0000-0000-000000042911' and body = 'race'$$) as t(x integer)),
  1, 'two simultaneous writes of the same logical reminder leave one row (unique key + ON CONFLICT)'
);

do $cleanup$
begin
  perform extensions.dblink_exec('rem_setup', 'begin');
  perform extensions.dblink_exec('rem_setup', 'set constraints all deferred');
  perform extensions.dblink_exec('rem_setup', $$delete from public.organizations where id = '00000000-0000-0000-0000-000000042911'$$);
  perform extensions.dblink_exec('rem_setup', $$delete from auth.users where id in ('00000000-0000-0000-0000-000000042901','00000000-0000-0000-0000-000000042902')$$);
  perform extensions.dblink_exec('rem_setup', 'commit');
  perform extensions.dblink_disconnect('rem_c1');
  perform extensions.dblink_disconnect('rem_c2');
  perform extensions.dblink_disconnect('rem_setup');
end;
$cleanup$;

select * from finish();
rollback;
