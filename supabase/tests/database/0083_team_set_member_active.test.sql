begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- All rows are synthetic and rolled back. The role and JWT GUCs model a real
-- PostgREST caller, including the Supabase session_id claim.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000083001', 'f5-owner@test.invalid'),
  ('00000000-0000-4000-8000-000000083002', 'f5-gm@test.invalid'),
  ('00000000-0000-4000-8000-000000083003', 'f5-shift@test.invalid'),
  ('00000000-0000-4000-8000-000000083004', 'f5-target@test.invalid'),
  ('00000000-0000-4000-8000-000000083005', 'f5-foreign@test.invalid'),
  ('00000000-0000-4000-8000-000000083006', 'f5-overall-owner@test.invalid'),
  ('00000000-0000-4000-8000-000000083007', 'f5-overall-manager@test.invalid'),
  ('00000000-0000-4000-8000-000000083008', 'f5-overall-assistant@test.invalid'),
  ('00000000-0000-4000-8000-000000083009', 'f5-location-manager@test.invalid'),
  ('00000000-0000-4000-8000-000000083010', 'f5-no-member@test.invalid'),
  ('00000000-0000-4000-8000-000000083011', 'f5-credential-less@test.invalid');
insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'f5-%@test.invalid';
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like 'f5-%@test.invalid';
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000083101', 'F5 A', 'f5-a', '00000000-0000-4000-8000-000000083001'),
  ('00000000-0000-4000-8000-000000083102', 'F5 B', 'f5-b', '00000000-0000-4000-8000-000000083005');
insert into public.locations (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000083201', '00000000-0000-4000-8000-000000083101', 'F5 A1');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083001', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083102', '00000000-0000-4000-8000-000000083004', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083102', '00000000-0000-4000-8000-000000083005', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083009', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083011', array['server']::public.app_role[], true);
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000083201', '00000000-0000-4000-8000-000000083009', 'manager', true);
insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000083006', 'owner'),
  ('00000000-0000-4000-8000-000000083007', 'manager'),
  ('00000000-0000-4000-8000-000000083008', 'assistant_manager');
insert into public.passcode_credentials (organization_id, profile_id, locator, synthetic_email, active)
values ('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', repeat('a', 64), 'f5-target-credential@test.invalid', true);
insert into public.payroll_settings (organization_id, default_rate_cents, updated_by)
values ('00000000-0000-4000-8000-000000083101', 1700, '00000000-0000-4000-8000-000000083001');

create function pg_temp.act(p_id uuid, p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated', 'session_id', coalesce(p_session, p_id))::text, true);
end $$;
create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate;
end $$;

select ok(has_function_privilege('authenticated', 'public.team_set_member_active(uuid,uuid,boolean,text)', 'EXECUTE'), 'authenticated may call Team RPC');
select ok(not has_function_privilege('anon', 'public.team_set_member_active(uuid,uuid,boolean,text)', 'EXECUTE'), 'anonymous cannot call Team RPC');
select ok(not has_function_privilege('service_role', 'public.team_set_member_active(uuid,uuid,boolean,text)', 'EXECUTE'), 'service role has no direct Team RPC grant');
select ok(not has_function_privilege('authenticated', 'private.team_live_session()', 'EXECUTE'), 'private session helper is not directly callable');
select ok(not has_column_privilege('authenticated', 'public.memberships', 'active', 'UPDATE'), 'authenticated cannot update active directly');
select ok(has_column_privilege('authenticated', 'public.memberships', 'roles', 'UPDATE'), 'authorized role editing retains column privilege');

set local role anon;
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'anon RPC denied by grant');
reset role;
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083010');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'authenticated non-member denied');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083199', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'unknown organization has the same denial for unauthorized caller');
select pg_temp.act('00000000-0000-4000-8000-000000083003');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'shift manager denied');
select pg_temp.act('00000000-0000-4000-8000-000000083009');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'location manager denied Team-wide authority');
select pg_temp.act('00000000-0000-4000-8000-000000083008');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'Overall assistant manager denied');
select pg_temp.act('00000000-0000-4000-8000-000000083005');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '42501', 'other organization owner denied');
select pg_temp.act('00000000-0000-4000-8000-000000083002');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083001', false, 'test reason')$q$), '42501', 'GM cannot deactivate owner');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083002', false, 'test reason')$q$), '42501', 'self-target denied');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083010', false, 'test reason')$q$), 'P0002', 'authorized actor sees missing target');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'x')$q$), '22023', 'reason lower bound enforced');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, repeat('x', 501))$q$), '22023', 'reason upper bound enforced');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', null, 'test reason')$q$), '22023', 'null active state denied');
select is(pg_temp.err_of($q$update public.memberships set active=false where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'$q$), '42501', 'direct active update denied');
select is(pg_temp.err_of($q$update public.memberships set roles=array['server']::public.app_role[] where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'$q$), 'OK', 'GM retains authorized role editing');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')->>'outcome'), 'changed', 'GM deactivates staff');
reset role;
select is((select active from public.memberships where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'), false, 'A membership inactive');
select is((select active from public.memberships where organization_id='00000000-0000-4000-8000-000000083102' and profile_id='00000000-0000-4000-8000-000000083004'), true, 'B membership remains active');
select is((select active from public.passcode_credentials where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'), false, 'credential deactivated atomically');
select is((select count(*)::int from public.audit_events where entity_id='00000000-0000-4000-8000-000000083004' and action='member_deactivated'), 1, 'deactivation audited once');

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083004');
select is((select count(*)::int from public.memberships where organization_id='00000000-0000-4000-8000-000000083101'), 0, 'existing session loses A visibility');
select ok(not private.has_org_role('00000000-0000-4000-8000-000000083101', array['server']::public.app_role[]), 'existing session loses A authorization');
select ok(private.has_org_role('00000000-0000-4000-8000-000000083102', array['server']::public.app_role[]), 'same session keeps B authorization');
reset role;

-- Missing, revoked and expired sessions never authorize a privileged write.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-4000-8000-000000083001', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000083001', true);
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')$q$), '28000', 'missing session_id denied');
select pg_temp.act('00000000-0000-4000-8000-000000083001', '00000000-0000-4000-8000-000000083099');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')$q$), '28000', 'revoked or unknown session denied');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000083003';
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083003');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')$q$), '28000', 'expired session denied');
reset role;

-- An independent Auth ban is never overwritten, cleared, or used as a target gate.
update auth.users set banned_until = now() + interval '24 hours' where id='00000000-0000-4000-8000-000000083004';
create temp table f5_ban_before as select banned_until from auth.users where id='00000000-0000-4000-8000-000000083004';
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083001');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')->>'outcome'), 'changed', 'owner reactivates under independent ban');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')->>'outcome'), 'already_in_state', 'repeat call converges without another audit');
reset role;
select is((select banned_until from auth.users where id='00000000-0000-4000-8000-000000083004'), (select banned_until from f5_ban_before), 'independent ban unchanged by reactivation');
select is((select count(*)::int from public.audit_events where entity_id='00000000-0000-4000-8000-000000083004' and action='member_reactivated'), 1, 'repeat call does not duplicate audit');
update auth.users set banned_until=now()+interval '24 hours' where id='00000000-0000-4000-8000-000000083002';
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083002');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')$q$), '28000', 'globally banned actor denied');
reset role;
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083001');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', false, 'test reason')->>'outcome'), 'changed', 'owner deactivates independently banned target');
reset role;
select is((select banned_until from auth.users where id='00000000-0000-4000-8000-000000083004'), (select banned_until from f5_ban_before), 'independent ban unchanged by deactivation');

