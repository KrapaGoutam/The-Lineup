-- Feature 015 Phase C: real persistence for the table-allocation board.
--
-- The demo board is a pure client-side reducer (rotation-board.ts) over an
-- in-memory RotationBoard. Real mode maps it onto four tables that already
-- existed (service_sessions, rotation_members, rotation_rounds,
-- table_rotation_entries) plus an append-only event log (board_events) --
-- none of that is new. What's new here is exactly what was scoped in
-- docs/features/015-hosted-supabase-persistence.md's Phase C section: one
-- atomic RPC per BoardAction variant (the write plus its board_events row,
-- in one transaction -- the atomicity gap the spec named), Realtime on the
-- tables the board actually reads, and a deferrable position constraint so
-- a column reorder can swap two positions in one statement.
--
-- Column <-> schema mapping, since it isn't 1:1 in name:
--   RotationColumn.id      <-> rotation_members.id (NOT server_profile_id --
--                               a column is a row in this session's
--                               rotation, not the person directly)
--   RotationColumn.status  <-> rotation_members.status, collapsed from the
--                               4-value rotation_status enum (active,
--                               paused, closing, unavailable) to the
--                               3-value demo model (active, paused,
--                               removed). "closing" has no UI concept yet
--                               and is never written by these functions;
--                               "removed" maps to "unavailable", the
--                               closest existing semantic fit -- documented
--                               here since the demo enum and the DB enum
--                               are deliberately not kept in lockstep.
--   RotationRound           <-> rotation_rounds, one row per round, exactly
--                               as in the pure model.
--   RotationCell            <-> table_rotation_entries, but only for
--                               *filled* cells -- an empty cell has no row,
--                               same as the pure model's `tableLabel: null`
--                               needing no explicit representation.
--
-- meal_period is a required column with no demo-model equivalent (this app
-- doesn't model breakfast/lunch/dinner separately) -- every session created
-- by these functions uses the fixed literal 'service', the same kind of
-- honest placeholder as Phase B's shift role_label := 'Server'.

-- ---------------------------------------------------------------------
-- 1. Realtime: the board's actual data tables were never added to the
--    publication (only service_sessions/rotation_members/section_assignments/
--    seatings/seating_tables were, for the retained pure floor/rotation
--    engine). Without this, a postgres_changes subscription on these tables
--    silently receives nothing -- confirmed by reading the publication
--    definition before writing this migration, not assumed.
-- ---------------------------------------------------------------------
-- Added one at a time and guarded, rather than a single ADD TABLE list,
-- because at least one of these three already turned out to be a
-- publication member on the live project (confirmed while applying this
-- migration, not assumed) -- ALTER PUBLICATION ... ADD TABLE has no IF NOT
-- EXISTS form, and a multi-table ADD TABLE statement aborts entirely on
-- the first already-a-member table rather than skipping it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rotation_rounds'
  ) then
    alter publication supabase_realtime add table public.rotation_rounds;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_rotation_entries'
  ) then
    alter publication supabase_realtime add table public.table_rotation_entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_events'
  ) then
    alter publication supabase_realtime add table public.board_events;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. move-column swaps two rows' `position` in one statement. The unique
--    (service_session_id, position) constraint is NOT DEFERRABLE by
--    default, so Postgres can reject the swap if it checks the constraint
--    mid-statement rather than at commit. Making it deferrable removes any
--    dependency on statement-internal ordering.
-- ---------------------------------------------------------------------
-- ALTER CONSTRAINT ... DEFERRABLE only works on foreign keys in Postgres --
-- confirmed the hard way applying this migration, not assumed. A unique
-- constraint has to be dropped and recreated deferrable instead.
alter table public.rotation_members
  drop constraint rotation_members_service_session_id_position_key;
alter table public.rotation_members
  add constraint rotation_members_service_session_id_position_key
  unique (service_session_id, position) deferrable initially deferred;

