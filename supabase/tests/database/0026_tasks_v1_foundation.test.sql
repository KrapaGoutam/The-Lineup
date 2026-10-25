begin;

create extension if not exists pgtap with schema extensions;

select plan(79);

-- ---------------------------------------------------------------------
-- Tasks V1 / T1 -- domain, authorization and audit boundary.
-- Cast (org A): owner Olga, manager Mona (general_manager), assistant manager
-- Asa (shift_manager), staff Ann / Bea / Cal (server), inactive staff Dee.
-- Org B: Otto, an owner of a different organization.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000026001', '0261-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026002', '0261-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026003', '0261-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026004', '0261-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026005', '0261-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026006', '0261-cal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026007', '0261-dee@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000026008', '0261-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000026001', 'PGTAP 0261 Olga'),
  ('00000000-0000-0000-0000-000000026002', 'PGTAP 0261 Mona'),
  ('00000000-0000-0000-0000-000000026003', 'PGTAP 0261 Asa'),
  ('00000000-0000-0000-0000-000000026004', 'PGTAP 0261 Ann'),
  ('00000000-0000-0000-0000-000000026005', 'PGTAP 0261 Bea'),
  ('00000000-0000-0000-0000-000000026006', 'PGTAP 0261 Cal'),
  ('00000000-0000-0000-0000-000000026007', 'PGTAP 0261 Dee'),
  ('00000000-0000-0000-0000-000000026008', 'PGTAP 0261 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000026011', 'PGTAP 0261 Org', 'pgtap-0261-org', '00000000-0000-0000-0000-000000026001'),
  ('00000000-0000-0000-0000-000000026012', 'PGTAP 0261 Other', 'pgtap-0261-other', '00000000-0000-0000-0000-000000026008');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000026021', '00000000-0000-0000-0000-000000026011', 'PGTAP 0261 Loc', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000026022', '00000000-0000-0000-0000-000000026012', 'PGTAP 0261 Other Loc', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026006', array['host']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026007', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000026012', '00000000-0000-0000-0000-000000026008', array['owner']::public.app_role[], true);

-- 1. Schema invariants -------------------------------------------------
select ok(
  not exists (select 1 from unnest(enum_range(null::public.task_status)) s where s::text ilike '%overdue%'),
  'overdue is derived: it is not a stored task status'
);

select ok(
  (select count(*) = 11 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
     and c.relname in ('task_categories','checklist_templates','checklist_template_items',
       'checklist_template_item_assignees','task_recurrence_rules','task_recurrence_assignees',
       'checklist_instances','tasks','task_assignments','task_events','task_notifications')),
  'RLS is enabled on every Tasks table'
);

-- 2. Creation permissions ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026004', true);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','Staff attempt',null,'other','normal','anyone','{}',false,null,null,null,null)$$,
  '42501', null, 'TASK-002 staff cannot create a task'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','A patio',null,'cleaning','high','individual',array['00000000-0000-0000-0000-000000026004']::uuid[],false,null,'2026-10-30','15:00','closing')$$,
  'TASK-001/003 manager creates and assigns an individual task'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','B ice',null,'kitchen','normal','individual',array['00000000-0000-0000-0000-000000026004']::uuid[],false,null,'2026-10-30',null,null)$$,
  'manager creates a date-only task'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','C shared trash',null,'cleaning','normal','multiple',array['00000000-0000-0000-0000-000000026004','00000000-0000-0000-0000-000000026005']::uuid[],false,null,null,null,null)$$,
  'TASK-004 manager creates a multi-person shared-once task'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','D team brief',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  'manager creates an all-team task'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','E policy read','Read it','safety','normal','multiple',array['00000000-0000-0000-0000-000000026004','00000000-0000-0000-0000-000000026005','00000000-0000-0000-0000-000000026006']::uuid[],true,null,null,null,null)$$,
  'TASK-004 each-person-required fans out'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','F on behalf',null,'other','normal','individual',array['00000000-0000-0000-0000-000000026004']::uuid[],false,null,null,null,null)$$,
  'manager creates a task to be completed on behalf'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','bad cat',null,'nope','normal','anyone','{}',false,null,null,null,null)$$,
  '22023', null, 'unknown category is rejected'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','bad ind',null,'other','normal','individual',array['00000000-0000-0000-0000-000000026004','00000000-0000-0000-0000-000000026005']::uuid[],false,null,null,null,null)$$,
  '22023', null, 'an individual task takes exactly one assignee'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','foreign assignee',null,'other','normal','individual',array['00000000-0000-0000-0000-000000026008']::uuid[],false,null,null,null,null)$$,
  '22023', null, 'TASK-071 an assignee from another organization is rejected'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','inactive assignee',null,'other','normal','individual',array['00000000-0000-0000-0000-000000026007']::uuid[],false,null,null,null,null)$$,
  '22023', null, 'TASK-071 an inactive member cannot be assigned'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026022','wrong loc',null,'other','normal','anyone','{}',false,null,null,null,null)$$,
  '42501', null, 'TASK-070 a location from another organization is rejected'
);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','time no date',null,'other','normal','anyone','{}',false,null,null,'09:00',null)$$,
  '22023', null, 'a due time needs a due date'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026003', true);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','G by asst',null,'other','normal','anyone','{}',false,null,null,null,null)$$,
  'assistant manager can create'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026001', true);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-000000026011','00000000-0000-0000-0000-000000026021','H by owner',null,'other','normal','anyone','{}',false,null,null,null,null)$$,
  'owner can create'
);
reset role;

