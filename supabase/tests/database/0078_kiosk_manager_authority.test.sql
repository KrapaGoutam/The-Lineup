begin;

create extension if not exists pgtap with schema extensions;

select plan(105);

-- --------------------------------------------------------------------------
-- V2-008 B1 — Kiosk manager authority hardening (F-1) + location-scoped
-- manageable-location listing (D7). Companion to 0077.
--
-- Contract under test:
--   private.kiosk_can_manage_location(location)
--     * location must be active and not archived
--     * caller must hold a LIVE session (not banned, JWT session not revoked/expired)
--     * Overall owner / manager (membership-free)            -> allowed
--     * ACTIVE org owner / general_manager of the location's org -> allowed
--     * ACTIVE 'manager' location row AND ACTIVE membership in the location's org -> allowed
--     * assistant_manager / staff / inactive rows / stale rows / foreign org -> denied
--   public.kiosk_list_manageable_locations()  == the same predicate, minimal columns.
--
-- "Live session" is modelled with real auth.sessions rows and a real
-- `session_id` JWT claim (the same pathway auth.jwt() exposes to the other
-- *_live_session() helpers). Genuine GoTrue sign-out/ban propagation is proven
-- separately by tests/local/kiosk-authority.local.test.ts.
-- --------------------------------------------------------------------------

-- 1. Fixtures ---------------------------------------------------------------
-- 01 org A owner                      02 L1 manager (live)
-- 03 L1 manager, INACTIVE org member  04 L2 manager only
-- 05 L1 assistant manager             06 L1 staff
-- 07 INACTIVE L1 manager row          08 org B owner (foreign)
-- 09 Overall owner (no membership)    10 Overall manager (no membership)
-- 11 BANNED L1 manager                12 L1 manager row, NO org membership
-- 13 L1 manager row, active membership ONLY in org B (cross-org stale)
-- 14 org A general manager            15 org A owner, INACTIVE membership
-- 16 Overall assistant manager        17 BANNED Overall owner
-- 18 L1 manager (+ archived-L3 manager row)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000780' || lpad(n::text, 2, '0'))::uuid,
       'u78_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 18) n;

update auth.users
set banned_until = now() + interval '100 years'
where id in ('00000000-0000-0000-0000-000000078011', '00000000-0000-0000-0000-000000078017');

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000780' || lpad(n::text, 2, '0'))::uuid, 'User78 ' || n
from generate_series(1, 18) n;

insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-0000-0000-000000078009', 'owner'),
  ('00000000-0000-0000-0000-000000078010', 'manager'),
  ('00000000-0000-0000-0000-000000078016', 'assistant_manager'),
  ('00000000-0000-0000-0000-000000078017', 'owner');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000780a1', 'Org78 A', 'org-78-a', '00000000-0000-0000-0000-000000078001', '{}'),
  ('00000000-0000-0000-0000-0000000780a2', 'Org78 B', 'org-78-b', '00000000-0000-0000-0000-000000078008', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078003', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078006', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078007', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a2', '00000000-0000-0000-0000-000000078008', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078011', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a2', '00000000-0000-0000-0000-000000078013', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078014', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078015', array['owner']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-000000078018', array['server']::public.app_role[], true);

-- A1/A2 live; A3 archived; A4 inactive (not archived); B1 foreign live.
insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at) values
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-0000000780a1', 'A1', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000780b2', '00000000-0000-0000-0000-0000000780a1', 'A2', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000780b3', '00000000-0000-0000-0000-0000000780a1', 'A3 Archived', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000780b4', '00000000-0000-0000-0000-0000000780a1', 'A4 Inactive', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000780b5', '00000000-0000-0000-0000-0000000780a2', 'B1 Foreign', 'America/Chicago', '{}', true, null);

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078002', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078003', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b2', '00000000-0000-0000-0000-000000078004', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078005', 'assistant_manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078006', 'staff', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078007', 'manager', false),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078011', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078012', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078013', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-000000078018', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b3', '00000000-0000-0000-0000-000000078018', 'manager', true),
  ('00000000-0000-0000-0000-0000000780b4', '00000000-0000-0000-0000-000000078018', 'manager', true);

-- Membership rows cannot be created on a non-live location, so the stale rows
-- are created first and the locations are archived/deactivated afterwards
-- (the real-world sequence that leaves an active row behind).
update public.locations set active = false, archived_at = now() where id = '00000000-0000-0000-0000-0000000780b3';
update public.locations set active = false where id = '00000000-0000-0000-0000-0000000780b4';

