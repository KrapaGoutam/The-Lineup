-- V2-005.003: Tips Location Scoping
-- Forward-only migration. Binds tip pools, intervals, allocations, and rosters to verified active location.
-- Preserves existing financial calculations and operational history.
begin;

-- 1. Helper: Determine if a profile is an eligible workforce member for a location.
-- Used to validate new participants and filter selectable staff.
create or replace function private.tips_workforce_eligible(
  p_org uuid,
  p_location uuid,
  p_profile uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    join public.memberships m
      on m.organization_id = l.organization_id
     and m.profile_id = p_profile
     and m.active
    where l.id = p_location
      and l.organization_id = p_org
      and l.active
      and l.archived_at is null
      and (
        exists (
          select 1
          from public.location_memberships lm
          where lm.location_id = l.id
            and lm.profile_id = p_profile
            and lm.active
        )
        or (
          (select count(*) from public.locations x
           where x.organization_id = p_org and x.active and x.archived_at is null) = 1
          and not exists (
            select 1 from public.location_memberships lm2
            join public.locations x2 on x2.id = lm2.location_id
            where x2.organization_id = p_org
          )
        )
      )
  );
$$;
revoke all on function private.tips_workforce_eligible(uuid, uuid, uuid) from public, anon, authenticated;

-- 2. Helper: Canonical role tier resolution for a profile at a location.
-- 4 = Owner, 3 = Manager, 2 = Assistant Manager, 1 = Staff, 0 = None.
create or replace function private.tips_profile_level(
  p_org uuid,
  p_location uuid,
  p_profile uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.locations l
    where l.id = p_location
      and l.organization_id = p_org
      and l.active
      and l.archived_at is null
  ) then
    greatest(
      coalesce(
        (select case r.role
           when 'owner' then 4
           when 'manager' then 3
           else 2 end
         from public.overall_roles r
         where r.profile_id = p_profile),
        0
      ),
      case when exists (
        select 1 from public.memberships m
        where m.organization_id = p_org
          and m.profile_id = p_profile
          and m.active
      ) then
        coalesce(
          (select case lm.role
             when 'manager' then 3
             when 'assistant_manager' then 2
             else 1 end
           from public.location_memberships lm
           where lm.location_id = p_location
             and lm.profile_id = p_profile
             and lm.active),
          (select case
             when 'owner' = any(m.roles) then 4
             when 'general_manager' = any(m.roles) then 3
             when 'shift_manager' = any(m.roles) then 2
             else 1 end
           from public.memberships m
           where m.organization_id = p_org
             and m.profile_id = p_profile
             and m.active
             and (
               (select count(*) from public.locations x
                where x.organization_id = p_org and x.active and x.archived_at is null) = 1
               and not exists (
                 select 1 from public.location_memberships lm2
                 join public.locations x2 on x2.id = lm2.location_id
                 where x2.organization_id = p_org
               )
             ))
        )
      else 0 end
    )
  else 0 end;
$$;
revoke all on function private.tips_profile_level(uuid, uuid, uuid) from public, anon, authenticated;

-- 3. Helper: Check if caller has an active, unbanned Supabase session.
create or replace function private.tips_live_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join auth.sessions s on s.user_id = u.id
    where u.id = (select auth.uid())
      and (u.banned_until is null or u.banned_until <= now())
      and s.id::text = (select auth.jwt()) ->> 'session_id'
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function private.tips_live_session() from public, anon, authenticated;

