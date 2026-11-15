begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Synthetic actors and records. Everything below rolls back.
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-0000000860' || lpad(n::text, 2, '0'))::uuid,
       'b2-rls-' || n || '@test.invalid'
from generate_series(1, 12) n;
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like 'b2-rls-%@test.invalid';
insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000086005', 'assistant_manager'),
  ('00000000-0000-4000-8000-000000086006', 'manager'),
  ('00000000-0000-4000-8000-000000086007', 'owner');
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000086101', 'B2 Org A', 'b2-org-a', '00000000-0000-4000-8000-000000086011'),
  ('00000000-0000-4000-8000-000000086102', 'B2 Org B', 'b2-org-b', '00000000-0000-4000-8000-000000086008');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086001', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086002', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086003', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086004', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086102', '00000000-0000-4000-8000-000000086008', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086009', array['server']::public.app_role[], false),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086010', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086011', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086012', array['server']::public.app_role[], true);
insert into public.locations (id, organization_id, name, active, archived_at) values
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086101', 'B2 A', true, null),
  ('00000000-0000-4000-8000-000000086202', '00000000-0000-4000-8000-000000086101', 'B2 B', true, null),
  ('00000000-0000-4000-8000-000000086203', '00000000-0000-4000-8000-000000086102', 'B2 Foreign', true, null),
  ('00000000-0000-4000-8000-000000086204', '00000000-0000-4000-8000-000000086101', 'B2 Inactive', false, null),
  ('00000000-0000-4000-8000-000000086205', '00000000-0000-4000-8000-000000086101', 'B2 Archived', false, now());
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086001', 'staff', true),
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086002', 'manager', true),
  ('00000000-0000-4000-8000-000000086202', '00000000-0000-4000-8000-000000086003', 'staff', true),
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086004', 'manager', true),
  ('00000000-0000-4000-8000-000000086203', '00000000-0000-4000-8000-000000086008', 'staff', true),
  ('00000000-0000-4000-8000-000000086202', '00000000-0000-4000-8000-000000086009', 'staff', true),
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086011', 'manager', true),
  ('00000000-0000-4000-8000-000000086201', '00000000-0000-4000-8000-000000086012', 'manager', true);
