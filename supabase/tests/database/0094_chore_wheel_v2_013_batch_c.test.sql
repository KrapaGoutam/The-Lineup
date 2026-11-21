begin;
create extension if not exists pgtap with schema extensions;
select plan(144);

-- V2.0.13 Batch C: independent run closure, recurrence sweep, immutable snapshots,
-- append-only corrections. Cast (org 1: locations A and B; org 2: C):
--   Mona manager at A (staff at B)   Dee assistant manager at A    Ann, Bea staff at A
--   Cal staff at B only              Bo manager at B only          Otto owner of org 2
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
  perform pg_temp.act('00000000-0000-4000-8000-000000094001');
  v := public.chore_board_save('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021',
    null,p_name,null,'own_column',p_override,'all_columns',p_rec,p_reset,null);
  perform public.chore_column_save(v,null,'Ann','00000000-0000-4000-8000-000000094002');
  perform public.chore_column_save(v,null,'Bea','00000000-0000-4000-8000-000000094003');
  perform public.chore_row_save(v,null,'Bucket 1',null,true,'all_columns','{}');
  perform public.chore_row_save(v,null,'Bucket 2',null,true,'all_columns','{}');
  return v;
end $f$;

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000094001','t94-mona@test.invalid'),
 ('00000000-0000-4000-8000-000000094002','t94-ann@test.invalid'),
 ('00000000-0000-4000-8000-000000094003','t94-bea@test.invalid'),
 ('00000000-0000-4000-8000-000000094004','t94-cal@test.invalid'),
 ('00000000-0000-4000-8000-000000094005','t94-otto@test.invalid'),
 ('00000000-0000-4000-8000-000000094006','t94-dee@test.invalid'),
 ('00000000-0000-4000-8000-000000094007','t94-bo@test.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where email like 't94-%';
insert into public.profiles(id,display_name) select id,split_part(split_part(email,'-',2),'@',1) from auth.users where email like 't94-%';
insert into public.organizations(id,name,slug,created_by) values
 ('00000000-0000-4000-8000-000000094010','T94 org','t94-org','00000000-0000-4000-8000-000000094001'),
 ('00000000-0000-4000-8000-000000094011','T94 other','t94-other','00000000-0000-4000-8000-000000094005');
insert into public.locations(id,organization_id,name,time_zone) values
 ('00000000-0000-4000-8000-000000094021','00000000-0000-4000-8000-000000094010','A','America/Chicago'),
 ('00000000-0000-4000-8000-000000094022','00000000-0000-4000-8000-000000094010','B','America/Chicago'),
 ('00000000-0000-4000-8000-000000094023','00000000-0000-4000-8000-000000094011','C','America/Chicago');
insert into public.memberships(organization_id,profile_id,roles) values
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094001',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094002',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094003',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094004',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094006',array['shift_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094007',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000094011','00000000-0000-4000-8000-000000094005',array['owner']::public.app_role[]);
insert into public.location_memberships(location_id,profile_id,role) values
 ('00000000-0000-4000-8000-000000094021','00000000-0000-4000-8000-000000094001','manager'),
 ('00000000-0000-4000-8000-000000094022','00000000-0000-4000-8000-000000094001','staff'),
 ('00000000-0000-4000-8000-000000094021','00000000-0000-4000-8000-000000094002','staff'),
 ('00000000-0000-4000-8000-000000094021','00000000-0000-4000-8000-000000094003','staff'),
 ('00000000-0000-4000-8000-000000094022','00000000-0000-4000-8000-000000094004','staff'),
 ('00000000-0000-4000-8000-000000094021','00000000-0000-4000-8000-000000094006','assistant_manager'),
 ('00000000-0000-4000-8000-000000094022','00000000-0000-4000-8000-000000094007','manager'),
 ('00000000-0000-4000-8000-000000094023','00000000-0000-4000-8000-000000094005','manager');

-- 1. Schema, grants, guards ---------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.chore_cycle_snapshots'::regclass,'public.chore_cycle_snapshot_rows'::regclass,
  'public.chore_cycle_snapshot_columns'::regclass,'public.chore_cycle_snapshot_cells'::regclass,
  'public.chore_cycle_corrections'::regclass)),'RLS enabled on all five new tables');
select is((select count(*)::int from information_schema.role_table_grants
  where grantee in ('authenticated','anon','PUBLIC') and table_schema='public'
    and table_name in ('chore_cycle_snapshots','chore_cycle_snapshot_rows','chore_cycle_snapshot_columns','chore_cycle_snapshot_cells','chore_cycle_corrections')
    and privilege_type <> 'SELECT'),0,'clients hold no write privilege on any snapshot or correction table');
