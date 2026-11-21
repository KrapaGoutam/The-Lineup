-- V2.0.13 Batch B: Chore Wheel (restaurant chore boards) inside the Tasks module.
--
-- Design (smallest compatible extension; nothing in Tasks V1 / Batch A changes):
--   * TEMPLATE vs EXECUTION are separate tables. A board (chore_boards) with its
--     columns (people / responsibility positions), rows (chores) and the optional
--     selected-column applicability is the TEMPLATE. A cycle (chore_cycles) is one
--     execution of that template; completions (chore_completions) belong to a cycle
--     and reference rows / columns by STABLE id, never by name or position.
--   * Batch B only ever has ONE open cycle per board (created with the board). The
--     status vocabulary, the (board, sequence) key and the "one open cycle" partial
--     unique index are what Batch C builds exactly-once reset, immutable cycle
--     snapshots and History on, with no destructive migration. No scheduler, no
--     automatic reset, no archival engine exists here.
--   * Rows and columns are soft-removed (is_active / archived_at), never deleted, so
--     a completion always keeps resolving. Reassigning a column appends to
--     chore_column_assignments; completions keep the ACTUAL actor they were written
--     with, so a template edit can never rewrite who did something.
--   * Clients SELECT only. Every write is a SECURITY DEFINER RPC that re-derives
--     identity from auth.uid(), re-checks the board's OWN location (the client
--     never names the actor or trusts a location) and appends to chore_events.
--   * Authority reuses the Tasks seams: tasks_can_access_location (live session +
--     canonical role ladder + workforce eligibility), tasks_is_manager (owner,
--     manager, assistant manager at that location), tasks_workforce_eligible
--     (assignees) and the `tasks` module gate. Boards are configured by managers
--     only; staff tick cells according to the board's own access setting.
-- Forward-only. Additive: no existing table, function or policy is modified.
begin;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table public.chore_boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  sort_order integer not null default 0,
  -- Who may tick a cell: the column's own person (own_column) or any workforce
  -- member at this location (any_workforce, e.g. one shared prep tablet).
  staff_access text not null default 'own_column' check (staff_access in ('own_column', 'any_workforce')),
  -- A manager may only tick / untick someone else's cell when this is on.
  manager_override boolean not null default false,
  -- Template default for new chores (the mode itself lives on each chore row).
  default_requirement_mode text not null default 'all_columns'
    check (default_requirement_mode in ('all_columns', 'selected_columns', 'any_one')),
  -- RESERVED for Batch C: persisted so the template carries them, enforced by nothing yet.
  recurrence_intent text not null default 'continuous'
    check (recurrence_intent in ('continuous', 'daily', 'per_shift', 'weekly', 'manual')),
  reset_intent text not null default 'manual_restart'
    check (reset_intent in ('automatic_after_completion', 'manual_restart')),
  version integer not null default 1,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint chore_boards_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint chore_boards_archive_pair check ((archived_at is null) = (archived_by is null)),
  constraint chore_boards_archived_inactive check (archived_at is null or not is_active)
);
create unique index chore_boards_live_name_idx
  on public.chore_boards (location_id, lower(trim(name))) where archived_at is null;
create index chore_boards_location_idx on public.chore_boards (organization_id, location_id, sort_order);
create index chore_boards_created_by_idx on public.chore_boards (created_by);
create index chore_boards_updated_by_idx on public.chore_boards (updated_by) where updated_by is not null;
create index chore_boards_archived_by_idx on public.chore_boards (archived_by) where archived_by is not null;

-- One execution of a board. Batch B: exactly one open cycle per board.
create table public.chore_cycles (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  organization_id uuid not null,
  sequence integer not null check (sequence >= 1),
  status text not null default 'open' check (status in ('open', 'completed', 'closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles (id),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  unique (id, board_id),
  unique (board_id, sequence),
  constraint chore_cycles_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade,
  constraint chore_cycles_closed_pair check ((closed_at is null) = (closed_by is null)),
  constraint chore_cycles_open_not_closed check (status <> 'open' or closed_at is null)
);
create unique index chore_cycles_one_open_idx on public.chore_cycles (board_id) where status = 'open';
create index chore_cycles_board_org_idx on public.chore_cycles (board_id, organization_id);
create index chore_cycles_opened_by_idx on public.chore_cycles (opened_by);
create index chore_cycles_closed_by_idx on public.chore_cycles (closed_by) where closed_by is not null;

-- Person / responsibility columns. profile_id is the underlying employee; label is
-- only what the board shows. Renaming a label never touches the profile.
create table public.chore_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  organization_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 60),
  profile_id uuid references public.profiles (id),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (id, board_id),
  constraint chore_columns_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade,
  constraint chore_columns_archive_pair check ((archived_at is null) = (archived_by is null))
);
-- One live column per person per board (an unassigned position has no profile).
create unique index chore_columns_live_person_idx
  on public.chore_columns (board_id, profile_id)
  where profile_id is not null and archived_at is null and is_active;
create index chore_columns_board_idx on public.chore_columns (board_id, sort_order);
create index chore_columns_board_org_idx on public.chore_columns (board_id, organization_id);
create index chore_columns_profile_idx on public.chore_columns (profile_id) where profile_id is not null;
create index chore_columns_created_by_idx on public.chore_columns (created_by);
create index chore_columns_updated_by_idx on public.chore_columns (updated_by) where updated_by is not null;
create index chore_columns_archived_by_idx on public.chore_columns (archived_by) where archived_by is not null;

