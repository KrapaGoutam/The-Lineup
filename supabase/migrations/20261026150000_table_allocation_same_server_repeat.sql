-- Same-server repeat table (#166) -- server-authoritative.
--
-- Bug. A server who already holds an ACTIVE table (Sidhu: T2, turn 1) and later
-- reaches another legitimate turn that is given the same physical table was
-- stopped by "Table T2 is already assigned to this server." (PT409 same_server):
-- a dead end, because the previous lifecycle can only be ended by hand first.
--
-- Turn identity (audited, nothing new invented). A rotation TURN is one board
-- cell: (rotation_rounds.id, rotation_members.id). rotation_rounds.sequence
-- orders a server's turns; rotation_entries is unique per cell. The DATABASE
-- therefore distinguishes the two cases the owner described by comparing the
-- TARGET cell with the cell that currently holds the table:
--
--   A. same cell (retry / in-place edit / double submit)
--        -> the entry already says exactly this; nothing to do. board_assign
--           returns without writing or emitting an event (idempotent).
--   B. the same server holds the table in an EARLIER turn (round.sequence <
--      target round.sequence)  -> legitimate later turn
--        -> PT409 kind 'same_server_repeat' (structured, carries the previous
--           assignment). The client shows "End Previous + Assign / Cancel".
--           Only the explicit confirmation (board_end_previous_and_assign)
--           mutates anything.
--   C. the same server holds it in the same or a LATER turn than the target
--        -> still PT409 kind 'same_server' (blocked, no mutation): filling an
--           earlier hole with a table the server holds in a later turn is not a
--           "later turn".
--
-- No client timer, no row-index guess, no client-supplied turn number: the
-- target round id is validated against the session and its sequence is read
-- here.
--
-- End Previous + Assign is ONE transaction under the session lock
-- (private.begin_board_write): the previous active entries are ENDED (never
-- deleted; ended_at / ended_by recorded), the occupancy trigger releases their
-- physical claims, then the new entry is written and claims the table. There is
-- no moment with two active claims, and the section_assignments partial unique
-- index would reject one anyway. A combined previous assignment ("T2 + T3") is
-- one lifecycle unit and is ended as a whole.
--
-- Audit / Undo / Redo. The new 'assign' event lists the ended previous entries
-- in `displaced` (the SAME field cross-server End + Assign already uses), so the
-- existing board_undo / board_redo branches reactivate / re-end them with no
-- change: Undo frees the new claim first, then reactivates the previous entry.
-- `repeat: true` lets Recent Activity say what happened.
--
-- Contract shape (forward-only, no table/column changes, no data rewrite):
--   * private.assign_table(...): the former board_assign body + p_end_previous.
--   * public.board_assign(8 args): unchanged signature and grants, now a thin
--     wrapper (p_end_previous = false) -- no overload churn, old clients keep
--     working; it only gains the structured 'same_server_repeat' detail and the
--     idempotent same-cell return.
--   * public.board_end_previous_and_assign(8 args): same arguments, the explicit
--     confirmation.
--
-- Authorization is unchanged: auth.uid(), active floor-team membership,
-- tenant/session validation, historical-date lock (private.begin_board_write),
-- fixed empty search_path. The new private helpers are not executable by
-- public, anon or authenticated.

-- ---------------------------------------------------------------------
-- 1. End the server's own previous entries (whole entries) and report them
--    in the {round_id, member_id} shape undo / redo already replay.
-- ---------------------------------------------------------------------
create or replace function private.end_own_previous_entries(
  p_service_session_id bigint,
  p_own jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ended jsonb := '[]'::jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_own, '[]'::jsonb))
  loop
    update public.table_rotation_entries
    set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
    where service_session_id = p_service_session_id
      and rotation_round_id = (v_item->>'round_id')::bigint
      and rotation_member_id = (v_item->>'member_id')::bigint
      and status = 'active';

    v_ended := v_ended || jsonb_build_array(
      jsonb_build_object('round_id', v_item->'round_id', 'member_id', v_item->'member_id')
    );
  end loop;
  return v_ended;
end;
$$;

