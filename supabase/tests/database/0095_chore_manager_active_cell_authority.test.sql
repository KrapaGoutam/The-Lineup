begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- V2.0.13 follow-up: managers / assistant managers act on any applicable cell of the ACTIVE
-- run WITHOUT the board's manager-override switch (which now only gates closed-run corrections).
-- Cast (org 1: locations A and B; org 2: C): Mona manager at A (staff at B), Dee assistant manager
-- at A, Ann + Bea staff at A, Cal staff at B only, Bo manager at B only, Eve assistant manager at
-- B only, Otto owner of org 2.
create function pg_temp.act(p text) returns void language plpgsql as $f$
begin
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p, true);
  perform set_config('request.jwt.claims', json_build_object('session_id', p)::text, true);
end $f$;
-- Lookups run as the table owner (no RLS) so fixtures can name rows and columns.
create function pg_temp.rid(b uuid, t text) returns uuid language sql security definer as
  $f$ select id from public.chore_rows where board_id = b and title = t $f$;
create function pg_temp.cid(b uuid, l text) returns uuid language sql security definer as
  $f$ select id from public.chore_columns where board_id = b and label = l $f$;
create function pg_temp.bid(n text) returns uuid language sql security definer as
  $f$ select id from public.chore_boards where name = n $f$;
create function pg_temp.cyc(b uuid) returns uuid language sql security definer as
  $f$ select id from public.chore_cycles where board_id = b and status = 'open' $f$;
-- Tick as a person; returns the outcome text.
create function pg_temp.tick(p_who text, b uuid, r text, c text, p_done boolean default true) returns text language plpgsql as $f$
declare v text;
begin
  perform pg_temp.act(p_who);
  select public.chore_cell_set(b, pg_temp.rid(b, r), pg_temp.cid(b, c), p_done, null) into v;
  return v;
end $f$;
-- A board with columns Ann + Bea and rows "Bucket 1" / "Bucket 2" (all columns, required).
create function pg_temp.mk(p_name text, p_rec text, p_reset text, p_override boolean default false) returns uuid language plpgsql as $f$
declare v uuid;
begin
  perform pg_temp.act('00000000-0000-4000-8000-000000095001');
  v := public.chore_board_save('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095021',
    null,p_name,null,'own_column',p_override,'all_columns',p_rec,p_reset,null);
  perform public.chore_column_save(v,null,'Ann','00000000-0000-4000-8000-000000095002');
  perform public.chore_column_save(v,null,'Bea','00000000-0000-4000-8000-000000095003');
  perform public.chore_row_save(v,null,'Bucket 1',null,true,'all_columns','{}');
  perform public.chore_row_save(v,null,'Bucket 2',null,true,'all_columns','{}');
  return v;
end $f$;

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000095001','t95-mona@test.invalid'),
 ('00000000-0000-4000-8000-000000095002','t95-ann@test.invalid'),
 ('00000000-0000-4000-8000-000000095003','t95-bea@test.invalid'),
 ('00000000-0000-4000-8000-000000095004','t95-cal@test.invalid'),
 ('00000000-0000-4000-8000-000000095005','t95-otto@test.invalid'),
 ('00000000-0000-4000-8000-000000095006','t95-dee@test.invalid'),
 ('00000000-0000-4000-8000-000000095007','t95-bo@test.invalid'),
 ('00000000-0000-4000-8000-000000095008','t95-eve@test.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where email like 't95-%';
insert into public.profiles(id,display_name) select id,split_part(split_part(email,'-',2),'@',1) from auth.users where email like 't95-%';
insert into public.organizations(id,name,slug,created_by) values
 ('00000000-0000-4000-8000-000000095010','T95 org','t95-org','00000000-0000-4000-8000-000000095001'),
 ('00000000-0000-4000-8000-000000095011','T95 other','t95-other','00000000-0000-4000-8000-000000095005');
insert into public.locations(id,organization_id,name,time_zone) values
 ('00000000-0000-4000-8000-000000095021','00000000-0000-4000-8000-000000095010','A','America/Chicago'),
 ('00000000-0000-4000-8000-000000095022','00000000-0000-4000-8000-000000095010','B','America/Chicago'),
 ('00000000-0000-4000-8000-000000095023','00000000-0000-4000-8000-000000095011','C','America/Chicago');
insert into public.memberships(organization_id,profile_id,roles) values
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095001',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095002',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095003',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095004',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095006',array['shift_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095007',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095010','00000000-0000-4000-8000-000000095008',array['shift_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000095011','00000000-0000-4000-8000-000000095005',array['owner']::public.app_role[]);
insert into public.location_memberships(location_id,profile_id,role) values
 ('00000000-0000-4000-8000-000000095021','00000000-0000-4000-8000-000000095001','manager'),
 ('00000000-0000-4000-8000-000000095022','00000000-0000-4000-8000-000000095001','staff'),
 ('00000000-0000-4000-8000-000000095021','00000000-0000-4000-8000-000000095002','staff'),
 ('00000000-0000-4000-8000-000000095021','00000000-0000-4000-8000-000000095003','staff'),
 ('00000000-0000-4000-8000-000000095022','00000000-0000-4000-8000-000000095004','staff'),
 ('00000000-0000-4000-8000-000000095021','00000000-0000-4000-8000-000000095006','assistant_manager'),
 ('00000000-0000-4000-8000-000000095022','00000000-0000-4000-8000-000000095007','manager'),
 ('00000000-0000-4000-8000-000000095022','00000000-0000-4000-8000-000000095008','assistant_manager'),
 ('00000000-0000-4000-8000-000000095023','00000000-0000-4000-8000-000000095005','manager');

create function pg_temp.fails(p_sql text) returns boolean language plpgsql as $f$
begin execute p_sql; return false; exception when others then return true; end $f$;

-- Board with the manager override OFF (the default): the point of this migration.
select pg_temp.mk('Mango Lassi','continuous','manual_restart');
reset role;
select set_config('app.b',pg_temp.bid('Mango Lassi')::text,true);
select is((select manager_override from public.chore_boards where id=current_setting('app.b')::uuid),false,'the board has the manager override OFF');

-- 1. The assignee and other staff ------------------------------------------------------
select is(pg_temp.tick('00000000-0000-4000-8000-000000095002',current_setting('app.b')::uuid,'Bucket 1','Ann'),'checked','the assignee checks her own cell');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095002',current_setting('app.b')::uuid,'Bucket 1','Ann',false),'unchecked','the assignee unchecks her own cell');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095002',current_setting('app.b')::uuid,'Bucket 1','Ann'),'checked','and checks it again');
select pg_temp.act('00000000-0000-4000-8000-000000095003');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.b')::uuid,'Ann'),false,null)$$,'42501',null,'other staff cannot uncheck Ann''s cell');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 2'),pg_temp.cid(current_setting('app.b')::uuid,'Ann'),true,null)$$,'42501',null,'other staff cannot check Ann''s cell');

