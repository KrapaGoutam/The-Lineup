-- Feature V2-008 Batch B1: Kiosk manager authority hardening (F-1) and the
-- location-scoped manageable-location listing (D7).
-- Migration: 20261112200000_kiosk_manager_authority_hardening.sql
--
-- Forward-only. Replaces private.kiosk_can_manage_location (same signature, so
-- every dependent RLS policy and RPC from 20261111120000 keeps working
-- unchanged) and adds one read-only RPC. No table, policy or RLS change.
--
-- F-1: the location-manager branch trusted any ACTIVE location_memberships
-- 'manager' row. It ignored (a) whether the caller still has an ACTIVE membership
-- in the location's organization (member deactivation does not touch
-- location_memberships rows) and (b) live session state, so a deactivated/banned
-- manager holding an unexpired access token could still call the kiosk RPCs or
-- read kiosk_devices / kiosk_pairing_codes directly through PostgREST.

-- -----------------------------------------------------------------------------
-- 1. Live-session gate. Same contract and body as private.payroll_live_session /
--    schedule_live_session / attendance_live_session: a banned user, or a JWT whose
--    Supabase Auth session was revoked/expired, loses authority immediately
--    instead of when the access token expires. A JWT without a session_id claim
--    is checked for the ban only (identical to the other modules). Not granted to
--    clients; only callable from the SECURITY DEFINER predicate below.
-- -----------------------------------------------------------------------------
create or replace function private.kiosk_live_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and (u.banned_until is null or u.banned_until <= now())
      and (
        (select auth.jwt()) ->> 'session_id' is null
        or exists (
          select 1
          from auth.sessions s
          where s.user_id = u.id
            and s.id::text = (select auth.jwt()) ->> 'session_id'
            and (s.not_after is null or s.not_after > now())
        )
      )
  );
$$;

revoke all on function private.kiosk_live_session() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Hardened predicate. Authority is unchanged except where F-1 required it:
--      * live session required for EVERY branch (including Overall roles);
--      * location-manager branch additionally requires an ACTIVE membership in
--        the location's own organization.
--    Overall owner/manager stay membership-free. assistant_manager and staff
--    remain denied. The location must still be active and not archived.
-- -----------------------------------------------------------------------------
create or replace function private.kiosk_can_manage_location(p_location_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_loc public.locations%rowtype;
begin
  if v_uid is null or p_location_id is null then
    return false;
  end if;

  if not private.kiosk_live_session() then
    return false;
  end if;

  select * into v_loc
  from public.locations
  where id = p_location_id and active and archived_at is null;

  if not found then
    return false;
  end if;

  -- 1. Overall role (owner or manager); intentionally independent of tenant memberships.
  if exists (
    select 1
    from public.overall_roles r
    where r.profile_id = v_uid
      and r.role in ('owner', 'manager')
  ) then
    return true;
  end if;

  -- 2. Active organization Owner / General Manager of the location's organization.
  if exists (
    select 1
    from public.memberships m
    where m.organization_id = v_loc.organization_id
      and m.profile_id = v_uid
      and m.active
      and (
        'owner'::public.app_role = any(m.roles) or
        'general_manager'::public.app_role = any(m.roles)
      )
  ) then
    return true;
  end if;

  -- 3. Active 'manager' row at THIS location, held by someone who is still an
  --    ACTIVE member of the location's organization (F-1).
  if exists (
    select 1
    from public.location_memberships lm
    join public.memberships m
      on m.profile_id = lm.profile_id
     and m.organization_id = v_loc.organization_id
     and m.active
    where lm.location_id = p_location_id
      and lm.profile_id = v_uid
      and lm.active
      and lm.role = 'manager'::public.location_role
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function private.kiosk_can_manage_location(uuid) from public, anon;
grant execute on function private.kiosk_can_manage_location(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. D7: read-only listing of the locations the caller may manage kiosks for.
--    Computed by the SAME predicate the kiosk RPCs/RLS use, so it can never
--    disagree with them. Visibility only; every kiosk mutation re-checks
--    authority server-side. Minimal columns, deterministic order, capped.
-- -----------------------------------------------------------------------------
create or replace function public.kiosk_list_manageable_locations()
returns table (
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name, l.organization_id, o.name
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where (select auth.uid()) is not null
    and l.active
    and l.archived_at is null
    and private.kiosk_can_manage_location(l.id)
  order by o.name, l.name, l.id
  limit 200;
$$;

revoke all on function public.kiosk_list_manageable_locations() from public, anon;
grant execute on function public.kiosk_list_manageable_locations() to authenticated;

comment on function public.kiosk_list_manageable_locations() is
  'V2-008 B1/D7. Locations the caller may manage kiosk devices for (same predicate as the kiosk RPCs). Read-only; returns ids and names only.';
