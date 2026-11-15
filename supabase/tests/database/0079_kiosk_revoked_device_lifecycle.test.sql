begin;

create extension if not exists pgtap with schema extensions;

select plan(69);

-- --------------------------------------------------------------------------
-- V2-008 Security Gate S1 - U-1: a revoked kiosk device must stay revoked.
--
-- Defect under test (pre-existing since 20261111120000, V2-007 review L1):
--   public.kiosk_reassign_device set status = 'active' unconditionally, so
--   revoking then reassigning a device flipped it revoked -> active and the
--   audit trail only showed 'kiosk_device_reassigned'.
--
-- Contract under test (fail-closed state machine):
--   * revocation is terminal for the device ROW; the only way back is a NEW
--     pairing code, which creates a NEW device row (kiosk_consume_pairing_code);
--   * kiosk_reassign_device refuses a revoked device with SQLSTATE 55000
--     (object_not_in_prerequisite_state) AFTER the authority check, so an
--     unauthorized caller still gets a plain 'Unauthorized' (no status oracle);
--   * a refused reassignment leaves device, credential_version, revocation
--     columns, sessions and audit exactly as they were;
--   * legitimate reassignment of an ACTIVE device is unchanged and its audit
--     row now carries status and credential_version before/after.
-- Every actor below goes through the real RPCs under the authenticated role
-- with a real session_id claim; nothing is mocked. Whole file rolls back.
-- --------------------------------------------------------------------------

-- 1. Fixtures ---------------------------------------------------------------
-- 01 org A owner            02 A1 manager            03 A1 staff
-- 04 A1 manager, INACTIVE org member                 05 A2-only manager
-- 06 org B owner (foreign)  07 Overall owner         08 (unused)
-- 09 manager of A1 AND A2   10 Overall manager       11 A1 assistant manager
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000790' || lpad(n::text, 2, '0'))::uuid,
       'u79_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 11) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000790' || lpad(n::text, 2, '0'))::uuid, 'User79 ' || n
from generate_series(1, 11) n;

insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-0000-0000-000000079007', 'owner'),
  ('00000000-0000-0000-0000-000000079010', 'manager');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000790a1', 'Org79 A', 'org-79-a', '00000000-0000-0000-0000-000000079001', '{}'),
  ('00000000-0000-0000-0000-0000000790a2', 'Org79 B', 'org-79-b', '00000000-0000-0000-0000-000000079006', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079004', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a2', '00000000-0000-0000-0000-000000079006', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079009', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-000000079011', array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at) values
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-0000000790a1', 'A1', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000790b2', '00000000-0000-0000-0000-0000000790a1', 'A2', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000790b3', '00000000-0000-0000-0000-0000000790a2', 'B1 Foreign', 'America/Chicago', '{}', true, null);

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-000000079002', 'manager', true),
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-000000079003', 'staff', true),
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-000000079004', 'manager', true),
  ('00000000-0000-0000-0000-0000000790b2', '00000000-0000-0000-0000-000000079005', 'manager', true),
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-000000079009', 'manager', true),
  ('00000000-0000-0000-0000-0000000790b2', '00000000-0000-0000-0000-000000079009', 'manager', true),
  ('00000000-0000-0000-0000-0000000790b1', '00000000-0000-0000-0000-000000079011', 'assistant_manager', true);

-- Live sessions (one per actor); the 'ee' session id has NO auth.sessions row
-- (a signed-out session whose access token is still cryptographically valid).
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
select ('00000000-0000-0000-0000-0000000790f' || to_hex(n))::uuid,
       ('00000000-0000-0000-0000-0000000790' || lpad(n::text, 2, '0'))::uuid, now(), now(), null
from generate_series(1, 11) n
where n <> 8;
-- session id for user NN is 0000...0790f<hex NN>; ee is deliberately absent.

