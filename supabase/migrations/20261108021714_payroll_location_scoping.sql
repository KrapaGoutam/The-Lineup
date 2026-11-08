-- Migration: 20261108021714_payroll_location_scoping.sql
-- Feature V2-005.005: Payroll Location Scoping — Implementation, Security & Financial Integrity
--
-- Hybrid Module Model:
--   - Compensation settings (payroll_settings) and pay rates (payroll_rates) remain organization-level.
--   - Operational payroll snapshots (payroll_periods) gain optional location_id for branch scoping.
--   - UNIQUE(organization_id, neon_user_id, period_month) is strictly preserved (no duplicate periods / no double count).
--   - Historical payroll records retain location_id IS NULL without modification.
--   - Actor attribution foreign keys are re-pointed from memberships to profiles(id) with actor-identity triggers,
--     enabling Overall administrators without tenant memberships to manage payroll legitimately.
--   - Payments and adjustments inherit location scope from their parent payroll_period.
--   - Confirmed payment and snapshot immutability triggers remain untouched.
--   - Backend module enforcement is integrated via restrictive RLS on payroll_periods.

begin;

-- =============================================================================
-- PART 1: SCHEMA EXTENSION — LOCATION_ID ON PAYROLL_PERIODS
-- =============================================================================

alter table public.payroll_periods
  add column if not exists location_id uuid references public.locations (id) on delete set null;

alter table public.payroll_periods
  drop constraint if exists payroll_periods_location_org_fk;

alter table public.payroll_periods
  add constraint payroll_periods_location_org_fk
  foreign key (location_id, organization_id)
  references public.locations (id, organization_id)
  on delete set null;

create index if not exists payroll_periods_location_id_idx
  on public.payroll_periods (location_id)
  where location_id is not null;

-- =============================================================================
-- PART 2: ATTRIBUTION FOREIGN KEY REPAIR & ACTOR GUARDS
-- =============================================================================

-- 1. payroll_settings: updated_by
alter table public.payroll_settings
  drop constraint if exists payroll_settings_organization_id_updated_by_fkey;

alter table public.payroll_settings
  drop constraint if exists payroll_settings_updated_by_fkey;

alter table public.payroll_settings
  add constraint payroll_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles(id);

create index if not exists payroll_settings_updated_by_idx
  on public.payroll_settings (updated_by);

-- 2. payroll_rates: updated_by
alter table public.payroll_rates
  drop constraint if exists payroll_rates_organization_id_updated_by_fkey;

alter table public.payroll_rates
  drop constraint if exists payroll_rates_updated_by_fkey;

alter table public.payroll_rates
  add constraint payroll_rates_updated_by_fkey
  foreign key (updated_by) references public.profiles(id);

create index if not exists payroll_rates_updated_by_idx
  on public.payroll_rates (updated_by);

-- 3. payroll_periods: generated_by, regenerated_by, locked_by
alter table public.payroll_periods
  drop constraint if exists payroll_periods_organization_id_generated_by_fkey,
  drop constraint if exists payroll_periods_organization_id_regenerated_by_fkey,
  drop constraint if exists payroll_periods_organization_id_locked_by_fkey;

alter table public.payroll_periods
  drop constraint if exists payroll_periods_generated_by_fkey,
  drop constraint if exists payroll_periods_regenerated_by_fkey,
  drop constraint if exists payroll_periods_locked_by_fkey;

alter table public.payroll_periods
  add constraint payroll_periods_generated_by_fkey
    foreign key (generated_by) references public.profiles(id),
  add constraint payroll_periods_regenerated_by_fkey
    foreign key (regenerated_by) references public.profiles(id),
  add constraint payroll_periods_locked_by_fkey
    foreign key (locked_by) references public.profiles(id);

create index if not exists payroll_periods_generated_by_idx
  on public.payroll_periods (generated_by);
create index if not exists payroll_periods_regenerated_by_idx
  on public.payroll_periods (regenerated_by) where regenerated_by is not null;
create index if not exists payroll_periods_locked_by_idx
  on public.payroll_periods (locked_by) where locked_by is not null;

-- 4. payroll_payments: created_by, confirmed_by
alter table public.payroll_payments
  drop constraint if exists payroll_payments_organization_id_created_by_fkey,
  drop constraint if exists payroll_payments_organization_id_confirmed_by_fkey;

