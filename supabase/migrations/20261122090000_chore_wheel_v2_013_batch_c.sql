-- V2.0.13 Batch C: independent chore-cycle closure, recurrence, immutable run snapshots,
-- append-only corrections and run history. Forward-only and additive on top of Batch B
-- (20261121090000): no earlier migration is edited, no table is dropped.
--
-- Model (see docs/features/v2-0-13-tasks-chores/HANDOFF.md, "Batch C"):
--   * A RUN is a chore_cycles row. One board has at most ONE open run (Batch B's partial
--     unique index) and its own sequence, so closing Mango Lassi #3 can never touch another
--     board. Run numbers are max(sequence) + 1 per board, protected by unique (board_id, sequence).
--   * Closing is a single transaction: the board row is locked (share for ticks, exclusive for
--     managers / the sweep) and the CYCLE row is locked exclusively before the completeness
--     check, so two people ticking the last two cells serialise and exactly one of them closes.
--   * A closed run is frozen into chore_cycle_snapshot_* (titles, labels, order, assignees,
--     rules, cells, actors, timestamps are COPIED). Template edits afterwards never rewrite it.
--     A manager's later correction is a new append-only chore_cycle_corrections row.
--   * Automation has no client-callable "close this board" lever. The only entry points are
--     (a) the tick itself (auto-reset boards close the run the tick just finished) and
--     (b) chore_cycles_sweep(org, location): membership-checked, takes no board / time /
--     outcome argument, deterministic, idempotent. It is driven by Tasks loads, not by cron.
--   * System closures are recorded as actor_kind = 'system' with NO profile; the profile that
--     happened to trigger the call is only a labelled "triggered_by" payload field.
begin;

-- ---------------------------------------------------------------------
-- 1. Template structure version + recurrence guard
-- ---------------------------------------------------------------------
alter table public.chore_boards add column structure_version integer not null default 1;

create function private.chore_structure_bump()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Cascading deletes (board / organization removal) run at trigger depth > 1.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  update public.chore_boards set structure_version = structure_version + 1
  where id = coalesce(new.board_id, old.board_id);
  return null;
end;
$$;
revoke all on function private.chore_structure_bump() from public, anon, authenticated;
create trigger chore_rows_structure_bump after insert or update or delete on public.chore_rows
  for each row execute function private.chore_structure_bump();
create trigger chore_columns_structure_bump after insert or update or delete on public.chore_columns
  for each row execute function private.chore_structure_bump();
create trigger chore_row_columns_structure_bump after insert or update or delete on public.chore_row_columns
  for each row execute function private.chore_structure_bump();

-- Per-shift needs a real shift identity (the schedule module) that boards do not carry.
-- Refuse to ENABLE it rather than invent shift boundaries; a stored value stays readable.
create function private.chore_board_recurrence_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recurrence_intent = 'per_shift'
     and (tg_op = 'INSERT' or old.recurrence_intent is distinct from 'per_shift') then
    raise exception 'Per-shift runs are not available yet. Choose Continuous, Daily, Weekly or Manual.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.chore_board_recurrence_guard() from public, anon, authenticated;
create trigger chore_boards_recurrence_guard before insert or update on public.chore_boards
  for each row execute function private.chore_board_recurrence_guard();

-- ---------------------------------------------------------------------
-- 2. Runs: statuses, system actor, business date, period key
-- ---------------------------------------------------------------------
alter table public.chore_cycles drop constraint chore_cycles_status_check;
alter table public.chore_cycles add constraint chore_cycles_status_check
  check (status in ('open', 'completed', 'closed', 'cancelled', 'expired'));
alter table public.chore_cycles drop constraint chore_cycles_closed_pair;
alter table public.chore_cycles alter column opened_by drop not null;
alter table public.chore_cycles
  add column opened_by_kind text not null default 'user' check (opened_by_kind in ('user', 'system')),
  add column closed_by_kind text check (closed_by_kind in ('user', 'system')),
  add column close_trigger text check (close_trigger in ('manual', 'automatic', 'cancelled', 'expired')),
  add column close_note text check (close_note is null or length(close_note) <= 300),
  add column business_date date,
  add column period_key text,
  -- The board's structure_version when the FIRST cell of the run was checked.
  add column structure_version_start integer;
update public.chore_cycles set closed_by_kind = 'user' where closed_by is not null and closed_by_kind is null;
update public.chore_cycles c set business_date = (c.opened_at at time zone l.time_zone)::date
from public.chore_boards b join public.locations l on l.id = b.location_id
where b.id = c.board_id and c.business_date is null;
alter table public.chore_cycles alter column business_date set not null;
alter table public.chore_cycles add constraint chore_cycles_opened_actor
  check ((opened_by_kind = 'system') = (opened_by is null));
alter table public.chore_cycles add constraint chore_cycles_closed_actor check (
  (closed_at is null) = (closed_by_kind is null)
  and (closed_by is null or closed_by_kind = 'user')
  and (closed_by_kind is distinct from 'user' or closed_by is not null));
alter table public.chore_cycles add constraint chore_cycles_closed_has_time
  check (status = 'open' or closed_at is not null);
