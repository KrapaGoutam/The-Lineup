begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace and proname = 'cleanup_stale_board_events'
  ),
  'private.cleanup_stale_board_events exists'
);
select ok(
  (select prosecdef from pg_proc where pronamespace = 'private'::regnamespace and proname = 'cleanup_stale_board_events'),
  'cleanup_stale_board_events is SECURITY DEFINER (only callable by the scheduled job, not the browser)'
);
select is(
  has_function_privilege('authenticated', 'private.cleanup_stale_board_events()', 'EXECUTE'),
  false,
  'a plain authenticated client role has no EXECUTE grant on the cleanup function'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-000000029201', '0292-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000029201', 'PGTAP 0292 Owner');
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000029211', 'PGTAP 0292 Org', 'pgtap-0292-org', '00000000-0000-0000-0000-000000029201');
insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000029221', '00000000-0000-0000-0000-000000029211', 'PGTAP 0292 Location', 'America/Chicago');
insert into public.memberships (organization_id, profile_id, roles, active)
values ('00000000-0000-0000-0000-000000029211', '00000000-0000-0000-0000-000000029201', array['owner']::public.app_role[], true);
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900009, '00000000-0000-0000-0000-000000029211', '00000000-0000-0000-0000-000000029221', current_date, 'service', 'active');

insert into public.board_events (id, organization_id, service_session_id, actor_profile_id, event_type, created_at)
overriding system value
values
  (900009, '00000000-0000-0000-0000-000000029211', 900009, '00000000-0000-0000-0000-000000029201', 'assign', now() - interval '10 days'),
  (900010, '00000000-0000-0000-0000-000000029211', 900009, '00000000-0000-0000-0000-000000029201', 'assign', now() - interval '2 days');

select private.cleanup_stale_board_events();

select is(
  (select count(*)::int from public.board_events where id = 900009),
  0,
  'a board_events row older than 7 days is deleted'
);
select is(
  (select count(*)::int from public.board_events where id = 900010),
  1,
  'a board_events row within 7 days is untouched'
);

select * from finish();
rollback;