alter table public.payroll_payments
  drop constraint if exists payroll_payments_created_by_fkey,
  drop constraint if exists payroll_payments_confirmed_by_fkey;

alter table public.payroll_payments
  add constraint payroll_payments_created_by_fkey
    foreign key (created_by) references public.profiles(id),
  add constraint payroll_payments_confirmed_by_fkey
    foreign key (confirmed_by) references public.profiles(id);

create index if not exists payroll_payments_created_by_idx
  on public.payroll_payments (created_by);
create index if not exists payroll_payments_confirmed_by_idx
  on public.payroll_payments (confirmed_by) where confirmed_by is not null;

-- 5. payroll_adjustments: created_by
alter table public.payroll_adjustments
  drop constraint if exists payroll_adjustments_organization_id_created_by_fkey;

alter table public.payroll_adjustments
  drop constraint if exists payroll_adjustments_created_by_fkey;

alter table public.payroll_adjustments
  add constraint payroll_adjustments_created_by_fkey
  foreign key (created_by) references public.profiles(id);

create index if not exists payroll_adjustments_created_by_idx
  on public.payroll_adjustments (created_by);

-- Actor Identity Triggers (prevents identity forgery through PostgREST writes)
create or replace function private.payroll_settings_actor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is not null and new.updated_by is distinct from v_actor then
    raise exception 'The updater of payroll settings must be the signed-in user.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_settings_actor_guard() from public, anon;
grant execute on function private.payroll_settings_actor_guard() to authenticated;

drop trigger if exists payroll_settings_actor_guard on public.payroll_settings;
create trigger payroll_settings_actor_guard
  before insert or update on public.payroll_settings
  for each row execute function private.payroll_settings_actor_guard();

create or replace function private.payroll_rates_actor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is not null and new.updated_by is distinct from v_actor then
    raise exception 'The updater of a payroll rate must be the signed-in user.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_rates_actor_guard() from public, anon;
grant execute on function private.payroll_rates_actor_guard() to authenticated;

drop trigger if exists payroll_rates_actor_guard on public.payroll_rates;
create trigger payroll_rates_actor_guard
  before insert or update on public.payroll_rates
  for each row execute function private.payroll_rates_actor_guard();

create or replace function private.payroll_periods_actor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is not null then
    if tg_op = 'INSERT' and new.generated_by is distinct from v_actor then
      raise exception 'The generator of a payroll period must be the signed-in user.' using errcode = '42501';
    elsif tg_op = 'UPDATE' then
      if new.regenerated_by is distinct from old.regenerated_by and new.regenerated_by is not null and new.regenerated_by is distinct from v_actor then
        raise exception 'The regenerator of a payroll period must be the signed-in user.' using errcode = '42501';
      end if;
      if new.locked_by is distinct from old.locked_by and new.locked_by is not null and new.locked_by is distinct from v_actor then
        raise exception 'The locker of a payroll period must be the signed-in user.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_periods_actor_guard() from public, anon;
grant execute on function private.payroll_periods_actor_guard() to authenticated;

drop trigger if exists payroll_periods_actor_guard on public.payroll_periods;
create trigger payroll_periods_actor_guard
  before insert or update on public.payroll_periods
  for each row execute function private.payroll_periods_actor_guard();

create or replace function private.payroll_payments_actor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is not null then
    if tg_op = 'INSERT' and new.created_by is distinct from v_actor then
      raise exception 'The creator of a payroll payment must be the signed-in user.' using errcode = '42501';
    elsif tg_op = 'UPDATE' then
      if new.confirmed_by is distinct from old.confirmed_by and new.confirmed_by is not null and new.confirmed_by is distinct from v_actor then
        raise exception 'The confirmer of a payroll payment must be the signed-in user.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_payments_actor_guard() from public, anon;
grant execute on function private.payroll_payments_actor_guard() to authenticated;

drop trigger if exists payroll_payments_actor_guard on public.payroll_payments;
create trigger payroll_payments_actor_guard
  before insert or update on public.payroll_payments
  for each row execute function private.payroll_payments_actor_guard();

