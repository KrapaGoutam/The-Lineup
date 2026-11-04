-- Migration: 20261103050000_location_model_foundation.sql
-- Subfeature V2-002.002: Location Model
--
-- 1. Additive updated_at column to public.locations
-- 2. Locations payload & immutability guard trigger:
--    - Enforces valid IANA time zone (pg_timezone_names catalog: named zones or 'UTC')
--    - Enforces address is a JSON object
--    - Enforces trimmed name length 1–120
--    - On UPDATE: strictly blocks mutation of `id`, `organization_id`, and `created_at`
--    - Automatically refreshes `updated_at := now()` on update
-- 3. Hardened RLS policies on public.locations:
--    - SELECT: Overall Role holders OR active members of parent organization
--    - INSERT: Overall Owner/Manager OR active Org Owner/General Manager
--    - UPDATE: Overall Owner/Manager OR active Org Owner/General Manager
--    - DELETE: Denied (no policy granted; hard delete strictly prohibited)
-- 4. Hardened RLS policies on public.operating_hours:
--    - SELECT: Overall Role holders OR active members of parent organization
--    - WRITE: Overall Owner/Manager OR active Org Owner/GM/Shift Manager
-- 5. Secure location provisioning RPC:
--    - `public.provision_location` (enforces actor management authority, organization existence,
--      name uniqueness, IANA timezone validity, and address format)

-- -----------------------------------------------------------------------------
-- 1. Additive Columns
-- -----------------------------------------------------------------------------
alter table public.locations
  add column if not exists updated_at timestamptz not null default now();

-- -----------------------------------------------------------------------------
-- 2. Locations Payload & Immutability Guard Trigger
-- -----------------------------------------------------------------------------
create or replace function public.locations_guard_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 1. Validate name
  new.name := trim(coalesce(new.name, ''));
  if length(new.name) < 1 or length(new.name) > 120 then
    raise exception 'Location name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  -- 2. Validate time_zone against authoritative IANA catalog
  if new.time_zone is null or not exists (
    select 1 from pg_timezone_names
    where name = new.time_zone
      and (name like '%/%' or name = 'UTC')
  ) then
    raise exception 'Invalid IANA time zone: %', new.time_zone using errcode = '22023';
  end if;

  -- 3. Validate address is a JSON object
  if new.address is null or jsonb_typeof(new.address) <> 'object' then
    raise exception 'Location address must be a JSON object' using errcode = '22023';
  end if;

  -- 4. Immutability checks on update
  if tg_op = 'UPDATE' then
    if new.id <> old.id then
      raise exception 'Location ID is immutable' using errcode = '22023';
    end if;
    if new.organization_id <> old.organization_id then
      raise exception 'Location organization_id is immutable' using errcode = '22023';
    end if;
    if new.created_at <> old.created_at then
      raise exception 'Location created_at is immutable' using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists locations_guard_payload on public.locations;
create trigger locations_guard_payload
  before insert or update on public.locations
  for each row
  execute function public.locations_guard_payload();

-- -----------------------------------------------------------------------------
-- 3. Locations RLS Hardening
-- -----------------------------------------------------------------------------
drop policy if exists "locations_select_member" on public.locations;
drop policy if exists "locations_write_manager" on public.locations;
drop policy if exists "locations_insert_manager" on public.locations;
drop policy if exists "locations_update_manager" on public.locations;

-- SELECT: Overall Role holder OR active member of target organization
create policy "locations_select_member" on public.locations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
    )
  );

-- INSERT: Overall Owner/Manager OR active Org Owner/General Manager
create policy "locations_insert_manager" on public.locations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager']::public.app_role[]
    )
  );

-- UPDATE: Overall Owner/Manager OR active Org Owner/General Manager
create policy "locations_update_manager" on public.locations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager']::public.app_role[]
    )
  )
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager']::public.app_role[]
    )
  );

-- Note: DELETE on public.locations is intentionally denied to prevent cascading loss of operational records.

-- -----------------------------------------------------------------------------
-- 4. Operating Hours RLS Hardening
-- -----------------------------------------------------------------------------
drop policy if exists "operating_hours_select_member" on public.operating_hours;
drop policy if exists "operating_hours_write_manager" on public.operating_hours;

create policy "operating_hours_select_member" on public.operating_hours
  for select
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
    )
  );

create policy "operating_hours_write_manager" on public.operating_hours
  for all
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager', 'shift_manager']::public.app_role[]
    )
  )
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      organization_id,
      array['owner', 'general_manager', 'shift_manager']::public.app_role[]
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Secure Location Provisioning RPC
-- -----------------------------------------------------------------------------
create or replace function public.provision_location(
  p_organization_id uuid,
  p_name text,
  p_time_zone text default 'UTC',
  p_address jsonb default '{}'::jsonb,
  p_cover_weight numeric default 0.25,
  p_opening_local time default '11:00'::time,
  p_closing_local time default '23:00'::time
)
returns public.locations
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_actor_id uuid;
  v_loc public.locations%rowtype;
  v_name text;
  v_tz text;
  v_addr jsonb;
  v_weight numeric;
begin
  -- 1. Explicit caller authentication check
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- 2. Target organization existence check
  if p_organization_id is null or not exists (
    select 1 from public.organizations where id = p_organization_id
  ) then
    raise exception 'Target organization does not exist' using errcode = 'P0002';
  end if;

  -- 3. Authorization check: Overall Owner, Overall Manager, or active Org Owner / General Manager
  if not (
    exists (
      select 1 from public.overall_roles
      where profile_id = v_actor_id
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      p_organization_id,
      array['owner', 'general_manager']::public.app_role[]
    )
  ) then
    raise exception 'Unauthorized: location provisioning requires management authority' using errcode = '42501';
  end if;

  -- 4. Validate name
  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'Location name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  -- 5. Name uniqueness within organization
  if exists (
    select 1 from public.locations
    where organization_id = p_organization_id
      and name = v_name
  ) then
    raise exception 'Location name already exists in organization' using errcode = '23505';
  end if;

  -- 6. Validate time_zone against authoritative IANA catalog
  v_tz := coalesce(p_time_zone, 'UTC');
  if not exists (
    select 1 from pg_timezone_names
    where name = v_tz
      and (name like '%/%' or name = 'UTC')
  ) then
    raise exception 'Invalid IANA time zone: %', v_tz using errcode = '22023';
  end if;

  -- 7. Validate address
  v_addr := coalesce(p_address, '{}'::jsonb);
  if jsonb_typeof(v_addr) <> 'object' then
    raise exception 'Location address must be a JSON object' using errcode = '22023';
  end if;

  -- 8. Validate cover_weight
  v_weight := coalesce(p_cover_weight, 0.25);
  if v_weight < 0 or v_weight > 10 then
    raise exception 'Cover weight must be between 0 and 10' using errcode = '22023';
  end if;

  -- 9. Insert location row
  insert into public.locations (
    organization_id,
    name,
    time_zone,
    address,
    cover_weight,
    active,
    opening_local,
    closing_local,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    v_name,
    v_tz,
    v_addr,
    v_weight,
    true,
    coalesce(p_opening_local, '11:00'::time),
    coalesce(p_closing_local, '23:00'::time),
    now(),
    now()
  )
  returning * into v_loc;

  return v_loc;
end;
$$;

revoke all on function public.provision_location(uuid, text, text, jsonb, numeric, time, time) from public, anon;
grant execute on function public.provision_location(uuid, text, text, jsonb, numeric, time, time) to authenticated;
