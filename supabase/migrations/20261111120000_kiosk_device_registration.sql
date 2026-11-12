-- Migration: 20261111120000_kiosk_device_registration.sql
-- V2-007 Clock In / Clock Out Kiosk — Device Registration, Location Binding & Management

-- 1. Helper function: Can the current actor manage kiosk devices for this location?
-- Authorized roles:
-- - Overall role 'owner' or 'manager'
-- - Organization role 'owner' or 'general_manager'
-- - Location manager ('manager' in location_memberships)
-- Unauthorized: shift managers, regular staff, foreign tenants, anonymous.
create or replace function private.kiosk_can_manage_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and (select auth.uid()) is not null
      and (
        exists (
          select 1 from public.overall_roles r
          where r.profile_id = (select auth.uid())
            and r.role in ('owner', 'manager')
        )
        or exists (
          select 1 from public.memberships m
          where m.organization_id = l.organization_id
            and m.profile_id = (select auth.uid())
            and m.active
            and m.roles && array['owner', 'general_manager']::public.app_role[]
        )
        or (
          l.active
          and l.archived_at is null
          and exists (
            select 1 from public.location_memberships lm
            where lm.location_id = l.id
              and lm.profile_id = (select auth.uid())
              and lm.active
              and lm.role = 'manager'
          )
        )
      )
  );
$$;

revoke all on function private.kiosk_can_manage_location(uuid) from public, anon;
grant execute on function private.kiosk_can_manage_location(uuid) to authenticated;

-- 2. Kiosk Devices Table
create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  device_token_hash text unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  credential_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text check (revocation_reason is null or length(trim(revocation_reason)) <= 500),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kiosk_devices_org_loc_idx
  on public.kiosk_devices (organization_id, location_id);

create index if not exists kiosk_devices_token_hash_idx
  on public.kiosk_devices (device_token_hash)
  where status = 'active';

alter table public.kiosk_devices enable row level security;
alter table public.kiosk_devices force row level security;

drop policy if exists "kiosk_devices_select_manager" on public.kiosk_devices;
create policy "kiosk_devices_select_manager" on public.kiosk_devices
  for select to authenticated
  using (private.kiosk_can_manage_location(location_id));

drop policy if exists "kiosk_devices_insert_manager" on public.kiosk_devices;
create policy "kiosk_devices_insert_manager" on public.kiosk_devices
  for insert to authenticated
  with check (private.kiosk_can_manage_location(location_id));

drop policy if exists "kiosk_devices_update_manager" on public.kiosk_devices;
create policy "kiosk_devices_update_manager" on public.kiosk_devices
  for update to authenticated
  using (private.kiosk_can_manage_location(location_id))
  with check (private.kiosk_can_manage_location(location_id));

-- 3. Kiosk Pairing Codes Table
create table if not exists public.kiosk_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  device_name text not null check (length(trim(device_name)) between 1 and 100),
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  device_id uuid references public.kiosk_devices(id) on delete set null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5
);

create index if not exists kiosk_pairing_codes_code_hash_idx
  on public.kiosk_pairing_codes (code_hash)
  where used_at is null;

create index if not exists kiosk_pairing_codes_org_loc_idx
  on public.kiosk_pairing_codes (organization_id, location_id);

alter table public.kiosk_pairing_codes enable row level security;
alter table public.kiosk_pairing_codes force row level security;

drop policy if exists "kiosk_pairing_codes_select_manager" on public.kiosk_pairing_codes;
create policy "kiosk_pairing_codes_select_manager" on public.kiosk_pairing_codes
  for select to authenticated
  using (private.kiosk_can_manage_location(location_id));

drop policy if exists "kiosk_pairing_codes_insert_manager" on public.kiosk_pairing_codes;
create policy "kiosk_pairing_codes_insert_manager" on public.kiosk_pairing_codes
  for insert to authenticated
  with check (private.kiosk_can_manage_location(location_id));

drop policy if exists "kiosk_pairing_codes_update_manager" on public.kiosk_pairing_codes;
create policy "kiosk_pairing_codes_update_manager" on public.kiosk_pairing_codes
  for update to authenticated
  using (private.kiosk_can_manage_location(location_id))
  with check (private.kiosk_can_manage_location(location_id));