create or replace function private.payroll_adjustments_actor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is not null and new.created_by is distinct from v_actor then
    raise exception 'The creator of a payroll adjustment must be the signed-in user.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_adjustments_actor_guard() from public, anon;
grant execute on function private.payroll_adjustments_actor_guard() to authenticated;

drop trigger if exists payroll_adjustments_actor_guard on public.payroll_adjustments;
create trigger payroll_adjustments_actor_guard
  before insert on public.payroll_adjustments
  for each row execute function private.payroll_adjustments_actor_guard();

-- =============================================================================
-- PART 3: SECURITY & AUTHORIZATION HELPERS
-- =============================================================================

-- Resolves the effective role level for an actor at (p_org, p_location):
--   4: Owner (Overall Owner, Organization Owner)
--   3: Manager (Overall Manager, Organization General Manager, Location Manager)
--   2: Assistant Manager (Overall Asst Mgr, Location Asst Mgr, or Org Shift Manager in single-location fallback)
--   1: Staff (Location Staff, Org Staff member)
--   0: None
create or replace function private.payroll_profile_level(
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
  select greatest(
    -- Overall Role Tier
    coalesce(
      (select case r.role
         when 'owner' then 4
         when 'manager' then 3
         when 'assistant_manager' then 2
         else 0 end
       from public.overall_roles r
       where r.profile_id = p_profile),
      0
    ),
    -- Organization / Location Tier (requires active tenant membership)
    case when exists (
      select 1 from public.memberships m
      where m.organization_id = p_org
        and m.profile_id = p_profile
        and m.active
    ) then
      greatest(
        -- Location Role at p_location (if p_location provided)
        coalesce(
          (select case lm.role
             when 'manager' then 3
             when 'assistant_manager' then 2
             else 1 end
           from public.location_memberships lm
           where lm.location_id = p_location
             and lm.profile_id = p_profile
             and lm.active),
          0
        ),
        -- Organization Role
        coalesce(
          (select case
             when 'owner' = any(m.roles) then 4
             when 'general_manager' = any(m.roles) then 3
             when 'shift_manager' = any(m.roles) and (
               p_location is null or
               (select count(*) from public.locations x
                where x.organization_id = p_org and x.active and x.archived_at is null) <= 1
             ) then 2
             else 1 end
           from public.memberships m
           where m.organization_id = p_org
             and m.profile_id = p_profile
             and m.active),
          0
        )
      )
    else 0 end
  );
$$;
revoke all on function private.payroll_profile_level(uuid, uuid, uuid) from public, anon;
grant execute on function private.payroll_profile_level(uuid, uuid, uuid) to authenticated;

-- Helper: True if caller has organization-wide management authority
create or replace function private.payroll_is_org_manager(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    where (select auth.uid()) is not null
      and (
        exists (
          select 1 from public.overall_roles r
          where r.profile_id = (select auth.uid())
            and r.role in ('owner', 'manager')
        )
        or exists (
          select 1 from public.memberships m
          where m.organization_id = p_org
            and m.profile_id = (select auth.uid())
            and m.active
            and (
              'owner' = any(m.roles)
              or 'general_manager' = any(m.roles)
              or (
                'shift_manager' = any(m.roles)
                and (
                  (select count(*) from public.locations x
                   where x.organization_id = p_org and x.active and x.archived_at is null) <= 1
                )
              )
            )
        )
      )
  );
$$;
revoke all on function private.payroll_is_org_manager(uuid) from public, anon;
grant execute on function private.payroll_is_org_manager(uuid) to authenticated;

-- Helper: True if caller has management authority for specified location
create or replace function private.payroll_can_manage_location(
  p_org uuid,
  p_location uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    where (select auth.uid()) is not null
      and (
        private.payroll_is_org_manager(p_org)
        or (
          p_location is not null
          and private.payroll_profile_level(p_org, p_location, (select auth.uid())) >= 2
        )
      )
  );
$$;
revoke all on function private.payroll_can_manage_location(uuid, uuid) from public, anon;
grant execute on function private.payroll_can_manage_location(uuid, uuid) to authenticated;

-- Helper: True if caller can manage (write/update/payment/adjustment) target period
create or replace function private.payroll_can_manage_period(p_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_periods p
    where p.id = p_period_id
      and (select auth.uid()) is not null
      and (
        -- Org-wide manager
        private.payroll_is_org_manager(p.organization_id)
        -- Or location-scoped manager if location is set
        or (
          p.location_id is not null
          and private.payroll_can_manage_location(p.organization_id, p.location_id)
        )
        -- Or single-location fallback for unassigned periods
        or (
          p.location_id is null
          and (select count(*) from public.locations l
               where l.organization_id = p.organization_id and l.active and l.archived_at is null) = 1
          and private.payroll_can_manage_location(
            p.organization_id,
            (select l.id from public.locations l
             where l.organization_id = p.organization_id and l.active and l.archived_at is null limit 1)
          )
        )
      )
  );
$$;
revoke all on function private.payroll_can_manage_period(bigint) from public, anon;
grant execute on function private.payroll_can_manage_period(bigint) to authenticated;

-- Helper: True if caller can read target period (manager or owning regular employee)
create or replace function private.payroll_can_read_period(p_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_periods p
    where p.id = p_period_id
      and (select auth.uid()) is not null
      and (
        private.payroll_can_manage_period(p.id)
        or (
          p.status = 'locked'
          and exists (
            select 1
            from public.attendance_identity_links l
            join public.memberships m
              on m.organization_id = p.organization_id and m.profile_id = l.profile_id
            where l.organization_id = p.organization_id
              and l.neon_user_id = p.neon_user_id
              and l.profile_id = (select auth.uid())
              and m.active
          )
        )
      )
  );
$$;
revoke all on function private.payroll_can_read_period(bigint) from public, anon;
grant execute on function private.payroll_can_read_period(bigint) to authenticated;

-- Public RPC: Authority check for preflight and Preview verification
create or replace function public.payroll_location_authorized(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.payroll_can_manage_location(p_organization_id, p_location_id)
    or exists (
      select 1
      from public.location_memberships lm
      where lm.location_id = p_location_id
        and lm.profile_id = (select auth.uid())
        and lm.active
    );
$$;
revoke all on function public.payroll_location_authorized(uuid, uuid) from public, anon;
grant execute on function public.payroll_location_authorized(uuid, uuid) to authenticated;

-- =============================================================================
-- PART 4: RLS POLICIES HARDENING
-- =============================================================================

-- 1. payroll_settings
drop policy if exists "payroll_settings_select_privileged" on public.payroll_settings;
drop policy if exists "payroll_settings_insert_privileged" on public.payroll_settings;
drop policy if exists "payroll_settings_update_privileged" on public.payroll_settings;
drop policy if exists "payroll_settings_select_manager" on public.payroll_settings;
drop policy if exists "payroll_settings_insert_manager" on public.payroll_settings;
drop policy if exists "payroll_settings_update_manager" on public.payroll_settings;

create policy "payroll_settings_select_manager" on public.payroll_settings
  for select to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or exists (
      select 1 from public.locations l
      where l.organization_id = payroll_settings.organization_id
        and private.payroll_can_manage_location(organization_id, l.id)
    )
  );

create policy "payroll_settings_insert_manager" on public.payroll_settings
  for insert to authenticated
  with check (
    private.payroll_is_org_manager(organization_id)
  );

create policy "payroll_settings_update_manager" on public.payroll_settings
  for update to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
  )
  with check (
    private.payroll_is_org_manager(organization_id)
  );

