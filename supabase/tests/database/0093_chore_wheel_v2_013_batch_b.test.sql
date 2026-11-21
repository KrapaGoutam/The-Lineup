begin;
create extension if not exists pgtap with schema extensions;
select plan(129);

-- V2.0.13 Batch B: Chore Wheel boards, person columns, chore rows, cell completion.
-- Cast (org 1 has locations A and B; org 2 has C):
--   Mona  manager at A, staff at B        Dee  assistant manager at A
--   Ann, Bea  staff at A                  Cal  staff at B only
--   Bo    manager at B only               Otto owner of org 2 (manager at C)
create function pg_temp.act(p text) returns void language plpgsql as $f$
begin
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p, true);
  perform set_config('request.jwt.claims', json_build_object('session_id', p)::text, true);
end $f$;

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000093001','t93-mona@test.invalid'),
 ('00000000-0000-4000-8000-000000093002','t93-ann@test.invalid'),
 ('00000000-0000-4000-8000-000000093003','t93-bea@test.invalid'),
 ('00000000-0000-4000-8000-000000093004','t93-cal@test.invalid'),
 ('00000000-0000-4000-8000-000000093005','t93-otto@test.invalid'),
 ('00000000-0000-4000-8000-000000093006','t93-dee@test.invalid'),
 ('00000000-0000-4000-8000-000000093007','t93-bo@test.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where email like 't93-%';
insert into public.profiles(id,display_name) select id,split_part(split_part(email,'-',2),'@',1) from auth.users where email like 't93-%';
insert into public.organizations(id,name,slug,created_by) values
 ('00000000-0000-4000-8000-000000093010','T93 org','t93-org','00000000-0000-4000-8000-000000093001'),
 ('00000000-0000-4000-8000-000000093011','T93 other','t93-other','00000000-0000-4000-8000-000000093005');
insert into public.locations(id,organization_id,name,time_zone) values
 ('00000000-0000-4000-8000-000000093021','00000000-0000-4000-8000-000000093010','A','America/Chicago'),
 ('00000000-0000-4000-8000-000000093022','00000000-0000-4000-8000-000000093010','B','America/Chicago'),
 ('00000000-0000-4000-8000-000000093023','00000000-0000-4000-8000-000000093011','C','America/Chicago');
insert into public.memberships(organization_id,profile_id,roles) values
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093001',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093002',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093003',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093004',array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093006',array['shift_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093007',array['general_manager']::public.app_role[]),
 ('00000000-0000-4000-8000-000000093011','00000000-0000-4000-8000-000000093005',array['owner']::public.app_role[]);
insert into public.location_memberships(location_id,profile_id,role) values
 ('00000000-0000-4000-8000-000000093021','00000000-0000-4000-8000-000000093001','manager'),
 ('00000000-0000-4000-8000-000000093022','00000000-0000-4000-8000-000000093001','staff'),
 ('00000000-0000-4000-8000-000000093021','00000000-0000-4000-8000-000000093002','staff'),
 ('00000000-0000-4000-8000-000000093021','00000000-0000-4000-8000-000000093003','staff'),
 ('00000000-0000-4000-8000-000000093022','00000000-0000-4000-8000-000000093004','staff'),
 ('00000000-0000-4000-8000-000000093021','00000000-0000-4000-8000-000000093006','assistant_manager'),
 ('00000000-0000-4000-8000-000000093022','00000000-0000-4000-8000-000000093007','manager'),
 ('00000000-0000-4000-8000-000000093023','00000000-0000-4000-8000-000000093005','manager');

-- 1. Schema and grants ---------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.chore_boards'::regclass,'public.chore_cycles'::regclass,'public.chore_columns'::regclass,
  'public.chore_column_assignments'::regclass,'public.chore_rows'::regclass,'public.chore_row_columns'::regclass,
  'public.chore_completions'::regclass,'public.chore_events'::regclass)),'RLS enabled on all eight chore tables');
select is((select count(*)::int from information_schema.role_table_grants
  where grantee in ('authenticated','anon','PUBLIC') and table_schema='public' and table_name like 'chore\_%' and privilege_type <> 'SELECT'),0,'clients hold no write privilege on any chore table');
select is((select count(*)::int from information_schema.role_table_grants
  where grantee='anon' and table_schema='public' and table_name like 'chore\_%'),0,'anon holds no privilege on any chore table');
