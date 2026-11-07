-- V2-005.002: exact location authorization, real actors and source-bound inboxes.
-- Forward-only. No hosted activation/configuration or operational-history rewrite.
begin;

-- Recipients are real workforce members; Overall authority alone is NOT affiliation.
-- Compatibility: one active location and zero assignment rows in the entire tenant.
create function private.tasks_workforce_eligible(p_org uuid, p_location uuid, p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.locations l join public.memberships m
      on m.organization_id = l.organization_id and m.profile_id = p_profile and m.active
    where l.id = p_location and l.organization_id = p_org and l.active and l.archived_at is null
      and (exists (select 1 from public.location_memberships lm
                   where lm.location_id = l.id and lm.profile_id = p_profile and lm.active)
        or ((select count(*) from public.locations x where x.organization_id = p_org
              and x.active and x.archived_at is null) = 1
            and not exists (select 1 from public.location_memberships lm
              join public.locations x on x.id = lm.location_id where x.organization_id = p_org)))
  );
$$;
revoke all on function private.tasks_workforce_eligible(uuid, uuid, uuid) from public, anon, authenticated;

-- Mirrors the canonical resolver: Overall baseline plus independent location role.
create function private.tasks_profile_level(p_org uuid, p_location uuid, p_profile uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.locations l where l.id = p_location
    and l.organization_id = p_org and l.active and l.archived_at is null) then
    greatest(
      coalesce((select case r.role when 'owner' then 4 when 'manager' then 3 else 2 end
                from public.overall_roles r where r.profile_id = p_profile), 0),
      case when private.tasks_workforce_eligible(p_org, p_location, p_profile) then
        coalesce((select case lm.role when 'manager' then 3 when 'assistant_manager' then 2 else 1 end
          from public.location_memberships lm where lm.location_id = p_location
            and lm.profile_id = p_profile and lm.active),
          (select case when 'owner' = any(m.roles) then 4
            when 'general_manager' = any(m.roles) then 3
            when 'shift_manager' = any(m.roles) then 2 else 1 end
           from public.memberships m where m.organization_id = p_org and m.profile_id = p_profile and m.active))
      else 0 end)
    else 0 end;
$$;
revoke all on function private.tasks_profile_level(uuid, uuid, uuid) from public, anon, authenticated;

create function private.tasks_live_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = (select auth.uid()) and (u.banned_until is null or u.banned_until <= now())
      and s.id::text = (select auth.jwt()) ->> 'session_id'
      and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function private.tasks_live_session() from public, anon, authenticated;

create or replace function private.tasks_profile_can_access_location(
  p_organization_id uuid, p_location_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tasks_profile_level(p_organization_id, p_location_id, p_profile_id) > 0;
$$;

create or replace function private.tasks_can_access_location(p_organization_id uuid, p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tasks_live_session()
    and private.tasks_profile_can_access_location(p_organization_id, p_location_id, (select auth.uid()));
$$;

create function private.tasks_is_manager(p_organization_id uuid, p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tasks_can_access_location(p_organization_id, p_location_id)
    and private.tasks_profile_level(p_organization_id, p_location_id, (select auth.uid())) >= 2;
$$;
revoke all on function private.tasks_is_manager(uuid, uuid) from public, anon;
grant execute on function private.tasks_is_manager(uuid, uuid) to authenticated;

create function private.tasks_require_manager(p_organization_id uuid, p_location_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.tasks_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.tasks_require_manager(uuid, uuid) from public, anon, authenticated;

alter table public.checklist_templates add constraint checklist_templates_created_by_profile_fk foreign key (created_by) references public.profiles(id);
alter table public.checklist_templates drop constraint checklist_templates_creator_fk;
create index checklist_templates_created_by_profile_idx on public.checklist_templates(created_by);

alter table public.task_recurrence_rules add constraint task_recurrence_rules_created_by_profile_fk foreign key (created_by) references public.profiles(id);
alter table public.task_recurrence_rules drop constraint task_recurrence_rules_creator_fk;
create index task_recurrence_rules_created_by_profile_idx on public.task_recurrence_rules(created_by);

alter table public.checklist_instances add constraint checklist_instances_generated_by_profile_fk foreign key (generated_by) references public.profiles(id);
alter table public.checklist_instances drop constraint checklist_instances_generator_fk;
create index checklist_instances_generated_by_profile_idx on public.checklist_instances(generated_by);

alter table public.tasks add constraint tasks_created_by_profile_fk foreign key (created_by) references public.profiles(id);
alter table public.tasks drop constraint tasks_creator_fk;
create index tasks_created_by_profile_idx on public.tasks(created_by);

alter table public.tasks add constraint tasks_started_by_profile_fk foreign key (started_by) references public.profiles(id);
alter table public.tasks drop constraint tasks_starter_fk;
create index tasks_started_by_profile_idx on public.tasks(started_by);

alter table public.tasks add constraint tasks_completed_by_profile_fk foreign key (completed_by) references public.profiles(id);
alter table public.tasks drop constraint tasks_completer_fk;
create index tasks_completed_by_profile_idx on public.tasks(completed_by);

alter table public.tasks add constraint tasks_cancelled_by_profile_fk foreign key (cancelled_by) references public.profiles(id);
alter table public.tasks drop constraint tasks_canceller_fk;
create index tasks_cancelled_by_profile_idx on public.tasks(cancelled_by);

alter table public.task_assignments add constraint task_assignments_assigned_by_profile_fk foreign key (assigned_by) references public.profiles(id);
alter table public.task_assignments drop constraint task_assignments_assigner_fk;
create index task_assignments_assigned_by_profile_idx on public.task_assignments(assigned_by);

alter table public.task_events add constraint task_events_actor_profile_id_profile_fk foreign key (actor_profile_id) references public.profiles(id);
alter table public.task_events drop constraint task_events_actor_fk;
create index task_events_actor_profile_id_profile_idx on public.task_events(actor_profile_id);

alter table public.tasks add constraint tasks_updated_by_profile_fk foreign key(updated_by) references public.profiles(id);
create index tasks_updated_by_profile_idx on public.tasks(updated_by) where updated_by is not null;

alter table public.checklist_templates add constraint checklist_templates_updated_by_profile_fk foreign key(updated_by) references public.profiles(id);
create index checklist_templates_updated_by_profile_idx on public.checklist_templates(updated_by) where updated_by is not null;

alter table public.task_recurrence_rules add constraint task_recurrence_rules_updated_by_profile_fk foreign key(updated_by) references public.profiles(id);
create index task_recurrence_rules_updated_by_profile_idx on public.task_recurrence_rules(updated_by) where updated_by is not null;

create or replace function private.tasks_validate_assignees(
  p_organization_id uuid,
  p_location_id uuid,
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
    where not private.tasks_workforce_eligible(p_organization_id, p_location_id, x)
  ) then
    raise exception 'Every assignee must be an active member of this restaurant.' using errcode = '22023';
  end if;

  return v_ids;
end;
$$;
revoke all on function private.tasks_validate_assignees(uuid, uuid, public.task_assignment_mode, uuid[]) from public, anon, authenticated;

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
        private.tasks_is_manager(t.organization_id, t.location_id)
        or t.kind <> 'task'
        or t.assignment_mode in ('all_team', 'anyone')
        or private.tasks_is_assignee(t.id)
      )
  );
$$;

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
      and private.tasks_can_access_location(t.organization_id, t.location_id)
      and (
        private.tasks_is_manager(t.organization_id, t.location_id)
        or t.assignment_mode in ('all_team', 'anyone')
        or private.tasks_is_assignee(t.id)
      )
  );
$$;

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
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
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
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);

  if t.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be reassigned.' using errcode = '22023';
  end if;

  v_new := private.tasks_validate_assignees(t.organization_id, t.location_id, p_assignment_mode, p_assignee_ids);
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
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
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
    if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
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

