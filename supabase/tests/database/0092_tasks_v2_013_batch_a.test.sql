begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- V2.0.13 Batch A: task checklists, status transitions, archive/delete, conflicts.
-- Cast: Mona = manager at A / staff at B; Ann, Bea = staff at A; Cal = staff at B;
-- Otto = owner of another organization. Org 1 has locations A and B.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000092001','t92-mona@test.invalid'),
 ('00000000-0000-4000-8000-000000092002','t92-ann@test.invalid'),
 ('00000000-0000-4000-8000-000000092003','t92-bea@test.invalid'),
 ('00000000-0000-4000-8000-000000092004','t92-cal@test.invalid'),
 ('00000000-0000-4000-8000-000000092005','t92-otto@test.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where email like 't92-%';
insert into public.profiles(id,display_name) select id,email from auth.users where email like 't92-%';
insert into public.organizations(id,name,slug,created_by) values
 ('00000000-0000-4000-8000-000000092010','T92 org','t92-org','00000000-0000-4000-8000-000000092001'),
 ('00000000-0000-4000-8000-000000092011','T92 other','t92-other','00000000-0000-4000-8000-000000092005');
insert into public.locations(id,organization_id,name,time_zone) values
 ('00000000-0000-4000-8000-000000092021','00000000-0000-4000-8000-000000092010','A','America/Chicago'),
 ('00000000-0000-4000-8000-000000092022','00000000-0000-4000-8000-000000092010','B','America/Chicago'),
 ('00000000-0000-4000-8000-000000092023','00000000-0000-4000-8000-000000092011','C','America/Chicago');
insert into public.memberships(organization_id,profile_id,roles) values
 ('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092001',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092002',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092003',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092004',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000092011','00000000-0000-4000-8000-000000092005',array['owner']::public.app_role[]);
insert into public.location_memberships(location_id,profile_id,role) values
 ('00000000-0000-4000-8000-000000092021','00000000-0000-4000-8000-000000092001','manager'),
 ('00000000-0000-4000-8000-000000092022','00000000-0000-4000-8000-000000092001','staff'),
 ('00000000-0000-4000-8000-000000092021','00000000-0000-4000-8000-000000092002','staff'),
 ('00000000-0000-4000-8000-000000092021','00000000-0000-4000-8000-000000092003','staff'),
 ('00000000-0000-4000-8000-000000092022','00000000-0000-4000-8000-000000092004','staff'),
 ('00000000-0000-4000-8000-000000092023','00000000-0000-4000-8000-000000092005','manager');
-- A task (with a step) at B that the manager of A (only staff at B) must not touch.
insert into public.tasks(id,organization_id,location_id,title,created_by,assignment_mode) values
 ('00000000-0000-4000-8000-000000092090','00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092022','B only task','00000000-0000-4000-8000-000000092004','individual');
insert into public.task_assignments(task_id,profile_id,organization_id,assigned_by) values ('00000000-0000-4000-8000-000000092090','00000000-0000-4000-8000-000000092004','00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092004');
insert into public.task_checklist_items(id,task_id,organization_id,title,sort_order,created_by) values
 ('00000000-0000-4000-8000-000000092091','00000000-0000-4000-8000-000000092090','00000000-0000-4000-8000-000000092010','B step',1,'00000000-0000-4000-8000-000000092004');

-- 1. Schema and grants ------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid='public.task_checklist_items'::regclass),'RLS enabled on task_checklist_items');
select ok(not has_table_privilege('authenticated','public.task_checklist_items','insert') and not has_table_privilege('authenticated','public.task_checklist_items','update') and not has_table_privilege('authenticated','public.task_checklist_items','delete'),'steps are RPC-write-only');
select ok(not has_function_privilege('anon','public.task_delete(uuid)','execute') and has_function_privilege('authenticated','public.task_delete(uuid)','execute'),'task_delete grants');
select ok(not has_function_privilege('anon','public.task_checklist_step_set(uuid,uuid,boolean)','execute') and has_function_privilege('authenticated','public.task_checklist_step_set(uuid,uuid,boolean)','execute'),'step RPC grants');
select ok(not has_function_privilege('authenticated','private.tasks_checklist_replace(uuid,uuid,jsonb)','execute') and not has_function_privilege('authenticated','private.tasks_archive(uuid,text)','execute'),'internal helpers are private');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('task_update','task_create')),2,'one signature each of task_update and task_create (no stale overloads)');

-- 2. Create with a checklist -----------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092002',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092002')::text,true);
select throws_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092021','Staff try',null,'other','normal','anyone','{}',false,null,null,null,null,'[{"title":"x"}]'::jsonb)$$,'42501',null,'staff cannot create a task with a checklist');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092021','Opening Kitchen',null,'kitchen','normal','individual',array['00000000-0000-4000-8000-000000092002']::uuid[],false,null,null,null,null,'[{"title":"Check fridge temps"},{"title":"Refill lassi"},{"title":"Prep chutney"}]'::jsonb)$$,'manager creates a task with three steps');