select ok(not has_function_privilege('anon','public.chore_cell_set(uuid,uuid,uuid,boolean)','execute')
  and has_function_privilege('authenticated','public.chore_cell_set(uuid,uuid,uuid,boolean)','execute'),'chore_cell_set grants');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'chore\_%'
  and has_function_privilege('anon',p.oid,'execute')),0,'anon can execute no chore RPC');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'chore\_%'
  and has_function_privilege('authenticated',p.oid,'execute')),11,'exactly eleven chore RPCs are callable by signed-in users');
select ok(not has_function_privilege('authenticated','private.chore_board_authorize(uuid,boolean,text,boolean,boolean)','execute')
  and not has_function_privilege('authenticated','private.chore_emit(public.chore_boards,uuid,uuid,uuid,text,jsonb)','execute'),'internal helpers are private');
select ok(pg_get_function_arguments('public.chore_cell_set(uuid,uuid,uuid,boolean)'::regprocedure) !~* 'actor|profile|user',
  'chore_cell_set takes no actor argument (the actor is always auth.uid())');
select is((select count(*)::int from pg_trigger where tgrelid='public.chore_events'::regclass and tgname='chore_events_append_only'),1,'audit table is append-only (trigger present)');

-- 2. Boards: who may create ----------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'Staff try',null,'own_column',false,'all_columns','continuous','manual_restart',null)$$,'42501',null,'staff cannot create a board');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093022',null,'B board',null,'own_column',false,'all_columns','continuous','manual_restart',null)$$,'42501',null,'a manager of A (only staff at B) cannot create a board at B');
select pg_temp.act('00000000-0000-4000-8000-000000093005');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'Org2 try',null,'own_column',false,'all_columns','continuous','manual_restart',null)$$,'42501',null,'an owner of another organization cannot create a board at A');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'   ',null,'own_column',false,'all_columns','continuous','manual_restart',null)$$,'22023',null,'a blank board name is refused');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'X',null,'everyone',false,'all_columns','continuous','manual_restart',null)$$,'22023',null,'an unknown access setting is refused');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'X',null,'own_column',false,'all_columns','hourly','manual_restart',null)$$,'22023',null,'an unknown recurrence is refused');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,'Daily Refill & Prep','Prep area','own_column',false,'all_columns','daily','automatic_after_completion',null)$$,'a manager creates a board (reserved recurrence/reset are persisted)');
reset role;
select set_config('app.board',(select id::text from public.chore_boards where name='Daily Refill & Prep'),true);
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.board')::uuid and status='open' and sequence=1),1,'creating a board opens cycle 1');
select is((select recurrence_intent||'/'||reset_intent from public.chore_boards where id=current_setting('app.board')::uuid),'daily/automatic_after_completion','reserved recurrence and reset intent are stored, not enforced');
select is((select count(*)::int from public.chore_cycles),1,'no scheduler: exactly one cycle exists');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',null,' daily refill & PREP ',null,'own_column',false,'all_columns','continuous','manual_restart',null)$$,'22023',null,'a duplicate live board name (any case) is refused');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Daily Refill & Prep','Prep area, updated','own_column',false,'all_columns','daily','manual_restart',1)$$,'update with the version it loaded');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Other name',null,'own_column',false,'all_columns','daily','manual_restart',1)$$,'P0001',null,'a stale version is a conflict, never a silent overwrite');
reset role;
select is((select description||'|'||version::text from public.chore_boards where id=current_setting('app.board')::uuid),'Prep area, updated|2','the update persisted and bumped the version');
select pg_temp.act('00000000-0000-4000-8000-000000093006');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Daily Refill & Prep','Prep area, updated','own_column',false,'all_columns','daily','manual_restart',null)$$,'an assistant manager at A may configure the board');
select pg_temp.act('00000000-0000-4000-8000-000000093007');
select throws_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Hijack',null,'own_column',false,'all_columns','daily','manual_restart',null)$$,'42501',null,'a manager of B only cannot reconfigure the board of A');

