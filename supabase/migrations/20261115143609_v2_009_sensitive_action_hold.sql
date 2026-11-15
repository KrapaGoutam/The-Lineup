-- V2-009 release hold: PIN-only sessions may use ordinary operations, but
-- cannot perform platform or organization ownership changes. A direct postgres
-- operator session is the sole exception for the separately audited Raj bootstrap.
begin;

create function private.v2_009_reject_sensitive_action()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' and session_user = 'postgres'
     and auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name in ('organizations', 'overall_roles') then
    raise exception 'Sensitive administration is temporarily unavailable'
      using errcode = '42501';
  end if;

  if tg_table_name = 'memberships' then
    if tg_op = 'DELETE' then
      if 'owner'::public.app_role = any(old.roles) then
        raise exception 'Organization ownership changes are temporarily unavailable'
          using errcode = '42501';
      end if;
      return old;
    end if;
    if tg_op = 'INSERT' then
      if 'owner'::public.app_role = any(new.roles) then
        raise exception 'Organization ownership changes are temporarily unavailable'
          using errcode = '42501';
      end if;
      return new;
    end if;
    if 'owner'::public.app_role = any(old.roles)
       or 'owner'::public.app_role = any(new.roles) then
      raise exception 'Organization ownership changes are temporarily unavailable'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Unexpected sensitive-action trigger target'
    using errcode = '42501';
end;
$$;

revoke all on function private.v2_009_reject_sensitive_action()
  from public, anon, authenticated, service_role;

create trigger v2_009_hold_organization_lifecycle
  before insert or delete on public.organizations
  for each row execute function private.v2_009_reject_sensitive_action();

create trigger v2_009_hold_overall_roles
  before insert or update or delete on public.overall_roles
  for each row execute function private.v2_009_reject_sensitive_action();

create trigger v2_009_hold_organization_owner
  before insert or update or delete on public.memberships
  for each row execute function private.v2_009_reject_sensitive_action();

-- Defense in depth for authenticated direct REST/RPC callers. Ordinary
-- membership role edits remain available, subject to the owner-row trigger.
revoke insert, delete on public.organizations from authenticated;
revoke execute on function public.provision_organization(text, text, uuid, jsonb)
  from authenticated;

commit;