-- Stash ids for later steps (set as the table owner, readable by any role).
select set_config('t.patio', (select id::text from public.tasks where title = 'A patio'), true);
select set_config('t.ice', (select id::text from public.tasks where title = 'B ice'), true);
select set_config('t.trash', (select id::text from public.tasks where title = 'C shared trash'), true);
select set_config('t.team', (select id::text from public.tasks where title = 'D team brief'), true);
select set_config('t.behalf', (select id::text from public.tasks where title = 'F on behalf'), true);

select is(
  (select due_at from public.tasks where id = current_setting('t.patio')::uuid),
  '2026-10-30 20:00:00+00'::timestamptz,
  'TASK-010 due_at honours the location time zone (15:00 CDT = 20:00 UTC)'
);
select is(
  (select due_at from public.tasks where id = current_setting('t.ice')::uuid),
  '2026-10-31 05:00:00+00'::timestamptz,
  'a date-only task is due at the end of that local day'
);
select is(
  (select count(*)::int from public.tasks where title = 'E policy read'),
  3, 'each-person-required creates one task per person'
);
select is(
  (select count(distinct group_id)::int from public.tasks where title = 'E policy read'),
  1, 'the fanned-out tasks share a group'
);
select ok(
  not exists (
    select 1 from public.tasks t
    where t.title = 'E policy read'
      and (select count(*) from public.task_assignments a where a.task_id = t.id) <> 1
  ),
  'each fanned-out task has exactly one assignee'
);

-- 3. Completion rules ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026005', true);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.patio')),
  '42501', null, 'TASK-007 unrelated staff cannot complete another employee''s task'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026004', true);
select lives_ok(
  format($$select public.task_complete(%L, 'all wiped')$$, current_setting('t.patio')),
  'TASK-005 assignee completes their own task with a note'
);
reset role;

select is(
  (select completed_by from public.tasks where id = current_setting('t.patio')::uuid),
  '00000000-0000-0000-0000-000000026004'::uuid, 'completed_by is the assignee'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.patio')),
  'completing an already completed task is a no-op'
);
select lives_ok(
  format($$select public.task_complete(%L, 'checked by Mona')$$, current_setting('t.behalf')),
  'TASK-006 manager completes on behalf of the assignee'
);
reset role;

select is(
  (select completed_by from public.tasks where id = current_setting('t.patio')::uuid),
  '00000000-0000-0000-0000-000000026004'::uuid, 'the first completer is never overwritten'
);
select is(
  (select completed_by from public.tasks where id = current_setting('t.behalf')::uuid),
  '00000000-0000-0000-0000-000000026002'::uuid, 'completed_by records the manager'
);
select is(
  (select array_agg(profile_id) from public.task_assignments where task_id = current_setting('t.behalf')::uuid),
  array['00000000-0000-0000-0000-000000026004']::uuid[], 'the assignee is unchanged by completion on behalf'
);
select ok(
  (select (payload ->> 'on_behalf')::boolean from public.task_events
   where task_id = current_setting('t.behalf')::uuid and event_type = 'completed'),
  'the audit event flags completion on behalf'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026003', true);
select lives_ok(
  format($$select public.task_reopen(%L)$$, current_setting('t.behalf')),
  'TASK-012 an assistant manager can reopen'
);
reset role;
select is(
  (select status::text || ':' || coalesce(completed_by::text, 'null') from public.tasks where id = current_setting('t.behalf')::uuid),
  'open:null', 'reopen clears the completion'
);

-- shared-once and team tasks
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026006', true);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.trash')),
  '42501', null, 'an unrelated member cannot complete a multi-person task'
);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.team')),
  'any member can complete an all-team task'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026005', true);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.trash')),
  'any one assignee completes a shared-once task'
);
reset role;
select is(
  (select status::text from public.tasks where id = current_setting('t.trash')::uuid),
  'completed', 'shared-once is complete for the whole group'
);