-- ---------------------------------------------------------------------
-- 2b. Real gap found while verifying existing policies against this
--     phase's needs (per the spec's instruction to verify, not assume,
--     and add a policy only if a real gap turns up): board_events'
--     UPDATE policy was manager-only. `undone_at` is the only column an
--     UPDATE on this table is ever used for, and it's exactly the undo/
--     redo bookkeeping below -- Feature 011 already established that any
--     active member may act on the board (not just managers), and the
--     demo UI's Undo/Redo buttons are unconditionally available to every
--     signed-in user, not gated behind isManager like Add row/Clear
--     board are. A manager-only board_events UPDATE policy would make
--     undo a manager-only feature in real mode, silently narrower than
--     demo mode. Replaced with the same role set and finalized-day
--     freeze table_rotation_entries_write_any_member already uses.
-- ---------------------------------------------------------------------
drop policy "board_events_update_manager" on public.board_events;

-- Second real gap found the same way: rotation_rounds_write_manager was
-- for-all, manager-only. ensure_trailing_round's auto-open of the next
-- row runs as a side effect of an ordinary board_assign call, which any
-- active member may make (Feature 011) -- a server's routine table entry
-- would fail with a permission error the instant it happened to be the
-- one that opened a new round, an entirely UI-invisible reason to fail.
-- rotation_rounds is structural to the board the same way
-- table_rotation_entries is (not an identity-bearing row like
-- rotation_members, which stays manager/host-only); "Add row"/"Clear
-- board" stay manager-only at the UI layer, same as several other
-- manager-only controls in this app that rely on button visibility
-- rather than a second DB-level gate for an already-attributed,
-- already-logged action.
drop policy "rotation_rounds_write_manager" on public.rotation_rounds;