-- d1 active A1 (session)            d2 active A1 -> REVOKED (had a session)
-- d3 active A1 (session) positive   d4 active A1 (session) positive
-- d5 active B1 foreign -> REVOKED   d6 active A2 -> REVOKED
insert into public.kiosk_devices (id, organization_id, location_id, name, device_token_hash, status) values
  ('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-0000000790b1', 'D1 active', 'tok79_d1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-0000000790b1', 'D2 to revoke', 'tok79_d2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000790d3', '00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-0000000790b1', 'D3 owner moves', 'tok79_d3_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000790d4', '00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-0000000790b1', 'D4 manager moves', 'tok79_d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000790d5', '00000000-0000-0000-0000-0000000790a2', '00000000-0000-0000-0000-0000000790b3', 'D5 foreign', 'tok79_d5_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000790d6', '00000000-0000-0000-0000-0000000790a1', '00000000-0000-0000-0000-0000000790b2', 'D6 A2 device', 'tok79_d6_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active');

insert into public.kiosk_sessions (session_token_hash, device_id, organization_id, location_id, profile_id, display_name, encrypted_access_token, expires_at)
select 'kst79_' || right(d.id::text, 2), d.id, d.organization_id, d.location_id,
       '00000000-0000-0000-0000-000000079003', 'Staff 79', 'enc', now() + interval '3 minutes'
from public.kiosk_devices d
where d.id in ('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790d2',
               '00000000-0000-0000-0000-0000000790d3', '00000000-0000-0000-0000-0000000790d4');

create or replace function t79_as(p_uid uuid, p_sid uuid default null) returns void as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_uid, 'role', 'authenticated')
      || case when p_sid is null then '{}'::jsonb else jsonb_build_object('session_id', p_sid) end)::text,
    true
  );
end;
$$ language plpgsql;

-- Baseline credential versions (monotonic-version guard at the end).
create temp table cv_base as
select id, credential_version from public.kiosk_devices;

-- 2. Revoke through the real RPC as each in-scope authority ------------------
select t79_as('00000000-0000-0000-0000-000000079001', '00000000-0000-0000-0000-0000000790f1');
set local role authenticated;
select lives_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000790d2', 'lost tablet') $$, 'org A owner revokes D2');
select lives_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000790d6', 'decommissioned') $$, 'org A owner revokes D6 (A2 device)');
reset role;
select t79_as('00000000-0000-0000-0000-000000079006', '00000000-0000-0000-0000-0000000790f6');
set local role authenticated;
select lives_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000790d5', 'foreign tablet lost') $$, 'org B owner revokes D5');
reset role;

select is((select status || '/' || coalesce(device_token_hash, 'NULL') || '/' || credential_version from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), 'revoked/NULL/2', 'baseline: D2 is revoked, token cleared, credential_version 2');
select is((select count(*)::int from public.kiosk_sessions where device_id = '00000000-0000-0000-0000-0000000790d2'), 0, 'baseline: revoke removed the D2 kiosk session');
select is((select count(*)::int from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d2' and action = 'kiosk_device_revoked'), 1, 'baseline: exactly one revocation audit row for D2');

-- Frozen snapshot of the three revoked devices (everything except updated_at).
create temp table rev_snap as
select id, organization_id, location_id, name, device_token_hash, status, credential_version,
       revoked_by, revocation_reason, revoked_at, created_by
from public.kiosk_devices
where id in ('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790d5', '00000000-0000-0000-0000-0000000790d6');
create temp table audit_snap as
select entity_id, count(*)::int as n from public.audit_events
where entity_id in ('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790d5', '00000000-0000-0000-0000-0000000790d6')
group by entity_id;

-- 3. U-1 core: the authorized org owner cannot reactivate a revoked device ------
select t79_as('00000000-0000-0000-0000-000000079001', '00000000-0000-0000-0000-0000000790f1');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$,
  '55000', 'Revoked devices cannot be reassigned. Pair the tablet again with a new pairing code.',
  'U-1: org owner cannot reassign a revoked device to another location');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b1') $$,
  '55000', 'Revoked devices cannot be reassigned. Pair the tablet again with a new pairing code.',
  'U-1: reassigning a revoked device to its OWN location is refused too');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d6', '00000000-0000-0000-0000-0000000790b1') $$,
  '55000', 'Revoked devices cannot be reassigned. Pair the tablet again with a new pairing code.',
  'U-1: a revoked device at another location of the same org is refused');
reset role;

