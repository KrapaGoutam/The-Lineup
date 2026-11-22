-- V2.0.13 follow-up: managers and assistant managers may check / uncheck any APPLICABLE
-- cell of the ACTIVE run without a per-board switch.
--
-- Forward-only. The four V2.0.13 migrations are already applied to hosted DEV and are not
-- edited. This re-creates public.chore_cell_set with the SAME signature (grants, callers and
-- the chore-RPC count are unchanged; CREATE OR REPLACE keeps the existing ACL).
--
-- Authority, resolved from auth.uid() only (never a parameter):
--   * the column's own person ......................... entered_as 'self'
--   * an unassigned position column, eligible staff ... 'position'
--   * any-workforce (shared tablet) boards ............ 'shared'
--   * a manager / assistant manager of THIS location ... 'manager_correction'
--     (private.tasks_is_manager: the existing location-scoped effective-capability resolver;
--      a manager of another location or organization, or an assistant manager without that
--      capability here, is refused with 42501). The board's manager_override no longer gates
--      this; it still gates corrections to a CLOSED run (chore_cycle_correct) unchanged.
-- Unchanged: not-applicable cells stay refused for everyone, completion-rule semantics,
-- run locking, the F-1 stale-period refusal, and immutable snapshots.
-- Audit: events additionally carry assigned_profile_id (the column's person), so a
-- management action never reads as the assignee. completed_by stays the real actor; an
-- uncheck removes only the CURRENT-state row and appends a cell_unchecked event; the
-- original cell_checked event is never rewritten.

begin;

create or replace function public.chore_cell_set(
  p_board_id uuid, p_row_id uuid, p_column_id uuid, p_done boolean, p_expected_cycle_id uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.chore_boards;
  cy public.chore_cycles;
  w public.chore_rows;
  c public.chore_columns;
  v_actor uuid := (select auth.uid());
  v_done boolean := coalesce(p_done, false);
  v_cycle uuid;
  v_as text;
  v_name text;
  v_other record;
  v_count integer;
  v_prev uuid;
begin
  b := private.chore_board_authorize(p_board_id, false, 'share', true);

  -- The run row is locked BEFORE anything is read or written: ticks of one board
  -- serialise, so the completeness check below sees every committed tick and exactly
  -- one of two simultaneous "last" ticks closes the run.
  v_cycle := private.chore_open_cycle(b.id);
  if v_cycle is null then
    raise exception 'This board is between runs. The next run has not started yet.' using errcode = '22023';
  end if;
  select * into cy from public.chore_cycles where id = v_cycle for update;
  if cy.status <> 'open' or (p_expected_cycle_id is not null and p_expected_cycle_id <> cy.id) then
    raise exception 'This run has already ended. Reload to see the current run.' using errcode = 'P0001';
  end if;
  -- F-1: a daily / weekly run whose day / week has ended is stale even though it is still
  -- 'open' (the sweep has not rolled it yet). Writing to it would put a new-period check
  -- into the old run's frozen record. Refuse -- nothing is written, the transaction
  -- rolls back -- and let the refresh (which runs the sweep) show the current run; the
  -- person then checks the cell again in the new run. Applies to tick AND untick.
  if private.chore_run_period_ended(b, cy) then
    raise exception 'This run has already ended for its day. Reload to see the current run, then check it again.' using errcode = 'P0001';
  end if;

  select * into w from public.chore_rows
  where id = p_row_id and board_id = b.id and archived_at is null and is_active for update;
  select * into c from public.chore_columns
  where id = p_column_id and board_id = b.id and archived_at is null and is_active;
  if w.id is null or c.id is null then
    raise exception 'That chore or column is not available.' using errcode = '22023';
  end if;
  if w.requirement_mode = 'selected_columns' and not exists (
       select 1 from public.chore_row_columns rc where rc.row_id = w.id and rc.column_id = c.id) then
    raise exception 'That chore does not apply to this column.' using errcode = '22023';
  end if;

  -- Who may act on this cell. Identity is auth.uid(), never a parameter.
  if c.profile_id = v_actor then
    v_as := 'self';
  elsif c.profile_id is null and private.tasks_workforce_eligible(b.organization_id, b.location_id, v_actor) then
    v_as := 'position';
  elsif b.staff_access = 'any_workforce'
        and private.tasks_workforce_eligible(b.organization_id, b.location_id, v_actor) then
    v_as := 'shared';
  elsif private.tasks_is_manager(b.organization_id, b.location_id) then
    -- Management authority over THIS location (the same effective-capability resolver every
    -- Tasks management action uses). No board switch is needed: the board's manager-override
    -- setting now only governs corrections to an already CLOSED run (chore_cycle_correct).
    v_as := 'manager_correction';
  else
    raise exception 'You can only update your own column on this board.' using errcode = '42501';
  end if;

  if v_done then
    if w.requirement_mode = 'any_one' then
      select cp.column_id, cp.completed_by_name into v_other
      from public.chore_completions cp
      where cp.cycle_id = cy.id and cp.row_id = w.id and cp.column_id <> c.id limit 1;
      if found then
        raise exception 'This chore is already done by %.', v_other.completed_by_name using errcode = '22023';
      end if;
    end if;
    select p.display_name into v_name from public.profiles p where p.id = v_actor;
    insert into public.chore_completions (board_id, organization_id, cycle_id, row_id, column_id,
      completed_by, completed_by_name, entered_as)
    values (b.id, b.organization_id, cy.id, w.id, c.id, v_actor, coalesce(v_name, 'Unknown'), v_as)
    on conflict (cycle_id, row_id, column_id) do nothing;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      return 'unchanged';
    end if;
    perform private.chore_emit(b, cy.id, w.id, c.id, 'cell_checked',
      jsonb_build_object('entered_as', v_as, 'assigned_profile_id', c.profile_id,
        'row_title', w.title, 'column_label', c.label));
    if cy.structure_version_start is null then
      update public.chore_cycles set structure_version_start = b.structure_version where id = cy.id;
    end if;
    -- Automatic reset: the SYSTEM closes the run the tick just finished (not the ticker).
    if b.reset_intent = 'automatic_after_completion'
       and private.chore_cycle_is_complete(b.id, cy.id) then
      if private.chore_finish_cycle(b, cy.id, 'completed', 'automatic', null, 'system', null) then
        if b.recurrence_intent = 'continuous' then
          perform private.chore_start_run(b, 'system', null, null);
        end if;
        return 'checked_closed';
      end if;
    end if;
    return 'checked';
  end if;

  delete from public.chore_completions
  where cycle_id = cy.id and row_id = w.id and column_id = c.id
  returning completed_by into v_prev;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 'unchanged';
  end if;
  perform private.chore_emit(b, cy.id, w.id, c.id, 'cell_unchecked',
    jsonb_build_object('entered_as', v_as, 'assigned_profile_id', c.profile_id,
      'previous_completed_by', v_prev,
      'corrected', v_prev is distinct from v_actor, 'row_title', w.title, 'column_label', c.label));
  return 'unchecked';
end;
$$;

commit;
