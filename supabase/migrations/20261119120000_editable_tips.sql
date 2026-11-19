-- V2.0.8: Editable Tips Management.
--
-- Forward-only and additive. Nothing here touches payroll, attendance or any historical
-- row's money: existing intervals keep their amount_cents; their tender (cash/card) is
-- simply "not recorded" (cash = card = 0), which every reader renders as "Not split".
--
-- What it adds
--   * tip_intervals: cash_cents / card_cents (tender split), revision (optimistic
--     concurrency token), updated_at, and a soft-void (voided_at/by, void_reason).
--   * tip_allocations: cash_cents / card_cents per person.
--   * tip_revisions: append-only audit of every change (before/after interval and
--     distribution, editor, reason, affected people). Written by the RPCs below and, for
--     the direct-table path the previously deployed app still uses, by triggers.
--   * private.tips_interval_shares: the ONE definition of how an interval is divided.
--   * recalculate_tip_pool: now tender-aware and void-aware (same total split as before).
--   * RPCs: tips_save_interval, tips_void_interval, tips_recalculate_pool, tips_get_range.
--   * tips_get_day_data: voided intervals are hidden from the legacy day reader.
--
-- Rollback (see docs/features/v2-0-8-editable-tips/HANDOFF.md): drop the four new RPCs,
-- the triggers and tip_revisions, restore recalculate_tip_pool / tips_get_day_data from
-- 20261107194700, then drop the added columns. No pre-existing column is altered.
begin;

-- 1. Columns ---------------------------------------------------------------------------
alter table public.tip_intervals
  add column cash_cents integer not null default 0,
  add column card_cents integer not null default 0,
  add column revision integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add column voided_at timestamptz,
  add column voided_by uuid,
  add column void_reason text;

-- Either "tender not recorded" (0 + 0) or fully classified (cash + card = total).
alter table public.tip_intervals
  add constraint tip_intervals_tender_nonneg check (cash_cents >= 0 and card_cents >= 0),
  add constraint tip_intervals_tender_reconciles
    check (cash_cents + card_cents = 0 or cash_cents + card_cents = amount_cents),
  add constraint tip_intervals_revision_positive check (revision >= 1),
  add constraint tip_intervals_void_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and length(btrim(void_reason)) >= 3)
  );

alter table public.tip_allocations
  add column cash_cents integer not null default 0,
  add column card_cents integer not null default 0,
  add constraint tip_allocations_tender_within_total
    check (cash_cents >= 0 and card_cents >= 0 and cash_cents + card_cents <= amount_cents);

-- 2. Append-only revision log ----------------------------------------------------------
-- tip_pool_id / tip_interval_id / location_id / editor are plain columns on purpose: the
-- audit must survive the deletion of a draft pool, and must not block profile or location
-- housekeeping. Rows are only ever inserted by the SECURITY DEFINER code in this file.
create table public.tip_revisions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  tip_pool_id bigint not null,
  tip_interval_id bigint,
  action text not null check (action in (
    'interval_created', 'interval_updated', 'interval_voided', 'pool_recalculated',
    'direct_interval_insert', 'direct_interval_update', 'direct_interval_delete',
    'direct_participant_change', 'direct_pool_delete'
  )),
  source text not null check (source in ('rpc', 'direct')),
  editor_profile_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  before_state jsonb,
  after_state jsonb,
  affected_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id)
);
create index tip_revisions_pool_idx on public.tip_revisions (location_id, tip_pool_id, created_at);
create index tip_revisions_org_idx on public.tip_revisions (organization_id);

alter table public.tip_revisions enable row level security;
revoke all on table public.tip_revisions from public, anon, authenticated;
grant select on table public.tip_revisions to authenticated;
revoke all on sequence public.tip_revisions_id_seq from public, anon, authenticated;

create policy "tip_revisions_select_manager" on public.tip_revisions
  for select to authenticated
  using (private.tips_is_manager(organization_id, location_id));

create policy tip_revisions_module_enforcement on public.tip_revisions
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tips'));

