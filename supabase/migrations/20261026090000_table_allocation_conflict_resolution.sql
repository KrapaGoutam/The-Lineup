-- Table Allocation cross-view integrity (X2) -- server-authoritative
-- occupied-table conflicts and whole-assignment End + Assign.
--
-- What changes (forward-only; no table/column changes, no data backfill):
--
--   1. private.label_parts(text): the exact, trimmed, non-empty parts of a
--      (possibly combined) label. No case folding, no prefix handling -- "1" and
--      "T1" are different labels, full stop.
--
--   2. private.displace_conflicting_entries is replaced. It now matches the
--      session's other ACTIVE entries by exact label part, so it covers free-text
--      (unregistered) labels as well as registered tables, and it can end a
--      holder's WHOLE combined assignment even when that assignment is wider
--      than the label being claimed (p_end_whole). Without p_end_whole a wider
--      holder is still refused, exactly as before.
--
--   3. public.board_assign gains p_end_whole_assignment (default false) and
--      does the occupancy check itself, before any write, under the session
--      row lock that begin_board_write already holds:
--        * the same server already holds one of the tables in another cell
--          -> PT409 kind "same_server" (no duplicate, no mutation)
--        * another server holds a table and the caller did not confirm
--          -> PT409 kind "held" with the holders (member id, round id, whole
--          assignment label) so a stale client can show the same decision dialog
--          the live one does
--      PT409 is a PostgREST status SQLSTATE (HTTP 409). The detail JSON carries
--      ids and labels only -- no names, no PII.
--      End + Assign is this single call with p_confirm_transfer = true: the
--      holder's entry(ies) are ENDED (history kept) and the new ACTIVE entry is
--      inserted in the same transaction, so no other writer can take the table
--      between END and ASSIGN. It emits the existing 'assign' event with a
--      'displaced' list, which board_undo / board_redo already replay.
--
--   Transfer is unchanged (public.board_transfer).
--
-- Authorization is unchanged: auth.uid(), active membership via
-- private.begin_board_write, tenant/session validation, fixed search_path.

-- ---------------------------------------------------------------------
-- 1. Exact label parts.
-- ---------------------------------------------------------------------
create or replace function private.label_parts(p_label text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(trim(part)), '{}'::text[])
  from unnest(string_to_array(coalesce(p_label, ''), '+')) as part
  where length(trim(part)) > 0;
$$;

revoke all on function private.label_parts(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Displacement: exact-label, registered or not, optionally whole-assignment.
-- ---------------------------------------------------------------------
create or replace function private.displace_conflicting_entries(
  p_service_session_id bigint,
  p_label text,
  p_member_id bigint,
  p_end_whole boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted text[] := private.label_parts(p_label);
  v_entry record;
  v_displaced jsonb := '[]'::jsonb;
begin
  if cardinality(v_wanted) = 0 then
    return v_displaced;
  end if;

  for v_entry in
    select e.id, e.rotation_round_id, e.rotation_member_id, e.table_label
    from public.table_rotation_entries e
    where e.service_session_id = p_service_session_id
      and e.status = 'active'
      and e.rotation_member_id <> p_member_id
      and private.label_parts(e.table_label) && v_wanted
    order by e.id
  loop
    if not coalesce(p_end_whole, false)
       and not (private.label_parts(v_entry.table_label) <@ v_wanted) then
      raise exception
        'Table % is part of a combined assignment (%) held by another server -- end or transfer that whole assignment first.',
        trim(p_label), v_entry.table_label;
    end if;

    update public.table_rotation_entries
    set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
    where id = v_entry.id;

    v_displaced := v_displaced || jsonb_build_array(
      jsonb_build_object('round_id', v_entry.rotation_round_id, 'member_id', v_entry.rotation_member_id)
    );
  end loop;

  return v_displaced;
end;
$$;

revoke all on function private.displace_conflicting_entries(bigint, text, bigint, boolean) from public, anon, authenticated;

drop function if exists private.displace_conflicting_entries(bigint, uuid, text, bigint);

-- ---------------------------------------------------------------------
-- 3. board_assign: server-authoritative conflicts + whole-assignment End.
-- ---------------------------------------------------------------------
drop function if exists public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean);

create function public.board_assign(
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
declare
  v_session_id bigint;
  v_location uuid;
  v_label text := nullif(trim(coalesce(p_table_label, '')), '');
  v_wanted text[];
  v_previous record;
  v_displaced jsonb := '[]'::jsonb;
  v_holders jsonb;
  v_contested text;
begin
  if v_label is null then
    raise exception 'Enter a table.';
  end if;
  v_wanted := private.label_parts(v_label);

  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  v_location := private.begin_board_write(p_organization_id, v_session_id);

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

  -- A server never holds the same table twice (this cell's own entry is being
  -- edited in place, so it is excluded).
  if exists (
    select 1 from public.table_rotation_entries e
    where e.service_session_id = v_session_id
      and e.status = 'active'
      and e.rotation_member_id = p_member_id
      and e.rotation_round_id <> p_round_id
      and private.label_parts(e.table_label) && v_wanted
  ) then
    raise exception 'Table % is already assigned to this server.', v_label
      using errcode = 'PT409',
            detail = jsonb_build_object('kind', 'same_server', 'label', v_label, 'holders', '[]'::jsonb)::text;
  end if;

  if coalesce(p_confirm_transfer, false) then
    -- Atomic End + Assign: the holder(s) are ended in this same transaction,
    -- under the session lock taken above.
    v_displaced := private.displace_conflicting_entries(
      v_session_id, v_label, p_member_id, coalesce(p_end_whole_assignment, false)
    );
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', e.rotation_member_id,
      'round_id', e.rotation_round_id,
      'assignment_label', e.table_label
    ) order by e.id), '[]'::jsonb)
    into v_holders
    from public.table_rotation_entries e
    where e.service_session_id = v_session_id
      and e.status = 'active'
      and e.rotation_member_id <> p_member_id
      and private.label_parts(e.table_label) && v_wanted;

    if jsonb_array_length(v_holders) > 0 then
      select w.p into v_contested
      from unnest(v_wanted) with ordinality as w(p, ord)
      where exists (
        select 1 from public.table_rotation_entries e
        where e.service_session_id = v_session_id
          and e.status = 'active'
          and e.rotation_member_id <> p_member_id
          and private.label_parts(e.table_label) @> array[w.p]
      )
      order by w.ord
      limit 1;
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
      'displaced', v_displaced
    ),
    jsonb_build_object(
      'round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous.table_label,
      'prev_assigned_by', v_previous.assigned_by, 'prev_assigned_at', v_previous.assigned_at,
      'displaced', v_displaced
    )
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

revoke all on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) from public, anon;
grant execute on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean, boolean) to authenticated;
