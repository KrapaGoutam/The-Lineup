begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Every attribution column keeps a validated profile FK; tenant/session graph
-- and workforce membership FKs remain separate from authenticated provenance.
select ok(exists (
  select 1 from pg_constraint c join pg_attribute a
  on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and c.convalidated
    and c.conrelid = ('public.' || x.tbl)::regclass
    and c.confrelid = 'public.profiles'::regclass and a.attname = x.col
), x.tbl || '.' || x.col || ' has validated profile identity')
from (values ('board_events', 'actor_profile_id'), ('service_sessions', 'started_by'),
 ('service_sessions', 'closed_by'), ('table_rotation_entries', 'assigned_by'),
 ('table_rotation_entries', 'ended_by')) x(tbl,col);

select ok(exists (select 1 from pg_constraint where conname = x.name and convalidated),
 x.name || ' remains enforced') from (values
 ('service_sessions_location_tenant_fk'), ('rotation_members_session_tenant_fk'),
 ('rotation_members_server_fk'), ('section_assignments_server_fk'),
 ('table_rotation_entries_round_session_fk'), ('table_rotation_entries_member_session_fk'),
 ('board_events_service_session_id_organization_id_fkey')) x(name);

select ok(not has_table_privilege('authenticated', 'public.' || x.tbl, 'INSERT'),
 x.tbl || ' direct client inserts still revoked')
from (values ('board_events'), ('service_sessions'), ('table_rotation_entries'),
 ('rotation_members'), ('section_assignments'), ('rotation_rounds')) x(tbl);

select ok(not has_function_privilege('anon', 'public.board_location_roster(uuid,uuid)', 'EXECUTE'), 'anonymous roster denied');
select ok(has_function_privilege('authenticated', 'public.board_location_roster(uuid,uuid)', 'EXECUTE'), 'authenticated roster API granted');
select ok(not has_function_privilege('authenticated', 'private.emit_board_event(uuid,bigint,public.board_event_type,jsonb,jsonb)', 'EXECUTE'), 'clients cannot select an event actor');
select ok(p.prosecdef and p.proconfig @> array['search_path=""'], 'roster has fixed empty search path')
from pg_proc p where p.oid = 'public.board_location_roster(uuid,uuid)'::regprocedure;
select ok(position('assert_board_module_if_installed' in pg_get_functiondef('public.board_location_roster(uuid,uuid)'::regprocedure)) > 0,
 'roster composes with staged module enforcement');
select ok(position('actor' in pg_get_functiondef('private.emit_board_event(uuid,bigint,public.board_event_type,jsonb,jsonb)'::regprocedure)) > 0,
 'event emission snapshots authenticated provenance');
select ok(attnotnull, 'event actor remains mandatory') from pg_attribute
where attrelid = 'public.board_events'::regclass and attname = 'actor_profile_id';
select ok(not has_function_privilege('authenticated', 'private.assert_board_module_if_installed(uuid)', 'EXECUTE'), 'module composition helper is private');
select ok(position('assert_board_module_if_installed' in pg_get_functiondef('private.get_or_create_active_session(uuid,uuid,date)'::regprocedure))
  < position('select s.id into v_session_id' in pg_get_functiondef('private.get_or_create_active_session(uuid,uuid,date)'::regprocedure)),
  'module guard precedes floor session read/creation');
select * from finish();
rollback;
