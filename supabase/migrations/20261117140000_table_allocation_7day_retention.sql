-- Table Allocation 7-Day Operational Data Retention (V2.0.4)
--
-- Scope:
-- In accordance with the Table Allocation 7-day operational history boundary,
-- operational history is scoped to today plus the previous 6 business dates (7 dates total).
-- Older operational allocation records for CLOSED sessions are purged to prevent bloat
-- while preserving:
--   1. service_sessions (status = 'closed') - required for location lifecycle integrity
--      (private.location_lifecycle_retained tracks closedServiceSessions).
--   2. seatings - preserved for customer dining records, party size tracking, and audit.
--   3. active or planned sessions - strictly untouched regardless of service_date.
--
-- Disposable records purged for closed sessions older than 7 days:
--   - section_assignments
--   - table_rotation_entries
--   - rotation_rounds
--   - rotation_members
-- Note: board_events is already cleaned up by private.cleanup_stale_board_events()
-- (migration 20260919130000_board_events_retention.sql).
--
-- Safety & Security:
-- private.cleanup_stale_table_allocation_records is SECURITY DEFINER with search_path = ''.
-- All execution grants are revoked from public, anon, and authenticated.
-- Only the scheduled pg_cron job or service-role maintenance can execute it.
-- Scheduling is conditional on the existence of the cron extension/schema.

create or replace function private.cleanup_stale_table_allocation_records() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale_session_ids bigint[];
begin
  -- Identify closed service sessions strictly older than the 7-day operational window
  -- (today minus 6 days) for their location's configured time zone.
  select coalesce(array_agg(s.id), '{}')
    into v_stale_session_ids
  from public.service_sessions s
  join public.locations l on l.id = s.location_id
  where s.status = 'closed'
    and s.service_date < ((now() at time zone coalesce(l.time_zone, 'America/Chicago'))::date - 6);

  if array_length(v_stale_session_ids, 1) is null or array_length(v_stale_session_ids, 1) = 0 then
    return;
  end if;

  -- 1. Purge disposable section_assignments for stale closed sessions
  delete from public.section_assignments
  where service_session_id = any(v_stale_session_ids);

  -- 2. Purge disposable table_rotation_entries for stale closed sessions
  delete from public.table_rotation_entries
  where service_session_id = any(v_stale_session_ids);

  -- 3. Purge disposable rotation_rounds for stale closed sessions
  delete from public.rotation_rounds
  where service_session_id = any(v_stale_session_ids);

  -- 4. Purge disposable rotation_members for stale closed sessions
  delete from public.rotation_members
  where service_session_id = any(v_stale_session_ids);
end;
$$;

revoke all on function private.cleanup_stale_table_allocation_records() from public, anon, authenticated;

-- Schedule via pg_cron daily at 03:30 (staggered 30 mins after board_events at 03:00)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'table_allocation_records_retention') then
      perform cron.schedule(
        'table_allocation_records_retention',
        '30 3 * * *',
        $cron$select private.cleanup_stale_table_allocation_records();$cron$
      );
    end if;
  end if;
end;
$$;
