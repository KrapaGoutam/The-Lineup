-- Migration: 20261103010000_location_roles_foundation.sql
-- Subfeature V2-001.004: Per-Location Roles Foundation

-- 1. Create dedicated location_role enum with canonical tiers
create type public.location_role as enum (
  'manager',
  'assistant_manager',
  'staff'
);

-- 2. Add role column to public.location_memberships with default 'staff'
alter table public.location_memberships
  add column role public.location_role not null default 'staff';

-- 3. Index location roles for efficient roster & capability checks
create index location_memberships_location_role_idx
  on public.location_memberships (location_id, role)
  where active;

-- 4. Explicit enum grants for authenticated role
grant usage on type public.location_role to authenticated;