-- Auth sessions: one live (no expiry), one expired, one belonging to another user.
insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  ('00000000-0000-0000-0000-0000000780f1', '00000000-0000-0000-0000-000000078002', now(), now(), null),
  ('00000000-0000-0000-0000-0000000780f2', '00000000-0000-0000-0000-000000078002', now(), now(), now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000780f3', '00000000-0000-0000-0000-000000078009', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000780f4', '00000000-0000-0000-0000-000000078011', now(), now(), null);

insert into public.kiosk_devices (id, organization_id, location_id, name, device_token_hash, status) values
  ('00000000-0000-0000-0000-0000000780d1', '00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-0000000780b1', 'A1 tablet', 'tok78_a1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000780d2', '00000000-0000-0000-0000-0000000780a1', '00000000-0000-0000-0000-0000000780b2', 'A2 tablet', 'tok78_a2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'),
  ('00000000-0000-0000-0000-0000000780d3', '00000000-0000-0000-0000-0000000780a2', '00000000-0000-0000-0000-0000000780b5', 'B1 tablet', 'tok78_b1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active');

-- Claim helper: full JSON claims, optional session_id claim. Clears the legacy
-- single-claim keys so auth.uid()/auth.jwt() read exactly what is set here.
create or replace function t78_as(p_uid uuid, p_sid uuid default null) returns void as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  if p_uid is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config(
      'request.jwt.claims',
      (jsonb_build_object('sub', p_uid, 'role', 'authenticated')
        || case when p_sid is null then '{}'::jsonb else jsonb_build_object('session_id', p_sid) end)::text,
      true
    );
  end if;
end;
$$ language plpgsql;

-- Listing set == predicate set over every location (drift guard).
create or replace function t78_listing_matches() returns boolean as $$
  select coalesce((select array_agg(l.id order by l.id)
                   from public.locations l
                   where l.active and l.archived_at is null
                     and private.kiosk_can_manage_location(l.id)), '{}'::uuid[])
       = coalesce((select array_agg(x.location_id order by x.location_id)
                   from public.kiosk_list_manageable_locations() x), '{}'::uuid[]);
$$ language sql;

-- 2. Predicate: existing higher-level authority is preserved ------------------
select t78_as('00000000-0000-0000-0000-000000078001');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'org owner: A1 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b2'), true,  'org owner: A2 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b5'), false, 'org owner: foreign B1 denied');

select t78_as('00000000-0000-0000-0000-000000078014');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'org general manager: A1 allowed');

select t78_as('00000000-0000-0000-0000-000000078009');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'Overall owner (no membership rows): A1 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b5'), true,  'Overall owner (no membership rows): foreign org B1 allowed');
select t78_as('00000000-0000-0000-0000-000000078009', '00000000-0000-0000-0000-0000000780f3');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'Overall owner with live session claim: allowed');

select t78_as('00000000-0000-0000-0000-000000078010');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b2'), true,  'Overall manager (no membership rows): allowed');

select t78_as('00000000-0000-0000-0000-000000078016');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'Overall assistant manager: denied (unchanged policy)');

-- 3. Predicate: active location manager, scoped to assigned location ----------
select t78_as('00000000-0000-0000-0000-000000078002');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'L1 manager: A1 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b2'), false, 'L1 manager: same-org A2 (no row) denied');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b5'), false, 'L1 manager: foreign org B1 denied');
select t78_as('00000000-0000-0000-0000-000000078004');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b2'), true,  'L2 manager: A2 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'L2 manager: A1 denied');

-- 4. Predicate: denied roles / states ----------------------------------------
select t78_as('00000000-0000-0000-0000-000000078005');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'assistant manager denied');
select t78_as('00000000-0000-0000-0000-000000078006');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'staff denied');
select t78_as('00000000-0000-0000-0000-000000078007');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'INACTIVE location manager row denied');
select t78_as('00000000-0000-0000-0000-000000078008');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'foreign org owner denied on A1');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b5'), true,  'foreign org owner allowed on own B1');
select t78_as('00000000-0000-0000-0000-000000078015');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'org owner with INACTIVE membership denied');

-- F-1: active location manager row without an active membership in the location's org.
select t78_as('00000000-0000-0000-0000-000000078003');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: location manager with INACTIVE org membership denied');
select t78_as('00000000-0000-0000-0000-000000078012');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: location manager row with NO org membership (stale/synthetic) denied');
select t78_as('00000000-0000-0000-0000-000000078013');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: location manager with active membership only in a DIFFERENT org denied');

