begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- ---------------------------------------------------------------------
-- Tasks V1.1 / T-3 -- notification narrowing (#154, PLAN D-3).
-- The inbox carries Opening / Closing operational work only; ordinary
-- `kind = 'task'` work is dropped at private.tasks_notify, and task_events
-- (the audit trail) is untouched.
-- Cast (org A): manager Mona, staff Ann / Bea, inactive member Cal.
-- Org B: owner Otto.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000041002', '0411-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000041004', '0411-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000041005', '0411-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000041006', '0411-cal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000041008', '0411-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000041002', 'PGTAP 0411 Mona'),
  ('00000000-0000-0000-0000-000000041004', 'PGTAP 0411 Ann'),
  ('00000000-0000-0000-0000-000000041005', 'PGTAP 0411 Bea'),
  ('00000000-0000-0000-0000-000000041006', 'PGTAP 0411 Cal'),
  ('00000000-0000-0000-0000-000000041008', 'PGTAP 0411 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000041011', 'PGTAP 0411 Org', 'pgtap-0411-org', '00000000-0000-0000-0000-000000041002'),
  ('00000000-0000-0000-0000-000000041012', 'PGTAP 0411 Other', 'pgtap-0411-other', '00000000-0000-0000-0000-000000041008');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000041021', '00000000-0000-0000-0000-000000041011', 'PGTAP 0411 Loc', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000041022', '00000000-0000-0000-0000-000000041012', 'PGTAP 0411 Other Loc', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041006', array['host']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000041012', '00000000-0000-0000-0000-000000041008', array['owner']::public.app_role[], true);

-- A legacy ordinary-task notification written before the gate existed: it must
-- survive (existing notifications are never deleted).
insert into public.tasks (id, organization_id, location_id, kind, title, created_by)
values ('00000000-0000-0000-0000-000000041101', '00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041021', 'task', 'Legacy task', '00000000-0000-0000-0000-000000041002');
insert into public.task_notifications (organization_id, recipient_profile_id, type, task_id, title, body)
values ('00000000-0000-0000-0000-000000041011', '00000000-0000-0000-0000-000000041004', 'assigned', '00000000-0000-0000-0000-000000041101', 'Old assignment', 'Legacy task');

-- Manager starts Opening and Closing checklists (one item each).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041002', true);
select public.checklist_template_save('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041021',null,'opening','Weekday Opening','{0,1,2,3,4,5,6}',true,'[{"title":"Unlock entrance","assignment_mode":"anyone"}]'::jsonb);
select public.checklist_template_save('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041021',null,'closing','Weekday Closing','{0,1,2,3,4,5,6}',true,'[{"title":"Lock patio","assignment_mode":"anyone"}]'::jsonb);
select public.checklist_generate_daily('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041021');
reset role;

select set_config('t.opening_item', (select id::text from public.tasks where kind = 'opening' and title = 'Unlock entrance'), true);
select set_config('t.closing_item', (select id::text from public.tasks where kind = 'closing' and title = 'Lock patio'), true);

-- 1. Operational checklist announcements are kept ----------------------------------
select is(
  (select count(*)::int from public.task_notifications
   where type = 'checklist_available' and recipient_profile_id = '00000000-0000-0000-0000-000000041004'),
  2, 'TS-041 Ann is told the Opening and the Closing checklist are ready'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'checklist_available' and recipient_profile_id = '00000000-0000-0000-0000-000000041002'),
  0, 'the manager who started the checklists is not notified'
);
select is(
  (select count(*)::int from public.task_notifications
   where type = 'checklist_available' and recipient_profile_id = '00000000-0000-0000-0000-000000041006'),
  0, 'an inactive member is not notified'
);

-- 2. Normal-task events are dropped at the single writer -------------------------------
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','assigned','00000000-0000-0000-0000-000000041101',null,'t','Legacy task',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','reassigned','00000000-0000-0000-0000-000000041101',null,'t','Legacy task',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','completed','00000000-0000-0000-0000-000000041101',null,'t','Legacy task',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','due_soon','00000000-0000-0000-0000-000000041101',null,'t','Legacy task','due_soon:x');
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','overdue','00000000-0000-0000-0000-000000041101',null,'t','Legacy task','overdue:x');
select is(
  (select count(*)::int from public.task_notifications where task_id = '00000000-0000-0000-0000-000000041101'),
  1, 'TS-040 assigned / reassigned / completed / due_soon / overdue for a normal task store nothing (only the legacy row remains)'
);
select is(
  (select title from public.task_notifications where task_id = '00000000-0000-0000-0000-000000041101'),
  'Old assignment', 'an existing notification is not deleted or rewritten'
);