select is((select count(*)::int from rev_snap s join public.kiosk_devices d using (id)
           where d.status is distinct from s.status or d.location_id is distinct from s.location_id
              or d.organization_id is distinct from s.organization_id or d.device_token_hash is distinct from s.device_token_hash
              or d.credential_version is distinct from s.credential_version or d.revoked_by is distinct from s.revoked_by
              or d.revocation_reason is distinct from s.revocation_reason or d.revoked_at is distinct from s.revoked_at
              or d.name is distinct from s.name), 0,
  'U-1: every revoked device row is bit-for-bit unchanged after refused reassignments');
select is((select status from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), 'revoked', 'U-1: D2 is still revoked');
select is((select credential_version from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), 2, 'U-1: D2 credential_version was not incremented or decremented');
select is((select device_token_hash from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), null, 'U-1: D2 still has no credential');
select is((select location_id from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), '00000000-0000-0000-0000-0000000790b1'::uuid, 'U-1: D2 did not move to another location');
select is((select count(*)::int from public.kiosk_sessions where device_id = '00000000-0000-0000-0000-0000000790d2'), 0, 'U-1: no session exists for the revoked device');
select is((select count(*)::int from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d2' and action = 'kiosk_device_reassigned'), 0, 'U-1: no reassignment audit row was written for the revoked device');
select is((select count(*)::int from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d2' and action = 'kiosk_device_revoked'), 1, 'U-1: the revocation audit row is preserved');
select is((select count(*)::int from public.kiosk_devices where device_token_hash = 'tok79_d2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and status = 'active'), 0, 'U-1: the old D2 credential matches no active device (stale cookie hash)');

-- 4. Other authorized actors cannot bypass the state rule -----------------------
select t79_as('00000000-0000-0000-0000-000000079002', '00000000-0000-0000-0000-0000000790f2');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b1') $$,
  '55000', null, 'authorized A1 location manager cannot reassign the revoked A1 device');
reset role;
select t79_as('00000000-0000-0000-0000-000000079009', '00000000-0000-0000-0000-0000000790f9');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$,
  '55000', null, 'A1+A2 location manager cannot move a revoked device between two managed locations');
reset role;
select t79_as('00000000-0000-0000-0000-000000079007', '00000000-0000-0000-0000-0000000790f7');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$,
  '55000', null, 'membership-free Overall owner cannot reassign a revoked device');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d5', '00000000-0000-0000-0000-0000000790b3') $$,
  '55000', null, 'Overall owner cannot reassign a revoked foreign-org device either');
reset role;
select t79_as('00000000-0000-0000-0000-000000079010', '00000000-0000-0000-0000-0000000790fa');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$,
  '55000', null, 'Overall manager cannot reassign a revoked device');
reset role;

-- 5. Unauthorized actors get 'Unauthorized' (42501), never a status oracle -----
select t79_as('00000000-0000-0000-0000-000000079003', '00000000-0000-0000-0000-0000000790f3');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'staff: Unauthorized on a revoked device (no state leak)');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'staff: Unauthorized on an active device');
reset role;
select t79_as('00000000-0000-0000-0000-000000079011', '00000000-0000-0000-0000-0000000790fb');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'assistant manager: Unauthorized on a revoked device');
reset role;
select t79_as('00000000-0000-0000-0000-000000079004', '00000000-0000-0000-0000-0000000790f4');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'inactive-org-member manager: Unauthorized on a revoked device');
reset role;
select t79_as('00000000-0000-0000-0000-000000079005', '00000000-0000-0000-0000-0000000790f5');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'A2-only manager: Unauthorized on a revoked A1 device (cross-location)');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'A2-only manager: Unauthorized on an active A1 device (cross-location)');
reset role;
select t79_as('00000000-0000-0000-0000-000000079002', '00000000-0000-0000-0000-0000000790f2');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d6', '00000000-0000-0000-0000-0000000790b1') $$, '42501', 'Unauthorized', 'A1 manager: Unauthorized on a revoked A2 device (cross-location)');
reset role;
select t79_as('00000000-0000-0000-0000-000000079006', '00000000-0000-0000-0000-0000000790f6');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'org B owner: Unauthorized on an org A revoked device (cross-tenant)');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'Unauthorized', 'org B owner: Unauthorized on an org A active device (cross-tenant)');
reset role;
select t79_as('00000000-0000-0000-0000-000000079001', '00000000-0000-0000-0000-0000000790f1');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d5', '00000000-0000-0000-0000-0000000790b3') $$, '42501', 'Unauthorized', 'org A owner: Unauthorized on a revoked org B device (cross-tenant)');
reset role;
select t79_as('00000000-0000-0000-0000-000000079002', '00000000-0000-0000-0000-0000000790ee');
set local role authenticated;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b1') $$, '42501', 'Unauthorized', 'manager with a signed-out session: Unauthorized on a revoked device');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d1', '00000000-0000-0000-0000-0000000790b1') $$, '42501', 'Unauthorized', 'manager with a signed-out session: Unauthorized on an active device');
reset role;
set local role anon;
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d2', '00000000-0000-0000-0000-0000000790b2') $$, '42501', 'permission denied for function kiosk_reassign_device', 'anon cannot call kiosk_reassign_device');
reset role;