create or replace function public.checklist_template_save(
  p_organization_id uuid,
  p_location_id uuid,
  p_template_id uuid,
  p_kind public.checklist_kind,
  p_name text,
  p_days_of_week smallint[],
  p_active boolean,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid := p_template_id;
  v_name text := trim(coalesce(p_name, ''));
  v_days smallint[] := coalesce(p_days_of_week, array[0, 1, 2, 3, 4, 5, 6]::smallint[]);
  v_item jsonb;
  v_pos integer := 0;
  v_item_id uuid;
  v_mode public.task_assignment_mode;
  v_assignees uuid[];
  v_category text;
  v_title text;
  v_time time;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  perform private.tasks_require_manager(p_organization_id, p_location_id);

  if length(v_name) not between 1 and 80 then
    raise exception 'Give the template a name (up to 80 characters).' using errcode = '22023';
  end if;
  if cardinality(v_days) = 0 or not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
    raise exception 'Choose the days this checklist applies to.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'A checklist needs an items list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A checklist can have at most 100 items.' using errcode = '22023';
  end if;

  if v_id is null then
    begin
      insert into public.checklist_templates (
        organization_id, location_id, kind, name, days_of_week, active, created_by, updated_by
      )
      values (p_organization_id, p_location_id, p_kind, v_name, v_days, coalesce(p_active, true), v_actor, v_actor)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'A % checklist named "%" already exists.', p_kind, v_name using errcode = '22023';
    end;
  else
    perform 1 from public.checklist_templates t
    where t.id = v_id and t.organization_id = p_organization_id and t.location_id = p_location_id
    for update;
    if not found then
      raise exception 'That checklist does not exist.' using errcode = '42501';
    end if;
    begin
      update public.checklist_templates
      set name = v_name, days_of_week = v_days, active = coalesce(p_active, active), updated_by = v_actor,
          updated_at = now()
      where id = v_id and kind = p_kind;
    exception when unique_violation then
      raise exception 'A % checklist named "%" already exists.', p_kind, v_name using errcode = '22023';
    end;
    if not found then
      raise exception 'A checklist cannot change between opening and closing.' using errcode = '22023';
    end if;
    delete from public.checklist_template_items where template_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_title := trim(coalesce(v_item ->> 'title', ''));
    if length(v_title) not between 1 and 160 then
      raise exception 'Item % needs a title (up to 160 characters).', v_pos using errcode = '22023';
    end if;
    v_category := coalesce(nullif(v_item ->> 'category', ''), 'other');
    if not exists (select 1 from public.task_categories c where c.slug = v_category) then
      raise exception 'Item % has an unknown category.', v_pos using errcode = '22023';
    end if;
    v_mode := coalesce(nullif(v_item ->> 'assignment_mode', ''), 'anyone')::public.task_assignment_mode;
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_assignees
    from jsonb_array_elements_text(coalesce(v_item -> 'assignee_ids', '[]'::jsonb)) as x;
    v_assignees := private.tasks_validate_assignees(p_organization_id, p_location_id, v_mode, v_assignees);
    v_time := nullif(v_item ->> 'due_time', '')::time;

    insert into public.checklist_template_items (
      template_id, organization_id, title, instructions, category, priority,
      assignment_mode, due_window, due_time, sort_order
    )
    values (
      v_id, p_organization_id, v_title,
      nullif(trim(coalesce(v_item ->> 'instructions', '')), ''),
      v_category,
      coalesce(nullif(v_item ->> 'priority', ''), 'normal')::public.task_priority,
      v_mode,
      nullif(v_item ->> 'due_window', '')::public.task_due_window,
      v_time,
      v_pos
    )
    returning id into v_item_id;

    insert into public.checklist_template_item_assignees (item_id, profile_id, organization_id)
    select v_item_id, x, p_organization_id from unnest(v_assignees) as x;
  end loop;

  return v_id;
end;
$$;

create or replace function public.checklist_template_set_active(
  p_template_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.checklist_templates;
begin
  select * into t from public.checklist_templates where id = p_template_id for update;
  if not found or not private.tasks_is_manager(t.organization_id, t.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);
  update public.checklist_templates
  set active = coalesce(p_active, false), updated_by = (select auth.uid()), updated_at = now()
  where id = t.id;
end;
$$;

create or replace function public.checklist_generate_daily(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date default null,
  p_kind public.checklist_kind default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_today date;
  v_date date;
  v_tpl public.checklist_templates;
  v_item record;
  v_instance uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_assignees uuid[];
  v_mode public.task_assignment_mode;
  v_count integer;
  v_window public.task_due_window;
  v_member uuid;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);

  v_today := private.tasks_location_today(p_location_id);
  v_date := coalesce(p_service_date, v_today);
  if v_date < v_today or v_date > v_today + 1 then
    raise exception 'Checklists can only be started for today or tomorrow.' using errcode = '22023';
  end if;

  for v_tpl in
    select t.* from public.checklist_templates t
    where t.organization_id = p_organization_id
      and t.location_id = p_location_id
      and t.active
      and (p_kind is null or t.kind = p_kind)
      and extract(dow from v_date)::smallint = any (t.days_of_week)
    order by t.kind, t.name, t.id
  loop
    insert into public.checklist_instances (
      organization_id, location_id, template_id, kind, name, service_date, generated_by
    )
    values (p_organization_id, p_location_id, v_tpl.id, v_tpl.kind, v_tpl.name, v_date, v_actor)
    on conflict (template_id, service_date) do nothing
    returning id into v_instance;

    if v_instance is null then
      select ci.id into v_instance
      from public.checklist_instances ci
      where ci.template_id = v_tpl.id and ci.service_date = v_date;
      v_ids := v_ids || v_instance;
      continue;
    end if;

    v_count := 0;
    for v_item in
      select i.* from public.checklist_template_items i
      where i.template_id = v_tpl.id and i.active
      order by i.sort_order, i.id
    loop
      v_mode := v_item.assignment_mode;
      -- Only people who are still active keep their assignment; a person who
      -- has left degrades the item gracefully instead of failing the day.
      select coalesce(array_agg(a.profile_id order by a.profile_id), '{}'::uuid[]) into v_assignees
      from public.checklist_template_item_assignees a
      join public.memberships m
        on m.organization_id = a.organization_id and m.profile_id = a.profile_id and m.active
      where a.item_id = v_item.id
        and private.tasks_workforce_eligible(p_organization_id, p_location_id, a.profile_id);

      if v_mode = 'individual' and cardinality(v_assignees) <> 1 then
        v_mode := 'anyone'; v_assignees := '{}';
      elsif v_mode = 'multiple' and cardinality(v_assignees) < 2 then
        if cardinality(v_assignees) = 1 then v_mode := 'individual';
        else v_mode := 'anyone'; end if;
      elsif v_mode in ('all_team', 'anyone') then
        v_assignees := '{}';
      end if;

      v_window := coalesce(
        v_item.due_window,
        case when v_item.due_time is null then
          case v_tpl.kind when 'opening' then 'before_opening' else 'closing' end::public.task_due_window
        end
      );

      perform private.tasks_insert(
        p_organization_id, p_location_id, v_tpl.kind::text::public.task_kind, v_item.title,
        v_item.instructions, v_item.category, v_item.priority, v_mode, v_assignees,
        null, v_date, v_item.due_time, v_window, v_actor, null, null, null,
        v_instance, v_item.id, v_item.sort_order, false
      );
      v_count := v_count + 1;
    end loop;

    perform private.tasks_emit(
      p_organization_id, null, v_instance, 'checklist_generated',
      jsonb_build_object('template_id', v_tpl.id, 'name', v_tpl.name, 'service_date', v_date, 'items', v_count)
    );

    -- "Opening / Closing checklist available" -- once per instance per person.
    for v_member in
      select m.profile_id from public.memberships m
      where m.organization_id = p_organization_id and m.active and m.profile_id <> v_actor
    loop
      perform private.tasks_notify(
        p_organization_id, v_member, 'checklist_available', null, v_instance,
        initcap(v_tpl.kind::text) || ' checklist is ready', v_tpl.name,
        'checklist:' || v_instance::text
      );
    end loop;

    v_ids := v_ids || v_instance;
  end loop;

  return v_ids;
end;
$$;

create or replace function public.task_series_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_assignment_mode public.task_assignment_mode,
  p_assignee_ids uuid[],
  p_due_time time,
  p_due_window public.task_due_window,
  p_frequency public.recurrence_frequency,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_starts_on date,
  p_end_type public.recurrence_end_type,
  p_ends_on date,
  p_max_occurrences integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_assignees uuid[];
  v_id uuid;
  v_shape record;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  perform private.tasks_require_manager(p_organization_id, p_location_id);

  if length(v_title) not between 1 and 160 then
    raise exception 'Give the task a title (up to 160 characters).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.task_categories c where c.slug = coalesce(p_category, 'other')) then
    raise exception 'Unknown task category.' using errcode = '22023';
  end if;
  v_assignees := private.tasks_validate_assignees(p_organization_id, p_location_id, p_assignment_mode, p_assignee_ids);
  select * into v_shape from private.recurrence_validate(
    p_frequency, p_weekdays, p_day_of_month, p_starts_on, p_end_type, p_ends_on, p_max_occurrences
  );

  insert into public.task_recurrence_rules (
    organization_id, location_id, title, instructions, category, priority, assignment_mode,
    due_time, due_window, frequency, weekdays, day_of_month, starts_on, end_type, ends_on,
    max_occurrences, created_by, updated_by
  )
  values (
    p_organization_id, p_location_id, v_title, nullif(trim(coalesce(p_instructions, '')), ''),
    coalesce(p_category, 'other'), p_priority, p_assignment_mode, p_due_time, p_due_window,
    p_frequency, v_shape.o_weekdays, v_shape.o_day_of_month, p_starts_on, p_end_type,
    case when p_end_type = 'on_date' then p_ends_on end,
    case when p_end_type = 'after_count' then p_max_occurrences end,
    v_actor, v_actor
  )
  returning id into v_id;

  insert into public.task_recurrence_assignees (rule_id, profile_id, organization_id)
  select v_id, x, p_organization_id from unnest(v_assignees) as x;

  perform private.recurrence_materialize(v_id, private.tasks_location_today(p_location_id) + 14);
  return v_id;
end;
$$;

create or replace function public.task_series_update(
  p_rule_id uuid,
  p_title text,
  p_instructions text,
  p_category text,
  p_priority public.task_priority,
  p_assignment_mode public.task_assignment_mode,
  p_assignee_ids uuid[],
  p_due_time time,
  p_due_window public.task_due_window,
  p_frequency public.recurrence_frequency,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_starts_on date,
  p_end_type public.recurrence_end_type,
  p_ends_on date,
  p_max_occurrences integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.task_recurrence_rules;
  v_actor uuid := (select auth.uid());
  v_today date;
  v_title text := trim(coalesce(p_title, ''));
  v_assignees uuid[];
  v_shape record;
  t public.tasks;
begin
  select * into r from public.task_recurrence_rules where id = p_rule_id for update;
  if not found or not private.tasks_is_manager(r.organization_id, r.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(r.organization_id, r.location_id);
  v_today := private.tasks_location_today(r.location_id);

  if length(v_title) not between 1 and 160 then
    raise exception 'Give the task a title (up to 160 characters).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.task_categories c where c.slug = coalesce(p_category, 'other')) then
    raise exception 'Unknown task category.' using errcode = '22023';
  end if;
  v_assignees := private.tasks_validate_assignees(r.organization_id, r.location_id, p_assignment_mode, p_assignee_ids);
  select * into v_shape from private.recurrence_validate(
    p_frequency, p_weekdays, p_day_of_month, p_starts_on, p_end_type, p_ends_on, p_max_occurrences
  );

  update public.task_recurrence_rules set
    title = v_title, instructions = nullif(trim(coalesce(p_instructions, '')), ''),
    category = coalesce(p_category, 'other'), priority = p_priority,
    assignment_mode = p_assignment_mode, due_time = p_due_time, due_window = p_due_window,
    frequency = p_frequency, weekdays = v_shape.o_weekdays, day_of_month = v_shape.o_day_of_month,
    starts_on = p_starts_on, end_type = p_end_type,
    ends_on = case when p_end_type = 'on_date' then p_ends_on end,
    max_occurrences = case when p_end_type = 'after_count' then p_max_occurrences end,
    active = true, updated_by = v_actor, updated_at = now()
  where id = r.id;

  delete from public.task_recurrence_assignees where rule_id = r.id;
  insert into public.task_recurrence_assignees (rule_id, profile_id, organization_id)
  select r.id, x, r.organization_id from unnest(v_assignees) as x;

  -- Untouched future occurrences: cancel the ones the new pattern no longer
  -- produces, rewrite the rest in place; missing dates are then generated.
  for t in
    select * from public.tasks x
    where x.recurrence_rule_id = r.id and x.occurrence_date >= v_today
      and x.status = 'open' and x.started_at is null
    order by x.occurrence_date
    for update
  loop
    if t.occurrence_date not in (
      select * from private.recurrence_dates(r.id, v_today, t.occurrence_date)
    ) then
      update public.tasks set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
        cancel_reason = 'Series changed', updated_by = v_actor
      where id = t.id;
      perform private.tasks_emit(t.organization_id, t.id, null, 'cancelled',
        jsonb_build_object('from', t.status, 'reason', 'Series changed', 'rule_id', r.id));
    else
      update public.tasks set
        title = v_title, instructions = nullif(trim(coalesce(p_instructions, '')), ''),
        category = coalesce(p_category, 'other'), priority = p_priority,
        due_time = p_due_time, due_window = p_due_window,
        assignment_mode = p_assignment_mode,
        updated_by = v_actor
      where id = t.id;
      delete from public.task_assignments a where a.task_id = t.id and not (a.profile_id = any (v_assignees));
      insert into public.task_assignments (task_id, profile_id, organization_id, assigned_by)
      select t.id, x, t.organization_id, v_actor from unnest(v_assignees) as x
      on conflict (task_id, profile_id) do nothing;
      perform private.tasks_emit(t.organization_id, t.id, null, 'edited',
        jsonb_build_object('scope', 'this_and_future', 'rule_id', r.id));
    end if;
  end loop;

  perform private.recurrence_materialize(r.id, v_today + 14);
end;
$$;

create or replace function public.task_series_stop(p_rule_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.task_recurrence_rules;
  v_actor uuid := (select auth.uid());
  v_today date;
  t public.tasks;
  v_count integer := 0;
begin
  select * into r from public.task_recurrence_rules where id = p_rule_id for update;
  if not found or not private.tasks_is_manager(r.organization_id, r.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(r.organization_id, r.location_id);
  v_today := private.tasks_location_today(r.location_id);

  update public.task_recurrence_rules
  set active = false, updated_by = v_actor, updated_at = now()
  where id = r.id;

  for t in
    select * from public.tasks x
    where x.recurrence_rule_id = r.id and x.occurrence_date >= v_today
      and x.status = 'open' and x.started_at is null
    for update
  loop
    update public.tasks set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
      cancel_reason = 'Series ended', updated_by = v_actor
    where id = t.id;
    perform private.tasks_emit(t.organization_id, t.id, null, 'cancelled',
      jsonb_build_object('from', t.status, 'reason', 'Series ended', 'rule_id', r.id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.recurrence_materialize(
  p_rule_id uuid,
  p_through date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.task_recurrence_rules;
  v_today date;
  v_date date;
  v_assignees uuid[];
  v_mode public.task_assignment_mode;
  v_count integer := 0;
begin
  select * into r from public.task_recurrence_rules where id = p_rule_id;
  if not found or not r.active then
    return 0;
  end if;
  v_today := private.tasks_location_today(r.location_id);

  -- Only people who are still active keep the assignment; a series whose
  -- named people have left degrades to "anyone" instead of failing.
  select coalesce(array_agg(a.profile_id order by a.profile_id), '{}'::uuid[]) into v_assignees
  from public.task_recurrence_assignees a
  join public.memberships m
    on m.organization_id = a.organization_id and m.profile_id = a.profile_id and m.active
  where a.rule_id = r.id
    and private.tasks_workforce_eligible(r.organization_id, r.location_id, a.profile_id);

  v_mode := r.assignment_mode;
  if v_mode in ('all_team', 'anyone') then
    v_assignees := '{}';
  elsif v_mode = 'individual' and cardinality(v_assignees) <> 1 then
    v_mode := 'anyone'; v_assignees := '{}';
  elsif v_mode = 'multiple' then
    if cardinality(v_assignees) = 1 then v_mode := 'individual';
    elsif cardinality(v_assignees) = 0 then v_mode := 'anyone'; end if;
  end if;

  for v_date in select * from private.recurrence_dates(r.id, greatest(r.starts_on, v_today), p_through)
  loop
    if exists (
      select 1 from public.tasks t
      where t.recurrence_rule_id = r.id and t.occurrence_date = v_date
    ) then
      continue;
    end if;
    begin
      perform private.tasks_insert(
        r.organization_id, r.location_id, 'task', r.title, r.instructions, r.category, r.priority,
        v_mode, v_assignees, null, v_date, r.due_time, r.due_window, r.created_by,
        null, r.id, v_date, null, null, 0, true
      );
      v_count := v_count + 1;
    exception when unique_violation then
      null; -- another session created it first
    end;
  end loop;
  return v_count;
end;
$$;

-- Child definitions and audit history must authorize via their concrete parent.
drop policy checklist_templates_select on public.checklist_templates;
create policy checklist_templates_select on public.checklist_templates for select to authenticated
  using (private.tasks_is_manager(organization_id, location_id));
drop policy task_recurrence_rules_select on public.task_recurrence_rules;
create policy task_recurrence_rules_select on public.task_recurrence_rules for select to authenticated
  using (private.tasks_is_manager(organization_id, location_id));
drop policy checklist_template_items_select on public.checklist_template_items;
create policy checklist_template_items_select on public.checklist_template_items for select to authenticated
  using (exists (select 1 from public.checklist_templates t where t.id = template_id and t.organization_id = organization_id));
drop policy checklist_template_item_assignees_select on public.checklist_template_item_assignees;
create policy checklist_template_item_assignees_select on public.checklist_template_item_assignees for select to authenticated
  using (exists (select 1 from public.checklist_template_items i where i.id = item_id and i.organization_id = organization_id));
drop policy task_recurrence_assignees_select on public.task_recurrence_assignees;
create policy task_recurrence_assignees_select on public.task_recurrence_assignees for select to authenticated
  using (exists (select 1 from public.task_recurrence_rules r where r.id = rule_id and r.organization_id = organization_id));
drop policy task_events_select on public.task_events;
create policy task_events_select on public.task_events for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id and t.organization_id = task_events.organization_id
    and private.tasks_is_manager(t.organization_id, t.location_id))
  or (task_id is null and exists (select 1 from public.checklist_instances i
    where i.id = checklist_instance_id and i.organization_id = task_events.organization_id
      and private.tasks_is_manager(i.organization_id, i.location_id))));

-- Persist trusted notification scope for efficient location-bound inbox/count reads.
alter table public.task_notifications add column location_id uuid;
alter table public.task_notifications add constraint task_notifications_location_tenant_fk
  foreign key(location_id, organization_id) references public.locations(id, organization_id);
update public.task_notifications n set location_id = t.location_id
  from public.tasks t where t.id = n.task_id and t.organization_id = n.organization_id;
update public.task_notifications n set location_id = i.location_id
  from public.checklist_instances i where i.id = n.checklist_instance_id
    and i.organization_id = n.organization_id and n.location_id is null;
update public.task_notifications n set location_id = l.id from public.locations l
  where n.type = 'opening_reminder' and n.payload ->> 'location_id' = l.id::text
    and l.organization_id = n.organization_id and n.location_id is null;
create index task_notifications_location_recipient_idx
  on public.task_notifications(location_id, recipient_profile_id, id desc);

create function private.tasks_notification_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_location uuid; v_instance_location uuid;
begin
  if new.task_id is not null then
    select t.location_id into v_location from public.tasks t
      where t.id = new.task_id and t.organization_id = new.organization_id;
  end if;
  if new.checklist_instance_id is not null then
    select i.location_id into v_instance_location from public.checklist_instances i
      where i.id = new.checklist_instance_id and i.organization_id = new.organization_id;
    if v_location is not null and v_location is distinct from v_instance_location then
      raise exception 'Notification sources must belong to one location.' using errcode = '23514';
    end if;
    v_location := coalesce(v_location, v_instance_location);
  end if;
  if new.type = 'opening_reminder' then
    select l.id into v_location from public.locations l
      where l.id::text = new.payload ->> 'location_id' and l.organization_id = new.organization_id;
  end if;
  new.location_id := v_location;
  return new;
end;
$$;
revoke all on function private.tasks_notification_scope() from public, anon, authenticated;
create trigger task_notifications_source_scope before insert or update of task_id, checklist_instance_id, payload, organization_id
  on public.task_notifications for each row execute function private.tasks_notification_scope();

drop policy task_notifications_select on public.task_notifications;
create policy task_notifications_select on public.task_notifications for select to authenticated
  using (recipient_profile_id = (select auth.uid())
    and private.tasks_can_access_location(organization_id, location_id));

create or replace function private.tasks_notify(
  p_organization_id uuid,
  p_recipient uuid,
  p_type public.task_notification_type,
  p_task_id uuid,
  p_instance_id uuid,
  p_title text,
  p_body text,
  p_dedupe_key text,
  p_payload jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operational boolean := false;
  v_stage text;
  v_location uuid;
  v_date date;
begin
  -- Operational gate (PLAN D-3 / D-4): Opening / Closing only, fail closed.
  if p_type = 'opening_reminder' then
    -- A reminder must prove a structured, same-organization source: a known
    -- stage, a location of this organization, a service date, a dedupe key that
    -- encodes exactly those three, and no task / checklist reference (the
    -- recipient learns a count, never a coworker's item).
    begin
      v_stage := p_payload ->> 'stage';
      v_location := (p_payload ->> 'location_id')::uuid;
      v_date := (p_payload ->> 'service_date')::date;
      v_operational := p_task_id is null
        and p_instance_id is null
        and v_stage in ('open', 'plus_15', 'plus_30')
        and p_dedupe_key = 'opening_reminder:' || v_location::text || ':' || v_date::text || ':' || v_stage
        and exists (
          select 1 from public.locations l
          where l.id = v_location and l.organization_id = p_organization_id
        );
    exception when data_exception then
      v_operational := false;
    end;
  elsif p_type = 'checklist_available' then
    v_operational := true;
  else
    v_operational := exists (
      select 1 from public.tasks t
      where t.id = p_task_id
        and t.organization_id = p_organization_id
        and t.kind in ('opening', 'closing')
    );
  end if;

  if not coalesce(v_operational, false) then
    return;
  end if;

  if p_type <> 'opening_reminder' then
    select t.location_id into v_location from public.tasks t
      where t.id = p_task_id and t.organization_id = p_organization_id;
    if v_location is null then
      select i.location_id into v_location from public.checklist_instances i
        where i.id = p_instance_id and i.organization_id = p_organization_id;
    end if;
  end if;
  if not private.tasks_workforce_eligible(p_organization_id, v_location, p_recipient) then
    return;
  end if;

  insert into public.task_notifications (
    organization_id, recipient_profile_id, type, task_id, checklist_instance_id, title, body, dedupe_key, payload
  )
  select p_organization_id, p_recipient, p_type, p_task_id, p_instance_id, p_title, left(p_body, 300), p_dedupe_key, p_payload
  where exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_recipient and m.active
  )
  on conflict (recipient_profile_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.tasks_opening_reminders_run(
  p_organization_id uuid,
  p_location_id uuid,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_open_local time;
  v_day_closed boolean;
  v_day_open time;
  v_date date;
  v_open_at timestamptz;
  v_row record;
  v_key text;
  v_title text;
  v_body text;
  v_count integer := 0;
begin
  if p_now is null then
    return 0;
  end if;

  select l.time_zone, l.opening_local into v_tz, v_open_local
  from public.locations l
  where l.id = p_location_id and l.organization_id = p_organization_id;
  if not found then
    return 0;
  end if;

  -- One evaluator per location at a time: an overlapping sweep waits, then sees
  -- the first one's committed rows and stores nothing twice.
  perform pg_advisory_xact_lock(hashtextextended('opening_reminders:' || p_location_id::text, 0));

  v_date := (p_now at time zone v_tz)::date;

  select oh.closed, oh.opening_local into v_day_closed, v_day_open
  from public.operating_hours oh
  where oh.location_id = p_location_id
    and oh.organization_id = p_organization_id
    and oh.day_of_week = extract(dow from v_date)::smallint;
  if found then
    if v_day_closed then
      return 0;
    end if;
    v_open_local := v_day_open;
  end if;

  v_open_at := (v_date + v_open_local) at time zone v_tz;
  if p_now < v_open_at then
    return 0;
  end if;

  for v_row in
    with stages (stage, minutes) as (
      values ('open', 0), ('plus_15', 15), ('plus_30', 30)
    ),
    due as (
      select s.stage, v_open_at + make_interval(mins => s.minutes) as at
      from stages s
      where v_open_at + make_interval(mins => s.minutes) <= p_now
    ),
    -- Required Opening work: every item of today's Opening checklists.
    items as (
      select t.id, t.assignment_mode, (t.status in ('open', 'in_progress', 'blocked')) as open_now
      from public.checklist_instances ci
      join public.tasks t
        on t.checklist_instance_id = ci.id and t.organization_id = ci.organization_id
      where ci.organization_id = p_organization_id
        and ci.location_id = p_location_id
        and ci.service_date = v_date
        and ci.kind = 'opening'
        and t.kind = 'opening'
    ),
    people as (
      select m.profile_id,
              (private.tasks_profile_level(p_organization_id, p_location_id, m.profile_id) >= 2) as is_manager
      from public.memberships m
      where m.organization_id = p_organization_id
        and m.active
        and private.tasks_workforce_eligible(p_organization_id, p_location_id, m.profile_id)
    ),
    -- Each person's work scope: management sees all; staff only what they may work.
    scoped as (
      select p.profile_id, i.id as task_id, i.open_now
      from people p
      join items i
        on p.is_manager
        or i.assignment_mode in ('all_team', 'anyone')
        or exists (
          select 1 from public.task_assignments a
          where a.task_id = i.id and a.profile_id = p.profile_id
        )
    ),
    judged as (
      select sc.profile_id, d.stage, d.at, sc.open_now,
             (le.event_type is null or le.event_type = 'reopened') as open_at_stage
      from scoped sc
      cross join due d
      left join lateral (
        select e.event_type
        from public.task_events e
        where e.task_id = sc.task_id
          and e.organization_id = p_organization_id
          and e.event_type in ('completed', 'reopened', 'cancelled')
          and e.created_at <= d.at
        order by e.created_at desc, e.id desc
        limit 1
      ) le on true
    )
    select j.profile_id, j.stage, j.at,
           count(*) filter (where j.open_at_stage) as count_at_stage,
           count(*) filter (where j.open_now) as count_now
    from judged j
    where not exists (
      select 1 from public.task_notifications n
      where n.recipient_profile_id = j.profile_id
        and n.dedupe_key = 'opening_reminder:' || p_location_id::text || ':' || v_date::text || ':' || j.stage
    )
    group by j.profile_id, j.stage, j.at
    having count(*) filter (where j.open_at_stage) > 0
       and count(*) filter (where j.open_now) > 0
    order by j.profile_id, j.at
  loop
    v_key := 'opening_reminder:' || p_location_id::text || ':' || v_date::text || ':' || v_row.stage;
    v_title := case v_row.stage
      when 'open' then 'Opening tasks are not complete'
      when 'plus_15' then 'Opening tasks are still incomplete'
      else 'Opening tasks are overdue'
    end;
    v_body := case when v_row.count_at_stage = 1
      then '1 Opening task is not complete'
      else v_row.count_at_stage::text || ' Opening tasks are not complete'
    end;

    perform private.tasks_notify(
      p_organization_id, v_row.profile_id, 'opening_reminder', null, null,
      v_title, v_body, v_key,
      jsonb_build_object(
        'stage', v_row.stage,
        'service_date', v_date,
        'location_id', p_location_id,
        'stage_at', to_char(v_row.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'incomplete_count', v_row.count_at_stage,
        'incomplete_now', v_row.count_now
      )
    );

    -- Count only what the gate really stored.
    if exists (
      select 1 from public.task_notifications n
      where n.recipient_profile_id = v_row.profile_id and n.dedupe_key = v_key
    ) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Deliberate recovery exemption: only own recipient, no module/location denial.
create or replace function public.task_notifications_mark_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.tasks_live_session() then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  update public.task_notifications n
  set read_at = now()
  where n.recipient_profile_id = (select auth.uid())
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Audit attribution uses live identity and an immutable, server-derived snapshot.
create or replace function private.tasks_emit(p_organization_id uuid, p_task_id uuid,
  p_instance_id uuid, p_event_type public.task_event_type, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_location uuid; v_actor uuid := (select auth.uid()); v_identity jsonb;
begin
  select t.location_id into v_location from public.tasks t where t.id = p_task_id and t.organization_id = p_organization_id;
  if v_location is null then
    select i.location_id into v_location from public.checklist_instances i where i.id = p_instance_id and i.organization_id = p_organization_id;
  end if;
  if not private.tasks_can_access_location(p_organization_id, v_location) then
    raise exception 'You do not have access to tasks for this location.' using errcode = '42501';
  end if;
  select jsonb_build_object('profile_id', p.id, 'display_name', p.display_name,
    'overall_role', o.role, 'location_id', v_location, 'organization_id', p_organization_id,
    'effective_level', private.tasks_profile_level(p_organization_id, v_location, p.id))
  into v_identity from public.profiles p left join public.overall_roles o on o.profile_id = p.id where p.id = v_actor;
  insert into public.task_events(organization_id, task_id, checklist_instance_id, event_type, actor_profile_id, payload)
  values(p_organization_id, p_task_id, p_instance_id, p_event_type, v_actor,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('actor', v_identity));
end;
$$;

-- A caller may read only current eligible workforce (managers), or people
-- referenced by tasks/history already visible to them. No global profiles grant.
create function public.tasks_location_people(p_organization_id uuid, p_location_id uuid)
returns table(profile_id uuid, display_name text, designation text, eligible boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.tasks_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tasks for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tasks');
  return query
    with workforce as (
      select m.profile_id from public.memberships m where m.organization_id = p_organization_id
        and private.tasks_is_manager(p_organization_id, p_location_id)
        and private.tasks_workforce_eligible(p_organization_id, p_location_id, m.profile_id)
    ), visible as (
      select t.* from public.tasks t where t.organization_id = p_organization_id and t.location_id = p_location_id
        and private.tasks_can_view(t.id)
    ), identities as (
      select w.profile_id from workforce w
      union select v.created_by from visible v union select v.started_by from visible v
      union select v.completed_by from visible v union select v.cancelled_by from visible v
      union select a.profile_id from public.task_assignments a join visible v on v.id = a.task_id
      union select e.actor_profile_id from public.task_events e
        left join public.tasks t on t.id = e.task_id
        left join public.checklist_instances i on i.id = e.checklist_instance_id
        where e.organization_id = p_organization_id and coalesce(t.location_id, i.location_id) = p_location_id
          and private.tasks_is_manager(p_organization_id, p_location_id)
      union select r.created_by from public.task_recurrence_rules r where r.organization_id = p_organization_id
        and r.location_id = p_location_id and private.tasks_is_manager(p_organization_id, p_location_id)
    )
    select p.id, p.display_name,
      case private.tasks_profile_level(p_organization_id, p_location_id, p.id)
        when 4 then 'owner' when 3 then 'manager' when 2 then 'assistant_manager' else 'staff' end,
      exists(select 1 from workforce w where w.profile_id = p.id)
    from public.profiles p join identities x on x.profile_id = p.id order by p.display_name, p.id;
end;
$$;
revoke all on function public.tasks_location_people(uuid, uuid) from public, anon;
grant execute on function public.tasks_location_people(uuid, uuid) to authenticated;

-- Readiness/authority gate for new app on an unmigrated Preview. Deliberately
-- independent of module availability so actions can return their established
-- moduleUnavailable result and own-ID dismissal can recover while Disabled.
create function public.tasks_location_authorized(p_organization_id uuid, p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tasks_can_access_location(p_organization_id, p_location_id);
$$;
revoke all on function public.tasks_location_authorized(uuid, uuid) from public, anon;
grant execute on function public.tasks_location_authorized(uuid, uuid) to authenticated;

-- Reminders have no task/checklist ID: their persisted source location is the
-- module boundary too. Mark-read remains a separate own-recipient exemption.
drop policy task_notifications_module_enforcement on public.task_notifications;
create policy task_notifications_module_enforcement on public.task_notifications
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tasks'));

-- Atomic workspace mark-all: no PostgREST row cap or cross-location updates.
-- The existing own-recipient recovery endpoint above deliberately stays separate.
create function public.task_notifications_mark_location_read(
  p_organization_id uuid, p_location_id uuid, p_ids bigint[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  update public.task_notifications n set read_at = now()
    where n.organization_id = p_organization_id and n.location_id = p_location_id
      and n.recipient_profile_id = (select auth.uid()) and n.read_at is null
      and (p_ids is null or n.id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.task_notifications_mark_location_read(uuid, uuid, bigint[]) from public, anon;
grant execute on function public.task_notifications_mark_location_read(uuid, uuid, bigint[]) to authenticated;

commit;