-- 2. payroll_rates
drop policy if exists "payroll_rates_select_privileged" on public.payroll_rates;
drop policy if exists "payroll_rates_insert_privileged" on public.payroll_rates;
drop policy if exists "payroll_rates_update_privileged" on public.payroll_rates;
drop policy if exists "payroll_rates_delete_privileged" on public.payroll_rates;
drop policy if exists "payroll_rates_select_manager" on public.payroll_rates;
drop policy if exists "payroll_rates_insert_manager" on public.payroll_rates;
drop policy if exists "payroll_rates_update_manager" on public.payroll_rates;
drop policy if exists "payroll_rates_delete_manager" on public.payroll_rates;

create policy "payroll_rates_select_manager" on public.payroll_rates
  for select to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or exists (
      select 1 from public.locations l
      where l.organization_id = payroll_rates.organization_id
        and private.payroll_can_manage_location(organization_id, l.id)
    )
  );

create policy "payroll_rates_insert_manager" on public.payroll_rates
  for insert to authenticated
  with check (
    private.payroll_is_org_manager(organization_id)
  );

create policy "payroll_rates_update_manager" on public.payroll_rates
  for update to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
  )
  with check (
    private.payroll_is_org_manager(organization_id)
  );

create policy "payroll_rates_delete_manager" on public.payroll_rates
  for delete to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
  );