-- Archived / inactive / unknown locations are never manageable, even by a row holder.
select t78_as('00000000-0000-0000-0000-000000078018');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'manager of A1 (+stale rows elsewhere): A1 allowed');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b3'), false, 'archived location denied despite active manager row');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b4'), false, 'inactive location denied despite active manager row');
select t78_as('00000000-0000-0000-0000-000000078001');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b3'), false, 'archived location denied for org owner');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780ff'), false, 'unknown location denied');
select is(private.kiosk_can_manage_location(null), false, 'null location denied');

-- Anonymous / no identity.
select t78_as(null);
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'anonymous / null uid denied');

-- 5. Predicate: live-session gate (F-1) ---------------------------------------
select t78_as('00000000-0000-0000-0000-000000078011');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: BANNED location manager denied (no session claim)');
select t78_as('00000000-0000-0000-0000-000000078011', '00000000-0000-0000-0000-0000000780f4');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: BANNED location manager denied even with a stored session row');
select t78_as('00000000-0000-0000-0000-000000078017');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: BANNED Overall owner denied');

select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780f1');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'live session (matching auth.sessions row): allowed');
select t78_as('00000000-0000-0000-0000-000000078002');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), true,  'JWT without session_id claim: allowed (shared *_live_session contract)');
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780ee');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: revoked / unknown session_id denied');
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780f2');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: expired session (not_after past) denied');
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780f3');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: session_id owned by a different user denied');
select t78_as('00000000-0000-0000-0000-000000078009', '00000000-0000-0000-0000-0000000780ee');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: Overall owner with revoked session denied');
select t78_as('00000000-0000-0000-0000-000000078001', '00000000-0000-0000-0000-0000000780ee');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000780b1'), false, 'F-1: org owner with revoked session denied');

-- 6. Listing RPC: contract, grants, shape --------------------------------------
select is(
  pg_get_function_result('public.kiosk_list_manageable_locations()'::regprocedure),
  'TABLE(location_id uuid, location_name text, organization_id uuid, organization_name text)',
  'listing returns only id/name columns (no address, hours, staff, module or device data)'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'kiosk_list_manageable_locations'),
  1, 'exactly one listing signature installed'
);
select is(has_function_privilege('anon', 'public.kiosk_list_manageable_locations()', 'execute'), false, 'listing: anon has no EXECUTE');
select is(has_function_privilege('authenticated', 'public.kiosk_list_manageable_locations()', 'execute'), true, 'listing: authenticated has EXECUTE');
select is(
  (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'public.kiosk_list_manageable_locations()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'listing: PUBLIC has no EXECUTE'
);
select is(has_function_privilege('authenticated', 'private.kiosk_live_session()', 'execute'), false, 'kiosk_live_session: not callable by authenticated');
select is(has_function_privilege('anon', 'private.kiosk_live_session()', 'execute'), false, 'kiosk_live_session: not callable by anon');
select is(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in ('public.kiosk_list_manageable_locations()'::regprocedure,
                   'private.kiosk_can_manage_location(uuid)'::regprocedure,
                   'private.kiosk_live_session()'::regprocedure)),
  true, 'SECURITY DEFINER functions pin search_path = ""'
);

set local role anon;
select throws_ok(
  $$ select * from public.kiosk_list_manageable_locations() $$,
  '42501', 'permission denied for function kiosk_list_manageable_locations',
  'anonymous role cannot call the listing RPC directly'
);
reset role;

-- 7. Listing RPC: results per actor (real authenticated role) -----------------
select t78_as('00000000-0000-0000-0000-000000078002');
set local role authenticated;
select is((select array_agg(location_id order by location_id) from public.kiosk_list_manageable_locations()),
          array['00000000-0000-0000-0000-0000000780b1']::uuid[], 'L1 manager lists exactly A1');
select is((select count(*)::int from public.kiosk_list_manageable_locations() where organization_id <> '00000000-0000-0000-0000-0000000780a1'), 0, 'L1 manager sees nothing from another organization');
select is((select organization_name || '/' || location_name from public.kiosk_list_manageable_locations()), 'Org78 A/A1', 'L1 manager listing carries correct org/location names');
reset role;

select t78_as('00000000-0000-0000-0000-000000078001');
set local role authenticated;
select is((select array_agg(location_id order by location_id) from public.kiosk_list_manageable_locations()),
          array['00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-0000000780b2']::uuid[],
          'org owner lists every ACTIVE org A location; no archived/inactive/foreign');
reset role;

