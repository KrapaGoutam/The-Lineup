begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000061001','preservation61@test.internal');
insert into public.profiles(id,display_name) values ('00000000-0000-0000-0000-000000061001','Preservation61');
insert into public.organizations(id,name,slug,created_by) values
  ('00000000-0000-0000-0000-0000000610a1','Preservation61','preservation-61','00000000-0000-0000-0000-000000061001');
insert into public.memberships(organization_id,profile_id,roles) values
  ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-000000061001',array['owner']::public.app_role[]);
insert into public.locations(id,organization_id,name,time_zone) values
  ('00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-0000000610a1','Target61','America/Chicago'),
  ('00000000-0000-0000-0000-0000000610b2','00000000-0000-0000-0000-0000000610a1','Sibling61','America/Chicago');
insert into public.location_memberships(location_id,profile_id,role,active) values
  ('00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-000000061001','staff',false),
  ('00000000-0000-0000-0000-0000000610b2','00000000-0000-0000-0000-000000061001','staff',true);
insert into public.schedule_periods(id,organization_id,location_id,starts_on,ends_on,status)
overriding system value values
  (610001,'00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','2020-01-01','2020-01-07','published');
insert into public.shifts(id,organization_id,location_id,schedule_period_id,service_date,end_date,starts_at,ends_at,role_label)
overriding system value values
  (610001,'00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',610001,'2020-01-01','2020-01-01','2020-01-01 10:00Z','2020-01-01 18:00Z','Server');
insert into public.shift_assignments(organization_id,shift_id,profile_id) values
  ('00000000-0000-0000-0000-0000000610a1',610001,'00000000-0000-0000-0000-000000061001');
insert into public.service_sessions(id,organization_id,location_id,service_date,meal_period,status,closed_at)
overriding system value values
  (610001,'00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','2020-01-01','dinner','closed',now());
insert into public.tip_pools(organization_id,location_id,service_date,status,finalized_at,finalized_by) values
  ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','2020-01-01','finalized',now(),'00000000-0000-0000-0000-000000061001');
insert into public.payroll_periods(id,organization_id,neon_user_id,period_month,hours_snapshot,rate_cents_snapshot,gross_cents,status,generated_by)
overriding system value values
  (610001,'00000000-0000-0000-0000-0000000610a1',61001,'2020-01-01',8,1200,9600,'locked','00000000-0000-0000-0000-000000061001');
insert into public.payroll_payments(organization_id,payroll_period_id,amount_cents,payment_date,status,created_by,confirmed_by,confirmed_at) values
  ('00000000-0000-0000-0000-0000000610a1',610001,9600,'2020-01-07','confirmed','00000000-0000-0000-0000-000000061001','00000000-0000-0000-0000-000000061001',now());
insert into public.inventory_vendors(id,organization_id,name,created_by) values
  ('00000000-0000-0000-0000-0000000610c1','00000000-0000-0000-0000-0000000610a1','Vendor61','00000000-0000-0000-0000-000000061001');
insert into public.inventory_products(id,organization_id,vendor_id,name,unit_type,created_by) values
  ('00000000-0000-0000-0000-0000000610d1','00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610c1','Product61','bottle','00000000-0000-0000-0000-000000061001');
update public.inventory_stock set on_hand=7.5,backup=3 where product_id='00000000-0000-0000-0000-0000000610d1';
insert into public.inventory_adjustments(organization_id,location_id,product_id,source,reason,prev_on_hand,new_on_hand,prev_backup,new_backup,status_after,actor_profile_id,stock_version_after) values
  ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-0000000610d1','count','stock_count',0,7.5,0,3,'no_cutoff','00000000-0000-0000-0000-000000061001',1);
insert into public.audit_events(organization_id,location_id,actor_profile_id,action,entity_type) values
  ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-000000061001','synthetic-history','location');