-- 3. Opening / Closing task events are kept, to the named recipient only --------------
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','assigned',current_setting('t.opening_item')::uuid,null,'New task for you','Unlock entrance',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','reassigned',current_setting('t.opening_item')::uuid,null,'A task was assigned to you','Unlock entrance',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','completed',current_setting('t.opening_item')::uuid,null,'Your task was completed for you','Unlock entrance',null);
select is(
  (select count(*)::int from public.task_notifications
   where task_id = current_setting('t.opening_item')::uuid and recipient_profile_id = '00000000-0000-0000-0000-000000041004'),
  3, 'TS-041 Opening assigned / reassigned / completed-for-you are stored for the recipient'
);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','assigned',current_setting('t.closing_item')::uuid,null,'New task for you','Lock patio',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','completed',current_setting('t.closing_item')::uuid,null,'Your task was completed for you','Lock patio',null);
select is(
  (select count(*)::int from public.task_notifications
   where task_id = current_setting('t.closing_item')::uuid and recipient_profile_id = '00000000-0000-0000-0000-000000041004'),
  2, 'TS-041 Closing assigned / completed-for-you are stored for the recipient'
);
select is(
  (select count(*)::int from public.task_notifications
   where task_id in (current_setting('t.opening_item')::uuid, current_setting('t.closing_item')::uuid)
     and recipient_profile_id <> '00000000-0000-0000-0000-000000041004'),
  0, 'nobody but the named recipient receives them'
);

-- 4. Fail closed, cross-organization, inactive recipients, dedupe -------------------
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','assigned',null,null,'t','no source',null);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041004','completed','00000000-0000-0000-0000-0000000fffff',null,'t','unknown task',null);
select is(
  (select count(*)::int from public.task_notifications where body in ('no source', 'unknown task')),
  0, 'a call that names no operational source stores nothing (fails closed)'
);
select private.tasks_notify('00000000-0000-0000-0000-000000041012','00000000-0000-0000-0000-000000041008','assigned',current_setting('t.opening_item')::uuid,null,'t','cross-org',null);
select is(
  (select count(*)::int from public.task_notifications where body = 'cross-org'),
  0, 'an Opening task id from another organization does not open the gate'
);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041006','assigned',current_setting('t.opening_item')::uuid,null,'t','inactive',null);
select is(
  (select count(*)::int from public.task_notifications where body = 'inactive'),
  0, 'an inactive recipient still gets nothing'
);
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041005','assigned',current_setting('t.opening_item')::uuid,null,'t','dedupe','k1');
select private.tasks_notify('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041005','assigned',current_setting('t.opening_item')::uuid,null,'t','dedupe','k1');
select is(
  (select count(*)::int from public.task_notifications where body = 'dedupe'),
  1, 'the (recipient, dedupe_key) idempotency still holds for retained notifications'
);

-- 5. Real lifecycle: no inbox noise, full audit trail -------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041002', true);
select set_config('t.task', (
  public.task_create('00000000-0000-0000-0000-000000041011','00000000-0000-0000-0000-000000041021','Ordinary job',null,'other','normal','individual',array['00000000-0000-0000-0000-000000041004']::uuid[],false,null,null,null,null)
)[1]::text, true);
select public.task_assign(current_setting('t.task')::uuid, 'individual', array['00000000-0000-0000-0000-000000041005']::uuid[]);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041005', true);
select public.task_complete(current_setting('t.task')::uuid);
select public.task_reopen(current_setting('t.task')::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041002', true);
select public.task_cancel(current_setting('t.task')::uuid, 'not needed');
reset role;

select is(
  (select count(*)::int from public.task_notifications where task_id = current_setting('t.task')::uuid),
  0, 'TS-040 create / reassign / complete / reopen / cancel of a normal task store no notification'
);
select is(
  (select array_agg(distinct event_type::text order by event_type::text)
   from public.task_events where task_id = current_setting('t.task')::uuid),
  array['cancelled', 'completed', 'created', 'reassigned', 'reopened'],
  'TS-042 every one of those actions still wrote its task_events audit row'
);
select is(
  (select actor_profile_id from public.task_events
   where task_id = current_setting('t.task')::uuid and event_type = 'completed'),
  '00000000-0000-0000-0000-000000041005'::uuid,
  'the audit row keeps the real actor'
);
select is(
  (select count(*)::int from public.task_events where event_type = 'checklist_generated'),
  2, 'TS-042 checklist generation audit is unchanged'
);

-- 6. Privacy and tenant isolation of what remains -----------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041005', true);
select is(
  (select count(*)::int from public.task_notifications where recipient_profile_id <> '00000000-0000-0000-0000-000000041005'),
  0, 'staff cannot read a coworker''s notifications (RLS)'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041008', true);
select is(
  (select count(*)::int from public.task_notifications), 0,
  'another organization sees none of this organization''s notifications'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000041004', true);
select is(
  public.task_notifications_mark_read(), 8,
  'read state still works for what is stored (2 checklists, 1 legacy, 3 Opening, 2 Closing)'
);
reset role;

select * from finish();
rollback;
