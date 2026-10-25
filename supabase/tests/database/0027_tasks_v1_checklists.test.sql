begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- ---------------------------------------------------------------------
-- Tasks V1 / T4 + T5 -- Opening and Closing: templates, daily instances,
-- day-to-day isolation, shared / person-specific items, manager override.
-- Cast (org A): manager Mona, staff Ann / Bea / Cal. Org B: owner Otto.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000027002', '0271-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027004', '0271-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027005', '0271-bea@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027006', '0271-cal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027008', '0271-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000027002', 'PGTAP 0271 Mona'),
  ('00000000-0000-0000-0000-000000027004', 'PGTAP 0271 Ann'),
  ('00000000-0000-0000-0000-000000027005', 'PGTAP 0271 Bea'),
  ('00000000-0000-0000-0000-000000027006', 'PGTAP 0271 Cal'),
  ('00000000-0000-0000-0000-000000027008', 'PGTAP 0271 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000027011', 'PGTAP 0271 Org', 'pgtap-0271-org', '00000000-0000-0000-0000-000000027002'),
  ('00000000-0000-0000-0000-000000027012', 'PGTAP 0271 Other', 'pgtap-0271-other', '00000000-0000-0000-0000-000000027008');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000027021', '00000000-0000-0000-0000-000000027011', 'PGTAP 0271 Loc', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000027022', '00000000-0000-0000-0000-000000027012', 'PGTAP 0271 Other Loc', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027006', array['host']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000027012', '00000000-0000-0000-0000-000000027008', array['owner']::public.app_role[], true);

select set_config('t.today', ((now() at time zone 'America/Chicago')::date)::text, true);
select set_config('t.tomorrow', ((now() at time zone 'America/Chicago')::date + 1)::text, true);
select set_config('t.items', $j$[
  {"title":"Unlock entrance","assignment_mode":"anyone"},
  {"title":"Set patio","assignment_mode":"individual","assignee_ids":["00000000-0000-0000-0000-000000027004"]},
  {"title":"Count register","assignment_mode":"multiple","assignee_ids":["00000000-0000-0000-0000-000000027004","00000000-0000-0000-0000-000000027005"]},
  {"title":"Turn on TVs","assignment_mode":"all_team"}
]$j$, true);
select set_config('t.closing', $j$[
  {"title":"Lock patio","assignment_mode":"anyone"},
  {"title":"Close register","assignment_mode":"individual","assignee_ids":["00000000-0000-0000-0000-000000027004"]}
]$j$, true);

-- 1. Templates: manager only -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027004', true);
select throws_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'opening','Staff try','{0,1,2,3,4,5,6}',true,%L::jsonb)$$, current_setting('t.items')),
  '42501', null, 'TASK-035 staff cannot create templates'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'opening','Weekday Opening','{0,1,2,3,4,5,6}',true,%L::jsonb)$$, current_setting('t.items')),
  'manager saves an opening template with shared, one-person, multi-person and all-team items'
);
select throws_ok(
  $$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'opening','Bad assignee','{0,1}',true,'[{"title":"x","assignment_mode":"individual","assignee_ids":["00000000-0000-0000-0000-000000027008"]}]'::jsonb)$$,
  '22023', null, 'TASK-071 an assignee outside the organization is rejected'
);
select throws_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'opening','Weekday Opening','{0,1}',true,%L::jsonb)$$, current_setting('t.items')),
  '22023', null, 'a duplicate template name is rejected with a plain message'
);
select lives_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'closing','Weekday Closing','{0,1,2,3,4,5,6}',true,%L::jsonb)$$, current_setting('t.closing')),
  'manager saves a closing template with the same engine'
);
reset role;

select is(
  (select count(*)::int from public.checklist_template_items where title in ('Unlock entrance','Set patio','Count register','Turn on TVs')),
  4, 'template items are stored in order'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027006', true);
select is(
  (select count(*)::int from public.checklist_templates), 0, 'staff cannot read template definitions'
);
reset role;

-- 2. Daily generation ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027006', true);
select lives_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021')$$,
  'TASK-020 any active member can start today''s checklists'
);
select throws_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021', (now() at time zone 'America/Chicago')::date + 3)$$,
  '22023', null, 'only today and tomorrow can be generated'
);
reset role;

select is(
  (select count(*)::int from public.checklist_instances where service_date = current_setting('t.today')::date),
  2, 'one instance per template for today (opening + closing)'
);
select is(
  (select count(*)::int from public.tasks t join public.checklist_instances i on i.id = t.checklist_instance_id
   where i.kind = 'opening' and i.service_date = current_setting('t.today')::date and t.kind = 'opening'
     and t.due_date = current_setting('t.today')::date),
  4, 'the opening instance has one task per template item, due today'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021')$$,
  'generation is idempotent'
);
reset role;
select is(
  (select count(*)::int from public.tasks where kind in ('opening','closing')),
  6, 'a second call does not duplicate items'
);