-- 3. The single definition of an interval's division -----------------------------------
-- Participants are ranked by profile id. The TOTAL is split exactly as before
-- (floor(total/n), first total%n ranks get one extra cent). Cash is split the same way on
-- its own, and card is the remainder of each person's total, so that
--   * sum(cash) = interval cash, sum(card) = interval card, sum(total) = interval total,
--   * no cent is lost or duplicated,
--   * a person's total never depends on the tender mix (it equals the legacy split).
-- card >= 0 always holds: if cash_i = floor(C/n)+1 then rank <= C%n, and T >= C implies
-- total_i >= floor(C/n)+1. Intervals without a recorded tender yield cash = card = 0.
create or replace function private.tips_interval_shares(p_interval_id bigint)
returns table (
  profile_id uuid,
  amount_cents integer,
  cash_cents integer,
  card_cents integer,
  share_rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with i as (
    select id, amount_cents, cash_cents, card_cents,
           (cash_cents + card_cents = amount_cents and amount_cents > 0) as classified
    from public.tip_intervals
    where id = p_interval_id
  ), p as (
    select part.profile_id,
           (row_number() over (order by part.profile_id))::integer as rnk,
           (count(*) over ())::integer as n
    from public.tip_interval_participants part
    where part.tip_interval_id = p_interval_id
  ), s as (
    select p.profile_id, p.rnk,
           (i.amount_cents / p.n + case when p.rnk <= i.amount_cents % p.n then 1 else 0 end) as total_share,
           case when i.classified
                then (i.cash_cents / p.n + case when p.rnk <= i.cash_cents % p.n then 1 else 0 end)
                else 0 end as cash_share,
           i.classified
    from i cross join p
  )
  select s.profile_id,
         s.total_share,
         s.cash_share,
         case when s.classified then s.total_share - s.cash_share else 0 end,
         s.rnk
  from s;
$$;
revoke all on function private.tips_interval_shares(bigint) from public, anon, authenticated;

create or replace function private.tips_interval_snapshot(p_interval_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'starts_at', i.starts_at,
    'ends_at', i.ends_at,
    'cash_cents', i.cash_cents,
    'card_cents', i.card_cents,
    'amount_cents', i.amount_cents,
    'revision', i.revision,
    'voided_at', i.voided_at,
    'void_reason', i.void_reason,
    'participant_ids', coalesce((
      select jsonb_agg(part.profile_id order by part.profile_id)
      from public.tip_interval_participants part
      where part.tip_interval_id = i.id
    ), '[]'::jsonb)
  )
  from public.tip_intervals i
  where i.id = p_interval_id;
$$;
revoke all on function private.tips_interval_snapshot(bigint) from public, anon, authenticated;

create or replace function private.tips_distribution_snapshot(p_pool_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', a.profile_id,
    'amount_cents', a.amount_cents,
    'cash_cents', a.cash_cents,
    'card_cents', a.card_cents
  ) order by a.profile_id), '[]'::jsonb)
  from public.tip_allocations a
  where a.tip_pool_id = p_pool_id;
$$;
revoke all on function private.tips_distribution_snapshot(bigint) from public, anon, authenticated;

