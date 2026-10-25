begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------
-- Tasks V1 / T7 -- in-app notifications. Cast (org A): manager Mona,
-- staff Ann / Bea. Org B: owner Otto.
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

-- 1. Sweep ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029005', true);
select is(
  public.task_notifications_sweep('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021'),
  2, 'TASK-052 any member''s sweep notifies the due-soon and the overdue assignee'
);
select is(
  public.task_notifications_sweep('00000000-0000-0000-0000-000000029011','00000000-0000-0000-0000-000000029021'),
  0, 'the sweep is idempotent (no duplicates on reload)'
);
reset role;

select is(
  (select count(*)::int from public.task_notifications where type = 'due_soon'),
  1, 'one due-soon notification'
);
select is(
  (select count(*)::int from public.task_notifications where type = 'overdue'),
  1, 'one overdue notification'
);
select is(
  (select count(*)::int from public.task_notifications n join public.tasks t on t.id = n.task_id
   where t.title = 'Far task' and n.type in ('due_soon', 'overdue')),
  0, 'a task due hours from now is not announced yet'
);
select is(
  (select count(*)::int from public.task_notifications n join public.tasks t on t.id = n.task_id
   where t.title = 'Team task' and n.type in ('due_soon', 'overdue')),
  0, 'team-wide tasks have no single owner to nag'
);

-- 2. Reading and read state ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029004', true);
select is(
  (select count(*)::int from public.task_notifications), 4,
  'Ann sees only her own notifications (2 assigned + due soon + overdue)'
);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 4,
  'TASK-053 all four start unread'
);
select is(
  public.task_notifications_mark_read(array[(select min(id) from public.task_notifications)]),
  1, 'one notification can be marked read'
);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 3,
  'the unread count drops'
);
select throws_ok(
  $$update public.task_notifications set read_at = null$$,
  '42501', null, 'clients cannot write notifications directly'
);
select is(
  public.task_notifications_mark_read(), 3, 'mark all read'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029005', true);
select is(
  (select count(*)::int from public.task_notifications where read_at is null), 1,
  'another person''s read state is untouched (Bea still has her own unread assignment)'
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
