-- Tasks V1 / T1 -- domain foundation: schema, RLS, authorization helpers and
-- the trusted task lifecycle RPCs.
--
-- Shape (mirrors Table Rotation V2's trusted-mutation boundary)
--   * Every table is tenant-scoped: organization_id + location_id with
--     composite FKs to locations(id, organization_id) and actor FKs to
--     memberships(organization_id, profile_id). Part 2 (multi-org /
--     multi-location) only has to change private.tasks_can_access_location.
--   * Authenticated clients receive SELECT only. All writes go through
--     SECURITY DEFINER public.task_* RPCs (empty search_path) that read
--     auth.uid(), require an ACTIVE membership row (never
--     organizations.created_by -- the #106 creator bypass in
--     private.has_org_role is not consulted) and write the audit trail.
--   * Role mapping (no role migration): manager+ = owner | general_manager |
--     shift_manager (Owner / Manager / Assistant Manager designations);
--     staff = host | server.
--   * OVERDUE is derived, never stored: tasks.due_at is computed by a trigger
--     in the location's time zone; "overdue" = due_at < now() on an open,
--     in_progress or blocked task.
--   * Completion never rewrites the assignment: completed_by / completed_at
--     live on the task, task_assignments is untouched, so "assigned to
--     Bhoomi, completed by Raj" is two stored facts.
--   * Opening / Closing items are ordinary tasks rows (kind opening|closing)
--     that point at a per-day checklist_instances row (T4/T5 migration adds
--     the generator). One lifecycle / assignment / completion engine.
--
-- Forward-only. Later Tasks V1 phases add RPCs in their own migrations.

-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type public.task_status as enum ('open', 'in_progress', 'blocked', 'completed', 'cancelled');
create type public.task_priority as enum ('normal', 'high', 'urgent');
create type public.task_kind as enum ('task', 'opening', 'closing');
create type public.checklist_kind as enum ('opening', 'closing');
create type public.task_assignment_mode as enum ('individual', 'multiple', 'all_team', 'anyone');
create type public.task_due_window as enum (
  'before_opening', 'during_shift', 'before_dinner', 'closing', 'end_of_night'
);
create type public.task_event_type as enum (
  'created', 'assigned', 'reassigned', 'edited', 'started', 'blocked', 'unblocked',
  'completed', 'reopened', 'cancelled', 'carried_forward',
  'recurrence_created', 'recurrence_changed', 'checklist_generated'
);
create type public.recurrence_frequency as enum (
  'daily', 'weekdays', 'weekly', 'selected_weekdays', 'monthly'
);
create type public.recurrence_end_type as enum ('never', 'on_date', 'after_count');
create type public.task_notification_type as enum (
  'assigned', 'reassigned', 'due_soon', 'overdue', 'completed', 'checklist_available'
);

-- ---------------------------------------------------------------------
-- 2. Reference data: categories (single DB source of truth)
-- ---------------------------------------------------------------------
create table public.task_categories (
  slug text primary key check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order smallint not null default 0
);

insert into public.task_categories (slug, name, sort_order) values
  ('cleaning', 'Cleaning', 10),
  ('opening', 'Opening', 20),
  ('closing', 'Closing', 30),
  ('inventory', 'Inventory', 40),
  ('maintenance', 'Maintenance', 50),
  ('guest_service', 'Guest Service', 60),
  ('kitchen', 'Kitchen', 70),
  ('bar', 'Bar', 80),
  ('safety', 'Safety', 90),
  ('other', 'Other', 100);

-- ---------------------------------------------------------------------
-- 3. Checklist templates (definitions) and recurrence rules (definitions)
-- ---------------------------------------------------------------------
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  kind public.checklist_kind not null,
  name text not null check (length(trim(name)) between 1 and 80),
  -- 0 = Sunday ... 6 = Saturday (extract(dow ...)); which days the template applies to.
  days_of_week smallint[] not null default array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    check (cardinality(days_of_week) > 0 and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  active boolean not null default true,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, organization_id, location_id),
  unique (organization_id, location_id, kind, name),
  constraint checklist_templates_location_tenant_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint checklist_templates_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id)
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  organization_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 160),
  instructions text check (instructions is null or length(instructions) <= 2000),
  category text not null default 'other' references public.task_categories (slug),
  priority public.task_priority not null default 'normal',
  assignment_mode public.task_assignment_mode not null default 'anyone',
  due_window public.task_due_window,
  due_time time,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint checklist_template_items_template_fk
    foreign key (template_id, organization_id) references public.checklist_templates (id, organization_id)
    on delete cascade
);

create table public.checklist_template_item_assignees (
  item_id uuid not null,
  profile_id uuid not null,
  organization_id uuid not null,
  primary key (item_id, profile_id),
  constraint checklist_template_item_assignees_item_fk
    foreign key (item_id, organization_id) references public.checklist_template_items (id, organization_id)
    on delete cascade,
  constraint checklist_template_item_assignees_member_fk
    foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id)
);