-- 3. payroll_periods
drop policy if exists "payroll_periods_select_privileged" on public.payroll_periods;
drop policy if exists "payroll_periods_insert_privileged" on public.payroll_periods;
drop policy if exists "payroll_periods_update_privileged" on public.payroll_periods;
drop policy if exists "payroll_periods_select_manager" on public.payroll_periods;
drop policy if exists "payroll_periods_insert_manager" on public.payroll_periods;
drop policy if exists "payroll_periods_update_manager" on public.payroll_periods;

create policy "payroll_periods_select_manager" on public.payroll_periods
  for select to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or (
      location_id is not null
      and private.payroll_can_manage_location(organization_id, location_id)
    )
    or (
      location_id is null
      and (select count(*) from public.locations l
           where l.organization_id = payroll_periods.organization_id and l.active and l.archived_at is null) = 1
      and private.payroll_can_manage_location(
        organization_id,
        (select l.id from public.locations l
         where l.organization_id = payroll_periods.organization_id and l.active and l.archived_at is null limit 1)
      )
    )
  );

-- Self-select for staff (locked periods only, verified active membership)
drop policy if exists "payroll_periods_select_self" on public.payroll_periods;
create policy "payroll_periods_select_self" on public.payroll_periods
  for select to authenticated
  using (
    status = 'locked'
    and neon_user_id in (
      select l.neon_user_id
      from public.attendance_identity_links l
      join public.memberships m
        on m.organization_id = l.organization_id and m.profile_id = l.profile_id
      where l.organization_id = payroll_periods.organization_id
        and l.profile_id = (select auth.uid())
        and m.active
    )
  );

create policy "payroll_periods_insert_manager" on public.payroll_periods
  for insert to authenticated
  with check (
    private.payroll_is_org_manager(organization_id)
    or (
      location_id is not null
      and private.payroll_can_manage_location(organization_id, location_id)
    )
    or (
      location_id is null
      and (select count(*) from public.locations l
           where l.organization_id = payroll_periods.organization_id and l.active and l.archived_at is null) = 1
      and private.payroll_can_manage_location(
        organization_id,
        (select l.id from public.locations l
         where l.organization_id = payroll_periods.organization_id and l.active and l.archived_at is null limit 1)
      )
    )
  );

create policy "payroll_periods_update_manager" on public.payroll_periods
  for update to authenticated
  using (
    private.payroll_can_manage_period(id)
  )
  with check (
    private.payroll_can_manage_period(id)
  );

-- 4. payroll_payments
drop policy if exists "payroll_payments_select_privileged" on public.payroll_payments;
drop policy if exists "payroll_payments_insert_privileged" on public.payroll_payments;
drop policy if exists "payroll_payments_update_privileged" on public.payroll_payments;
drop policy if exists "payroll_payments_delete_privileged" on public.payroll_payments;
drop policy if exists "payroll_payments_select_manager" on public.payroll_payments;
drop policy if exists "payroll_payments_insert_manager" on public.payroll_payments;
drop policy if exists "payroll_payments_update_manager" on public.payroll_payments;
drop policy if exists "payroll_payments_delete_manager" on public.payroll_payments;

create policy "payroll_payments_select_manager" on public.payroll_payments
  for select to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  );

create policy "payroll_payments_insert_manager" on public.payroll_payments
  for insert to authenticated
  with check (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  );

create policy "payroll_payments_update_manager" on public.payroll_payments
  for update to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  )
  with check (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  );

create policy "payroll_payments_delete_manager" on public.payroll_payments
  for delete to authenticated
  using (
    status = 'draft'
    and (
      private.payroll_is_org_manager(organization_id)
      or private.payroll_can_manage_period(payroll_period_id)
    )
  );

