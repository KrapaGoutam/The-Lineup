begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);
select ok((select relrowsecurity from pg_class where oid = 'public.personal_pin_accounts'::regclass), 'account RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.personal_pin_claims'::regclass), 'claim RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.personal_pin_events'::regclass), 'audit RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.global_pin_attempts'::regclass), 'attempt RLS enabled');
select ok(not has_table_privilege('anon','public.personal_pin_accounts','select'), 'anon cannot enumerate identities');
select ok(not has_table_privilege('authenticated','public.personal_pin_accounts','select'), 'signed-in cannot enumerate identities');
select ok(not has_table_privilege('anon','public.personal_pin_claims','insert'), 'anon cannot claim PIN');
select ok(not has_table_privilege('authenticated','public.personal_pin_claims','insert'), 'signed-in cannot claim PIN');
select ok(not has_table_privilege('authenticated','public.global_pin_attempts','update'), 'signed-in cannot reset quota');
select ok(not has_table_privilege('anon','public.personal_pin_events','select'), 'anon cannot read audit');
select ok(not has_function_privilege('anon','public.begin_personal_pin_change(uuid,text,uuid,text)','execute'), 'anon cannot reserve');
select ok(not has_function_privilege('authenticated','public.begin_personal_pin_change(uuid,text,uuid,text)','execute'), 'signed-in cannot reserve');
select ok(not has_function_privilege('anon','public.finish_personal_pin_change(uuid,uuid,boolean)','execute'), 'anon cannot settle');
select ok(not has_function_privilege('authenticated','public.finish_personal_pin_change(uuid,uuid,boolean)','execute'), 'signed-in cannot settle');
select ok(not has_function_privilege('anon','public.reserve_global_pin_attempt(text,text)','execute'), 'no public limiter RPC');
select ok(has_function_privilege('service_role','public.begin_personal_pin_change(uuid,text,uuid,text)','execute'), 'server can reserve');
select ok(has_function_privilege('service_role','public.finish_personal_pin_change(uuid,uuid,boolean)','execute'), 'server can settle');
select ok(has_function_privilege('service_role','public.reserve_global_pin_attempt(text,text)','execute'), 'server can throttle');
select ok(not exists(select 1 from pg_proc where oid in (
  'public.begin_personal_pin_change(uuid,text,uuid,text)'::regprocedure,
  'public.finish_personal_pin_change(uuid,uuid,boolean)'::regprocedure,
  'public.reserve_global_pin_attempt(text,text)'::regprocedure) and prosecdef), 'all B5 RPCs security invoker');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.personal_pin_claims'::regclass and contype = 'p'), 'unique global ownership key');
create temporary table b5_registration_budget(id uuid);
insert into b5_registration_budget
  select public.reserve_global_pin_attempt(repeat('e',64), 'register') from generate_series(1,3);
select is((select count(id)::integer from b5_registration_budget), 3, 'three registration admissions');
update public.global_pin_attempts set succeeded = true where id in (select id from b5_registration_budget);
select is(public.reserve_global_pin_attempt(repeat('e',64), 'register'), null::uuid, 'successful account creations still consume the registration quota');
select * from finish();
rollback;