-- The intentionally missing credential row is a supported historical state.
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083006');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083199', '00000000-0000-4000-8000-000000083011', false, 'test reason')$q$), '42501', 'unknown organization is uniformly denied even to Overall owner');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083011', false, 'test reason')->>'credential_present'), 'false', 'Overall owner handles missing credential');
select pg_temp.act('00000000-0000-4000-8000-000000083007');
select is((public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083011', true, 'test reason')->>'outcome'), 'changed', 'Overall manager may reactivate staff');
reset role;

-- A trigger failure proves that a credential write cannot partially reactivate.
create function pg_temp.fail_f5_credential() returns trigger language plpgsql as $$begin raise exception 'forced credential failure'; end $$;
create trigger f5_credential_failure before update on public.passcode_credentials for each row execute function pg_temp.fail_f5_credential();
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083001');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')$q$), 'P0001', 'credential failure propagates');
reset role;
select is((select active from public.memberships where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'), false, 'credential failure leaves membership inactive');
drop trigger f5_credential_failure on public.passcode_credentials;
create function pg_temp.fail_f5_audit() returns trigger language plpgsql as $$begin raise exception 'forced audit failure'; end $$;
create trigger f5_audit_failure before insert on public.audit_events for each row execute function pg_temp.fail_f5_audit();
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083001');
select is(pg_temp.err_of($q$select public.team_set_member_active('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083004', true, 'test reason')$q$), 'P0001', 'audit failure propagates');
reset role;
select is((select active from public.memberships where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'), false, 'audit failure rolls back membership');
select is((select active from public.passcode_credentials where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083004'), false, 'audit failure rolls back credential');
drop trigger f5_audit_failure on public.audit_events;

-- S1 Payroll: the public advisory function has a location-only true branch,
-- while protected Payroll authority still requires active org membership.
update public.memberships set active=false where organization_id='00000000-0000-4000-8000-000000083101' and profile_id='00000000-0000-4000-8000-000000083009';
select is((select count(*)::int from public.payroll_settings where organization_id='00000000-0000-4000-8000-000000083101'), 1, 'Payroll protected row exists for direct probe');
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000083009');
select ok(public.payroll_location_authorized('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083201'), 'R-2 advisory Payroll function returns true for stale location row');
select ok(not private.payroll_can_manage_location('00000000-0000-4000-8000-000000083101', '00000000-0000-4000-8000-000000083201'), 'protected Payroll manager predicate denies inactive organization member');
select is((select count(*)::int from public.payroll_settings where organization_id='00000000-0000-4000-8000-000000083101'), 0, 'protected Payroll settings are not visible');
reset role;

select * from finish();
rollback;