-- Who held a column over time (an unassigned stretch has a null profile_id).
create table public.chore_column_assignments (
  id bigint generated always as identity primary key,
  column_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  profile_id uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles (id),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  constraint chore_column_assignments_column_fk
    foreign key (column_id, board_id) references public.chore_columns (id, board_id) on delete cascade,
  constraint chore_column_assignments_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade,
  constraint chore_column_assignments_ended_pair check ((ended_at is null) = (ended_by is null))
);
create unique index chore_column_assignments_open_idx
  on public.chore_column_assignments (column_id) where ended_at is null;
create index chore_column_assignments_column_idx on public.chore_column_assignments (column_id, id desc);
create index chore_column_assignments_board_org_idx on public.chore_column_assignments (board_id, organization_id);
create index chore_column_assignments_profile_idx on public.chore_column_assignments (profile_id) where profile_id is not null;
create index chore_column_assignments_assigned_by_idx on public.chore_column_assignments (assigned_by);
create index chore_column_assignments_ended_by_idx on public.chore_column_assignments (ended_by) where ended_by is not null;

-- Chore rows.
create table public.chore_rows (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  organization_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 120),
  instructions text check (instructions is null or length(instructions) <= 500),
  -- Optional chores can be ticked but never count toward the board total.
  is_required boolean not null default true,
  -- all_columns: every live column. selected_columns: the chore_row_columns set.
  -- any_one: one completion by any live column satisfies the chore.
  requirement_mode text not null default 'all_columns'
    check (requirement_mode in ('all_columns', 'selected_columns', 'any_one')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (id, board_id),
  constraint chore_rows_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade,
  constraint chore_rows_archive_pair check ((archived_at is null) = (archived_by is null))
);
create index chore_rows_board_idx on public.chore_rows (board_id, sort_order);
create index chore_rows_board_org_idx on public.chore_rows (board_id, organization_id);
create index chore_rows_created_by_idx on public.chore_rows (created_by);
create index chore_rows_updated_by_idx on public.chore_rows (updated_by) where updated_by is not null;
create index chore_rows_archived_by_idx on public.chore_rows (archived_by) where archived_by is not null;