revoke all on public.kiosk_devices from public, anon;
grant select, insert, update on public.kiosk_devices to authenticated;

revoke all on public.kiosk_pairing_codes from public, anon;
grant select, insert, update, delete on public.kiosk_pairing_codes to authenticated;

-- 4. RPC: Generate Pairing Code (Manager Only)
create or replace function public.kiosk_generate_pairing_code(
  p_location_id uuid,
  p_device_name text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_loc public.locations%rowtype;
  v_id uuid;
  v_expires_at timestamptz;
  v_name text := nullif(trim(p_device_name), '');
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  if not found or not private.kiosk_can_manage_location(p_location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if v_name is null or length(v_name) < 1 or length(v_name) > 100 then
    raise exception 'Device name must be between 1 and 100 characters' using errcode = '22023';
  end if;

  if p_code_hash is null or length(trim(p_code_hash)) < 32 then
    raise exception 'Invalid pairing code hash' using errcode = '22023';
  end if;

  v_expires_at := now() + interval '15 minutes';

  insert into public.kiosk_pairing_codes (
    organization_id, location_id, device_name, code_hash, created_by, expires_at
  ) values (
    v_loc.organization_id, v_loc.id, v_name, p_code_hash, v_uid, v_expires_at
  ) returning id into v_id;

  return jsonb_build_object(
    'success', true,
    'pairingId', v_id,
    'locationId', v_loc.id,
    'organizationId', v_loc.organization_id,
    'deviceName', v_name,
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.kiosk_generate_pairing_code(uuid, text, text) from public, anon;
grant execute on function public.kiosk_generate_pairing_code(uuid, text, text) to authenticated;

-- 5. RPC: Consume Pairing Code (Unauthenticated Tablet or Authenticated Manager)
create or replace function public.kiosk_consume_pairing_code(
  p_code_hash text,
  p_device_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.kiosk_pairing_codes%rowtype;
  v_loc public.locations%rowtype;
  v_org public.organizations%rowtype;
  v_device_id uuid;
begin
  if p_code_hash is null or p_device_token_hash is null or length(trim(p_device_token_hash)) < 32 then
    raise exception 'Invalid parameters' using errcode = '22023';
  end if;

  -- Atomic select for update on pairing code
  select * into v_pairing
  from public.kiosk_pairing_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'Pairing code not recognized' using errcode = 'P0002';
  end if;

  -- Check attempt limits
  if v_pairing.attempt_count >= v_pairing.max_attempts then
    raise exception 'Pairing code exceeded maximum attempts' using errcode = '22023';
  end if;

  -- Check expiration
  if v_pairing.expires_at < now() then
    raise exception 'Pairing code has expired' using errcode = '22023';
  end if;

  -- Check if already used
  if v_pairing.used_at is not null then
    raise exception 'Pairing code already used' using errcode = '22023';
  end if;

  select * into v_loc from public.locations where id = v_pairing.location_id;
  if not found or not v_loc.active or v_loc.archived_at is not null then
    raise exception 'Location is inactive or archived' using errcode = '55000';
  end if;

  select * into v_org from public.organizations where id = v_pairing.organization_id;

  -- Create device record
  insert into public.kiosk_devices (
    organization_id, location_id, name, device_token_hash, status, created_by
  ) values (
    v_pairing.organization_id, v_pairing.location_id, v_pairing.device_name, p_device_token_hash, 'active', v_pairing.created_by
  ) returning id into v_device_id;

  -- Mark pairing code as used
  update public.kiosk_pairing_codes
  set used_at = now(), device_id = v_device_id
  where id = v_pairing.id;

  -- Insert audit event
  insert into public.audit_events (
    organization_id,
    location_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    after_state
  ) values (
    v_pairing.organization_id,
    v_pairing.location_id,
    v_pairing.created_by,
    'kiosk_device_paired',
    'kiosk_device',
    v_device_id::text,
    jsonb_build_object('name', v_pairing.device_name, 'location_id', v_pairing.location_id)
  );

  return jsonb_build_object(
    'success', true,
    'deviceId', v_device_id,
    'deviceName', v_pairing.device_name,
    'organizationId', v_org.id,
    'organizationName', v_org.name,
    'organizationSlug', v_org.slug,
    'locationId', v_loc.id,
    'locationName', v_loc.name,
    'timeZone', v_loc.time_zone
  );
end;
$$;

revoke all on function public.kiosk_consume_pairing_code(text, text) from public;
grant execute on function public.kiosk_consume_pairing_code(text, text) to anon, authenticated;

-- 6. RPC: Revoke Device (Manager Only)
create or replace function public.kiosk_revoke_device(
  p_device_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_device public.kiosk_devices%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_device from public.kiosk_devices where id = p_device_id for update;
  if not found or not private.kiosk_can_manage_location(v_device.location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if v_device.status = 'revoked' then
    return jsonb_build_object('success', true, 'deviceId', v_device.id, 'status', 'revoked', 'alreadyRevoked', true);
  end if;

  update public.kiosk_devices
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_uid,
      revocation_reason = v_reason,
      device_token_hash = null,
      credential_version = credential_version + 1,
      updated_at = now()
  where id = v_device.id;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id, before_state, after_state, reason
  ) values (
    v_device.organization_id, v_device.location_id, v_uid, 'kiosk_device_revoked', 'kiosk_device', v_device.id::text,
    jsonb_build_object('status', v_device.status), jsonb_build_object('status', 'revoked'), v_reason
  );

  return jsonb_build_object('success', true, 'deviceId', v_device.id, 'status', 'revoked');
end;
$$;

revoke all on function public.kiosk_revoke_device(uuid, text) from public, anon;
grant execute on function public.kiosk_revoke_device(uuid, text) to authenticated;

-- 7. RPC: Rename Device (Manager Only)
create or replace function public.kiosk_rename_device(
  p_device_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_device public.kiosk_devices%rowtype;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if v_name is null or length(v_name) < 1 or length(v_name) > 100 then
    raise exception 'Device name must be between 1 and 100 characters' using errcode = '22023';
  end if;

  select * into v_device from public.kiosk_devices where id = p_device_id for update;
  if not found or not private.kiosk_can_manage_location(v_device.location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  update public.kiosk_devices
  set name = v_name, updated_at = now()
  where id = v_device.id;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    v_device.organization_id, v_device.location_id, v_uid, 'kiosk_device_renamed', 'kiosk_device', v_device.id::text,
    jsonb_build_object('name', v_device.name), jsonb_build_object('name', v_name)
  );

  return jsonb_build_object('success', true, 'deviceId', v_device.id, 'name', v_name);
end;
$$;

revoke all on function public.kiosk_rename_device(uuid, text) from public, anon;
grant execute on function public.kiosk_rename_device(uuid, text) to authenticated;

-- 8. RPC: Reassign Device (Manager Only)
create or replace function public.kiosk_reassign_device(
  p_device_id uuid,
  p_new_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_device public.kiosk_devices%rowtype;
  v_new_loc public.locations%rowtype;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_device from public.kiosk_devices where id = p_device_id for update;
  if not found or not private.kiosk_can_manage_location(v_device.location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_new_loc from public.locations where id = p_new_location_id;
  if not found or v_new_loc.organization_id <> v_device.organization_id or not v_new_loc.active or v_new_loc.archived_at is not null then
    raise exception 'Invalid new location' using errcode = '22023';
  end if;

  if not private.kiosk_can_manage_location(p_new_location_id) then
    raise exception 'Unauthorized for new location' using errcode = '42501';
  end if;

  update public.kiosk_devices
  set location_id = p_new_location_id,
      device_token_hash = null,
      credential_version = credential_version + 1,
      status = 'active',
      updated_at = now()
  where id = v_device.id;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    v_device.organization_id, v_device.location_id, v_uid, 'kiosk_device_reassigned', 'kiosk_device', v_device.id::text,
    jsonb_build_object('location_id', v_device.location_id), jsonb_build_object('location_id', p_new_location_id)
  );

  return jsonb_build_object('success', true, 'deviceId', v_device.id, 'locationId', p_new_location_id);
end;
$$;

revoke all on function public.kiosk_reassign_device(uuid, uuid) from public, anon;
grant execute on function public.kiosk_reassign_device(uuid, uuid) to authenticated;