-- 6. Refusals have no side effects ----------------------------------------------
select is((select count(*)::int from rev_snap s join public.kiosk_devices d using (id)
           where d.status is distinct from s.status or d.location_id is distinct from s.location_id
              or d.device_token_hash is distinct from s.device_token_hash or d.credential_version is distinct from s.credential_version
              or d.revoked_by is distinct from s.revoked_by or d.revoked_at is distinct from s.revoked_at), 0,
  'after every refusal (state + authority) all three revoked devices are unchanged');
select is((select count(*)::int from audit_snap a join (select entity_id, count(*)::int n from public.audit_events group by entity_id) c using (entity_id) where c.n <> a.n), 0,
  'after every refusal no audit rows were added for the revoked devices');
select is((select status || '/' || location_id || '/' || credential_version || '/' || (device_token_hash is not null)::text from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d1'),
  'active/00000000-0000-0000-0000-0000000790b1/1/true', 'denied attempts left active D1 untouched (location, version, credential)');
select is((select count(*)::int from public.kiosk_sessions where device_id = '00000000-0000-0000-0000-0000000790d1'), 1, 'denied attempts did not delete D1''s kiosk session');

-- 7. Legitimate reassignment of an ACTIVE device is preserved -------------------
select t79_as('00000000-0000-0000-0000-000000079001', '00000000-0000-0000-0000-0000000790f1');
set local role authenticated;
select lives_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d3', '00000000-0000-0000-0000-0000000790b2') $$, 'org owner reassigns active D3 from A1 to A2');
reset role;
select is((select location_id || '/' || organization_id || '/' || status from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d3'),
  '00000000-0000-0000-0000-0000000790b2/00000000-0000-0000-0000-0000000790a1/active', 'D3 is bound to A2 in the same organization and stays active');
select is((select device_token_hash from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d3'), null, 'D3 credential is rotated out (device must re-pair)');
select is((select credential_version from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d3'), 2, 'D3 credential_version incremented 1 -> 2');
select is((select count(*)::int from public.kiosk_sessions where device_id = '00000000-0000-0000-0000-0000000790d3'), 0, 'D3 kiosk session invalidated by the move');
select is((select count(*)::int from public.kiosk_devices where device_token_hash = 'tok79_d3_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and status = 'active'), 0, 'D3 old credential no longer matches any device');
select is((select actor_profile_id from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d3' and action = 'kiosk_device_reassigned'),
  '00000000-0000-0000-0000-000000079001'::uuid, 'D3 reassignment audit carries the authoritative actor');
select is((select (before_state->>'location_id') || '>' || (after_state->>'location_id') from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d3' and action = 'kiosk_device_reassigned'),
  '00000000-0000-0000-0000-0000000790b1>00000000-0000-0000-0000-0000000790b2', 'D3 audit records the location move');
select is((select (before_state->>'status') || '>' || (after_state->>'status') from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d3' and action = 'kiosk_device_reassigned'),
  'active>active', 'D3 audit records the (unchanged) device status');
select is((select (before_state->>'credential_version') || '>' || (after_state->>'credential_version') from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d3' and action = 'kiosk_device_reassigned'),
  '1>2', 'D3 audit records the credential_version rotation');

select t79_as('00000000-0000-0000-0000-000000079009', '00000000-0000-0000-0000-0000000790f9');
set local role authenticated;
select lives_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d4', '00000000-0000-0000-0000-0000000790b2') $$, 'A1+A2 location manager moves active D4 between two managed locations');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d4', '00000000-0000-0000-0000-0000000790b3') $$, '22023', 'Invalid new location', 'cross-organization destination is still refused');
reset role;
select is((select actor_profile_id from public.audit_events where entity_id = '00000000-0000-0000-0000-0000000790d4' and action = 'kiosk_device_reassigned'),
  '00000000-0000-0000-0000-000000079009'::uuid, 'D4 reassignment audit carries the location manager as actor');

-- A device revoked AFTER an earlier legitimate move still cannot come back.
select t79_as('00000000-0000-0000-0000-000000079001', '00000000-0000-0000-0000-0000000790f1');
set local role authenticated;
select lives_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000790d3', 'moved then lost') $$, 'D3 (already moved once) is revoked');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000790d3', '00000000-0000-0000-0000-0000000790b1') $$, '55000', null, 'moved-then-revoked D3 cannot be reassigned back to active');
reset role;
select is((select status || '/' || credential_version from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d3'), 'revoked/3', 'moved-then-revoked D3 stays revoked at credential_version 3');

-- 8. Recovery = a NEW pairing, never the old row ---------------------------------
select t79_as('00000000-0000-0000-0000-000000079002', '00000000-0000-0000-0000-0000000790f2');
set local role authenticated;
select lives_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000790b1', 'Replacement tablet', 'code79_recovery_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, 'A1 manager issues a new pairing code for the replacement tablet');
reset role;
set local role service_role;
select is((select (public.kiosk_consume_pairing_code('code79_recovery_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'tok79_new_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'client79'))->>'success'), 'true', 'the new pairing code is consumed (service role only)');
reset role;
select is((select count(*)::int from public.kiosk_devices where device_token_hash = 'tok79_new_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and status = 'active' and credential_version = 1
           and id <> '00000000-0000-0000-0000-0000000790d2' and location_id = '00000000-0000-0000-0000-0000000790b1' and organization_id = '00000000-0000-0000-0000-0000000790a1'), 1,
  'recovery created a NEW active device row bound to the right organization and location');
select is((select status || '/' || coalesce(device_token_hash, 'NULL') from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000790d2'), 'revoked/NULL', 'the old revoked row is still revoked with no credential after recovery');
select is((select count(*)::int from public.kiosk_devices where device_token_hash = 'tok79_d2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and status = 'active'), 0, 'the old revoked credential still authenticates nothing after recovery');
select is((select count(*)::int from public.audit_events where action = 'kiosk_device_paired' and actor_profile_id = '00000000-0000-0000-0000-000000079002'
           and entity_id = (select id::text from public.kiosk_devices where device_token_hash = 'tok79_new_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')), 1, 'the recovery pairing is audited against the issuing manager');

-- 9. Function contract is intact (ownership, definer, search_path, grants) ----------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'kiosk_reassign_device'), 1, 'exactly one kiosk_reassign_device overload exists');
select is((select p.prosecdef from pg_proc p where p.oid = 'public.kiosk_reassign_device(uuid, uuid)'::regprocedure), true, 'kiosk_reassign_device remains SECURITY DEFINER');
select is((select p.proconfig from pg_proc p where p.oid = 'public.kiosk_reassign_device(uuid, uuid)'::regprocedure), array['search_path=""']::text[], 'kiosk_reassign_device keeps an empty search_path');
select is(has_function_privilege('anon', 'public.kiosk_reassign_device(uuid, uuid)', 'execute'), false, 'anon has no EXECUTE');
select is(has_function_privilege('authenticated', 'public.kiosk_reassign_device(uuid, uuid)', 'execute'), true, 'authenticated keeps EXECUTE');
select is((select count(*)::int from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'kiosk_reassign_device' and grantee = 'PUBLIC'), 0, 'PUBLIC has no EXECUTE');

-- 10. Credential versions never go backwards, on any device ------------------------
select is((select count(*)::int from cv_base b join public.kiosk_devices d using (id) where d.credential_version < b.credential_version), 0, 'no operation in this file decremented a credential_version');

select * from finish();
rollback;