-- 4. Status transitions -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026004', true);
select lives_ok(
  format($$select public.task_set_status(%L, 'in_progress')$$, current_setting('t.ice')),
  'assignee starts a task'
);
select throws_ok(
  format($$select public.task_set_status(%L, 'blocked')$$, current_setting('t.ice')),
  '22023', null, 'TASK-009 blocking needs a reason'
);
select lives_ok(
  format($$select public.task_set_status(%L, 'blocked', 'no ice scoop')$$, current_setting('t.ice')),
  'TASK-009 assignee blocks with a reason'
);
reset role;
select is(
  (select status::text || ':' || blocked_reason from public.tasks where id = current_setting('t.ice')::uuid),
  'blocked:no ice scoop', 'blocked state and reason are stored'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026004', true);
select lives_ok(
  format($$select public.task_set_status(%L, 'open')$$, current_setting('t.ice')),
  'TASK-009 unblock returns to open'
);
select throws_ok(
  format($$select public.task_set_status(%L, 'completed')$$, current_setting('t.ice')),
  '22023', null, 'completion goes through task_complete, not set_status'
);
reset role;

-- 5. Reassign / update / cancel / carry forward -------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026005', true);
select throws_ok(
  format($$select public.task_assign(%L, 'individual', array['00000000-0000-0000-0000-000000026005']::uuid[])$$, current_setting('t.ice')),
  '42501', null, 'staff cannot reassign'
);
select throws_ok(
  format($$select public.task_cancel(%L)$$, current_setting('t.ice')),
  '42501', null, 'staff cannot cancel'
);
select throws_ok(
  format($$select public.task_update(%L, 'x', null, 'other', 'normal', null, null, null, null)$$, current_setting('t.ice')),
  '42501', null, 'staff cannot edit a task'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select lives_ok(
  format($$select public.task_assign(%L, 'individual', array['00000000-0000-0000-0000-000000026005']::uuid[])$$, current_setting('t.ice')),
  'TASK-008 manager reassigns Ann -> Bea'
);
select lives_ok(
  format($$select public.task_update(%L, 'B ice (restock)', 'Refill all bins', 'kitchen', 'urgent', null, '2026-10-30', '16:00', null)$$, current_setting('t.ice')),
  'manager edits a task'
);
select is(
  public.task_carry_forward(array[current_setting('t.ice')::uuid], '2026-11-02'),
  1, 'TASK-014 manager carries an unfinished task forward'
);
select lives_ok(
  format($$select public.task_cancel(%L, 'no longer needed')$$, current_setting('t.ice')),
  'manager cancels a task'
);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.ice')),
  '22023', null, 'a cancelled task cannot be completed'
);
reset role;
select is(
  (select array_agg(profile_id) from public.task_assignments where task_id = current_setting('t.ice')::uuid),
  array['00000000-0000-0000-0000-000000026005']::uuid[], 'reassignment replaced the assignee'
);
select is(
  (select due_date from public.tasks where id = current_setting('t.ice')::uuid),
  '2026-11-02'::date, 'carry forward moved the due date'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026005', true);
select throws_ok(
  format($$select public.task_carry_forward(array[%L]::uuid[], '2026-11-03')$$, current_setting('t.ice')),
  '42501', null, 'staff cannot carry tasks forward'
);
reset role;

-- 6. Read visibility (RLS) ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026006', true);
select is(
  (select count(*)::int from public.tasks where assignment_mode = 'individual' and title in ('A patio', 'B ice (restock)', 'F on behalf')),
  0, 'unrelated staff cannot read other people''s individual tasks'
);
select ok(
  (select count(*) >= 1 from public.tasks where id = current_setting('t.team')::uuid),
  'staff can read all-team tasks'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select ok(
  (select count(*) >= 8 from public.tasks),
  'manager reads every task in the organization'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026008', true);
select is(
  (select count(*)::int from public.tasks), 0, 'TASK-072 another organization sees none of these tasks'
);
reset role;

-- 7. No direct writes -----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select throws_ok(
  format($$update public.tasks set status = 'completed' where id = %L$$, current_setting('t.team')),
  '42501', null, 'TASK-015 even a manager cannot write the table directly'
);
select throws_ok(
  $$insert into public.task_events (organization_id, event_type) values ('00000000-0000-0000-0000-000000026011', 'created')$$,
  '42501', null, 'audit events cannot be forged by clients'
);
reset role;

-- 8. Audit history privacy ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026004', true);
select is(
  (select count(*)::int from public.task_events), 0, 'TASK-060 staff cannot read audit history'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026003', true);
select ok(
  (select count(*) > 5 from public.task_events), 'TASK-061 an assistant manager can read audit history'
);
reset role;
select throws_ok(
  $$update public.task_events set payload = '{}'::jsonb where id = (select min(id) from public.task_events)$$,
  '23514', null, 'TASK-062 events cannot be updated'
);
select throws_ok(
  $$delete from public.task_events where id = (select min(id) from public.task_events)$$,
  '23514', null, 'TASK-062 events cannot be deleted'
);
select ok(
  exists (select 1 from public.task_events where event_type = 'reassigned' and task_id = current_setting('t.ice')::uuid),
  'reassignment is audited'
);

-- 9. Notifications --------------------------------------------------------
select ok(
  exists (select 1 from public.task_notifications
          where recipient_profile_id = '00000000-0000-0000-0000-000000026004' and type = 'assigned'),
  'TASK-050 the assignee is notified'
);
select ok(
  exists (select 1 from public.task_notifications
          where recipient_profile_id = '00000000-0000-0000-0000-000000026005' and type = 'reassigned'),
  'TASK-051 a reassigned person is notified'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026005', true);
select is(
  (select count(*)::int from public.task_notifications where recipient_profile_id = '00000000-0000-0000-0000-000000026004'),
  0, 'notifications are private to their recipient'
);
reset role;

-- 10. Structural constraints (as the table owner) --------------------------
select throws_ok(
  format($$update public.tasks set status = 'completed' where id = %L$$, current_setting('t.ice')),
  '23514', null, 'a completed task must record who and when'
);
select throws_ok(
  format($$update public.tasks set location_id = '00000000-0000-0000-0000-000000026022' where id = %L$$, current_setting('t.team')),
  '23514', null, 'a task cannot be moved to another location'
);
select throws_ok(
  $$insert into public.task_assignments (task_id, profile_id, organization_id, assigned_by)
    select id, '00000000-0000-0000-0000-000000026008', organization_id, created_by from public.tasks limit 1$$,
  '23503', null, 'TASK-070 an assignment cannot reference a member of another organization'
);
select throws_ok(
  $$insert into public.tasks (organization_id, location_id, kind, title, created_by)
    values ('00000000-0000-0000-0000-000000026011', '00000000-0000-0000-0000-000000026021', 'opening', 'orphan', '00000000-0000-0000-0000-000000026001')$$,
  '23514', null, 'an opening item must belong to a checklist instance'
);

-- 11. Review hardening ------------------------------------------------------
select set_config('t.anyone', (select id::text from public.tasks where title = 'G by asst'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026007', true);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.anyone')),
  '42501', null, 'an inactive member cannot use the RPCs'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026008', true);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.anyone')),
  '42501', null, 'TASK-070 a manager of another organization cannot complete this organization''s task'
);
select throws_ok(
  format($$select public.task_assign(%L, 'anyone', '{}')$$, current_setting('t.anyone')),
  '42501', null, 'a manager of another organization cannot reassign it either'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026002', true);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.anyone')),
  'manager completes a shared task'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000026006', true);
select throws_ok(
  format($$select public.task_reopen(%L)$$, current_setting('t.anyone')),
  '42501', null, 'a teammate cannot undo a manager''s completion'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.task_complete(uuid,text)', 'execute'),
  'anon cannot execute the task RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'private.tasks_is_assignee(uuid)', 'execute'),
  'internal assignee helper is not exposed to clients'
);

select * from finish();
rollback;