create table public.task_recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 160),
  instructions text check (instructions is null or length(instructions) <= 2000),
  category text not null default 'other' references public.task_categories (slug),
  priority public.task_priority not null default 'normal',
  assignment_mode public.task_assignment_mode not null default 'anyone',
  due_time time,
  due_window public.task_due_window,
  frequency public.recurrence_frequency not null,
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) > 0 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 31),
  starts_on date not null,
  end_type public.recurrence_end_type not null default 'never',
  ends_on date,
  max_occurrences integer check (max_occurrences is null or max_occurrences between 1 and 1000),
  active boolean not null default true,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, organization_id, location_id),
  constraint task_recurrence_rules_location_tenant_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint task_recurrence_rules_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint task_recurrence_rules_shape check (
    (frequency not in ('weekly', 'selected_weekdays') or weekdays is not null)
    and (frequency <> 'monthly' or day_of_month is not null)
    and (end_type <> 'on_date' or (ends_on is not null and ends_on >= starts_on))
    and (end_type <> 'after_count' or max_occurrences is not null)
  )
);

create table public.task_recurrence_assignees (
  rule_id uuid not null,
  profile_id uuid not null,
  organization_id uuid not null,
  primary key (rule_id, profile_id),
  constraint task_recurrence_assignees_rule_fk
    foreign key (rule_id, organization_id) references public.task_recurrence_rules (id, organization_id)
    on delete cascade,
  constraint task_recurrence_assignees_member_fk
    foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id)
);

-- One instance per (template, service date): the daily checklist. Its items
-- are tasks rows, so a new day is a new set of rows -- yesterday's checked
-- state can never leak into today.
create table public.checklist_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  template_id uuid not null,
  kind public.checklist_kind not null,
  name text not null,
  service_date date not null,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  unique (template_id, service_date),
  unique (id, organization_id),
  unique (id, organization_id, location_id),
  constraint checklist_instances_template_fk
    foreign key (template_id, organization_id, location_id)
    references public.checklist_templates (id, organization_id, location_id),
  constraint checklist_instances_generator_fk
    foreign key (organization_id, generated_by) references public.memberships (organization_id, profile_id)
);

-- ---------------------------------------------------------------------
-- 4. Tasks, assignments, audit events, notifications
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  kind public.task_kind not null default 'task',
  title text not null check (length(trim(title)) between 1 and 160),
  instructions text check (instructions is null or length(instructions) <= 2000),
  category text not null default 'other' references public.task_categories (slug),
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  assignment_mode public.task_assignment_mode not null default 'anyone',
  start_date date,
  due_date date,
  due_time time,
  due_window public.task_due_window,
  -- Derived by tasks_before_write from due_date/due_time in the location's
  -- time zone. Never client-supplied.
  due_at timestamptz,
  blocked_reason text check (blocked_reason is null or length(trim(blocked_reason)) between 1 and 300),
  started_by uuid,
  started_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  completion_note text check (completion_note is null or length(completion_note) <= 500),
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  -- "Each person required" fan-out: sibling individual tasks share a group.
  group_id uuid,
  recurrence_rule_id uuid,
  occurrence_date date,
  checklist_instance_id uuid,
  template_item_id uuid references public.checklist_template_items (id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (recurrence_rule_id, occurrence_date),
  constraint tasks_location_tenant_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint tasks_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint tasks_starter_fk
    foreign key (organization_id, started_by) references public.memberships (organization_id, profile_id),
  constraint tasks_completer_fk
    foreign key (organization_id, completed_by) references public.memberships (organization_id, profile_id),
  constraint tasks_canceller_fk
    foreign key (organization_id, cancelled_by) references public.memberships (organization_id, profile_id),
  constraint tasks_instance_fk
    foreign key (checklist_instance_id, organization_id, location_id)
    references public.checklist_instances (id, organization_id, location_id),
  constraint tasks_recurrence_fk
    foreign key (recurrence_rule_id, organization_id, location_id)
    references public.task_recurrence_rules (id, organization_id, location_id),
  constraint tasks_due_time_needs_date check (due_time is null or due_date is not null),
  constraint tasks_start_before_due check (start_date is null or due_date is null or start_date <= due_date),
  constraint tasks_completion_consistent check (
    (status = 'completed') = (completed_at is not null)
    and (completed_at is null) = (completed_by is null)
  ),
  constraint tasks_cancel_consistent check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (cancelled_at is null) = (cancelled_by is null)
  ),
  constraint tasks_blocked_has_reason check (status <> 'blocked' or blocked_reason is not null),
  constraint tasks_kind_instance check ((kind = 'task') = (checklist_instance_id is null)),
  constraint tasks_recurrence_pair check ((recurrence_rule_id is null) = (occurrence_date is null)),
  constraint tasks_item_needs_instance check (template_item_id is null or checklist_instance_id is not null)
);

create table public.task_assignments (
  task_id uuid not null,
  profile_id uuid not null,
  organization_id uuid not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, profile_id),
  constraint task_assignments_task_fk
    foreign key (task_id, organization_id) references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_assignments_member_fk
    foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id),
  constraint task_assignments_assigner_fk
    foreign key (organization_id, assigned_by) references public.memberships (organization_id, profile_id)
);