select is((select count(*)::int from information_schema.role_table_grants
  where grantee='anon' and table_schema='public' and table_name like 'chore\_cycle\_%'),0,'anon holds no privilege on the snapshot tables');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'chore\_%'
  and has_function_privilege('authenticated',p.oid,'execute')),15,'exactly fifteen chore RPCs are callable by signed-in users (11 + close, start, correct, sweep)');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'chore\_%'
  and has_function_privilege('anon',p.oid,'execute')),0,'anon can execute no chore RPC');
select ok(not has_function_privilege('authenticated','private.chore_finish_cycle(public.chore_boards,uuid,text,text,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','private.chore_start_run(public.chore_boards,text,uuid,text)','execute')
  and not has_function_privilege('authenticated','private.chore_emit_system(public.chore_boards,uuid,text,jsonb)','execute'),
  'the closing, run-opening and system-audit helpers are private (no client lever to close a board)');
select ok(pg_get_function_arguments('public.chore_cycles_sweep(uuid,uuid)'::regprocedure) !~* 'board|cycle|status|outcome|time|date|actor',
  'the sweep names no board, run, outcome, time or actor');
select ok(pg_get_function_arguments('public.chore_cell_set(uuid,uuid,uuid,boolean,uuid)'::regprocedure) !~* 'actor|profile|user',
  'chore_cell_set still takes no actor argument');
select is((select count(*)::int from pg_trigger where tgrelid='public.chore_cycle_snapshots'::regclass and tgname='chore_cycle_snapshots_immutable'),1,'snapshot header is immutable (trigger present)');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021',null,'Shiftly',null,'own_column',false,'all_columns','per_shift','manual_restart',null)$$,'22023',null,'per-shift recurrence cannot be enabled (no shift identity exists for boards)');

