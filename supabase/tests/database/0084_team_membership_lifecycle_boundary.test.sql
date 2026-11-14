begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Synthetic identities and organizations; the entire test rolls back.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000084001', 'f5-boundary-owner@test.invalid'),
  ('00000000-0000-4000-8000-000000084002', 'f5-boundary-gm@test.invalid'),
  ('00000000-0000-4000-8000-000000084003', 'f5-boundary-target@test.invalid'),
  ('00000000-0000-4000-8000-000000084004', 'f5-boundary-protected@test.invalid'),
  ('00000000-0000-4000-8000-000000084005', 'f5-boundary-foreign@test.invalid'),
  ('00000000-0000-4000-8000-000000084006', 'f5-boundary-overall-manager@test.invalid'),
  ('00000000-0000-4000-8000-000000084007', 'f5-boundary-audit-failure@test.invalid'),
  ('00000000-0000-4000-8000-000000084008', 'f5-boundary-shift@test.invalid'),
  ('00000000-0000-4000-8000-000000084009', 'f5-boundary-overall-assistant@test.invalid'),
  ('00000000-0000-4000-8000-000000084010', 'f5-boundary-location-manager@test.invalid');
insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'f5-boundary-%@test.invalid';
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like 'f5-boundary-%@test.invalid';
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000084101', 'F5 boundary A', 'f5-boundary-a', '00000000-0000-4000-8000-000000084001'),
  ('00000000-0000-4000-8000-000000084102', 'F5 boundary B', 'f5-boundary-b', '00000000-0000-4000-8000-000000084005');
insert into public.locations (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000084201', '00000000-0000-4000-8000-000000084101', 'F5 boundary location');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084001', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000084102', '00000000-0000-4000-8000-000000084003', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000084102', '00000000-0000-4000-8000-000000084005', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084008', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084010', array['server']::public.app_role[], true);
insert into public.overall_roles (profile_id, role)
values ('00000000-0000-4000-8000-000000084006', 'manager'),
  ('00000000-0000-4000-8000-000000084009', 'assistant_manager');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000084201', '00000000-0000-4000-8000-000000084010', 'manager', true);

create function pg_temp.act(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated', 'session_id', p_id)::text, true);
end $$;
create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate;
end $$;

select ok(not has_table_privilege('authenticated', 'public.memberships', 'INSERT'), 'authenticated has no direct membership INSERT');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'DELETE'), 'authenticated has no direct membership DELETE');
select ok(has_column_privilege('authenticated', 'public.memberships', 'roles', 'UPDATE'), 'role editing remains granted');
select ok(has_function_privilege('authenticated', 'public.team_add_member(uuid,uuid,public.app_role[],text)', 'EXECUTE'), 'authenticated may use assignment RPC');
select ok(not has_function_privilege('anon', 'public.team_add_member(uuid,uuid,public.app_role[],text)', 'EXECUTE'), 'anon cannot use assignment RPC');
select ok(not has_function_privilege('service_role', 'public.team_add_member(uuid,uuid,public.app_role[],text)', 'EXECUTE'), 'service role cannot use assignment RPC');

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000084002');
select is(pg_temp.err_of($q$insert into public.memberships (organization_id, profile_id, roles, active) values ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084003', array['server']::public.app_role[], true)$q$), '42501', 'GM cannot insert membership directly');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['owner']::public.app_role[], 'test assignment')$q$), '42501', 'GM cannot assign owner');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['general_manager']::public.app_role[], 'test assignment')$q$), '42501', 'GM cannot assign peer');
select is((public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084003', array['server']::public.app_role[], 'test assignment')->>'outcome'), 'added', 'GM assigns an existing B employee to A');
select is(pg_temp.err_of($q$update public.memberships set roles=array['shift_manager']::public.app_role[] where organization_id='00000000-0000-4000-8000-000000084101' and profile_id='00000000-0000-4000-8000-000000084003'$q$), 'OK', 'GM can edit eligible role');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['server']::public.app_role[], 'x')$q$), '22023', 'assignment requires reason');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084003', array['server']::public.app_role[], 'test assignment')$q$), '23505', 'existing membership cannot be recreated');
reset role;
select is((select count(*)::int from public.audit_events where organization_id='00000000-0000-4000-8000-000000084101' and action='member_added' and entity_id='00000000-0000-4000-8000-000000084003'), 1, 'assignment audited once');
select is((select count(*)::int from public.passcode_credentials where organization_id='00000000-0000-4000-8000-000000084101' and profile_id='00000000-0000-4000-8000-000000084003'), 0, 'existing B credential is not copied to A');

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000084002');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084003', false, 'test removal')->>'outcome'), 'changed', 'ordinary removal deactivates through F-5');
select is(pg_temp.err_of($q$delete from public.memberships where organization_id='00000000-0000-4000-8000-000000084101' and profile_id='00000000-0000-4000-8000-000000084003'$q$), '42501', 'GM cannot delete inactive membership directly');
select is(pg_temp.err_of($q$insert into public.memberships (organization_id, profile_id, roles, active) values ('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['server']::public.app_role[], true)$q$), '42501', 'GM cannot bypass removal by direct recreation');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084003', true, 'test return')->>'outcome'), 'changed', 'reactivation uses F-5');
reset role;
select is((select count(*)::int from public.audit_events where organization_id='00000000-0000-4000-8000-000000084101' and entity_id='00000000-0000-4000-8000-000000084003' and action in ('member_deactivated','member_reactivated')), 2, 'removal and return audited');

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000084005');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['server']::public.app_role[], 'test assignment')$q$), '42501', 'B owner cannot assign in A');
select pg_temp.act('00000000-0000-4000-8000-000000084006');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['owner']::public.app_role[], 'test assignment')$q$), '42501', 'Overall manager cannot assign owner');
select pg_temp.act('00000000-0000-4000-8000-000000084008');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084007', array['server']::public.app_role[], 'test assignment')$q$), '42501', 'shift manager cannot assign organization member');
select pg_temp.act('00000000-0000-4000-8000-000000084009');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084007', array['server']::public.app_role[], 'test assignment')$q$), '42501', 'Overall assistant manager cannot assign');
select pg_temp.act('00000000-0000-4000-8000-000000084010');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084007', array['server']::public.app_role[], 'test assignment')$q$), '42501', 'location manager cannot assign organization member');
select pg_temp.act('00000000-0000-4000-8000-000000084001');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084001', array['server']::public.app_role[], 'test assignment')$q$), '42501', 'owner cannot self-assign');
select is((public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084004', array['general_manager']::public.app_role[], 'test assignment')->>'outcome'), 'added', 'Organization owner can assign GM');
reset role;

create function pg_temp.fail_add_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'member_added' then
    raise exception 'forced audit failure';
  end if;
  return new;
end $$;
create trigger fail_add_audit before insert on public.audit_events
  for each row execute function pg_temp.fail_add_audit();
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000084001');
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084007', array['server']::public.app_role[], 'test assignment')$q$), 'P0001', 'audit failure aborts assignment');
reset role;
drop trigger fail_add_audit on public.audit_events;
select is((select count(*)::int from public.memberships where organization_id='00000000-0000-4000-8000-000000084101' and profile_id='00000000-0000-4000-8000-000000084007'), 0, 'failed audit leaves no membership');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000084001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000084001","role":"authenticated"}', true);
select is(pg_temp.err_of($q$select public.team_add_member('00000000-0000-4000-8000-000000084101', '00000000-0000-4000-8000-000000084007', array['server']::public.app_role[], 'test assignment')$q$), '28000', 'assignment rejects token without live session');
reset role;

select * from finish();
rollback;