create table public.task_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid,
  checklist_instance_id uuid,
  event_type public.task_event_type not null,
  actor_profile_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  constraint task_events_task_fk
    foreign key (task_id, organization_id) references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_events_instance_fk
    foreign key (checklist_instance_id, organization_id)
    references public.checklist_instances (id, organization_id) on delete cascade,
  constraint task_events_actor_fk
    foreign key (organization_id, actor_profile_id) references public.memberships (organization_id, profile_id)
);

create table public.task_notifications (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_profile_id uuid not null,
  type public.task_notification_type not null,
  task_id uuid,
  checklist_instance_id uuid,
  title text not null check (length(trim(title)) between 1 and 160),
  body text check (body is null or length(body) <= 300),
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_profile_id, dedupe_key),
  constraint task_notifications_recipient_fk
    foreign key (organization_id, recipient_profile_id) references public.memberships (organization_id, profile_id),
  constraint task_notifications_instance_fk
    foreign key (checklist_instance_id, organization_id)
    references public.checklist_instances (id, organization_id) on delete cascade,
  constraint task_notifications_task_fk
    foreign key (task_id, organization_id) references public.tasks (id, organization_id)
    on delete cascade
);

-- Foreign-key and dominant-query indexes.
create index checklist_templates_org_location_idx on public.checklist_templates (organization_id, location_id, kind) where active;
create index checklist_templates_creator_idx on public.checklist_templates (organization_id, created_by);
create index checklist_template_items_template_idx on public.checklist_template_items (template_id, sort_order);
create index checklist_template_items_org_idx on public.checklist_template_items (organization_id);
create index checklist_template_item_assignees_member_idx on public.checklist_template_item_assignees (organization_id, profile_id);
create index task_recurrence_rules_org_location_idx on public.task_recurrence_rules (organization_id, location_id) where active;
create index task_recurrence_rules_creator_idx on public.task_recurrence_rules (organization_id, created_by);
create index task_recurrence_assignees_member_idx on public.task_recurrence_assignees (organization_id, profile_id);
create index checklist_instances_location_date_idx on public.checklist_instances (organization_id, location_id, service_date desc);
create index checklist_instances_generator_idx on public.checklist_instances (organization_id, generated_by) where generated_by is not null;
create index tasks_org_location_status_due_idx on public.tasks (organization_id, location_id, status, due_at);
create index tasks_org_location_due_date_idx on public.tasks (organization_id, location_id, due_date);
create index tasks_instance_idx on public.tasks (checklist_instance_id, sort_order) where checklist_instance_id is not null;
create index tasks_group_idx on public.tasks (group_id) where group_id is not null;
create index tasks_template_item_idx on public.tasks (template_item_id) where template_item_id is not null;
create index tasks_creator_idx on public.tasks (organization_id, created_by);
create index tasks_completer_idx on public.tasks (organization_id, completed_by) where completed_by is not null;
create index tasks_starter_idx on public.tasks (organization_id, started_by) where started_by is not null;
create index tasks_canceller_idx on public.tasks (organization_id, cancelled_by) where cancelled_by is not null;
create index task_assignments_profile_idx on public.task_assignments (profile_id, task_id);
create index task_assignments_task_org_idx on public.task_assignments (task_id, organization_id);
create index task_assignments_member_idx on public.task_assignments (organization_id, profile_id);
create index task_assignments_assigner_idx on public.task_assignments (organization_id, assigned_by);
create index task_events_task_idx on public.task_events (task_id, id desc) where task_id is not null;
create index task_events_org_created_idx on public.task_events (organization_id, created_at desc);
create index task_events_actor_idx on public.task_events (organization_id, actor_profile_id) where actor_profile_id is not null;
create index task_notifications_recipient_idx on public.task_notifications (recipient_profile_id, created_at desc);
create index task_notifications_unread_idx on public.task_notifications (recipient_profile_id) where read_at is null;
create index task_notifications_task_idx on public.task_notifications (task_id, organization_id) where task_id is not null;
create index task_notifications_instance_idx on public.task_notifications (checklist_instance_id) where checklist_instance_id is not null;
create index task_notifications_recipient_member_idx on public.task_notifications (organization_id, recipient_profile_id);

-- ---------------------------------------------------------------------
-- 5. Authorization helpers (membership-only)
-- ---------------------------------------------------------------------
create or replace function private.tasks_is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.active
  );
$$;

-- Owner / Manager / Assistant Manager (general_manager, shift_manager).
create or replace function private.tasks_is_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.active
      and m.roles && array['owner', 'general_manager', 'shift_manager']::public.app_role[]
  );
$$;

-- The single seam for "may this caller use Tasks at this location". Today
-- every active member works every location of the organization; Part 2
-- (profile -> membership -> location access) changes THIS function only.
create or replace function private.tasks_can_access_location(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tasks_is_member(p_organization_id)
    and exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.organization_id = p_organization_id
    );
$$;

