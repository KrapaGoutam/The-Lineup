-- V2-006 consolidated independent review: preserve native confirmation integrity.
-- Forward-only corrective migration; original R2 migration/checksum stays intact.
-- Does not activate financial processing or change any historical row.
begin;

create or replace function private.payroll_periods_native_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state record;
begin
  if new.attendance_source <> 'internal_the_lineup' then
    return new;
  end if;

  -- Q6: confirmation is final for native consumption. The legacy Neon unlock
  -- workflow remains available for Neon; native corrections use audited reviews.
  if old.status = 'locked' and new.status <> 'locked' then
    raise exception 'PERIOD_FROZEN: a confirmed native payroll period cannot be reopened. Corrections go through the adjustment review.'
      using errcode = '55000';
  end if;

  if old.status = 'draft' and new.status = 'locked' then
    -- A row UPDATE already holds the period row lock. Blocking here would invert
    -- generation's employee-lock -> period-row order and could deadlock. Refuse
    -- a busy employee instead; retry re-proves committed attendance. Once held,
    -- this transaction excludes every clock/correction operation until commit.
    if not pg_try_advisory_xact_lock(
      hashtextextended('attendance:' || new.organization_id::text || ':' || new.profile_id::text, 0)
    ) then
      raise exception 'PERIOD_NOT_FINAL: attendance is being changed. Retry after the attendance operation finishes.'
        using errcode = '55000';
    end if;

    select * into v_state from private.payroll_native_period_state(new.id);
    if v_state.stale_rows > 0 or v_state.unconsumed_eligible > 0 or v_state.unresolved_sessions > 0 then
      raise exception 'PERIOD_NOT_FINAL: attendance changed or is unresolved (stale %, unconsumed %, unresolved %); regenerate the draft first.',
        v_state.stale_rows, v_state.unconsumed_eligible, v_state.unresolved_sessions using errcode = '55000';
    end if;
    if v_state.active_rows = 0
       or round(new.hours_snapshot * 3600) <> v_state.ledger_seconds then
      raise exception 'PERIOD_NOT_RECONCILED: the hours snapshot does not match the consumption ledger.' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_periods_native_lock_guard() from public, anon, authenticated;

commit;
