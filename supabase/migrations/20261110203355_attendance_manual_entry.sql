-- V2-006.008 Attendance Manual Entry
-- Explicit-time, manager-attributed native attendance entry. Each call is one
-- independent transaction; the UI may submit bounded rows with unique operation keys.

-- 1. Financial boundary helper (kept in private.payroll_* to preserve the strict
-- isolation invariant where attendance_* functions do not query payroll/tip tables).
create or replace function private.payroll_month_frozen(
  p_org_id uuid,
  p_profile_id uuid,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_periods p
    left join public.attendance_identity_links link
      on link.organization_id = p_org_id and link.profile_id = p_profile_id
    where p.organization_id = p_org_id
      and p.period_month between date_trunc('month', p_start_date)::date
                             and date_trunc('month', p_end_date)::date
      and (p.profile_id = p_profile_id or (link.neon_user_id is not null and p.neon_user_id = link.neon_user_id))
  ) or exists (
    select 1 from public.payroll_attendance_consumptions c
    where c.organization_id = p_org_id and c.profile_id = p_profile_id
      and c.period_month between date_trunc('month', p_start_date)::date
                             and date_trunc('month', p_end_date)::date
  );
$$;

revoke all on function private.payroll_month_frozen(uuid, uuid, date, date)
  from public, anon, authenticated;

