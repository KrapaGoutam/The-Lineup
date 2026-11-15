-- Migration: 20261103001500_location_access_foundation.sql
-- Subfeature V2-001.003: Location Access Foundation

create table public.location_memberships (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, profile_id)
);

create index location_memberships_profile_idx
  on public.location_memberships (profile_id)
  where active;

create index location_memberships_location_idx
  on public.location_memberships (location_id)
  where active;

alter table public.location_memberships enable row level security;

create policy "location_memberships_select" on public.location_memberships
  for select
  to authenticated
  using (
    profile_id = (select auth.uid()) or
    exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
        )
    )
  );

create policy "location_memberships_insert_manager" on public.location_memberships
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );

create policy "location_memberships_update_manager" on public.location_memberships
  for update
  to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  )
  with check (
    exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );

create policy "location_memberships_delete_manager" on public.location_memberships
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = location_id
        and private.has_org_role(
          l.organization_id,
          array['owner', 'general_manager']::public.app_role[]
        )
    )
  );

grant select, insert, update, delete on public.location_memberships to authenticated;
grant usage on sequence public.location_memberships_id_seq to authenticated;