create or replace function private.tasks_is_assignee(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_assignments a
    where a.task_id = p_task_id and a.profile_id = (select auth.uid())
  );
$$;

-- Read visibility, shared by the tasks and task_assignments policies.
create or replace function private.tasks_can_view(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and private.tasks_can_access_location(t.organization_id, t.location_id)
      and (
        private.tasks_is_manager(t.organization_id)
        or t.kind <> 'task'
        or t.assignment_mode in ('all_team', 'anyone')
        or private.tasks_is_assignee(t.id)
      )
  );
$$;

-- Who may start / block / complete / reopen: the assignees, anyone for
-- team/shared work, and manager+ (completion on behalf).
create or replace function private.tasks_can_work(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and private.tasks_is_member(t.organization_id)
      and (
        private.tasks_is_manager(t.organization_id)
        or t.assignment_mode in ('all_team', 'anyone')
        or private.tasks_is_assignee(t.id)
      )
  );
$$;

create or replace function private.tasks_location_today(p_location_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone l.time_zone)::date
  from public.locations l
  where l.id = p_location_id;
$$;

revoke all on function private.tasks_is_member(uuid) from public, anon;
revoke all on function private.tasks_is_manager(uuid) from public, anon;
revoke all on function private.tasks_can_access_location(uuid, uuid) from public, anon;
revoke all on function private.tasks_is_assignee(uuid) from public, anon;
revoke all on function private.tasks_can_view(uuid) from public, anon;
revoke all on function private.tasks_can_work(uuid) from public, anon;
revoke all on function private.tasks_location_today(uuid) from public, anon;
-- RLS policies call these as the signed-in user, so authenticated needs EXECUTE.
grant execute on function private.tasks_is_member(uuid) to authenticated;
grant execute on function private.tasks_is_manager(uuid) to authenticated;
grant execute on function private.tasks_can_view(uuid) to authenticated;
grant execute on function private.tasks_can_access_location(uuid, uuid) to authenticated;
revoke all on function private.tasks_is_assignee(uuid) from authenticated;
revoke all on function private.tasks_can_work(uuid) from authenticated;
revoke all on function private.tasks_location_today(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- 6. Row triggers: derived due_at, immutability, append-only events
-- ---------------------------------------------------------------------
create or replace function private.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_item_template uuid;
  v_instance_template uuid;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.location_id is distinct from old.location_id
       or new.kind is distinct from old.kind
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.group_id is distinct from old.group_id
       or new.recurrence_rule_id is distinct from old.recurrence_rule_id
       or new.occurrence_date is distinct from old.occurrence_date
       or new.checklist_instance_id is distinct from old.checklist_instance_id
       or (new.template_item_id is distinct from old.template_item_id
           and new.template_item_id is not null) then
      raise exception 'That part of a task cannot be changed.' using errcode = '23514';
    end if;
  elsif new.checklist_instance_id is not null then
    select i.template_id into v_item_template
    from public.checklist_template_items i
    where i.id = new.template_item_id and i.organization_id = new.organization_id;
    select ci.template_id into v_instance_template
    from public.checklist_instances ci
    where ci.id = new.checklist_instance_id;
    if new.checklist_instance_id is not null and not exists (
      select 1 from public.checklist_instances ci
      where ci.id = new.checklist_instance_id and ci.kind::text = new.kind::text
    ) then
      raise exception 'The task kind does not match its checklist.' using errcode = '23514';
    end if;
    if v_item_template is distinct from v_instance_template then
      raise exception 'The checklist item does not belong to this checklist template.' using errcode = '23514';
    end if;
  end if;

  select l.time_zone into v_tz from public.locations l where l.id = new.location_id;
  if new.due_date is null then
    new.due_at := null;
  elsif new.due_time is not null then
    new.due_at := (new.due_date + new.due_time) at time zone v_tz;
  else
    -- Date-only (with or without a window): due at the end of that local day.
    -- No due date at all means never overdue.
    new.due_at := ((new.due_date + 1)::timestamp) at time zone v_tz;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.tasks_before_write() from public, anon, authenticated;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

create or replace function private.task_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascading deletes (organization / task removal) run at trigger depth > 1.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Task history is append-only.' using errcode = '23514';
end;
$$;

revoke all on function private.task_events_append_only() from public, anon, authenticated;

create trigger task_events_append_only
  before update or delete on public.task_events
  for each row execute function private.task_events_append_only();

create or replace function private.task_events_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Task history is append-only.' using errcode = '23514';
end;
$$;

create trigger task_events_no_truncate
  before truncate on public.task_events
  for each statement execute function private.task_events_no_truncate();

revoke all on function private.task_events_no_truncate() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RLS and grants: clients read, RPCs write
-- ---------------------------------------------------------------------
alter table public.task_categories enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklist_template_item_assignees enable row level security;
alter table public.task_recurrence_rules enable row level security;
alter table public.task_recurrence_assignees enable row level security;
alter table public.checklist_instances enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_events enable row level security;
alter table public.task_notifications enable row level security;

revoke all on table
  public.task_categories,
  public.checklist_templates,
  public.checklist_template_items,
  public.checklist_template_item_assignees,
  public.task_recurrence_rules,
  public.task_recurrence_assignees,
  public.checklist_instances,
  public.tasks,
  public.task_assignments,
  public.task_events,
  public.task_notifications
from public, anon, authenticated;

grant select on table
  public.task_categories,
  public.checklist_templates,
  public.checklist_template_items,
  public.checklist_template_item_assignees,
  public.task_recurrence_rules,
  public.task_recurrence_assignees,
  public.checklist_instances,
  public.tasks,
  public.task_assignments,
  public.task_events,
  public.task_notifications
to authenticated;

create policy task_categories_select on public.task_categories
  for select to authenticated using (true);

-- Definitions are management information.
create policy checklist_templates_select on public.checklist_templates
  for select to authenticated
  using (private.tasks_is_manager(organization_id) and private.tasks_can_access_location(organization_id, location_id));
create policy checklist_template_items_select on public.checklist_template_items
  for select to authenticated using (private.tasks_is_manager(organization_id));
create policy checklist_template_item_assignees_select on public.checklist_template_item_assignees
  for select to authenticated using (private.tasks_is_manager(organization_id));
create policy task_recurrence_rules_select on public.task_recurrence_rules
  for select to authenticated
  using (private.tasks_is_manager(organization_id) and private.tasks_can_access_location(organization_id, location_id));
create policy task_recurrence_assignees_select on public.task_recurrence_assignees
  for select to authenticated using (private.tasks_is_manager(organization_id));

-- A daily checklist is operational: every active member sees it.
create policy checklist_instances_select on public.checklist_instances
  for select to authenticated using (private.tasks_can_access_location(organization_id, location_id));

create policy tasks_select on public.tasks
  for select to authenticated using (private.tasks_can_view(id));
create policy task_assignments_select on public.task_assignments
  for select to authenticated using (private.tasks_can_view(task_id));

-- Management audit history: manager+ only.
create policy task_events_select on public.task_events
  for select to authenticated using (private.tasks_is_manager(organization_id));

create policy task_notifications_select on public.task_notifications
  for select to authenticated
  using (recipient_profile_id = (select auth.uid()) and private.tasks_is_member(organization_id));

-- ---------------------------------------------------------------------
-- 8. Internal write helpers (not callable by clients)
-- ---------------------------------------------------------------------
create or replace function private.tasks_begin(p_organization_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if not private.tasks_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tasks for this location.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.tasks_require_manager(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.tasks_is_manager(p_organization_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.tasks_emit(
  p_organization_id uuid,
  p_task_id uuid,
  p_instance_id uuid,
  p_event_type public.task_event_type,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_events (organization_id, task_id, checklist_instance_id, event_type, actor_profile_id, payload)
  values (p_organization_id, p_task_id, p_instance_id, p_event_type, (select auth.uid()), coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Validates and de-duplicates an assignee list against the assignment mode.
create or replace function private.tasks_validate_assignees(
  p_organization_id uuid,
  p_mode public.task_assignment_mode,
  p_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_ids, '{}'::uuid[])) as x
  where x is not null;

  if p_mode in ('all_team', 'anyone') then
    if cardinality(v_ids) > 0 then
      raise exception 'Team and shared tasks take no individual assignees.' using errcode = '22023';
    end if;
  elsif p_mode = 'individual' then
    if cardinality(v_ids) <> 1 then
      raise exception 'Choose exactly one person for an individual task.' using errcode = '22023';
    end if;
  elsif cardinality(v_ids) < 2 then
    raise exception 'Choose at least two people for a multi-person task.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_ids) as x
    where not exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id and m.profile_id = x and m.active
    )
  ) then
    raise exception 'Every assignee must be an active member of this restaurant.' using errcode = '22023';
  end if;

  return v_ids;
end;
$$;

create or replace function private.tasks_notify(
  p_organization_id uuid,
  p_recipient uuid,
  p_type public.task_notification_type,
  p_task_id uuid,
  p_instance_id uuid,
  p_title text,
  p_body text,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_notifications (
    organization_id, recipient_profile_id, type, task_id, checklist_instance_id, title, body, dedupe_key
  )
  select p_organization_id, p_recipient, p_type, p_task_id, p_instance_id, p_title, left(p_body, 300), p_dedupe_key
  where exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_recipient and m.active
  )
  on conflict (recipient_profile_id, dedupe_key) do nothing;
end;
$$;

-- The one place a task row (and its assignment rows) is created. Used by
-- task_create, recurring generation and daily checklist generation.
create or replace function private.tasks_insert(
  p_organization_id uuid,
  p_location_id uuid,
  p_kind public.task_kind,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_assignment_mode public.task_assignment_mode,
  p_assignees uuid[],
  p_start_date date,
  p_due_date date,
  p_due_time time,
  p_due_window public.task_due_window,
  p_created_by uuid,
  p_group_id uuid,
  p_recurrence_rule_id uuid,
  p_occurrence_date date,
  p_checklist_instance_id uuid,
  p_template_item_id uuid,
  p_sort_order integer,
  p_audit boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_assignee uuid;
begin
  insert into public.tasks (
    organization_id, location_id, kind, title, instructions, category, priority,
    assignment_mode, start_date, due_date, due_time, due_window, created_by,
    group_id, recurrence_rule_id, occurrence_date, checklist_instance_id,
    template_item_id, sort_order
  )
  values (
    p_organization_id, p_location_id, p_kind, trim(p_title), nullif(trim(coalesce(p_instructions, '')), ''),
    coalesce(p_category, 'other'), p_priority, p_assignment_mode, p_start_date, p_due_date, p_due_time,
    p_due_window, p_created_by, p_group_id, p_recurrence_rule_id, p_occurrence_date,
    p_checklist_instance_id, p_template_item_id, coalesce(p_sort_order, 0)
  )
  returning id into v_id;

  foreach v_assignee in array coalesce(p_assignees, '{}'::uuid[]) loop
    insert into public.task_assignments (task_id, profile_id, organization_id, assigned_by)
    values (v_id, v_assignee, p_organization_id, p_created_by);
  end loop;

  if p_audit then
    perform private.tasks_emit(
      p_organization_id, v_id, p_checklist_instance_id, 'created',
      jsonb_build_object(
        'title', trim(p_title), 'kind', p_kind, 'assignment_mode', p_assignment_mode,
        'assignees', to_jsonb(coalesce(p_assignees, '{}'::uuid[])),
        'recurrence_rule_id', p_recurrence_rule_id
      )
    );
  end if;
  return v_id;
end;
$$;

revoke all on function private.tasks_begin(uuid, uuid) from public, anon, authenticated;
revoke all on function private.tasks_require_manager(uuid) from public, anon, authenticated;
revoke all on function private.tasks_emit(uuid, uuid, uuid, public.task_event_type, jsonb) from public, anon, authenticated;
revoke all on function private.tasks_validate_assignees(uuid, public.task_assignment_mode, uuid[]) from public, anon, authenticated;
revoke all on function private.tasks_notify(uuid, uuid, public.task_notification_type, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.tasks_insert(
  uuid, uuid, public.task_kind, text, text, text, public.task_priority, public.task_assignment_mode,
  uuid[], date, date, time, public.task_due_window, uuid, uuid, uuid, date, uuid, uuid, integer, boolean
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Lifecycle RPCs (SECURITY DEFINER; every one authenticates auth.uid())
-- ---------------------------------------------------------------------
create or replace function public.task_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_assignment_mode public.task_assignment_mode,
  p_assignee_ids uuid[],
  p_each_person boolean,
  p_start_date date,
  p_due_date date,
  p_due_time time,
  p_due_window public.task_due_window
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_assignees uuid[];
  v_ids uuid[] := '{}'::uuid[];
  v_group uuid;
  v_person uuid;
  v_row record;
  v_title text := trim(coalesce(p_title, ''));
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  perform private.tasks_require_manager(p_organization_id);

  if length(v_title) not between 1 and 160 then
    raise exception 'Give the task a title (up to 160 characters).' using errcode = '22023';
  end if;
  if p_due_time is not null and p_due_date is null then
    raise exception 'A due time needs a due date.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'The start date cannot be after the due date.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.task_categories c where c.slug = coalesce(p_category, 'other')) then
    raise exception 'Unknown task category.' using errcode = '22023';
  end if;

  v_assignees := private.tasks_validate_assignees(p_organization_id, p_assignment_mode, p_assignee_ids);

  if coalesce(p_each_person, false) then
    if p_assignment_mode <> 'multiple' then
      raise exception 'Each-person completion needs a multi-person task.' using errcode = '22023';
    end if;
    v_group := gen_random_uuid();
    foreach v_person in array v_assignees loop
      v_ids := v_ids || private.tasks_insert(
        p_organization_id, p_location_id, 'task', v_title, p_instructions, p_category, p_priority,
        'individual', array[v_person], p_start_date, p_due_date, p_due_time, p_due_window,
        v_actor, v_group, null, null, null, null, 0, true
      );
    end loop;
  else
    v_ids := array[private.tasks_insert(
      p_organization_id, p_location_id, 'task', v_title, p_instructions, p_category, p_priority,
      p_assignment_mode, v_assignees, p_start_date, p_due_date, p_due_time, p_due_window,
      v_actor, null, null, null, null, null, 0, true
    )];
  end if;

  -- Tell each assignee (not the manager who just assigned themselves).
  for v_row in
    select a.task_id, a.profile_id
    from public.task_assignments a
    where a.task_id = any(v_ids) and a.profile_id <> v_actor
  loop
    perform private.tasks_notify(
      p_organization_id, v_row.profile_id, 'assigned', v_row.task_id, null,
      'New task for you', v_title, null
    );
  end loop;

  return v_ids;
end;
$$;

create or replace function public.task_update(
  p_task_id uuid,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_start_date date,
  p_due_date date,
  p_due_time time,
  p_due_window public.task_due_window
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_title text := trim(coalesce(p_title, ''));
  v_instructions text := nullif(trim(coalesce(p_instructions, '')), '');
  v_before jsonb;
  v_after jsonb;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_is_manager(t.organization_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be edited.' using errcode = '22023';
  end if;
  if length(v_title) not between 1 and 160 then
    raise exception 'Give the task a title (up to 160 characters).' using errcode = '22023';
  end if;
  if p_due_time is not null and p_due_date is null then
    raise exception 'A due time needs a due date.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'The start date cannot be after the due date.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.task_categories c where c.slug = coalesce(p_category, 'other')) then
    raise exception 'Unknown task category.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'title', t.title, 'instructions', t.instructions, 'category', t.category, 'priority', t.priority,
    'start_date', t.start_date, 'due_date', t.due_date, 'due_time', t.due_time, 'due_window', t.due_window
  );
  v_after := jsonb_build_object(
    'title', v_title, 'instructions', v_instructions, 'category', coalesce(p_category, 'other'),
    'priority', p_priority, 'start_date', p_start_date, 'due_date', p_due_date,
    'due_time', p_due_time, 'due_window', p_due_window
  );
  if v_before = v_after then
    return;
  end if;

  update public.tasks set
    title = v_title, instructions = v_instructions, category = coalesce(p_category, 'other'),
    priority = p_priority, start_date = p_start_date, due_date = p_due_date,
    due_time = p_due_time, due_window = p_due_window, updated_by = (select auth.uid())
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'edited',
    jsonb_build_object('before', v_before, 'after', v_after)
  );
end;
$$;

create or replace function public.task_assign(
  p_task_id uuid,
  p_assignment_mode public.task_assignment_mode,
  p_assignee_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
  v_new uuid[];
  v_old uuid[];
  v_person uuid;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_is_manager(t.organization_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be reassigned.' using errcode = '22023';
  end if;

  v_new := private.tasks_validate_assignees(t.organization_id, p_assignment_mode, p_assignee_ids);
  select coalesce(array_agg(a.profile_id order by a.profile_id), '{}'::uuid[]) into v_old
  from public.task_assignments a where a.task_id = t.id;

  if v_old = v_new and t.assignment_mode = p_assignment_mode then
    return;
  end if;

  delete from public.task_assignments a
  where a.task_id = t.id and not (a.profile_id = any(v_new));
  insert into public.task_assignments (task_id, profile_id, organization_id, assigned_by)
  select t.id, x, t.organization_id, v_actor
  from unnest(v_new) as x
  on conflict (task_id, profile_id) do nothing;

  update public.tasks
  set assignment_mode = p_assignment_mode, updated_by = v_actor
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'reassigned',
    jsonb_build_object(
      'from', jsonb_build_object('mode', t.assignment_mode, 'assignees', to_jsonb(v_old)),
      'to', jsonb_build_object('mode', p_assignment_mode, 'assignees', to_jsonb(v_new))
    )
  );

  if t.kind = 'task' then
    for v_person in
      select x from unnest(v_new) as x where x <> v_actor and not (x = any(v_old))
    loop
      perform private.tasks_notify(
        t.organization_id, v_person, 'reassigned', t.id, null, 'A task was assigned to you', t.title, null
      );
    end loop;
  end if;
end;
$$;

-- open -> in_progress | blocked; in_progress -> blocked; blocked -> open | in_progress.
create or replace function public.task_set_status(
  p_task_id uuid,
  p_status public.task_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_event public.task_event_type;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_can_work(p_task_id) then
    raise exception 'That task does not exist or you cannot update it.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status = p_status then
    return;
  end if;

  if not (
    (t.status = 'open' and p_status in ('in_progress', 'blocked'))
    or (t.status = 'in_progress' and p_status = 'blocked')
    or (t.status = 'blocked' and p_status in ('open', 'in_progress'))
  ) then
    raise exception 'That status change is not allowed.' using errcode = '22023';
  end if;

  if p_status = 'blocked' then
    if v_reason is null or length(v_reason) > 300 then
      raise exception 'Say what is blocking this task (up to 300 characters).' using errcode = '22023';
    end if;
    v_event := 'blocked';
  elsif t.status = 'blocked' then
    v_event := 'unblocked';
  else
    v_event := 'started';
  end if;

  update public.tasks set
    status = p_status,
    blocked_reason = case when p_status = 'blocked' then v_reason else null end,
    started_by = case when p_status = 'in_progress' and started_at is null then v_actor else started_by end,
    started_at = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
    updated_by = v_actor
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, v_event,
    jsonb_build_object('from', t.status, 'to', p_status, 'reason', v_reason)
  );
end;
$$;

create or replace function public.task_complete(p_task_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_assignees uuid[];
  v_on_behalf boolean;
  v_person uuid;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_can_work(p_task_id) then
    raise exception 'That task does not exist or you cannot complete it.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  -- Two people checking the same item at once: the first one wins, the
  -- second is a no-op (the original completer is never overwritten).
  if t.status = 'completed' then
    return;
  end if;
  if t.status = 'cancelled' then
    raise exception 'A cancelled task cannot be completed.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Completion notes are limited to 500 characters.' using errcode = '22023';
  end if;

  select coalesce(array_agg(a.profile_id), '{}'::uuid[]) into v_assignees
  from public.task_assignments a where a.task_id = t.id;
  v_on_behalf := cardinality(v_assignees) > 0 and not (v_actor = any(v_assignees));

  -- Assignments are deliberately NOT touched: assignee and completer are
  -- two separate stored facts.
  update public.tasks set
    status = 'completed', completed_by = v_actor, completed_at = now(),
    completion_note = v_note, blocked_reason = null, updated_by = v_actor
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'completed',
    jsonb_build_object('on_behalf', v_on_behalf, 'assignees', to_jsonb(v_assignees), 'note', v_note)
  );

  if t.kind = 'task' then
    if v_on_behalf then
      foreach v_person in array v_assignees loop
        perform private.tasks_notify(
          t.organization_id, v_person, 'completed', t.id, null, 'Your task was completed for you', t.title, null
        );
      end loop;
    elsif t.created_by <> v_actor then
      perform private.tasks_notify(
        t.organization_id, t.created_by, 'completed', t.id, null, 'Task completed', t.title, null
      );
    end if;
  end if;
end;
$$;

create or replace function public.task_reopen(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_can_work(p_task_id) then
    raise exception 'That task does not exist or you cannot update it.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status <> 'completed' then
    return;
  end if;
  -- Undoing a completion is for whoever recorded it or a manager, not any
  -- teammate who could have worked the task.
  if not (private.tasks_is_manager(t.organization_id) or t.completed_by = v_actor) then
    raise exception 'Only the person who completed this task or a manager can reopen it.' using errcode = '42501';
  end if;

  update public.tasks set
    status = 'open', completed_by = null, completed_at = null, completion_note = null,
    updated_by = v_actor
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'reopened',
    jsonb_build_object('previous_completed_by', t.completed_by, 'previous_completed_at', t.completed_at)
  );
end;
$$;

create or replace function public.task_cancel(p_task_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_is_manager(t.organization_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status = 'cancelled' then
    return;
  end if;
  if t.status = 'completed' then
    raise exception 'A completed task cannot be cancelled. Reopen it first.' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 300 then
    raise exception 'Cancel reasons are limited to 300 characters.' using errcode = '22023';
  end if;

  update public.tasks set
    status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
    cancel_reason = v_reason, blocked_reason = null, updated_by = v_actor
  where id = t.id;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'cancelled',
    jsonb_build_object('from', t.status, 'reason', v_reason)
  );
end;
$$;

-- Manual shift handoff: move unfinished work to a later due date.
create or replace function public.task_carry_forward(p_task_ids uuid[], p_new_due_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_id uuid;
  v_count integer := 0;
begin
  if p_new_due_date is null then
    raise exception 'Choose the new due date.' using errcode = '22023';
  end if;

  for v_id in select x from unnest(coalesce(p_task_ids, '{}'::uuid[])) as x order by x loop
    select * into t from public.tasks where id = v_id for update;
    if not found or not private.tasks_is_manager(t.organization_id) then
      raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
    end if;
    perform private.tasks_begin(t.organization_id, t.location_id);

    if t.kind <> 'task' or t.status not in ('open', 'in_progress', 'blocked') then
      continue;
    end if;
    if t.start_date is not null and t.start_date > p_new_due_date then
      raise exception 'The new due date is before the task start date.' using errcode = '22023';
    end if;

    update public.tasks
    set due_date = p_new_due_date, updated_by = (select auth.uid())
    where id = t.id;

    perform private.tasks_emit(
      t.organization_id, t.id, null, 'carried_forward',
      jsonb_build_object('from_due_date', t.due_date, 'to_due_date', p_new_due_date)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.task_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], boolean, date, date, time, public.task_due_window) from public, anon;
revoke all on function public.task_update(uuid, text, text, text, public.task_priority, date, date, time, public.task_due_window) from public, anon;
revoke all on function public.task_assign(uuid, public.task_assignment_mode, uuid[]) from public, anon;
revoke all on function public.task_set_status(uuid, public.task_status, text) from public, anon;
revoke all on function public.task_complete(uuid, text) from public, anon;
revoke all on function public.task_reopen(uuid) from public, anon;
revoke all on function public.task_cancel(uuid, text) from public, anon;
revoke all on function public.task_carry_forward(uuid[], date) from public, anon;

grant execute on function public.task_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], boolean, date, date, time, public.task_due_window) to authenticated;
grant execute on function public.task_update(uuid, text, text, text, public.task_priority, date, date, time, public.task_due_window) to authenticated;
grant execute on function public.task_assign(uuid, public.task_assignment_mode, uuid[]) to authenticated;
grant execute on function public.task_set_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.task_complete(uuid, text) to authenticated;
grant execute on function public.task_reopen(uuid) to authenticated;
grant execute on function public.task_cancel(uuid, text) to authenticated;
grant execute on function public.task_carry_forward(uuid[], date) to authenticated;
