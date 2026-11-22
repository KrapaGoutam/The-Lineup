-- V2.0.13 Batch A (2/2): ordinary-task checklists, archive/delete, explicit
-- status changes and edit conflict detection.
--
-- Design (smallest compatible extension of Tasks V1):
--   * Checklist STEPS belong to an ordinary task (kind = 'task') in a new child
--     table. Opening/Closing items stay what they are: whole tasks rows.
--   * Clients still SELECT only; every write is a SECURITY DEFINER RPC that
--     re-derives identity from auth.uid(), re-checks the task's own location and
--     writes the append-only audit trail. The Tasks authority seams are reused:
--     tasks_is_manager (edit/structure), tasks_can_work (tick a step).
--   * Archiving is a soft state on the task row (archived_at). Active work that
--     is archived becomes `cancelled` as well, so the existing overdue and
--     reminder sweeps, which only look at active statuses, never see it again.
--   * task_delete hard-deletes ONLY a task with no history at all; otherwise it
--     archives. Recurrence occurrences are never hard-deleted (the unique
--     (rule, occurrence_date) key would let the generator recreate them).
--   * Edit conflicts: task_update takes the updated_at the editor loaded and the
--     checklist revision; a mismatch is refused, never silently overwritten.
-- Forward-only. Existing rows and RPC behaviour are preserved.
begin;

-- ---------------------------------------------------------------------
-- 1. Task columns
-- ---------------------------------------------------------------------
alter table public.tasks
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id),
  add column checklist_rev integer not null default 0,
  add constraint tasks_archive_pair check ((archived_at is null) = (archived_by is null));
create index tasks_archived_by_idx on public.tasks (archived_by) where archived_by is not null;

-- ---------------------------------------------------------------------
-- 2. Checklist steps
-- ---------------------------------------------------------------------
create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  organization_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 160),
  sort_order integer not null default 0,
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  archived_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint task_checklist_items_task_fk
    foreign key (task_id, organization_id) references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_checklist_items_completion_pair check ((completed_at is null) = (completed_by is null)),
  constraint task_checklist_items_archive_pair check ((archived_at is null) = (archived_by is null))
);
create index task_checklist_items_task_idx on public.task_checklist_items (task_id, sort_order) where archived_at is null;
create index task_checklist_items_task_org_idx on public.task_checklist_items (task_id, organization_id);
create index task_checklist_items_completed_by_idx on public.task_checklist_items (completed_by) where completed_by is not null;
create index task_checklist_items_archived_by_idx on public.task_checklist_items (archived_by) where archived_by is not null;
create index task_checklist_items_created_by_idx on public.task_checklist_items (created_by);

alter table public.task_checklist_items enable row level security;
revoke all on table public.task_checklist_items from public, anon, authenticated;
grant select on table public.task_checklist_items to authenticated;

-- Whoever may see the task may see its steps; the module gate is restrictive.
create policy task_checklist_items_select on public.task_checklist_items
  for select to authenticated using (private.tasks_can_view(task_id));
create policy task_checklist_items_module_enforcement on public.task_checklist_items
  as restrictive for select to authenticated
  using (private.task_scope_module_allows(task_id, null));

