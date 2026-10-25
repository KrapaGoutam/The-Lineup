-- Tasks V1 / T4 + T5 -- Opening and Closing: reusable templates and
-- per-day checklist instances.
--
--   checklist_template (definition, manager-only)
--     -> checklist_instance (template + location + service_date, UNIQUE)
--          -> tasks rows (kind = opening | closing), each with its OWN status,
--             assignment and completion
--
-- Every day therefore gets brand-new rows: yesterday's checked state cannot
-- reach today, history is simply the older instances, and editing a template
-- later never rewrites a day that already exists. One engine serves both
-- Opening and Closing; they differ only by `kind`.
--
-- Authorization: managers save templates; ANY active member may trigger the
-- (idempotent) daily generation, so the checklist exists as soon as the first
-- person opens it. Item completion reuses the normal task RPCs (assignee or
-- manager+, completed_by recorded, assignment untouched).

-- ---------------------------------------------------------------------
-- 1. Save a template (definition + items) in one call
-- ---------------------------------------------------------------------
-- p_items: [{ "title", "instructions", "category", "priority",
--             "assignment_mode", "assignee_ids": [uuid], "due_window",
--             "due_time": "HH:MM" }, ...]  -- array order is the display order.
-- Existing items are replaced; tasks already generated keep their own copy
-- (their template_item_id is simply nulled by the FK).
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
  perform private.tasks_require_manager(p_organization_id);

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
    v_assignees := private.tasks_validate_assignees(p_organization_id, v_mode, v_assignees);
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
  if not found or not private.tasks_is_manager(t.organization_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.tasks_begin(t.organization_id, t.location_id);
  update public.checklist_templates
  set active = coalesce(p_active, false), updated_by = (select auth.uid()), updated_at = now()
  where id = t.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Generate the day's checklists (idempotent; any active member)
-- ---------------------------------------------------------------------
-- Returns the ids of every instance that exists for that date afterwards.
-- Only the location's today and tomorrow can be generated, so a stray call
-- cannot fabricate arbitrary past or far-future days.
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
      where a.item_id = v_item.id;

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

revoke all on function public.checklist_template_save(uuid, uuid, uuid, public.checklist_kind, text, smallint[], boolean, jsonb) from public, anon;
revoke all on function public.checklist_template_set_active(uuid, boolean) from public, anon;
revoke all on function public.checklist_generate_daily(uuid, uuid, date, public.checklist_kind) from public, anon;
grant execute on function public.checklist_template_save(uuid, uuid, uuid, public.checklist_kind, text, smallint[], boolean, jsonb) to authenticated;
grant execute on function public.checklist_template_set_active(uuid, boolean) to authenticated;
grant execute on function public.checklist_generate_daily(uuid, uuid, date, public.checklist_kind) to authenticated;
