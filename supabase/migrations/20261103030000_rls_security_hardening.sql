-- Migration: 20261103030000_rls_security_hardening.sql
-- Subfeature V2-001.007: RLS / Server Security Hardening
--
-- 1. Permanently remove the `organizations.created_by` bypass from `private.has_org_role`.
--    Closes Issue #106 debt: a deactivated or non-member creator immediately loses all access.
--    All organization authority strictly derives from active rows in `public.memberships`.
--
-- 2. Audit and harden `public.apply_location_assignment_changes`:
--    - Enforce explicit caller authentication (`auth.uid()`)
--    - Recognize Overall Owner and Overall Manager global management capability
--    - Deny Overall Assistant Manager and normal staff self-promotion and cross-user promotion
--    - Deny cross-organization assignment
--    - Require active parent organization membership for target profile
--    - Preserve atomic transactions: unhandled failure aborts whole batch (0 partial writes)
--
-- 3. Harden `public.location_memberships` table RLS policies to align with Overall role tiers.

-- -----------------------------------------------------------------------------
-- 1. Harden private.has_org_role: Eliminate creator bypass
-- -----------------------------------------------------------------------------
create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.organization_id = target_organization_id
      and memberships.profile_id = (select auth.uid())
      and memberships.active
      and memberships.roles && allowed_roles
  );
$$;