-- 4. Location access check for Tips: caller must have live session and role level > 0.
create or replace function private.tips_can_access_location(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tips_live_session()
    and private.tips_profile_level(p_organization_id, p_location_id, (select auth.uid())) > 0;
$$;
revoke all on function private.tips_can_access_location(uuid, uuid) from public, anon, authenticated;

-- 4b. Allocation visibility for the tip_allocations_select_own policy. The policy runs as
-- the calling role, which (correctly) cannot read tip_pools or execute the private
-- helpers above, so the pool lookup + location check live in one SECURITY DEFINER
-- boolean. It answers only "may the caller see an allocation row of this pool".
create or replace function private.tips_allocation_visible(
  p_organization_id uuid,
  p_tip_pool_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tip_pools pool
    where pool.id = p_tip_pool_id
      and pool.organization_id = p_organization_id
      and private.tips_can_access_location(pool.organization_id, pool.location_id)
  );
$$;
revoke all on function private.tips_allocation_visible(uuid, bigint) from public, anon;
grant execute on function private.tips_allocation_visible(uuid, bigint) to authenticated;

-- 5. Manager check for Tips: caller must have live session and role level >= 2 (Assistant Manager, Manager, Owner).
create or replace function private.tips_is_manager(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tips_live_session()
    and private.tips_profile_level(p_organization_id, p_location_id, (select auth.uid())) >= 2;
$$;
revoke all on function private.tips_is_manager(uuid, uuid) from public, anon;
grant execute on function private.tips_is_manager(uuid, uuid) to authenticated;

-- 6. Public authority check RPC for client verification and Preview readiness.
create or replace function public.tips_location_authorized(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tips_can_access_location(p_organization_id, p_location_id);
$$;
revoke all on function public.tips_location_authorized(uuid, uuid) from public, anon;
grant execute on function public.tips_location_authorized(uuid, uuid) to authenticated;

-- 7. Attribution foreign key repair:
-- Replace tip_pools.finalized_by composite membership FK with a direct profiles(id) FK
-- so Overall administrators without tenant membership rows can finalize tip pools.
alter table public.tip_pools
  add constraint tip_pools_finalized_by_profile_fk foreign key (finalized_by) references public.profiles(id);
alter table public.tip_pools
  drop constraint tip_pools_organization_id_finalized_by_fkey;
create index if not exists tip_pools_finalized_by_profile_idx
  on public.tip_pools (finalized_by) where finalized_by is not null;

-- Replace audit_events.actor_profile_id composite membership FK with direct profiles FK
-- (audit_events_actor_profile_id_fkey already references public.profiles(id)).
-- The composite FK required a tenant membership row for every actor, which an
-- Overall administrator does not have. Dropping it is global, so the guarantee it
-- gave EVERY module (the actor belongs to the row's organization) is re-stated as a
-- BEFORE INSERT trigger that also admits an Overall actor and nobody else.
-- Existing rows are untouched; the trigger only checks new inserts.
alter table public.audit_events
  drop constraint if exists audit_events_actor_member_fk;

create or replace function private.audit_events_actor_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_profile_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id
      and m.profile_id = new.actor_profile_id
  ) or exists (
    select 1 from public.overall_roles r
    where r.profile_id = new.actor_profile_id
  ) then
    return new;
  end if;
  raise exception 'audit_events actor % has no membership in organization %',
    new.actor_profile_id, new.organization_id
    using errcode = '23503';
end;
$$;
revoke all on function private.audit_events_actor_authority() from public, anon, authenticated;

drop trigger if exists audit_events_actor_authority on public.audit_events;
create trigger audit_events_actor_authority
  before insert on public.audit_events
  for each row execute function private.audit_events_actor_authority();

-- 8. Audit events policies. The baseline organization-role branch is kept verbatim.
-- The only addition is a Tips-scoped branch: a caller who manages Tips at the row's
-- own location (location manager, or an Overall actor, resolved by
-- private.tips_is_manager) may record and read tip_pool audit events there. It does
-- NOT extend to any other entity_type, other action, other location or other
-- organization, so no other module's audit trail becomes writable or readable
-- through Tips authority.
drop policy if exists "audit_events_insert_operator" on public.audit_events;
create policy "audit_events_insert_operator" on public.audit_events
  for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid()) and (
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host']::public.app_role[]))
      or (
        entity_type = 'tip_pool'
        and action in ('finalized', 'reopened')
        and location_id is not null
        and private.tips_is_manager(organization_id, location_id)
      )
    )
  );

drop policy if exists "audit_events_select_manager" on public.audit_events;
create policy "audit_events_select_manager" on public.audit_events
  for select to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
    or (
      entity_type = 'tip_pool'
      and location_id is not null
      and private.tips_is_manager(organization_id, location_id)
    )
  );

-- 9. Update tip_pools RLS policies to use canonical location manager authorization.
drop policy if exists "tip_pools_select_manager" on public.tip_pools;
create policy "tip_pools_select_manager" on public.tip_pools
  for select to authenticated
  using (private.tips_is_manager(organization_id, location_id));

drop policy if exists "tip_pools_insert_manager" on public.tip_pools;
create policy "tip_pools_insert_manager" on public.tip_pools
  for insert to authenticated
  with check (
    status = 'draft' and
    private.tips_is_manager(organization_id, location_id)
  );