-- 3. Columns ---------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Ann prep','00000000-0000-4000-8000-000000093002')$$,'add a person column for Ann');
select lives_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'','00000000-0000-4000-8000-000000093003')$$,'a blank label defaults to the employee name');
select lives_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Prep Cook 2',null)$$,'add an unassigned responsibility column');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Cal','00000000-0000-4000-8000-000000093004')$$,'22023',null,'an employee of another location cannot be assigned');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Otto','00000000-0000-4000-8000-000000093005')$$,'22023',null,'an employee of another organization cannot be assigned');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Ann again','00000000-0000-4000-8000-000000093002')$$,'22023',null,'the same person cannot hold two live columns');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Mine','00000000-0000-4000-8000-000000093002')$$,'42501',null,'staff cannot add a column');
reset role;
select set_config('app.cAnn',(select id::text from public.chore_columns where board_id=current_setting('app.board')::uuid and label='Ann prep'),true);
select set_config('app.cBea',(select id::text from public.chore_columns where board_id=current_setting('app.board')::uuid and label='bea'),true);
select set_config('app.cPos',(select id::text from public.chore_columns where board_id=current_setting('app.board')::uuid and label='Prep Cook 2'),true);
select is((select label from public.chore_columns where id=current_setting('app.cBea')::uuid),'bea','the blank label became the employee display name');
select is((select count(*)::int from public.chore_column_assignments where board_id=current_setting('app.board')::uuid and ended_at is null),3,'each column has one open assignment record');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_column_save(current_setting('app.board')::uuid,current_setting('app.cAnn')::uuid,'Ann (opening)','00000000-0000-4000-8000-000000093002')$$,'rename the label only');
reset role;
select is((select display_name from public.profiles where id='00000000-0000-4000-8000-000000093002'),'ann','renaming a column label never renames the employee account');
select is((select count(*)::int from public.chore_column_assignments where column_id=current_setting('app.cAnn')::uuid),1,'a label edit adds no assignment history');

-- 4. Rows --------------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Mango Lassi — Bucket 1','Fill to the line',true,'all_columns','{}')$$,'add an all-columns chore');
select lives_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Mint Chutney Refill',null,true,'selected_columns',array[current_setting('app.cAnn')::uuid])$$,'add a selected-people chore (Ann only)');
select lives_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Restock Napkins',null,true,'any_one','{}')$$,'add an any-one chore');
select lives_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Wipe menus',null,false,'all_columns','{}')$$,'add an optional chore');
select throws_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Bad selected',null,true,'selected_columns','{}')$$,'22023',null,'a selected-people chore needs at least one person');
select throws_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Bad selected',null,true,'selected_columns',array['00000000-0000-4000-8000-0000000939ff']::uuid[])$$,'22023',null,'selected columns must belong to this board');
select throws_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'',null,true,'all_columns','{}')$$,'22023',null,'a blank chore name is refused');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Staff chore',null,true,'all_columns','{}')$$,'42501',null,'staff cannot add a chore');
reset role;
select set_config('app.rLassi',(select id::text from public.chore_rows where board_id=current_setting('app.board')::uuid and title like 'Mango Lassi%'),true);
select set_config('app.rMint',(select id::text from public.chore_rows where board_id=current_setting('app.board')::uuid and title='Mint Chutney Refill'),true);
select set_config('app.rNap',(select id::text from public.chore_rows where board_id=current_setting('app.board')::uuid and title='Restock Napkins'),true);
select set_config('app.rOpt',(select id::text from public.chore_rows where board_id=current_setting('app.board')::uuid and title='Wipe menus'),true);
select is((select count(*)::int from public.chore_row_columns where row_id=current_setting('app.rMint')::uuid),1,'the selected-people set is stored');

