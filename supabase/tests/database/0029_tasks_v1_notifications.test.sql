begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ---------------------------------------------------------------------
-- Tasks V1 / T7 -- in-app notifications, narrowed by Tasks V1.1 / T-3:
-- ordinary-task due-soon / overdue are no longer stored, so read state is
-- exercised on the Opening / Closing checklist notifications that remain.
-- Cast (org A): manager Mona, staff Ann / Bea. Org B: owner Otto.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000029002', '0291-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000029004', '0291-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000029005', '0291-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000029008', '0291-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000029002', 'PGTAP 0291 Mona'),
  ('00000000-0000-0000-0000-000000029004', 'PGTAP 0291 Ann'),
  ('00000000-0000-0000-0000-000000029005', 'PGTAP 0291 Bea'),
  ('00000000-0000-0000-0000-000000029008', 'PGTAP 0291 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000029011', 'PGTAP 0291 Org', 'pgtap-0291-org', '00000000-0000-0000-0000-000000029002'),
  ('00000000-0000-0000-0000-000000029012', 'PGTAP 0291 Other', 'pgtap-0291-other', '00000000-0000-0000-0000-000000029008');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000029021', '00000000-0000-0000-0000-000000029011', 'PGTAP 0291 Loc', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000029022', '00000000-0000-0000-0000-000000029012', 'PGTAP 0291 Other Loc', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000029012', '00000000-0000-0000-0000-000000029008', array['owner']::public.app_role[], true);

-- Manager creates four tasks; due times are then pinned relative to now().
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select public.task_create('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021','Soon task',null,'other','normal','individual',array['00000000-0000-0000-0000-000000029004']::uuid[],false,null,null,null,null);
select public.task_create('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021','Late task',null,'other','normal','individual',array['00000000-0000-0000-0000-000000029004']::uuid[],false,null,null,null,null);
select public.task_create('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021','Far task',null,'other','normal','individual',array['00000000-0000-0000-0000-000000029005']::uuid[],false,null,null,null,null);
select public.task_create('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021','Team task',null,'other','normal','all_team','{}',false,null,null,null,null);
reset role;

update public.tasks set
  due_date = ((now() + interval '30 minutes') at time zone 'America/Chicago')::date,
  due_time = date_trunc('minute', (now() + interval '30 minutes') at time zone 'America/Chicago')::time
where title = 'Soon task';
update public.tasks set
  due_date = ((now() - interval '2 hours') at time zone 'America/Chicago')::date,
  due_time = date_trunc('minute', (now() - interval '2 hours') at time zone 'America/Chicago')::time
where title = 'Late task';
update public.tasks set
  due_date = ((now() + interval '5 hours') at time zone 'America/Chicago')::date,
  due_time = date_trunc('minute', (now() + interval '5 hours') at time zone 'America/Chicago')::time
where title = 'Far task';
update public.tasks set
  due_date = ((now() - interval '2 hours') at time zone 'America/Chicago')::date,
  due_time = date_trunc('minute', (now() - interval '2 hours') at time zone 'America/Chicago')::time
where title = 'Team task';

-- 1. Sweep (Tasks V1.1 / T-3: ordinary tasks no longer produce due notifications) -----
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029005', true);
select is(
  public.task_notifications_sweep('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021'),
  0, 'TS-040 the sweep stores nothing for ordinary tasks (due soon / overdue are suppressed)'
);
select is(
  public.task_notifications_sweep('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021'),
  0, 'the sweep stays idempotent'
);
reset role;

select is(
  (select count(*)::int from public.task_notifications where type in ('due_soon', 'overdue', 'assigned')),
  0, 'no due-soon, overdue or assigned notification exists for ordinary tasks'
);
select is(
  (select count(*)::int from public.task_events where event_type = 'created'),
  4, 'audit: the four ordinary tasks are still recorded as created'
);

-- 2. Operational notifications remain: Opening and Closing checklists -------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select public.checklist_template_save('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021',null,'opening','Weekday Opening','{0,1,2,3,4,5,6}',true,'[{"title":"Unlock entrance","assignment_mode":"anyone"}]'::jsonb);
select public.checklist_template_save('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021',null,'closing','Weekday Closing','{0,1,2,3,4,5,6}',true,'[{"title":"Lock patio","assignment_mode":"anyone"}]'::jsonb);
select lives_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021')$$,
  'a manager starts today''s Opening and Closing checklists'
);
reset role;

-- 3. Reading and read state ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029004', true);
select is(
  (select count(*)::int from public.task_notifications), 2,
  'Ann sees only her own notifications (the Opening and Closing checklists)'
);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 2,
  'TASK-053 both start unread'
);
select is(
  public.task_notifications_mark_read(array[(select min(id) from public.task_notifications)]),
  1, 'one notification can be marked read'
);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 1,
  'the unread count drops'
);
select throws_ok(
  $$update public.task_notifications set read_at = null$$,
  '42501', null, 'clients cannot write notifications directly'
);
select is(
  public.task_notifications_mark_read(), 1, 'mark all read'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029005', true);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 2,
  'another person''s read state is untouched (Bea still has her own two unread)'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029008', true);
select throws_ok(
  $$select public.task_notifications_sweep('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021')$$,
  '42501', null, 'another organization cannot trigger this location''s sweep'
);
reset role;

select * from finish();
rollback;
