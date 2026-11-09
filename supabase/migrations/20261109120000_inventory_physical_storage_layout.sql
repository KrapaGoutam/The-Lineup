-- Migration: 20261109120000_inventory_physical_storage_layout.sql
-- V2-005.006-E: Physical Storage Areas, Shelves and Product Placements, plus the
-- transactional Date Group import.
--
-- OPTION A (Placement Only):
--   1. Zero Stock Duplication: Authoritative stock remains in public.inventory_stock at (location_id, product_id).
--   2. No Quantity on Placements: Placements store physical location metadata only.
--   3. No Automatic Stock Adjustments: Moving or deleting a placement does not modify stock or create ledger rows.
--   4. RLS enabled on all tables with location-scoping and backend module enforcement.
--   5. All mutations go through SECURITY DEFINER RPCs guarded by private.inventory_begin
--      (live session + manager level at the verified location + module enabled).
--
-- STAGE E6 REVIEW HARDENING (this file is still unapplied on hosted DEV):
--   * Every location foreign key is DEFERRABLE INITIALLY DEFERRED, the same as every other
--     inventory table (tenant teardown cascades in any order).
--   * Areas, shelves and placements carry a version; every mutating RPC takes the version the
--     editor saw and raises PT409 (stale) instead of silently overwriting a newer change.
--   * A shelf with placed products cannot be deleted by accident: removal must be explicit and
--     every removed placement is written to the audit log. Stock is never touched.
--   * Duplicate shelf/slot/area-name races are closed by unique indexes behind friendly checks.
--   * Date Group imports commit in ONE transaction (inventory_date_group_import_commit) with a
--     durable request receipt, so a retry replays the original result and never duplicates.

-- ============================================================================
-- 0. Audit log vocabulary
-- ============================================================================

alter table public.inventory_change_log drop constraint inventory_change_log_entity_type_check;
alter table public.inventory_change_log add constraint inventory_change_log_entity_type_check
  check (entity_type in (
    'vendor','category','subcategory','product','stock_levels','export','import',
    'date_lot','freshness_rule','storage_area','storage_shelf','storage_placement'
  ));

alter table public.inventory_change_log drop constraint inventory_change_log_action_check;
alter table public.inventory_change_log add constraint inventory_change_log_action_check
  check (action in ('create','update','rename','archive','reactivate','export','import','delete'));

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
  constraint inventory_storage_areas_location_fk
    foreign key (location_id, organization_id) references public.locations(id, organization_id)
    on delete cascade deferrable initially deferred,
  constraint inventory_storage_areas_loc_org_id_uniq unique (id, location_id, organization_id)
);

create index inventory_storage_areas_loc_idx on public.inventory_storage_areas(organization_id, location_id, display_order);
create index inventory_storage_areas_location_fk_idx on public.inventory_storage_areas(location_id, organization_id);
create index inventory_storage_areas_created_by_profile_idx on public.inventory_storage_areas(created_by);
create index inventory_storage_areas_updated_by_profile_idx on public.inventory_storage_areas(updated_by) where updated_by is not null;
-- Two active areas at one restaurant cannot share a name (an archived one can be superseded).
create unique index inventory_storage_areas_active_name_uniq
  on public.inventory_storage_areas(location_id, lower(name)) where active;

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
  version integer not null default 1 check (version >= 1),
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
create unique index inventory_storage_shelves_name_uniq
  on public.inventory_storage_shelves(storage_area_id, lower(name), lower(coalesce(section_name, '')));

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
create index inventory_storage_placements_product_fk_idx on public.inventory_storage_placements(product_id, organization_id);
create index inventory_storage_placements_created_by_profile_idx on public.inventory_storage_placements(created_by);
create index inventory_storage_placements_updated_by_profile_idx on public.inventory_storage_placements(updated_by) where updated_by is not null;
-- A product is listed once per shelf; a slot number is used once per shelf.
create unique index inventory_storage_placements_shelf_product_uniq
  on public.inventory_storage_placements(shelf_id, product_id);
create unique index inventory_storage_placements_shelf_slot_uniq
  on public.inventory_storage_placements(shelf_id, slot_number) where slot_number is not null;