select t78_as('00000000-0000-0000-0000-000000078009');
set local role authenticated;
select is((select array_agg(location_id order by location_id) from public.kiosk_list_manageable_locations()
           where location_id::text like '00000000-0000-0000-0000-0000000780b%'),
          array['00000000-0000-0000-0000-0000000780b1', '00000000-0000-0000-0000-0000000780b2', '00000000-0000-0000-0000-0000000780b5']::uuid[],
          'Overall owner (no membership rows) lists all active locations across orgs, excluding archived/inactive');
reset role;

select t78_as('00000000-0000-0000-0000-000000078004');
set local role authenticated;
select is((select array_agg(location_id) from public.kiosk_list_manageable_locations()),
          array['00000000-0000-0000-0000-0000000780b2']::uuid[], 'L2 manager lists exactly A2');
reset role;

select t78_as('00000000-0000-0000-0000-000000078018');
set local role authenticated;
select is((select array_agg(location_id) from public.kiosk_list_manageable_locations()),
          array['00000000-0000-0000-0000-0000000780b1']::uuid[], 'manager with stale archived/inactive rows lists only live A1');
reset role;

-- Every denied actor sees an empty listing.
select t78_as('00000000-0000-0000-0000-000000078005'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'assistant manager: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078006'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'staff: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078007'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'inactive location row: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078003'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'F-1: inactive org membership: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078012'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'F-1: no org membership: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078013'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'F-1: cross-org stale membership: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078011'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'F-1: banned manager: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780ee'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'F-1: revoked session: empty listing'); reset role;
select t78_as('00000000-0000-0000-0000-000000078008'); set local role authenticated;
select is((select array_agg(location_id) from public.kiosk_list_manageable_locations()),
          array['00000000-0000-0000-0000-0000000780b5']::uuid[], 'foreign org owner lists only its own B1'); reset role;
select t78_as('00000000-0000-0000-0000-000000078016'); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'Overall assistant manager: empty listing'); reset role;
select t78_as(null); set local role authenticated;
select is((select count(*)::int from public.kiosk_list_manageable_locations()), 0, 'null uid: empty listing'); reset role;

-- Property: listing set == predicate set for every actor profile.
select t78_as('00000000-0000-0000-0000-000000078001'); select ok(t78_listing_matches(), 'property: listing == predicate (org owner)');
select t78_as('00000000-0000-0000-0000-000000078002'); select ok(t78_listing_matches(), 'property: listing == predicate (L1 manager)');
select t78_as('00000000-0000-0000-0000-000000078004'); select ok(t78_listing_matches(), 'property: listing == predicate (L2 manager)');
select t78_as('00000000-0000-0000-0000-000000078009'); select ok(t78_listing_matches(), 'property: listing == predicate (Overall owner)');
select t78_as('00000000-0000-0000-0000-000000078005'); select ok(t78_listing_matches(), 'property: listing == predicate (assistant manager)');
select t78_as('00000000-0000-0000-0000-000000078003'); select ok(t78_listing_matches(), 'property: listing == predicate (inactive org member)');
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780ee'); select ok(t78_listing_matches(), 'property: listing == predicate (revoked session)');

-- 8. Every kiosk-management operation reached by the predicate ------------------
-- 8a. Cross-location: an L1 manager cannot touch A2 or foreign devices through any RPC/RLS path.
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780f1');
set local role authenticated;
select lives_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b1', 'L1 new tablet', 'hash78_l1_new_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, 'live L1 manager can generate a pairing code at A1');
select throws_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b2', 'x', 'hash78_l1_xloc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '42501', 'Unauthorized', 'L1 manager cannot generate a pairing code at A2');
select throws_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d2', 'hijack') $$, '42501', 'Unauthorized', 'L1 manager cannot rename an A2 device');
select throws_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000780d2', 'hijack') $$, '42501', 'Unauthorized', 'L1 manager cannot revoke an A2 device');
select throws_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d3', 'hijack') $$, '42501', 'Unauthorized', 'L1 manager cannot rename a foreign-org device');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000780d1', '00000000-0000-0000-0000-0000000780b2') $$, '42501', 'Unauthorized for new location', 'L1 manager cannot reassign an A1 device to the unmanaged A2');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000780d1', '00000000-0000-0000-0000-0000000780b5') $$, '22023', 'Invalid new location', 'L1 manager cannot reassign an A1 device into a foreign organization');
select lives_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d1', 'A1 tablet renamed') $$, 'live L1 manager can rename an A1 device');
select is((select array_agg(id order by id) from public.kiosk_devices), array['00000000-0000-0000-0000-0000000780d1']::uuid[], 'RLS: live L1 manager sees only the A1 device');
select is((select count(*)::int from public.kiosk_pairing_codes where location_id <> '00000000-0000-0000-0000-0000000780b1'), 0, 'RLS: live L1 manager sees no pairing codes outside A1');
reset role;

