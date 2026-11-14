begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- 1. Schema assertions
select has_table('public', 'passcode_credentials', 'passcode_credentials table exists');

select has_index(
  'public',
  'passcode_credentials',
  'passcode_credentials_synthetic_email_idx',
  'synthetic_email index exists'
);

select has_index(
  'public',
  'passcode_credentials',
  'passcode_credentials_profile_id_idx',
  'profile_id index exists'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.passcode_credentials'::regclass
      and conname = 'passcode_credentials_synthetic_email_key'
  ),
  'passcode_credentials_synthetic_email_key constraint does not exist'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.passcode_credentials'::regclass
      and conname = 'passcode_credentials_organization_id_locator_key'
  ),
  'passcode_credentials_organization_id_locator_key unique constraint is preserved'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.passcode_credentials'::regclass
      and conname = 'passcode_credentials_organization_id_profile_id_key'
  ),
  'passcode_credentials_organization_id_profile_id_key unique constraint is preserved'
);

-- 2. Behavioral test in synthetic transaction
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000087001', 'b3-user-1@passcode.internal'),
  ('00000000-0000-4000-8000-000000087002', 'b3-user-2@passcode.internal');

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000087001', 'Multi Org User 1'),
  ('00000000-0000-4000-8000-000000087002', 'Single Org User 2');

insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000087101', 'B3 Org A', 'b3-org-a', '00000000-0000-4000-8000-000000087001'),
  ('00000000-0000-4000-8000-000000087102', 'B3 Org B', 'b3-org-b', '00000000-0000-4000-8000-000000087001');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000087101', '00000000-0000-4000-8000-000000087001', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000087102', '00000000-0000-4000-8000-000000087001', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000087101', '00000000-0000-4000-8000-000000087002', array['server']::public.app_role[], true);

-- Helper function to catch SQL errors
create or replace function pg_temp.err_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'OK';
exception when others then
  return SQLSTATE;
end;
$$;

-- Insert credential in Org A for User 1
select is(
  pg_temp.err_of($q$
    insert into public.passcode_credentials (
      organization_id,
      profile_id,
      locator,
      synthetic_email,
      active
    ) values (
      '00000000-0000-4000-8000-000000087101',
      '00000000-0000-4000-8000-000000087001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'b3-user-1@passcode.internal',
      true
    )
  $q$),
  'OK',
  'Insert credential in Org A for User 1 succeeds'
);

-- Insert credential in Org B for User 1 with the SAME synthetic_email
select is(
  pg_temp.err_of($q$
    insert into public.passcode_credentials (
      organization_id,
      profile_id,
      locator,
      synthetic_email,
      active
    ) values (
      '00000000-0000-4000-8000-000000087102',
      '00000000-0000-4000-8000-000000087001',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'b3-user-1@passcode.internal',
      true
    )
  $q$),
  'OK',
  'Insert credential in Org B for User 1 with same synthetic_email succeeds'
);

-- Verify User 1 has exactly 2 credentials across 2 organizations
select is(
  (select count(*)::int from public.passcode_credentials where profile_id = '00000000-0000-4000-8000-000000087001'),
  2,
  'User 1 holds credentials in both Org A and Org B'
);

-- Attempting duplicate locator in Org A must violate unique constraint (23505)
select is(
  pg_temp.err_of($q$
    insert into public.passcode_credentials (
      organization_id,
      profile_id,
      locator,
      synthetic_email,
      active
    ) values (
      '00000000-0000-4000-8000-000000087101',
      '00000000-0000-4000-8000-000000087002',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'b3-user-2@passcode.internal',
      true
    )
  $q$),
  '23505',
  'Duplicate locator in Org A fails with unique_violation'
);

-- Attempting duplicate profile in Org A must violate unique constraint (23505)
select is(
  pg_temp.err_of($q$
    insert into public.passcode_credentials (
      organization_id,
      profile_id,
      locator,
      synthetic_email,
      active
    ) values (
      '00000000-0000-4000-8000-000000087101',
      '00000000-0000-4000-8000-000000087001',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'b3-user-1@passcode.internal',
      true
    )
  $q$),
  '23505',
  'Duplicate profile in Org A fails with unique_violation'
);

-- Deactivating credential in Org A does not deactivate credential in Org B
update public.passcode_credentials
set active = false
where organization_id = '00000000-0000-4000-8000-000000087101'
  and profile_id = '00000000-0000-4000-8000-000000087001';

select is(
  (select active from public.passcode_credentials where organization_id = '00000000-0000-4000-8000-000000087101' and profile_id = '00000000-0000-4000-8000-000000087001'),
  false,
  'Org A credential is deactivated'
);

select is(
  (select active from public.passcode_credentials where organization_id = '00000000-0000-4000-8000-000000087102' and profile_id = '00000000-0000-4000-8000-000000087001'),
  true,
  'Org B credential remains active'
);

select * from finish();
rollback;