drop policy if exists "tip_pools_update_draft_manager" on public.tip_pools;
create policy "tip_pools_update_draft_manager" on public.tip_pools
  for update to authenticated
  using (
    status = 'draft' and
    private.tips_is_manager(organization_id, location_id)
  )
  with check (
    private.tips_is_manager(organization_id, location_id)
  );

drop policy if exists "tip_pools_delete_draft_manager" on public.tip_pools;
create policy "tip_pools_delete_draft_manager" on public.tip_pools
  for delete to authenticated
  using (
    status = 'draft' and
    private.tips_is_manager(organization_id, location_id)
  );

drop policy if exists "tip_pools_reopen_manager" on public.tip_pools;
create policy "tip_pools_reopen_manager" on public.tip_pools
  for update to authenticated
  using (
    status = 'finalized' and
    private.tips_is_manager(organization_id, location_id)
  )
  with check (
    status = 'draft' and
    finalized_at is null and
    finalized_by is null and
    private.tips_is_manager(organization_id, location_id)
  );

-- 10. Update tip_intervals RLS policy.
drop policy if exists "tip_intervals_write_manager" on public.tip_intervals;
create policy "tip_intervals_write_manager" on public.tip_intervals
  for all to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
    )
  )
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
    )
  );

-- 11. Update tip_interval_participants RLS policy:
-- On write, enforce that participants must be workforce-eligible at that location.
-- On select/delete, allow managers to view/manage existing rows even if eligibility changed later.
drop policy if exists "tip_interval_participants_write_manager" on public.tip_interval_participants;
create policy "tip_interval_participants_write_manager" on public.tip_interval_participants
  for all to authenticated
  using (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
    )
  )
  with check (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
        and private.tips_workforce_eligible(pool.organization_id, pool.location_id, profile_id)
    )
  );

-- 12. Update tip_allocations RLS policies.
drop policy if exists "tip_allocations_write_manager" on public.tip_allocations;
create policy "tip_allocations_write_manager" on public.tip_allocations
  for all to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
    )
  )
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and private.tips_is_manager(pool.organization_id, pool.location_id)
    )
  );

drop policy if exists "tip_allocations_select_own" on public.tip_allocations;
create policy "tip_allocations_select_own" on public.tip_allocations
  for select to authenticated
  using (
    profile_id = (select auth.uid()) and
    private.tips_allocation_visible(organization_id, tip_pool_id)
  );

