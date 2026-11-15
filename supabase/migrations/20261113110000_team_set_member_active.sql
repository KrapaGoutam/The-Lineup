-- V2-009 F-5: organization-scoped Team membership transitions.
-- The definer is needed to update the service-only credential and audit it in
-- the same transaction as membership.active. It is deliberately not a generic
-- RLS bypass: caller identity, live session, actor scope and target hierarchy
-- are checked here before any target existence is disclosed.
begin;

create function private.team_live_session()
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
revoke all on function private.team_live_session() from public, anon, authenticated, service_role;

create function public.team_set_member_active(
  p_organization_id uuid,
  p_target_profile_id uuid,
  p_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row record;
  v_actor_roles public.app_role[];
  v_actor_active boolean := false;
  v_target_roles public.app_role[];
  v_target_active boolean;
  v_target_found boolean := false;
  v_credential_present boolean;
  v_credential_active boolean;
  v_overall_role public.overall_role;
  v_can_manage boolean;
  v_affected integer;
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if v_actor is null or not private.team_live_session() then
    raise exception 'A live session is required' using errcode = '28000';
  end if;
  if p_organization_id is null or p_target_profile_id is null or p_active is null
     or v_reason is null or pg_catalog.length(v_reason) not between 3 and 500 then
    raise exception 'Invalid Team transition arguments' using errcode = '22023';
  end if;

  -- A locked membership row is the authority source. Lock both possible rows
  -- in profile order so opposing administrators cannot deadlock each other.
  for v_row in
    select m.profile_id, m.roles, m.active
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id in (v_actor, p_target_profile_id)
    order by m.profile_id
    for update
  loop
    if v_row.profile_id = v_actor then
      v_actor_roles := v_row.roles;
      v_actor_active := v_row.active;
    end if;
    if v_row.profile_id = p_target_profile_id then
      v_target_found := true;
      v_target_roles := v_row.roles;
      v_target_active := v_row.active;
    end if;
  end loop;

  select r.role into v_overall_role
  from public.overall_roles r
  where r.profile_id = v_actor;

  v_can_manage := v_overall_role in ('owner', 'manager')
    or (v_actor_active and v_actor_roles && array['owner', 'general_manager']::public.app_role[]);
  -- Uniform denial precedes target disclosure. Self-target is never allowed.
  if coalesce(not v_can_manage, true) or v_actor = p_target_profile_id
     or not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Not authorized for Team transition' using errcode = '42501';
  end if;
  if not v_target_found then
    raise exception 'Target is not a member' using errcode = 'P0002';
  end if;
  if v_overall_role is distinct from 'owner'
     and not (v_actor_active and 'owner' = any(v_actor_roles))
     and v_target_roles && array['owner', 'general_manager']::public.app_role[] then
    raise exception 'Not authorized for Team transition' using errcode = '42501';
  end if;

  select c.active into v_credential_active
  from public.passcode_credentials c
  where c.organization_id = p_organization_id
    and c.profile_id = p_target_profile_id
  for update;
  v_credential_present := found;

  if v_target_active = p_active
     and (not v_credential_present or v_credential_active = p_active) then
    return pg_catalog.jsonb_build_object(
      'outcome', 'already_in_state', 'membership_active', p_active,
      'credential_present', v_credential_present
    );
  end if;

  if v_credential_present then
    update public.passcode_credentials c
    set active = p_active, updated_at = now()
    where c.organization_id = p_organization_id
      and c.profile_id = p_target_profile_id;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception 'Credential update did not affect one row' using errcode = 'P0001';
    end if;
  end if;

  update public.memberships m
  set active = p_active
  where m.organization_id = p_organization_id
    and m.profile_id = p_target_profile_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'Membership update did not affect one row' using errcode = 'P0001';
  end if;

  insert into public.audit_events (
    organization_id, actor_profile_id, action, entity_type, entity_id,
    reason, before_state, after_state
  ) values (
    p_organization_id, v_actor,
    case when p_active then 'member_reactivated' else 'member_deactivated' end,
    'membership', p_target_profile_id::text, v_reason,
    pg_catalog.jsonb_build_object(
      'active', v_target_active, 'credential_active', v_credential_active,
      'credential_present', v_credential_present
    ),
    pg_catalog.jsonb_build_object(
      'active', p_active, 'credential_present', v_credential_present,
      'scope', 'organization', 'authorization',
      case when v_overall_role in ('owner', 'manager') then 'overall_role' else 'organization_membership' end
    )
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'changed', 'membership_active', p_active,
    'credential_present', v_credential_present
  );
end;
$$;
revoke all on function public.team_set_member_active(uuid, uuid, boolean, text)
  from public, anon, service_role;
grant execute on function public.team_set_member_active(uuid, uuid, boolean, text)
  to authenticated;

-- Existing designation editing only updates roles. Direct active flips must
-- use the narrow transaction above, which also synchronizes credentials.
revoke update on public.memberships from authenticated;
grant update (roles) on public.memberships to authenticated;
commit;