-- ---------------------------------------------------------------------
-- 3. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
-- Makes a task's LIVE steps equal to p_items, in order. Items carrying an id
-- keep their identity and completion state (title/position may change); items
-- without one are new; live steps that are not listed are archived, never
-- deleted. Returns whether anything changed. The caller authorizes.
create function private.tasks_checklist_replace(
  p_task_id uuid,
  p_organization_id uuid,
  p_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_changed boolean := false;
  v_ids uuid[] := '{}'::uuid[];
  v_row record;
  v_title text;
  v_id uuid;
  v_new uuid;
begin
  if p_items is null then
    return false;
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'The checklist must be a list of steps.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'A checklist can have up to 50 steps.' using errcode = '22023';
  end if;

  for v_row in
    select e.value as item, e.ordinality::integer as pos
    from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
  loop
    if jsonb_typeof(v_row.item) <> 'object' then
      raise exception 'The checklist must be a list of steps.' using errcode = '22023';
    end if;
    v_title := trim(coalesce(v_row.item ->> 'title', ''));
    if length(v_title) not between 1 and 160 then
      raise exception 'Every checklist step needs a title (up to 160 characters).' using errcode = '22023';
    end if;

    v_id := null;
    if nullif(v_row.item ->> 'id', '') is not null then
      begin
        v_id := (v_row.item ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'That checklist step is not available.' using errcode = '22023';
      end;
      if v_id = any(v_ids) or not exists (
        select 1 from public.task_checklist_items s
        where s.id = v_id and s.task_id = p_task_id and s.organization_id = p_organization_id
          and s.archived_at is null
      ) then
        raise exception 'That checklist step is not available.' using errcode = '22023';
      end if;
    end if;

    if v_id is null then
      insert into public.task_checklist_items (task_id, organization_id, title, sort_order, created_by)
      values (p_task_id, p_organization_id, v_title, v_row.pos, v_actor)
      returning id into v_new;
      v_ids := v_ids || v_new;
      v_changed := true;
    else
      v_ids := v_ids || v_id;
      update public.task_checklist_items
      set title = v_title, sort_order = v_row.pos, updated_at = now()
      where id = v_id and (title is distinct from v_title or sort_order is distinct from v_row.pos);
      if found then
        v_changed := true;
      end if;
    end if;
  end loop;

  update public.task_checklist_items
  set archived_at = now(), archived_by = v_actor, updated_at = now()
  where task_id = p_task_id and organization_id = p_organization_id
    and archived_at is null and not (id = any(v_ids));
  if found then
    v_changed := true;
  end if;
  return v_changed;
end;
$$;
revoke all on function private.tasks_checklist_replace(uuid, uuid, jsonb) from public, anon, authenticated;

-- Soft-removes a task. Active work becomes `cancelled` too so every existing
-- active-status sweep ignores it. The caller has authorized.
create function private.tasks_archive(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  v_actor uuid := (select auth.uid());
  v_active boolean;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.archived_at is not null then
    return;
  end if;
  v_active := t.status in ('open', 'in_progress', 'blocked');
  update public.tasks set
    status = case when v_active then 'cancelled'::public.task_status else status end,
    cancelled_by = case when v_active then v_actor else cancelled_by end,
    cancelled_at = case when v_active then now() else cancelled_at end,
    cancel_reason = case when v_active then p_reason else cancel_reason end,
    blocked_reason = case when v_active then null else blocked_reason end,
    archived_at = now(), archived_by = v_actor, updated_by = v_actor
  where id = t.id;
  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id, 'archived',
    jsonb_build_object('from', t.status, 'reason', p_reason)
  );
end;
$$;
revoke all on function private.tasks_archive(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. task_create: optional initial checklist
-- ---------------------------------------------------------------------
drop function public.task_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], boolean, date, date, time, public.task_due_window);

create function public.task_create(
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
  p_due_window public.task_due_window,
  p_checklist jsonb default null
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
  v_one uuid;
  v_row record;
  v_title text := trim(coalesce(p_title, ''));
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  perform private.tasks_require_manager(p_organization_id, p_location_id);

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

  v_assignees := private.tasks_validate_assignees(p_organization_id, p_location_id, p_assignment_mode, p_assignee_ids);

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

  -- The initial checklist is part of creation: no separate audit entry.
  if p_checklist is not null then
    foreach v_one in array v_ids loop
      perform private.tasks_checklist_replace(v_one, p_organization_id, p_checklist);
    end loop;
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

-- ---------------------------------------------------------------------
-- 5. task_update: conflict detection + checklist editing
-- ---------------------------------------------------------------------
drop function public.task_update(uuid, text, text, text, public.task_priority, date, date, time, public.task_due_window);

create function public.task_update(
  p_task_id uuid,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_start_date date,
  p_due_date date,
  p_due_time time,
  p_due_window public.task_due_window,
  p_expected_updated_at timestamptz default null,
  p_checklist jsonb default null,
  p_expected_checklist_rev integer default null
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
  v_fields_changed boolean;
  v_steps_changed boolean := false;
  v_live integer;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.archived_at is not null then
    raise exception 'Archived tasks cannot be edited.' using errcode = '22023';
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be edited.' using errcode = '22023';
  end if;
  if p_expected_updated_at is not null and t.updated_at <> p_expected_updated_at then
    raise exception 'Someone else changed this task. Close it and open it again to see the latest version.'
      using errcode = 'P0001';
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
  v_fields_changed := v_before <> v_after;

  if p_checklist is not null then
    if t.kind <> 'task' then
      raise exception 'Only ordinary tasks have a checklist.' using errcode = '22023';
    end if;
    if p_expected_checklist_rev is not null and p_expected_checklist_rev <> t.checklist_rev then
      raise exception 'Someone else changed this checklist. Close it and open it again to see the latest version.'
        using errcode = 'P0001';
    end if;
    v_steps_changed := private.tasks_checklist_replace(t.id, t.organization_id, p_checklist);
  end if;

  if not v_fields_changed and not v_steps_changed then
    return;
  end if;

  update public.tasks set
    title = v_title, instructions = v_instructions, category = coalesce(p_category, 'other'),
    priority = p_priority, start_date = p_start_date, due_date = p_due_date,
    due_time = p_due_time, due_window = p_due_window,
    checklist_rev = checklist_rev + case when v_steps_changed then 1 else 0 end,
    updated_by = (select auth.uid())
  where id = t.id;

  if v_fields_changed then
    perform private.tasks_emit(
      t.organization_id, t.id, t.checklist_instance_id, 'edited',
      jsonb_build_object('before', v_before, 'after', v_after)
    );
  end if;
  if v_steps_changed then
    select count(*)::integer into v_live
    from public.task_checklist_items s where s.task_id = t.id and s.archived_at is null;
    perform private.tasks_emit(
      t.organization_id, t.id, t.checklist_instance_id, 'checklist_edited',
      jsonb_build_object('steps', v_live, 'revision', t.checklist_rev + 1)
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Status: every Not Started / In Progress / Completed transition
-- ---------------------------------------------------------------------
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

  if t.archived_at is not null then
    raise exception 'Archived tasks cannot be changed.' using errcode = '22023';
  end if;
  if t.status = p_status then
    return;
  end if;

  -- Reopening a completed task straight into Not Started or In Progress. The
  -- earlier completion stays in the audit trail (payload keeps who/when).
  if t.status = 'completed' then
    if p_status not in ('open', 'in_progress') then
      raise exception 'That status change is not allowed.' using errcode = '22023';
    end if;
    if not (private.tasks_is_manager(t.organization_id, t.location_id) or t.completed_by = v_actor) then
      raise exception 'Only the person who completed this task or a manager can reopen it.' using errcode = '42501';
    end if;
    update public.tasks set
      status = p_status, completed_by = null, completed_at = null, completion_note = null,
      started_by = case when p_status = 'in_progress' and started_at is null then v_actor else started_by end,
      started_at = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
      updated_by = v_actor
    where id = t.id;
    perform private.tasks_emit(
      t.organization_id, t.id, t.checklist_instance_id, 'reopened',
      jsonb_build_object(
        'from', t.status, 'to', p_status,
        'previous_completed_by', t.completed_by, 'previous_completed_at', t.completed_at
      )
    );
    return;
  end if;

  if not (
    (t.status = 'open' and p_status in ('in_progress', 'blocked'))
    or (t.status = 'in_progress' and p_status in ('open', 'blocked'))
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
  elsif p_status = 'in_progress' then
    v_event := 'started';
  else
    v_event := 'status_changed';
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
  if t.archived_at is not null then
    raise exception 'Archived tasks cannot be changed.' using errcode = '22023';
  end if;
  -- Undoing a completion is for whoever recorded it or a manager, not any
  -- teammate who could have worked the task.
  if not (private.tasks_is_manager(t.organization_id, t.location_id) or t.completed_by = v_actor) then
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

-- ---------------------------------------------------------------------
-- 7. Delete (history-free) or archive
-- ---------------------------------------------------------------------
create function public.task_delete(p_task_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.kind <> 'task' then
    raise exception 'Opening and Closing checklist items cannot be deleted here.' using errcode = '22023';
  end if;
  if t.archived_at is not null then
    return 'archived';
  end if;

  -- Permanently deletable only when nothing worth keeping exists: still Not
  -- Started, never started/completed, not a recurring occurrence, no audit
  -- entry beyond its creation and no step ever ticked or removed.
  if t.status = 'open' and t.started_at is null and t.recurrence_rule_id is null
     and not exists (
       select 1 from public.task_events e where e.task_id = t.id and e.event_type <> 'created'
     )
     and not exists (
       select 1 from public.task_checklist_items s
       where s.task_id = t.id and (s.completed_at is not null or s.archived_at is not null)
     ) then
    delete from public.tasks where id = t.id;
    return 'deleted';
  end if;

  perform private.tasks_archive(t.id, null);
  return 'archived';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Tick / untick one step (anyone who may work the task)
-- ---------------------------------------------------------------------
create function public.task_checklist_step_set(
  p_task_id uuid,
  p_step_id uuid,
  p_done boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  s public.task_checklist_items;
  v_actor uuid := (select auth.uid());
  v_done boolean := coalesce(p_done, false);
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not private.tasks_can_work(p_task_id) then
    raise exception 'That task does not exist or you cannot update it.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.archived_at is not null or t.status in ('completed', 'cancelled') then
    raise exception 'Reopen the task to change its checklist.' using errcode = '22023';
  end if;

  select * into s
  from public.task_checklist_items
  where id = p_step_id and task_id = t.id and organization_id = t.organization_id and archived_at is null
  for update;
  if not found then
    raise exception 'That checklist step is not available.' using errcode = '22023';
  end if;

  -- Two people ticking the same step: the first wins and the original
  -- completer is never overwritten.
  if (s.completed_at is not null) = v_done then
    return;
  end if;

  if v_done then
    update public.task_checklist_items
    set completed_by = v_actor, completed_at = now(), updated_at = now()
    where id = s.id;
  else
    update public.task_checklist_items
    set completed_by = null, completed_at = null, updated_at = now()
    where id = s.id;
  end if;

  perform private.tasks_emit(
    t.organization_id, t.id, t.checklist_instance_id,
    case when v_done then 'checklist_step_checked'::public.task_event_type
         else 'checklist_step_unchecked'::public.task_event_type end,
    jsonb_build_object('step_id', s.id, 'title', s.title)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
revoke all on function public.task_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], boolean, date, date, time, public.task_due_window, jsonb) from public, anon;
revoke all on function public.task_update(uuid, text, text, text, public.task_priority, date, date, time, public.task_due_window, timestamptz, jsonb, integer) from public, anon;
revoke all on function public.task_delete(uuid) from public, anon;
revoke all on function public.task_checklist_step_set(uuid, uuid, boolean) from public, anon;
grant execute on function public.task_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], boolean, date, date, time, public.task_due_window, jsonb) to authenticated;
grant execute on function public.task_update(uuid, text, text, text, public.task_priority, date, date, time, public.task_due_window, timestamptz, jsonb, integer) to authenticated;
grant execute on function public.task_delete(uuid) to authenticated;
grant execute on function public.task_checklist_step_set(uuid, uuid, boolean) to authenticated;

commit;
