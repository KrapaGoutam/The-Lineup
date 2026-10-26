-- Table Rotation V2 Part 1 / Phase 1A -- structural session + location
-- integrity (closes D-02 / audit DATA-001 / PERF-001).
--
-- Before this migration the only relationships tying a table_rotation_entries
-- row to its service session were two independent, TENANT-only composite
-- FKs (round, organization) and (member, organization). Nothing proved the
-- round and the member (or a section_assignments claim, or the session an
-- RPC used for its "is this board locked?" check) were the SAME session, so
-- a caller could pair today's session with a past day's round.
--
-- This migration makes the session a first-class, constrained column of the
-- rotation graph, and moves the historical / finalized lock from "whatever
-- session id the caller supplied" to "the session that the row itself
-- belongs to", enforced in the database for every write path:
--
--   1. table_rotation_entries.service_session_id (NOT NULL) with composite
--      FKs to rotation_rounds(id, service_session_id) and
--      rotation_members(id, service_session_id): an entry's round, member and
--      session are provably one session.
--   2. section_assignments.location_id with composite FKs to
--      service_sessions(id, location_id) and dining_tables(id, location_id):
--      a physical claim's table, session and location are provably one
--      location (table labels are only unique per location, never globally).
--      Its entry / member are also tied to the same session.
--   3. Row-level guard triggers on entries / rounds / members: for any
--      end-user (JWT) write they lock the row's own session (serializing all
--      writes to one board), then run the existing historical + finalized
--      lock against that derived session.
--   4. table_rotation_entries.ended_by: End attribution lives in its own
--      column; assigned_by stays the immutable original assigner (D-01
--      groundwork -- the policy/RPC half ships in the next migration).
--
-- Forward-only: no applied migration is edited. Pre-flight below aborts
-- (touching nothing) if existing data already violates the new invariant.

-- ---------------------------------------------------------------------
-- 0. Pre-flight: stop on pre-existing corruption instead of guessing.
-- ---------------------------------------------------------------------
do $$
declare
  v_entries_cross_session bigint;
  v_claims_cross_session bigint;
  v_claims_cross_location bigint;
  v_stale_duplicates bigint;
begin
  select count(*) into v_entries_cross_session
  from public.table_rotation_entries e
  join public.rotation_rounds r on r.id = e.rotation_round_id
  join public.rotation_members m on m.id = e.rotation_member_id
  where r.service_session_id <> m.service_session_id;

  select count(*) into v_claims_cross_session
  from public.section_assignments sa
  left join public.table_rotation_entries e on e.id = sa.table_rotation_entry_id
  left join public.rotation_rounds r on r.id = e.rotation_round_id
  left join public.rotation_members m on m.id = sa.rotation_member_id
  where (sa.table_rotation_entry_id is not null and r.service_session_id <> sa.service_session_id)
     or (sa.rotation_member_id is not null and m.service_session_id <> sa.service_session_id);

  select count(*) into v_claims_cross_location
  from public.section_assignments sa
  join public.service_sessions s on s.id = sa.service_session_id
  join public.dining_tables d on d.id = sa.dining_table_id
  where d.location_id <> s.location_id;

  -- Informational only (not a blocker): ACTIVE entries sharing a table label
  -- within one session, left behind by the pre-V2 confirm-transfer path.
  -- They are reported, never rewritten; the app surfaces them as
  -- claim divergences.
  select count(*) into v_stale_duplicates
  from (
    select service_session_id, trim(label) as label
    from (
      select r.service_session_id, unnest(string_to_array(e.table_label, '+')) as label
      from public.table_rotation_entries e
      join public.rotation_rounds r on r.id = e.rotation_round_id
      where e.status = 'active' and e.table_label is not null
    ) parts
    group by service_session_id, trim(label)
    having count(*) > 1
  ) dupes;
  if v_stale_duplicates > 0 then
    raise notice 'Table Rotation V2: % table(s) have more than one ACTIVE entry in a session (pre-V2 reassignments); left untouched.', v_stale_duplicates;
  end if;

  if v_entries_cross_session > 0 or v_claims_cross_session > 0 or v_claims_cross_location > 0 then
    raise exception
      'Table Rotation V2 integrity pre-flight failed: % entries span two sessions, % claims span sessions, % claims span locations. Remediate manually; nothing was changed.',
      v_entries_cross_session, v_claims_cross_session, v_claims_cross_location;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Composite-key targets (additive; the PKs already make these unique).