-- 4. Recalculation: tender-aware, void-aware ---------------------------------------------
create or replace function public.recalculate_tip_pool(target_tip_pool_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool record;
begin
  select id, organization_id, location_id, status into v_pool
  from public.tip_pools
  where id = target_tip_pool_id
  for update;

  -- Same error for "no such pool" and "not yours" so pool ids cannot be probed.
  if v_pool.id is null
     or not private.tips_is_manager(v_pool.organization_id, v_pool.location_id) then
    raise exception 'Draft tip pool not found' using errcode = 'P0002';
  end if;

  if v_pool.status != 'draft' then
    raise exception 'Draft tip pool not found' using errcode = 'P0002';
  end if;

  perform private.assert_location_module_enabled(v_pool.location_id, 'tips');

  delete from public.tip_allocations
  where tip_pool_id = target_tip_pool_id;

  insert into public.tip_allocations (
    organization_id, tip_pool_id, profile_id, amount_cents, cash_cents, card_cents
  )
  select v_pool.organization_id, target_tip_pool_id, s.profile_id,
         sum(s.amount_cents)::integer, sum(s.cash_cents)::integer, sum(s.card_cents)::integer
  from public.tip_intervals i
  cross join lateral private.tips_interval_shares(i.id) s
  where i.tip_pool_id = target_tip_pool_id
    and i.voided_at is null
  group by s.profile_id;
end;
$$;
revoke all on function public.recalculate_tip_pool(bigint) from public, anon;
grant execute on function public.recalculate_tip_pool(bigint) to authenticated;

-- 5. Path-independent capture of DIRECT table writes -------------------------------------
-- The previously deployed app writes tip_pools / tip_intervals / tip_interval_participants
-- directly. Those writes stay allowed (rollout compatibility) but can no longer be
-- invisible: every direct change is recorded with its before/after row. The RPCs set the
-- transaction-local flag app.tips_rpc so they are not double-recorded (they write their own
-- richer revision). A cascade (pool or organization delete) runs at trigger depth > 1 and
-- is skipped, so housekeeping is not blocked.
create or replace function private.tips_capture_direct_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool bigint;
  v_interval bigint;
  v_org uuid;
  v_loc uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_profiles uuid[] := '{}';
begin
  if pg_trigger_depth() > 1
     or coalesce(current_setting('app.tips_rpc', true), '') = 'on' then
    return null;
  end if;

  if tg_table_name = 'tip_pools' then
    v_pool := old.id;
    v_org := old.organization_id;
    v_loc := old.location_id;
    v_action := 'direct_pool_delete';
    v_before := to_jsonb(old);
  elsif tg_table_name = 'tip_intervals' then
    v_interval := coalesce(new.id, old.id);
    v_pool := coalesce(new.tip_pool_id, old.tip_pool_id);
    v_org := coalesce(new.organization_id, old.organization_id);
    v_action := case tg_op
      when 'INSERT' then 'direct_interval_insert'
      when 'UPDATE' then 'direct_interval_update'
      else 'direct_interval_delete' end;
    v_before := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_after := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  else
    v_interval := coalesce(new.tip_interval_id, old.tip_interval_id);
    v_org := coalesce(new.organization_id, old.organization_id);
    v_action := 'direct_participant_change';
    v_before := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_after := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    v_profiles := array[coalesce(new.profile_id, old.profile_id)];
    select tip_pool_id into v_pool from public.tip_intervals where id = v_interval;
  end if;

  if v_loc is null then
    select location_id into v_loc from public.tip_pools
    where id = v_pool and organization_id = v_org;
  end if;
  if v_loc is null or v_pool is null then
    return null;
  end if;

  insert into public.tip_revisions (
    organization_id, location_id, tip_pool_id, tip_interval_id, action, source,
    editor_profile_id, before_state, after_state, affected_profile_ids
  ) values (
    v_org, v_loc, v_pool, v_interval, v_action, 'direct',
    (select auth.uid()), v_before, v_after, v_profiles
  );
  return null;
end;
$$;
revoke all on function private.tips_capture_direct_write() from public, anon, authenticated;

drop trigger if exists tip_pools_capture_direct on public.tip_pools;
create trigger tip_pools_capture_direct
  after delete on public.tip_pools
  for each row execute function private.tips_capture_direct_write();

drop trigger if exists tip_intervals_capture_direct on public.tip_intervals;
create trigger tip_intervals_capture_direct
  after insert or update or delete on public.tip_intervals
  for each row execute function private.tips_capture_direct_write();

drop trigger if exists tip_participants_capture_direct on public.tip_interval_participants;
create trigger tip_participants_capture_direct
  after insert or update or delete on public.tip_interval_participants
  for each row execute function private.tips_capture_direct_write();

-- NOTE on the conflict code: a stale revision raises SQLSTATE P0409, NOT 40001. PostgREST treats
-- 40001 (serialization_failure) as retryable, so a deterministic conflict would loop forever.
-- 6. Save (create or update) one interval ------------------------------------------------
create or replace function public.tips_save_interval(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_cash_cents integer,
  p_card_cents integer,
  p_participant_ids uuid[],
  -- Update-only arguments (null / omitted = create a new interval).
  p_interval_id bigint default null,
  p_expected_revision integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_tz text;
  v_participants uuid[];
  v_pid uuid;
  v_pool record;
  v_interval record;
  v_interval_id bigint;
  v_before jsonb;
  v_before_dist jsonb;
  v_total integer;
  v_old_participants uuid[] := '{}';
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tips');

  if p_cash_cents is null or p_card_cents is null
     or p_cash_cents < 0 or p_card_cents < 0
     or p_cash_cents > 10000000 or p_card_cents > 10000000 then
    raise exception 'Cash and card tips must each be between $0.00 and $100,000.00.' using errcode = '22003';
  end if;
  v_total := p_cash_cents + p_card_cents;
  if v_total <= 0 then
    raise exception 'Enter a cash or card tip amount greater than zero.' using errcode = '22003';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at > interval '24 hours' then
    raise exception 'Tip interval must end after it starts and last at most 24 hours.' using errcode = '22023';
  end if;

  select l.time_zone into v_tz
  from public.locations l
  where l.id = p_location_id and l.organization_id = p_organization_id;
  if v_tz is null or p_service_date is null
     or (p_starts_at at time zone v_tz)::date <> p_service_date then
    raise exception 'The interval must start on the service date.' using errcode = '22023';
  end if;

  select array_agg(distinct x order by x) into v_participants
  from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as x
  where x is not null;
  if v_participants is null or cardinality(v_participants) = 0 then
    raise exception 'Choose at least one participant.' using errcode = '22023';
  end if;
  if cardinality(v_participants) > 200 then
    raise exception 'Too many participants for one interval.' using errcode = '22023';
  end if;

  if p_interval_id is not null and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Enter a short reason for the change (at least 3 characters).' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'The reason is too long (500 characters at most).' using errcode = '22023';
  end if;

  perform set_config('app.tips_rpc', 'on', true);

  -- Serialize every writer of this day on the pool row.
  select id, organization_id, location_id, status into v_pool
  from public.tip_pools
  where location_id = p_location_id and organization_id = p_organization_id
    and service_date = p_service_date
  for update;

  if v_pool.id is null then
    if p_interval_id is not null then
      raise exception 'Tip interval not found for this day.' using errcode = 'P0002';
    end if;
    insert into public.tip_pools (organization_id, location_id, service_date, status)
    values (p_organization_id, p_location_id, p_service_date, 'draft')
    returning id, organization_id, location_id, status into v_pool;
  end if;

  if v_pool.status <> 'draft' then
    raise exception 'This day was finalized by the earlier workflow and is locked. Use "Correct locked record" with a reason first.' using errcode = '22023';
  end if;

  if p_interval_id is not null then
    select * into v_interval
    from public.tip_intervals
    where id = p_interval_id and tip_pool_id = v_pool.id
    for update;
    if v_interval.id is null then
      raise exception 'Tip interval not found for this day.' using errcode = 'P0002';
    end if;
    if v_interval.voided_at is not null then
      raise exception 'A voided interval cannot be edited.' using errcode = '22023';
    end if;
    if p_expected_revision is distinct from v_interval.revision then
      raise exception 'This interval was changed by someone else. Reload and try again.' using errcode = 'P0409';
    end if;
    select coalesce(array_agg(profile_id), '{}') into v_old_participants
    from public.tip_interval_participants where tip_interval_id = p_interval_id;
    v_before := private.tips_interval_snapshot(p_interval_id);
  end if;

  if exists (
    select 1 from public.tip_intervals o
    where o.tip_pool_id = v_pool.id
      and o.voided_at is null
      and o.id is distinct from p_interval_id
      and o.starts_at < p_ends_at
      and p_starts_at < o.ends_at
  ) then
    raise exception 'Tip intervals cannot overlap.' using errcode = '22023';
  end if;

  -- Only NEWLY added people must be current workforce; people already on the interval
  -- keep their place (participant snapshots are preserved) even if they have since left.
  foreach v_pid in array v_participants loop
    if not (v_pid = any (v_old_participants))
       and not private.tips_workforce_eligible(p_organization_id, p_location_id, v_pid) then
      raise exception 'Participant % is not eligible at this location.', v_pid using errcode = '42501';
    end if;
  end loop;

  v_before_dist := private.tips_distribution_snapshot(v_pool.id);

  if p_interval_id is null then
    insert into public.tip_intervals (
      organization_id, tip_pool_id, starts_at, ends_at, amount_cents, cash_cents, card_cents
    ) values (
      p_organization_id, v_pool.id, p_starts_at, p_ends_at, v_total, p_cash_cents, p_card_cents
    ) returning id into v_interval_id;
  else
    v_interval_id := p_interval_id;
    update public.tip_intervals
    set starts_at = p_starts_at, ends_at = p_ends_at, amount_cents = v_total,
        cash_cents = p_cash_cents, card_cents = p_card_cents,
        revision = revision + 1, updated_at = now()
    where id = p_interval_id;
    delete from public.tip_interval_participants
    where tip_interval_id = p_interval_id and not (profile_id = any (v_participants));
  end if;

  insert into public.tip_interval_participants (organization_id, tip_interval_id, profile_id)
  select p_organization_id, v_interval_id, x
  from unnest(v_participants) as x
  on conflict (tip_interval_id, profile_id) do nothing;

  update public.tip_pools set updated_at = now() where id = v_pool.id;
  perform public.recalculate_tip_pool(v_pool.id);

  insert into public.tip_revisions (
    organization_id, location_id, tip_pool_id, tip_interval_id, action, source,
    editor_profile_id, reason, before_state, after_state, affected_profile_ids
  ) values (
    p_organization_id, p_location_id, v_pool.id, v_interval_id,
    case when p_interval_id is null then 'interval_created' else 'interval_updated' end,
    'rpc', v_actor, v_reason,
    jsonb_build_object('interval', v_before, 'distribution', v_before_dist),
    jsonb_build_object('interval', private.tips_interval_snapshot(v_interval_id),
                       'distribution', private.tips_distribution_snapshot(v_pool.id)),
    (select coalesce(array_agg(distinct y order by y), '{}')
     from unnest(v_old_participants || v_participants) as y)
  );

  perform set_config('app.tips_rpc', 'off', true);

  return jsonb_build_object(
    'interval_id', v_interval_id,
    'tip_pool_id', v_pool.id,
    'revision', (select revision from public.tip_intervals where id = v_interval_id)
  );
end;
$$;
revoke all on function public.tips_save_interval(uuid, uuid, date, timestamptz, timestamptz, integer, integer, uuid[], bigint, integer, text) from public, anon;
grant execute on function public.tips_save_interval(uuid, uuid, date, timestamptz, timestamptz, integer, integer, uuid[], bigint, integer, text) to authenticated;

-- 7. Void (cancel) an interval -----------------------------------------------------------
create or replace function public.tips_void_interval(
  p_organization_id uuid,
  p_location_id uuid,
  p_interval_id bigint,
  p_expected_revision integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_pool record;
  v_interval record;
  v_before jsonb;
  v_before_dist jsonb;
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tips');

  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Enter a short reason (3 to 500 characters).' using errcode = '22023';
  end if;

  perform set_config('app.tips_rpc', 'on', true);

  select i.tip_pool_id into v_interval
  from public.tip_intervals i
  join public.tip_pools p on p.id = i.tip_pool_id
  where i.id = p_interval_id
    and p.location_id = p_location_id and p.organization_id = p_organization_id;
  if v_interval.tip_pool_id is null then
    raise exception 'Tip interval not found for this location.' using errcode = 'P0002';
  end if;

  select id, status into v_pool
  from public.tip_pools where id = v_interval.tip_pool_id for update;
  if v_pool.status <> 'draft' then
    raise exception 'This day was finalized by the earlier workflow and is locked. Use "Correct locked record" with a reason first.' using errcode = '22023';
  end if;

  select * into v_interval from public.tip_intervals where id = p_interval_id for update;
  if v_interval.voided_at is not null then
    raise exception 'This interval is already voided.' using errcode = '22023';
  end if;
  if p_expected_revision is distinct from v_interval.revision then
    raise exception 'This interval was changed by someone else. Reload and try again.' using errcode = 'P0409';
  end if;

  v_before := private.tips_interval_snapshot(p_interval_id);
  v_before_dist := private.tips_distribution_snapshot(v_pool.id);

  update public.tip_intervals
  set voided_at = now(), voided_by = v_actor, void_reason = v_reason,
      revision = revision + 1, updated_at = now()
  where id = p_interval_id;

  update public.tip_pools set updated_at = now() where id = v_pool.id;
  perform public.recalculate_tip_pool(v_pool.id);

  insert into public.tip_revisions (
    organization_id, location_id, tip_pool_id, tip_interval_id, action, source,
    editor_profile_id, reason, before_state, after_state, affected_profile_ids
  ) values (
    p_organization_id, p_location_id, v_pool.id, p_interval_id, 'interval_voided', 'rpc',
    v_actor, v_reason,
    jsonb_build_object('interval', v_before, 'distribution', v_before_dist),
    jsonb_build_object('interval', private.tips_interval_snapshot(p_interval_id),
                       'distribution', private.tips_distribution_snapshot(v_pool.id)),
    (select coalesce(array_agg(profile_id order by profile_id), '{}')
     from public.tip_interval_participants where tip_interval_id = p_interval_id)
  );

  perform set_config('app.tips_rpc', 'off', true);
  return jsonb_build_object('interval_id', p_interval_id, 'tip_pool_id', v_pool.id);
end;
$$;
revoke all on function public.tips_void_interval(uuid, uuid, bigint, integer, text) from public, anon;
grant execute on function public.tips_void_interval(uuid, uuid, bigint, integer, text) to authenticated;

-- 8. Explicit recalculation of a saved day -----------------------------------------------
-- Re-derives the allocations from the SAVED intervals and their SAVED participants. It
-- never consults attendance. Idempotent: a revision is recorded only if something changed.
create or replace function public.tips_recalculate_pool(
  p_organization_id uuid,
  p_location_id uuid,
  p_tip_pool_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pool record;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tips');

  perform set_config('app.tips_rpc', 'on', true);

  select id, status into v_pool
  from public.tip_pools
  where id = p_tip_pool_id and organization_id = p_organization_id and location_id = p_location_id
  for update;
  if v_pool.id is null then
    raise exception 'Tip pool not found for this location.' using errcode = 'P0002';
  end if;
  if v_pool.status <> 'draft' then
    raise exception 'This day was finalized by the earlier workflow and is locked. Use "Correct locked record" with a reason first.' using errcode = '22023';
  end if;

  v_before := private.tips_distribution_snapshot(v_pool.id);
  perform public.recalculate_tip_pool(v_pool.id);
  v_after := private.tips_distribution_snapshot(v_pool.id);

  if v_before is distinct from v_after then
    update public.tip_pools set updated_at = now() where id = v_pool.id;
    insert into public.tip_revisions (
      organization_id, location_id, tip_pool_id, action, source, editor_profile_id,
      before_state, after_state, affected_profile_ids
    ) values (
      p_organization_id, p_location_id, v_pool.id, 'pool_recalculated', 'rpc', v_actor,
      jsonb_build_object('distribution', v_before), jsonb_build_object('distribution', v_after),
      (select coalesce(array_agg(distinct pid order by pid), '{}') from (
         select (e ->> 'profile_id')::uuid as pid from jsonb_array_elements(v_before) e
         union
         select (e ->> 'profile_id')::uuid from jsonb_array_elements(v_after) e) u)
    );
  end if;

  perform set_config('app.tips_rpc', 'off', true);
  return jsonb_build_object('tip_pool_id', v_pool.id, 'changed', v_before is distinct from v_after);
end;
$$;
revoke all on function public.tips_recalculate_pool(uuid, uuid, bigint) from public, anon;
grant execute on function public.tips_recalculate_pool(uuid, uuid, bigint) to authenticated;

-- 9. Range reader (editor, history, print) -----------------------------------------------
-- Managers (level >= 2) get every pool in range with all intervals (voided ones flagged),
-- the allocations, per-interval shares and, on request, the revision trail.
-- Staff get only the days they took part in, only their own shares and allocation, and no
-- co-worker identity, no interval total and no audit trail.
create or replace function public.tips_get_range(
  p_organization_id uuid,
  p_location_id uuid,
  p_from date,
  p_to date,
  p_include_revisions boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level integer;
  v_caller uuid := (select auth.uid());
  v_tz text;
  v_pools jsonb;
begin
  if not private.tips_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tips for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tips');

  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception 'Choose a valid date range of at most 400 days.' using errcode = '22023';
  end if;

  v_level := private.tips_profile_level(p_organization_id, p_location_id, v_caller);
  select l.time_zone into v_tz from public.locations l where l.id = p_location_id;

  if v_level >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'pool_id', tp.id,
      'service_date', tp.service_date,
      'status', case when tp.status = 'finalized' then 'finalized' else 'saved' end,
      'updated_at', tp.updated_at,
      'intervals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id::text,
          'starts_at', i.starts_at,
          'ends_at', i.ends_at,
          'amount_cents', i.amount_cents,
          'cash_cents', i.cash_cents,
          'card_cents', i.card_cents,
          'tender_recorded', (i.amount_cents > 0 and i.cash_cents + i.card_cents = i.amount_cents),
          'revision', i.revision,
          'voided_at', i.voided_at,
          'void_reason', i.void_reason,
          'participant_ids', coalesce((
            select jsonb_agg(part.profile_id order by part.profile_id)
            from public.tip_interval_participants part where part.tip_interval_id = i.id
          ), '[]'::jsonb),
          'shares', coalesce((
            select jsonb_agg(jsonb_build_object(
              'profile_id', s.profile_id, 'amount_cents', s.amount_cents,
              'cash_cents', s.cash_cents, 'card_cents', s.card_cents
            ) order by s.share_rank)
            from private.tips_interval_shares(i.id) s
          ), '[]'::jsonb)
        ) order by i.starts_at, i.id), '[]'::jsonb)
        from public.tip_intervals i where i.tip_pool_id = tp.id
      ),
      'allocations', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'profile_id', a.profile_id, 'amount_cents', a.amount_cents,
          'cash_cents', a.cash_cents, 'card_cents', a.card_cents
        ) order by a.profile_id), '[]'::jsonb)
        from public.tip_allocations a where a.tip_pool_id = tp.id
      ),
      'revisions', case when p_include_revisions then (
        -- The new revision trail AND the earlier workflow's finalize / reopen audit events,
        -- one chronological feed (legacy entries have negative ids and a legacy_ action).
        select coalesce(jsonb_agg(x.j order by x.created_at, x.sort_id), '[]'::jsonb)
        from (
          select r.created_at, r.id as sort_id, jsonb_build_object(
            'id', r.id, 'action', r.action, 'source', r.source,
            'editor_profile_id', r.editor_profile_id, 'reason', r.reason,
            'tip_interval_id', r.tip_interval_id,
            'before_state', r.before_state, 'after_state', r.after_state,
            'affected_profile_ids', r.affected_profile_ids, 'created_at', r.created_at
          ) as j
          from public.tip_revisions r
          where r.tip_pool_id = tp.id and r.location_id = p_location_id
          union all
          select ae.created_at, -ae.id, jsonb_build_object(
            'id', -ae.id, 'action', 'legacy_' || ae.action, 'source', 'rpc',
            'editor_profile_id', ae.actor_profile_id, 'reason', ae.reason,
            'tip_interval_id', null, 'before_state', null, 'after_state', null,
            'affected_profile_ids', '[]'::jsonb, 'created_at', ae.created_at
          )
          from public.audit_events ae
          where ae.entity_type = 'tip_pool'
            and ae.entity_id = tp.id::text
            and ae.organization_id = tp.organization_id
            and ae.location_id = p_location_id
            and ae.action in ('finalized', 'reopened')
        ) x
      ) else '[]'::jsonb end
    ) order by tp.service_date), '[]'::jsonb)
    into v_pools
    from public.tip_pools tp
    where tp.organization_id = p_organization_id
      and tp.location_id = p_location_id
      and tp.service_date between p_from and p_to;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'pool_id', tp.id,
      'service_date', tp.service_date,
      'status', case when tp.status = 'finalized' then 'finalized' else 'saved' end,
      'updated_at', tp.updated_at,
      'intervals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id::text,
          'starts_at', i.starts_at,
          'ends_at', i.ends_at,
          'tender_recorded', (i.amount_cents > 0 and i.cash_cents + i.card_cents = i.amount_cents),
          'participant_count', (
            select count(*) from public.tip_interval_participants part where part.tip_interval_id = i.id
          ),
          'shares', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'profile_id', s.profile_id, 'amount_cents', s.amount_cents,
              'cash_cents', s.cash_cents, 'card_cents', s.card_cents
            )), '[]'::jsonb)
            from private.tips_interval_shares(i.id) s where s.profile_id = v_caller
          )
        ) order by i.starts_at, i.id), '[]'::jsonb)
        from public.tip_intervals i
        where i.tip_pool_id = tp.id
          and i.voided_at is null
          and exists (
            select 1 from public.tip_interval_participants part
            where part.tip_interval_id = i.id and part.profile_id = v_caller
          )
      ),
      'allocations', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'profile_id', a.profile_id, 'amount_cents', a.amount_cents,
          'cash_cents', a.cash_cents, 'card_cents', a.card_cents
        )), '[]'::jsonb)
        from public.tip_allocations a where a.tip_pool_id = tp.id and a.profile_id = v_caller
      ),
      'revisions', '[]'::jsonb
    ) order by tp.service_date), '[]'::jsonb)
    into v_pools
    from public.tip_pools tp
    where tp.organization_id = p_organization_id
      and tp.location_id = p_location_id
      and tp.service_date between p_from and p_to
      and exists (
        select 1 from public.tip_allocations a
        where a.tip_pool_id = tp.id and a.profile_id = v_caller
      );
  end if;

  return jsonb_build_object(
    'time_zone', v_tz,
    'from', p_from,
    'to', p_to,
    'viewer_level', v_level,
    'pools', v_pools
  );