revoke all on function private.has_org_role(uuid, public.app_role[]) from public, anon;
grant execute on function private.has_org_role(uuid, public.app_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Audit & harden public.apply_location_assignment_changes
-- -----------------------------------------------------------------------------
create or replace function public.apply_location_assignment_changes(
  p_target_profile_id uuid,
  p_changes jsonb
)
returns setof public.location_memberships
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_actor_id uuid;
  v_elem jsonb;
  v_loc_id_text text;
  v_loc_id uuid;
  v_org_id uuid;
  v_loc_active boolean;
  v_action text;
  v_role_text text;
  v_role public.location_role;
  v_existing_id bigint;
  v_result_row public.location_memberships%rowtype;
  v_has_active_flag boolean;
  v_active_val boolean;
begin
  -- 1. Explicit caller authentication check (prevents anonymous execution)
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- 2. Target profile existence check
  if p_target_profile_id is null then
    raise exception 'Target profile ID is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_profile_id) then
    raise exception 'Target profile % does not exist', p_target_profile_id using errcode = 'P0002';
  end if;

  -- 3. Deterministic empty change set handling (no-op)
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    return;
  end if;

  -- 4. Batch duplicate location check (rejects ambiguous inputs)
  if (
    select count(distinct coalesce(elem->>'locationId', elem->>'location_id'))
    from jsonb_array_elements(p_changes) elem
  ) <> jsonb_array_length(p_changes) then
    raise exception 'Duplicate location instruction in batch' using errcode = '23505';
  end if;

  -- 5. Process each location change atomically
  for v_elem in select * from jsonb_array_elements(p_changes) loop
    v_loc_id_text := coalesce(v_elem->>'locationId', v_elem->>'location_id');
    if v_loc_id_text is null or v_loc_id_text = '' then
      raise exception 'Missing locationId in change item' using errcode = '22023';
    end if;

    begin
      v_loc_id := v_loc_id_text::uuid;
    exception when others then
      raise exception 'Invalid location UUID: %', v_loc_id_text using errcode = '22P02';
    end;

    -- Validate location existence and status
    select organization_id, active
    into v_org_id, v_loc_active
    from public.locations
    where id = v_loc_id;

    if not found then
      raise exception 'Location % does not exist', v_loc_id using errcode = 'P0002';
    end if;

    if not v_loc_active then
      raise exception 'Location % is inactive', v_loc_id using errcode = '22023';
    end if;

    -- Validate caller management authority:
    -- Caller must be Overall Owner or Overall Manager,
    -- OR hold an active owner or general_manager role in the location's owning organization.
    -- Overall Assistant Manager, normal staff, deactivated managers, and foreign org managers are strictly DENIED.
    if not (
      exists (
        select 1 from public.overall_roles
        where profile_id = v_actor_id
          and role in ('owner', 'manager')
      )
      or private.has_org_role(v_org_id, array['owner', 'general_manager']::public.app_role[])
    ) then
      raise exception 'Unauthorized: caller lacks management role in organization %', v_org_id using errcode = '42501';
    end if;

    -- Determine effective action
    v_action := lower(coalesce(v_elem->>'action', ''));
    v_has_active_flag := v_elem ? 'active';
    if v_has_active_flag then
      v_active_val := (v_elem->>'active')::boolean;
    else
      v_active_val := null;
    end if;

    if v_action = 'deactivate' or (v_action = '' and v_active_val is false) then
      -- Deactivate existing assignment
      select id into v_existing_id
      from public.location_memberships
      where location_id = v_loc_id and profile_id = p_target_profile_id;

      if found then
        update public.location_memberships
        set active = false, updated_at = now()
        where id = v_existing_id
        returning * into v_result_row;

        return next v_result_row;
      else
        raise exception 'Cannot deactivate non-existent assignment for location %', v_loc_id using errcode = 'P0002';
      end if;

    else
      -- Action is assign, update, reactivate, or upsert (active = true)
      -- Prerequisite: Target profile MUST have active parent organization membership
      if not exists (
        select 1
        from public.memberships
        where profile_id = p_target_profile_id
          and organization_id = v_org_id
          and active = true
      ) then
        raise exception 'Target profile % lacks active membership in organization %', p_target_profile_id, v_org_id using errcode = '42501';
      end if;

      -- Validate role value
      v_role_text := coalesce(v_elem->>'role', '');
      if v_role_text not in ('manager', 'assistant_manager', 'staff') then
        raise exception 'Invalid location role: %', v_role_text using errcode = '22P02';
      end if;
      v_role := v_role_text::public.location_role;

      -- Look up existing assignment
      select id into v_existing_id
      from public.location_memberships
      where location_id = v_loc_id and profile_id = p_target_profile_id;

      if found then
        update public.location_memberships
        set role = v_role, active = true, updated_at = now()
        where id = v_existing_id
        returning * into v_result_row;

        return next v_result_row;
      else
        insert into public.location_memberships (
          location_id,
          profile_id,
          role,
          active,
          created_at,
          updated_at
        ) values (
          v_loc_id,
          p_target_profile_id,
          v_role,
          true,
          now(),
          now()
        )
        returning * into v_result_row;

        return next v_result_row;
      end if;

    end if;

  end loop;

  return;
end;
$$;

revoke all on function public.apply_location_assignment_changes(uuid, jsonb) from public, anon;
grant execute on function public.apply_location_assignment_changes(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Harden public.location_memberships RLS policies
-- -----------------------------------------------------------------------------
drop policy if exists "location_memberships_select" on public.location_memberships;
drop policy if exists "location_memberships_insert_manager" on public.location_memberships;
drop policy if exists "location_memberships_update_manager" on public.location_memberships;
drop policy if exists "location_memberships_delete_manager" on public.location_memberships;

-- SELECT: Caller views own records OR holds Overall Role OR has active org membership
create policy "location_memberships_select" on public.location_memberships
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
        )
    )
  );

-- INSERT: Overall Owner/Manager OR active Org Owner/General Manager
create policy "location_memberships_insert_manager" on public.location_memberships
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );

-- UPDATE: Overall Owner/Manager OR active Org Owner/General Manager
create policy "location_memberships_update_manager" on public.location_memberships
  for update
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  )
  with check (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );

-- DELETE: Overall Owner/Manager OR active Org Owner/General Manager
create policy "location_memberships_delete_manager" on public.location_memberships
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
        and role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );
