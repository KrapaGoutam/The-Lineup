begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Originally one collapsed "for all" policy, then split by Feature 015
-- Phase C into insert/update/delete. Table Rotation V2 Part 1 (migration
-- 20261023110000) retired the second, client-facing mutation API: the any-
-- member capability now lives in the board_* RPCs (membership-checked
-- SECURITY DEFINER), and no direct write policy remains. See
-- 0025_table_rotation_v2_trusted_mutations.test.sql for the full contract.
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'table_rotation_entries'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'table_rotation_entries has no direct client write policy (RPC-only)'
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