-- 2. Independent closure: Mango Lassi closes, Gulab Jamun is untouched --------------------
select pg_temp.mk('Mango Lassi','continuous','automatic_after_completion');
select pg_temp.mk('Gulab Jamun','continuous','automatic_after_completion');
reset role;
select set_config('app.mango',pg_temp.bid('Mango Lassi')::text,true);
select set_config('app.gulab',pg_temp.bid('Gulab Jamun')::text,true);
select set_config('app.mc1',pg_temp.cyc(pg_temp.bid('Mango Lassi'))::text,true);
select is(pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.mango')::uuid,'Bucket 1','Ann'),'checked','Ann ticks Mango Bucket 1');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.mango')::uuid,'Bucket 2','Ann'),'checked','Ann ticks Mango Bucket 2');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.mango')::uuid,'Bucket 1','Bea'),'checked','Bea ticks Mango Bucket 1 (3 of 4: the run stays open)');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.gulab')::uuid,'Bucket 1','Ann'),'checked','Ann ticks one Gulab Jamun cell');
reset role;
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.mango')::uuid and status='open'),1,'Mango Lassi run 1 is still open at 3 of 4');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.mango')::uuid,'Bucket 2','Bea'),'checked_closed','the LAST required tick closes the run (outcome says so)');
reset role;
select is((select status||'/'||sequence from public.chore_cycles where id=current_setting('app.mc1')::uuid),'completed/1','Mango Lassi run 1 is completed');
select is((select sequence from public.chore_cycles where board_id=current_setting('app.mango')::uuid and status='open'),2,'Mango Lassi run 2 opened as the successor (continuous)');
select is((select count(*)::int from public.chore_completions where cycle_id=pg_temp.cyc(current_setting('app.mango')::uuid)),0,'run 2 starts with no checked cells');
select is((select count(*)::int from public.chore_completions where cycle_id=current_setting('app.mc1')::uuid),4,'run 1 keeps its four completions');
select is((select count(*)::int||'/'||max(sequence)||'/'||max(status) from public.chore_cycles where board_id=current_setting('app.gulab')::uuid),'1/1/open','Gulab Jamun still has exactly its one open run 1');
select is((select count(*)::int from public.chore_completions where board_id=current_setting('app.gulab')::uuid),1,'Gulab Jamun keeps its one checked cell');
select is((select count(*)::int from public.chore_cycle_snapshots where board_id=current_setting('app.gulab')::uuid),0,'no snapshot was written for Gulab Jamun');
select is((select count(*)::int from public.chore_cycle_snapshots where cycle_id=current_setting('app.mc1')::uuid),1,'exactly one snapshot for the closed Mango run');
select is((select closed_by_kind||'/'||coalesce(closed_by::text,'null')||'/'||outcome||'/'||required_done||'of'||required_total||'/'||close_trigger from public.chore_cycle_snapshots where cycle_id=current_setting('app.mc1')::uuid),'system/null/completed/4of4/automatic','automatic closure is attributed to the SYSTEM, not to the last person who ticked');
select is((select count(*)::int from public.chore_events where cycle_id=current_setting('app.mc1')::uuid and event_type='cycle_closed' and actor_kind='system' and actor_profile_id is null and (payload->>'triggered_by')='00000000-0000-4000-8000-000000094003'),1,'the audit row is a system event with the trigger recorded only as a labelled field');
select is((select count(*)::int from public.chore_events where cycle_id=current_setting('app.mc1')::uuid and event_type='cell_checked' and actor_profile_id='00000000-0000-4000-8000-000000094003'),2,'the employees keep their own cell_checked attribution');
select is((select count(*)::int from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.mc1')::uuid),4,'the snapshot copied all four checked cells');
-- A stale tab: a tick naming the finished run is a conflict, never a write into the new run.
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cell_set(current_setting('app.mango')::uuid,pg_temp.rid(current_setting('app.mango')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.mango')::uuid,'Ann'),true,current_setting('app.mc1')::uuid)$$,'P0001',null,'a tick that names the finished run is refused (stale tab)');
reset role;
select is((select count(*)::int from public.chore_completions where cycle_id=pg_temp.cyc(current_setting('app.mango')::uuid)),0,'and run 2 stayed clean');
select throws_ok($$delete from public.chore_completions where cycle_id=current_setting('app.mc1')::uuid$$,'23514',null,'completions of a finished run cannot be deleted');
select throws_ok($$insert into public.chore_completions(board_id,organization_id,cycle_id,row_id,column_id,completed_by,completed_by_name,entered_as)
  values (current_setting('app.mango')::uuid,'00000000-0000-4000-8000-000000094010',current_setting('app.mc1')::uuid,pg_temp.rid(current_setting('app.mango')::uuid,'Bucket 1'),pg_temp.cid(current_setting('app.mango')::uuid,'Ann'),'00000000-0000-4000-8000-000000094002','x','self')$$,'23514',null,'a completion cannot be added to a finished run');
select throws_ok($$update public.chore_cycles set close_note='x' where id=current_setting('app.mc1')::uuid$$,'23514',null,'a finished run cannot be edited');
select throws_ok($$delete from public.chore_cycles where id=current_setting('app.mc1')::uuid$$,'23514',null,'a finished run cannot be deleted');
select throws_ok($$update public.chore_cycle_snapshots set board_name='x' where cycle_id=current_setting('app.mc1')::uuid$$,'23514',null,'a snapshot cannot be edited');
select throws_ok($$delete from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.mc1')::uuid$$,'23514',null,'snapshot cells cannot be deleted');
select throws_ok($$insert into public.chore_cycles(board_id,organization_id,sequence,opened_by_kind,period_key)
  values (current_setting('app.mango')::uuid,'00000000-0000-4000-8000-000000094010',2,'system',null)$$,'23505',null,'run numbers and the one-open-run rule are database facts (duplicate run 2 / second open run)');

-- 3. Idempotent manual close and forged ids -----------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select is((public.chore_cycle_close(current_setting('app.mango')::uuid,current_setting('app.mc1')::uuid,'completed',null,true))->>'result','already_closed','closing the already finished run is idempotent');
reset role;
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.mango')::uuid),2,'a retried close created no extra run');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select throws_ok($$select public.chore_cycle_close(current_setting('app.mango')::uuid,gen_random_uuid(),'completed',null,false)$$,'42501',null,'a forged run id is refused');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,current_setting('app.mc1')::uuid,'cancelled','because',false)$$,'42501',null,'a run id of another board cannot be closed through this board (no cross-board closure)');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'completed',null,false)$$,'22023',null,'an unfinished run cannot be closed as completed');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'cancelled','  ',false)$$,'22023',null,'cancelling needs a reason');
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'cancelled','staff try',false)$$,'42501',null,'staff cannot close a run');
select pg_temp.act('00000000-0000-4000-8000-000000094007');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'cancelled','wrong location',false)$$,'42501',null,'a manager of location B only cannot close a run at A');
select pg_temp.act('00000000-0000-4000-8000-000000094005');
select throws_ok($$select public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'cancelled','other org',false)$$,'42501',null,'an owner of another organization cannot close a run at A');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,gen_random_uuid(),gen_random_uuid(),false,'forged')$$,'42501',null,'another organization cannot correct a run (and learns nothing about it)');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select is((public.chore_cycle_close(current_setting('app.gulab')::uuid,pg_temp.cyc(current_setting('app.gulab')::uuid),'cancelled','Closing early for the night',false))->>'status','cancelled','a manager cancels an unfinished run with a reason');
reset role;
select is((select status||'/'||close_trigger||'/'||closed_by_kind from public.chore_cycles where board_id=current_setting('app.gulab')::uuid and sequence=1),'cancelled/cancelled/user','it is recorded as cancelled by a user, never as completed');
select is((select outcome||'/'||required_done||'of'||required_total||'/'||closed_by_name||'/'||note from public.chore_cycle_snapshots where board_id=current_setting('app.gulab')::uuid),'not_completed/1of4/mona/Closing early for the night','the snapshot keeps it as Not Completed with the ratio, actor and reason');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.gulab')::uuid and status='open'),0,'cancelling without "start next" leaves the board between runs');
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cycle_start(current_setting('app.gulab')::uuid)$$,'42501',null,'staff cannot start a run');
select throws_ok($$select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.gulab')::uuid,'Bucket 1','Ann')$$,'22023',null,'nothing can be ticked between runs');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select is((public.chore_cycle_start(current_setting('app.gulab')::uuid))->>'result','started','a manager starts the next run');
select is((public.chore_cycle_start(current_setting('app.gulab')::uuid))->>'result','already_open','starting again is idempotent');
reset role;
select is((select max(sequence)::int from public.chore_cycles where board_id=current_setting('app.gulab')::uuid),2,'Gulab Jamun run numbers continue independently (2) while Mango Lassi is at 2 on its own');

-- 4. Manual reset: complete work is not close; only a manager closes ---------------------
select pg_temp.mk('Manual board','continuous','manual_restart');
reset role;
select set_config('app.man',pg_temp.bid('Manual board')::text,true);
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.man')::uuid,'Bucket 1','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.man')::uuid,'Bucket 2','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.man')::uuid,'Bucket 1','Bea');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.man')::uuid,'Bucket 2','Bea'),'checked','the final tick on a manual-reset board only checks (no closure)');
reset role;
select is((select status from public.chore_cycles where board_id=current_setting('app.man')::uuid and sequence=1),'open','the run stays open, ready to close');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'the sweep never closes a manual-reset board');
select pg_temp.act('00000000-0000-4000-8000-000000094006');
select is((public.chore_cycle_close(current_setting('app.man')::uuid,pg_temp.cyc(current_setting('app.man')::uuid),'completed','All done',true))->>'result','closed','an assistant manager closes it as completed and starts the next run');
reset role;
select is((select closed_by_kind||'/'||closed_by_name||'/'||close_trigger from public.chore_cycle_snapshots where board_id=current_setting('app.man')::uuid),'user/dee/manual','manual closure is attributed to the manager');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.man')::uuid and status='open' and sequence=2 and opened_by_kind='user'),1,'run 2 opened by the manager');

