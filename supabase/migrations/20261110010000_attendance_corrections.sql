-- Migration: 20261110010000_attendance_corrections.sql
-- Feature V2-006: Attendance V2 - Batch B
--   V2-006.004: Manager Corrections (append-only, auditable)
--   V2-006.005: Reporting support (capability probe + correction indicators)
--
-- Additive and forward-only on top of 20261110000000. Original clock events are never
-- rewritten: a correction updates the session's EFFECTIVE values and appends exactly one
-- immutable ledger event (event_type manager_edit | void) carrying the full before/after
-- snapshot, the reason, the actor, a per-session sequence and the source event ids.

-- -----------------------------------------------------------------------------
-- 1. Versioning (optimistic concurrency) and correction indicators
-- -----------------------------------------------------------------------------
alter table public.attendance_sessions
  add column if not exists version integer not null default 1,
  add column if not exists correction_count integer not null default 0,
  add column if not exists last_corrected_at timestamptz;

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_correction_count_nonneg;
alter table public.attendance_sessions
  add constraint attendance_sessions_correction_count_nonneg check (correction_count >= 0);

comment on column public.attendance_sessions.version is
  'V2-006.004. Bumped by trigger on EVERY change (clock operations and corrections), so a manager acting on stale data is rejected with P0004.';

create or replace function private.attendance_sessions_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function private.attendance_sessions_bump_version() from public, anon, authenticated;

drop trigger if exists attendance_sessions_bump_version on public.attendance_sessions;
create trigger attendance_sessions_bump_version
  before update on public.attendance_sessions
  for each row execute function private.attendance_sessions_bump_version();

-- Correction history lookups (events of one session, corrections only).
create index if not exists attendance_events_corrections_idx
  on public.attendance_events (session_id, id)
  where is_manager_correction;

-- Summary view: append correction indicators (columns added at the END).
create or replace view public.attendance_session_summaries
with (security_invoker = true) as
select
  s.id as session_id,
  s.organization_id,
  s.location_id,
  s.profile_id,
  s.service_date,
  s.status,
  s.clock_in_at,
  s.clock_out_at,
  s.gross_elapsed_seconds,
  s.total_break_seconds,
  coalesce(b.paid_seconds, 0)::integer as paid_break_seconds,
  coalesce(b.unpaid_seconds, 0)::integer as unpaid_break_seconds,
  coalesce(b.unclassified_seconds, 0)::integer as unclassified_break_seconds,
  coalesce(b.open_breaks, 0)::integer as open_break_count,
  coalesce(b.break_count, 0)::integer as break_count,
  (s.status in ('completed', 'auto_clocked_out')) as is_closed,
  (
    s.status in ('completed', 'auto_clocked_out')
    and coalesce(b.open_breaks, 0) = 0
    and coalesce(b.unclassified_count, 0) = 0
  ) as break_policy_resolved,
  case
    when s.status in ('completed', 'auto_clocked_out')
      and coalesce(b.open_breaks, 0) = 0
      and coalesce(b.unclassified_count, 0) = 0
    then s.gross_elapsed_seconds - coalesce(b.unpaid_seconds, 0)::integer
  end as net_payable_seconds,
  s.version,
  s.correction_count,
  s.last_corrected_at
from public.attendance_sessions s
left join lateral (
  select
    sum(br.duration_seconds) filter (where br.pay_classification = 'paid') as paid_seconds,
    sum(br.duration_seconds) filter (where br.pay_classification = 'unpaid') as unpaid_seconds,
    sum(br.duration_seconds) filter (where br.pay_classification = 'unclassified') as unclassified_seconds,
    count(*) filter (where br.end_time is null) as open_breaks,
    count(*) filter (where br.pay_classification = 'unclassified') as unclassified_count,
    count(*) as break_count
  from public.attendance_breaks br
  where br.session_id = s.id
) b on true;