-- One scheduler-created run per board and period (a retried or concurrent sweep is harmless).
create unique index chore_cycles_system_period_idx on public.chore_cycles (board_id, period_key)
  where period_key is not null and opened_by_kind = 'system';
create index chore_cycles_board_closed_idx on public.chore_cycles (board_id, closed_at desc)
  where status <> 'open';

-- opened_by is NOT NULL no more, so the index/FK helpers above stay valid; the default
-- business date is the location's local date at insert time.
create function private.chore_cycles_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.business_date is null then
    select (now() at time zone l.time_zone)::date into new.business_date
    from public.chore_boards b join public.locations l on l.id = b.location_id
    where b.id = new.board_id;
  end if;
  return new;
end;
$$;
revoke all on function private.chore_cycles_defaults() from public, anon, authenticated;
create trigger chore_cycles_defaults before insert on public.chore_cycles
  for each row execute function private.chore_cycles_defaults();

-- A closed run is evidence: nothing about it may change or disappear (cascades excepted).
create function private.chore_cycles_freeze()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or old.status = 'open' then
      return old;
    end if;
    raise exception 'A finished run cannot be deleted.' using errcode = '23514';
  end if;
  if old.status <> 'open' then
    raise exception 'A finished run cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.chore_cycles_freeze() from public, anon, authenticated;
create trigger chore_cycles_freeze before update or delete on public.chore_cycles
  for each row execute function private.chore_cycles_freeze();

-- Completions can only be written to (or removed from) an OPEN run.
create function private.chore_completions_open_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.chore_cycles
  where id = case when tg_op = 'DELETE' then old.cycle_id else new.cycle_id end;
  if v_status is distinct from 'open' then
    raise exception 'This run has finished and its cells can no longer change.' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.chore_completions_open_only() from public, anon, authenticated;
create trigger chore_completions_open_only before insert or update or delete on public.chore_completions
  for each row execute function private.chore_completions_open_only();

-- ---------------------------------------------------------------------
-- 3. Audit trail: system actor and the new event types
-- ---------------------------------------------------------------------
alter table public.chore_events alter column actor_profile_id drop not null;
alter table public.chore_events add column actor_kind text not null default 'user'
  check (actor_kind in ('user', 'system'));
alter table public.chore_events add constraint chore_events_actor_kind_ck
  check ((actor_kind = 'user') = (actor_profile_id is not null));
alter table public.chore_events drop constraint chore_events_event_type_check;
alter table public.chore_events add constraint chore_events_event_type_check check (event_type in (
  'board_created', 'board_updated', 'board_state', 'board_duplicated', 'boards_reordered',
  'column_created', 'column_updated', 'column_reassigned', 'column_state', 'columns_reordered',
  'row_created', 'row_updated', 'row_state', 'rows_reordered',
  'cell_checked', 'cell_unchecked',
  'cycle_opened', 'cycle_closed', 'cycle_corrected'));

-- ---------------------------------------------------------------------
-- 4. Immutable run snapshots and append-only corrections
-- ---------------------------------------------------------------------
create function private.chore_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Finished runs and their corrections are permanent records.' using errcode = '23514';
end;
$$;
revoke all on function private.chore_immutable() from public, anon, authenticated;

create table public.chore_cycle_snapshots (
  cycle_id uuid primary key,
  board_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  board_name text not null,
  sequence integer not null,
  final_status text not null check (final_status in ('completed', 'cancelled', 'expired')),
  outcome text not null check (outcome in ('completed', 'not_completed')),
  close_trigger text not null check (close_trigger in ('manual', 'automatic', 'cancelled', 'expired')),
  -- The business day the run belongs to: its scheduled day for daily / weekly runs,
  -- otherwise the location-local day it was closed. History groups by its month.
  business_date date not null,
  period_key text,
  recurrence_intent text not null,
  reset_intent text not null,
  staff_access text not null,
  manager_override boolean not null,
  structure_version integer not null,
  structure_changed boolean not null,
  required_total integer not null,
  required_done integer not null,
  optional_total integer not null,
  optional_done integer not null,
  opened_at timestamptz not null,
  opened_by_kind text not null,
  closed_at timestamptz not null,
  closed_by uuid references public.profiles (id),
  closed_by_kind text not null check (closed_by_kind in ('user', 'system')),
  closed_by_name text,
  note text,
  created_at timestamptz not null default now(),
  constraint chore_cycle_snapshots_cycle_fk
    foreign key (cycle_id, board_id) references public.chore_cycles (id, board_id) on delete cascade,
  constraint chore_cycle_snapshots_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade,
  constraint chore_cycle_snapshots_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint chore_cycle_snapshots_actor check (closed_by_kind = 'user' or closed_by is null),
  constraint chore_cycle_snapshots_outcome check (
    (outcome = 'completed') = (final_status = 'completed'))
);
create index chore_cycle_snapshots_board_idx on public.chore_cycle_snapshots (board_id, closed_at desc);
create index chore_cycle_snapshots_location_month_idx
  on public.chore_cycle_snapshots (organization_id, location_id, business_date desc);
create index chore_cycle_snapshots_board_org_idx on public.chore_cycle_snapshots (board_id, organization_id);
create index chore_cycle_snapshots_closed_by_idx on public.chore_cycle_snapshots (closed_by) where closed_by is not null;
create trigger chore_cycle_snapshots_immutable before update or delete on public.chore_cycle_snapshots
  for each row execute function private.chore_immutable();

