begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000024001', '0240-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024002', '0240-mia@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024003', '0240-leo@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000024004', '0240-ava@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000024001', 'PGTAP 0240 Owner'),
  ('00000000-0000-0000-0000-000000024002', 'PGTAP 0240 Mia'),
  ('00000000-0000-0000-0000-000000024003', 'PGTAP 0240 Leo'),
  ('00000000-0000-0000-0000-000000024004', 'PGTAP 0240 Ava');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000024011', 'PGTAP 0240 Org', 'pgtap-0240-org', '00000000-0000-0000-0000-000000024001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000024021', '00000000-0000-0000-0000-000000024011', 'PGTAP 0240 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000024011', '00000000-0000-0000-0000-000000024001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024011', '00000000-0000-0000-0000-000000024002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024011', '00000000-0000-0000-0000-000000024003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000024011', '00000000-0000-0000-0000-000000024004', array['server']::public.app_role[], true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000024001', true);

-- ---------------------------------------------------------------------
-- Old 5-arg signature (client-supplied p_position) is gone; the new
-- 4-arg signature (server-computed position) is what PostgREST/the
-- client actually calls now.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'board_add_column'
     and pg_get_function_identity_arguments(oid) = 'p_organization_id uuid, p_location_id uuid, p_service_date date, p_server_profile_id uuid, p_position integer'),
  0,
  'the old client-supplied-position board_add_column overload no longer exists'
);
select is(
  (select count(*)::int from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'board_add_column'
     and pg_get_function_identity_arguments(oid) = 'p_organization_id uuid, p_location_id uuid, p_service_date date, p_server_profile_id uuid'),
  1,
  'the new server-computed-position board_add_column overload exists'
);

-- First add for a brand-new session: position starts at 0 (coalesce(max,-1)+1).
select public.board_add_column('00000000-0000-0000-0000-000000024011'::uuid, '00000000-0000-0000-0000-000000024021'::uuid, current_date, '00000000-0000-0000-0000-000000024002'::uuid);
select is(
  (select position from public.rotation_members where organization_id = '00000000-0000-0000-0000-000000024011' and server_profile_id = '00000000-0000-0000-0000-000000024002'),
  0,
  'the first member added to a fresh session gets position 0'
);

-- Second add lands on the next position, no collision.
select public.board_add_column('00000000-0000-0000-0000-000000024011'::uuid, '00000000-0000-0000-0000-000000024021'::uuid, current_date, '00000000-0000-0000-0000-000000024003'::uuid);
select is(
  (select position from public.rotation_members where organization_id = '00000000-0000-0000-0000-000000024011' and server_profile_id = '00000000-0000-0000-0000-000000024003'),
  1,
  'a second member added to the same session gets the next position, sequentially'
);

-- Removing Leo (status -> unavailable) never changes his stored
-- position or frees it for reuse -- see board_set_column_status.
select public.board_set_column_status(
  '00000000-0000-0000-0000-000000024011'::uuid,
  (select service_session_id from public.rotation_members where server_profile_id = '00000000-0000-0000-0000-000000024003'),
  (select id from public.rotation_members where server_profile_id = '00000000-0000-0000-0000-000000024003'),
  'removed'
);

-- A third, brand-new member still gets max(position)+1 = 2, not the
-- just-vacated 1 -- positions are never compacted/reused.
select public.board_add_column('00000000-0000-0000-0000-000000024011'::uuid, '00000000-0000-0000-0000-000000024021'::uuid, current_date, '00000000-0000-0000-0000-000000024004'::uuid);
select is(
  (select position from public.rotation_members where organization_id = '00000000-0000-0000-0000-000000024011' and server_profile_id = '00000000-0000-0000-0000-000000024004'),
  2,
  'a new member added after a removal still gets max(position)+1, never reusing a vacated position'
);

-- Re-adding (reactivating) a previously removed member keeps their
-- OWN original position -- the on-conflict path never touches
-- v_next_position for this branch.
select public.board_add_column('00000000-0000-0000-0000-000000024011'::uuid, '00000000-0000-0000-0000-000000024021'::uuid, current_date, '00000000-0000-0000-0000-000000024003'::uuid);
select is(
  (select position from public.rotation_members where organization_id = '00000000-0000-0000-0000-000000024011' and server_profile_id = '00000000-0000-0000-0000-000000024003'),
  1,
  'reactivating a previously removed member keeps their original position unchanged'
);
select is(
  (select status::text from public.rotation_members where organization_id = '00000000-0000-0000-0000-000000024011' and server_profile_id = '00000000-0000-0000-0000-000000024003'),
  'active',
  'reactivating a previously removed member sets status back to active'
);

-- The unique (service_session_id, position) constraint is still fully
-- enforced -- this migration made position assignment safe, it did not
-- weaken or drop the invariant it protects. It's DEFERRABLE INITIALLY
-- DEFERRED (see 20260906140000, for board_move_column's same-
-- transaction swap), so it only raises at COMMIT/SET CONSTRAINTS
-- IMMEDIATE, not on the INSERT statement itself -- force immediate
-- checking here to observe the same violation a real (non-deferred-
-- transaction) client call would see.
select lives_ok(
  format(
    $sql$insert into public.rotation_members (organization_id, service_session_id, server_profile_id, position)
         values ('00000000-0000-0000-0000-000000024011', %L, '00000000-0000-0000-0000-000000024001', 0)$sql$,
    (select service_session_id from public.rotation_members where server_profile_id = '00000000-0000-0000-0000-000000024002')
  ),
  'the duplicate-position insert itself does not raise yet -- the constraint is deferred'
);
select throws_ok(
  $sql$set constraints public.rotation_members_service_session_id_position_key immediate$sql$,
  '23505',
  null,
  'the unique (service_session_id, position) constraint still rejects the duplicate once checked'
);

-- get_or_create_active_session still returns the same, single session
-- id on repeated calls (its own unique_violation retry path is only
-- reachable under true cross-connection concurrency, not testable
-- within one pgTAP transaction -- covered instead by the local two-
-- session manual/Playwright validation recorded in IMPLEMENTATION_LOG.md).
select is(
  private.get_or_create_active_session('00000000-0000-0000-0000-000000024011'::uuid, '00000000-0000-0000-0000-000000024021'::uuid, current_date),
  (select service_session_id from public.rotation_members where server_profile_id = '00000000-0000-0000-0000-000000024002'),
  'get_or_create_active_session remains idempotent for an already-active session'
);

select * from finish();
rollback;
