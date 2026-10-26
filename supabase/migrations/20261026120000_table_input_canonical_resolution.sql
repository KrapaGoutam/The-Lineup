-- Canonical table input resolution (#157) -- server-authoritative.
--
-- Contract change. 20261026090000 kept the Grid entry "1" and the registered
-- physical table "T1" as different identities. Owner testing clarified the
-- required restaurant workflow: typing "1" where the location has a registered
-- table "T1" MUST behave exactly like choosing T1 from Floor or Picker.
--
-- What changes (forward-only; no table/column changes, no data rewrite):
--
--   1. private.resolve_table_input(location, text): the ONE resolver.
--        a. exact registered label (trimmed, case-sensitive, active, same
--           location) wins -- "T1" -> T1, and a table genuinely registered as
--           "1" would stay "1";
--        b. else a digits-only input resolves to the registered "T" || digits
--           ("1" -> T1, "19" -> T19). Leading zeros are NOT collapsed: "01" is
--           looked up as "T01", never as T1;
--        c. else the trimmed text is kept as a free-text label ("Patio A",
--           "99" when there is no T99).
--      Same location only. No alias table.
--
--   2. private.canonical_label_parts / private.canonical_table_label resolve
--      every part of a combined label independently ("1 + 2" -> "T1 + T2").
--
--   3. private.sync_table_occupancy now resolves each part with the SAME
--      resolver, so the physical ledger and the board label can never drift.
--
--   4. private.displace_conflicting_entries and public.board_assign canonicalize
--      BEFORE any conflict, same-server, displacement, insert, event or
--      occupancy logic, and compare CANONICAL identities on both sides. A stale
--      client (or a direct RPC call) sending "1" therefore gets the same PT409
--      as one sending "T1", and can never create a second free-text "1".
--
--   5. public.board_end_and_assign canonicalizes the label it stores.
--
-- Existing rows are untouched. A historical or active free-text "1" keeps its
-- text; where T1 is registered it now resolves to T1 for conflict and ledger
-- purposes the next time it is written. Before deploying to a real location,
-- run the release-readiness query in
-- docs/features/table-input-canonical-resolution/PLAN.md.
--
-- Authorization is unchanged: auth.uid(), active membership via
-- private.begin_board_write, tenant/session validation, fixed search_path. The
-- new helpers are private, SECURITY DEFINER with an empty search_path, and are
-- not executable by public, anon or authenticated.

-- ---------------------------------------------------------------------
-- 1. The resolver.
-- ---------------------------------------------------------------------
create or replace function private.resolve_table_input(p_location_id uuid, p_input text)
returns table (
  input_text text,
  canonical_label text,
  dining_table_id bigint,
  registered boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select nullif(trim(coalesce(p_input, '')), '') as v
  ),
  exact_match as (
    select d.id, d.label
    from t
    join public.dining_tables d
      on d.location_id = p_location_id and d.active and d.label = t.v
  ),
  numeric_match as (
    select d.id, d.label
    from t
    join public.dining_tables d
      on d.location_id = p_location_id and d.active and d.label = 'T' || t.v
    where t.v ~ '^[0-9]+$'
      and not exists (select 1 from exact_match)
  )
  select
    t.v,
    coalesce(e.label, n.label, t.v),
    coalesce(e.id, n.id),
    coalesce(e.id, n.id) is not null
  from t
  left join exact_match e on true
  left join numeric_match n on true;
$$;

revoke all on function private.resolve_table_input(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Combined labels: every part resolved on its own, first-seen order,
--    duplicates collapsed ("1 + T1" is one table, not two).
-- ---------------------------------------------------------------------
create or replace function private.canonical_label_parts(p_location_id uuid, p_label text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.label order by c.first_ord), '{}'::text[])
  from (
    select r.canonical_label as label, min(p.ord) as first_ord
    from unnest(private.label_parts(p_label)) with ordinality as p(part, ord)
    cross join lateral private.resolve_table_input(p_location_id, p.part) r
    where r.canonical_label is not null
    group by r.canonical_label
  ) c;
$$;

revoke all on function private.canonical_label_parts(uuid, text) from public, anon, authenticated;

create or replace function private.canonical_table_label(p_location_id uuid, p_label text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(array_to_string(private.canonical_label_parts(p_location_id, p_label), ' + '), '');
$$;

revoke all on function private.canonical_table_label(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Occupancy trigger: the same resolver as board_assign.
-- ---------------------------------------------------------------------
create or replace function private.sync_table_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_part text;
  v_dining_table_id bigint;
  v_claimed bigint[] := '{}';
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.table_label is not distinct from old.table_label then
    return new;
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    delete from public.section_assignments
    where table_rotation_entry_id = old.id and released_at is null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  if new.table_label is null or length(trim(new.table_label)) = 0 then
    return new;
  end if;

  select ss.location_id into v_location
  from public.service_sessions ss
  where ss.id = new.service_session_id;

  for v_part in select unnest(private.label_parts(new.table_label))
  loop
    select r.dining_table_id into v_dining_table_id
    from private.resolve_table_input(v_location, v_part) r;

    -- Free text (not a registered table) takes no physical claim; a table
    -- named twice in one label ("1 + T1") is claimed once.
    if v_dining_table_id is null or v_dining_table_id = any (v_claimed) then
      continue;
    end if;
    v_claimed := v_claimed || v_dining_table_id;

    begin
      insert into public.section_assignments (
        organization_id, service_session_id, location_id, dining_table_id,
        server_profile_id, rotation_member_id, table_rotation_entry_id
      )
      select new.organization_id, new.service_session_id, v_location, v_dining_table_id,
        rm.server_profile_id, new.rotation_member_id, new.id
      from public.rotation_members rm
      where rm.id = new.rotation_member_id;
    exception
      when unique_violation then
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
    end;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4a. Displacement: canonical identity on both sides.
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
  v_location uuid;
  v_wanted text[];
  v_entry record;
  v_displaced jsonb := '[]'::jsonb;
begin
  select ss.location_id into v_location
  from public.service_sessions ss
  where ss.id = p_service_session_id;

  v_wanted := private.canonical_label_parts(v_location, p_label);
  if cardinality(v_wanted) = 0 then
    return v_displaced;
  end if;

  for v_entry in
    select e.id, e.rotation_round_id, e.rotation_member_id, e.table_label
    from public.table_rotation_entries e
    where e.service_session_id = p_service_session_id
      and e.status = 'active'
      and e.rotation_member_id <> p_member_id
      and private.canonical_label_parts(v_location, e.table_label) && v_wanted
    order by e.id
  loop
    if not coalesce(p_end_whole, false)
       and not (private.canonical_label_parts(v_location, v_entry.table_label) <@ v_wanted) then
      raise exception
        'Table % is part of a combined assignment (%) held by another server -- end or transfer that whole assignment first.',
        trim(p_label), private.canonical_table_label(v_location, v_entry.table_label);
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

-- ---------------------------------------------------------------------
-- 4b. board_assign: resolve first, then everything else on the canonical label.
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
declare
  v_session_id bigint;
  v_location uuid;
  v_label text;
  v_wanted text[];
  v_previous record;
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
  -- insert / event / occupancy logic: "1" is "T1" when T1 is registered here.
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

  -- A server never holds the same table twice (this cell's own entry is being
  -- edited in place, so it is excluded).
  if exists (
    select 1 from public.table_rotation_entries e
    where e.service_session_id = v_session_id
      and e.status = 'active'
      and e.rotation_member_id = p_member_id
      and e.rotation_round_id <> p_round_id
      and private.canonical_label_parts(v_location, e.table_label) && v_wanted
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

-- ---------------------------------------------------------------------
-- 5. board_end_and_assign: store the canonical label.
-- ---------------------------------------------------------------------
create or replace function public.board_end_and_assign(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_end_round_ids bigint[],
  p_member_id bigint,
  p_table_label text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_label text;
  v_active_count int;
  v_dest_round_id bigint;
begin
  if nullif(trim(coalesce(p_table_label, '')), '') is null then
    raise exception 'Enter a table.';
  end if;

  v_location := private.begin_board_write(p_organization_id, p_service_session_id);

  v_label := private.canonical_table_label(v_location, p_table_label);
  if v_label is null then
    raise exception 'Enter a table.';
  end if;

  if private.member_status_in_session(p_member_id, p_service_session_id) is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  if p_end_round_ids is null or array_length(p_end_round_ids, 1) is null then
    raise exception 'Select at least one table to end.';
  end if;

  select count(*) into v_active_count
  from public.table_rotation_entries
  where service_session_id = p_service_session_id
    and rotation_round_id = any (p_end_round_ids)
    and rotation_member_id = p_member_id
    and status = 'active';

  if v_active_count <> array_length(p_end_round_ids, 1) then
    raise exception 'One or more selected tables are no longer active for this server -- refresh and try again.';
  end if;

  select r.id into v_dest_round_id
  from public.rotation_rounds r
  where r.service_session_id = p_service_session_id
    and not exists (
      select 1 from public.table_rotation_entries e
      where e.rotation_round_id = r.id and e.rotation_member_id = p_member_id
    )
  order by r.sequence asc
  limit 1;

  if v_dest_round_id is null then
    perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
    select r.id into v_dest_round_id
    from public.rotation_rounds r
    where r.service_session_id = p_service_session_id
      and not exists (
        select 1 from public.table_rotation_entries e
        where e.rotation_round_id = r.id and e.rotation_member_id = p_member_id
      )
    order by r.sequence asc
    limit 1;
  end if;

  if v_dest_round_id is null then
    raise exception 'No available row to assign into.';
  end if;

  update public.table_rotation_entries
  set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
  where service_session_id = p_service_session_id
    and rotation_round_id = any (p_end_round_ids)
    and rotation_member_id = p_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, v_dest_round_id, p_member_id, v_label, 'active', (select auth.uid()));

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'end_and_assign',
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', v_label
    ),
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', v_label
    )
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
  return v_dest_round_id;
end;
$$;