-- 5. Rules: selected, any-one, optional, not-applicable, zero-required ----------------------
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select public.chore_board_save('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021',null,'Rules','x','own_column',false,'all_columns','continuous','automatic_after_completion',null);
reset role;
select set_config('app.rules',pg_temp.bid('Rules')::text,true);
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select public.chore_column_save(current_setting('app.rules')::uuid,null,'Ann','00000000-0000-4000-8000-000000094002');
select public.chore_column_save(current_setting('app.rules')::uuid,null,'Bea','00000000-0000-4000-8000-000000094003');
select public.chore_row_save(current_setting('app.rules')::uuid,null,'Only Ann',null,true,'selected_columns',array[pg_temp.cid(current_setting('app.rules')::uuid,'Ann')]);
select public.chore_row_save(current_setting('app.rules')::uuid,null,'Any one',null,true,'any_one','{}');
select public.chore_row_save(current_setting('app.rules')::uuid,null,'Nice to have',null,false,'all_columns','{}');
reset role;
select is((select required_total||'/'||required_done||'/'||optional_total||'/'||optional_done from private.chore_cycle_progress(current_setting('app.rules')::uuid,pg_temp.cyc(current_setting('app.rules')::uuid))),'2/0/2/0','SQL counts: selected = Ann only, any-one = ONE check, optional counted separately');
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.rules')::uuid,'Nice to have','Ann');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.rules')::uuid,'Any one','Bea'),'checked','Bea completes the any-one chore alone');
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cell_set(current_setting('app.rules')::uuid,pg_temp.rid(current_setting('app.rules')::uuid,'Any one'),pg_temp.cid(current_setting('app.rules')::uuid,'Ann'),true,null)$$,'22023',null,'a second person cannot also complete an any-one chore');
select throws_ok($$select public.chore_cell_set(current_setting('app.rules')::uuid,pg_temp.rid(current_setting('app.rules')::uuid,'Only Ann'),pg_temp.cid(current_setting('app.rules')::uuid,'Bea'),true,null)$$,'22023',null,'a selected-people chore does not apply to a column that was not selected');
reset role;
select is((select status from public.chore_cycles where board_id=current_setting('app.rules')::uuid and sequence=1),'open','optional work and the any-one chore alone do not complete the run');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.rules')::uuid,'Only Ann','Ann'),'checked_closed','the last REQUIRED cell closes it; Bea owes nothing on "Only Ann"');
reset role;
select is((select required_done||'of'||required_total||'/'||optional_done||'of'||optional_total from public.chore_cycle_snapshots where board_id=current_setting('app.rules')::uuid and sequence=1),'2of2/1of2','the snapshot keeps the optional chore''s real state, outside the required count');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.rules')::uuid and sequence=2 and status='open'),1,'a successor was opened');