revoke all on public.attendance_session_summaries from public, anon, authenticated;
grant select on public.attendance_session_summaries to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Capability probe for the UI (reveals only the caller's OWN authority)
-- -----------------------------------------------------------------------------
create or replace function public.attendance_can_manage(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.attendance_can_manage_location(p_location_id), false);
$$;
revoke all on function public.attendance_can_manage(uuid) from public, anon;
grant execute on function public.attendance_can_manage(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Session snapshot (what a correction records as "before" / "after")
-- -----------------------------------------------------------------------------
create or replace function private.attendance_session_snapshot(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', s.status,
    'service_date', s.service_date,
    'clock_in_at', s.clock_in_at,
    'clock_out_at', s.clock_out_at,
    'gross_elapsed_seconds', s.gross_elapsed_seconds,
    'total_break_seconds', s.total_break_seconds,
    'breaks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'start_time', b.start_time,
        'end_time', b.end_time,
        'duration_seconds', b.duration_seconds,
        'pay_classification', b.pay_classification
      ) order by b.start_time, b.id)
      from public.attendance_breaks b
      where b.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.attendance_sessions s
  where s.id = p_session_id;
$$;
revoke all on function private.attendance_session_snapshot(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. attendance_correct_session
--
--   p_expected_version  the version the manager loaded (stale => P0004)
--   p_reason            mandatory, 3..500 characters after trimming
--   p_clock_in_at       corrected clock-in instant (optional)
--   p_clock_out_at      corrected clock-out instant (optional; on an OPEN session this
--                       closes it - the "missing clock-out" repair)
--   p_breaks            [{id, start_time?, end_time?, pay_classification?}] corrections
--   p_void              void the whole session (cannot be combined with other changes)
--   p_idempotency_key   retry safety, scoped to (organization, actor)
--
-- Authority: private.attendance_can_manage_location(session location) only. An unknown
-- session and an unauthorized caller get the identical denial.
-- -----------------------------------------------------------------------------
create or replace function public.attendance_correct_session(
  p_session_id uuid,
  p_expected_version integer,
  p_reason text,
  p_clock_in_at timestamptz default null,
  p_clock_out_at timestamptz default null,
  p_breaks jsonb default '[]'::jsonb,
  p_void boolean default false,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(trim(p_reason), '');
  v_key text := nullif(trim(p_idempotency_key), '');
  v_probe public.attendance_sessions%rowtype;
  v_s public.attendance_sessions%rowtype;
  v_loc public.locations%rowtype;
  v_replay public.attendance_events%rowtype;
  v_expected_type public.attendance_event_type;
  v_item jsonb;
  v_b public.attendance_breaks%rowtype;
  v_b_start timestamptz;
  v_b_end timestamptz;
  v_b_class public.attendance_break_pay_classification;
  v_now timestamptz;
  v_new_in timestamptz;
  v_new_out timestamptz;
  v_new_status public.attendance_session_status;
  v_total_break integer;
  v_gross integer;
  v_service_date date;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_primary text[];
  v_seq integer;
  v_version integer;
  v_event_id bigint;
  v_in_event bigint;
  v_out_event bigint;
  v_ids bigint[];
begin
  if v_uid is null or not private.attendance_live_session() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_reason is null or length(v_reason) not between 3 and 500 then
    raise exception 'A correction reason of 3 to 500 characters is required' using errcode = '22023';
  end if;
  if v_key is not null and length(v_key) > 128 then
    raise exception 'Idempotency key is too long' using errcode = '22023';
  end if;
  if p_breaks is null or jsonb_typeof(p_breaks) <> 'array' or jsonb_array_length(p_breaks) > 50 then
    raise exception 'Break corrections must be an array of at most 50 items' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'The expected record version is required' using errcode = '22023';
  end if;
  p_void := coalesce(p_void, false);
  if p_void and (p_clock_in_at is not null or p_clock_out_at is not null or jsonb_array_length(p_breaks) > 0) then
    raise exception 'Voiding a session cannot be combined with other changes' using errcode = '22023';
  end if;
  if not p_void and p_clock_in_at is null and p_clock_out_at is null and jsonb_array_length(p_breaks) = 0 then
    raise exception 'No change was requested' using errcode = '22023';
  end if;

  -- 1. Authority first, with a uniform denial (no existence oracle).
  select * into v_probe from public.attendance_sessions where id = p_session_id;
  if not found or not private.attendance_can_manage_location(v_probe.location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = v_probe.location_id for share;
  perform private.assert_location_module_enabled(v_probe.location_id, 'attendance');

  -- 2. Serialise with this employee's clock operations and other corrections.
  perform pg_advisory_xact_lock(
    hashtextextended('attendance:' || v_probe.organization_id::text || ':' || v_probe.profile_id::text, 0)
  );

  v_expected_type := case when p_void then 'void'::public.attendance_event_type
                          else 'manager_edit'::public.attendance_event_type end;

  -- 3. Idempotent replay (exact operation, same session).
  if v_key is not null then
    v_replay := private.attendance_replay(
      v_probe.organization_id, v_uid, v_key, v_expected_type, v_probe.location_id, v_probe.profile_id
    );
    if v_replay.id is not null then
      if v_replay.session_id <> p_session_id then
        raise exception 'Idempotency key was already used for a different operation' using errcode = '22023';
      end if;
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', p_session_id,
        'eventId', v_replay.id,
        'correctionSeq', (v_replay.metadata ->> 'seq')::integer,
        'version', (select version from public.attendance_sessions where id = p_session_id)
      );
    end if;
  end if;

  -- 4. Lock and verify the version the manager was looking at.
  select * into v_s from public.attendance_sessions where id = p_session_id for update;
  if v_s.version <> p_expected_version then
    raise exception 'This attendance record was changed by someone else. Reload and try again.' using errcode = 'P0004';
  end if;
  if v_s.status = 'voided' then
    raise exception 'A voided session cannot be corrected' using errcode = '55000';
  end if;

  v_now := clock_timestamp();
  v_before := private.attendance_session_snapshot(p_session_id);

  select max(e.id) filter (where e.event_type = 'clock_in'),
         max(e.id) filter (where e.event_type = 'clock_out')
    into v_in_event, v_out_event
  from public.attendance_events e
  where e.session_id = p_session_id and not e.is_manager_correction;

  if p_void then
    -- Void: the session leaves every total; its events and breaks remain for audit.
    update public.attendance_sessions
    set status = 'voided',
        updated_at = v_now,
        updated_by = v_uid,
        correction_count = correction_count + 1,
        last_corrected_at = v_now
    where id = p_session_id
    returning version, correction_count into v_version, v_seq;
  else
    v_new_in := coalesce(p_clock_in_at, v_s.clock_in_at);
    v_new_out := coalesce(p_clock_out_at, v_s.clock_out_at);

    if v_new_in > v_now + interval '1 minute'
       or (v_new_out is not null and v_new_out > v_now + interval '1 minute') then
      raise exception 'Corrected times cannot be in the future' using errcode = '22023';
    end if;
    if v_new_out is not null and v_new_out < v_new_in then
      raise exception 'Clock-out cannot be before clock-in' using errcode = '22023';
    end if;

    -- Break corrections.
    select array_agg((i ->> 'id')::bigint) into v_ids from jsonb_array_elements(p_breaks) i;
    if v_ids is not null and (
         exists (select 1 from unnest(v_ids) x where x is null)
         or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids)
       ) then
      raise exception 'Each break must be identified exactly once' using errcode = '22023';
    end if;

    for v_item in select * from jsonb_array_elements(p_breaks) loop
      select * into v_b
      from public.attendance_breaks
      where id = (v_item ->> 'id')::bigint and session_id = p_session_id
      for update;
      if not found then
        raise exception 'Break not found on this session' using errcode = '22023';
      end if;

      v_b_start := coalesce((v_item ->> 'start_time')::timestamptz, v_b.start_time);
      v_b_end := case when v_item ? 'end_time' then (v_item ->> 'end_time')::timestamptz else v_b.end_time end;
      if v_b.end_time is not null and v_b_end is null then
        raise exception 'A finished break cannot be reopened' using errcode = '22023';
      end if;
      if v_b_end is not null and v_b_end < v_b_start then
        raise exception 'Break end cannot be before break start' using errcode = '22023';
      end if;
      if v_b_start > v_now + interval '1 minute' or (v_b_end is not null and v_b_end > v_now + interval '1 minute') then
        raise exception 'Corrected times cannot be in the future' using errcode = '22023';
      end if;

      v_b_class := v_b.pay_classification;
      if v_item ? 'pay_classification' then
        v_b_class := (v_item ->> 'pay_classification')::public.attendance_break_pay_classification;
      end if;

      update public.attendance_breaks
      set start_time = v_b_start,
          end_time = v_b_end,
          duration_seconds = case when v_b_end is null then null
                                  else floor(extract(epoch from (v_b_end - v_b_start)))::integer end,
          pay_classification = v_b_class,
          classified_by = case when v_b_class = 'unclassified' then null
                               when v_b_class is distinct from v_b.pay_classification then v_uid
                               else v_b.classified_by end,
          classified_at = case when v_b_class = 'unclassified' then null
                               when v_b_class is distinct from v_b.pay_classification then v_now
                               else v_b.classified_at end
      where id = v_b.id;
    end loop;

    -- Closing an open session (missing clock-out): any break still open ends with the shift.
    if v_s.clock_out_at is null and v_new_out is not null then
      update public.attendance_breaks
      set end_time = v_new_out,
          duration_seconds = greatest(0, floor(extract(epoch from (v_new_out - start_time)))::integer)
      where session_id = p_session_id and end_time is null and start_time <= v_new_out;
    end if;

    -- Whole-session invariants against the resulting break set.
    if exists (
      select 1 from public.attendance_breaks b
      where b.session_id = p_session_id
        and (b.start_time < v_new_in
             or (v_new_out is not null and (b.end_time is null or b.end_time > v_new_out or b.start_time > v_new_out)))
    ) then
      raise exception 'Every break must fall inside the corrected shift' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.attendance_breaks a
      join public.attendance_breaks b on b.session_id = a.session_id and a.id < b.id
      where a.session_id = p_session_id
        and tstzrange(a.start_time, coalesce(a.end_time, 'infinity'), '[)')
            && tstzrange(b.start_time, coalesce(b.end_time, 'infinity'), '[)')
    ) then
      raise exception 'Breaks cannot overlap' using errcode = '22023';
    end if;

    -- The corrected shift must not collide with another of this employee's sessions.
    if exists (
      select 1 from public.attendance_sessions o
      where o.organization_id = v_s.organization_id
        and o.profile_id = v_s.profile_id
        and o.id <> v_s.id
        and o.status <> 'voided'
        and tstzrange(o.clock_in_at, coalesce(o.clock_out_at, 'infinity'), '[)')
            && tstzrange(v_new_in, coalesce(v_new_out, 'infinity'), '[)')
    ) then
      raise exception 'The corrected shift overlaps another attendance session for this employee' using errcode = '23P01';
    end if;

    select coalesce(sum(duration_seconds), 0)::integer into v_total_break
    from public.attendance_breaks where session_id = p_session_id and end_time is not null;

    v_gross := case when v_new_out is null then null
                    else greatest(0, floor(extract(epoch from (v_new_out - v_new_in)))::integer) end;
    if v_gross is not null and v_total_break > v_gross then
      raise exception 'Total break time cannot exceed the shift' using errcode = '22023';
    end if;

    v_new_status := v_s.status;
    if v_new_out is not null then
      v_new_status := case when v_s.status = 'auto_clocked_out' then 'auto_clocked_out'::public.attendance_session_status
                           else 'completed'::public.attendance_session_status end;
    elsif v_s.status = 'on_break' and not exists (
      select 1 from public.attendance_breaks where session_id = p_session_id and end_time is null
    ) then
      v_new_status := 'active';
    end if;

    v_service_date := (v_new_in at time zone v_loc.time_zone)::date;

    update public.attendance_sessions
    set status = v_new_status,
        clock_in_at = v_new_in,
        clock_out_at = v_new_out,
        service_date = v_service_date,
        gross_elapsed_seconds = v_gross,
        total_break_seconds = v_total_break,
        updated_at = v_now,
        updated_by = v_uid,
        correction_count = correction_count + 1,
        last_corrected_at = v_now
    where id = p_session_id
    returning version, correction_count into v_version, v_seq;
  end if;

  v_after := private.attendance_session_snapshot(p_session_id);

  select coalesce(array_agg(k order by k), '{}') into v_changed
  from jsonb_object_keys(v_after) k
  where v_after -> k is distinct from v_before -> k;

  if not p_void and cardinality(v_changed) = 0 then
    raise exception 'The requested values match the current record; nothing to correct' using errcode = '22023';
  end if;

  -- The fields a manager actually edited (derived totals / status follow from them).
  select coalesce(array_agg(x order by x), '{}') into v_primary
  from unnest(v_changed) x
  where x not in ('gross_elapsed_seconds', 'total_break_seconds', 'status', 'service_date');

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id,
    event_type, event_time, service_date, source, idempotency_key, actor_profile_id,
    is_manager_correction, reverses_event_id, correction_reason, metadata
  ) values (
    v_s.id, v_s.organization_id, v_s.location_id, v_s.profile_id,
    v_expected_type, v_now, (v_after ->> 'service_date')::date, 'manager', v_key, v_uid,
    true,
    case when p_void then null
         when v_primary = array['clock_in_at'] then v_in_event
         when v_primary = array['clock_out_at'] then v_out_event
         else null end,
    v_reason,
    jsonb_build_object(
      'kind', case when p_void then 'session_void' else 'session_correction' end,
      'seq', v_seq,
      'version_before', v_s.version,
      'version_after', v_version,
      'before', v_before,
      'after', v_after,
      'changed_fields', to_jsonb(v_changed),
      'source_events', jsonb_build_object('clock_in', v_in_event, 'clock_out', v_out_event),
      'self_correction', v_s.profile_id = v_uid
    )
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_s.id,
    'eventId', v_event_id,
    'correctionSeq', v_seq,
    'version', v_version,
    'status', v_after ->> 'status',
    'changedFields', to_jsonb(v_changed)
  );
end;
$$;

revoke all on function public.attendance_correct_session(uuid, integer, text, timestamptz, timestamptz, jsonb, boolean, text) from public, anon;
grant execute on function public.attendance_correct_session(uuid, integer, text, timestamptz, timestamptz, jsonb, boolean, text) to authenticated;
