-- V2-009 B1: prevent direct membership recreation from bypassing F-5.
-- Existing-account assignment is an audited operation; ordinary removal is
-- team_set_member_active(false), which preserves history and credentials.
begin;

create or replace function public.team_add_member(
  p_organization_id uuid,
  p_target_profile_id uuid,
  p_roles public.app_role[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_roles public.app_role[];
  v_actor_active boolean := false;
  v_overall_role public.overall_role;
  v_reason text := pg_catalog.btrim(p_reason);
  v_can_manage boolean;
begin
  if v_actor is null or not private.team_live_session() then
    raise exception 'A live session is required' using errcode = '28000';
  end if;
  if p_organization_id is null or p_target_profile_id is null
     or p_roles is null or pg_catalog.cardinality(p_roles) = 0
     or pg_catalog.array_position(p_roles, null) is not null
     or v_reason is null or pg_catalog.length(v_reason) not between 3 and 500 then
    raise exception 'Invalid Team assignment arguments' using errcode = '22023';
  end if;

  -- Serialize with deactivation of an organization-scoped administrator.
  select m.roles, m.active into v_actor_roles, v_actor_active
  from public.memberships m
  where m.organization_id = p_organization_id and m.profile_id = v_actor
  for update;
  v_actor_active := coalesce(v_actor_active, false);

  select r.role into v_overall_role
  from public.overall_roles r where r.profile_id = v_actor;

  v_can_manage := v_overall_role in ('owner', 'manager')
    or (v_actor_active and v_actor_roles &&
        array['owner', 'general_manager']::public.app_role[]);
  if coalesce(not v_can_manage, true) or v_actor = p_target_profile_id
     or not exists (select 1 from public.organizations o where o.id = p_organization_id)
     or (v_overall_role is distinct from 'owner'
         and not (v_actor_active and 'owner' = any(v_actor_roles))
         and p_roles && array['owner', 'general_manager']::public.app_role[]) then
    raise exception 'Not authorized for Team assignment' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_profile_id) then
    raise exception 'Target profile does not exist' using errcode = 'P0002';
  end if;

  -- A prior inactive membership must be reactivated through the F-5 RPC.
  -- The unique key also serializes competing assignments of the same person.
  insert into public.memberships (organization_id, profile_id, roles, active)
  values (p_organization_id, p_target_profile_id, p_roles, true);

  insert into public.audit_events (
    organization_id, actor_profile_id, action, entity_type, entity_id,
    reason, before_state, after_state
  ) values (
    p_organization_id, v_actor, 'member_added', 'membership',
    p_target_profile_id::text, v_reason, null,
    pg_catalog.jsonb_build_object('active', true, 'roles', p_roles,
      'credential_present', false, 'scope', 'organization')
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'added', 'membership_active', true,
    'credential_present', false
  );
end;
$$;

revoke all on function public.team_add_member(uuid, uuid, public.app_role[], text)
  from public, anon, service_role;
grant execute on function public.team_add_member(uuid, uuid, public.app_role[], text)
  to authenticated;

-- The registration route uses the server-only service role for new accounts.
-- The authenticated role retains SELECT and column-limited role UPDATE.
revoke insert, delete on public.memberships from authenticated;
commit;
