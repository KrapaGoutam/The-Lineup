begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_table('public', 'passcode_lockout_resets', 'passcode lockout resets exist');
select has_index(
  'public', 'passcode_login_attempts', 'passcode_attempts_org_limit_idx',
  'organization-wide failure index exists'
);
select has_index(
  'public', 'passcode_login_attempts', 'passcode_attempts_recent_success_idx',
  'recent-success exemption index exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.passcode_lockout_resets'::regclass),
  'passcode lockout resets have RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.passcode_lockout_resets', 'SELECT'),
  'anon cannot read passcode lockout resets'
);
select ok(
  not has_table_privilege('anon', 'public.passcode_lockout_resets', 'INSERT'),
  'anon cannot insert passcode lockout resets'
);
select ok(
  has_table_privilege('authenticated', 'public.passcode_lockout_resets', 'INSERT'),
  'authenticated role reaches passcode lockout resets through RLS'
);

select * from finish();
rollback;