-- 13. Recalculate tip pool RPC: harden authorization, location check and module check.
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
  where id = target_tip_pool_id;

  if v_pool.id is null or v_pool.status != 'draft' then
    raise exception 'Draft tip pool not found' using errcode = 'P0002';
  end if;

  if not private.tips_is_manager(v_pool.organization_id, v_pool.location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(v_pool.location_id, 'tips');

  delete from public.tip_allocations
  where tip_pool_id = target_tip_pool_id;

  insert into public.tip_allocations (
    organization_id,
    tip_pool_id,
    profile_id,
    amount_cents
  )
  with ranked as (
    select
      interval.id as interval_id,
      participant.profile_id,
      interval.amount_cents,
      count(*) over (partition by interval.id) as participant_count,
      row_number() over (partition by interval.id order by participant.profile_id) as participant_rank
    from public.tip_intervals interval
    join public.tip_interval_participants participant
      on participant.tip_interval_id = interval.id
     and participant.organization_id = interval.organization_id
    where interval.tip_pool_id = target_tip_pool_id
  ), exact_shares as (
    select
      profile_id,
      (amount_cents / participant_count) +
      case when participant_rank <= (amount_cents % participant_count) then 1 else 0 end as share_cents
    from ranked
  )
  select v_pool.organization_id, target_tip_pool_id, profile_id, sum(share_cents)::integer
  from exact_shares
  group by profile_id;
end;
$$;
revoke all on function public.recalculate_tip_pool(bigint) from public, anon;
grant execute on function public.recalculate_tip_pool(bigint) to authenticated;

-- 14. Location Roster RPC: names for the verified location without widening profile RLS.
--   * `eligible` is true only for CURRENT workforce at this location (the same
--     private.tips_workforce_eligible test tips_add_interval enforces). Historical
--     actors (earlier participants, finalizers, audit actors) stay in the result so
--     history can show their names, but are `eligible = false` and must never be
--     offered for a new interval.
--   * A caller below assistant manager (plain staff) receives only their own row, so
--     a co-worker's name is never disclosed to a peer.
drop function if exists public.tips_location_roster(uuid, uuid);
create function public.tips_location_roster(
  p_organization_id uuid,
  p_location_id uuid
)
returns table(
  profile_id uuid,
  display_name text,
  roles public.app_role[],
  active boolean,
  eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_level integer;
begin
  if p_location_id is null or not private.tips_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tips for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tips');

  v_level := private.tips_profile_level(p_organization_id, p_location_id, v_caller);

  return query
  with roster_profiles as (
    select m.profile_id, p.display_name, m.roles, m.active, m.created_at
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_organization_id
      and (
        exists (
          select 1 from public.location_memberships lm
          where lm.location_id = p_location_id
            and lm.profile_id = m.profile_id
            and lm.active
        )
        or exists (
          select 1 from public.tip_interval_participants tip
          join public.tip_intervals ti on ti.id = tip.tip_interval_id
          join public.tip_pools tp on tp.id = ti.tip_pool_id
          where tip.profile_id = m.profile_id
            and tp.location_id = p_location_id
            and tp.organization_id = p_organization_id
        )
        or exists (
          select 1 from public.tip_pools tp
          where tp.finalized_by = m.profile_id
            and tp.location_id = p_location_id
            and tp.organization_id = p_organization_id
        )
        or exists (
          select 1 from public.audit_events ae
          where ae.actor_profile_id = m.profile_id
            and ae.location_id = p_location_id
            and ae.organization_id = p_organization_id
            and ae.entity_type = 'tip_pool'
        )
        or (
          (select count(*) from public.locations l
           where l.organization_id = p_organization_id and l.active and l.archived_at is null) = 1
          and not exists (
            select 1 from public.location_memberships lm
            join public.locations l on l.id = lm.location_id
            where l.organization_id = p_organization_id
          )
        )
      )
    union
    select p.id as profile_id, p.display_name, array[]::public.app_role[] as roles, true as active, p.created_at
    from public.profiles p
    where (
      exists (
        select 1 from public.tip_pools tp
        where tp.finalized_by = p.id
          and tp.location_id = p_location_id
          and tp.organization_id = p_organization_id
      )
      or exists (
        select 1 from public.audit_events ae
        where ae.actor_profile_id = p.id
          and ae.location_id = p_location_id
          and ae.organization_id = p_organization_id
          and ae.entity_type = 'tip_pool'
      )
    )
    and not exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id and m.profile_id = p.id
    )
  )
  select
    r.profile_id,
    r.display_name,
    r.roles,
    r.active,
    private.tips_workforce_eligible(p_organization_id, p_location_id, r.profile_id) as eligible
  from roster_profiles r
  where v_level >= 2 or r.profile_id = v_caller
  order by r.created_at, r.profile_id;
end;
$$;
revoke all on function public.tips_location_roster(uuid, uuid) from public, anon;
grant execute on function public.tips_location_roster(uuid, uuid) to authenticated;

-- 15. Atomic interval addition RPC: handles get/create draft pool, interval insert,
-- participant insert with eligibility validation, and pool recalculation in one transaction.
create or replace function public.tips_add_interval(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_amount_cents integer,
  p_participant_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool_id bigint;
  v_pool_status public.tip_pool_status;
  v_interval_id bigint;
  v_pid uuid;
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(p_location_id, 'tips');

  if p_amount_cents < 0 then
    raise exception 'Tip amount must be a non-negative number of cents.' using errcode = '22003';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Tip interval start and end must be different.' using errcode = '22023';
  end if;

  if p_participant_ids is null or coalesce(array_length(p_participant_ids, 1), 0) = 0 then
    raise exception 'Choose at least one participant.' using errcode = '22023';
  end if;

  -- Validate each participant is workforce-eligible at this location
  foreach v_pid in array p_participant_ids loop
    if not private.tips_workforce_eligible(p_organization_id, p_location_id, v_pid) then
      raise exception 'Participant % is not eligible at this location.', v_pid using errcode = '42501';
    end if;
  end loop;

  -- Get or create draft tip pool
  select id, status into v_pool_id, v_pool_status
  from public.tip_pools
  where location_id = p_location_id
    and service_date = p_service_date;

  if v_pool_id is null then
    insert into public.tip_pools (organization_id, location_id, service_date, status)
    values (p_organization_id, p_location_id, p_service_date, 'draft')
    returning id, status into v_pool_id, v_pool_status;
  end if;

  if v_pool_status = 'finalized' then
    raise exception 'This tip pool is finalized. A manager or owner must reopen it first.' using errcode = '22023';
  end if;

  -- Insert interval
  insert into public.tip_intervals (organization_id, tip_pool_id, starts_at, ends_at, amount_cents)
  values (p_organization_id, v_pool_id, p_starts_at, p_ends_at, p_amount_cents)
  returning id into v_interval_id;

  -- Insert unique participants
  insert into public.tip_interval_participants (organization_id, tip_interval_id, profile_id)
  select distinct p_organization_id, v_interval_id, unnest(p_participant_ids);

  -- Recalculate
  perform public.recalculate_tip_pool(v_pool_id);

  return jsonb_build_object(
    'interval_id', v_interval_id,
    'tip_pool_id', v_pool_id
  );
end;
$$;
revoke all on function public.tips_add_interval(uuid, uuid, date, timestamptz, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.tips_add_interval(uuid, uuid, date, timestamptz, timestamptz, integer, uuid[]) to authenticated;

-- 16. Atomic finalization RPC: validates location, manager role, draft status, and writes audit event.
create or replace function public.tips_finalize_pool(
  p_organization_id uuid,
  p_location_id uuid,
  p_tip_pool_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool record;
  v_actor uuid := (select auth.uid());
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(p_location_id, 'tips');

  select id, organization_id, location_id, status into v_pool
  from public.tip_pools
  where id = p_tip_pool_id;

  if v_pool.id is null or v_pool.organization_id != p_organization_id or v_pool.location_id != p_location_id then
    raise exception 'Tip pool not found for this location.' using errcode = 'P0002';
  end if;

  if v_pool.status != 'draft' then
    raise exception 'This tip pool is already finalized.' using errcode = '22023';
  end if;

  update public.tip_pools
  set status = 'finalized',
      finalized_at = now(),
      finalized_by = v_actor,
      updated_at = now()
  where id = p_tip_pool_id;

  insert into public.audit_events (
    organization_id,
    location_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id
  ) values (
    p_organization_id,
    p_location_id,
    v_actor,
    'finalized',
    'tip_pool',
    p_tip_pool_id::text
  );
end;
$$;
revoke all on function public.tips_finalize_pool(uuid, uuid, bigint) from public, anon;
grant execute on function public.tips_finalize_pool(uuid, uuid, bigint) to authenticated;

-- 17. Atomic reopening RPC: validates location, manager role, reason length, finalized status, and writes audit event.
create or replace function public.tips_reopen_pool(
  p_organization_id uuid,
  p_location_id uuid,
  p_tip_pool_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool record;
  v_actor uuid := (select auth.uid());
  v_trimmed text := trim(coalesce(p_reason, ''));
begin
  if not private.tips_is_manager(p_organization_id, p_location_id) then
    raise exception 'Only an owner, manager or assistant manager can do that.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(p_location_id, 'tips');

  if length(v_trimmed) < 3 then
    raise exception 'Enter a short reason (at least 3 characters).' using errcode = '22023';
  end if;

  select id, organization_id, location_id, status into v_pool
  from public.tip_pools
  where id = p_tip_pool_id;

  if v_pool.id is null or v_pool.organization_id != p_organization_id or v_pool.location_id != p_location_id then
    raise exception 'Tip pool not found for this location.' using errcode = 'P0002';
  end if;

  if v_pool.status != 'finalized' then
    raise exception 'This tip pool is not finalized.' using errcode = '22023';
  end if;

  update public.tip_pools
  set status = 'draft',
      finalized_at = null,
      finalized_by = null,
      updated_at = now()
  where id = p_tip_pool_id;

  insert into public.audit_events (
    organization_id,
    location_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason
  ) values (
    p_organization_id,
    p_location_id,
    v_actor,
    'reopened',
    'tip_pool',
    p_tip_pool_id::text,
    v_trimmed
  );
end;
$$;
revoke all on function public.tips_reopen_pool(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.tips_reopen_pool(uuid, uuid, bigint, text) to authenticated;

-- 18. Tips day data RPC: loads today's tips dataset securely.
-- Managers get full intervals and audit log.
-- Staff get only the intervals where they participated (and their allocations).
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
    -- Manager view: all intervals with all participants
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
    where i.tip_pool_id = v_pool.id;

    -- Audit log
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
    -- Staff view: only intervals where the caller participated
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