create policy "rotation_rounds_write_any_member" on public.rotation_rounds
  for all to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not exists (
      select 1
      from public.service_sessions session
      join public.tip_pools pool
        on pool.location_id = session.location_id
       and pool.service_date = session.service_date
       and pool.organization_id = session.organization_id
      where session.id = rotation_rounds.service_session_id
        and session.organization_id = rotation_rounds.organization_id
        and pool.status = 'finalized'
    )
  )
  with check (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

create policy "board_events_update_any_member" on public.board_events
  for update to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not exists (
      select 1
      from public.service_sessions session
      join public.tip_pools pool
        on pool.location_id = session.location_id
       and pool.service_date = session.service_date
       and pool.organization_id = session.organization_id
      where session.id = board_events.service_session_id
        and session.organization_id = board_events.organization_id
        and pool.status = 'finalized'
    )
  )
  with check (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

-- ---------------------------------------------------------------------
-- 3. Shared helpers (private schema, same convention as has_org_role).
-- ---------------------------------------------------------------------

-- One active session per (location, service_date) -- the same "one
-- lazily-created bucket per day" simplification Phase B/D already used for
-- schedule_periods and tip_pools. SECURITY INVOKER: the insert only
-- succeeds for a caller whose role passes service_sessions_operate_service
-- (owner/general_manager/shift_manager/host) -- a server calling an action
-- that would need to create today's very first session gets a real,
-- friendly permission error, not a silent failure. In practice this never
-- actually blocks a server: assign requires an existing column, and only a
-- manager/host can create the first column, so a manager/host always
-- creates the session before any server could reach this path.
create function private.get_or_create_active_session(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
begin
  select id into v_session_id
  from public.service_sessions
  where location_id = p_location_id
    and service_date = p_service_date
    and meal_period = 'service'
    and status = 'active';

  if v_session_id is not null then
    return v_session_id;
  end if;

  insert into public.service_sessions (
    organization_id, location_id, service_date, meal_period, status,
    started_at, started_by
  )
  values (
    p_organization_id, p_location_id, p_service_date, 'service', 'active',
    now(), (select auth.uid())
  )
  returning id into v_session_id;

  insert into public.rotation_rounds (organization_id, service_session_id, sequence)
  values (p_organization_id, v_session_id, 1);

  return v_session_id;
exception
  when insufficient_privilege then
    raise exception 'No active floor for today yet -- ask a manager or host to add the first server column.';
end;
$$;

-- A round's first recorded value is what opens the next one -- not
-- waiting for every active column to fill it (see rotation-board.ts's
-- ensureTrailingRound doc comment for why the per-column version was a
-- real bug). Idempotent: safe to call after every mutating action, same
-- as the pure reducer calls ensureTrailingRound unconditionally at the
-- end of every applyBoardAction.
create function private.ensure_trailing_round(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_last_round_id bigint;
  v_last_sequence integer;
  v_has_any_value boolean;
begin
  select id, sequence into v_last_round_id, v_last_sequence
  from public.rotation_rounds
  where service_session_id = p_service_session_id
  order by sequence desc
  limit 1;

  if v_last_round_id is null then
    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, p_service_session_id, 1);
    return;
  end if;

  select exists (
    select 1 from public.table_rotation_entries
    where rotation_round_id = v_last_round_id
  ) into v_has_any_value;

  if v_has_any_value then
    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, p_service_session_id, v_last_sequence + 1);
  end if;
end;
$$;

-- A friendlier error than the raw RLS denial for the one condition every
-- board write can hit: today's tip pool is finalized. RLS still enforces
-- this independently (table_rotation_entries_write_any_member's own
-- not-exists clause) -- this is a clearer message on top of that, not a
-- replacement for it.
create function private.assert_board_not_locked(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locked boolean;
begin
  select exists (
    select 1
    from public.service_sessions session
    join public.tip_pools pool
      on pool.location_id = session.location_id
     and pool.service_date = session.service_date
     and pool.organization_id = session.organization_id
    where session.id = p_service_session_id
      and session.organization_id = p_organization_id
      and pool.status = 'finalized'
  ) into v_locked;

  if v_locked then
    raise exception 'Tips are finalized for today -- the board is locked until a manager or owner reopens it.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. One RPC per BoardAction variant. Each does the table_rotation_entries/
--    rotation_members/rotation_rounds write and its board_events row in one
--    transaction (the atomicity gap named in the Phase A audit), and is
--    SECURITY INVOKER so every underlying RLS policy still applies to the
--    caller's own identity -- these functions add friendlier errors and
--    the payload/inverse_payload bookkeeping, they do not grant anything
--    RLS wouldn't already grant directly.
-- ---------------------------------------------------------------------

create function public.board_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_status public.rotation_status;
  v_previous_label text;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.assert_board_not_locked(p_organization_id, v_session_id);

  select status into v_status
  from public.rotation_members
  where id = p_member_id and service_session_id = v_session_id;
  if v_status is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select table_label into v_previous_label
  from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, p_table_label, (select auth.uid()))
  on conflict (rotation_round_id, rotation_member_id)
  do update set
    table_label = excluded.table_label,
    assigned_by = excluded.assigned_by,
    assigned_at = now();

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, v_session_id, (select auth.uid()), 'assign',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'table_label', p_table_label),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous_label)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

create function public.board_add_column(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_server_profile_id uuid,
  p_position integer
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_member_id bigint;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.assert_board_not_locked(p_organization_id, v_session_id);

  -- Re-adding someone previously removed reactivates their existing row
  -- (their history under it stays attached) rather than trying to insert a
  -- second one, which unique (service_session_id, server_profile_id) would
  -- reject outright.
  insert into public.rotation_members (
    organization_id, service_session_id, server_profile_id, status, position
  )
  values (p_organization_id, v_session_id, p_server_profile_id, 'active', p_position)
  on conflict (service_session_id, server_profile_id)
  do update set status = 'active'
  returning id into v_member_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, v_session_id, (select auth.uid()), 'add_column',
    jsonb_build_object('member_id', v_member_id, 'server_profile_id', p_server_profile_id),
    jsonb_build_object('member_id', v_member_id)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_member_id;
end;
$$;

create function public.board_set_column_status(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint,
  p_status text -- 'active' | 'paused' | 'removed' -- the demo model's 3-value ColumnStatus
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_db_status public.rotation_status;
  v_event public.board_event_type;
  v_previous_status public.rotation_status;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  v_db_status := case p_status
    when 'active' then 'active'::public.rotation_status
    when 'paused' then 'paused'::public.rotation_status
    when 'removed' then 'unavailable'::public.rotation_status
    else null
  end;
  if v_db_status is null then
    raise exception 'Unknown column status: %', p_status;
  end if;

  v_event := case p_status
    when 'active' then 'resume_column'::public.board_event_type
    when 'paused' then 'pause_column'::public.board_event_type
    when 'removed' then 'remove_column'::public.board_event_type
  end;

  select status into v_previous_status
  from public.rotation_members
  where id = p_member_id and service_session_id = p_service_session_id;
  if v_previous_status is null then
    raise exception 'Column not found.';
  end if;

  update public.rotation_members
  set status = v_db_status, updated_at = now()
  where id = p_member_id and service_session_id = p_service_session_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), v_event,
    jsonb_build_object('member_id', p_member_id, 'status', p_status),
    jsonb_build_object('member_id', p_member_id, 'status', v_previous_status::text)
  );
