begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000065001','tasks-scope-manager@test.invalid'),
 ('00000000-0000-4000-8000-000000065002','tasks-scope-staff@test.invalid'),
 ('00000000-0000-4000-8000-000000065003','tasks-scope-overall@test.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where email like 'tasks-scope-%';
insert into public.profiles(id,display_name) select id,email from auth.users where email like 'tasks-scope-%';
insert into public.organizations(id,name,slug,created_by) values
 ('00000000-0000-4000-8000-000000065010','Tasks policy scope','tasks-policy-scope','00000000-0000-4000-8000-000000065001');
insert into public.locations(id,organization_id,name) values
 ('00000000-0000-4000-8000-000000065011','00000000-0000-4000-8000-000000065010','A'),
 ('00000000-0000-4000-8000-000000065012','00000000-0000-4000-8000-000000065010','B');
insert into public.memberships(organization_id,profile_id,roles) values
 ('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065001',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065002',array['server']::public.app_role[]);
insert into public.location_memberships(location_id,profile_id,role) values
 ('00000000-0000-4000-8000-000000065011','00000000-0000-4000-8000-000000065001','manager'),
 ('00000000-0000-4000-8000-000000065012','00000000-0000-4000-8000-000000065001','staff'),
 ('00000000-0000-4000-8000-000000065011','00000000-0000-4000-8000-000000065002','staff');
insert into public.overall_roles(profile_id,role) values('00000000-0000-4000-8000-000000065003','assistant_manager');

select ok(not has_function_privilege('anon','public.tasks_location_people(uuid,uuid)','execute'),'anonymous people RPC denied');
select ok(has_function_privilege('authenticated','public.tasks_location_people(uuid,uuid)','execute'),'authenticated people RPC granted');
select ok(not has_function_privilege('anon','public.tasks_location_authorized(uuid,uuid)','execute'),'anonymous readiness RPC denied');
select ok(has_function_privilege('authenticated','public.tasks_location_authorized(uuid,uuid)','execute'),'authenticated readiness RPC granted');
select ok(not has_function_privilege('anon','public.task_notifications_mark_location_read(uuid,uuid,bigint[])','execute'),'anonymous scoped mark-read denied');
select ok(has_function_privilege('authenticated','public.task_notifications_mark_location_read(uuid,uuid,bigint[])','execute'),'authenticated scoped mark-read granted');
select ok(not has_function_privilege('authenticated','private.tasks_profile_level(uuid,uuid,uuid)','execute'),'arbitrary profile role helper private');
select ok(not has_function_privilege('authenticated','private.tasks_workforce_eligible(uuid,uuid,uuid)','execute'),'workforce helper private');
select ok(not has_function_privilege('authenticated','private.tasks_live_session()','execute'),'session helper private');
select ok(not has_table_privilege('authenticated','public.tasks','insert'),'direct task insert revoked');
select ok(not has_table_privilege('authenticated','public.task_events','update'),'audit update revoked');
select ok(not has_table_privilege('authenticated','public.task_notifications','update'),'notification update RPC-only');
select is((select count(*)::integer from pg_constraint where conname in
 ('task_assignments_member_fk','checklist_template_item_assignees_member_fk','task_recurrence_assignees_member_fk','task_notifications_recipient_fk') and convalidated),4,'all four workforce/recipient membership FKs retained');
select is((select count(*)::integer from pg_constraint where conname in
 ('checklist_templates_created_by_profile_fk','task_recurrence_rules_created_by_profile_fk','checklist_instances_generated_by_profile_fk','tasks_created_by_profile_fk','tasks_started_by_profile_fk','tasks_completed_by_profile_fk','tasks_cancelled_by_profile_fk','task_assignments_assigned_by_profile_fk','task_events_actor_profile_id_profile_fk') and convalidated),9,'nine attribution profile FKs validated');
select ok(exists(select 1 from pg_indexes where indexname='task_notifications_location_recipient_idx'),'location inbox index exists');
select ok(exists(select 1 from pg_constraint where conname='task_notifications_location_tenant_fk' and convalidated),'notification location tenant FK validated');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('tasks_profile_level','tasks_workforce_eligible','tasks_live_session','tasks_location_people','tasks_notification_scope')
 and (not p.prosecdef or not ('search_path=""'=any(p.proconfig)))),'new privileged helpers have fixed empty search path');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000065001',true);
select set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000065001"}',true);
select ok(private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'assigned manager access A');
select ok(private.tasks_is_manager('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'manager at A');
select ok(not private.tasks_is_manager('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012'),'organization GM is only Staff at B');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000065002',true);
select set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000065002"}',true);
select ok(private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'Staff assigned A allowed');
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012'),'same tenant B denied');
update public.location_memberships set active=false where profile_id='00000000-0000-4000-8000-000000065002';
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'revoked assignment denied immediately');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000065003',true);
select set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000065003"}',true);
select ok(private.tasks_is_manager('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012'),'Overall Assistant can manage Tasks without membership');
select is(private.tasks_profile_level('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012','00000000-0000-4000-8000-000000065003'),2,'Assistant tier is preserved');
select ok(not private.tasks_workforce_eligible('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012','00000000-0000-4000-8000-000000065003'),'Overall actor not fabricated workforce');
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065011','00000000-0000-4000-8000-000000065012'),'Overall mismatched tenant denied');
update public.locations set active=false where id='00000000-0000-4000-8000-000000065012';
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012'),'inactive denied to Overall');
update public.locations set archived_at=now() where id='00000000-0000-4000-8000-000000065012';
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065012'),'archived denied to Overall');
delete from auth.sessions where user_id='00000000-0000-4000-8000-000000065003';
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'revoked session denied');
select set_config('request.jwt.claims','{}',true);
select ok(not private.tasks_can_access_location('00000000-0000-4000-8000-000000065010','00000000-0000-4000-8000-000000065011'),'identity without live session denied');
select is((select mode::text from public.module_enforcement_settings),'staged','backend remains STAGED');
select ok(position('assert_location_module_enabled' in pg_get_functiondef('private.tasks_begin(uuid,uuid)'::regprocedure))>0,'tasks_begin module gate retained');
select ok(position('recipient_profile_id = (select auth.uid())' in pg_get_functiondef('public.task_notifications_mark_read(bigint[])'::regprocedure))>0,'mark-read retains own recipient restriction');
select ok(position('tasks_live_session' in pg_get_functiondef('public.task_notifications_mark_read(bigint[])'::regprocedure))>0,'mark-read validates live session');
select * from finish();
rollback;