-- ---------------------------------------------------------------------
alter table public.rotation_rounds
  add constraint rotation_rounds_id_session_key unique (id, service_session_id);
alter table public.rotation_members
  add constraint rotation_members_id_session_key unique (id, service_session_id);
alter table public.service_sessions
  add constraint service_sessions_id_location_key unique (id, location_id);
alter table public.dining_tables
  add constraint dining_tables_id_location_key unique (id, location_id);

-- ---------------------------------------------------------------------
-- 2. table_rotation_entries: session column + composite FKs + End actor.
-- ---------------------------------------------------------------------
alter table public.table_rotation_entries
  add column service_session_id bigint,
  add column ended_by uuid;

-- The backfill only fills a new column; it must not re-run the physical
-- occupancy sync. The previous trigger version deletes and re-inserts every
-- active entry's claims on ANY update and raises on a conflict -- and
-- production data can hold two ACTIVE entries for one table (the old
-- confirm-transfer path released the previous holder's claim but left that
-- holder's entry active), so re-syncing here could abort the migration or
-- resurrect a claim for a stale entry. Those stale entries are surfaced at
-- read time (findClaimDivergences), not silently rewritten here.
alter table public.table_rotation_entries
  disable trigger table_rotation_entries_sync_occupancy;

update public.table_rotation_entries e
set service_session_id = r.service_session_id
from public.rotation_rounds r
where r.id = e.rotation_round_id;

alter table public.table_rotation_entries
  enable trigger table_rotation_entries_sync_occupancy;

alter table public.table_rotation_entries
  alter column service_session_id set not null;

alter table public.table_rotation_entries
  add constraint table_rotation_entries_id_session_key unique (id, service_session_id),
  add constraint table_rotation_entries_round_session_fk
    foreign key (rotation_round_id, service_session_id)
    references public.rotation_rounds (id, service_session_id) on delete cascade,
  add constraint table_rotation_entries_member_session_fk
    foreign key (rotation_member_id, service_session_id)
    references public.rotation_members (id, service_session_id) on delete cascade,
  add constraint table_rotation_entries_ended_by_fk
    foreign key (organization_id, ended_by)
    references public.memberships (organization_id, profile_id);

-- Leading composite for "this member's active entries" (PERF-001) and the
-- session lookup the guard / read paths use.
create index table_rotation_entries_member_status_idx
  on public.table_rotation_entries (rotation_member_id, status);
create index table_rotation_entries_session_idx
  on public.table_rotation_entries (service_session_id);
create index table_rotation_entries_ended_by_idx
  on public.table_rotation_entries (organization_id, ended_by)
  where ended_by is not null;

-- ---------------------------------------------------------------------
-- 3. section_assignments: location column + session/location-scoped FKs.
-- ---------------------------------------------------------------------
alter table public.section_assignments
  add column location_id uuid;

update public.section_assignments sa
set location_id = s.location_id
from public.service_sessions s
where s.id = sa.service_session_id;

alter table public.section_assignments
  alter column location_id set not null;

alter table public.section_assignments
  add constraint section_assignments_session_location_fk
    foreign key (service_session_id, location_id)
    references public.service_sessions (id, location_id),
  add constraint section_assignments_table_location_fk
    foreign key (dining_table_id, location_id)
    references public.dining_tables (id, location_id),
  add constraint section_assignments_entry_session_fk
    foreign key (table_rotation_entry_id, service_session_id)
    references public.table_rotation_entries (id, service_session_id) on delete cascade,
  add constraint section_assignments_member_session_fk
    foreign key (rotation_member_id, service_session_id)
    references public.rotation_members (id, service_session_id) on delete cascade;

create index section_assignments_session_location_idx
  on public.section_assignments (service_session_id, location_id);

-- ---------------------------------------------------------------------
-- 4. Entry triggers.
-- ---------------------------------------------------------------------

-- 4a. The session is DERIVED from the round, never accepted from a caller:
--     a supplied value that disagrees is rejected, an omitted one is filled.
create or replace function private.table_rotation_entries_fill_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session bigint;
begin
  select r.service_session_id into v_session
  from public.rotation_rounds r
  where r.id = new.rotation_round_id;

  if v_session is null then
    raise exception 'That round does not exist.' using errcode = '23503';
  end if;

  if new.service_session_id is not null and new.service_session_id <> v_session then
    raise exception 'That round belongs to a different service session.' using errcode = '23514';
  end if;

  new.service_session_id := v_session;
  return new;
end;
$$;

-- 4b. An entry's identity is immutable: moving it to another round, member,
--     session or tenant would re-open exactly the integrity hole above.
create or replace function private.table_rotation_entries_lock_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rotation_round_id is distinct from old.rotation_round_id
     or new.rotation_member_id is distinct from old.rotation_member_id
     or new.service_session_id is distinct from old.service_session_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'A rotation entry cannot be moved to another round, server or session.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 4c. Guard: for any end-user (JWT) write, lock the row's OWN session and run
--     the historical / finalized lock against it. A context with no JWT
--     (migrations, service-role maintenance, the retention cron, cascade
--     deletes of an entire session) is trusted and skipped.
create or replace function private.guard_board_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session bigint;
  v_org uuid;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_session := old.service_session_id;
    v_org := old.organization_id;
  else
    v_session := new.service_session_id;
    v_org := new.organization_id;
  end if;

  -- One writer per board at a time. NO KEY UPDATE conflicts with itself but
  -- not with the KEY SHARE the FKs take, so this serializes board writes
  -- without blocking foreign-key checks.
  perform 1
  from public.service_sessions s
  where s.id = v_session and s.organization_id = v_org
  for no key update;

  perform private.assert_board_not_locked(v_org, v_session);

  return coalesce(new, old);
end;
$$;

revoke all on function private.table_rotation_entries_fill_session() from public, anon, authenticated;
revoke all on function private.table_rotation_entries_lock_identity() from public, anon, authenticated;
revoke all on function private.guard_board_write() from public, anon, authenticated;

-- Trigger names are ordered: fill the session first, then guard, then sync.
create trigger table_rotation_entries_a_fill_session
  before insert on public.table_rotation_entries
  for each row execute function private.table_rotation_entries_fill_session();
create trigger table_rotation_entries_b_lock_identity
  before update on public.table_rotation_entries
  for each row execute function private.table_rotation_entries_lock_identity();
create trigger table_rotation_entries_c_guard
  before insert or update or delete on public.table_rotation_entries
  for each row execute function private.guard_board_write();
create trigger rotation_rounds_guard
  before insert or update or delete on public.rotation_rounds
  for each row execute function private.guard_board_write();
create trigger rotation_members_guard
  before insert or update or delete on public.rotation_members
  for each row execute function private.guard_board_write();

-- ---------------------------------------------------------------------
-- 5. Occupancy sync: session + location come from structure, not lookups
--    through the round; the claim now records its location. Behaviour is
--    otherwise unchanged (the confirm-transfer path is retired in the
--    trusted-mutation migration, which ends the displaced entry instead).
-- ---------------------------------------------------------------------
create or replace function private.sync_table_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_confirm_transfer boolean;
  v_part text;
  v_dining_table_id bigint;
  v_conflict record;
begin
  -- Nothing the physical ledger cares about changed (e.g. only ended_by).
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

  v_confirm_transfer := coalesce(nullif(current_setting('app.confirm_transfer', true), ''), 'false')::boolean;

  for v_part in select trim(part) from unnest(string_to_array(new.table_label, '+')) as part
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
    where sa.service_session_id = new.service_session_id
      and sa.dining_table_id = v_dining_table_id
      and sa.released_at is null
      and sa.rotation_member_id is distinct from new.rotation_member_id
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