-- 2. Explicit-time, manager-attributed manual entry RPC
create or replace function public.attendance_manual_entry(
  p_location_id uuid,
  p_profile_id uuid,
  p_service_date date,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_loc public.locations%rowtype;
  v_replay public.attendance_events%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_key text := nullif(trim(p_idempotency_key), '');
  v_now timestamptz;
  v_start_date date;
  v_end_date date;
  v_payload jsonb;
  v_session_id uuid;
  v_in_event bigint;
  v_out_event bigint;
  v_gross integer;
begin
  -- attendance_begin supplies live-session, tenant, assignment, module, source,
  -- active-location and per-employee transaction-lock guarantees. This new
  -- operation is manager-only even when the actor is the target employee.
  v_loc := private.attendance_begin(p_location_id, p_profile_id, false);
  if not private.attendance_can_manage_location(p_location_id) or not (
    exists (
      select 1 from public.overall_roles r
      where r.profile_id = v_actor and r.role in ('owner', 'manager', 'assistant_manager')
    ) or exists (
      select 1 from public.memberships m
      where m.organization_id = v_loc.organization_id and m.profile_id = v_actor
        and m.active and m.roles && array['owner', 'general_manager']::public.app_role[]
    ) or exists (
      select 1 from public.memberships m
      join public.location_memberships lm
        on lm.profile_id = m.profile_id and lm.location_id = v_loc.id
      where m.organization_id = v_loc.organization_id and m.profile_id = v_actor
        and m.active and lm.active and lm.role::text in ('manager', 'assistant_manager')
    )
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_clock_in_at is null or p_service_date is null or v_reason is null
     or length(v_reason) not between 3 and 500
     or v_key is null or length(v_key) > 128 then
    raise exception 'Employee, service date, both explicit times when complete, reason and operation key are required'
      using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  v_start_date := (p_clock_in_at at time zone v_loc.time_zone)::date;
  v_end_date := (coalesce(p_clock_out_at, p_clock_in_at) at time zone v_loc.time_zone)::date;
  if p_service_date <> v_start_date then
    raise exception 'Service date must match the location-local clock-in date' using errcode = '22023';
  end if;
  if p_clock_in_at > v_now or p_clock_out_at > v_now then
    raise exception 'Manual punches cannot be in the future' using errcode = '22023';
  end if;
  if p_clock_out_at is not null and (
    p_clock_out_at <= p_clock_in_at or p_clock_out_at > p_clock_in_at + interval '48 hours'
  ) then
    raise exception 'Clock-out must follow clock-in within 48 hours' using errcode = '22023';
  end if;
  if p_clock_out_at is null and v_start_date <> (v_now at time zone v_loc.time_zone)::date then
    raise exception 'Only a current local-date entry may remain open' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'location_id', p_location_id, 'profile_id', p_profile_id,
    'service_date', p_service_date, 'clock_in_at', p_clock_in_at,
    'clock_out_at', p_clock_out_at, 'reason', v_reason
  );
  -- Bind the operation key to the entire payload, including exact instants and
  -- reason. The existing event index scopes keys by organization and actor.
  v_replay := private.attendance_replay(
    v_loc.organization_id, v_actor, v_key, 'clock_in', p_location_id, p_profile_id
  );
  if v_replay.id is not null then
    if v_replay.metadata -> 'manual_payload' is distinct from v_payload then
      raise exception 'Operation key is already bound to different attendance values' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'success', true, 'idempotent', true, 'sessionId', v_replay.session_id,
      'eventId', v_replay.id,
      'status', case when p_clock_out_at is null then 'active' else 'completed' end
    );
  end if;

  -- Refuse insertion into a month with any existing native or linked external
  -- payroll period, whether draft or confirmed. A later adjustment workflow is
  -- the only path for a frozen month. The end month is covered for overnight work.
  if private.payroll_month_frozen(v_loc.organization_id, p_profile_id, v_start_date, v_end_date) then
    raise exception 'PERIOD_FROZEN: attendance cannot be inserted into an existing payroll month'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.attendance_sessions s
    where s.organization_id = v_loc.organization_id and s.profile_id = p_profile_id
      and s.status <> 'voided'
      and tstzrange(s.clock_in_at, coalesce(s.clock_out_at, 'infinity'), '[)')
          && tstzrange(p_clock_in_at, coalesce(p_clock_out_at, 'infinity'), '[)')
  ) then
    raise exception 'This entry overlaps another attendance session for the employee'
      using errcode = '23P01';
  end if;

  v_gross := case when p_clock_out_at is null then null
                  else floor(extract(epoch from p_clock_out_at - p_clock_in_at))::integer end;
  insert into public.attendance_sessions (
    organization_id, location_id, profile_id, service_date, status,
    clock_in_at, clock_out_at, gross_elapsed_seconds, created_by, updated_by
  ) values (
    v_loc.organization_id, p_location_id, p_profile_id, p_service_date,
    case when p_clock_out_at is null then 'active'::public.attendance_session_status
         else 'completed'::public.attendance_session_status end,
    p_clock_in_at, p_clock_out_at, v_gross, v_actor, v_actor
  ) returning id into v_session_id;

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id, event_type,
    event_time, service_date, source, idempotency_key, actor_profile_id,
    correction_reason, metadata
  ) values (
    v_session_id, v_loc.organization_id, p_location_id, p_profile_id,
    'clock_in', p_clock_in_at, p_service_date, 'manager', v_key, v_actor,
    v_reason, jsonb_build_object('kind', 'manual_entry', 'entered_at', v_now,
                                'manual_payload', v_payload)
  ) returning id into v_in_event;

  if p_clock_out_at is not null then
    insert into public.attendance_events (
      session_id, organization_id, location_id, profile_id, event_type,
      event_time, service_date, source, actor_profile_id, correction_reason, metadata
    ) values (
      v_session_id, v_loc.organization_id, p_location_id, p_profile_id,
      'clock_out', p_clock_out_at, p_service_date, 'manager', v_actor,
      v_reason, jsonb_build_object('kind', 'manual_entry', 'entered_at', v_now,
                                  'paired_clock_in_event_id', v_in_event)
    ) returning id into v_out_event;
  end if;

  return jsonb_build_object(
    'success', true, 'idempotent', false, 'sessionId', v_session_id,
    'eventId', v_in_event, 'clockOutEventId', v_out_event,
    'status', case when p_clock_out_at is null then 'active' else 'completed' end
  );
end;
$$;

revoke all on function public.attendance_manual_entry(uuid, uuid, date, timestamptz, timestamptz, text, text)
  from public, anon;
grant execute on function public.attendance_manual_entry(uuid, uuid, date, timestamptz, timestamptz, text, text)
  to authenticated;
