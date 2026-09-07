begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Feature 017: memberships.active is the real enforcement layer --
-- private.has_org_role (nearly every RLS policy in this schema calls it)
-- requires it. This confirms that behaviorally, not just by reading the
-- function's SQL text: a throwaway auth.users/profiles/organizations/
-- memberships row is seeded, auth.uid() is simulated via the same JWT
-- claim GoTrue itself populates (request.jwt.claim.sub), and
-- has_org_role is called directly -- exactly what every RLS policy in
-- this schema evaluates on every request.
-- Two throwaway users, deliberately not the same person: has_org_role
-- has a SECOND clause -- "or the caller is this organization's
-- organizations.created_by" -- that bypasses the active/roles check
-- entirely. Discovered by this test itself: an earlier draft used one
-- user for both the org's creator and the deactivation subject, and the
-- "deactivated but still passes has_org_role" assertion below failed,
-- because that bypass clause doesn't care about active at all. Real
-- consequence, not just a test artifact: the org's literal creator
-- retains full RLS access through this clause even after their own
-- membership.active flips to false -- see docs/features/017-member-deactivation.md's
-- build notes for how this is being handled. 170a1 stays the org's
-- creator and is never deactivated in this test; 170a2 is the actual
-- subject.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  (
    '00000000-0000-0000-0000-0000000170a1'::uuid,
    '00000000-0000-0000-0000-0000000170a1@passcode.internal',
    'not-a-real-hash',
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    '00000000-0000-0000-0000-0000000170a2'::uuid,
    '00000000-0000-0000-0000-0000000170a2@passcode.internal',
    'not-a-real-hash',
    now(),
    'authenticated',
    'authenticated'
  );
insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-0000000170a1'::uuid, 'PGTAP 017 Creator'),
  ('00000000-0000-0000-0000-0000000170a2'::uuid, 'PGTAP 017 Subject');
insert into public.organizations (id, name, slug, created_by)
values (
  '00000000-0000-0000-0000-0000000170b1'::uuid,
  'PGTAP 017 Org',
  'pgtap-017-deactivation-test',
  '00000000-0000-0000-0000-0000000170a1'::uuid
);
insert into public.memberships (organization_id, profile_id, roles, active)
values (
  '00000000-0000-0000-0000-0000000170b1'::uuid,
  '00000000-0000-0000-0000-0000000170a2'::uuid,
  array['owner']::public.app_role[],
  true
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-0000000170a2',
  true
);

select ok(
  private.has_org_role(
    '00000000-0000-0000-0000-0000000170b1'::uuid,
    array['owner']::public.app_role[]
  ),
  'an active owner passes has_org_role for their own organization'
);

update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-0000000170b1'::uuid
  and profile_id = '00000000-0000-0000-0000-0000000170a2'::uuid;

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000170b1'::uuid,
    array['owner']::public.app_role[]
  ),
  'the exact same person, now deactivated but with identical roles, fails has_org_role'
);

-- Same fact, checked structurally too -- so a future refactor of
-- has_org_role that drops the active check fails loudly here even if
-- the behavioral test above were ever weakened or skipped.
select ok(
  pg_get_functiondef('private.has_org_role'::regproc) ~ 'memberships\.active',
  'has_org_role''s definition still checks memberships.active'
);

select ok(
  (select prosecdef from pg_proc where oid = 'private.has_org_role'::regproc),
  'has_org_role remains SECURITY DEFINER, as its own comment in the migration requires'
);

-- Named explicitly, not left as a surprise someone has to rediscover:
-- deactivating the org's own creator does NOT block their has_org_role
-- result, because of the bypass clause above -- confirmed here as a
-- known, currently-accepted gap (see the build notes), not a bug this
-- test failed to catch.
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-0000000170a1',
  true
);
select ok(
  private.has_org_role(
    '00000000-0000-0000-0000-0000000170b1'::uuid,
    array['owner']::public.app_role[]
  ),
  'known gap, confirmed on purpose: the org''s creator passes has_org_role even with no membership row at all, via the created_by bypass'
);

select * from finish();
rollback;