reset role;
select set_config('app.t1',(select id::text from public.tasks where title='Opening Kitchen'),true);
select set_config('app.s1',(select id::text from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and title='Check fridge temps'),true);
select set_config('app.s3',(select id::text from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and title='Prep chutney'),true);
select is((select count(*)::int from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and archived_at is null),3,'three live steps stored');
select is((select string_agg(title,'|' order by sort_order) from public.task_checklist_items where task_id=current_setting('app.t1')::uuid),'Check fridge temps|Refill lassi|Prep chutney','steps keep their order');

-- 3. Visibility and ticking --------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092002',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092002')::text,true);
select is((select count(*)::int from public.task_checklist_items where task_id=current_setting('app.t1')::uuid),3,'the assignee sees the steps');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092003',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092003')::text,true);
select is((select count(*)::int from public.task_checklist_items where task_id=current_setting('app.t1')::uuid),0,'a non-assignee cannot read an individual task steps');
select throws_ok($$select public.task_checklist_step_set(current_setting('app.t1')::uuid,current_setting('app.s1')::uuid,true)$$,'42501',null,'a non-assignee cannot tick a step');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092004',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092004')::text,true);
select is((select count(*)::int from public.task_checklist_items where organization_id='00000000-0000-4000-8000-000000092010' and task_id=current_setting('app.t1')::uuid),0,'staff at another location sees no steps of A');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092002',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092002')::text,true);
select lives_ok($$select public.task_checklist_step_set(current_setting('app.t1')::uuid,current_setting('app.s1')::uuid,true)$$,'the assignee ticks a step');
select lives_ok($$select public.task_checklist_step_set(current_setting('app.t1')::uuid,current_setting('app.s1')::uuid,true)$$,'ticking again is a no-op');
select throws_ok($$select public.task_checklist_step_set(current_setting('app.t1')::uuid,'00000000-0000-4000-8000-000000092091',true)$$,'22023',null,'a step of another task cannot be ticked through this task');
select throws_ok($$select public.task_update(current_setting('app.t1')::uuid,'Hack',null,'other','normal',null,null,null,null,null,null,null)$$,'42501',null,'staff cannot edit a task');
select throws_ok($$select public.task_delete(current_setting('app.t1')::uuid)$$,'42501',null,'staff cannot delete a task');

reset role;
select is((select completed_by::text from public.task_checklist_items where id=current_setting('app.s1')::uuid),'00000000-0000-4000-8000-000000092002','the tick records who did it');
select is((select count(*)::int from public.task_events where task_id=current_setting('app.t1')::uuid and event_type='checklist_step_checked'),1,'one audit entry for the tick (the repeat adds none)');

-- 4. Manager edits the checklist -------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen',null,'kitchen','normal',null,null,null,null,null,
 jsonb_build_array(jsonb_build_object('id',current_setting('app.s3'),'title','Prep mint chutney'),jsonb_build_object('id',current_setting('app.s1'),'title','Check fridge temps'),jsonb_build_object('title','Sanitize counters')),0)$$,'manager renames, reorders, removes and adds steps in one edit');

reset role;
select is((select string_agg(title,'|' order by sort_order) from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and archived_at is null),'Prep mint chutney|Check fridge temps|Sanitize counters','live steps match the saved list');
select is((select count(*)::int from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and title='Refill lassi' and archived_at is not null),1,'the removed step is archived, not deleted');
select ok((select completed_at is not null from public.task_checklist_items where id=current_setting('app.s1')::uuid),'a retained step keeps its completion');
select is((select checklist_rev from public.tasks where id=current_setting('app.t1')::uuid),1,'the checklist revision advanced');
select is((select count(*)::int from public.task_events where task_id=current_setting('app.t1')::uuid and event_type='checklist_edited'),1,'the checklist edit is audited');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select throws_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen',null,'kitchen','normal',null,null,null,null,null,'[{"title":"stale"}]'::jsonb,0)$$,'P0001',null,'a stale checklist revision is refused');
select throws_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen',null,'kitchen','normal',null,null,null,null,now() - interval '1 hour',null,null)$$,'P0001',null,'a stale updated_at is refused');
select lives_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen!',null,'kitchen','normal',null,null,null,null,(select updated_at from public.tasks where id=current_setting('app.t1')::uuid),null,null)$$,'a current updated_at is accepted');
select throws_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen!',null,'kitchen','normal',null,null,null,null,null,jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000092091','title','x')),null)$$,'22023',null,'a foreign step id cannot be smuggled into the checklist');
select throws_ok($$select public.task_update(current_setting('app.t1')::uuid,'Opening Kitchen!',null,'kitchen','normal',null,null,null,null,null,'[{"title":"  "}]'::jsonb,null)$$,'22023',null,'a blank step title is refused');

reset role;
select is((select count(*)::int from public.task_checklist_items where task_id=current_setting('app.t1')::uuid and archived_at is null),3,'a null checklist leaves the steps untouched');