revoke all on function private.end_own_previous_entries(bigint, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. The shared implementation.
-- ---------------------------------------------------------------------
create or replace function private.assign_table(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean,
  p_end_whole_assignment boolean,
  p_end_previous boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_location uuid;
  v_label text;
  v_wanted text[];
  v_previous record;
  v_target_sequence integer;
  v_own jsonb;
  v_own_earlier boolean;
  v_repeat boolean := false;
  v_displaced jsonb := '[]'::jsonb;
  v_holders jsonb;
  v_contested text;
begin
  if nullif(trim(coalesce(p_table_label, '')), '') is null then
    raise exception 'Enter a table.';
  end if;

  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  v_location := private.begin_board_write(p_organization_id, v_session_id);

  -- Canonical identity BEFORE any conflict / duplicate / displacement /
  -- insert / event / occupancy logic: "2" is "T2" when T2 is registered here.
  v_label := private.canonical_table_label(v_location, p_table_label);
  if v_label is null then
    raise exception 'Enter a table.';
  end if;
  v_wanted := private.canonical_label_parts(v_location, v_label);

  perform private.assert_round_in_session(p_round_id, v_session_id);
  if private.member_status_in_session(p_member_id, v_session_id) is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select e.table_label, e.status, e.assigned_by, e.assigned_at into v_previous
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id and e.rotation_member_id = p_member_id;

  if v_previous.status is not null and v_previous.status <> 'active' then
    raise exception 'That cell already has a % entry -- clear it before assigning a new table.', v_previous.status;
  end if;

  -- Case A: this very turn already says exactly this (retry / double submit).
  -- Nothing to write, no event, no new Undo step.
  if v_previous.status = 'active' and v_previous.table_label = v_label then
    return v_session_id;
  end if;

  -- The server's OTHER active entries that hold any wanted table, with the
  -- turn order needed to tell a later turn from an earlier one.
  select r.sequence into v_target_sequence
  from public.rotation_rounds r
  where r.id = p_round_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'member_id', e.rotation_member_id,
      'round_id', e.rotation_round_id,
      'assignment_label', private.canonical_table_label(v_location, e.table_label)
    ) order by pr.sequence, e.id), '[]'::jsonb),
    coalesce(bool_and(pr.sequence < v_target_sequence), false)
  into v_own, v_own_earlier
  from public.table_rotation_entries e
  join public.rotation_rounds pr on pr.id = e.rotation_round_id
  where e.service_session_id = v_session_id
    and e.status = 'active'
    and e.rotation_member_id = p_member_id
    and e.rotation_round_id <> p_round_id
    and private.canonical_label_parts(v_location, e.table_label) && v_wanted;

  if jsonb_array_length(v_own) > 0 then
    -- Case C: not a later turn -> blocked, no mutation, no confirmation offered.
    if not v_own_earlier then
      raise exception 'Table % is already assigned to this server.', v_label
        using errcode = 'PT409',
              detail = jsonb_build_object('kind', 'same_server', 'label', v_label, 'holders', '[]'::jsonb)::text;
    end if;

    -- Case B: a later turn. Needs the explicit confirmation.
    if not coalesce(p_end_previous, false) then
      raise exception 'Table % is already assigned to this server.', v_label
        using errcode = 'PT409',
              detail = jsonb_build_object('kind', 'same_server_repeat', 'label', v_label, 'holders', v_own)::text;
    end if;

    v_repeat := true;
    v_displaced := private.end_own_previous_entries(v_session_id, v_own);
  end if;

  if coalesce(p_confirm_transfer, false) then
    -- Atomic End + Assign: the holder(s) are ended in this same transaction,
    -- under the session lock taken above.
    v_displaced := v_displaced || private.displace_conflicting_entries(
      v_session_id, v_label, p_member_id, coalesce(p_end_whole_assignment, false)
    );
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', e.rotation_member_id,
      'round_id', e.rotation_round_id,
      'assignment_label', private.canonical_table_label(v_location, e.table_label)
    ) order by e.id), '[]'::jsonb)
    into v_holders
    from public.table_rotation_entries e
    where e.service_session_id = v_session_id
      and e.status = 'active'
      and e.rotation_member_id <> p_member_id
      and private.canonical_label_parts(v_location, e.table_label) && v_wanted;

    if jsonb_array_length(v_holders) > 0 then
      select w.p into v_contested
      from unnest(v_wanted) with ordinality as w(p, ord)
      where exists (
        select 1 from public.table_rotation_entries e
        where e.service_session_id = v_session_id
          and e.status = 'active'
          and e.rotation_member_id <> p_member_id
          and private.canonical_label_parts(v_location, e.table_label) @> array[w.p]
      )
      order by w.ord
      limit 1;
      -- Raising rolls the whole call back, including any previous entries
      -- ended above: a half-confirmed repeat never leaves a gap.
      raise exception 'Table % is already assigned to another active server on this board.', v_contested
        using errcode = 'PT409',
              detail = jsonb_build_object('kind', 'held', 'label', v_label, 'holders', v_holders)::text;
    end if;
  end if;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, v_label, 'active', (select auth.uid()))
  on conflict (rotation_round_id, rotation_member_id)
  do update set
    table_label = excluded.table_label,
    assigned_by = excluded.assigned_by,
    assigned_at = now(),
    ended_at = null,
    ended_by = null;

  perform private.emit_board_event(
    p_organization_id, v_session_id, 'assign',
    jsonb_build_object(
      'round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_label,
      'displaced', v_displaced, 'repeat', v_repeat
    ),
    jsonb_build_object(
      'round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous.table_label,
      'prev_assigned_by', v_previous.assigned_by, 'prev_assigned_at', v_previous.assigned_at,
      'displaced', v_displaced, 'repeat', v_repeat
    )
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

revoke all on function private.assign_table(uuid, uuid, date, bigint, bigint, text, boolean, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Public surface.
-- ---------------------------------------------------------------------
create or replace function public.board_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean default false,
  p_end_whole_assignment boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.assign_table(
    p_organization_id, p_location_id, p_service_date, p_round_id, p_member_id,
    p_table_label, p_confirm_transfer, p_end_whole_assignment, false
  );
end;
$$;

revoke all on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) from public, anon;
grant execute on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) to authenticated;

-- The explicit confirmation of a same-server repeat. Without an earlier-turn
-- hold by this same server it behaves exactly like board_assign.
create or replace function public.board_end_previous_and_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean default false,
  p_end_whole_assignment boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.assign_table(
    p_organization_id, p_location_id, p_service_date, p_round_id, p_member_id,
    p_table_label, p_confirm_transfer, p_end_whole_assignment, true
  );
end;
$$;

revoke all on function public.board_end_previous_and_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) from public, anon;
grant execute on function public.board_end_previous_and_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) to authenticated;