-- 5. Cells: authority and attribution ---------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)),'checked','Ann ticks her own cell');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)),'unchanged','ticking again is a no-op');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cBea')::uuid,true)$$,'42501',null,'Ann cannot tick Bea''s cell (no impersonation)');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cPos')::uuid,true)),'checked','a workforce member may tick an unassigned position column');
reset role;
select is((select completed_by::text||'|'||entered_as from public.chore_completions where row_id=current_setting('app.rLassi')::uuid and column_id=current_setting('app.cAnn')::uuid),'00000000-0000-4000-8000-000000093002|self','the completion records the real actor');
select is((select entered_as from public.chore_completions where row_id=current_setting('app.rLassi')::uuid and column_id=current_setting('app.cPos')::uuid),'position','a position-column tick is labelled as such');
select is((select count(*)::int from public.chore_events where board_id=current_setting('app.board')::uuid and event_type='cell_checked'),2,'one audit entry per real change (the repeat added none)');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rMint')::uuid,current_setting('app.cBea')::uuid,true)$$,'22023',null,'a cell outside a selected-people chore is not applicable');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rMint')::uuid,current_setting('app.cAnn')::uuid,true)),'checked','a selected cell can be ticked');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,gen_random_uuid(),true)$$,'22023',null,'an unknown column is refused');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,gen_random_uuid(),current_setting('app.cAnn')::uuid,true)$$,'22023',null,'an unknown chore is refused');
select pg_temp.act('00000000-0000-4000-8000-000000093004');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)$$,'42501',null,'staff at another location cannot tick a cell of A');
select is((select count(*)::int from public.chore_boards),0,'staff at another location sees no board of A');
select pg_temp.act('00000000-0000-4000-8000-000000093005');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)$$,'42501',null,'another organization cannot untick a cell of A');
select is((select count(*)::int from public.chore_completions),0,'another organization reads no completion');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)$$,'42501',null,'a manager cannot untick someone else''s cell unless the board allows it');

-- any-one chore: one winner
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rNap')::uuid,current_setting('app.cAnn')::uuid,true)),'checked','any-one: the first completion wins');
select pg_temp.act('00000000-0000-4000-8000-000000093003');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rNap')::uuid,current_setting('app.cBea')::uuid,true)$$,'22023',null,'any-one: a second completion is refused (already done)');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rNap')::uuid,current_setting('app.cAnn')::uuid,false)),'unchecked','the completer can undo');
select pg_temp.act('00000000-0000-4000-8000-000000093003');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rNap')::uuid,current_setting('app.cBea')::uuid,true)),'checked','after the undo another person can complete it');

-- optional chore is just another cell at the database level
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rOpt')::uuid,current_setting('app.cBea')::uuid,true)),'checked','an optional chore can be ticked');

-- 6. Manager override and the shared-tablet setting ---------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Daily Refill & Prep','Prep area, updated','own_column',true,'all_columns','daily','manual_restart',null)$$,'a manager explicitly allows manager corrections');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)),'unchecked','with the override on, a manager corrects Ann''s cell');
reset role;
select is((select (payload->>'corrected')::boolean from public.chore_events where board_id=current_setting('app.board')::uuid and event_type='cell_unchecked' order by id desc limit 1),true,'the correction is flagged in the audit trail');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)),'checked','the manager ticks a cell on behalf of a column');
reset role;
select is((select completed_by::text||'|'||entered_as from public.chore_completions where row_id=current_setting('app.rLassi')::uuid and column_id=current_setting('app.cAnn')::uuid),'00000000-0000-4000-8000-000000093001|manager_correction','the manager is recorded as the actor, never as Ann');
select pg_temp.act('00000000-0000-4000-8000-000000093007');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)$$,'42501',null,'the override does not extend to a manager of another location');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Daily Refill & Prep','Prep area, updated','any_workforce',false,'all_columns','daily','manual_restart',null)$$,'switch to a shared prep tablet');
select pg_temp.act('00000000-0000-4000-8000-000000093003');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)),'unchecked','any-workforce: Bea may update Ann''s column');
reset role;
select is((select (payload->>'entered_as') from public.chore_events where board_id=current_setting('app.board')::uuid and event_type='cell_unchecked' order by id desc limit 1),'shared','that is recorded as a shared-tablet entry by the real caller');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_board_save('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',current_setting('app.board')::uuid,'Daily Refill & Prep','Prep area, updated','own_column',false,'all_columns','daily','manual_restart',null)$$,'back to own-column access, no override');

