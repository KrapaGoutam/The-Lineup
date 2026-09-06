begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- The ten RPCs this phase adds, each SECURITY INVOKER (so they rely on the
-- caller's own RLS, never elevate it) and callable by authenticated.
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_assign'
  ),
  'board_assign exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_add_column'
  ),
  'board_add_column exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_set_column_status'
  ),
  'board_set_column_status exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_clear_row'
  ),
  'board_clear_row exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_clear_column'
  ),
  'board_clear_column exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_clear_board'
  ),
  'board_clear_board exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_move_column'
  ),
  'board_move_column exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_add_row'
  ),
  'board_add_row exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_undo'
  ),
  'board_undo exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_redo'
  ),
  'board_redo exists'
);

-- Every board_* RPC is SECURITY INVOKER, never DEFINER -- confirmed for
-- all ten in one query rather than asserting it function by function.
select is(
  (
    select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like 'board\_%'
      and prosecdef = true
  )::integer,
  0,
  'no board_* function is SECURITY DEFINER'
);

-- Real gaps found while verifying existing policies against this phase's
-- needs (see the migration's own comments for the reasoning): board_events
-- UPDATE and rotation_rounds writes were manager-only, which would have
-- made undo -- and the routine auto-open of a new round during any
-- member's ordinary assign -- silently fail for non-managers.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'board_events'
      and policyname = 'board_events_update_any_member'
  ),
  'board_events has the any-member update policy'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'board_events'
      and policyname = 'board_events_update_manager'
  ),
  'the old manager-only board_events update policy is gone'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rotation_rounds'
      and policyname = 'rotation_rounds_write_any_member'
  ),
  'rotation_rounds has the any-member write policy'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rotation_rounds'
      and policyname = 'rotation_rounds_write_manager'
  ),
  'the old manager-only rotation_rounds write policy is gone'
);

-- move-column swaps two positions in one statement; the unique constraint
-- has to be deferrable for that swap to never depend on row-processing
-- order within the statement.
select ok(
  (
    select condeferrable from pg_constraint
    where conname = 'rotation_members_service_session_id_position_key'
      and conrelid = 'public.rotation_members'::regclass
  ),
  'the position uniqueness constraint is deferrable'
);

-- Realtime: the board's own data tables, not just the retained pure
-- floor/rotation engine's tables, are on the publication.
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rotation_rounds'
  ),
  'rotation_rounds is on the realtime publication'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_rotation_entries'
  ),
  'table_rotation_entries is on the realtime publication'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_events'
  ),
  'board_events is on the realtime publication'
);

-- Real gap found live-testing undo (see that migration's own comments):
-- the private helpers are SECURITY INVOKER, so the *calling* role
-- (authenticated) needs EXECUTE on them too, not just the public board_*
-- wrapper -- an invoker chain doesn't inherit anything the way a
-- SECURITY DEFINER chain would.
select ok(
  has_function_privilege('authenticated', 'private.get_or_create_active_session(uuid,uuid,date)', 'EXECUTE'),
  'authenticated can execute get_or_create_active_session'
);
select ok(
  has_function_privilege('authenticated', 'private.ensure_trailing_round(uuid,bigint)', 'EXECUTE'),
  'authenticated can execute ensure_trailing_round'
);
select ok(
  has_function_privilege('authenticated', 'private.assert_board_not_locked(uuid,bigint)', 'EXECUTE'),
  'authenticated can execute assert_board_not_locked'
);

-- Real gap found live-testing undo of someone else's assign, and would
-- equally have blocked board_clear_row/column/board deleting any entry
-- not created by whoever clicked Clear: the single any-member policy
-- required assigned_by = auth.uid() in `using`, which only a fresh
-- INSERT's `with check` can ever unconditionally satisfy. Split into
-- insert/update/delete so update/delete carry no such requirement on the
-- pre-existing row.
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'table_rotation_entries'
      and policyname = 'table_rotation_entries_write_any_member'
  ),
  'the old single any-member write policy is gone'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'table_rotation_entries'
      and policyname = 'table_rotation_entries_insert_any_member'
  ),
  'table_rotation_entries has the any-member insert policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'table_rotation_entries'
      and policyname = 'table_rotation_entries_update_any_member'
  ),
  'table_rotation_entries has the any-member update policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'table_rotation_entries'
      and policyname = 'table_rotation_entries_delete_any_member'
  ),
  'table_rotation_entries has the any-member delete policy'
);

-- Real gap found cross-checking DATA_MODEL.md's RLS matrix against what
-- was actually built (see that migration's own comments): clear-row/
-- column/board and add-row write table_rotation_entries/rotation_rounds,
-- both of which had to become any-active-member-writable for unrelated
-- reasons (the auto-open side effect of an ordinary assign; any member
-- being able to undo). Without an explicit guard, any active member
-- could call these four directly, bypassing the UI's manager-only gate
-- entirely.
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace and proname = 'assert_is_board_manager'
  ),
  'assert_is_board_manager exists'
);
select ok(
  has_function_privilege('authenticated', 'private.assert_is_board_manager(uuid)', 'EXECUTE'),
  'authenticated can execute assert_is_board_manager'
);

select * from finish();
rollback;