-- 8b. F-1 on every operation: inactive org membership, no membership, banned, revoked session.
select t78_as('00000000-0000-0000-0000-000000078003');
set local role authenticated;
select throws_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b1', 'f1', 'hash78_f1_inact_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '42501', 'Unauthorized', 'F-1: inactive-org manager cannot generate a pairing code');
select throws_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d1', 'f1') $$, '42501', 'Unauthorized', 'F-1: inactive-org manager cannot rename');
select throws_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000780d1', 'f1 reason') $$, '42501', 'Unauthorized', 'F-1: inactive-org manager cannot revoke');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000780d1', '00000000-0000-0000-0000-0000000780b1') $$, '42501', 'Unauthorized', 'F-1: inactive-org manager cannot reassign');
select is((select count(*)::int from public.kiosk_devices), 0, 'F-1 RLS: inactive-org manager reads no kiosk_devices');
select is((select count(*)::int from public.kiosk_pairing_codes), 0, 'F-1 RLS: inactive-org manager reads no pairing codes');
reset role;

select t78_as('00000000-0000-0000-0000-000000078012');
set local role authenticated;
select throws_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b1', 'f1', 'hash78_f1_nomem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '42501', 'Unauthorized', 'F-1: manager row with no org membership cannot generate a pairing code');

reset role;
select t78_as('00000000-0000-0000-0000-000000078011');
set local role authenticated;
select throws_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000780d1', 'f1 banned') $$, '42501', 'Unauthorized', 'F-1: banned manager cannot revoke');
select is((select count(*)::int from public.kiosk_devices), 0, 'F-1 RLS: banned manager reads no kiosk_devices');
reset role;

reset role;
select t78_as('00000000-0000-0000-0000-000000078002', '00000000-0000-0000-0000-0000000780ee');
set local role authenticated;
select throws_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b1', 'f1', 'hash78_f1_revok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '42501', 'Unauthorized', 'F-1: revoked session cannot generate a pairing code');
select throws_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d1', 'f1') $$, '42501', 'Unauthorized', 'F-1: revoked session cannot rename');
select throws_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000780d1', '00000000-0000-0000-0000-0000000780b1') $$, '42501', 'Unauthorized', 'F-1: revoked session cannot reassign');
select is((select count(*)::int from public.kiosk_devices), 0, 'F-1 RLS: revoked session reads no kiosk_devices');
select is((select count(*)::int from public.kiosk_pairing_codes), 0, 'F-1 RLS: revoked session reads no pairing codes');
reset role;

-- Device state untouched by every denied attempt above.
select is((select name || '/' || status from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000780d1'), 'A1 tablet renamed/active', 'denied attempts left the A1 device unchanged');
select is((select name || '/' || status from public.kiosk_devices where id = '00000000-0000-0000-0000-0000000780d2'), 'A2 tablet/active', 'denied attempts left the A2 device unchanged');

-- 8c. Preserved authority: org owner and Overall owner still operate on any in-org location.
select t78_as('00000000-0000-0000-0000-000000078001');
set local role authenticated;
select lives_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d2', 'A2 by owner') $$, 'org owner can still rename an A2 device');
reset role;
select t78_as('00000000-0000-0000-0000-000000078009', '00000000-0000-0000-0000-0000000780f3');
set local role authenticated;
select lives_ok($$ select public.kiosk_rename_device('00000000-0000-0000-0000-0000000780d3', 'B1 by overall') $$, 'membership-free Overall owner can still manage a foreign-org device');
select lives_ok($$ select public.kiosk_reassign_device('00000000-0000-0000-0000-0000000780d2', '00000000-0000-0000-0000-0000000780b1') $$, 'Overall owner can still reassign within an organization');
reset role;

-- 8d. Anonymous direct RPC calls are denied by privilege, not only by logic.
set local role anon;
select throws_ok($$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000780b1', 'anon', 'hash78_anon_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '42501', 'permission denied for function kiosk_generate_pairing_code', 'anon cannot call generate pairing code');
select throws_ok($$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000780d1', 'anon reason') $$, '42501', 'permission denied for function kiosk_revoke_device', 'anon cannot call revoke');
reset role;

select * from finish();
rollback;