end;
$$;

create function public.board_clear_row(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('member_id', rotation_member_id, 'table_label', table_label)), '[]'::jsonb)
  into v_cleared
  from public.table_rotation_entries
  where rotation_round_id = p_round_id;

  delete from public.table_rotation_entries where rotation_round_id = p_round_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_row',
    jsonb_build_object('round_id', p_round_id),
    jsonb_build_object('round_id', p_round_id, 'entries', v_cleared)
  );
end;
$$;

create function public.board_clear_column(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('round_id', rotation_round_id, 'table_label', table_label)), '[]'::jsonb)
  into v_cleared
  from public.table_rotation_entries entry
  join public.rotation_rounds round on round.id = entry.rotation_round_id
  where entry.rotation_member_id = p_member_id
    and round.service_session_id = p_service_session_id;

  delete from public.table_rotation_entries
  where rotation_member_id = p_member_id
    and rotation_round_id in (
      select id from public.rotation_rounds where service_session_id = p_service_session_id
    );

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_column',
    jsonb_build_object('member_id', p_member_id),
    jsonb_build_object('member_id', p_member_id, 'entries', v_cleared)
  );
end;
$$;

create function public.board_clear_board(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', round.id,
    'sequence', round.sequence,
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object('member_id', entry.rotation_member_id, 'table_label', entry.table_label)), '[]'::jsonb)
      from public.table_rotation_entries entry
      where entry.rotation_round_id = round.id
    )
  )), '[]'::jsonb)
  into v_snapshot
  from public.rotation_rounds round
  where round.service_session_id = p_service_session_id;

  delete from public.rotation_rounds where service_session_id = p_service_session_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_board',
    '{}'::jsonb,
    jsonb_build_object('rounds', v_snapshot)
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
end;
$$;

create function public.board_move_column(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint,
  p_direction text -- 'up' | 'down'
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target_id bigint;
  v_moving_position integer;
  v_target_position integer;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  -- Adjacency among *visible* columns only, matching rotation-board.ts's
  -- move-column: "unavailable" (removed) columns are excluded from the
  -- ordering, same as the pure reducer excludes status === "removed".
  with visible as (
    select id, position,
      row_number() over (order by position) as rank
    from public.rotation_members
    where service_session_id = p_service_session_id
      and status <> 'unavailable'
  ),
  target as (
    select v.id, v.position from visible v
    where v.rank = (
      select rank + case when p_direction = 'up' then -1 else 1 end
      from visible where id = p_member_id
    )
  )
  select id, position into v_target_id, v_target_position from target;

  if v_target_id is null then
    -- Already at the edge in that direction -- a no-op, not an error,
    -- matching applyBoardAction's move-column returning the unchanged
    -- board when targetIndex is out of range.
    return;
  end if;

  select position into v_moving_position
  from public.rotation_members
  where id = p_member_id;

  update public.rotation_members set position = v_target_position where id = p_member_id;
  update public.rotation_members set position = v_moving_position where id = v_target_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'move_column',
    jsonb_build_object('a_member_id', p_member_id, 'a_position', v_target_position, 'b_member_id', v_target_id, 'b_position', v_moving_position),
    jsonb_build_object('a_member_id', p_member_id, 'a_position', v_moving_position, 'b_member_id', v_target_id, 'b_position', v_target_position)
  );
end;
$$;

