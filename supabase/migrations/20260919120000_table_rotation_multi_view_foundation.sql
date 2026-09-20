-- Table Rotation Multi-View: occupancy integrity, auto-row reconciliation,
-- board_delete_row, and the Staff active-floor-operations permission
-- expansion. See docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md.
--
-- DEVIATION FROM THE FROZEN CONTRACT (documented per AGENT_HANDOFF.md's own
-- rule for handling this): the contract specified two brand-new tables,
-- table_occupancy + table_occupancy_members. Implementing this migration
-- found that public.section_assignments already exists (initial schema),
-- already shaped almost exactly right for this purpose (organization_id,
-- service_session_id, dining_table_id, server_profile_id, unique per
-- table per session), already has correct RLS-select and Realtime
-- publication membership, and is confirmed dead code (no application
-- read/write path touches it -- Phase 0 investigation, reconfirmed here).
-- Extending it is strictly less schema duplication than adding two new
-- tables that would duplicate its purpose, so this migration extends
-- section_assignments instead of creating table_occupancy/
-- table_occupancy_members. A combined-table assignment ("12 + 13") is
-- simply two section_assignments rows sharing one table_rotation_entry_id
-- -- no separate junction table is needed for that either.

-- ---------------------------------------------------------------------
-- 1. table_rotation_entries needs a tenant-composite unique key so
--    section_assignments can FK to it the same way every other tenant
--    table in this schema does.
-- ---------------------------------------------------------------------
alter table public.table_rotation_entries
  add constraint table_rotation_entries_id_org_key unique (id, organization_id);

-- ---------------------------------------------------------------------
-- 2. section_assignments becomes the authoritative "who currently holds
--    this physical table" ledger, maintained *only* by the trigger in
--    section 3 below -- not directly writable by any client role. This
--    is why the old section_assignments_operate_service policy (section 5)
--    is dropped rather than widened: the previous design assumed a human
--    would edit floor assignments directly; the new design derives this
--    table entirely from table_rotation_entries writes (which already go
--    through board_assign/board_clear_*, all already RLS/RPC-guarded).
-- ---------------------------------------------------------------------
alter table public.section_assignments
  add column rotation_member_id bigint,
  add column table_rotation_entry_id bigint,
  add column released_at timestamptz;

alter table public.section_assignments
  add constraint section_assignments_rotation_member_fk
    foreign key (rotation_member_id, organization_id)
    references public.rotation_members (id, organization_id) on delete cascade,
  add constraint section_assignments_entry_fk
    foreign key (table_rotation_entry_id, organization_id)
    references public.table_rotation_entries (id, organization_id) on delete cascade;

-- Replace the old always-unique constraint (one row per table per session,
-- forever) with a partial unique index: at most one *active* (unreleased)
-- claim per table per session. A table can be claimed, released, and
-- reclaimed many times across a shift -- that's ordinary turnover, not a
-- conflict.
alter table public.section_assignments
  drop constraint section_assignments_service_session_id_dining_table_id_key;

create unique index section_assignments_active_table_uq
  on public.section_assignments (service_session_id, dining_table_id)
  where released_at is null;

create index section_assignments_entry_idx
  on public.section_assignments (table_rotation_entry_id);
create index section_assignments_member_active_idx
  on public.section_assignments (rotation_member_id)
  where released_at is null;

-- ---------------------------------------------------------------------
-- 3. The occupancy trigger. Fires on every write to table_rotation_entries
--    (which already covers assign, clear_cell, clear_row, clear_column,
--    clear_board, and undo/redo of all of those -- every one of them is
--    ultimately an insert/update/delete on this one table) and keeps
--    section_assignments in sync automatically. This is what makes
--    occupancy correct for undo/redo, combined tables, and every entry
--    path (Grid typing, Floor tap, Picker selection, Server + Table) for
--    free, without touching every RPC body individually.
--
--    Combined-table labels ("12 + 13") are split on "+" and each part is
--    resolved against dining_tables independently -- the existing
--    production syntax (docs/features/003-table-allocation.md), not a
--    new one. A part that doesn't resolve to a registered dining_tables
--    row (free text, typo, table not yet in the registry) is silently
--    skipped for occupancy purposes -- table_rotation_entries itself is
--    unaffected either way; only Floor/Picker's availability view cares
--    about resolved tables.
--
--    Transfer semantics: board_assign sets the transaction-local GUC
--    app.confirm_transfer to signal "the caller has explicitly confirmed
--    taking this table from its current holder." Without that signal, a
--    conflicting claim raises an exception instead of silently
--    overwriting -- the DB-level version of "authoritative server
--    validation" the contract requires (never a client-side-only check).
--    Undo/redo never set this GUC, so restoring an old assignment can
--    never silently steal a table someone else has since legitimately
--    claimed -- it fails loudly instead, which is correct: an undo that
--    would double-book a table is not safe to apply silently.
--
--    security definer: this function is the *only* writer of
--    section_assignments (see section 5) -- no direct grant is needed for
--    any client role, matching the private.has_org_role /
--    private.is_service_date_tip_finalized convention already used in
--    this schema for exactly this class of "helper needs to see/write
--    something the calling role doesn't have direct rights to" problem.
-- ---------------------------------------------------------------------
create function private.sync_table_occupancy() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session bigint;
  v_location uuid;
  v_confirm_transfer boolean;
  v_part text;
  v_dining_table_id bigint;
  v_conflict record;