-- Zero required cells: never complete, never closes, never loops.
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select public.chore_board_save('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021',null,'Optional only','x','own_column',false,'all_columns','continuous','automatic_after_completion',null);
reset role;
select set_config('app.opt',pg_temp.bid('Optional only')::text,true);
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select public.chore_column_save(current_setting('app.opt')::uuid,null,'Ann','00000000-0000-4000-8000-000000094002');
select public.chore_row_save(current_setting('app.opt')::uuid,null,'Optional A',null,false,'all_columns','{}');
reset role;
select is(pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.opt')::uuid,'Optional A','Ann'),'checked','ticking the only (optional) chore does not close the run');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'the sweep leaves a no-required-work board alone');
reset role;
select ok(not private.chore_cycle_is_complete(current_setting('app.opt')::uuid,pg_temp.cyc(current_setting('app.opt')::uuid)),'a board with no required work is not complete');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select throws_ok($$select public.chore_cycle_close(current_setting('app.opt')::uuid,pg_temp.cyc(current_setting('app.opt')::uuid),'completed',null,false)$$,'22023',null,'it also cannot be closed as completed by hand');
reset role;
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.opt')::uuid),1,'still one run (no regeneration loop)');

-- 6. Recurrence: daily / weekly, the sweep, time zones -------------------------------------
select pg_temp.mk('Rasmalai','daily','automatic_after_completion');
reset role;
select set_config('app.ras',pg_temp.bid('Rasmalai')::text,true);
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'a fresh daily board already has its run for today: nothing to do');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'a duplicate sweep is harmless');
-- Complete today's daily run: it closes but does NOT restart on the same day.
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.ras')::uuid,'Bucket 1','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.ras')::uuid,'Bucket 2','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.ras')::uuid,'Bucket 1','Bea');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.ras')::uuid,'Bucket 2','Bea'),'checked_closed','a daily run closes on completion');
reset role;
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.ras')::uuid and status='open'),0,'a completed daily run does not restart on the same business day');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'and the sweep does not restart it either');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.ras')::uuid),1,'one run for the day');
select is((select business_date from public.chore_cycle_snapshots where board_id=current_setting('app.ras')::uuid),private.chore_local_date('00000000-0000-4000-8000-000000094021'),'the snapshot business date is the location-local scheduled day');

-- A stale run on a daily board: the sweep expires it (Not Completed) and opens ONE run for today.
select pg_temp.mk('Daily stale','daily','automatic_after_completion');
reset role;
select set_config('app.ds',pg_temp.bid('Daily stale')::text,true);
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.ds')::uuid,'Bucket 1','Ann');
reset role;
update public.chore_cycles set business_date = business_date - 1, period_key = 'd:'||(business_date - 1)::text where board_id=current_setting('app.ds')::uuid and status='open';
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),2,'the sweep expires the stale incomplete run and opens ONE run for today');
select is((select status||'/'||close_trigger||'/'||closed_by_kind from public.chore_cycles where board_id=current_setting('app.ds')::uuid and sequence=1),'expired/expired/system','the stale run is Expired by the system, not Completed');
select is((select outcome||'/'||required_done||'of'||required_total||'/'||business_date::text from public.chore_cycle_snapshots where board_id=current_setting('app.ds')::uuid and sequence=1),'not_completed/1of4/'||(private.chore_local_date('00000000-0000-4000-8000-000000094021')-1)::text,'kept as Not Completed with its real ratio, grouped under its own business day');
select is((select opened_by_kind||'/'||period_key from public.chore_cycles where board_id=current_setting('app.ds')::uuid and sequence=2),'system/d:'||private.chore_local_date('00000000-0000-4000-8000-000000094021')::text,'today''s run is system-opened with the period key');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),0,'repeating the sweep changes nothing');
select throws_ok($$insert into public.chore_cycles(board_id,organization_id,sequence,opened_by_kind,period_key)
  values (current_setting('app.ds')::uuid,'00000000-0000-4000-8000-000000094010',9,'system','d:'||private.chore_local_date('00000000-0000-4000-8000-000000094021')::text)$$,'23505',null,'a second scheduler run for the same period is impossible (unique index)');
