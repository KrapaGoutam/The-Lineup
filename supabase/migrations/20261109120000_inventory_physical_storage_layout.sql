-- Migration: 20261109120000_inventory_physical_storage_layout.sql
-- V2-005.006-E Phase E3: Physical Storage Areas, Shelves, and Product Placements
--
-- OPTION A (Placement Only):
--   1. Zero Stock Duplication: Authoritative stock remains in public.inventory_stock at (location_id, product_id).
--   2. No Quantity on Placements: Placements store physical location metadata only.
--   3. No Automatic Stock Adjustments: Moving or deleting a placement does not modify stock or create ledger rows.
--   4. RLS enabled on all three tables with location-scoping and backend module enforcement.
--   5. All mutations go through SECURITY DEFINER RPCs guarded by private.inventory_begin.

-- ============================================================================
-- 1. Storage Areas Table
-- ============================================================================

create table public.inventory_storage_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120 and name = trim(name)),
  kind text not null default 'cooler' check (kind in ('cooler', 'freezer', 'back_bar', 'shelf_rack', 'cabinet', 'dry_storage', 'other')),
  display_order integer not null default 0,
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) deferrable initially deferred,
  updated_by uuid references public.profiles(id) deferrable initially deferred,
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete cascade,
  constraint inventory_storage_areas_loc_org_id_uniq unique (id, location_id, organization_id)
);

create index inventory_storage_areas_loc_idx on public.inventory_storage_areas(organization_id, location_id, display_order);
create index inventory_storage_areas_created_by_profile_idx on public.inventory_storage_areas(created_by);
create index inventory_storage_areas_updated_by_profile_idx on public.inventory_storage_areas(updated_by) where updated_by is not null;

-- ============================================================================
-- 2. Storage Shelves / Sections Table
-- ============================================================================

create table public.inventory_storage_shelves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  storage_area_id uuid not null,
  section_name text check (section_name is null or (char_length(trim(section_name)) between 1 and 120 and section_name = trim(section_name))),
  name text not null check (char_length(trim(name)) between 1 and 120 and name = trim(name)),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) deferrable initially deferred,
  updated_by uuid references public.profiles(id) deferrable initially deferred,
  foreign key (storage_area_id, location_id, organization_id) references public.inventory_storage_areas(id, location_id, organization_id) on delete cascade,
  constraint inventory_storage_shelves_area_loc_org_id_uniq unique (id, storage_area_id, location_id, organization_id)
);

create index inventory_storage_shelves_area_idx on public.inventory_storage_shelves(storage_area_id, display_order);
create index inventory_storage_shelves_loc_idx on public.inventory_storage_shelves(organization_id, location_id);
create index inventory_storage_shelves_created_by_profile_idx on public.inventory_storage_shelves(created_by);
create index inventory_storage_shelves_updated_by_profile_idx on public.inventory_storage_shelves(updated_by) where updated_by is not null;

-- ============================================================================
-- 3. Storage Placements Table (Option A: Placement Metadata Only, NO Quantity)
-- ============================================================================

create table public.inventory_storage_placements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  storage_area_id uuid not null,
  shelf_id uuid not null,
  product_id uuid not null,
  slot_number integer check (slot_number is null or slot_number >= 0),
  slot_label text check (slot_label is null or (char_length(trim(slot_label)) between 1 and 30 and slot_label = trim(slot_label))),
  display_order integer not null default 0,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) deferrable initially deferred,
  updated_by uuid references public.profiles(id) deferrable initially deferred,
  foreign key (shelf_id, storage_area_id, location_id, organization_id) references public.inventory_storage_shelves(id, storage_area_id, location_id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.inventory_products(id, organization_id) on delete cascade
);

create index inventory_storage_placements_shelf_idx on public.inventory_storage_placements(shelf_id, display_order);
create index inventory_storage_placements_prod_idx on public.inventory_storage_placements(location_id, product_id);
create index inventory_storage_placements_loc_idx on public.inventory_storage_placements(organization_id, location_id);
create index inventory_storage_placements_created_by_profile_idx on public.inventory_storage_placements(created_by);
create index inventory_storage_placements_updated_by_profile_idx on public.inventory_storage_placements(updated_by) where updated_by is not null;

-- ============================================================================
-- 4. Row Level Security & Permissions
-- ============================================================================

alter table public.inventory_storage_areas enable row level security;
alter table public.inventory_storage_shelves enable row level security;
alter table public.inventory_storage_placements enable row level security;

revoke all on table public.inventory_storage_areas, public.inventory_storage_shelves, public.inventory_storage_placements from public, anon, authenticated;
grant select on table public.inventory_storage_areas, public.inventory_storage_shelves, public.inventory_storage_placements to authenticated;