begin
  if TG_OP in ('DELETE', 'UPDATE') then
    delete from public.section_assignments
    where table_rotation_entry_id = OLD.id and released_at is null;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  if NEW.table_label is null or length(trim(NEW.table_label)) = 0 then
    return NEW;
  end if;

  select rr.service_session_id, ss.location_id
    into v_session, v_location
  from public.rotation_rounds rr
  join public.service_sessions ss on ss.id = rr.service_session_id
  where rr.id = NEW.rotation_round_id;

  v_confirm_transfer := coalesce(nullif(current_setting('app.confirm_transfer', true), ''), 'false')::boolean;

  for v_part in select trim(part) from unnest(string_to_array(NEW.table_label, '+')) as part
  loop
    if v_part = '' then
      continue;
    end if;

    select id into v_dining_table_id
    from public.dining_tables
    where location_id = v_location and label = v_part and active;

    if v_dining_table_id is null then
      continue;
    end if;

    select sa.id, sa.rotation_member_id into v_conflict
    from public.section_assignments sa
    where sa.service_session_id = v_session
      and sa.dining_table_id = v_dining_table_id
      and sa.released_at is null
      and sa.rotation_member_id is distinct from NEW.rotation_member_id
    for update;

    if found then
      if v_confirm_transfer then
        update public.section_assignments set released_at = now() where id = v_conflict.id;
      else
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
      end if;
    end if;

    begin
      insert into public.section_assignments (
        organization_id, service_session_id, dining_table_id, server_profile_id,
        rotation_member_id, table_rotation_entry_id
      )
      select NEW.organization_id, v_session, v_dining_table_id, rm.server_profile_id,
        NEW.rotation_member_id, NEW.id
      from public.rotation_members rm
      where rm.id = NEW.rotation_member_id;
    exception
      when unique_violation then
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
    end;
  end loop;

  return NEW;
end;
$$;

revoke all on function private.sync_table_occupancy() from public, anon, authenticated;

create trigger table_rotation_entries_sync_occupancy
  after insert or update or delete on public.table_rotation_entries
  for each row execute function private.sync_table_occupancy();

-- ---------------------------------------------------------------------
-- 4. Auto-row rule: replaces the single-trailing-round behavior with the
--    approved rule -- after any write, ensure ~2 trailing empty rounds
--    exist (an "empty round" = zero table_rotation_entries rows,
--    regardless of any member's active/paused/removed status). This is
--    the ONE reconciled rule (IMPLEMENTATION_CONTRACT.md section 9) --
--    it deliberately does not special-case "last row" vs "second-to-last
--    row": topping up to 2 after every write produces exactly that
--    outcome as a natural consequence, without a second mechanism to
--    keep in sync.
-- ---------------------------------------------------------------------
create or replace function private.ensure_trailing_round(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target constant integer := 2;
  v_max_sequence integer;
  v_trailing_empty integer := 0;
  v_round record;
begin
  select max(sequence) into v_max_sequence
  from public.rotation_rounds
  where service_session_id = p_service_session_id;

  if v_max_sequence is null then
    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, p_service_session_id, 1);
    v_max_sequence := 1;
    v_trailing_empty := 1;
  else
    for v_round in
      select r.sequence,
        exists (select 1 from public.table_rotation_entries e where e.rotation_round_id = r.id) as has_entries
      from public.rotation_rounds r
      where r.service_session_id = p_service_session_id
      order by r.sequence desc
    loop
      exit when v_round.has_entries;
      v_trailing_empty := v_trailing_empty + 1;
    end loop;
  end if;

  while v_trailing_empty < v_target loop
    v_max_sequence := v_max_sequence + 1;
    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, p_service_session_id, v_max_sequence)
    on conflict (service_session_id, sequence) do nothing;
    v_trailing_empty := v_trailing_empty + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permission expansion: Staff (DB roles host, server) gains Active