-- 7. Reassign preserves history ------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)),'checked','Ann completes a cell before being replaced');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,current_setting('app.cAnn')::uuid,'Ann (opening)','00000000-0000-4000-8000-000000093004')$$,'22023',null,'reassigning to an ineligible person is refused');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,current_setting('app.cAnn')::uuid,'Ann (opening)','00000000-0000-4000-8000-000000093003')$$,'22023',null,'reassigning to someone who already has a column is refused');
select lives_ok($$select public.chore_column_save(current_setting('app.board')::uuid,current_setting('app.cAnn')::uuid,'Opening prep','00000000-0000-4000-8000-000000093006')$$,'reassign the column to Dee');
reset role;
select is((select count(*)::int from public.chore_column_assignments where column_id=current_setting('app.cAnn')::uuid),2,'assignment history keeps both holders');
select is((select count(*)::int from public.chore_column_assignments where column_id=current_setting('app.cAnn')::uuid and ended_at is not null and profile_id='00000000-0000-4000-8000-000000093002'),1,'Ann''s assignment was closed, not erased');
select is((select completed_by::text from public.chore_completions where row_id=current_setting('app.rLassi')::uuid and column_id=current_setting('app.cAnn')::uuid),'00000000-0000-4000-8000-000000093002','the earlier completion still names Ann: the template edit did not rewrite the actor');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)$$,'42501',null,'the former holder can no longer change that column');
select pg_temp.act('00000000-0000-4000-8000-000000093006');
select is((select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rNap')::uuid,current_setting('app.cAnn')::uuid,false)),'unchanged','the new holder acts on the column (here nothing to undo)');

-- 8. Reorder, deactivate, archive -----------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_columns_reorder(current_setting('app.board')::uuid,array[current_setting('app.cPos')::uuid,current_setting('app.cBea')::uuid,current_setting('app.cAnn')::uuid])$$,'reorder columns');
select throws_ok($$select public.chore_columns_reorder(current_setting('app.board')::uuid,array[gen_random_uuid()])$$,'22023',null,'a reorder naming a foreign column is refused');
reset role;
select is((select string_agg(label,'|' order by sort_order) from public.chore_columns where board_id=current_setting('app.board')::uuid and archived_at is null),'Prep Cook 2|bea|Opening prep','the new column order persisted');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_rows_reorder(current_setting('app.board')::uuid,array[current_setting('app.rNap')::uuid,current_setting('app.rLassi')::uuid])$$,'reorder chores (unlisted chores keep their relative order after)');
reset role;
select is((select string_agg(title,'|' order by sort_order) from public.chore_rows where board_id=current_setting('app.board')::uuid),'Restock Napkins|Mango Lassi — Bucket 1|Mint Chutney Refill|Wipe menus','the new chore order persisted');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_column_set_state(current_setting('app.cPos')::uuid,'inactive')$$,'turn a column off');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cPos')::uuid,false)$$,'22023',null,'a turned-off column cannot be ticked');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_row_set_state(current_setting('app.rOpt')::uuid,'archived')$$,'archive a chore');
reset role;
select is((select count(*)::int from public.chore_completions where row_id=current_setting('app.rOpt')::uuid),1,'archiving a chore keeps its completion record');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rOpt')::uuid,current_setting('app.cBea')::uuid,false)$$,'22023',null,'an archived chore cannot be changed');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_column_set_state(current_setting('app.cPos')::uuid,'archived')$$,'archive a column');
reset role;
select is((select count(*)::int from public.chore_completions where column_id=current_setting('app.cPos')::uuid),1,'archiving a column keeps its completion record');
select is((select count(*)::int from public.chore_column_assignments where column_id=current_setting('app.cPos')::uuid and ended_at is null),0,'an archived column has no open assignment');

-- 9. Visibility ------------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select count(*)::int from public.chore_boards where id=current_setting('app.board')::uuid),1,'staff at A sees the live board');
select cmp_ok((select count(*)::int from public.chore_completions where board_id=current_setting('app.board')::uuid),'>=',1,'staff at A sees its completions');
select is((select count(*)::int from public.chore_events),0,'staff cannot read the audit trail');
select is((select count(*)::int from public.chore_column_assignments),0,'staff cannot read assignment history');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select cmp_ok((select count(*)::int from public.chore_events where board_id=current_setting('app.board')::uuid),'>',10,'the manager reads the audit trail');
select cmp_ok((select count(*)::int from public.chore_column_assignments where board_id=current_setting('app.board')::uuid),'>=',4,'the manager reads assignment history');

