-- V2-002.004 — Staff Assignment Management: authorized organization roster reader.
--
-- Problem: the staff assignment UI must list an organization's members for any
-- actor who may manage assignments (Overall Owner/Manager, or active Org
-- Owner/General Manager). Existing RLS on public.memberships
-- (memberships_select_member -> private.has_org_role) and public.profiles
-- (profiles_select_shared_org -> private.can_view_profile) only exposes rows to
-- ACTIVE members of the organization. An Overall Owner/Manager with no local
-- membership therefore read an empty roster, and even org managers could not
-- read profile names of inactive members.
--
-- Fix: add ONE narrowly scoped, read-only function instead of widening the
-- general memberships/profiles policies. No existing policy is modified.
--
-- Security properties:
--   * authentication required (auth.uid()); no actor parameter;
--   * authority identical to public.apply_location_assignment_changes:
--     Overall Owner/Manager OR active Org Owner/General Manager of THIS org
--     (Overall Assistant Manager alone, shift managers, host/server, members
--     of other orgs and revoked/inactive members are denied);
--   * returns only profile_id, display_name, org roles and active flag for the
--     requested organization (no avatar, email or credentials);
--   * SECURITY DEFINER with an empty search_path and fully qualified names;
--   * EXECUTE granted to authenticated only; bounded page size.

create or replace function public.list_organization_staff(
  p_organization_id uuid,
  p_profile_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  profile_id uuid,
  display_name text,
  roles public.app_role[],
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null then
    raise exception 'Organization ID is required' using errcode = '22023';
  end if;

  if not (
    exists (
      select 1
      from public.overall_roles orl
      where orl.profile_id = v_actor_id
        and orl.role in ('owner', 'manager')
    )
    or private.has_org_role(
      p_organization_id,
      array['owner', 'general_manager']::public.app_role[]
    )
  ) then
    raise exception 'Unauthorized: caller lacks management role in organization %', p_organization_id
      using errcode = '42501';
  end if;

  return query
    select m.profile_id, p.display_name, m.roles, m.active
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_organization_id
      and (p_profile_id is null or m.profile_id = p_profile_id)
    order by m.created_at asc, m.id asc
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_organization_staff(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.list_organization_staff(uuid, uuid, integer, integer) to authenticated;
