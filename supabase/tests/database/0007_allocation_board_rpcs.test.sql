begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

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

select * from finish();
rollback;