end;
$$;
revoke all on function public.tips_get_range(uuid, uuid, date, date, boolean) from public, anon;
grant execute on function public.tips_get_range(uuid, uuid, date, date, boolean) to authenticated;

-- 10. Legacy day reader: hide voided intervals --------------------------------------------
-- Same contract and shape as 20261107194700; the only change is `voided_at is null`.
create or replace function public.tips_get_day_data(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pool record;
  v_level integer;
  v_caller uuid := (select auth.uid());
  v_intervals jsonb;
  v_audit_log jsonb;
begin
  if not private.tips_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tips for this location.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(p_location_id, 'tips');

  v_level := private.tips_profile_level(p_organization_id, p_location_id, v_caller);

  select id, status into v_pool
  from public.tip_pools
  where organization_id = p_organization_id
    and location_id = p_location_id
    and service_date = p_service_date;

  if v_pool.id is null then
    return jsonb_build_object(
      'tip_pool_id', null,
      'status', 'estimating',
      'intervals', '[]'::jsonb,
      'audit_log', '[]'::jsonb
    );
  end if;

  if v_level >= 2 then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', i.id::text,
        'starts_at', i.starts_at,
        'ends_at', i.ends_at,
        'amount_cents', i.amount_cents,
        'participant_ids', coalesce(
          (select jsonb_agg(p.profile_id)
           from public.tip_interval_participants p
           where p.tip_interval_id = i.id),
          '[]'::jsonb
        )
      ) order by i.starts_at, i.id
    ), '[]'::jsonb)
    into v_intervals
    from public.tip_intervals i
    where i.tip_pool_id = v_pool.id
      and i.voided_at is null;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'action', ae.action,
        'actor_profile_id', ae.actor_profile_id,
        'reason', ae.reason,
        'created_at', ae.created_at
      ) order by ae.created_at asc
    ), '[]'::jsonb)
    into v_audit_log
    from public.audit_events ae
    where ae.entity_type = 'tip_pool'
      and ae.entity_id = v_pool.id::text
      and ae.organization_id = p_organization_id
      and ae.location_id = p_location_id;
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', i.id::text,
        'starts_at', i.starts_at,
        'ends_at', i.ends_at,
        'amount_cents', i.amount_cents,
        'participant_ids', coalesce(
          (select jsonb_agg(p.profile_id)
           from public.tip_interval_participants p
           where p.tip_interval_id = i.id),
          '[]'::jsonb
        )
      ) order by i.starts_at, i.id
    ), '[]'::jsonb)
    into v_intervals
    from public.tip_intervals i
    where i.tip_pool_id = v_pool.id
      and i.voided_at is null
      and exists (
        select 1 from public.tip_interval_participants part
        where part.tip_interval_id = i.id
          and part.profile_id = v_caller
      );

    v_audit_log := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'tip_pool_id', v_pool.id,
    'status', case when v_pool.status = 'finalized' then 'finalized' else 'estimating' end,
    'intervals', v_intervals,
    'audit_log', v_audit_log
  );
end;
$$;
revoke all on function public.tips_get_day_data(uuid, uuid, date) from public, anon;
grant execute on function public.tips_get_day_data(uuid, uuid, date) to authenticated;

commit;
