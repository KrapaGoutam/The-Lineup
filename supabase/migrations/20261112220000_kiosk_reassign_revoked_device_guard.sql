-- Feature V2-008 Security Gate S1: U-1 - a revoked kiosk device must stay revoked.
-- Migration: 20261112220000_kiosk_reassign_revoked_device_guard.sql
--
-- Forward-only. Replaces public.kiosk_reassign_device (same signature, so the
-- existing EXECUTE grants, the Server Action and the 0077/0078 contracts keep
-- working). No table, policy, trigger, index or other function is touched.
--
-- Defect (pre-existing since 20261111120000; V2-007 independent review L1):
-- kiosk_reassign_device never looked at the device status and wrote
-- status = 'active' unconditionally. Revoking a tablet and then reassigning it
-- (a stale tab, a second manager, or a direct RPC call) flipped the row
-- revoked -> active, left revoked_at / revoked_by / revocation_reason populated
-- on an "active" row, bumped credential_version a second time, and the audit
-- trail only showed 'kiosk_device_reassigned'. The token hash is nulled in the
-- same statement so the row could not authenticate, but the state machine and
-- the audit trail were wrong, and any future code that attaches a token to an
-- "active" row would have silently resurrected a revoked device.
--
-- Fail-closed policy implemented here:
--   * Revocation is terminal for the device ROW. The only way to bring a
--     physical tablet back is a NEW pairing code, which creates a NEW row via
--     kiosk_consume_pairing_code (unchanged). Nothing here restores credential
--     validity or creates a second activation path.
--   * Reassigning a revoked device is refused with SQLSTATE 55000
--     (object_not_in_prerequisite_state). The refusal happens AFTER the
--     authority check, so an unauthorized caller still receives the plain
--     'Unauthorized' error and learns nothing about device state.
--   * The UPDATE no longer assigns status at all: reassignment can only be
--     reached for an 'active' row (the check above, under the row lock taken by
--     SELECT ... FOR UPDATE, also serialises against a concurrent revoke).
--   * The audit row now records status and credential_version before/after so
--     a reassignment is distinguishable in the trail from any state change.
-- Active-device reassignment (location move, credential rotation, session
-- purge, same-organization and destination-authority checks) is unchanged.

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
  v_new_version integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_device from public.kiosk_devices where id = p_device_id for update;
  if not found or not private.kiosk_can_manage_location(v_device.location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- U-1: revocation is terminal for this row. Checked only after authority so
  -- the device state is never disclosed to a caller who may not manage it.
  if v_device.status is distinct from 'active' then
    raise exception 'Revoked devices cannot be reassigned. Pair the tablet again with a new pairing code.'
      using errcode = '55000';
  end if;

  select * into v_new_loc from public.locations where id = p_new_location_id;
  if not found or v_new_loc.organization_id <> v_device.organization_id or not v_new_loc.active or v_new_loc.archived_at is not null then
    raise exception 'Invalid new location' using errcode = '22023';
  end if;

  if not private.kiosk_can_manage_location(p_new_location_id) then
    raise exception 'Unauthorized for new location' using errcode = '42501';
  end if;

  -- Invalidate all active kiosk sessions for this device immediately on location transfer
  delete from public.kiosk_sessions where device_id = v_device.id;

  -- status is deliberately NOT assigned: this statement is only reachable for an
  -- 'active' device and must never change lifecycle state.
  update public.kiosk_devices
  set location_id = p_new_location_id,
      device_token_hash = null,
      credential_version = credential_version + 1,
      updated_at = now()
  where id = v_device.id
  returning credential_version into v_new_version;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    v_device.organization_id, v_device.location_id, v_uid, 'kiosk_device_reassigned', 'kiosk_device', v_device.id::text,
    jsonb_build_object(
      'location_id', v_device.location_id,
      'status', v_device.status,
      'credential_version', v_device.credential_version
    ),
    jsonb_build_object(
      'location_id', p_new_location_id,
      'status', v_device.status,
      'credential_version', v_new_version
    )
  );

  return jsonb_build_object('success', true, 'deviceId', v_device.id, 'locationId', p_new_location_id);
end;
$$;

revoke all on function public.kiosk_reassign_device(uuid, uuid) from public, anon;
grant execute on function public.kiosk_reassign_device(uuid, uuid) to authenticated;

comment on function public.kiosk_reassign_device(uuid, uuid) is
  'V2-008 S1/U-1. Moves an ACTIVE kiosk device to another manageable location of the same organization, rotating its credential and purging its sessions. Refuses revoked devices (55000); recovery of a revoked tablet requires a new pairing code.';