-- ============================================================================
-- 4. Date Group import receipts (durable idempotency)
-- ============================================================================

create table public.inventory_date_group_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  -- Chosen by the browser per confirm attempt. The receipt is what makes a retry a replay.
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  filename text not null check (char_length(filename) between 1 and 255),
  created_count integer not null check (created_count >= 0),
  updated_count integer not null check (updated_count >= 0),
  skipped_count integer not null check (skipped_count >= 0),
  rejected_count integer not null check (rejected_count >= 0),
  result jsonb not null,
  actor_profile_id uuid not null references public.profiles(id) deferrable initially deferred,
  created_at timestamptz not null default now(),
  constraint inventory_date_group_imports_request_unique unique (organization_id, request_id),
  constraint inventory_date_group_imports_location_fk
    foreign key (location_id, organization_id) references public.locations(id, organization_id)
    on delete cascade deferrable initially deferred
);

create index inventory_date_group_imports_location_idx on public.inventory_date_group_imports(location_id, organization_id, created_at desc);
create index inventory_date_group_imports_actor_idx on public.inventory_date_group_imports(actor_profile_id);

-- ============================================================================
-- 5. Row Level Security & Permissions
-- ============================================================================

alter table public.inventory_storage_areas enable row level security;
alter table public.inventory_storage_shelves enable row level security;
alter table public.inventory_storage_placements enable row level security;
alter table public.inventory_date_group_imports enable row level security;

revoke all on table public.inventory_storage_areas, public.inventory_storage_shelves,
  public.inventory_storage_placements, public.inventory_date_group_imports
  from public, anon, authenticated;
grant select on table public.inventory_storage_areas, public.inventory_storage_shelves,
  public.inventory_storage_placements, public.inventory_date_group_imports to authenticated;

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

create policy inventory_date_group_imports_select on public.inventory_date_group_imports
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

create policy inventory_date_group_imports_module_enforcement on public.inventory_date_group_imports
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

-- ============================================================================
-- 6. Storage RPCs
--    All take the version the editor saw. NULL is only valid for a brand-new row.
-- ============================================================================