-- 5. payroll_adjustments
drop policy if exists "payroll_adjustments_select_privileged" on public.payroll_adjustments;
drop policy if exists "payroll_adjustments_insert_privileged" on public.payroll_adjustments;
drop policy if exists "payroll_adjustments_select_manager" on public.payroll_adjustments;
drop policy if exists "payroll_adjustments_insert_manager" on public.payroll_adjustments;

create policy "payroll_adjustments_select_manager" on public.payroll_adjustments
  for select to authenticated
  using (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  );

create policy "payroll_adjustments_insert_manager" on public.payroll_adjustments
  for insert to authenticated
  with check (
    private.payroll_is_org_manager(organization_id)
    or private.payroll_can_manage_period(payroll_period_id)
  );

-- 6. audit_events updates
drop policy if exists "audit_events_insert_operator" on public.audit_events;
create policy "audit_events_insert_operator" on public.audit_events
  for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid())
    and entity_type <> 'tip_pool'
    and (
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host']::public.app_role[]))
      or (
        entity_type in ('schedule_period', 'shift', 'operating_hours', 'shift_kind_defaults')
        and location_id is not null
        and private.schedule_is_manager(organization_id, location_id)
      )
      or (
        entity_type in ('payroll_period', 'payroll_payment', 'payroll_adjustment', 'payroll_rates', 'payroll_settings')
        and (
          private.payroll_is_org_manager(organization_id)
          or (
            location_id is not null
            and private.payroll_can_manage_location(organization_id, location_id)
          )
        )
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
    or (
      entity_type in ('schedule_period', 'shift', 'operating_hours', 'shift_kind_defaults')
      and location_id is not null
      and private.schedule_is_manager(organization_id, location_id)
    )
    or (
      entity_type in ('payroll_period', 'payroll_payment', 'payroll_adjustment', 'payroll_rates', 'payroll_settings')
      and (
        private.payroll_is_org_manager(organization_id)
        or (
          location_id is not null
          and private.payroll_can_manage_location(organization_id, location_id)
        )
      )
    )
  );

-- =============================================================================
-- PART 5: UPDATE UNCONFIRM_PAYROLL_PAYMENT RPC
-- =============================================================================

create or replace function public.unconfirm_payroll_payment(
  p_payment_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payroll_payments;
  v_period public.payroll_periods;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Not signed in.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required to unconfirm a payment.';
  end if;

  select * into v_payment from public.payroll_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'That payment could not be found.';
  end if;

  select * into v_period from public.payroll_periods where id = v_payment.payroll_period_id;
  if v_period.id is null then
    raise exception 'Target payroll period could not be found.';
  end if;

  if not private.payroll_can_manage_period(v_payment.payroll_period_id) then
    raise exception 'You do not have permission to unconfirm this payment.';
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'This payment is not confirmed.';
  end if;

  -- Transaction-local flag allows unconfirming back to draft
  perform set_config('app.allow_payment_unconfirm', 'true', true);

  update public.payroll_payments
  set status = 'draft', confirmed_at = null, confirmed_by = null
  where id = p_payment_id;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id,
    before_state, after_state, reason
  ) values (
    v_payment.organization_id,
    v_period.location_id,
    v_actor,
    'payroll_payment_unconfirmed',
    'payroll_payment',
    p_payment_id::text,
    jsonb_build_object('status', 'confirmed'),
    jsonb_build_object('status', 'draft'),
    trim(p_reason)
  );
end;
$$;

revoke all on function public.unconfirm_payroll_payment(bigint, text) from public, anon;
grant execute on function public.unconfirm_payroll_payment(bigint, text) to authenticated;

-- =============================================================================
-- PART 6: BACKEND MODULE ENFORCEMENT RESTRICTIVE POLICY
-- =============================================================================

drop policy if exists payroll_periods_module_enforcement on public.payroll_periods;
create policy payroll_periods_module_enforcement on public.payroll_periods
  as restrictive
  for all
  to authenticated
  using (
    location_id is null
    or private.location_module_allows(location_id, 'payroll'::public.location_module_key)
  )
  with check (
    location_id is null
    or private.location_module_allows(location_id, 'payroll'::public.location_module_key)
  );

commit;