-- Selected-columns applicability (used when requirement_mode = 'selected_columns').
create table public.chore_row_columns (
  row_id uuid not null,
  column_id uuid not null,
  board_id uuid not null,
  organization_id uuid not null,
  primary key (row_id, column_id),
  constraint chore_row_columns_row_fk
    foreign key (row_id, board_id) references public.chore_rows (id, board_id) on delete cascade,
  constraint chore_row_columns_column_fk
    foreign key (column_id, board_id) references public.chore_columns (id, board_id) on delete cascade,
  constraint chore_row_columns_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_row_columns_column_idx on public.chore_row_columns (column_id, board_id);
create index chore_row_columns_board_org_idx on public.chore_row_columns (board_id, organization_id);

-- Currently completed cells of a cycle. The row exists only while the cell is
-- done (unticking removes it); every tick / untick is also appended to chore_events.
create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  organization_id uuid not null,
  cycle_id uuid not null,
  row_id uuid not null,
  column_id uuid not null,
  completed_by uuid not null references public.profiles (id),
  -- Name at the time (profiles can be renamed later; the record must not change).
  completed_by_name text not null,
  completed_at timestamptz not null default now(),
  -- self: the column's own person. position: an unassigned position column.
  -- shared: any-workforce board. manager_correction: a manager using the override.
  entered_as text not null check (entered_as in ('self', 'position', 'shared', 'manager_correction')),
  unique (cycle_id, row_id, column_id),
  constraint chore_completions_cycle_fk
    foreign key (cycle_id, board_id) references public.chore_cycles (id, board_id) on delete cascade,
  constraint chore_completions_row_fk
    foreign key (row_id, board_id) references public.chore_rows (id, board_id) on delete cascade,
  constraint chore_completions_column_fk
    foreign key (column_id, board_id) references public.chore_columns (id, board_id) on delete cascade,
  constraint chore_completions_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_completions_cycle_idx on public.chore_completions (cycle_id, board_id);
create index chore_completions_row_idx on public.chore_completions (row_id, board_id);
create index chore_completions_column_idx on public.chore_completions (column_id, board_id);
create index chore_completions_board_org_idx on public.chore_completions (board_id, organization_id);
create index chore_completions_completed_by_idx on public.chore_completions (completed_by);

-- Append-only audit trail. row_id / column_id / cycle_id are plain identifiers
-- (the audit record must outlive any structural change).
create table public.chore_events (
  id bigint generated always as identity primary key,
  board_id uuid not null,
  organization_id uuid not null,
  cycle_id uuid,
  row_id uuid,
  column_id uuid,
  event_type text not null check (event_type in (
    'board_created', 'board_updated', 'board_state', 'board_duplicated', 'boards_reordered',
    'column_created', 'column_updated', 'column_reassigned', 'column_state', 'columns_reordered',
    'row_created', 'row_updated', 'row_state', 'rows_reordered',
    'cell_checked', 'cell_unchecked')),
  actor_profile_id uuid not null references public.profiles (id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chore_events_board_fk
    foreign key (board_id, organization_id) references public.chore_boards (id, organization_id) on delete cascade
);
create index chore_events_board_idx on public.chore_events (board_id, id desc);
create index chore_events_board_org_idx on public.chore_events (board_id, organization_id);
create index chore_events_actor_idx on public.chore_events (actor_profile_id);

create function private.chore_events_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Cascading deletes (organization / board removal) run at trigger depth > 1.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Chore history is append-only.' using errcode = '23514';
end;
$$;
revoke all on function private.chore_events_append_only() from public, anon, authenticated;
create trigger chore_events_append_only
  before update or delete on public.chore_events
  for each row execute function private.chore_events_append_only();

-- ---------------------------------------------------------------------
-- 2. RLS: clients read only; the board's own location decides visibility
-- ---------------------------------------------------------------------
-- Visible = the caller has location access, the Tasks module is on there, and
-- either the board is live (staff) or the caller is a manager there.
create function private.chore_board_visible(p_board_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chore_boards b
    where b.id = p_board_id
      and private.tasks_can_access_location(b.organization_id, b.location_id)
      and private.location_module_allows(b.location_id, 'tasks')
      and (private.tasks_is_manager(b.organization_id, b.location_id)
           or (b.is_active and b.archived_at is null))
  );
$$;
create function private.chore_board_manager(p_board_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chore_boards b
    where b.id = p_board_id
      and private.tasks_is_manager(b.organization_id, b.location_id)
      and private.location_module_allows(b.location_id, 'tasks')
  );
$$;
revoke all on function private.chore_board_visible(uuid) from public, anon;
revoke all on function private.chore_board_manager(uuid) from public, anon;
grant execute on function private.chore_board_visible(uuid) to authenticated;
grant execute on function private.chore_board_manager(uuid) to authenticated;

alter table public.chore_boards enable row level security;
alter table public.chore_cycles enable row level security;
alter table public.chore_columns enable row level security;
alter table public.chore_column_assignments enable row level security;
alter table public.chore_rows enable row level security;
alter table public.chore_row_columns enable row level security;
alter table public.chore_completions enable row level security;
alter table public.chore_events enable row level security;

revoke all on table public.chore_boards, public.chore_cycles, public.chore_columns,
  public.chore_column_assignments, public.chore_rows, public.chore_row_columns,
  public.chore_completions, public.chore_events from public, anon, authenticated;
grant select on table public.chore_boards, public.chore_cycles, public.chore_columns,
  public.chore_column_assignments, public.chore_rows, public.chore_row_columns,
  public.chore_completions, public.chore_events to authenticated;

create policy chore_boards_select on public.chore_boards for select to authenticated
  using (private.chore_board_visible(id));
create policy chore_cycles_select on public.chore_cycles for select to authenticated
  using (private.chore_board_visible(board_id));
create policy chore_columns_select on public.chore_columns for select to authenticated
  using (private.chore_board_visible(board_id));
create policy chore_rows_select on public.chore_rows for select to authenticated
  using (private.chore_board_visible(board_id));
create policy chore_row_columns_select on public.chore_row_columns for select to authenticated
  using (private.chore_board_visible(board_id));
create policy chore_completions_select on public.chore_completions for select to authenticated
  using (private.chore_board_visible(board_id));
-- Assignment history and the audit trail are manager-only reads.
create policy chore_column_assignments_select on public.chore_column_assignments for select to authenticated
  using (private.chore_board_manager(board_id));
create policy chore_events_select on public.chore_events for select to authenticated
  using (private.chore_board_manager(board_id));

-- ---------------------------------------------------------------------
-- 3. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
-- Locks, authorizes and returns the board. One message for "no such board" and
-- "not yours" so an id never reveals whether a foreign board exists.
--   p_manager: configuration (true) or a worker-level action (false)
--   p_lock:    'update' for structure changes, 'share' for cell ticks
--   p_live:    require the board to be switched on (cell ticks)
create function private.chore_board_authorize(
  p_board_id uuid, p_manager boolean, p_lock text, p_live boolean, p_allow_archived boolean default false)
returns public.chore_boards
language plpgsql security definer set search_path = '' as $$
declare b public.chore_boards;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if p_lock = 'share' then
    select * into b from public.chore_boards where id = p_board_id for share;
  else
    select * into b from public.chore_boards where id = p_board_id for update;
  end if;
  if not found or not private.tasks_can_access_location(b.organization_id, b.location_id) then
    raise exception 'That board does not exist or you cannot use it.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(b.location_id, 'tasks');
  if p_manager and not private.tasks_is_manager(b.organization_id, b.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  if not private.tasks_is_manager(b.organization_id, b.location_id)
     and (not b.is_active or b.archived_at is not null) then
    raise exception 'That board does not exist or you cannot use it.' using errcode = '42501';
  end if;
  if b.archived_at is not null and not p_allow_archived then
    raise exception 'This board is archived and can no longer be changed.' using errcode = '22023';
  end if;
  if p_live and not b.is_active then
    raise exception 'This board is turned off.' using errcode = '22023';
  end if;
  return b;
end;
$$;
revoke all on function private.chore_board_authorize(uuid, boolean, text, boolean, boolean) from public, anon, authenticated;

-- Appends one audit row with a live, server-derived actor snapshot.
create function private.chore_emit(
  p_board public.chore_boards, p_cycle_id uuid, p_row_id uuid, p_column_id uuid,
  p_event_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_identity jsonb;
begin
  select jsonb_build_object('profile_id', p.id, 'display_name', p.display_name,
    'overall_role', o.role, 'location_id', p_board.location_id, 'organization_id', p_board.organization_id,
    'effective_level', private.tasks_profile_level(p_board.organization_id, p_board.location_id, p.id))
  into v_identity
  from public.profiles p left join public.overall_roles o on o.profile_id = p.id
  where p.id = v_actor;
  insert into public.chore_events (board_id, organization_id, cycle_id, row_id, column_id,
    event_type, actor_profile_id, payload)
  values (p_board.id, p_board.organization_id, p_cycle_id, p_row_id, p_column_id,
    p_event_type, v_actor, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('actor', v_identity));
end;
$$;
revoke all on function private.chore_emit(public.chore_boards, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

create function private.chore_open_cycle(p_board_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.chore_cycles where board_id = p_board_id and status = 'open';
$$;
revoke all on function private.chore_open_cycle(uuid) from public, anon, authenticated;

-- A person already holding another live column of the board.
create function private.chore_person_taken(p_board_id uuid, p_profile_id uuid, p_except_column uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_profile_id is not null and exists (
    select 1 from public.chore_columns c
    where c.board_id = p_board_id and c.profile_id = p_profile_id
      and c.archived_at is null and c.is_active
      and (p_except_column is null or c.id <> p_except_column));
$$;
revoke all on function private.chore_person_taken(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Boards
-- ---------------------------------------------------------------------
create function public.chore_board_save(
  p_organization_id uuid,
  p_location_id uuid,
  p_board_id uuid,
  p_name text,
  p_description text,
  p_staff_access text,
  p_manager_override boolean,
  p_default_mode text,
  p_recurrence_intent text,
  p_reset_intent text,
  p_expected_version integer
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  v_actor uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_access text := coalesce(p_staff_access, 'own_column');
  v_mode text := coalesce(p_default_mode, 'all_columns');
  v_rec text := coalesce(p_recurrence_intent, 'continuous');
  v_reset text := coalesce(p_reset_intent, 'manual_restart');
  v_override boolean := coalesce(p_manager_override, false);
  v_id uuid;
  v_order integer;
begin
  -- Authorize FIRST: a caller without authority learns nothing about validation.
  if p_board_id is null then
    perform private.tasks_begin(p_organization_id, p_location_id);
    perform private.tasks_require_manager(p_organization_id, p_location_id);
  else
    b := private.chore_board_authorize(p_board_id, true, 'update', false);
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Give the board a name (up to 80 characters).' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 500 then
    raise exception 'The description can be up to 500 characters.' using errcode = '22023';
  end if;
  if v_access not in ('own_column', 'any_workforce') then
    raise exception 'Unknown access setting.' using errcode = '22023';
  end if;
  if v_mode not in ('all_columns', 'selected_columns', 'any_one') then
    raise exception 'Unknown completion rule.' using errcode = '22023';
  end if;
  if v_rec not in ('continuous', 'daily', 'per_shift', 'weekly', 'manual') then
    raise exception 'Unknown recurrence.' using errcode = '22023';
  end if;
  if v_reset not in ('automatic_after_completion', 'manual_restart') then
    raise exception 'Unknown reset mode.' using errcode = '22023';
  end if;

  if p_board_id is null then
    if (select count(*) from public.chore_boards x
        where x.location_id = p_location_id and x.archived_at is null) >= 25 then
      raise exception 'A location can have up to 25 chore boards. Archive one first.' using errcode = '22023';
    end if;
    select coalesce(max(x.sort_order), 0) + 10 into v_order
    from public.chore_boards x where x.location_id = p_location_id;
    begin
      insert into public.chore_boards (organization_id, location_id, name, description, sort_order,
        staff_access, manager_override, default_requirement_mode, recurrence_intent, reset_intent,
        created_by, updated_by)
      values (p_organization_id, p_location_id, v_name, v_desc, v_order,
        v_access, v_override, v_mode, v_rec, v_reset, v_actor, v_actor)
      returning * into b;
    exception when unique_violation then
      raise exception 'A board with that name already exists at this location.' using errcode = '22023';
    end;
    insert into public.chore_cycles (board_id, organization_id, sequence, opened_by)
    values (b.id, b.organization_id, 1, v_actor);
    perform private.chore_emit(b, private.chore_open_cycle(b.id), null, null, 'board_created',
      jsonb_build_object('name', b.name));
    return b.id;
  end if;

  if p_expected_version is not null and p_expected_version <> b.version then
    raise exception 'This board was changed by someone else. Reload and try again.' using errcode = 'P0001';
  end if;
  begin
    update public.chore_boards set
      name = v_name, description = v_desc, staff_access = v_access, manager_override = v_override,
      default_requirement_mode = v_mode, recurrence_intent = v_rec, reset_intent = v_reset,
      version = version + 1, updated_by = v_actor, updated_at = now()
    where id = b.id;
  exception when unique_violation then
    raise exception 'A board with that name already exists at this location.' using errcode = '22023';
  end;
  perform private.chore_emit(b, null, null, null, 'board_updated', jsonb_build_object(
    'changed', (select coalesce(jsonb_agg(k), '[]'::jsonb) from (values
      ('name', b.name is distinct from v_name),
      ('description', b.description is distinct from v_desc),
      ('staff_access', b.staff_access <> v_access),
      ('manager_override', b.manager_override <> v_override),
      ('default_requirement_mode', b.default_requirement_mode <> v_mode),
      ('recurrence_intent', b.recurrence_intent <> v_rec),
      ('reset_intent', b.reset_intent <> v_reset)) as t(k, changed) where changed)));
  return b.id;
end;
$$;

create function public.chore_board_set_state(p_board_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
declare b public.chore_boards; v_actor uuid := (select auth.uid());
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  if p_state not in ('active', 'inactive', 'archived') then
    raise exception 'Unknown board state.' using errcode = '22023';
  end if;
  if p_state = 'archived' then
    update public.chore_boards set is_active = false, archived_at = now(), archived_by = v_actor,
      version = version + 1, updated_by = v_actor, updated_at = now() where id = b.id;
  else
    update public.chore_boards set is_active = (p_state = 'active'),
      version = version + 1, updated_by = v_actor, updated_at = now() where id = b.id;
  end if;
  perform private.chore_emit(b, null, null, null, 'board_state',
    jsonb_build_object('from', case when b.is_active then 'active' else 'inactive' end, 'to', p_state));
end;
$$;

-- Copies a board's CONFIGURATION (settings, live columns with their assignees, live
-- chores and their selected columns) into a new board with a fresh cycle 1. No
-- completions, history or audit rows are copied. A source that is archived may be
-- duplicated: that is the way to bring an archived board back.
create function public.chore_board_duplicate(p_board_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.chore_boards;
  n public.chore_boards;
  v_actor uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_col_map jsonb := '{}'::jsonb;
  v_row_map jsonb := '{}'::jsonb;
  v_new uuid;
  r record;
begin
  s := private.chore_board_authorize(p_board_id, true, 'update', false, true);
  if length(v_name) not between 1 and 80 then
    raise exception 'Give the new board a name (up to 80 characters).' using errcode = '22023';
  end if;
  if (select count(*) from public.chore_boards x
      where x.location_id = s.location_id and x.archived_at is null) >= 25 then
    raise exception 'A location can have up to 25 chore boards. Archive one first.' using errcode = '22023';
  end if;
  begin
    insert into public.chore_boards (organization_id, location_id, name, description, sort_order,
      staff_access, manager_override, default_requirement_mode, recurrence_intent, reset_intent,
      created_by, updated_by)
    values (s.organization_id, s.location_id, v_name, s.description,
      (select coalesce(max(x.sort_order), 0) + 10 from public.chore_boards x where x.location_id = s.location_id),
      s.staff_access, s.manager_override, s.default_requirement_mode, s.recurrence_intent, s.reset_intent,
      v_actor, v_actor)
    returning * into n;
  exception when unique_violation then
    raise exception 'A board with that name already exists at this location.' using errcode = '22023';
  end;
  insert into public.chore_cycles (board_id, organization_id, sequence, opened_by)
  values (n.id, n.organization_id, 1, v_actor);

  for r in select * from public.chore_columns c
           where c.board_id = s.id and c.archived_at is null order by c.sort_order, c.created_at loop
    insert into public.chore_columns (board_id, organization_id, label, profile_id, sort_order,
      is_active, created_by, updated_by)
    values (n.id, n.organization_id, r.label, r.profile_id, r.sort_order, r.is_active, v_actor, v_actor)
    returning id into v_new;
    v_col_map := v_col_map || jsonb_build_object(r.id::text, v_new);
    insert into public.chore_column_assignments (column_id, board_id, organization_id, profile_id, assigned_by)
    values (v_new, n.id, n.organization_id, r.profile_id, v_actor);
  end loop;

  for r in select * from public.chore_rows w
           where w.board_id = s.id and w.archived_at is null order by w.sort_order, w.created_at loop
    insert into public.chore_rows (board_id, organization_id, title, instructions, is_required,
      requirement_mode, sort_order, is_active, created_by, updated_by)
    values (n.id, n.organization_id, r.title, r.instructions, r.is_required,
      r.requirement_mode, r.sort_order, r.is_active, v_actor, v_actor)
    returning id into v_new;
    v_row_map := v_row_map || jsonb_build_object(r.id::text, v_new);
  end loop;

  insert into public.chore_row_columns (row_id, column_id, board_id, organization_id)
  select (v_row_map ->> rc.row_id::text)::uuid, (v_col_map ->> rc.column_id::text)::uuid,
         n.id, n.organization_id
  from public.chore_row_columns rc
  where rc.board_id = s.id and v_row_map ? rc.row_id::text and v_col_map ? rc.column_id::text;

  perform private.chore_emit(n, private.chore_open_cycle(n.id), null, null, 'board_duplicated',
    jsonb_build_object('from_board_id', s.id, 'name', n.name));
  return n.id;
end;
$$;

create function public.chore_board_reorder(p_organization_id uuid, p_location_id uuid, p_board_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_actor uuid := (select auth.uid()); b public.chore_boards;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  perform private.tasks_require_manager(p_organization_id, p_location_id);
  select coalesce(array_agg(x order by o), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_board_ids, '{}'::uuid[])) with ordinality as t(x, o) where x is not null;
  if (select count(distinct x) from unnest(v_ids) as x) <> cardinality(v_ids)
     or (select count(*) from public.chore_boards c
         where c.id = any(v_ids) and c.location_id = p_location_id
           and c.organization_id = p_organization_id and c.archived_at is null) <> cardinality(v_ids) then
    raise exception 'That list of boards is not valid for this location.' using errcode = '22023';
  end if;
  -- Serialize reorders of one location through its first board's row lock order.
  perform 1 from public.chore_boards c
    where c.location_id = p_location_id and c.archived_at is null order by c.id for update;
  with ranked as (
    select c.id, row_number() over (order by coalesce(o.ord, 100000 + c.sort_order), c.created_at) as rn
    from public.chore_boards c
    left join unnest(v_ids) with ordinality as o(id, ord) on o.id = c.id
    where c.location_id = p_location_id and c.organization_id = p_organization_id and c.archived_at is null)
  update public.chore_boards c set sort_order = r.rn * 10, updated_at = now()
  from ranked r where c.id = r.id;
  select * into b from public.chore_boards where id = v_ids[1];
  if found then
    perform private.chore_emit(b, null, null, null, 'boards_reordered', jsonb_build_object('order', to_jsonb(v_ids)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Columns (people / responsibility positions)
-- ---------------------------------------------------------------------
create function public.chore_column_save(
  p_board_id uuid, p_column_id uuid, p_label text, p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  c public.chore_columns;
  v_actor uuid := (select auth.uid());
  v_label text := trim(coalesce(p_label, ''));
  v_name text;
  v_id uuid;
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  if p_column_id is not null then
    select * into c from public.chore_columns
    where id = p_column_id and board_id = b.id for update;
    if not found or c.archived_at is not null then
      raise exception 'That column is not available.' using errcode = '22023';
    end if;
  end if;
  -- Only a NEW assignee is validated: a label edit must not fail because the
  -- existing person later left the location (their history is kept as is).
  if p_profile_id is not null and p_profile_id is distinct from c.profile_id then
    if not private.tasks_workforce_eligible(b.organization_id, b.location_id, p_profile_id) then
      raise exception 'Choose someone who works at this location.' using errcode = '22023';
    end if;
    if (p_column_id is null or c.is_active)
       and private.chore_person_taken(b.id, p_profile_id, p_column_id) then
      raise exception 'That person already has a column on this board.' using errcode = '22023';
    end if;
  end if;
  if p_profile_id is not null then
    select display_name into v_name from public.profiles where id = p_profile_id;
  end if;
  if v_label = '' and v_name is not null then
    v_label := left(v_name, 60);
  end if;
  if length(v_label) not between 1 and 60 then
    raise exception 'Give the column a label (up to 60 characters).' using errcode = '22023';
  end if;

  if p_column_id is null then
    if (select count(*) from public.chore_columns x
        where x.board_id = b.id and x.archived_at is null) >= 30 then
      raise exception 'A board can have up to 30 columns. Remove one first.' using errcode = '22023';
    end if;
    insert into public.chore_columns (board_id, organization_id, label, profile_id, sort_order, created_by, updated_by)
    values (b.id, b.organization_id, v_label, p_profile_id,
      (select coalesce(max(x.sort_order), 0) + 10 from public.chore_columns x where x.board_id = b.id),
      v_actor, v_actor)
    returning id into v_id;
    insert into public.chore_column_assignments (column_id, board_id, organization_id, profile_id, assigned_by)
    values (v_id, b.id, b.organization_id, p_profile_id, v_actor);
    perform private.chore_emit(b, null, null, v_id, 'column_created',
      jsonb_build_object('label', v_label, 'profile_id', p_profile_id));
    return v_id;
  end if;

  update public.chore_columns set label = v_label, profile_id = p_profile_id,
    updated_by = v_actor, updated_at = now() where id = c.id;
  if c.label is distinct from v_label then
    perform private.chore_emit(b, null, null, c.id, 'column_updated',
      jsonb_build_object('from_label', c.label, 'to_label', v_label));
  end if;
  if c.profile_id is distinct from p_profile_id then
    update public.chore_column_assignments set ended_at = now(), ended_by = v_actor
    where column_id = c.id and ended_at is null;
    insert into public.chore_column_assignments (column_id, board_id, organization_id, profile_id, assigned_by)
    values (c.id, b.id, b.organization_id, p_profile_id, v_actor);
    perform private.chore_emit(b, null, null, c.id, 'column_reassigned',
      jsonb_build_object('from_profile_id', c.profile_id, 'to_profile_id', p_profile_id));
  end if;
  return c.id;
end;
$$;

create function public.chore_column_set_state(p_column_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards; c public.chore_columns; v_actor uuid := (select auth.uid());
  v_board uuid;
begin
  select board_id into v_board from public.chore_columns where id = p_column_id;
  if v_board is null then
    raise exception 'That board does not exist or you cannot use it.' using errcode = '42501';
  end if;
  b := private.chore_board_authorize(v_board, true, 'update', false);
  if p_state not in ('active', 'inactive', 'archived') then
    raise exception 'Unknown column state.' using errcode = '22023';
  end if;
  select * into c from public.chore_columns where id = p_column_id and board_id = b.id for update;
  if not found or c.archived_at is not null then
    raise exception 'That column is not available.' using errcode = '22023';
  end if;
  if p_state = 'active' and private.chore_person_taken(b.id, c.profile_id, c.id) then
    raise exception 'That person already has another column on this board.' using errcode = '22023';
  end if;
  if p_state = 'archived' then
    update public.chore_columns set is_active = false, archived_at = now(), archived_by = v_actor,
      updated_by = v_actor, updated_at = now() where id = c.id;
    update public.chore_column_assignments set ended_at = now(), ended_by = v_actor
    where column_id = c.id and ended_at is null;
  else
    update public.chore_columns set is_active = (p_state = 'active'),
      updated_by = v_actor, updated_at = now() where id = c.id;
  end if;
  perform private.chore_emit(b, null, null, c.id, 'column_state',
    jsonb_build_object('from', case when c.is_active then 'active' else 'inactive' end, 'to', p_state));
end;
$$;

create function public.chore_columns_reorder(p_board_id uuid, p_column_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare b public.chore_boards; v_ids uuid[];
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  select coalesce(array_agg(x order by o), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_column_ids, '{}'::uuid[])) with ordinality as t(x, o) where x is not null;
  if (select count(distinct x) from unnest(v_ids) as x) <> cardinality(v_ids)
     or (select count(*) from public.chore_columns c
         where c.id = any(v_ids) and c.board_id = b.id and c.archived_at is null) <> cardinality(v_ids) then
    raise exception 'That list of columns is not valid for this board.' using errcode = '22023';
  end if;
  with ranked as (
    select c.id, row_number() over (order by coalesce(o.ord, 100000 + c.sort_order), c.created_at) as rn
    from public.chore_columns c
    left join unnest(v_ids) with ordinality as o(id, ord) on o.id = c.id
    where c.board_id = b.id and c.archived_at is null)
  update public.chore_columns c set sort_order = r.rn * 10, updated_at = now()
  from ranked r where c.id = r.id;
  perform private.chore_emit(b, null, null, null, 'columns_reordered', jsonb_build_object('order', to_jsonb(v_ids)));
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Rows (chores)
-- ---------------------------------------------------------------------
create function public.chore_row_save(
  p_board_id uuid, p_row_id uuid, p_title text, p_instructions text,
  p_required boolean, p_mode text, p_column_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  w public.chore_rows;
  v_actor uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_instr text := nullif(trim(coalesce(p_instructions, '')), '');
  v_mode text := coalesce(p_mode, 'all_columns');
  v_required boolean := coalesce(p_required, true);
  v_cols uuid[];
  v_id uuid;
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  if length(v_title) not between 1 and 120 then
    raise exception 'Give the chore a name (up to 120 characters).' using errcode = '22023';
  end if;
  if v_instr is not null and length(v_instr) > 500 then
    raise exception 'Instructions can be up to 500 characters.' using errcode = '22023';
  end if;
  if v_mode not in ('all_columns', 'selected_columns', 'any_one') then
    raise exception 'Unknown completion rule.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_cols
  from unnest(coalesce(p_column_ids, '{}'::uuid[])) as x where x is not null;
  if v_mode = 'selected_columns' then
    if cardinality(v_cols) = 0 then
      raise exception 'Choose at least one person for a selected-people chore.' using errcode = '22023';
    end if;
    if (select count(*) from public.chore_columns c
        where c.id = any(v_cols) and c.board_id = b.id and c.archived_at is null) <> cardinality(v_cols) then
      raise exception 'Choose columns that are on this board.' using errcode = '22023';
    end if;
  else
    v_cols := '{}'::uuid[];
  end if;

  if p_row_id is null then
    if (select count(*) from public.chore_rows x
        where x.board_id = b.id and x.archived_at is null) >= 100 then
      raise exception 'A board can have up to 100 chores. Remove one first.' using errcode = '22023';
    end if;
    insert into public.chore_rows (board_id, organization_id, title, instructions, is_required,
      requirement_mode, sort_order, created_by, updated_by)
    values (b.id, b.organization_id, v_title, v_instr, v_required, v_mode,
      (select coalesce(max(x.sort_order), 0) + 10 from public.chore_rows x where x.board_id = b.id),
      v_actor, v_actor)
    returning id into v_id;
    perform private.chore_emit(b, null, v_id, null, 'row_created',
      jsonb_build_object('title', v_title, 'mode', v_mode, 'required', v_required));
  else
    select * into w from public.chore_rows where id = p_row_id and board_id = b.id for update;
    if not found or w.archived_at is not null then
      raise exception 'That chore is not available.' using errcode = '22023';
    end if;
    v_id := w.id;
    update public.chore_rows set title = v_title, instructions = v_instr, is_required = v_required,
      requirement_mode = v_mode, updated_by = v_actor, updated_at = now() where id = w.id;
    delete from public.chore_row_columns where row_id = w.id;
    perform private.chore_emit(b, null, w.id, null, 'row_updated', jsonb_build_object(
      'from', jsonb_build_object('title', w.title, 'mode', w.requirement_mode, 'required', w.is_required),
      'to', jsonb_build_object('title', v_title, 'mode', v_mode, 'required', v_required)));
  end if;
  if cardinality(v_cols) > 0 then
    insert into public.chore_row_columns (row_id, column_id, board_id, organization_id)
    select v_id, x, b.id, b.organization_id from unnest(v_cols) as x;
  end if;
  return v_id;
end;
$$;

create function public.chore_row_set_state(p_row_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards; w public.chore_rows; v_actor uuid := (select auth.uid()); v_board uuid;
begin
  select board_id into v_board from public.chore_rows where id = p_row_id;
  if v_board is null then
    raise exception 'That board does not exist or you cannot use it.' using errcode = '42501';
  end if;
  b := private.chore_board_authorize(v_board, true, 'update', false);
  if p_state not in ('active', 'inactive', 'archived') then
    raise exception 'Unknown chore state.' using errcode = '22023';
  end if;
  select * into w from public.chore_rows where id = p_row_id and board_id = b.id for update;
  if not found or w.archived_at is not null then
    raise exception 'That chore is not available.' using errcode = '22023';
  end if;
  if p_state = 'archived' then
    update public.chore_rows set is_active = false, archived_at = now(), archived_by = v_actor,
      updated_by = v_actor, updated_at = now() where id = w.id;
  else
    update public.chore_rows set is_active = (p_state = 'active'),
      updated_by = v_actor, updated_at = now() where id = w.id;
  end if;
  perform private.chore_emit(b, null, w.id, null, 'row_state',
    jsonb_build_object('from', case when w.is_active then 'active' else 'inactive' end, 'to', p_state));
end;
$$;

create function public.chore_rows_reorder(p_board_id uuid, p_row_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare b public.chore_boards; v_ids uuid[];
begin
  b := private.chore_board_authorize(p_board_id, true, 'update', false);
  select coalesce(array_agg(x order by o), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_row_ids, '{}'::uuid[])) with ordinality as t(x, o) where x is not null;
  if (select count(distinct x) from unnest(v_ids) as x) <> cardinality(v_ids)
     or (select count(*) from public.chore_rows c
         where c.id = any(v_ids) and c.board_id = b.id and c.archived_at is null) <> cardinality(v_ids) then
    raise exception 'That list of chores is not valid for this board.' using errcode = '22023';
  end if;
  with ranked as (
    select c.id, row_number() over (order by coalesce(o.ord, 100000 + c.sort_order), c.created_at) as rn
    from public.chore_rows c
    left join unnest(v_ids) with ordinality as o(id, ord) on o.id = c.id
    where c.board_id = b.id and c.archived_at is null)
  update public.chore_rows c set sort_order = r.rn * 10, updated_at = now()
  from ranked r where c.id = r.id;
  perform private.chore_emit(b, null, null, null, 'rows_reordered', jsonb_build_object('order', to_jsonb(v_ids)));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Tick / untick one cell (worker level)
-- ---------------------------------------------------------------------
-- The actor is ALWAYS the authenticated caller: there is no actor argument, so a
-- completion can never be attributed to someone else. Idempotent: a repeat tick
-- is 'unchanged' and never overwrites the first completer.
create function public.chore_cell_set(p_board_id uuid, p_row_id uuid, p_column_id uuid, p_done boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
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

  -- Serialise ticks of the same chore (any_one needs a single winner).
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

  v_cycle := private.chore_open_cycle(b.id);
  if v_cycle is null then
    raise exception 'This board has no open cycle.' using errcode = '22023';
  end if;

  if v_done then
    if w.requirement_mode = 'any_one' then
      select cp.column_id, cp.completed_by_name into v_other
      from public.chore_completions cp
      where cp.cycle_id = v_cycle and cp.row_id = w.id and cp.column_id <> c.id limit 1;
      if found then
        raise exception 'This chore is already done by %.', v_other.completed_by_name using errcode = '22023';
      end if;
    end if;
    select p.display_name into v_name from public.profiles p where p.id = v_actor;
    insert into public.chore_completions (board_id, organization_id, cycle_id, row_id, column_id,
      completed_by, completed_by_name, entered_as)
    values (b.id, b.organization_id, v_cycle, w.id, c.id, v_actor, coalesce(v_name, 'Unknown'), v_as)
    on conflict (cycle_id, row_id, column_id) do nothing;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      return 'unchanged';
    end if;
    perform private.chore_emit(b, v_cycle, w.id, c.id, 'cell_checked',
      jsonb_build_object('entered_as', v_as, 'row_title', w.title, 'column_label', c.label));
    return 'checked';
  end if;

  delete from public.chore_completions
  where cycle_id = v_cycle and row_id = w.id and column_id = c.id
  returning completed_by into v_prev;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 'unchanged';
  end if;
  perform private.chore_emit(b, v_cycle, w.id, c.id, 'cell_unchecked',
    jsonb_build_object('entered_as', v_as, 'previous_completed_by', v_prev,
      'corrected', v_prev is distinct from v_actor, 'row_title', w.title, 'column_label', c.label));
  return 'unchecked';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------
revoke all on function public.chore_board_save(uuid, uuid, uuid, text, text, text, boolean, text, text, text, integer) from public, anon;
revoke all on function public.chore_board_set_state(uuid, text) from public, anon;
revoke all on function public.chore_board_duplicate(uuid, text) from public, anon;
revoke all on function public.chore_board_reorder(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.chore_column_save(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.chore_column_set_state(uuid, text) from public, anon;
revoke all on function public.chore_columns_reorder(uuid, uuid[]) from public, anon;
revoke all on function public.chore_row_save(uuid, uuid, text, text, boolean, text, uuid[]) from public, anon;
revoke all on function public.chore_row_set_state(uuid, text) from public, anon;
revoke all on function public.chore_rows_reorder(uuid, uuid[]) from public, anon;
revoke all on function public.chore_cell_set(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.chore_board_save(uuid, uuid, uuid, text, text, text, boolean, text, text, text, integer) to authenticated;
grant execute on function public.chore_board_set_state(uuid, text) to authenticated;
grant execute on function public.chore_board_duplicate(uuid, text) to authenticated;
grant execute on function public.chore_board_reorder(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.chore_column_save(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.chore_column_set_state(uuid, text) to authenticated;
grant execute on function public.chore_columns_reorder(uuid, uuid[]) to authenticated;
grant execute on function public.chore_row_save(uuid, uuid, text, text, boolean, text, uuid[]) to authenticated;
grant execute on function public.chore_row_set_state(uuid, text) to authenticated;
grant execute on function public.chore_rows_reorder(uuid, uuid[]) to authenticated;
grant execute on function public.chore_cell_set(uuid, uuid, uuid, boolean) to authenticated;

commit;
