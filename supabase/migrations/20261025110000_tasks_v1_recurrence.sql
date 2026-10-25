-- Tasks V1 / T6 -- optional recurrence for normal tasks.
--
--   task_recurrence_rules (definition)  ->  tasks rows (occurrences)
--
-- A series is never "one task that resets": every occurrence is its own
-- tasks row (unique per rule + date) with its own status, assignment,
-- completion and history, so completing Friday's does not touch next
-- Friday's or the rule. Supported patterns: daily, weekdays, weekly (the
-- weekday of the start date), selected weekdays, monthly (day of month,
-- clamped to the month's last day). Ends: never, on a date, after N
-- occurrences (counted from the start date). No custom intervals in V1.
--
-- Materialization is lazy and idempotent: occurrences are created for the
-- next 14 days when a series is saved and whenever any active member opens
-- Tasks (task_recurrence_generate). No cron dependency.
--
-- Editing: "this occurrence only" is an ordinary task_update on that row.
-- "This and future" (task_series_update) rewrites the rule and only those
-- future occurrences that are still untouched (status open, not started);
-- completed, started, blocked and past occurrences are never altered.
-- Series with several assignees complete once per occurrence (shared once);
-- "each person separately" is not offered for recurring tasks.

-- ---------------------------------------------------------------------
-- 1. The one place that decides which dates a rule produces
-- ---------------------------------------------------------------------
create or replace function private.recurrence_dates(
  p_rule_id uuid,
  p_from date,
  p_through date
)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select * from public.task_recurrence_rules where id = p_rule_id
  ),
  days as (
    select d::date as d
    from r,
    lateral generate_series(
      r.starts_on,
      case when r.end_type = 'on_date' then least(p_through, r.ends_on) else p_through end,
      interval '1 day'
    ) as d
  ),
  matched as (
    select days.d,
           row_number() over (order by days.d) as n
    from days, r
    where case r.frequency
      when 'daily' then true
      when 'weekdays' then extract(dow from days.d) between 1 and 5
      when 'weekly' then extract(dow from days.d)::smallint = any (r.weekdays)
      when 'selected_weekdays' then extract(dow from days.d)::smallint = any (r.weekdays)
      when 'monthly' then
        extract(day from days.d) = least(
          r.day_of_month,
          extract(day from (date_trunc('month', days.d) + interval '1 month - 1 day'))
        )
    end
  )
  select m.d
  from matched m, r
  where m.d >= p_from
    and (r.end_type <> 'after_count' or m.n <= r.max_occurrences)
  order by m.d;
$$;

revoke all on function private.recurrence_dates(uuid, date, date) from public, anon, authenticated;

-- Creates any missing occurrences of one rule up to p_through. Returns how
-- many were created. Safe to call repeatedly and concurrently.
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
  where a.rule_id = r.id;

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

revoke all on function private.recurrence_materialize(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Series lifecycle
-- ---------------------------------------------------------------------
create or replace function private.recurrence_validate(
  p_frequency public.recurrence_frequency,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_starts_on date,
  p_end_type public.recurrence_end_type,
  p_ends_on date,
  p_max integer,
  out o_weekdays smallint[],
  out o_day_of_month smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_starts_on is null then
    raise exception 'Choose when the series starts.' using errcode = '22023';
  end if;
  o_weekdays := null;
  o_day_of_month := null;
  if p_frequency = 'weekly' then
    o_weekdays := array[extract(dow from p_starts_on)::smallint];
  elsif p_frequency = 'selected_weekdays' then
    if p_weekdays is null or cardinality(p_weekdays) = 0
       or not (p_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
      raise exception 'Choose at least one weekday.' using errcode = '22023';
    end if;
    o_weekdays := p_weekdays;
  elsif p_frequency = 'monthly' then
    o_day_of_month := coalesce(p_day_of_month, extract(day from p_starts_on)::smallint);
    if o_day_of_month not between 1 and 31 then
      raise exception 'Choose a day of the month between 1 and 31.' using errcode = '22023';
    end if;
  end if;
  if p_end_type = 'on_date' and (p_ends_on is null or p_ends_on < p_starts_on) then
    raise exception 'The end date cannot be before the start date.' using errcode = '22023';
  end if;
  if p_end_type = 'after_count' and (p_max is null or p_max not between 1 and 1000) then
    raise exception 'Choose how many times it repeats (1 to 1000).' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.recurrence_validate(public.recurrence_frequency, smallint[], smallint, date, public.recurrence_end_type, date, integer) from public, anon, authenticated;

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
  perform private.tasks_require_manager(p_organization_id);

  if length(v_title) not between 1 and 160 then
    raise exception 'Give the task a title (up to 160 characters).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.task_categories c where c.slug = coalesce(p_category, 'other')) then
    raise exception 'Unknown task category.' using errcode = '22023';
  end if;
  v_assignees := private.tasks_validate_assignees(p_organization_id, p_assignment_mode, p_assignee_ids);
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

-- "This and future": rewrites the rule, then brings untouched future
-- occurrences in line. Completed / started / blocked / past ones are left
-- exactly as they are.
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
  if not found or not private.tasks_is_manager(r.organization_id) then
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
  v_assignees := private.tasks_validate_assignees(r.organization_id, p_assignment_mode, p_assignee_ids);
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
  if not found or not private.tasks_is_manager(r.organization_id) then
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

-- Lazy materialization: any active member opening Tasks keeps the 14-day
-- horizon filled. Idempotent.
create or replace function public.task_recurrence_generate(
  p_organization_id uuid,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule uuid;
  v_count integer := 0;
  v_through date;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  v_through := private.tasks_location_today(p_location_id) + 14;
  for v_rule in
    select id from public.task_recurrence_rules
    where organization_id = p_organization_id and location_id = p_location_id and active
    order by id
  loop
    v_count := v_count + private.recurrence_materialize(v_rule, v_through);
  end loop;
  return v_count;
end;
$$;

revoke all on function public.task_series_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], time, public.task_due_window, public.recurrence_frequency, smallint[], smallint, date, public.recurrence_end_type, date, integer) from public, anon;
revoke all on function public.task_series_update(uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], time, public.task_due_window, public.recurrence_frequency, smallint[], smallint, date, public.recurrence_end_type, date, integer) from public, anon;
revoke all on function public.task_series_stop(uuid) from public, anon;
revoke all on function public.task_recurrence_generate(uuid, uuid) from public, anon;
grant execute on function public.task_series_create(uuid, uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], time, public.task_due_window, public.recurrence_frequency, smallint[], smallint, date, public.recurrence_end_type, date, integer) to authenticated;
grant execute on function public.task_series_update(uuid, text, text, text, public.task_priority, public.task_assignment_mode, uuid[], time, public.task_due_window, public.recurrence_frequency, smallint[], smallint, date, public.recurrence_end_type, date, integer) to authenticated;
grant execute on function public.task_series_stop(uuid) to authenticated;
grant execute on function public.task_recurrence_generate(uuid, uuid) to authenticated;