-- 10. Duplicate -----------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select throws_ok($$select public.chore_board_duplicate(current_setting('app.board')::uuid,'Copy')$$,'42501',null,'staff cannot duplicate a board');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select throws_ok($$select public.chore_board_duplicate(current_setting('app.board')::uuid,'Daily Refill & Prep')$$,'22023',null,'a duplicate needs a new name');
select lives_ok($$select public.chore_board_duplicate(current_setting('app.board')::uuid,'Evening Prep')$$,'duplicate a board configuration');
reset role;
select set_config('app.board2',(select id::text from public.chore_boards where name='Evening Prep'),true);
select is((select (select count(*) from public.chore_columns where board_id=current_setting('app.board2')::uuid)||'/'||(select count(*) from public.chore_rows where board_id=current_setting('app.board2')::uuid)||'/'||(select count(*) from public.chore_completions where board_id=current_setting('app.board2')::uuid)),'2/3/0','the copy has the live columns and chores (archived ones are not copied) and NO completions');
select is((select count(*)::int from public.chore_row_columns where board_id=current_setting('app.board2')::uuid),1,'the selected-people set was remapped onto the new columns');
select is((select count(*)::int from public.chore_cycles where board_id=current_setting('app.board2')::uuid and status='open' and sequence=1),1,'the copy starts its own cycle 1');
select is((select count(*)::int from public.chore_row_columns rc join public.chore_columns c on c.id=rc.column_id where rc.board_id=current_setting('app.board2')::uuid and c.board_id<>rc.board_id),0,'the copy references only its own columns');

-- 11. Board states, direct requests --------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_board_set_state(current_setting('app.board')::uuid,'inactive')$$,'turn the board off');
select pg_temp.act('00000000-0000-4000-8000-000000093002');
select is((select count(*)::int from public.chore_boards where id=current_setting('app.board')::uuid),0,'staff no longer see a turned-off board');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,true)$$,'42501',null,'a direct request to tick a turned-off board is refused');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select is((select count(*)::int from public.chore_boards where id=current_setting('app.board')::uuid),1,'a manager still sees it');
select throws_ok($$select public.chore_cell_set(current_setting('app.board')::uuid,current_setting('app.rLassi')::uuid,current_setting('app.cAnn')::uuid,false)$$,'22023',null,'even a manager cannot tick a turned-off board');
select lives_ok($$select public.chore_board_set_state(current_setting('app.board')::uuid,'active')$$,'turn it back on');
select lives_ok($$select public.chore_board_set_state(current_setting('app.board')::uuid,'archived')$$,'archive the board');
select throws_ok($$select public.chore_board_set_state(current_setting('app.board')::uuid,'active')$$,'22023',null,'an archived board cannot be switched on again');
select throws_ok($$select public.chore_row_save(current_setting('app.board')::uuid,null,'Late chore',null,true,'all_columns','{}')$$,'22023',null,'an archived board cannot be edited (rows)');
select throws_ok($$select public.chore_column_save(current_setting('app.board')::uuid,null,'Late','00000000-0000-4000-8000-000000093002')$$,'22023',null,'an archived board cannot be edited (columns)');
reset role;
select is((select count(*)::int from public.chore_completions where board_id=current_setting('app.board')::uuid),5,'archiving never deletes completed records');
select pg_temp.act('00000000-0000-4000-8000-000000093001');
select lives_ok($$select public.chore_board_duplicate(current_setting('app.board')::uuid,'Revived prep')$$,'an archived board can be duplicated (the way to revive its configuration)');
select lives_ok($$select public.chore_board_reorder('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',array[current_setting('app.board2')::uuid])$$,'reorder boards');
select throws_ok($$select public.chore_board_reorder('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',array[gen_random_uuid()])$$,'22023',null,'a board reorder naming an unknown board is refused');
select pg_temp.act('00000000-0000-4000-8000-000000093007');
select throws_ok($$select public.chore_board_reorder('00000000-0000-4000-8000-000000093010','00000000-0000-4000-8000-000000093021',array[current_setting('app.board2')::uuid])$$,'42501',null,'a manager of another location cannot reorder boards');

-- 12. Audit ---------------------------------------------------------------------------
reset role;
select throws_ok($$update public.chore_events set payload='{}' where id=(select min(id) from public.chore_events)$$,'23514',null,'the audit trail cannot be edited');
select throws_ok($$delete from public.chore_events where id=(select min(id) from public.chore_events)$$,'23514',null,'the audit trail cannot be deleted');

select * from finish();
rollback;