-- 2. A manager, override OFF: uncheck and check another person's applicable cell ----------------
select is(pg_temp.tick('00000000-0000-4000-8000-000000095001',current_setting('app.b')::uuid,'Bucket 1','Ann',false),'unchecked','the manager unchecks Ann''s cell with the override off');
reset role;
select is((select payload->>'entered_as' from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_unchecked' order by id desc limit 1),'manager_correction','the reversal is recorded as a management action');
select is((select actor_profile_id::text from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_unchecked' order by id desc limit 1),'00000000-0000-4000-8000-000000095001','the reversal records the REAL actor (the manager)');
select is((select payload->>'assigned_profile_id' from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_unchecked' order by id desc limit 1),'00000000-0000-4000-8000-000000095002','the reversal records the assigned employee (Ann) without impersonating her');
select is((select payload->>'previous_completed_by' from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_unchecked' order by id desc limit 1),'00000000-0000-4000-8000-000000095002','and who had completed it');
select is((select count(*)::int from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_checked' and actor_profile_id='00000000-0000-4000-8000-000000095002' and payload->>'entered_as'='self'),2,'Ann''s two ORIGINAL check events are untouched (history is append-only)');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095001',current_setting('app.b')::uuid,'Bucket 2','Ann'),'checked','the manager checks Ann''s other cell with the override off');
reset role;
select is((select completed_by::text||'|'||entered_as from public.chore_completions where cycle_id=pg_temp.cyc(current_setting('app.b')::uuid) and column_id=pg_temp.cid(current_setting('app.b')::uuid,'Ann') and row_id=pg_temp.rid(current_setting('app.b')::uuid,'Bucket 2')),'00000000-0000-4000-8000-000000095001|manager_correction','the completion is by the manager, flagged as a management entry');
select is((select profile_id::text from public.chore_columns where id=pg_temp.cid(current_setting('app.b')::uuid,'Ann')),'00000000-0000-4000-8000-000000095002','the column is still assigned to Ann');
select is((select payload->>'assigned_profile_id' from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_checked' and actor_profile_id='00000000-0000-4000-8000-000000095001' order by id desc limit 1),'00000000-0000-4000-8000-000000095002','the check event names Ann as the assignee and the manager as the actor');

-- 3. An assistant manager with effective authority at this location ---------------------------
select is(pg_temp.tick('00000000-0000-4000-8000-000000095006',current_setting('app.b')::uuid,'Bucket 1','Bea'),'checked','the assistant manager of THIS location checks Bea''s cell with the override off');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095006',current_setting('app.b')::uuid,'Bucket 1','Bea',false),'unchecked','and unchecks it');
reset role;
select is((select payload->>'entered_as' from public.chore_events where board_id=current_setting('app.b')::uuid and event_type='cell_unchecked' and actor_profile_id='00000000-0000-4000-8000-000000095006' order by id desc limit 1),'manager_correction','recorded under the assistant manager''s own identity');

-- 4. No capability here: another branch / another organization --------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000095008');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.b')::uuid,'Bea'),true,null)$$,'42501',null,'an assistant manager of ANOTHER location has no authority here');
select pg_temp.act('00000000-0000-4000-8000-000000095007');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.b')::uuid,'Ann'),false,null)$$,'42501',null,'a manager of another location is denied');
select pg_temp.act('00000000-0000-4000-8000-000000095005');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.b')::uuid,'Ann'),false,null)$$,'42501',null,'an owner of another organization is denied');
select pg_temp.act('00000000-0000-4000-8000-000000095004');
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.b')::uuid,'Bea'),true,null)$$,'42501',null,'staff of another location are denied');
reset role;
select is((select count(*)::int from public.chore_completions where cycle_id=pg_temp.cyc(current_setting('app.b')::uuid)),1,'the denied attempts wrote nothing (only the manager''s Bucket 2 check for Ann remains)');

-- 5. Management authority never reaches a non-applicable cell -----------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000095001');
select public.chore_row_save(current_setting('app.b')::uuid,null,'Bea only',null,true,'selected_columns',array[pg_temp.cid(current_setting('app.b')::uuid,'Bea')]);
select throws_ok($$select public.chore_cell_set(current_setting('app.b')::uuid,pg_temp.rid(current_setting('app.b')::uuid,'Bea only'),pg_temp.cid(current_setting('app.b')::uuid,'Ann'),true,null)$$,'22023',null,'a manager cannot check a cell that does not apply to the column');

-- 6. Closed runs: still immutable, corrections still gated by the board switch ----------------
select pg_temp.mk('Gulab Jamun','continuous','automatic_after_completion');
reset role;
select set_config('app.g',pg_temp.bid('Gulab Jamun')::text,true);
select set_config('app.gc',pg_temp.cyc(pg_temp.bid('Gulab Jamun'))::text,true);
select is(pg_temp.tick('00000000-0000-4000-8000-000000095002',current_setting('app.g')::uuid,'Bucket 1','Ann'),'checked','Ann checks one cell');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095001',current_setting('app.g')::uuid,'Bucket 2','Ann'),'checked','the manager checks Ann''s second cell (override off)');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095003',current_setting('app.g')::uuid,'Bucket 1','Bea'),'checked','Bea checks hers');
select is(pg_temp.tick('00000000-0000-4000-8000-000000095006',current_setting('app.g')::uuid,'Bucket 2','Bea'),'checked_closed','the assistant manager''s check finishes the run: the SYSTEM closes it');
reset role;
select is((select status from public.chore_cycles where id=current_setting('app.gc')::uuid),'completed','the run is completed');
select is((select count(*)::int from public.chore_cycle_snapshots where cycle_id=current_setting('app.gc')::uuid),1,'exactly one snapshot');
select is((select count(*)::int from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.gc')::uuid and completed_by='00000000-0000-4000-8000-000000095001'),1,'the snapshot keeps the manager as the actor of the cell the manager checked');
select ok(pg_temp.fails('update public.chore_cycle_snapshot_cells set completed_by=null where cycle_id='||quote_literal(current_setting('app.gc'))||'::uuid'),'snapshots remain immutable (even for the table owner)');
select pg_temp.act('00000000-0000-4000-8000-000000095001');
select throws_ok($$select public.chore_cell_set(current_setting('app.g')::uuid,pg_temp.rid(current_setting('app.g')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.g')::uuid,'Ann'),false,current_setting('app.gc')::uuid)$$,null,null,'a stale tab cannot touch the closed run through the active-run path');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.gc')::uuid,pg_temp.rid(current_setting('app.g')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.g')::uuid,'Ann'),false,'closed run, override off')$$,'42501',null,'a CLOSED run still needs the board''s override for a correction');
reset role;
select is((select count(*)::int from public.chore_cycle_corrections where cycle_id=current_setting('app.gc')::uuid),0,'and no correction was written');

-- 7. Signature, privileges, F-1 ---------------------------------------------------------------
select ok(pg_get_function_arguments('public.chore_cell_set(uuid,uuid,uuid,boolean,uuid)'::regprocedure) !~* 'actor|profile|user','chore_cell_set still takes no actor argument');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'chore\_%' and has_function_privilege('authenticated',p.oid,'execute')),15,'the same fifteen chore RPCs are callable (no new client lever)');
select ok(not has_function_privilege('anon','public.chore_cell_set(uuid,uuid,uuid,boolean,uuid)','execute'),'anon still cannot call it');
select pg_temp.mk('Daily Prep','daily','automatic_after_completion');
reset role;
select set_config('app.d',pg_temp.bid('Daily Prep')::text,true);
update public.chore_cycles set business_date=(now() at time zone 'America/Chicago')::date-1 where board_id=current_setting('app.d')::uuid and status='open';
select pg_temp.act('00000000-0000-4000-8000-000000095001');
select throws_ok($$select public.chore_cell_set(current_setting('app.d')::uuid,pg_temp.rid(current_setting('app.d')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.d')::uuid,'Ann'),true,null)$$,'P0001',null,'F-1 still refuses a management tick on a stale daily run');
select * from finish();
rollback;
