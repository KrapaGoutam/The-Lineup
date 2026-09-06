begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Originally one collapsed "for all" policy; split by Feature 015 Phase C
-- into insert/update/delete (0007_allocation_board_rpcs.test.sql covers
-- the split itself and the real gap that caused it) -- this just confirms
-- the any-member write capability itself is still there in some form.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'table_rotation_entries'
      and policyname = 'table_rotation_entries_insert_any_member'
  ),
  'the any-member insert policy exists'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'table_rotation_entries'
      and policyname in ('table_rotation_entries_write_manager', 'table_rotation_entries_write_own')
  ),
  'the old self-or-manager policies are gone'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tip_pools'
      and policyname = 'tip_pools_reopen_manager'
  ),
  'the tip_pools reopen (finalized -> draft) policy exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.table_rotation_entries'::regclass),
  'table_rotation_entries still has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tip_pools'::regclass),
  'tip_pools still has RLS enabled'
);

select * from finish();
rollback;