-- 5. Status transitions ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092002',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092002')::text,true);
select lives_ok($$select public.task_set_status(current_setting('app.t1')::uuid,'in_progress')$$,'Not Started -> In Progress');
select lives_ok($$select public.task_set_status(current_setting('app.t1')::uuid,'open')$$,'In Progress -> Not Started');
select lives_ok($$select public.task_complete(current_setting('app.t1')::uuid,null)$$,'Not Started -> Completed even with unticked steps');
select throws_ok($$select public.task_checklist_step_set(current_setting('app.t1')::uuid,current_setting('app.s1')::uuid,false)$$,'22023',null,'steps are frozen on a completed task');
select lives_ok($$select public.task_set_status(current_setting('app.t1')::uuid,'in_progress')$$,'Completed -> In Progress by the completer');
select throws_ok($$select public.task_set_status(current_setting('app.t1')::uuid,'completed')$$,'22023',null,'Completed is set through task_complete, not set_status');

reset role;
select ok((select status='in_progress' and completed_at is null and completed_by is null from public.tasks where id=current_setting('app.t1')::uuid),'reopening clears the live completion');
select is((select count(*)::int from public.task_events where task_id=current_setting('app.t1')::uuid and event_type in ('completed','reopened')),2,'the earlier completion stays in the audit trail');

-- 6. Cross-location and cross-organization ----------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select throws_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092022','Not mine',null,'other','normal','anyone','{}',false,null,null,null,null,null)$$,'42501',null,'a manager at A cannot create at B');
select throws_ok($$select public.task_update('00000000-0000-4000-8000-000000092090','Hack',null,'other','normal',null,null,null,null,null,'[{"title":"x"}]'::jsonb,null)$$,'42501',null,'a manager at A cannot edit a task at B');
select throws_ok($$select public.task_delete('00000000-0000-4000-8000-000000092090')$$,'42501',null,'a manager at A cannot delete a task at B');
select throws_ok($$select public.task_checklist_step_set('00000000-0000-4000-8000-000000092090','00000000-0000-4000-8000-000000092091',true)$$,'42501',null,'staff-at-B authority cannot tick steps of a task they cannot work');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092005',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092005')::text,true);
select throws_ok($$select public.task_delete(current_setting('app.t1')::uuid)$$,'42501',null,'another organization cannot delete the task');
select is((select count(*)::int from public.task_checklist_items),0,'another organization reads no steps');

-- 7. Delete versus archive -----------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092021','Throwaway',null,'other','normal','anyone','{}',false,null,null,null,null,'[{"title":"s"}]'::jsonb)$$,'manager creates a throwaway task');
reset role;
select set_config('app.t2',(select id::text from public.tasks where title='Throwaway'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select is((select public.task_delete(current_setting('app.t2')::uuid)),'deleted','a history-free task is permanently deleted');
reset role;
select ok(not exists(select 1 from public.tasks where id=current_setting('app.t2')::uuid) and not exists(select 1 from public.task_checklist_items where task_id=current_setting('app.t2')::uuid),'the task and its steps are gone');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092021','Has history',null,'other','normal','anyone','{}',false,null,null,null,null,null)$$,'manager creates a task to work on');
reset role;
select set_config('app.t3',(select id::text from public.tasks where title='Has history'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_set_status(current_setting('app.t3')::uuid,'in_progress')$$,'it gets worked on');
select is((select public.task_delete(current_setting('app.t3')::uuid)),'archived','a task with history is archived, not deleted');
reset role;
select ok((select status='cancelled' and archived_at is not null and archived_by is not null from public.tasks where id=current_setting('app.t3')::uuid),'archived active work is also cancelled so sweeps skip it');
select is((select count(*)::int from public.task_events where task_id=current_setting('app.t3')::uuid and event_type='archived'),1,'the archive is audited');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select throws_ok($$select public.task_set_status(current_setting('app.t3')::uuid,'open')$$,'22023',null,'an archived task cannot change status');
select throws_ok($$select public.task_update(current_setting('app.t3')::uuid,'x',null,'other','normal',null,null,null,null,null,null,null)$$,'22023',null,'an archived task cannot be edited');
select is((select public.task_delete(current_setting('app.t3')::uuid)),'archived','deleting an archived task is idempotent');

select lives_ok($$select public.task_create('00000000-0000-4000-8000-000000092010','00000000-0000-4000-8000-000000092021','Done thing',null,'other','normal','anyone','{}',false,null,null,null,null,null)$$,'manager creates another task');
reset role;
select set_config('app.t4',(select id::text from public.tasks where title='Done thing'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select lives_ok($$select public.task_complete(current_setting('app.t4')::uuid,null)$$,'it is completed');
select is((select public.task_delete(current_setting('app.t4')::uuid)),'archived','a completed task is archived');
reset role;
select ok((select status='completed' and archived_at is not null from public.tasks where id=current_setting('app.t4')::uuid),'an archived completed task keeps Completed and its record');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000092001',true);
select set_config('request.jwt.claims',json_build_object('session_id','00000000-0000-4000-8000-000000092001')::text,true);
select throws_ok($$select public.task_reopen(current_setting('app.t4')::uuid)$$,'22023',null,'an archived completed task cannot be reopened');
select throws_ok($$select public.task_set_status(current_setting('app.t4')::uuid,'in_progress')$$,'22023',null,'nor moved back to In Progress');

reset role;
select * from finish();
rollback;