create function public.board_add_row(
  p_organization_id uuid,
  p_service_session_id bigint
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_sequence integer;
  v_round_id bigint;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(max(sequence), 0) + 1 into v_next_sequence
  from public.rotation_rounds
  where service_session_id = p_service_session_id;

  insert into public.rotation_rounds (organization_id, service_session_id, sequence)
  values (p_organization_id, p_service_session_id, v_next_sequence)
  returning id into v_round_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'add_row',
    jsonb_build_object('round_id', v_round_id, 'sequence', v_next_sequence),
    jsonb_build_object('round_id', v_round_id)
  );

  return v_round_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Undo/redo: one shared server-side timeline per session (not a
--    per-browser-tab stack like demo mode -- the only design that makes
--    sense once the board is shared across devices). board_events.
--    undone_at is exactly what ARCHITECTURE.md already documented this
--    schema for ("Supabase mode persists equivalent inverse events").
--    A redo is only valid until a *new* forward action has been recorded
--    since it was undone -- checked by comparing undone_at against the
--    latest non-undone event's created_at, rather than deleting undone
--    rows (board_events keeps every row; only undone_at is ever mutated).
-- ---------------------------------------------------------------------

create function public.board_undo(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event record;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select * into v_event
  from public.board_events
  where service_session_id = p_service_session_id
    and undone_at is null
    and event_type <> 'undo' and event_type <> 'redo'
  order by created_at desc, id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Nothing to undo.';
  end if;

  case v_event.event_type
    when 'assign' then
      if (v_event.inverse_payload->>'table_label') is null then
        delete from public.table_rotation_entries
        where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
          and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
      else
        update public.table_rotation_entries
        set table_label = v_event.inverse_payload->>'table_label', assigned_by = (select auth.uid()), assigned_at = now()
        where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
          and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
      end if;
    when 'add_column' then
      -- No DELETE grant on rotation_members, and deleting would cascade
      -- away any entries already recorded under it -- the closest
      -- reversal available is putting the column back to "not on the
      -- board," the same visible effect as removing it.
      update public.rotation_members set status = 'unavailable'
      where id = (v_event.inverse_payload->>'member_id')::bigint;
    when 'pause_column', 'resume_column', 'remove_column' then
      update public.rotation_members
      set status = (v_event.inverse_payload->>'status')::public.rotation_status
      where id = (v_event.inverse_payload->>'member_id')::bigint;
    when 'clear_row' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
      select p_organization_id, (v_event.inverse_payload->>'round_id')::bigint, (entry->>'member_id')::bigint, entry->>'table_label', (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'entries') as entry;
    when 'clear_column' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
      select p_organization_id, (entry->>'round_id')::bigint, (v_event.inverse_payload->>'member_id')::bigint, entry->>'table_label', (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'entries') as entry;
    when 'clear_board' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      select (round->>'round_id')::bigint, p_organization_id, p_service_session_id, (round->>'sequence')::integer
      from jsonb_array_elements(v_event.inverse_payload->'rounds') as round;
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
      select p_organization_id, (round->>'round_id')::bigint, (entry->>'member_id')::bigint, entry->>'table_label', (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'rounds') as round,
           jsonb_array_elements(round->'entries') as entry;
    when 'move_column' then
      update public.rotation_members set position = (v_event.inverse_payload->>'a_position')::integer where id = (v_event.inverse_payload->>'a_member_id')::bigint;
      update public.rotation_members set position = (v_event.inverse_payload->>'b_position')::integer where id = (v_event.inverse_payload->>'b_member_id')::bigint;
    when 'add_row' then
      delete from public.rotation_rounds where id = (v_event.inverse_payload->>'round_id')::bigint;
    else
      raise exception 'Undo not supported for event type %', v_event.event_type;
  end case;

  update public.board_events set undone_at = now() where id = v_event.id;

  -- board_event_type has carried 'undo' as its own logged kind since the
  -- very first migration -- this is who undid what, a separate fact from
  -- the original event now being marked undone.
  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'undo',
    jsonb_build_object('undone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;

create function public.board_redo(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event record;
  v_latest_forward timestamptz;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select max(created_at) into v_latest_forward
  from public.board_events
  where service_session_id = p_service_session_id and undone_at is null;

  select * into v_event
  from public.board_events
  where service_session_id = p_service_session_id
    and undone_at is not null
    and (v_latest_forward is null or undone_at > v_latest_forward)
  order by undone_at desc, id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Nothing to redo.';
  end if;

  case v_event.event_type
    when 'assign' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
      values (p_organization_id, (v_event.payload->>'round_id')::bigint, (v_event.payload->>'member_id')::bigint, v_event.payload->>'table_label', (select auth.uid()))
      on conflict (rotation_round_id, rotation_member_id)
      do update set table_label = excluded.table_label, assigned_by = excluded.assigned_by, assigned_at = now();
    when 'add_column' then
      update public.rotation_members set status = 'active' where id = (v_event.payload->>'member_id')::bigint;
    when 'pause_column', 'resume_column', 'remove_column' then
      update public.rotation_members set status = (v_event.payload->>'status')::public.rotation_status where id = (v_event.payload->>'member_id')::bigint;
    when 'clear_row' then
      delete from public.table_rotation_entries where rotation_round_id = (v_event.payload->>'round_id')::bigint;
    when 'clear_column' then
      delete from public.table_rotation_entries
      where rotation_member_id = (v_event.payload->>'member_id')::bigint
        and rotation_round_id in (select id from public.rotation_rounds where service_session_id = p_service_session_id);
    when 'clear_board' then
      delete from public.rotation_rounds where service_session_id = p_service_session_id;
      perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
    when 'move_column' then
      update public.rotation_members set position = (v_event.payload->>'a_position')::integer where id = (v_event.payload->>'a_member_id')::bigint;
      update public.rotation_members set position = (v_event.payload->>'b_position')::integer where id = (v_event.payload->>'b_member_id')::bigint;
    when 'add_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values ((v_event.payload->>'round_id')::bigint, p_organization_id, p_service_session_id, (v_event.payload->>'sequence')::integer);
    else
      raise exception 'Redo not supported for event type %', v_event.event_type;
  end case;

  update public.board_events set undone_at = null where id = v_event.id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'redo',
    jsonb_build_object('redone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Grants: SECURITY INVOKER means these still rely on the caller's own
--    RLS-checked privileges for every table write inside them, same as
--    recalculate_tip_pool -- execute is safe to grant broadly.
-- ---------------------------------------------------------------------
revoke all on function private.get_or_create_active_session(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.ensure_trailing_round(uuid, bigint) from public, anon, authenticated;
revoke all on function private.assert_board_not_locked(uuid, bigint) from public, anon, authenticated;

revoke all on function public.board_assign(uuid, uuid, date, bigint, bigint, text) from public, anon;
revoke all on function public.board_add_column(uuid, uuid, date, uuid, integer) from public, anon;
revoke all on function public.board_set_column_status(uuid, bigint, bigint, text) from public, anon;
revoke all on function public.board_clear_row(uuid, bigint, bigint) from public, anon;
revoke all on function public.board_clear_column(uuid, bigint, bigint) from public, anon;
revoke all on function public.board_clear_board(uuid, bigint) from public, anon;
revoke all on function public.board_move_column(uuid, bigint, bigint, text) from public, anon;
revoke all on function public.board_add_row(uuid, bigint) from public, anon;
revoke all on function public.board_undo(uuid, bigint) from public, anon;
revoke all on function public.board_redo(uuid, bigint) from public, anon;

grant execute on function public.board_assign(uuid, uuid, date, bigint, bigint, text) to authenticated;
grant execute on function public.board_add_column(uuid, uuid, date, uuid, integer) to authenticated;
grant execute on function public.board_set_column_status(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.board_clear_row(uuid, bigint, bigint) to authenticated;
grant execute on function public.board_clear_column(uuid, bigint, bigint) to authenticated;
grant execute on function public.board_clear_board(uuid, bigint) to authenticated;
grant execute on function public.board_move_column(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.board_add_row(uuid, bigint) to authenticated;
grant execute on function public.board_undo(uuid, bigint) to authenticated;
grant execute on function public.board_redo(uuid, bigint) to authenticated;