create table public.chore_cycle_snapshot_rows (
  cycle_id uuid not null,
  row_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  title text not null,
  instructions text,
  is_required boolean not null,
  requirement_mode text not null,
  sort_order integer not null,
  selected_column_ids uuid[] not null default '{}',
  -- false: removed / turned off before the run closed but it had completions, so it is kept as evidence.
  was_live boolean not null,
  primary key (cycle_id, row_id),
  constraint chore_cycle_snapshot_rows_snap_fk
    foreign key (cycle_id) references public.chore_cycle_snapshots (cycle_id) on delete cascade,
  constraint chore_cycle_snapshot_rows_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_cycle_snapshot_rows_board_idx on public.chore_cycle_snapshot_rows (board_id, organization_id);
create trigger chore_cycle_snapshot_rows_immutable before update or delete on public.chore_cycle_snapshot_rows
  for each row execute function private.chore_immutable();

create table public.chore_cycle_snapshot_columns (
  cycle_id uuid not null,
  column_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  label text not null,
  profile_id uuid references public.profiles (id),
  -- The assignee's name when the run closed (profiles can be renamed later).
  profile_name text,
  sort_order integer not null,
  was_live boolean not null,
  primary key (cycle_id, column_id),
  constraint chore_cycle_snapshot_columns_snap_fk
    foreign key (cycle_id) references public.chore_cycle_snapshots (cycle_id) on delete cascade,
  constraint chore_cycle_snapshot_columns_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_cycle_snapshot_columns_board_idx on public.chore_cycle_snapshot_columns (board_id, organization_id);
create index chore_cycle_snapshot_columns_profile_idx on public.chore_cycle_snapshot_columns (profile_id) where profile_id is not null;
create trigger chore_cycle_snapshot_columns_immutable before update or delete on public.chore_cycle_snapshot_columns
  for each row execute function private.chore_immutable();

create table public.chore_cycle_snapshot_cells (
  cycle_id uuid not null,
  row_id uuid not null,
  column_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  completed_by uuid not null references public.profiles (id),
  completed_by_name text not null,
  completed_at timestamptz not null,
  entered_as text not null,
  primary key (cycle_id, row_id, column_id),
  constraint chore_cycle_snapshot_cells_row_fk
    foreign key (cycle_id, row_id) references public.chore_cycle_snapshot_rows (cycle_id, row_id) on delete cascade,
  constraint chore_cycle_snapshot_cells_column_fk
    foreign key (cycle_id, column_id) references public.chore_cycle_snapshot_columns (cycle_id, column_id) on delete cascade,
  constraint chore_cycle_snapshot_cells_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_cycle_snapshot_cells_board_idx on public.chore_cycle_snapshot_cells (board_id, organization_id);
create index chore_cycle_snapshot_cells_completed_by_idx on public.chore_cycle_snapshot_cells (completed_by);
create trigger chore_cycle_snapshot_cells_immutable before update or delete on public.chore_cycle_snapshot_cells
  for each row execute function private.chore_immutable();

create table public.chore_cycle_corrections (
  id bigint generated always as identity primary key,
  cycle_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  row_id uuid not null,
  column_id uuid not null,
  done_before boolean not null,
  done_after boolean not null check (done_after is distinct from done_before),
  -- The ORIGINAL recorded event, copied so the correction reads on its own.
  before_completed_by_name text,
  before_completed_at timestamptz,
  reason text not null check (length(trim(reason)) between 3 and 300),
  corrected_by uuid not null references public.profiles (id),
  corrected_by_name text not null,
  created_at timestamptz not null default now(),
  constraint chore_cycle_corrections_snap_fk
    foreign key (cycle_id) references public.chore_cycle_snapshots (cycle_id) on delete cascade,
  constraint chore_cycle_corrections_row_fk
    foreign key (cycle_id, row_id) references public.chore_cycle_snapshot_rows (cycle_id, row_id) on delete cascade,
  constraint chore_cycle_corrections_column_fk
    foreign key (cycle_id, column_id) references public.chore_cycle_snapshot_columns (cycle_id, column_id) on delete cascade,
  constraint chore_cycle_corrections_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_cycle_corrections_cell_idx on public.chore_cycle_corrections (cycle_id, row_id, column_id, id desc);
create index chore_cycle_corrections_board_idx on public.chore_cycle_corrections (board_id, organization_id);
create index chore_cycle_corrections_by_idx on public.chore_cycle_corrections (corrected_by);
create trigger chore_cycle_corrections_immutable before update or delete on public.chore_cycle_corrections
  for each row execute function private.chore_immutable();

-- RLS: clients read only. The run header (status, ratio, dates) is readable wherever the
-- board is; the matrix, who-did-what and corrections are manager-only reads.
alter table public.chore_cycle_snapshots enable row level security;
alter table public.chore_cycle_snapshot_rows enable row level security;
alter table public.chore_cycle_snapshot_columns enable row level security;
alter table public.chore_cycle_snapshot_cells enable row level security;
alter table public.chore_cycle_corrections enable row level security;
revoke all on table public.chore_cycle_snapshots, public.chore_cycle_snapshot_rows,
  public.chore_cycle_snapshot_columns, public.chore_cycle_snapshot_cells,
  public.chore_cycle_corrections from public, anon, authenticated;
grant select on table public.chore_cycle_snapshots, public.chore_cycle_snapshot_rows,
  public.chore_cycle_snapshot_columns, public.chore_cycle_snapshot_cells,
  public.chore_cycle_corrections to authenticated;
create policy chore_cycle_snapshots_select on public.chore_cycle_snapshots for select to authenticated
  using (private.chore_board_visible(board_id));
create policy chore_cycle_snapshot_rows_select on public.chore_cycle_snapshot_rows for select to authenticated
  using (private.chore_board_manager(board_id));
create policy chore_cycle_snapshot_columns_select on public.chore_cycle_snapshot_columns for select to authenticated
  using (private.chore_board_manager(board_id));
create policy chore_cycle_snapshot_cells_select on public.chore_cycle_snapshot_cells for select to authenticated
  using (private.chore_board_manager(board_id));
create policy chore_cycle_corrections_select on public.chore_cycle_corrections for select to authenticated
  using (private.chore_board_manager(board_id));

-- ---------------------------------------------------------------------
-- 5. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
create function private.chore_local_date(p_location_id uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone l.time_zone)::date from public.locations l where l.id = p_location_id;
$$;
revoke all on function private.chore_local_date(uuid) from public, anon, authenticated;

-- First day of the period a date belongs to; null for modes without a scheduled period.
create function private.chore_period_start(p_recurrence text, p_date date)
returns date language sql immutable set search_path = '' as $$
  select case p_recurrence
    when 'daily' then p_date
    when 'weekly' then date_trunc('week', p_date::timestamp)::date -- ISO week: Monday
    else null end;
$$;
revoke all on function private.chore_period_start(text, date) from public, anon, authenticated;

-- The same counting rules as src/features/tasks/domain/chore-rules.ts (boardProgress):
-- all columns = chores x applicable live columns; selected = only the selected live
-- columns; any one = ONE check per chore, done when any live column completed it.
-- Not-applicable cells and optional chores never count toward the required total.
create function private.chore_cycle_progress(p_board_id uuid, p_cycle_id uuid)
returns table (required_total integer, required_done integer, optional_total integer, optional_done integer)
language sql stable security definer set search_path = '' as $$
  with applic as (
    select r.id as row_id, r.is_required, r.requirement_mode as mode, c.id as column_id
    from public.chore_rows r
    join public.chore_columns c on c.board_id = r.board_id and c.archived_at is null and c.is_active
    where r.board_id = p_board_id and r.archived_at is null and r.is_active
      and (r.requirement_mode <> 'selected_columns'
           or exists (select 1 from public.chore_row_columns rc
                      where rc.row_id = r.id and rc.column_id = c.id))
  ), per_row as (
    select a.row_id, a.is_required, a.mode, count(*)::integer as cols, count(cp.id)::integer as done
    from applic a
    left join public.chore_completions cp
      on cp.cycle_id = p_cycle_id and cp.row_id = a.row_id and cp.column_id = a.column_id
    group by a.row_id, a.is_required, a.mode
  ), counted as (
    select is_required,
      case when mode = 'any_one' then 1 else cols end as total,
      case when mode = 'any_one' then (case when done > 0 then 1 else 0 end) else done end as done
    from per_row
  )
  select coalesce(sum(total) filter (where is_required), 0)::integer,
         coalesce(sum(done) filter (where is_required), 0)::integer,
         coalesce(sum(total) filter (where not is_required), 0)::integer,
         coalesce(sum(done) filter (where not is_required), 0)::integer
  from counted;
$$;
revoke all on function private.chore_cycle_progress(uuid, uuid) from public, anon, authenticated;

-- A run is complete only when it has required work and all of it is done. A board with
-- no required work is NOT complete (it must never close and regenerate in a loop).
create function private.chore_cycle_is_complete(p_board_id uuid, p_cycle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p.required_total > 0 and p.required_done = p.required_total
  from private.chore_cycle_progress(p_board_id, p_cycle_id) p;
$$;
revoke all on function private.chore_cycle_is_complete(uuid, uuid) from public, anon, authenticated;

-- Audit row for an action done BY the system (no profile). The profile whose call
-- happened to trigger it is recorded only as a labelled payload field.
create function private.chore_emit_system(
  p_board public.chore_boards, p_cycle_id uuid, p_event_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chore_events (board_id, organization_id, cycle_id, event_type,
    actor_profile_id, actor_kind, payload)
  values (p_board.id, p_board.organization_id, p_cycle_id, p_event_type, null, 'system',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('triggered_by', (select auth.uid())));
end;
$$;
revoke all on function private.chore_emit_system(public.chore_boards, uuid, text, jsonb) from public, anon, authenticated;

-- Opens the next run of a board. The caller holds the board lock.
create function private.chore_start_run(
  p_board public.chore_boards, p_kind text, p_by uuid, p_period_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_seq integer;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq from public.chore_cycles where board_id = p_board.id;
  insert into public.chore_cycles (board_id, organization_id, sequence, opened_by, opened_by_kind, period_key)
  values (p_board.id, p_board.organization_id, v_seq, case when p_kind = 'user' then p_by end, p_kind, p_period_key)
  returning id into v_id;
  if p_kind = 'user' then
    perform private.chore_emit(p_board, v_id, null, null, 'cycle_opened',
      jsonb_build_object('sequence', v_seq, 'kind', 'manual'));
  else
    perform private.chore_emit_system(p_board, v_id, 'cycle_opened',
      jsonb_build_object('sequence', v_seq, 'kind', 'automatic', 'period_key', p_period_key));
  end if;
  return v_id;
end;
$$;
revoke all on function private.chore_start_run(public.chore_boards, text, uuid, text) from public, anon, authenticated;

-- Closes one run exactly once: writes the immutable snapshot, then marks the run
-- finished. Returns false when it was already finished (idempotent). The caller holds
-- the board lock; this takes the run's own lock.
create function private.chore_finish_cycle(
  p_board public.chore_boards, p_cycle_id uuid, p_status text, p_trigger text,
  p_by uuid, p_by_kind text, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  cy public.chore_cycles;
  pr record;
  v_name text;
  v_period date;
  v_date date;
  v_changed boolean;
begin
  select * into cy from public.chore_cycles where id = p_cycle_id and board_id = p_board.id for update;
  if not found then
    raise exception 'That run does not exist or you cannot use it.' using errcode = '42501';
  end if;
  if cy.status <> 'open' then
    return false;
  end if;
  select * into pr from private.chore_cycle_progress(p_board.id, cy.id);
  v_period := private.chore_period_start(p_board.recurrence_intent, cy.business_date);
  v_date := coalesce(v_period, private.chore_local_date(p_board.location_id));
  v_changed := cy.structure_version_start is not null
    and cy.structure_version_start <> p_board.structure_version;
  if p_by_kind = 'user' then
    select display_name into v_name from public.profiles where id = p_by;
  end if;

  insert into public.chore_cycle_snapshots (cycle_id, board_id, organization_id, location_id, board_name,
    sequence, final_status, outcome, close_trigger, business_date, period_key, recurrence_intent,
    reset_intent, staff_access, manager_override, structure_version, structure_changed,
    required_total, required_done, optional_total, optional_done, opened_at, opened_by_kind,
    closed_at, closed_by, closed_by_kind, closed_by_name, note)
  values (cy.id, p_board.id, p_board.organization_id, p_board.location_id, p_board.name,
    cy.sequence, p_status, case when p_status = 'completed' then 'completed' else 'not_completed' end,
    p_trigger, v_date, cy.period_key, p_board.recurrence_intent, p_board.reset_intent,
    p_board.staff_access, p_board.manager_override, p_board.structure_version, v_changed,
    pr.required_total, pr.required_done, pr.optional_total, pr.optional_done, cy.opened_at,
    cy.opened_by_kind, now(), case when p_by_kind = 'user' then p_by end, p_by_kind, v_name,
    nullif(trim(coalesce(p_note, '')), ''));

  -- Live structure plus anything removed that still carries completions of this run.
  insert into public.chore_cycle_snapshot_rows (cycle_id, row_id, board_id, organization_id, title,
    instructions, is_required, requirement_mode, sort_order, selected_column_ids, was_live)
  select cy.id, r.id, p_board.id, p_board.organization_id, r.title, r.instructions, r.is_required,
    r.requirement_mode, r.sort_order,
    coalesce((select array_agg(rc.column_id order by rc.column_id)
              from public.chore_row_columns rc where rc.row_id = r.id), '{}'::uuid[]),
    (r.is_active and r.archived_at is null)
  from public.chore_rows r
  where r.board_id = p_board.id
    and ((r.is_active and r.archived_at is null)
         or exists (select 1 from public.chore_completions cp where cp.cycle_id = cy.id and cp.row_id = r.id));
  insert into public.chore_cycle_snapshot_columns (cycle_id, column_id, board_id, organization_id, label,
    profile_id, profile_name, sort_order, was_live)
  select cy.id, c.id, p_board.id, p_board.organization_id, c.label, c.profile_id,
    (select pf.display_name from public.profiles pf where pf.id = c.profile_id),
    c.sort_order, (c.is_active and c.archived_at is null)
  from public.chore_columns c
  where c.board_id = p_board.id
    and ((c.is_active and c.archived_at is null)
         or exists (select 1 from public.chore_completions cp where cp.cycle_id = cy.id and cp.column_id = c.id));
  insert into public.chore_cycle_snapshot_cells (cycle_id, row_id, column_id, board_id, organization_id,
    completed_by, completed_by_name, completed_at, entered_as)
  select cy.id, cp.row_id, cp.column_id, p_board.id, p_board.organization_id,
    cp.completed_by, cp.completed_by_name, cp.completed_at, cp.entered_as
  from public.chore_completions cp where cp.cycle_id = cy.id;

  update public.chore_cycles set status = p_status, closed_at = now(),
    closed_by = case when p_by_kind = 'user' then p_by end, closed_by_kind = p_by_kind,
    close_trigger = p_trigger, close_note = nullif(trim(coalesce(p_note, '')), '')
  where id = cy.id;

  if p_by_kind = 'user' then
    perform private.chore_emit(p_board, cy.id, null, null, 'cycle_closed', jsonb_build_object(
      'status', p_status, 'trigger', p_trigger, 'note', p_note, 'sequence', cy.sequence,
      'required_total', pr.required_total, 'required_done', pr.required_done));
  else
    perform private.chore_emit_system(p_board, cy.id, 'cycle_closed', jsonb_build_object(
      'status', p_status, 'trigger', p_trigger, 'sequence', cy.sequence,
      'required_total', pr.required_total, 'required_done', pr.required_done));
  end if;
  return true;
end;
$$;
revoke all on function private.chore_finish_cycle(public.chore_boards, uuid, text, text, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Tick / untick: now run-aware and closes an auto-reset run exactly once
-- ---------------------------------------------------------------------
drop function public.chore_cell_set(uuid, uuid, uuid, boolean);
create function public.chore_cell_set(
  p_board_id uuid, p_row_id uuid, p_column_id uuid, p_done boolean, p_expected_cycle_id uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  cy public.chore_cycles;
  w public.chore_rows;
  c public.chore_columns;
  v_actor uuid := (select auth.uid());
  v_done boolean := coalesce(p_done, false);
  v_cycle uuid;
  v_as text;
  v_name text;
  v_other record;
  v_count integer;
  v_prev uuid;
begin
  b := private.chore_board_authorize(p_board_id, false, 'share', true);

  -- The run row is locked BEFORE anything is read or written: ticks of one board
  -- serialise, so the completeness check below sees every committed tick and exactly
  -- one of two simultaneous "last" ticks closes the run.
  v_cycle := private.chore_open_cycle(b.id);
  if v_cycle is null then
    raise exception 'This board is between runs. The next run has not started yet.' using errcode = '22023';
  end if;
  select * into cy from public.chore_cycles where id = v_cycle for update;
  if cy.status <> 'open' or (p_expected_cycle_id is not null and p_expected_cycle_id <> cy.id) then
    raise exception 'This run has already ended. Reload to see the current run.' using errcode = 'P0001';
  end if;

  select * into w from public.chore_rows
  where id = p_row_id and board_id = b.id and archived_at is null and is_active for update;
  select * into c from public.chore_columns
  where id = p_column_id and board_id = b.id and archived_at is null and is_active;
  if w.id is null or c.id is null then
    raise exception 'That chore or column is not available.' using errcode = '22023';
  end if;
  if w.requirement_mode = 'selected_columns' and not exists (
       select 1 from public.chore_row_columns rc where rc.row_id = w.id and rc.column_id = c.id) then
    raise exception 'That chore does not apply to this column.' using errcode = '22023';
  end if;

  -- Who may act on this cell. Identity is auth.uid(), never a parameter.
  if c.profile_id = v_actor then
    v_as := 'self';
  elsif c.profile_id is null and private.tasks_workforce_eligible(b.organization_id, b.location_id, v_actor) then
    v_as := 'position';
  elsif b.staff_access = 'any_workforce'
        and private.tasks_workforce_eligible(b.organization_id, b.location_id, v_actor) then
    v_as := 'shared';
  elsif b.manager_override and private.tasks_is_manager(b.organization_id, b.location_id) then
    v_as := 'manager_correction';
  else
    raise exception 'You can only update your own column on this board.' using errcode = '42501';
  end if;

  if v_done then
    if w.requirement_mode = 'any_one' then
      select cp.column_id, cp.completed_by_name into v_other
      from public.chore_completions cp
      where cp.cycle_id = cy.id and cp.row_id = w.id and cp.column_id <> c.id limit 1;
      if found then
        raise exception 'This chore is already done by %.', v_other.completed_by_name using errcode = '22023';
      end if;
    end if;
    select p.display_name into v_name from public.profiles p where p.id = v_actor;
    insert into public.chore_completions (board_id, organization_id, cycle_id, row_id, column_id,
      completed_by, completed_by_name, entered_as)
    values (b.id, b.organization_id, cy.id, w.id, c.id, v_actor, coalesce(v_name, 'Unknown'), v_as)
    on conflict (cycle_id, row_id, column_id) do nothing;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      return 'unchanged';
    end if;
    perform private.chore_emit(b, cy.id, w.id, c.id, 'cell_checked',
      jsonb_build_object('entered_as', v_as, 'row_title', w.title, 'column_label', c.label));
    if cy.structure_version_start is null then
      update public.chore_cycles set structure_version_start = b.structure_version where id = cy.id;
    end if;
    -- Automatic reset: the SYSTEM closes the run the tick just finished (not the ticker).
    if b.reset_intent = 'automatic_after_completion'
       and private.chore_cycle_is_complete(b.id, cy.id) then
      if private.chore_finish_cycle(b, cy.id, 'completed', 'automatic', null, 'system', null) then
        if b.recurrence_intent = 'continuous' then
          perform private.chore_start_run(b, 'system', null, null);
        end if;
        return 'checked_closed';
      end if;
    end if;
    return 'checked';
  end if;

  delete from public.chore_completions
  where cycle_id = cy.id and row_id = w.id and column_id = c.id
  returning completed_by into v_prev;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 'unchanged';
  end if;
  perform private.chore_emit(b, cy.id, w.id, c.id, 'cell_unchecked',
    jsonb_build_object('entered_as', v_as, 'previous_completed_by', v_prev,
      'corrected', v_prev is distinct from v_actor, 'row_title', w.title, 'column_label', c.label));
  return 'unchecked';
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Manager actions: close, start, correct
-- ---------------------------------------------------------------------
-- Close the run the manager is looking at. 'completed' re-evaluates the rule on the
-- server and refuses an unfinished run; 'cancelled' needs a reason and keeps the run
-- as Not Completed. Repeating the call for an already finished run returns
-- 'already_closed' instead of closing anything again.
create function public.chore_cycle_close(
  p_board_id uuid, p_expected_cycle_id uuid, p_outcome text, p_note text, p_start_next boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  cy public.chore_cycles;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_next uuid;
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  if p_outcome not in ('completed', 'cancelled') then
    raise exception 'Unknown way to close a run.' using errcode = '22023';
  end if;
  select * into cy from public.chore_cycles
  where id = p_expected_cycle_id and board_id = b.id for update;
  if not found then
    raise exception 'That run does not exist or you cannot use it.' using errcode = '42501';
  end if;
  if cy.status <> 'open' then
    return jsonb_build_object('result', 'already_closed', 'status', cy.status,
      'closed_cycle_id', cy.id, 'open_cycle_id', private.chore_open_cycle(b.id));
  end if;
  if p_outcome = 'completed' then
    if not private.chore_cycle_is_complete(b.id, cy.id) then
      raise exception 'This run is not complete yet, so it cannot be closed as completed.' using errcode = '22023';
    end if;
  elsif v_note is null or length(v_note) < 3 then
    raise exception 'Say why you are cancelling this run (at least 3 characters).' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 300 then
    raise exception 'The note can be up to 300 characters.' using errcode = '22023';
  end if;
  perform private.chore_finish_cycle(b, cy.id,
    case p_outcome when 'completed' then 'completed' else 'cancelled' end,
    case p_outcome when 'completed' then 'manual' else 'cancelled' end,
    v_actor, 'user', v_note);
  if coalesce(p_start_next, false) then
    v_next := private.chore_start_run(b, 'user', v_actor, null);
  end if;
  return jsonb_build_object('result', 'closed', 'status',
    case p_outcome when 'completed' then 'completed' else 'cancelled' end,
    'closed_cycle_id', cy.id, 'open_cycle_id', v_next);
end;
$$;

-- Start the next run of a board that has none open (between runs, or after a close).
create function public.chore_cycle_start(p_board_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.chore_boards; v_open uuid; v_new uuid;
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', true);
  v_open := private.chore_open_cycle(b.id);
  if v_open is not null then
    return jsonb_build_object('result', 'already_open', 'open_cycle_id', v_open);
  end if;
  v_new := private.chore_start_run(b, 'user', (select auth.uid()), null);
  return jsonb_build_object('result', 'started', 'open_cycle_id', v_new);
end;
$$;

-- Append a correction to a FINISHED run. The snapshot is never edited: the original
-- event stays, and the correction records who, when, why and before / after. Allowed
-- only to a manager and only on boards that explicitly turned the manager override on.
create function public.chore_cycle_correct(
  p_cycle_id uuid, p_row_id uuid, p_column_id uuid, p_done boolean, p_reason text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  s public.chore_cycle_snapshots;
  r public.chore_cycle_snapshot_rows;
  v_board uuid;
  v_actor uuid := (select auth.uid());
  v_reason text := trim(coalesce(p_reason, ''));
  v_before boolean;
  v_cell public.chore_cycle_snapshot_cells;
  v_name text;
begin
  select board_id into v_board from public.chore_cycles where id = p_cycle_id;
  if v_board is null then
    raise exception 'That board does not exist or you cannot use it.' using errcode = '42501';
  end if;
  b := private.chore_board_authorize(v_board, true, 'update', false, true);
  if not b.manager_override then
    raise exception 'Corrections are off for this board. Turn on manager correction in Manage → Access first.'
      using errcode = '42501';
  end if;
  select * into s from public.chore_cycle_snapshots where cycle_id = p_cycle_id and board_id = b.id;
  if not found then
    raise exception 'Only a finished run can be corrected. Change an open run by checking its cells.'
      using errcode = '22023';
  end if;
  if length(v_reason) not between 3 and 300 then
    raise exception 'Give a reason for the correction (3 to 300 characters).' using errcode = '22023';
  end if;
  -- Serialise corrections of one run (FOR UPDATE does not fire the freeze trigger).
  perform 1 from public.chore_cycles where id = p_cycle_id for update;
  select * into r from public.chore_cycle_snapshot_rows where cycle_id = p_cycle_id and row_id = p_row_id;
  if not found or not exists (select 1 from public.chore_cycle_snapshot_columns k
      where k.cycle_id = p_cycle_id and k.column_id = p_column_id) then
    raise exception 'That chore or column was not part of this run.' using errcode = '22023';
  end if;
  if r.requirement_mode = 'selected_columns' and not (p_column_id = any (r.selected_column_ids)) then
    raise exception 'That chore did not apply to this column.' using errcode = '22023';
  end if;
  select * into v_cell from public.chore_cycle_snapshot_cells
  where cycle_id = p_cycle_id and row_id = p_row_id and column_id = p_column_id;
  v_before := coalesce(
    (select k.done_after from public.chore_cycle_corrections k
     where k.cycle_id = p_cycle_id and k.row_id = p_row_id and k.column_id = p_column_id
     order by k.id desc limit 1),
    v_cell.cycle_id is not null);
  if v_before = coalesce(p_done, false) then
    return 'unchanged';
  end if;
  if coalesce(p_done, false) and r.requirement_mode = 'any_one' and exists (
       select 1 from public.chore_cycle_snapshot_columns k
       where k.cycle_id = p_cycle_id and k.column_id <> p_column_id
         and coalesce(
           (select x.done_after from public.chore_cycle_corrections x
            where x.cycle_id = p_cycle_id and x.row_id = p_row_id and x.column_id = k.column_id
            order by x.id desc limit 1),
           exists (select 1 from public.chore_cycle_snapshot_cells sc
                   where sc.cycle_id = p_cycle_id and sc.row_id = p_row_id and sc.column_id = k.column_id))) then
    raise exception 'This chore is already done by someone else in that run.' using errcode = '22023';
  end if;
  select display_name into v_name from public.profiles where id = v_actor;
  insert into public.chore_cycle_corrections (cycle_id, board_id, organization_id, row_id, column_id,
    done_before, done_after, before_completed_by_name, before_completed_at, reason, corrected_by, corrected_by_name)
  values (p_cycle_id, b.id, b.organization_id, p_row_id, p_column_id, v_before, coalesce(p_done, false),
    v_cell.completed_by_name, v_cell.completed_at, v_reason, v_actor, coalesce(v_name, 'Unknown'));
  perform private.chore_emit(b, p_cycle_id, p_row_id, p_column_id, 'cycle_corrected', jsonb_build_object(
    'from', v_before, 'to', coalesce(p_done, false), 'reason', v_reason, 'sequence', s.sequence));
  return 'corrected';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. The sweep: the ONLY automation entry point
-- ---------------------------------------------------------------------
-- Any signed-in member with Tasks access to the location may call it (same authority as
-- the reminder sweep). It names no board, time or outcome: for every live, auto-reset
-- board it (1) closes a complete run, (2) expires a stale daily / weekly run as NOT
-- completed, and (3) opens at most ONE run for the current period. Boards another
-- transaction is working on are skipped and picked up by the next call. Missed days are
-- never back-filled. Periods are in the LOCATION's time zone (calendar day / ISO week).
create function public.chore_cycles_sweep(p_organization_id uuid, p_location_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  cy public.chore_cycles;
  v_today date := private.chore_local_date(p_location_id);
  v_cur date;
  v_count integer := 0;
  v_has_open boolean;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  for b in
    select * from public.chore_boards x
    where x.organization_id = p_organization_id and x.location_id = p_location_id
      and x.is_active and x.archived_at is null and x.reset_intent = 'automatic_after_completion'
    order by x.sort_order, x.id
    for update skip locked
  loop
    v_cur := private.chore_period_start(b.recurrence_intent, v_today);
    select * into cy from public.chore_cycles where board_id = b.id and status = 'open' for update;
    v_has_open := found;
    if v_has_open then
      if private.chore_cycle_is_complete(b.id, cy.id) then
        perform private.chore_finish_cycle(b, cy.id, 'completed', 'automatic', null, 'system', null);
        v_has_open := false;
        v_count := v_count + 1;
        if b.recurrence_intent = 'continuous' then
          perform private.chore_start_run(b, 'system', null, null);
          v_has_open := true;
        end if;
      elsif v_cur is not null
            and private.chore_period_start(b.recurrence_intent, cy.business_date) < v_cur then
        perform private.chore_finish_cycle(b, cy.id, 'expired', 'expired', null, 'system', null);
        v_has_open := false;
        v_count := v_count + 1;
      end if;
    end if;
    if not v_has_open and v_cur is not null and not exists (
         select 1 from public.chore_cycles c
         where c.board_id = b.id
           and (private.chore_period_start(b.recurrence_intent, c.business_date) = v_cur
                or c.period_key = left(b.recurrence_intent, 1) || ':' || v_cur::text)) then
      perform private.chore_start_run(b, 'system', null,
        left(b.recurrence_intent, 1) || ':' || v_cur::text);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
revoke all on function public.chore_cell_set(uuid, uuid, uuid, boolean, uuid) from public, anon;
revoke all on function public.chore_cycle_close(uuid, uuid, text, text, boolean) from public, anon;
revoke all on function public.chore_cycle_start(uuid) from public, anon;
revoke all on function public.chore_cycle_correct(uuid, uuid, uuid, boolean, text) from public, anon;
revoke all on function public.chore_cycles_sweep(uuid, uuid) from public, anon;
grant execute on function public.chore_cell_set(uuid, uuid, uuid, boolean, uuid) to authenticated;
grant execute on function public.chore_cycle_close(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.chore_cycle_start(uuid) to authenticated;
grant execute on function public.chore_cycle_correct(uuid, uuid, uuid, boolean, text) to authenticated;
grant execute on function public.chore_cycles_sweep(uuid, uuid) to authenticated;

commit;
