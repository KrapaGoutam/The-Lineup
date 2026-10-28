-- Tasks V1.1 / T-4 (2 of 2) -- the Opening reminder engine (PLAN D-4, #154).
--
-- Server-authoritative reminders for incomplete Opening work at three stages:
--   open     the location's opening instant
--   plus_15  opening + 15 minutes
--   plus_30  opening + 30 minutes
-- Nothing is scheduled after plus_30. The client never decides whether a
-- reminder exists; it only reads the notification rows this engine stores.
--
-- Pieces
--   1. task_notifications.payload  -- machine-readable contract for the UI
--      (stage, service date, location, stage instant, counts). Human text is
--      never the only source of structure.
--   2. private.tasks_notify        -- the single notification writer, extended:
--      it admits opening_reminder only when the call proves a structured,
--      same-organization reminder (fails closed otherwise).
--   3. private.tasks_profile_can_access_location -- the profile-parameterised
--      twin of private.tasks_can_access_location (that one keys off auth.uid(),
--      which is the caller, not the recipient).
--   4. private.tasks_opening_reminders_run -- the evaluator. Takes the clock as
--      an argument so tests are deterministic; never trusts a client time.
--   5. public.task_opening_reminders_sweep -- the thin RPC any active member's
--      Tasks load triggers (same idempotent, no-cron pattern as the due-soon
--      sweep and checklist generation).
--
-- Stage semantics (see docs/features/tasks-v1-1/PLAN.md D-4)
--   * service date = today in locations.time_zone; opening instant =
--     (service_date + opening_local) AT TIME ZONE time_zone, where
--     opening_local is operating_hours for that weekday, else
--     locations.opening_local. A `closed` day emits nothing.
--   * Stage instants are opening + 0/15/30 minutes as ABSOLUTE instants, so a
--     DST change cannot stretch or shrink the 15-minute gap.
--   * A stage becomes eligible when its instant has passed and stays eligible
--     until the service date ends (a late evaluation still persists it).
--   * A stage is stored for a recipient only if, for the items in THAT
--     recipient's scope, (a) at least one item was incomplete AT the stage
--     instant (reconstructed from task_events, never from current status),
--     (b) at least one is incomplete NOW, and (c) the stage was not stored
--     before. Work completed at or before a stage instant is complete at it.
--     So a stage that was truly complete at its own instant is never
--     back-filled, while a truly missed stage is persisted once (catch-up).
--   * Required item = every non-cancelled item of today's Opening checklists
--     (D-6); cancelled items never count.
--
-- Recipients (D-4, Decision 3)
--   * Management -- active owner / general_manager / shift_manager. Scope =
--     every required Opening item at the location.
--   * Staff -- an active non-manager only for Opening items they may work
--     (named assignee, or all_team / anyone: the tasks_can_work rule). Their
--     stored reminder carries only a count of THEIR items and no task, no
--     coworker name and no checklist reference.
--
-- Idempotency / concurrency: the (recipient, dedupe_key) unique index, an
-- ON CONFLICT DO NOTHING writer and a per-location advisory transaction lock.
-- The lock makes two overlapping sweeps run one after the other, so the second
-- sees the first's rows and stores nothing (and the returned count is exact).
--
-- Forward-only and additive. Rollback: restore the T-3 private.tasks_notify
-- body (8 arguments, 20261028090000), drop public.task_opening_reminders_sweep,
-- private.tasks_opening_reminders_run and
-- private.tasks_profile_can_access_location, and drop the payload column.
-- Stored reminder rows are inert without the evaluator.

-- ---------------------------------------------------------------------
-- 1. Machine-readable payload
-- ---------------------------------------------------------------------
alter table public.task_notifications
  add column payload jsonb
  constraint task_notifications_payload_shape check (
    payload is null or (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 1024)
  );

-- ---------------------------------------------------------------------
-- 2. The notification gate, extended for opening_reminder
-- ---------------------------------------------------------------------
-- The signature gains an optional trailing p_payload, so every existing
-- 8-argument call site resolves to this function unchanged. The old overload
-- is dropped so the two can never be ambiguous.
drop function if exists private.tasks_notify(
  uuid, uuid, public.task_notification_type, uuid, uuid, text, text, text
);

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

revoke all on function private.tasks_notify(
  uuid, uuid, public.task_notification_type, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Profile-parameterised location access (the Part 2 seam, for a recipient)
-- ---------------------------------------------------------------------
-- MUST stay equivalent to private.tasks_can_access_location for the same
-- person: an active member of the organization, and a location of that
-- organization. When Part 2 narrows location access it changes both.
create or replace function private.tasks_profile_can_access_location(
  p_organization_id uuid,
  p_location_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id and m.profile_id = p_profile_id and m.active
    )
    and exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.organization_id = p_organization_id
    );
$$;

revoke all on function private.tasks_profile_can_access_location(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. The evaluator (clock injected)
-- ---------------------------------------------------------------------
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
             (m.roles && array['owner', 'general_manager', 'shift_manager']::public.app_role[]) as is_manager
      from public.memberships m
      where m.organization_id = p_organization_id
        and m.active
        and private.tasks_profile_can_access_location(p_organization_id, p_location_id, m.profile_id)
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

revoke all on function private.tasks_opening_reminders_run(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. The RPC
-- ---------------------------------------------------------------------
-- Any active member of the location's organization may trigger the sweep: the
-- caller supplies only the tenant, never a recipient, stage, date or time. It
-- is idempotent (repeat calls store nothing), so reloads, two tabs, retries
-- and reconnects are harmless. Returns how many reminders this call stored.
create or replace function public.task_opening_reminders_sweep(
  p_organization_id uuid,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.tasks_begin(p_organization_id, p_location_id);
  return private.tasks_opening_reminders_run(p_organization_id, p_location_id, clock_timestamp());
end;
$$;

revoke all on function public.task_opening_reminders_sweep(uuid, uuid) from public, anon;
grant execute on function public.task_opening_reminders_sweep(uuid, uuid) to authenticated;
