begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Synthetic fixtures are inserted by the direct postgres test operator.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000089001', 'hold-actor@test.invalid'),
  ('00000000-0000-4000-8000-000000089002', 'hold-peer@test.invalid'),
  ('00000000-0000-4000-8000-000000089003', 'hold-staff@test.invalid'),
  ('00000000-0000-4000-8000-000000089004', 'hold-new@test.invalid');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('00000000-0000-4000-8000-000000089001',
        '00000000-0000-4000-8000-000000089001', now(), now());
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like 'hold-%@test.invalid';
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-4000-8000-000000089101', 'Hold test', 'hold-test',
        '00000000-0000-4000-8000-000000089001');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000089101', '00000000-0000-4000-8000-000000089001', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000089101', '00000000-0000-4000-8000-000000089002', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000089101', '00000000-0000-4000-8000-000000089003', array['server']::public.app_role[], true);
insert into public.overall_roles (profile_id, role)
values ('00000000-0000-4000-8000-000000089001', 'owner');

create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate;
end $$;

select ok(not has_function_privilege('authenticated',
  'public.provision_organization(text,text,uuid,jsonb)', 'EXECUTE'),
  'public organization-provision RPC is held');
select ok(not has_table_privilege('authenticated', 'public.organizations', 'INSERT'),
  'direct organization creation is held');
select ok(not has_table_privilege('authenticated', 'public.overall_roles', 'INSERT'),
  'direct Overall-role grant stays unprivileged');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000089001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000089001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000089001"}', true);

select is(pg_temp.err_of($q$select public.provision_organization('Bad', 'hold-bad', null, '{}'::jsonb)$q$),
  '42501', 'Overall Owner cannot use the direct provisioning RPC');
select is(pg_temp.err_of($q$insert into public.organizations (name, slug, created_by) values ('Bad', 'hold-bad', '00000000-0000-4000-8000-000000089001')$q$),
  '42501', 'Overall Owner cannot insert an organization directly');
select is(pg_temp.err_of($q$update public.memberships set roles=array['owner']::public.app_role[] where organization_id='00000000-0000-4000-8000-000000089101' and profile_id='00000000-0000-4000-8000-000000089003'$q$),
  '42501', 'existing staff cannot be promoted to Organization Owner');
select is(pg_temp.err_of($q$update public.memberships set active=false where organization_id='00000000-0000-4000-8000-000000089101' and profile_id='00000000-0000-4000-8000-000000089002'$q$),
  '42501', 'direct Organization Owner deactivation is held');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000089101','00000000-0000-4000-8000-000000089002',false,'hold test')$q$),
  '42501', 'Team RPC cannot deactivate a peer Organization Owner');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000089101','00000000-0000-4000-8000-000000089004',array['owner']::public.app_role[],'hold test')$q$),
  '42501', 'Team RPC cannot add an Organization Owner');
select is(pg_temp.err_of($q$update public.memberships set roles=array['shift_manager']::public.app_role[] where organization_id='00000000-0000-4000-8000-000000089101' and profile_id='00000000-0000-4000-8000-000000089003'$q$),
  'OK', 'ordinary staff designation editing remains available');
select is((select roles from public.memberships where organization_id='00000000-0000-4000-8000-000000089101' and profile_id='00000000-0000-4000-8000-000000089003'),
  array['shift_manager']::public.app_role[], 'ordinary designation change persisted in the transaction');
select is((public.team_add_member('00000000-0000-4000-8000-000000089101','00000000-0000-4000-8000-000000089004',array['server']::public.app_role[],'hold test')->>'outcome'),
  'added', 'ordinary staff assignment remains available');

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select is(pg_temp.err_of($q$insert into public.overall_roles (profile_id, role) values ('00000000-0000-4000-8000-000000089004','owner')$q$),
  '42501', 'service-role HTTP-style writer cannot grant Overall Owner');

reset role;
select * from finish();
rollback;