-- 6.1 inventory_storage_area_upsert
create or replace function public.inventory_storage_area_upsert(
  p_organization_id uuid,
  p_location_id uuid,
  p_area_id uuid,
  p_name text,
  p_kind text,
  p_display_order integer,
  p_active boolean,
  p_expected_version integer
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
  v_active boolean := coalesce(p_active, true);
  v_old public.inventory_storage_areas;
  v_new public.inventory_storage_areas;
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter an area name between 1 and 120 characters.' using errcode = '22023';
  end if;
  if v_kind not in ('cooler', 'freezer', 'back_bar', 'shelf_rack', 'cabinet', 'dry_storage', 'other') then
    raise exception 'Invalid storage area kind.' using errcode = '22023';
  end if;

  if p_area_id is not null then
    select * into v_old from public.inventory_storage_areas
    where id = p_area_id and organization_id = p_organization_id and location_id = p_location_id
    for update;
  end if;

  begin
    if v_old.id is not null then
      if p_expected_version is null or p_expected_version <> v_old.version then
        perform private.inventory_raise_stale('storage area', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
      end if;
      update public.inventory_storage_areas
      set name = v_name,
          kind = v_kind,
          display_order = coalesce(p_display_order, 0),
          active = v_active,
          updated_at = now(),
          updated_by = v_actor,
          version = version + 1
      where id = v_old.id
      returning * into v_new;
    else
      if p_area_id is not null then
        -- The id belongs to a row we may not see (another restaurant or organization), or was removed.
        if p_expected_version is not null
           or exists (select 1 from public.inventory_storage_areas where id = p_area_id) then
          raise exception 'That storage area is not available here.' using errcode = '22023';
        end if;
      elsif p_expected_version is not null then
        raise exception 'A new storage area cannot have an expected version.' using errcode = '22023';
      end if;
      insert into public.inventory_storage_areas (
        id, organization_id, location_id, name, kind, display_order, active, created_by, updated_by
      ) values (
        coalesce(p_area_id, gen_random_uuid()), p_organization_id, p_location_id,
        v_name, v_kind, coalesce(p_display_order, 0), v_active, v_actor, v_actor
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    raise exception 'A storage area named "%" already exists at this restaurant.', v_name using errcode = '22023';
  end;

  perform private.inventory_log(p_organization_id, p_location_id, 'storage_area', v_new.id,
    case when v_old.id is null then 'create'
         when not v_new.active and v_old.active then 'archive'
         when v_new.active and not v_old.active then 'reactivate'
         else 'update' end,
    jsonb_build_object('previous', case when v_old.id is null then null else to_jsonb(v_old) end, 'new', to_jsonb(v_new)));
  return v_new.id;
end;
$$;
revoke all on function public.inventory_storage_area_upsert(uuid, uuid, uuid, text, text, integer, boolean, integer) from public, anon;
grant execute on function public.inventory_storage_area_upsert(uuid, uuid, uuid, text, text, integer, boolean, integer) to authenticated;

-- 6.2 inventory_storage_area_archive (placements are kept; Restore = upsert with active = true)
create or replace function public.inventory_storage_area_archive(
  p_organization_id uuid,
  p_location_id uuid,
  p_area_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_old public.inventory_storage_areas;
  v_new public.inventory_storage_areas;
begin
  select * into v_old from public.inventory_storage_areas
  where id = p_area_id and organization_id = p_organization_id and location_id = p_location_id
  for update;
  if not found then
    raise exception 'That storage area is not available here.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version <> v_old.version then
    perform private.inventory_raise_stale('storage area', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
  end if;
  if not v_old.active then
    return;
  end if;
  update public.inventory_storage_areas
  set active = false, updated_at = now(), updated_by = v_actor, version = version + 1
  where id = v_old.id
  returning * into v_new;
  perform private.inventory_log(p_organization_id, p_location_id, 'storage_area', v_new.id, 'archive',
    jsonb_build_object('previous', to_jsonb(v_old), 'new', to_jsonb(v_new)));
end;
$$;
revoke all on function public.inventory_storage_area_archive(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.inventory_storage_area_archive(uuid, uuid, uuid, integer) to authenticated;

-- 6.3 inventory_storage_shelf_upsert
create or replace function public.inventory_storage_shelf_upsert(
  p_organization_id uuid,
  p_location_id uuid,
  p_shelf_id uuid,
  p_storage_area_id uuid,
  p_name text,
  p_section_name text,
  p_display_order integer,
  p_expected_version integer
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
  v_area public.inventory_storage_areas;
  v_old public.inventory_storage_shelves;
  v_new public.inventory_storage_shelves;
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Enter a shelf name between 1 and 120 characters.' using errcode = '22023';
  end if;
  if v_section is not null and char_length(v_section) > 120 then
    raise exception 'Section name must be between 1 and 120 characters.' using errcode = '22023';
  end if;

  select * into v_area from public.inventory_storage_areas
  where id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id
  for share;
  if not found then
    raise exception 'Storage area does not exist.' using errcode = '22023';
  end if;

  if p_shelf_id is not null then
    select * into v_old from public.inventory_storage_shelves
    where id = p_shelf_id and organization_id = p_organization_id and location_id = p_location_id
    for update;
  end if;

  begin
    if v_old.id is not null then
      if v_old.storage_area_id <> p_storage_area_id then
        raise exception 'A shelf cannot be moved to another storage area.' using errcode = '22023';
      end if;
      if p_expected_version is null or p_expected_version <> v_old.version then
        perform private.inventory_raise_stale('shelf', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
      end if;
      update public.inventory_storage_shelves
      set name = v_name,
          section_name = v_section,
          display_order = coalesce(p_display_order, 0),
          updated_at = now(),
          updated_by = v_actor,
          version = version + 1
      where id = v_old.id
      returning * into v_new;
    else
      if not v_area.active then
        raise exception 'Restore the archived storage area before adding shelves to it.' using errcode = '22023';
      end if;
      if p_shelf_id is not null then
        if p_expected_version is not null
           or exists (select 1 from public.inventory_storage_shelves where id = p_shelf_id) then
          raise exception 'That shelf is not available here.' using errcode = '22023';
        end if;
      elsif p_expected_version is not null then
        raise exception 'A new shelf cannot have an expected version.' using errcode = '22023';
      end if;
      insert into public.inventory_storage_shelves (
        id, organization_id, location_id, storage_area_id, name, section_name, display_order, created_by, updated_by
      ) values (
        coalesce(p_shelf_id, gen_random_uuid()), p_organization_id, p_location_id, p_storage_area_id,
        v_name, v_section, coalesce(p_display_order, 0), v_actor, v_actor
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    raise exception 'A shelf named "%" already exists in this storage area.', v_name using errcode = '22023';
  end;

  perform private.inventory_log(p_organization_id, p_location_id, 'storage_shelf', v_new.id,
    case when v_old.id is null then 'create' else 'update' end,
    jsonb_build_object('previous', case when v_old.id is null then null else to_jsonb(v_old) end, 'new', to_jsonb(v_new)));
  return v_new.id;
end;
$$;
revoke all on function public.inventory_storage_shelf_upsert(uuid, uuid, uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.inventory_storage_shelf_upsert(uuid, uuid, uuid, uuid, text, text, integer, integer) to authenticated;

-- 6.4 inventory_storage_shelf_delete
--     A shelf that still has placed products is refused unless the caller explicitly confirms the
--     removal of those placements. Every removed placement is audited. Stock is never touched.
create or replace function public.inventory_storage_shelf_delete(
  p_organization_id uuid,
  p_location_id uuid,
  p_shelf_id uuid,
  p_expected_version integer,
  p_remove_placements boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_old public.inventory_storage_shelves;
  v_count integer;
  v_removed uuid[];
begin
  select * into v_old from public.inventory_storage_shelves
  where id = p_shelf_id and organization_id = p_organization_id and location_id = p_location_id
  for update;
  if not found then
    raise exception 'That shelf is not available here.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version <> v_old.version then
    perform private.inventory_raise_stale('shelf', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
  end if;

  select count(*), coalesce(array_agg(id order by display_order, id), '{}'::uuid[])
    into v_count, v_removed
  from public.inventory_storage_placements where shelf_id = v_old.id;

  if v_count > 0 and not coalesce(p_remove_placements, false) then
    raise exception 'This shelf still has % placed product(s). Remove them first or confirm removing them with the shelf.', v_count
      using errcode = '22023';
  end if;

  if v_count > 0 then
    perform private.inventory_log(p_organization_id, p_location_id, 'storage_placement', pl.id, 'delete',
      jsonb_build_object('product_id', pl.product_id, 'shelf_id', pl.shelf_id, 'reason', 'shelf deleted', 'previous', to_jsonb(pl)))
    from public.inventory_storage_placements pl where pl.shelf_id = v_old.id;
  end if;

  delete from public.inventory_storage_shelves where id = v_old.id;
  perform private.inventory_log(p_organization_id, p_location_id, 'storage_shelf', v_old.id, 'delete',
    jsonb_build_object('previous', to_jsonb(v_old), 'removed_placements', to_jsonb(v_removed)));
  return v_count;
end;
$$;
revoke all on function public.inventory_storage_shelf_delete(uuid, uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.inventory_storage_shelf_delete(uuid, uuid, uuid, integer, boolean) to authenticated;

-- 6.5 inventory_storage_placement_set
create or replace function public.inventory_storage_placement_set(
  p_organization_id uuid,
  p_location_id uuid,
  p_placement_id uuid,
  p_storage_area_id uuid,
  p_shelf_id uuid,
  p_product_id uuid,
  p_slot_number integer,
  p_slot_label text,
  p_display_order integer,
  p_expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_label text := nullif(trim(p_slot_label), '');
  v_area public.inventory_storage_areas;
  v_old public.inventory_storage_placements;
  v_new public.inventory_storage_placements;
begin
  if p_slot_number is not null and p_slot_number < 0 then
    raise exception 'Slot number cannot be negative.' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 30 then
    raise exception 'Slot label cannot exceed 30 characters.' using errcode = '22023';
  end if;

  -- The destination shelf must belong to this organization, restaurant and storage area,
  -- and its area must be active. FOR SHARE keeps the shelf from being deleted mid-write.
  perform 1 from public.inventory_storage_shelves
  where id = p_shelf_id and storage_area_id = p_storage_area_id
    and organization_id = p_organization_id and location_id = p_location_id
  for share;
  if not found then
    raise exception 'Shelf does not exist in this storage area.' using errcode = '22023';
  end if;
  select * into v_area from public.inventory_storage_areas
  where id = p_storage_area_id and organization_id = p_organization_id and location_id = p_location_id;
  if not v_area.active then
    raise exception 'Restore the archived storage area before placing products in it.' using errcode = '22023';
  end if;

  -- Product must be an active catalog product of this organization.
  perform 1 from public.inventory_products
  where id = p_product_id and organization_id = p_organization_id and active
  for share;
  if not found then
    raise exception 'Product does not exist or is inactive.' using errcode = '22023';
  end if;

  if p_placement_id is not null then
    select * into v_old from public.inventory_storage_placements
    where id = p_placement_id and organization_id = p_organization_id and location_id = p_location_id
    for update;
  end if;

  begin
    if v_old.id is not null then
      if p_expected_version is null or p_expected_version <> v_old.version then
        perform private.inventory_raise_stale('placement', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
      end if;
      if v_old.product_id <> p_product_id then
        raise exception 'A placement cannot be reassigned to another product.' using errcode = '22023';
      end if;
      update public.inventory_storage_placements
      set storage_area_id = p_storage_area_id,
          shelf_id = p_shelf_id,
          slot_number = p_slot_number,
          slot_label = v_label,
          display_order = coalesce(p_display_order, 0),
          updated_at = now(),
          updated_by = v_actor,
          version = version + 1
      where id = v_old.id
      returning * into v_new;
    else
      if p_placement_id is not null then
        if p_expected_version is not null
           or exists (select 1 from public.inventory_storage_placements where id = p_placement_id) then
          raise exception 'That placement is not available here.' using errcode = '22023';
        end if;
      elsif p_expected_version is not null then
        raise exception 'A new placement cannot have an expected version.' using errcode = '22023';
      end if;
      insert into public.inventory_storage_placements (
        id, organization_id, location_id, storage_area_id, shelf_id, product_id,
        slot_number, slot_label, display_order, created_by, updated_by
      ) values (
        coalesce(p_placement_id, gen_random_uuid()), p_organization_id, p_location_id,
        p_storage_area_id, p_shelf_id, p_product_id,
        p_slot_number, v_label, coalesce(p_display_order, 0), v_actor, v_actor
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    raise exception 'That product or slot is already placed on this shelf.' using errcode = '22023';
  end;

  perform private.inventory_log(p_organization_id, p_location_id, 'storage_placement', v_new.id,
    case when v_old.id is null then 'create' else 'update' end,
    jsonb_build_object('product_id', v_new.product_id,
      'previous', case when v_old.id is null then null else to_jsonb(v_old) end, 'new', to_jsonb(v_new)));
  return v_new.id;
end;
$$;
revoke all on function public.inventory_storage_placement_set(uuid, uuid, uuid, uuid, uuid, uuid, integer, text, integer, integer) from public, anon;
grant execute on function public.inventory_storage_placement_set(uuid, uuid, uuid, uuid, uuid, uuid, integer, text, integer, integer) to authenticated;

-- 6.6 inventory_storage_placement_delete
create or replace function public.inventory_storage_placement_delete(
  p_organization_id uuid,
  p_location_id uuid,
  p_placement_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_old public.inventory_storage_placements;
begin
  select * into v_old from public.inventory_storage_placements
  where id = p_placement_id and organization_id = p_organization_id and location_id = p_location_id
  for update;
  if not found then
    raise exception 'That placement is not available here.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version <> v_old.version then
    perform private.inventory_raise_stale('placement', v_old.id, p_organization_id, v_old.version, v_old.updated_by, v_old.updated_at);
  end if;
  delete from public.inventory_storage_placements where id = v_old.id;
  perform private.inventory_log(p_organization_id, p_location_id, 'storage_placement', v_old.id, 'delete',
    jsonb_build_object('product_id', v_old.product_id, 'previous', to_jsonb(v_old), 'removed_by', v_actor));
end;
$$;
revoke all on function public.inventory_storage_placement_delete(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.inventory_storage_placement_delete(uuid, uuid, uuid, integer) to authenticated;

-- 6.7 inventory_storage_placement_reorder
--     Serialized on the shelf row. Every listed id must be on this shelf; placements that are not
--     listed (added by someone else meanwhile) keep their relative order after the listed ones.
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
  v_listed integer := coalesce(cardinality(p_placement_ids), 0);
  v_distinct integer;
  v_on_shelf integer;
begin
  perform 1 from public.inventory_storage_shelves
  where id = p_shelf_id and organization_id = p_organization_id and location_id = p_location_id
  for update;
  if not found then
    raise exception 'That shelf is not available here.' using errcode = '22023';
  end if;
  if v_listed > 500 then
    raise exception 'Too many placements to reorder at once.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_placement_ids) as x(id) where x.id is null) then
    raise exception 'Invalid placement list.' using errcode = '22023';
  end if;
  select count(distinct x.id) into v_distinct from unnest(p_placement_ids) as x(id);
  if v_distinct <> v_listed then
    raise exception 'A placement was listed more than once.' using errcode = '22023';
  end if;
  select count(*) into v_on_shelf from public.inventory_storage_placements
  where shelf_id = p_shelf_id and id = any(p_placement_ids);
  if v_on_shelf <> v_listed then
    raise exception 'Some placements are not on this shelf.' using errcode = '22023';
  end if;

  update public.inventory_storage_placements p
  set display_order = r.new_order, updated_at = now(), updated_by = v_actor, version = p.version + 1
  from (
    select pl.id,
           row_number() over (
             order by (case when pl.id = any(p_placement_ids) then 0 else 1 end),
                      coalesce(array_position(p_placement_ids, pl.id), 0),
                      pl.display_order, pl.id
           )::integer as new_order
    from public.inventory_storage_placements pl
    where pl.shelf_id = p_shelf_id
  ) r
  where p.id = r.id and p.display_order is distinct from r.new_order;

  perform private.inventory_log(p_organization_id, p_location_id, 'storage_shelf', p_shelf_id, 'update',
    jsonb_build_object('reordered', to_jsonb(p_placement_ids)));
end;
$$;
revoke all on function public.inventory_storage_placement_reorder(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.inventory_storage_placement_reorder(uuid, uuid, uuid, uuid[]) to authenticated;

-- ============================================================================
-- 7. Atomic Date Group import
--    One transaction, one receipt. Authoritative stock and the stock ledger are never touched.
--    p_rows: [{row_number, action: 'create'|'update', product_id, date_group_id, expected_version,
--              quantity, manufacture_date, manufacture_precision, expiration_date,
--              expiration_precision, notes}]
-- ============================================================================

create or replace function public.inventory_date_group_import_commit(
  p_organization_id uuid,
  p_location_id uuid,
  p_request_id uuid,
  p_filename text,
  p_fingerprint text,
  p_skipped integer,
  p_rejected integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_hash text;
  v_prior public.inventory_date_group_imports;
  v_row jsonb;
  v_row_no integer := 0;
  v_action text;
  v_product uuid;
  v_lot uuid;
  v_lot_active boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_ids uuid[] := '{}';
  v_result jsonb;
  v_receipt uuid;
  v_msg text;
  v_detail text;
  v_state text;
begin
  if p_request_id is null then
    raise exception 'A request id is required.' using errcode = '22023';
  end if;
  if p_filename is null or char_length(trim(p_filename)) not between 1 and 255 then
    raise exception 'A file name is required.' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'Choose between 1 and 5,000 date group rows to import.' using errcode = '22023';
  end if;
  if coalesce(p_skipped, 0) < 0 or coalesce(p_rejected, 0) < 0 then
    raise exception 'Invalid import counts.' using errcode = '22023';
  end if;

  v_hash := encode(sha256(convert_to(
    p_location_id::text || '|' || coalesce(p_fingerprint, '') || '|' || p_rows::text, 'utf8')), 'hex');

  -- Identical concurrent requests queue here; the second one then finds the first one's receipt.
  perform pg_advisory_xact_lock(hashtextextended('inventory_dg_import:' || p_organization_id::text || ':' || p_request_id::text, 0));

  select * into v_prior from public.inventory_date_group_imports
  where organization_id = p_organization_id and request_id = p_request_id;
  if found then
    if v_prior.location_id <> p_location_id or v_prior.payload_hash <> v_hash then
      raise exception 'That request id was already used for a different import. Preview the file again.'
        using errcode = '22023';
    end if;
    return v_prior.result || jsonb_build_object('replayed', true);
  end if;

  begin
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_row_no := coalesce((v_row ->> 'row_number')::integer, v_row_no + 1);
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'Invalid import row.' using errcode = '22023';
      end if;
      v_action := v_row ->> 'action';
      v_product := (v_row ->> 'product_id')::uuid;
      v_lot := (v_row ->> 'date_group_id')::uuid;

      if v_action = 'create' then
        if v_lot is not null or (v_row ->> 'expected_version') is not null then
          raise exception 'A new date group cannot have an id or version.' using errcode = '22023';
        end if;
        perform public.inventory_date_lot_save(
          p_organization_id, p_location_id, null, v_product,
          (v_row ->> 'quantity')::numeric,
          (v_row ->> 'manufacture_date')::date, v_row ->> 'manufacture_precision',
          (v_row ->> 'expiration_date')::date, v_row ->> 'expiration_precision',
          v_row ->> 'notes', true, null);
        v_created := v_created + 1;
      elsif v_action = 'update' then
        if v_lot is null or (v_row ->> 'expected_version') is null then
          raise exception 'An updated date group needs its id and version.' using errcode = '22023';
        end if;
        if v_lot = any(v_ids) then
          raise exception 'The same date group appears more than once in this import.' using errcode = '22023';
        end if;
        v_ids := v_ids || v_lot;
        select l.active into v_lot_active from public.inventory_date_lots l
        where l.id = v_lot and l.organization_id = p_organization_id
          and l.location_id = p_location_id and l.product_id = v_product;
        if not found then
          raise exception 'That date group is not available at this restaurant.' using errcode = '22023';
        end if;
        if not v_lot_active then
          raise exception 'That date group is archived. Restore it before importing changes.' using errcode = '22023';
        end if;
        perform public.inventory_date_lot_save(
          p_organization_id, p_location_id, v_lot, v_product,
          (v_row ->> 'quantity')::numeric,
          (v_row ->> 'manufacture_date')::date, v_row ->> 'manufacture_precision',
          (v_row ->> 'expiration_date')::date, v_row ->> 'expiration_precision',
          v_row ->> 'notes', true, (v_row ->> 'expected_version')::integer);
        v_updated := v_updated + 1;
      else
        raise exception 'Unknown import action.' using errcode = '22023';
      end if;
    end loop;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail, v_state = returned_sqlstate;
    -- The whole function (and with it every earlier row) rolls back when this is re-raised.
    raise exception 'Row %: %', v_row_no, v_msg using errcode = v_state, detail = v_detail;
  end;

  v_result := jsonb_build_object(
    'ok', true, 'created', v_created, 'updated', v_updated,
    'skipped', coalesce(p_skipped, 0), 'rejected', coalesce(p_rejected, 0), 'replayed', false);

  insert into public.inventory_date_group_imports (
    organization_id, location_id, request_id, payload_hash, filename,
    created_count, updated_count, skipped_count, rejected_count, result, actor_profile_id
  ) values (
    p_organization_id, p_location_id, p_request_id, v_hash, trim(p_filename),
    v_created, v_updated, coalesce(p_skipped, 0), coalesce(p_rejected, 0), v_result, v_actor
  ) returning id into v_receipt;

  perform private.inventory_log(p_organization_id, p_location_id, 'import', v_receipt, 'import',
    jsonb_build_object('kind', 'date_groups', 'filename', trim(p_filename),
      'created', v_created, 'updated', v_updated, 'skipped', coalesce(p_skipped, 0), 'rejected', coalesce(p_rejected, 0)));

  return v_result;
end;
$$;
revoke all on function public.inventory_date_group_import_commit(uuid, uuid, uuid, text, text, integer, integer, jsonb) from public, anon;
grant execute on function public.inventory_date_group_import_commit(uuid, uuid, uuid, text, text, integer, integer, jsonb) to authenticated;