create function pg_temp.history61() returns jsonb language plpgsql as $$
declare t text; rows jsonb; result jsonb := '{}';
begin
  foreach t in array array['schedule_periods','shifts','shift_assignments','service_sessions','tip_pools','payroll_periods','payroll_payments','inventory_stock','inventory_adjustments','memberships','audit_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'') from public.%I x where organization_id=$1',t)
      into rows using '00000000-0000-0000-0000-0000000610a1'::uuid;
    result := result || jsonb_build_object(t,rows);
  end loop;
  return result || jsonb_build_object('assignments', (select jsonb_agg(to_jsonb(m) order by m.location_id) from public.location_memberships m where location_id in ('00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-0000000610b2')),
    'sibling', (select to_jsonb(l) from public.locations l where id='00000000-0000-0000-0000-0000000610b2'));
end;
$$;
create temp table before61 as select pg_temp.history61() as snapshot;
select ok((select bool_and(jsonb_array_length(value)>0) from before61,jsonb_each(snapshot - 'sibling')), 'preservation snapshot contains populated histories, balances, payments and assignments');

-- Call as a real client role; then inspect exact stored rows as postgres.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000061001',true);
select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000610b1','deactivate','Synthetic preservation check','active');
reset role;
select is(pg_temp.history61(), (select snapshot from before61), 'deactivation preserves every populated history and financial row byte-for-byte');

create function pg_temp.guards61(state text) returns setof text language plpgsql as $$
declare statement text;
begin
  foreach statement in array array[
    $q$insert into public.service_sessions(organization_id,location_id,service_date,meal_period) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',current_date,'lunch')$q$,
    $q$insert into public.seatings(organization_id,location_id,service_session_id,server_profile_id,party_size,decided_by,idempotency_key) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',610001,'00000000-0000-0000-0000-000000061001',2,'00000000-0000-0000-0000-000000061001',gen_random_uuid())$q$,
    $q$insert into public.schedule_periods(organization_id,location_id,starts_on,ends_on) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',current_date,current_date+6)$q$,
    $q$insert into public.shifts(organization_id,location_id,schedule_period_id,service_date,end_date,starts_at,ends_at,role_label) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',610001,current_date,current_date+1,now(),now()+interval '8 hours','Server')$q$,
    $q$insert into public.tasks(organization_id,location_id,title,created_by) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','Synthetic61','00000000-0000-0000-0000-000000061001')$q$,
    $q$insert into public.tip_pools(organization_id,location_id,service_date) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1',current_date)$q$,
    $q$insert into public.inventory_adjustments(organization_id,location_id,product_id,source,reason,prev_on_hand,new_on_hand,prev_backup,new_backup,status_after,actor_profile_id,stock_version_after) values ('00000000-0000-0000-0000-0000000610a1','00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-0000000610d1','count','stock_count',7.5,8,3,3,'no_cutoff','00000000-0000-0000-0000-000000061001',2)$q$,
    $q$insert into public.location_memberships(location_id,profile_id,role,active) values ('00000000-0000-0000-0000-0000000610b1','00000000-0000-0000-0000-000000061001','staff',true)$q$,
    $q$update public.location_memberships set active=true where location_id='00000000-0000-0000-0000-0000000610b1' and profile_id='00000000-0000-0000-0000-000000061001'$q$
  ] loop
    return next throws_ok(statement,'55000',null,state || ' operational guard: ' || split_part(statement,' ',3));
  end loop;
end;
$$;
select * from pg_temp.guards61('INACTIVE');
set local role authenticated;
select public.transition_location_lifecycle('00000000-0000-0000-0000-0000000610b1','archive','Synthetic preservation archive','inactive');
reset role;
select * from pg_temp.guards61('ARCHIVED');
select is(pg_temp.history61(), (select snapshot from before61), 'archive preserves exact financial/history/assignment/sibling snapshot');
select is((select count(*)::int from public.location_lifecycle_events where organization_id='00000000-0000-0000-0000-0000000610a1'),2,'successful transitions each retain an audit event');
select * from finish();
rollback;