-- 3. Completion rules per item type -----------------------------------------------
select set_config('t.unlock', (select id::text from public.tasks where title = 'Unlock entrance'), true);
select set_config('t.patio', (select id::text from public.tasks where title = 'Set patio'), true);
select set_config('t.register', (select id::text from public.tasks where title = 'Count register'), true);
select set_config('t.tvs', (select id::text from public.tasks where title = 'Turn on TVs'), true);
select set_config('t.closereg', (select id::text from public.tasks where title = 'Close register'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027006', true);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.unlock')),
  'TASK-021 any eligible member completes a shared item'
);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.patio')),
  '42501', null, 'TASK-022 an unrelated member cannot complete a person-specific item'
);
select throws_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.register')),
  '42501', null, 'an unrelated member cannot complete a multi-person item'
);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.tvs')),
  'anyone completes an all-team item'
);
select is(
  (select count(*)::int from public.tasks where title = 'Set patio'),
  1, 'staff can see other people''s checklist items (the whole checklist is legible)'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027005', true);
select lives_ok(
  format($$select public.task_complete(%L)$$, current_setting('t.register')),
  'TASK-023 one of several assignees completes a multi-person item'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.task_complete(%L, 'checked by manager')$$, current_setting('t.closereg')),
  'TASK-033 a manager completes a closing item for the assignee'
);
reset role;

select is(
  (select completed_by::text from public.tasks where id = current_setting('t.closereg')::uuid),
  '00000000-0000-0000-0000-000000027002', 'completed_by records the manager'
);
select is(
  (select array_agg(profile_id::text) from public.task_assignments where task_id = current_setting('t.closereg')::uuid),
  array['00000000-0000-0000-0000-000000027004'], 'the original assignee is preserved'
);

-- 4. Day-to-day isolation ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021', %L::date, 'opening')$$, current_setting('t.tomorrow')),
  'TASK-025 tomorrow''s opening checklist can be generated'
);
reset role;

select is(
  (select count(*)::int from public.tasks t join public.checklist_instances i on i.id = t.checklist_instance_id
   where i.kind = 'opening' and i.service_date = current_setting('t.tomorrow')::date and t.status = 'open'),
  4, 'tomorrow''s opening starts completely clean'
);
select is(
  (select count(*)::int from public.tasks t join public.checklist_instances i on i.id = t.checklist_instance_id
   where i.kind = 'opening' and i.service_date = current_setting('t.today')::date and t.status = 'completed'),
  3, 'TASK-026 today''s checked state is untouched by tomorrow''s generation'
);
select is(
  (select count(distinct t.id)::int from public.tasks t where t.kind = 'opening'),
  8, 'each day has its own task rows'
);

-- 5. Templates change; existing days do not ---------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',%L::uuid,'opening','Weekday Opening','{0,1,2,3,4,5,6}',true,'[{"title":"Only item","assignment_mode":"anyone"}]'::jsonb)$$,
    (select id::text from public.checklist_templates where name = 'Weekday Opening')),
  'TASK-027 editing a template replaces its items'
);
reset role;
select is(
  (select count(*)::int from public.tasks t join public.checklist_instances i on i.id = t.checklist_instance_id
   where i.kind = 'opening' and i.service_date = current_setting('t.today')::date),
  4, 'an existing day keeps its own copy of the items'
);
select is(
  (select count(*)::int from public.tasks where kind = 'opening' and template_item_id is null),
  8, 'generated tasks outlive their template items (link is nulled, not blocked)'
);

-- 6. Applicability and activation -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.checklist_template_save('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021',null,'opening','Other-day Opening',array[((extract(dow from %L::date)::int + 1) %% 7)]::smallint[],true,'[{"title":"X","assignment_mode":"anyone"}]'::jsonb)$$, current_setting('t.tomorrow')),
  'manager saves a template for a different weekday'
);
select lives_ok(
  format($$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021', %L::date, 'opening')$$, current_setting('t.tomorrow')),
  'generation runs again for tomorrow'
);
reset role;
select is(
  (select count(*)::int from public.checklist_instances where name = 'Other-day Opening'),
  0, 'a template that does not apply on that weekday generates nothing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);
select lives_ok(
  format($$select public.checklist_template_set_active(%L::uuid, false)$$, (select id::text from public.checklist_templates where name = 'Weekday Closing')),
  'a template can be archived'
);
select lives_ok(
  format($$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021', %L::date, 'closing')$$, current_setting('t.tomorrow')),
  'generation skips archived templates'
);
reset role;
select is(
  (select count(*)::int from public.checklist_instances where kind = 'closing'),
  1, 'no closing instance was created for tomorrow'
);

-- 7. Notifications, audit and tenant isolation -----------------------------------
select ok(
  exists (select 1 from public.task_notifications
          where recipient_profile_id = '00000000-0000-0000-0000-000000027005' and type = 'checklist_available'),
  'TASK-054 members are told the checklist is ready'
);
select ok(
  not exists (select 1 from public.task_notifications n
              join public.checklist_instances i on i.id = n.checklist_instance_id
              where n.recipient_profile_id = '00000000-0000-0000-0000-000000027006'
                and n.type = 'checklist_available'
                and i.service_date = current_setting('t.today')::date),
  'the person who started the checklist is not notified'
);
select ok(
  exists (select 1 from public.task_events where event_type = 'checklist_generated'),
  'generation is audited'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027008', true);
select throws_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-000000027011','00000000-0000-0000-0000-000000027021')$$,
  '42501', null, 'TASK-070 another organization cannot generate this location''s checklists'
);
select is(
  (select count(*)::int from public.checklist_instances), 0, 'another organization cannot read these checklists'
);
reset role;

select * from finish();
rollback;