--    Floor Operations. Explicit user-approved expansion --
--    docs/features/table-rotation-multi-view/PERMISSIONS.md.
-- ---------------------------------------------------------------------
drop policy "section_assignments_operate_service" on public.section_assignments;

drop policy "rotation_members_operate_service" on public.rotation_members;
create policy "rotation_members_operate_service" on public.rotation_members
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])));

-- private.assert_is_board_manager is intentionally left in place (still a
-- true manager-only check for anything that keeps needing one); the four
-- RPCs below stop calling it and call this new any-active-member check
-- instead, matching board_assign/board_clear_cell/board_undo/board_redo's
-- existing population.
create function private.assert_is_active_board_member(
  p_organization_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (
    select private.has_org_role(
      p_organization_id,
      array['owner','general_manager','shift_manager','host','server']::public.app_role[]
    )
  ) then
    raise exception 'Only an active floor team member can do that.';
  end if;
end;
$$;

revoke all on function private.assert_is_active_board_member(uuid) from public, anon;
grant execute on function private.assert_is_active_board_member(uuid) to authenticated;

create or replace function public.board_clear_row(
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
  perform private.assert_is_active_board_member(p_organization_id);
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

create or replace function public.board_clear_column(
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
  perform private.assert_is_active_board_member(p_organization_id);
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

create or replace function public.board_clear_board(
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
  perform private.assert_is_active_board_member(p_organization_id);
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

create or replace function public.board_add_row(
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
  perform private.assert_is_active_board_member(p_organization_id);
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
-- 6. board_delete_row: structural row removal, only for an empty round
--    (clear first, then delete -- preserves history for anything ever
--    assigned). New board_event_type value 'delete_row'; undo/redo
--    handled in section 7/8.
-- ---------------------------------------------------------------------
alter type public.board_event_type add value if not exists 'delete_row';

create function public.board_delete_row(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sequence integer;
  v_has_entries boolean;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select sequence into v_sequence
  from public.rotation_rounds
  where id = p_round_id and service_session_id = p_service_session_id;

  if v_sequence is null then
    raise exception 'Round not found.';
  end if;

  select exists (
    select 1 from public.table_rotation_entries where rotation_round_id = p_round_id
  ) into v_has_entries;

  if v_has_entries then
    raise exception 'Clear this row before deleting it -- it still has assignments.';
  end if;

  delete from public.rotation_rounds where id = p_round_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'delete_row',
    jsonb_build_object('round_id', p_round_id, 'sequence', v_sequence),
    jsonb_build_object('round_id', p_round_id, 'sequence', v_sequence)
  );
end;
$$;

revoke all on function public.board_delete_row(uuid, bigint, bigint) from public, anon;
grant execute on function public.board_delete_row(uuid, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7. board_assign: extended with p_confirm_transfer (threaded into the
--    occupancy trigger via a transaction-local GUC -- see section 3).
--    Signature changed (new parameter), so the old 6-arg overload must be
--    dropped explicitly rather than replaced, to avoid leaving an
--    ambiguous duplicate for PostgREST's schema cache to resolve.
-- ---------------------------------------------------------------------
drop function if exists public.board_assign(uuid, uuid, date, bigint, bigint, text);

create function public.board_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean default false
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

  perform set_config('app.confirm_transfer', p_confirm_transfer::text, true);

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, p_table_label, (select auth.uid()))
  on conflict (rotation_round_id, rotation_member_id)
  do update set
    table_label = excluded.table_label,
    assigned_by = excluded.assigned_by,
    assigned_at = now();

  perform set_config('app.confirm_transfer', 'false', true);

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

revoke all on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean) from public, anon;
grant execute on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Undo/redo: add the delete_row branch. Occupancy needs no new
--    branches here -- every existing branch that touches
--    table_rotation_entries already drives the trigger in section 3
--    automatically (see that section's header comment for why).
-- ---------------------------------------------------------------------
create or replace function public.board_undo(
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
    when 'delete_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values ((v_event.inverse_payload->>'round_id')::bigint, p_organization_id, p_service_session_id, (v_event.inverse_payload->>'sequence')::integer);
    else
      raise exception 'Undo not supported for event type %', v_event.event_type;
  end case;

  update public.board_events set undone_at = now() where id = v_event.id;

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

create or replace function public.board_redo(
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
    when 'delete_row' then
      delete from public.rotation_rounds where id = (v_event.payload->>'round_id')::bigint;
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