insert into public.floor_templates (id, organization_id, location_id, name, meal_period, server_count)
overriding system value values
  (8601, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201', 'A Floor', 'service', 2),
  (8602, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202', 'B Floor', 'service', 2),
  (8603, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086204', 'Inactive Floor', 'service', 2),
  (8604, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086205', 'Archived Floor', 'service', 2),
  (8605, '00000000-0000-4000-8000-000000086102', '00000000-0000-4000-8000-000000086203', 'Foreign Floor', 'service', 2);
insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value values
  (8621, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201', 'A Area', 1),
  (8622, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202', 'B Area', 1);
insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, active)
overriding system value values
  (8631, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201', 8621, 'A1', 4, true),
  (8632, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202', 8622, 'B1', 4, true);
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value values
  (8611, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201', current_date, 'service', 'active'),
  (8612, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202', current_date, 'service', 'active');
insert into public.seatings (id, organization_id, location_id, service_session_id, server_profile_id, party_size, decided_by, idempotency_key)
overriding system value values
  (8641, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201', 8611, '00000000-0000-4000-8000-000000086001', 2, '00000000-0000-4000-8000-000000086002', gen_random_uuid()),
  (8642, '00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202', 8612, '00000000-0000-4000-8000-000000086003', 2, '00000000-0000-4000-8000-000000086002', gen_random_uuid());
insert into public.seating_tables (organization_id, seating_id, dining_table_id) values
  ('00000000-0000-4000-8000-000000086101', 8641, 8631),
  ('00000000-0000-4000-8000-000000086101', 8642, 8632);

create function pg_temp.act(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;
create function pg_temp.changed(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return sqlstate;
end $$;

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000086001');
select is(private.can_operate_board('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086201'), true, 'A staff has A board authority');
select is(private.can_operate_board('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202'), false, 'A staff has no B board authority');
select is((select count(*)::int from public.floor_templates where id=8601), 1, 'A staff reads A template');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'A staff cannot read B template');
select is((select count(*)::int from public.seatings where id=8641), 1, 'A staff reads A seating');
select is((select count(*)::int from public.seatings where id=8642), 0, 'A staff cannot read B seating');
select is((select count(*)::int from public.seating_tables where seating_id=8641), 1, 'A staff reads A seating link');
select is((select count(*)::int from public.seating_tables where seating_id=8642), 0, 'A staff cannot read B seating link');
select is((select count(*)::int from public.location_memberships where location_id='00000000-0000-4000-8000-000000086201'), 5, 'A staff reads A roster');
select is((select count(*)::int from public.location_memberships where location_id='00000000-0000-4000-8000-000000086202'), 0, 'A staff cannot read B roster');

select pg_temp.act('00000000-0000-4000-8000-000000086002');
select is(pg_temp.changed('update public.floor_templates set name=''B changed'' where id=8602'), '0', 'A manager cannot update B template');
select is(pg_temp.changed('update public.seatings set notes=''B changed'' where id=8642'), '0', 'A manager cannot update B seating');
select is(pg_temp.changed('update public.seating_tables set released_at=now() where seating_id=8642'), '0', 'A manager cannot update B seating link');
select is(pg_temp.changed('update public.floor_templates set name=''A changed'' where id=8601'), '1', 'A manager can update A template');
select is(pg_temp.changed('update public.seatings set notes=''A changed'' where id=8641'), '1', 'A manager can update A seating');
select is(pg_temp.changed('update public.seating_tables set released_at=now() where seating_id=8641'), '1', 'A manager can update A seating link');

select pg_temp.act('00000000-0000-4000-8000-000000086004');
select is(private.can_operate_board('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202'), false, 'unassigned GM has no B operational board authority');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'unassigned GM cannot read B board template');
select is((select count(*)::int from public.location_memberships where location_id='00000000-0000-4000-8000-000000086202'), 2, 'GM retains organization-wide assignment administration visibility');
select is(pg_temp.changed('update public.location_memberships set role=role where location_id=''00000000-0000-4000-8000-000000086202'' and profile_id=''00000000-0000-4000-8000-000000086003'''), '1', 'GM retains organization-wide assignment update');

select pg_temp.act('00000000-0000-4000-8000-000000086011');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'unassigned organization owner cannot read B operational board');
select is((select count(*)::int from public.location_memberships where location_id='00000000-0000-4000-8000-000000086202'), 2, 'owner retains organization-wide assignment read');

select pg_temp.act('00000000-0000-4000-8000-000000086005');
select is(private.can_operate_board('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086202'), true, 'Overall AM canonical B authority');
select is((select count(*)::int from public.floor_templates where id=8602), 1, 'Overall AM reads B template');
select is((select count(*)::int from public.seatings where id=8642), 1, 'Overall AM reads B seating');
select is((select count(*)::int from public.seating_tables where seating_id=8642), 1, 'Overall AM reads B seating link');
select is((select count(*)::int from public.floor_templates where id in (8603,8604)), 0, 'Overall AM cannot read inactive or archived template');
select is(private.can_operate_board('00000000-0000-4000-8000-000000086101', '00000000-0000-4000-8000-000000086203'), false, 'Overall AM cannot use mismatched organization and location');
select is(pg_temp.changed('update public.floor_templates set name=''Overall AM write'' where id=8602'), '0', 'Overall AM gains no direct template write');
select is(pg_temp.changed('update public.seatings set notes=''Overall AM write'' where id=8642'), '0', 'Overall AM gains no direct seating write');
select is(pg_temp.changed('update public.seating_tables set released_at=now() where seating_id=8642'), '0', 'Overall AM gains no direct seating-link write');

select pg_temp.act('00000000-0000-4000-8000-000000086006');
select is((select count(*)::int from public.floor_templates where id=8602), 1, 'Overall Manager reads B template');
select is((select count(*)::int from public.seatings where id=8642), 1, 'Overall Manager reads B seating');
select is((select count(*)::int from public.seating_tables where seating_id=8642), 1, 'Overall Manager reads B seating link');
select is(pg_temp.changed('update public.floor_templates set name=''Overall Manager write'' where id=8602'), '0', 'Overall Manager gains no direct template write');

select pg_temp.act('00000000-0000-4000-8000-000000086007');
select is((select count(*)::int from public.floor_templates where id=8602), 1, 'Overall Owner reads B template');
select is((select count(*)::int from public.seatings where id=8642), 1, 'Overall Owner reads B seating');
select is((select count(*)::int from public.seating_tables where seating_id=8642), 1, 'Overall Owner reads B seating link');
select is(pg_temp.changed('update public.floor_templates set name=''Overall Owner write'' where id=8602'), '0', 'Overall Owner gains no direct template write');

select pg_temp.act('00000000-0000-4000-8000-000000086009');
select is((select count(*)::int from public.location_memberships where profile_id='00000000-0000-4000-8000-000000086009'), 0, 'inactive org member cannot self-read stale assignment');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'inactive org member cannot read B template');
select pg_temp.act('00000000-0000-4000-8000-000000086010');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'unassigned org staff cannot read B template');
select pg_temp.act('00000000-0000-4000-8000-000000086008');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'foreign org staff cannot read B template');
select is((select count(*)::int from public.location_memberships where location_id='00000000-0000-4000-8000-000000086202'), 0, 'foreign org staff cannot read B roster');

reset role;
update public.location_memberships set active=false where location_id='00000000-0000-4000-8000-000000086202' and profile_id='00000000-0000-4000-8000-000000086003';
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000086003');
select is((select count(*)::int from public.floor_templates where id=8602), 0, 'revoked location assignment loses B template read');
select is((select count(*)::int from public.location_memberships where profile_id='00000000-0000-4000-8000-000000086003'), 1, 'active org member can self-read revoked assignment');

-- A source row cannot be moved to B or pointed at a table in B.
select pg_temp.act('00000000-0000-4000-8000-000000086002');
select is(pg_temp.changed('update public.floor_templates set location_id=''00000000-0000-4000-8000-000000086202'' where id=8601'), '42501', 'template WITH CHECK blocks cross-location move');
select is(pg_temp.changed('update public.seatings set location_id=''00000000-0000-4000-8000-000000086202'' where id=8641'), '42501', 'seating WITH CHECK blocks cross-location move');
select is(pg_temp.changed('update public.seating_tables set dining_table_id=8632 where seating_id=8641'), '42501', 'link WITH CHECK blocks cross-location dining table');
reset role;
select is((select name from public.floor_templates where id=8602), 'B Floor', 'denied B template writes left row unchanged');
select is((select notes from public.seatings where id=8642), null::text, 'denied B seating writes left row unchanged');
select ok((select released_at is null from public.seating_tables where seating_id=8642), 'denied B seating-link writes left row unchanged');
select is((select location_id from public.floor_templates where id=8601), '00000000-0000-4000-8000-000000086201'::uuid, 'A template remains in A');
select is((select location_id from public.seatings where id=8641), '00000000-0000-4000-8000-000000086201'::uuid, 'A seating remains in A');
select is((select dining_table_id from public.seating_tables where seating_id=8641), 8631::bigint, 'A seating link retains A table');
select ok(not has_table_privilege('authenticated', 'public.seatings', 'DELETE'), 'direct seating DELETE remains ungranted');

select * from finish();
rollback;
