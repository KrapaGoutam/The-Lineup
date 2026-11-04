-- Migration: 20261103040000_organization_model_foundation.sql
-- Subfeature V2-002.001: Organization Model
--
-- 1. Harden public.organizations RLS policies:
--    - SELECT: Allows callers holding an Overall Role (system-wide visibility) OR an active organization membership.
--    - INSERT: Restricted strictly to Overall Owner capability. Prevents unauthorized tenant creation.
--    - UPDATE: Restricted to Overall Owner, Overall Manager, or active Organization Owner / General Manager.
--    - DELETE: Denied (no policy granted to authenticated; prevents cascading operational data loss).
--
-- 2. Organizations immutability guard trigger:
--    - Prevents arbitrary mutation of `id`, `created_by`, or `created_at`.
--    - Automatically updates `updated_at` on legitimate updates.
--
-- 3. Atomic tenant provisioning RPC:
--    - `public.provision_organization(p_name, p_slug, p_initial_owner_profile_id, p_settings)`
--    - Enforces Overall Owner authorization.
--    - Atomically creates organization row and initial active owner membership row in public.memberships.
--    - Ensures zero orphaned organizations if owner bootstrap fails.

-- -----------------------------------------------------------------------------
-- 1. Organizations RLS Hardening
-- -----------------------------------------------------------------------------
drop policy if exists "organizations_select_member" on public.organizations;
drop policy if exists "organizations_insert_creator" on public.organizations;
drop policy if exists "organizations_insert_owner" on public.organizations;
drop policy if exists "organizations_update_manager" on public.organizations;

-- SELECT: Overall Role holder OR active member of target organization
create policy "organizations_select_member" on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or private.has_org_role(
      id,
      array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
    )
  );

-- INSERT: Overall Owner exclusive
create policy "organizations_insert_owner" on public.organizations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role = 'owner'::public.overall_role
    )
  );

-- UPDATE: Overall Owner/Manager OR active Org Owner/General Manager
create policy "organizations_update_manager" on public.organizations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or private.has_org_role(
      id,
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
      id,
      array['owner', 'general_manager']::public.app_role[]
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Organizations Immutability Guard Trigger
-- -----------------------------------------------------------------------------
create or replace function public.organizations_guard_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Organization ID is immutable' using errcode = '22023';
  end if;
  if new.created_by <> old.created_by then
    raise exception 'Organization created_by is immutable' using errcode = '22023';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'Organization created_at is immutable' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_guard_immutability on public.organizations;
create trigger organizations_guard_immutability
  before update on public.organizations
  for each row
  execute function public.organizations_guard_immutability();

-- -----------------------------------------------------------------------------
-- 3. Atomic Tenant Provisioning RPC
-- -----------------------------------------------------------------------------
create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_initial_owner_profile_id uuid default null,
  p_settings jsonb default '{}'::jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_actor_id uuid;
  v_org public.organizations%rowtype;
  v_owner_profile_id uuid;
  v_name text;
  v_slug text;
  v_settings jsonb;
begin
  -- 1. Explicit caller authentication check
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- 2. Verify caller has Overall Owner role
  if not exists (
    select 1 from public.overall_roles
    where profile_id = v_actor_id
      and role = 'owner'::public.overall_role
  ) then
    raise exception 'Unauthorized: tenant creation requires Overall Owner authority' using errcode = '42501';
  end if;

  -- 3. Validate name
  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'Organization name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  -- 4. Validate slug
  v_slug := trim(lower(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug format' using errcode = '22023';
  end if;

  -- 5. Slug uniqueness check
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise exception 'Organization slug already exists' using errcode = '23505';
  end if;

  -- 6. Validate settings
  v_settings := coalesce(p_settings, '{}'::jsonb);
  if jsonb_typeof(v_settings) <> 'object' then
    raise exception 'Organization settings must be a JSON object' using errcode = '22023';
  end if;

  -- 7. Determine initial owner
  v_owner_profile_id := coalesce(p_initial_owner_profile_id, v_actor_id);
  if not exists (select 1 from public.profiles where id = v_owner_profile_id) then
    raise exception 'Initial owner profile % does not exist', v_owner_profile_id using errcode = 'P0002';
  end if;

  -- 8. Insert organization
  insert into public.organizations (
    name,
    slug,
    created_by,
    settings,
    created_at,
    updated_at
  ) values (
    v_name,
    v_slug,
    v_actor_id,
    v_settings,
    now(),
    now()
  )
  returning * into v_org;

  -- 9. Insert initial owner membership atomically
  insert into public.memberships (
    organization_id,
    profile_id,
    roles,
    active,
    created_at
  ) values (
    v_org.id,
    v_owner_profile_id,
    array['owner']::public.app_role[],
    true,
    now()
  );

  return v_org;
end;
$$;

revoke all on function public.provision_organization(text, text, uuid, jsonb) from public, anon;
grant execute on function public.provision_organization(text, text, uuid, jsonb) to authenticated;