-- Missed days never back-fill.
update public.chore_cycles set business_date = business_date - 5, period_key = 'd:'||(business_date - 5)::text where board_id=current_setting('app.ds')::uuid and status='open';
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),2,'after a 5-day gap the sweep expires the old run and opens ONE new run');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.ds')::uuid),3,'no runs were invented for the missed days (3 runs in total)');
-- A completed run from yesterday does not block today's run.
select pg_temp.mk('Daily done','daily','automatic_after_completion');
reset role;
select set_config('app.dd',pg_temp.bid('Daily done')::text,true);
update public.chore_cycles set business_date = business_date - 1 where board_id=current_setting('app.dd')::uuid and status='open';
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.dd')::uuid,'Bucket 1','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.dd')::uuid,'Bucket 2','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.dd')::uuid,'Bucket 1','Bea');
select is(pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.dd')::uuid,'Bucket 2','Bea'),'checked_closed','yesterday''s daily run completes (late) and closes');
reset role;
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.dd')::uuid and status='open'),0,'it does not restart itself');
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),1,'the sweep starts the new day''s run (one)');
-- Weekly: ISO week (Monday) in the location's calendar.
select is(private.chore_period_start('weekly',date '2026-11-22'),date '2026-11-16','a Sunday belongs to the week that started the Monday before');
select is(private.chore_period_start('weekly',date '2026-11-16'),date '2026-11-16','a Monday starts its own week');
select is(private.chore_period_start('continuous',date '2026-11-16'),null,'continuous has no scheduled period');
select pg_temp.mk('Weekly deep clean','weekly','automatic_after_completion');
reset role;
select set_config('app.wk',pg_temp.bid('Weekly deep clean')::text,true);
update public.chore_cycles set business_date = business_date - 14 where board_id=current_setting('app.wk')::uuid and status='open';
select is(public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021'),2,'a weekly board two weeks behind expires and starts the current week');
select is((select period_key from public.chore_cycles where board_id=current_setting('app.wk')::uuid and sequence=2),'w:'||private.chore_period_start('weekly',private.chore_local_date('00000000-0000-4000-8000-000000094021'))::text,'the weekly key is the Monday of the current week');
-- Time zone: the location decides the calendar day, not UTC.
update public.locations set time_zone='Pacific/Kiritimati' where id='00000000-0000-4000-8000-000000094022';
update public.locations set time_zone='Pacific/Pago_Pago' where id='00000000-0000-4000-8000-000000094023';
select is(private.chore_local_date('00000000-0000-4000-8000-000000094022'),(now() at time zone 'Pacific/Kiritimati')::date,'the local date follows the location time zone (UTC+14)');
select ok(private.chore_local_date('00000000-0000-4000-8000-000000094022')-private.chore_local_date('00000000-0000-4000-8000-000000094023') between 1 and 2,'two locations 25 hours apart are on different calendar days');
update public.locations set time_zone='America/Chicago' where id in ('00000000-0000-4000-8000-000000094022','00000000-0000-4000-8000-000000094023');

-- 7. Sweep authority -------------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000094004');
select throws_ok($$select public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021')$$,'42501',null,'staff of location B cannot sweep location A');
select pg_temp.act('00000000-0000-4000-8000-000000094005');
select throws_ok($$select public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021')$$,'42501',null,'another organization cannot sweep it');
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094022')$$,'42501',null,'a member cannot sweep a location they do not work at');
select lives_ok($$select public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021')$$,'a staff member at the location may run the (deterministic) sweep');
reset role;
set local role anon;
select throws_ok($$select public.chore_cycles_sweep('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021')$$,'42501',null,'anon cannot sweep');
reset role;

-- 8. Snapshot integrity: template edits never rewrite a finished run -------------------------
select is((select count(*)::int from public.chore_cycle_snapshot_rows where cycle_id=current_setting('app.mc1')::uuid),2,'the Mango snapshot froze both chores');
select set_config('app.mAnn',pg_temp.cid(current_setting('app.mango')::uuid,'Ann')::text,true);
select set_config('app.mBea',pg_temp.cid(current_setting('app.mango')::uuid,'Bea')::text,true);
select set_config('app.mR1',pg_temp.rid(current_setting('app.mango')::uuid,'Bucket 1')::text,true);
-- Run 2 starts: Ann and Bea each tick Bucket 1 (the first tick records the structure version).
select pg_temp.tick('00000000-0000-4000-8000-000000094002',current_setting('app.mango')::uuid,'Bucket 1','Ann');
select pg_temp.tick('00000000-0000-4000-8000-000000094003',current_setting('app.mango')::uuid,'Bucket 1','Bea');
-- MID-RUN the template changes: rename a chore, remove Bea (she already has a completion), reassign Ann's column to Dee.
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select public.chore_row_save(current_setting('app.mango')::uuid,pg_temp.rid(current_setting('app.mango')::uuid,'Bucket 2'),'Bucket TWO (renamed)',null,true,'all_columns','{}');
select public.chore_column_set_state(current_setting('app.mBea')::uuid,'archived');
select public.chore_column_save(current_setting('app.mango')::uuid,current_setting('app.mAnn')::uuid,'Ann (renamed)','00000000-0000-4000-8000-000000094006');
reset role;
select is((select string_agg(title,'|' order by sort_order) from public.chore_cycle_snapshot_rows where cycle_id=current_setting('app.mc1')::uuid),'Bucket 1|Bucket 2','run 1 still shows the ORIGINAL chore names and order after a rename');
select is((select string_agg(label||':'||coalesce(profile_name,'-')||':'||was_live::text,'|' order by sort_order) from public.chore_cycle_snapshot_columns where cycle_id=current_setting('app.mc1')::uuid),'Ann:ann:true|Bea:bea:true','run 1 still shows the original people, labels and assignees after a rename, removal and reassignment');
select is((select string_agg(completed_by_name,',' order by completed_by_name) from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.mc1')::uuid),'ann,ann,bea,bea','reassigning a column does not rewrite who actually did the work');
select ok((select structure_version from public.chore_boards where id=current_setting('app.mango')::uuid) > (select structure_version from public.chore_cycle_snapshots where cycle_id=current_setting('app.mc1')::uuid),'template edits bumped the structure version beyond the frozen run''s');
select is((select count(*)::int from public.chore_completions where cycle_id=pg_temp.cyc(current_setting('app.mango')::uuid)),2,'the mid-run edits erased no valid completed work (Ann''s and Bea''s cells are still recorded)');
-- Required work is now Bucket 1 + Bucket TWO on the one live column; Bucket 1 is already done (by Ann).
select is(pg_temp.tick('00000000-0000-4000-8000-000000094006',current_setting('app.mango')::uuid,'Bucket TWO (renamed)','Ann (renamed)'),'checked_closed','run 2 closes against the CURRENT structure (one live column) using the earlier valid cell');
reset role;
select ok((select structure_changed from public.chore_cycle_snapshots where board_id=current_setting('app.mango')::uuid and sequence=2),'the snapshot records that the configuration changed while the run was in progress');
select is((select string_agg(label||':'||coalesce(profile_name,'-')||':'||was_live::text,'|' order by label) from public.chore_cycle_snapshot_columns where board_id=current_setting('app.mango')::uuid and cycle_id=(select cycle_id from public.chore_cycle_snapshots where board_id=current_setting('app.mango')::uuid and sequence=2)),'Ann (renamed):dee:true|Bea:bea:false','a removed column that carries completions is kept in the snapshot as evidence (was_live = false)');
select is((select count(*)::int from public.chore_cycle_snapshot_cells where cycle_id=(select cycle_id from public.chore_cycle_snapshots where board_id=current_setting('app.mango')::uuid and sequence=2)),3,'all three completed cells are in the snapshot, including the removed column''s');
select is((select required_done||'of'||required_total from public.chore_cycle_snapshots where board_id=current_setting('app.mango')::uuid and sequence=2),'2of2','the recorded ratio uses ONE consistent rule set (the structure at close)');

-- 9. Corrections append, never overwrite -----------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'not allowed yet')$$,'42501',null,'corrections are refused while the board''s manager override is off');
select public.chore_board_save('00000000-0000-4000-8000-000000094010','00000000-0000-4000-8000-000000094021',current_setting('app.mango')::uuid,'Mango Lassi',null,'own_column',true,'all_columns','continuous','automatic_after_completion',null);
select throws_ok($$select public.chore_cycle_correct(pg_temp.cyc(current_setting('app.mango')::uuid),current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,true,'open run')$$,'22023',null,'an open run is not corrected here');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'x')$$,'22023',null,'a reason is required');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,gen_random_uuid(),current_setting('app.mAnn')::uuid,false,'forged row id')$$,'22023',null,'a forged row id is refused');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,gen_random_uuid(),false,'forged column id')$$,'22023',null,'a forged column id is refused');
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'staff correction')$$,'42501',null,'staff cannot correct a finished run');
select pg_temp.act('00000000-0000-4000-8000-000000094007');
select throws_ok($$select public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'wrong location')$$,'42501',null,'a manager of another location cannot correct it');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select is(public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'Ann was off shift; she did not do this'),'corrected','a manager appends a correction');
select is(public.chore_cycle_correct(current_setting('app.mc1')::uuid,current_setting('app.mR1')::uuid,current_setting('app.mAnn')::uuid,false,'again'),'unchanged','repeating it is idempotent');
reset role;
select is((select count(*)::int from public.chore_cycle_corrections where cycle_id=current_setting('app.mc1')::uuid),1,'exactly one correction row');
select is((select done_before::text||'>'||done_after::text||'|'||before_completed_by_name||'|'||corrected_by_name||'|'||reason from public.chore_cycle_corrections where cycle_id=current_setting('app.mc1')::uuid),'true>false|ann|mona|Ann was off shift; she did not do this','the correction records before / after, the original actor, the corrector and the reason');
select is((select count(*)::int from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.mc1')::uuid),4,'the original snapshot is untouched (all four recorded cells remain)');
select is((select outcome from public.chore_cycle_snapshots where cycle_id=current_setting('app.mc1')::uuid),'completed','the recorded outcome is unchanged');
select throws_ok($$update public.chore_cycle_corrections set reason='edited' where cycle_id=current_setting('app.mc1')::uuid$$,'23514',null,'corrections are append-only (update)');
select throws_ok($$delete from public.chore_cycle_corrections where cycle_id=current_setting('app.mc1')::uuid$$,'23514',null,'corrections are append-only (delete)');
select is((select count(*)::int from public.chore_events where cycle_id=current_setting('app.mc1')::uuid and event_type='cycle_corrected' and actor_profile_id='00000000-0000-4000-8000-000000094001'),1,'the correction is also in the audit trail under the manager');

-- 10. History reads --------------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000094002');
select ok((select count(*) from public.chore_cycle_snapshots where board_id=current_setting('app.mango')::uuid)>=1,'staff at the location can read the run summaries of a live board');
select is((select count(*)::int from public.chore_cycle_snapshot_cells),0,'but not who-did-what (cells are manager-only)');
select is((select count(*)::int from public.chore_cycle_snapshot_rows),0,'nor the frozen matrix rows');
select is((select count(*)::int from public.chore_cycle_corrections),0,'nor corrections');
select pg_temp.act('00000000-0000-4000-8000-000000094004');
select is((select count(*)::int from public.chore_cycle_snapshots),0,'staff of another location see no runs');
select pg_temp.act('00000000-0000-4000-8000-000000094005');
select is((select count(*)::int from public.chore_cycle_snapshots),0,'another organization sees no runs');
select is((select count(*)::int from public.chore_cycle_snapshot_cells),0,'another organization sees no cells');
select pg_temp.act('00000000-0000-4000-8000-000000094007');
select is((select count(*)::int from public.chore_cycle_snapshots),0,'a manager of location B only sees no runs of A');
select pg_temp.act('00000000-0000-4000-8000-000000094001');
select ok((select count(*) from public.chore_cycle_snapshot_cells where cycle_id=current_setting('app.mc1')::uuid)=4,'a manager reads the frozen cells');
select ok((select count(*) from public.chore_cycle_snapshots)>=4,'a manager reads run summaries across boards (cross-cycle history)');
reset role;

-- 11. Audit stays append-only ----------------------------------------------------------------
select throws_ok($$update public.chore_events set payload='{}' where id=(select min(id) from public.chore_events)$$,'23514',null,'the audit trail cannot be edited');
select throws_ok($$delete from public.chore_events where event_type='cycle_closed'$$,'23514',null,'closure events cannot be deleted');

select * from finish();
rollback;