create policy inventory_storage_areas_select on public.inventory_storage_areas
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

create policy inventory_storage_areas_module_enforcement on public.inventory_storage_areas
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

create policy inventory_storage_shelves_select on public.inventory_storage_shelves
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

create policy inventory_storage_shelves_module_enforcement on public.inventory_storage_shelves
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

create policy inventory_storage_placements_select on public.inventory_storage_placements
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

create policy inventory_storage_placements_module_enforcement on public.inventory_storage_placements
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

-- ============================================================================
-- 5. Storage RPCs
-- ============================================================================

-- 5.1 inventory_storage_area_upsert
create or replace function public.inventory_storage_area_upsert(
  p_organization_id uuid,
  p_location_id uuid,
  p_area_id uuid,
  p_name text,
  p_kind text default 'cooler',
  p_display_order integer default 0,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_name text := trim(p_name);
  v_kind text := coalesce(p_kind, 'cooler');
  v_id uuid;
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter an area name between 1 and 120 characters.' using errcode = '22023';
  end if;
  if v_kind not in ('cooler', 'freezer', 'back_bar', 'shelf_rack', 'cabinet', 'dry_storage', 'other') then
    raise exception 'Invalid storage area kind.' using errcode = '22023';
  end if;

  if p_area_id is not null and exists (
    select 1 from public.inventory_storage_areas
    where id = p_area_id and organization_id = p_organization_id and location_id = p_location_id
  ) then
    update public.inventory_storage_areas
    set name = v_name,
        kind = v_kind,
        display_order = coalesce(p_display_order, 0),
        active = coalesce(p_active, true),
        updated_at = now(),
        updated_by = v_actor,
        version = version + 1
    where id = p_area_id and organization_id = p_organization_id and location_id = p_location_id
    returning id into v_id;
  else
    insert into public.inventory_storage_areas (
      id, organization_id, location_id, name, kind, display_order, active, created_by, updated_by
    ) values (
      coalesce(p_area_id, gen_random_uuid()),
      p_organization_id,
      p_location_id,
      v_name,
      v_kind,
      coalesce(p_display_order, 0),
      coalesce(p_active, true),
      v_actor,
      v_actor
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;
revoke all on function public.inventory_storage_area_upsert(uuid, uuid, uuid, text, text, integer, boolean) from public, anon;
grant execute on function public.inventory_storage_area_upsert(uuid, uuid, uuid, text, text, integer, boolean) to authenticated;

-- 5.2 inventory_storage_area_archive
create or replace function public.inventory_storage_area_archive(
  p_organization_id uuid,
  p_location_id uuid,
  p_area_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
begin
  update public.inventory_storage_areas
  set active = false,
      updated_at = now(),
      updated_by = v_actor,
      version = version + 1
  where id = p_area_id and organization_id = p_organization_id and location_id = p_location_id;
end;
$$;
revoke all on function public.inventory_storage_area_archive(uuid, uuid, uuid) from public, anon;
grant execute on function public.inventory_storage_area_archive(uuid, uuid, uuid) to authenticated;

-- 5.3 inventory_storage_shelf_upsert
create or replace function public.inventory_storage_shelf_upsert(
  p_organization_id uuid,
  p_location_id uuid,
  p_shelf_id uuid,
  p_storage_area_id uuid,
  p_name text,
  p_section_name text default null,
  p_display_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_name text := trim(p_name);
  v_section text := nullif(trim(p_section_name), '');
  v_id uuid;
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter a shelf name between 1 and 120 characters.' using errcode = '22023';
  end if;
  if v_section is not null and (char_length(v_section) < 1 or char_length(v_section) > 120) then
    raise exception 'Section name must be between 1 and 120 characters.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.inventory_storage_areas
    where id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id
  ) then
    raise exception 'Storage area does not exist.' using errcode = '22023';
  end if;

  if p_shelf_id is not null and exists (
    select 1 from public.inventory_storage_shelves
    where id = p_shelf_id and storage_area_id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id
  ) then
    update public.inventory_storage_shelves
    set name = v_name,
        section_name = v_section,
        display_order = coalesce(p_display_order, 0),
        updated_at = now(),
        updated_by = v_actor
    where id = p_shelf_id and storage_area_id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id
    returning id into v_id;
  else
    insert into public.inventory_storage_shelves (
      id, organization_id, location_id, storage_area_id, name, section_name, display_order, created_by, updated_by
    ) values (
      coalesce(p_shelf_id, gen_random_uuid()),
      p_organization_id,
      p_location_id,
      p_storage_area_id,
      v_name,
      v_section,
      coalesce(p_display_order, 0),
      v_actor,
      v_actor
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;
revoke all on function public.inventory_storage_shelf_upsert(uuid, uuid, uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.inventory_storage_shelf_upsert(uuid, uuid, uuid, uuid, text, text, integer) to authenticated;

-- 5.4 inventory_storage_shelf_delete
create or replace function public.inventory_storage_shelf_delete(
  p_organization_id uuid,
  p_location_id uuid,
  p_shelf_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
begin
  delete from public.inventory_storage_shelves
  where id = p_shelf_id and organization_id = p_organization_id and location_id = p_location_id;
end;
$$;
revoke all on function public.inventory_storage_shelf_delete(uuid, uuid, uuid) from public, anon;
grant execute on function public.inventory_storage_shelf_delete(uuid, uuid, uuid) to authenticated;

-- 5.5 inventory_storage_placement_set
create or replace function public.inventory_storage_placement_set(
  p_organization_id uuid,
  p_location_id uuid,
  p_placement_id uuid,
  p_storage_area_id uuid,
  p_shelf_id uuid,
  p_product_id uuid,
  p_slot_number integer default null,
  p_slot_label text default null,
  p_display_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_label text := nullif(trim(p_slot_label), '');
  v_id uuid;
begin
  -- Validate shelf exists in storage area for location and org
  if not exists (
    select 1 from public.inventory_storage_shelves
    where id = p_shelf_id and storage_area_id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id
  ) then
    raise exception 'Shelf does not exist in this storage area.' using errcode = '22023';
  end if;

  -- Validate product exists in organization
  if not exists (
    select 1 from public.inventory_products
    where id = p_product_id and organization_id = p_organization_id and active
  ) then
    raise exception 'Product does not exist or is inactive.' using errcode = '22023';
  end if;

  if v_label is not null and char_length(v_label) > 30 then
    raise exception 'Slot label cannot exceed 30 characters.' using errcode = '22023';
  end if;

  if p_placement_id is not null and exists (
    select 1 from public.inventory_storage_placements
    where id = p_placement_id and organization_id = p_organization_id and location_id = p_location_id
  ) then
    update public.inventory_storage_placements
    set storage_area_id = p_storage_area_id,
        shelf_id = p_shelf_id,
        product_id = p_product_id,
        slot_number = p_slot_number,
        slot_label = v_label,
        display_order = coalesce(p_display_order, 0),
        updated_at = now(),
        updated_by = v_actor,
        version = version + 1
    where id = p_placement_id and organization_id = p_organization_id and location_id = p_location_id
    returning id into v_id;
  else
    insert into public.inventory_storage_placements (
      id, organization_id, location_id, storage_area_id, shelf_id, product_id, slot_number, slot_label, display_order, created_by, updated_by
    ) values (
      coalesce(p_placement_id, gen_random_uuid()),
      p_organization_id,
      p_location_id,
      p_storage_area_id,
      p_shelf_id,
      p_product_id,
      p_slot_number,
      v_label,
      coalesce(p_display_order, 0),
      v_actor,
      v_actor
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;
revoke all on function public.inventory_storage_placement_set(uuid, uuid, uuid, uuid, uuid, uuid, integer, text, integer) from public, anon;
grant execute on function public.inventory_storage_placement_set(uuid, uuid, uuid, uuid, uuid, uuid, integer, text, integer) to authenticated;

-- 5.6 inventory_storage_placement_delete
create or replace function public.inventory_storage_placement_delete(
  p_organization_id uuid,
  p_location_id uuid,
  p_placement_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
begin
  delete from public.inventory_storage_placements
  where id = p_placement_id and organization_id = p_organization_id and location_id = p_location_id;
end;
$$;
revoke all on function public.inventory_storage_placement_delete(uuid, uuid, uuid) from public, anon;
grant execute on function public.inventory_storage_placement_delete(uuid, uuid, uuid) to authenticated;

-- 5.7 inventory_storage_placement_reorder
create or replace function public.inventory_storage_placement_reorder(
  p_organization_id uuid,
  p_location_id uuid,
  p_shelf_id uuid,
  p_placement_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
begin
  update public.inventory_storage_placements p
  set display_order = u.ord,
      updated_at = now(),
      updated_by = v_actor,
      version = version + 1
  from unnest(p_placement_ids) with ordinality as u(id, ord)
  where p.id = u.id
    and p.shelf_id = p_shelf_id
    and p.organization_id = p_organization_id
    and p.location_id = p_location_id;
end;
$$;
revoke all on function public.inventory_storage_placement_reorder(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.inventory_storage_placement_reorder(uuid, uuid, uuid, uuid[]) to authenticated;
