-- Feature V2-008 Batch B / E-1 (owner decision D-10, Option A): shared-catalog authority.
-- Migration: 20261113100000_e1_shared_catalog_authority.sql
--
-- Forward-only. No table, policy, trigger, index or data row is touched. Applied only to a
-- disposable local stack until the owner authorizes Hosted DEV (D-7).
--
-- DEFECT (reproduced in Security Gate S1, 306 probe rows): inside ONE organization a
-- location-scoped role could manage organization-wide resources.
--   * Recipes: bar_recipe_save / _set_archived / _set_image and the three category RPCs, plus
--     the recipe-images storage write policies, were authorized by private.recipes_is_manager,
--     which is true for a manager or assistant manager at ANY active location of the
--     organization (and for an organization shift manager at any location count).
--   * Inventory: the twelve inventory_{vendor,category,subcategory,product}_{create,update,
--     set_active} RPCs mutate organization-shared rows but were authorized only by the
--     location-scoped private.inventory_begin(org, location), so a location assistant manager
--     could rename a vendor or deactivate a product that every other location also uses.
--
-- POLICY (D-10 Option A) - one predicate, private.catalog_can_manage_org(org):
--   always (organization-level authority, unchanged):
--     * Overall owner / manager / assistant manager (cross-organization BY DESIGN; the Overall
--       tier is kept exactly as it is today - D-10b: this migration does not narrow it);
--     * an ACTIVE membership holding organization role owner or general_manager.
--   only while the organization has at most one ACTIVE, non-archived location (the
--   single-location compatibility exception - not a new role):
--     * an ACTIVE membership holding organization role shift_manager;
--     * an ACTIVE membership that also holds an ACTIVE manager / assistant_manager
--       location_memberships row at an ACTIVE, non-archived location of THIS organization.
--       (That join needs an active location, so "<= 1" is exactly "= 1" for this branch.
--       shift_manager keeps "<= 1" because that is the existing inventory_profile_level rule.)
--   never: location staff, inactive memberships, inactive location rows, archived locations,
--     another organization's actors, members with no qualifying row, anonymous callers, banned
--     users or revoked sessions (private.inventory_live_session()).
-- The location count is read from public.locations inside the predicate on EVERY call - never
-- from a parameter, cached flag or JWT claim - so a second active location removes the
-- exception on the very next statement and archiving back to one restores ONLY what the rows
-- already say (no membership is created or reactivated here).
--
-- Location-scoped Inventory operations (stock, counts, imports, drafts, freshness, storage
-- layout, saved views, bootstrap) keep their location-level guard private.inventory_begin and
-- are NOT touched. SELECT visibility of the shared catalog and of archived recipes is not
-- touched (recipes_is_manager / inventory_is_manager stay as they are).
--
-- Documented exemption: private.inventory_ensure_system_vendor (reached by inventory_bootstrap)
-- only ever creates the single idempotent system vendor 'Unassigned' per organization; no
-- caller-controlled content, no update, no delete.
--
-- Function bodies below were generated from the DEPLOYED definitions (pg_get_functiondef) of the
-- local stack at ledger 90; the only textual change in the twelve Inventory RPCs is
-- private.inventory_begin(...) -> private.inventory_catalog_begin(...). CREATE OR REPLACE keeps
-- owner, signature, SECURITY DEFINER, search_path = '' and every existing ACL.

create or replace function private.catalog_can_manage_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.inventory_live_session()
    and (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role in ('owner', 'manager', 'assistant_manager')
      )
      or exists (
        select 1 from public.memberships m
        where m.organization_id = p_org
          and m.profile_id = (select auth.uid())
          and m.active
          and (
            m.roles && array['owner', 'general_manager']::public.app_role[]
            or (
              (select count(*) from public.locations x
               where x.organization_id = p_org
                 and x.active
                 and x.archived_at is null) <= 1
              and (
                'shift_manager' = any(m.roles)
                or exists (
                  select 1 from public.location_memberships lm
                  join public.locations l on l.id = lm.location_id
                  where l.organization_id = p_org
                    and l.active
                    and l.archived_at is null
                    and lm.profile_id = m.profile_id
                    and lm.active
                    and lm.role in ('manager', 'assistant_manager')
                )
              )
            )
          )
      )
    );
$function$;

revoke all on function private.catalog_can_manage_org(uuid) from public, anon, authenticated;

create or replace function private.inventory_catalog_begin(p_organization_id uuid, p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
begin
  -- Location-level access, live session and module gate first (unchanged behaviour).
  v_actor := private.inventory_begin(p_organization_id, p_location_id);
  -- Then the organization-level decision for rows shared by every location.
  if not private.catalog_can_manage_org(p_organization_id) then
    raise exception 'You do not have permission to change the shared Bar Inventory catalog.'
      using errcode = '42501';
  end if;
  return v_actor;
end;
$function$;

revoke all on function private.inventory_catalog_begin(uuid, uuid) from public, anon, authenticated;

-- Recipes: every one of the six RPCs authorizes through recipes_begin; the recipe-images write
-- policies authorize through recipes_can_write_image. Both now use the shared predicate.
create or replace function private.recipes_begin(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.catalog_can_manage_org(p_org) then
    raise exception 'You do not have permission to change recipes' using errcode = '42501';
  end if;
  return v_actor;
end;
$function$;

create or replace function private.recipes_can_write_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.bar_recipes r
    where r.organization_id = (private.recipes_image_parts(p_name))[1]
      and r.id = (private.recipes_image_parts(p_name))[2]
      and r.is_active and private.catalog_can_manage_org(r.organization_id));
$function$;

-- Read-only decision for the application layer so a screen never offers a command the database
-- will refuse. Same shape as recipes_org_authorized; the decision is recomputed on every call.
create or replace function public.catalog_authorized(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.catalog_can_manage_org(p_organization_id);
$function$;

revoke all on function public.catalog_authorized(uuid) from public, anon;
grant execute on function public.catalog_authorized(uuid) to authenticated;

-- The twelve shared-catalog writers (deployed bodies; one call swapped).

CREATE OR REPLACE FUNCTION public.inventory_category_create(p_organization_id uuid, p_location_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('category name', p_name, 80);
  v_existing public.inventory_categories;
  v_id uuid;
begin
  select * into v_existing
  from public.inventory_categories c
  where c.organization_id = p_organization_id and c.name_key = private.inventory_name_key(v_name);
  if found then
    perform private.inventory_raise_duplicate(
      'category', 'name', v_existing.id, v_existing.name,
      format('A category named "%s" already exists.', v_existing.name)
    );
  end if;

  begin
    insert into public.inventory_categories (organization_id, name, created_by)
    values (p_organization_id, v_name, v_actor)
    returning id into v_id;
  exception when unique_violation then
    select * into v_existing
    from public.inventory_categories c
    where c.organization_id = p_organization_id and c.name_key = private.inventory_name_key(v_name);
    perform private.inventory_raise_duplicate(
      'category', 'name', v_existing.id, v_existing.name,
      format('A category named "%s" already exists.', v_existing.name)
    );
  end;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'category', v_id, 'create', jsonb_build_object('name', v_name)
  );
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_category_set_active(p_organization_id uuid, p_location_id uuid, p_category_id uuid, p_active boolean, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_row public.inventory_categories;
begin
  select * into v_row
  from public.inventory_categories c
  where c.id = p_category_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That category no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('category', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if v_row.active = coalesce(p_active, false) then
    return v_row.version;
  end if;

  update public.inventory_categories
  set active = coalesce(p_active, false), updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'category', v_row.id,
    case when p_active then 'reactivate' else 'archive' end,
    jsonb_build_object('active', jsonb_build_array(v_row.active, p_active))
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_category_update(p_organization_id uuid, p_location_id uuid, p_category_id uuid, p_name text, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('category name', p_name, 80);
  v_row public.inventory_categories;
  v_existing public.inventory_categories;
begin
  select * into v_row
  from public.inventory_categories c
  where c.id = p_category_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That category no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('category', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if v_row.name = v_name then
    return v_row.version;
  end if;

  select * into v_existing
  from public.inventory_categories c
  where c.organization_id = p_organization_id
    and c.name_key = private.inventory_name_key(v_name)
    and c.id <> v_row.id;
  if found then
    perform private.inventory_raise_duplicate(
      'category', 'name', v_existing.id, v_existing.name,
      format('A category named "%s" already exists.', v_existing.name)
    );
  end if;

  update public.inventory_categories
  set name = v_name, updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'category', v_row.id, 'rename',
    jsonb_build_object('name', jsonb_build_array(v_row.name, v_name))
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_product_create(p_organization_id uuid, p_location_id uuid, p_vendor_id uuid, p_name text, p_category_id uuid, p_subcategory_id uuid, p_size text, p_unit_type text, p_unit_label text, p_sku text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('product name', p_name, 160);
  v_size text := private.inventory_optional_text('size', p_size, 40);
  v_unit_label text := private.inventory_optional_text('unit label', p_unit_label, 40);
  v_sku text := private.inventory_optional_text('SKU', p_sku, 60);
  v_notes text := private.inventory_optional_text('notes', p_notes, 500);
  v_vendor public.inventory_vendors;
  v_id uuid;
begin
  perform private.inventory_ensure_system_vendor(p_organization_id, v_actor);
  perform private.inventory_validate_product(
    p_organization_id, p_vendor_id, p_category_id, p_subcategory_id, p_unit_type, v_unit_label
  );
  select * into v_vendor from public.inventory_vendors v where v.id = p_vendor_id;
  if not v_vendor.active then
    raise exception 'The vendor "%" is inactive. Reactivate it or choose another.', v_vendor.name using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories c where c.id = p_category_id and c.active
  ) then
    raise exception 'That category is archived. Reactivate it or choose another.' using errcode = '22023';
  end if;
  if p_subcategory_id is not null and not exists (
    select 1 from public.inventory_subcategories s where s.id = p_subcategory_id and s.active
  ) then
    raise exception 'That subcategory is archived. Reactivate it or choose another.' using errcode = '22023';
  end if;

  perform private.inventory_check_product_unique(
    p_organization_id, null, p_vendor_id, v_name, v_size, p_unit_type, v_unit_label, v_sku
  );

  begin
    insert into public.inventory_products (
      organization_id, vendor_id, name, category_id, subcategory_id, size, unit_type, unit_label,
      sku, notes, created_by
    ) values (
      p_organization_id, p_vendor_id, v_name, p_category_id, p_subcategory_id, v_size, p_unit_type,
      case when p_unit_type = 'other' then v_unit_label else null end,
      v_sku, v_notes, v_actor
    )
    returning id into v_id;
  exception when unique_violation then
    perform private.inventory_check_product_unique(
      p_organization_id, null, p_vendor_id, v_name, v_size, p_unit_type, v_unit_label, v_sku
    );
    raise exception 'That product already exists.' using errcode = '23505';
  end;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'product', v_id, 'create',
    jsonb_build_object('name', v_name, 'vendor_id', p_vendor_id, 'size', v_size, 'unit_type', p_unit_type)
  );
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_product_set_active(p_organization_id uuid, p_location_id uuid, p_product_id uuid, p_active boolean, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_row public.inventory_products;
  v_vendor public.inventory_vendors;
begin
  select * into v_row
  from public.inventory_products p
  where p.id = p_product_id and p.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('product', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if v_row.active = coalesce(p_active, false) then
    return v_row.version;
  end if;

  if p_active then
    select * into v_vendor from public.inventory_vendors v where v.id = v_row.vendor_id;
    if not v_vendor.active then
      raise exception 'Reactivate the vendor "%" first.', v_vendor.name using errcode = '22023';
    end if;
    -- The active-identity/SKU rule applies again once the product is active.
    perform private.inventory_check_product_unique(
      p_organization_id, v_row.id, v_row.vendor_id, v_row.name, v_row.size,
      v_row.unit_type, v_row.unit_label, v_row.sku
    );
  end if;

  update public.inventory_products
  set active = coalesce(p_active, false),
      archived_at = case when coalesce(p_active, false) then null else now() end,
      updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'product', v_row.id,
    case when p_active then 'reactivate' else 'archive' end,
    jsonb_build_object('active', jsonb_build_array(v_row.active, p_active))
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_product_update(p_organization_id uuid, p_location_id uuid, p_product_id uuid, p_vendor_id uuid, p_name text, p_category_id uuid, p_subcategory_id uuid, p_size text, p_unit_type text, p_unit_label text, p_sku text, p_notes text, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('product name', p_name, 160);
  v_size text := private.inventory_optional_text('size', p_size, 40);
  v_unit_label text := private.inventory_optional_text('unit label', p_unit_label, 40);
  v_sku text := private.inventory_optional_text('SKU', p_sku, 60);
  v_notes text := private.inventory_optional_text('notes', p_notes, 500);
  v_row public.inventory_products;
  v_vendor public.inventory_vendors;
  v_new_label text := case when p_unit_type = 'other' then v_unit_label else null end;
  v_diff jsonb;
begin
  select * into v_row
  from public.inventory_products p
  where p.id = p_product_id and p.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('product', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if not v_row.active then
    raise exception 'Reactivate this product before editing it.' using errcode = '22023';
  end if;

  perform private.inventory_validate_product(
    p_organization_id, p_vendor_id, p_category_id, p_subcategory_id, p_unit_type, v_unit_label
  );

  v_diff := private.inventory_diff(
    jsonb_build_object(
      'vendor_id', v_row.vendor_id, 'name', v_row.name, 'category_id', v_row.category_id,
      'subcategory_id', v_row.subcategory_id, 'size', v_row.size, 'unit_type', v_row.unit_type,
      'unit_label', v_row.unit_label, 'sku', v_row.sku, 'notes', v_row.notes
    ),
    jsonb_build_object(
      'vendor_id', p_vendor_id, 'name', v_name, 'category_id', p_category_id,
      'subcategory_id', p_subcategory_id, 'size', v_size, 'unit_type', p_unit_type,
      'unit_label', v_new_label, 'sku', v_sku, 'notes', v_notes
    ),
    array['vendor_id', 'name', 'category_id', 'subcategory_id', 'size', 'unit_type', 'unit_label', 'sku', 'notes']
  );
  if v_diff = '{}'::jsonb then
    return v_row.version;
  end if;

  if p_vendor_id <> v_row.vendor_id then
    select * into v_vendor from public.inventory_vendors v where v.id = p_vendor_id;
    if not v_vendor.active then
      raise exception 'The vendor "%" is inactive. Reactivate it or choose another.', v_vendor.name using errcode = '22023';
    end if;
  end if;
  if p_category_id is distinct from v_row.category_id and p_category_id is not null and not exists (
    select 1 from public.inventory_categories c where c.id = p_category_id and c.active
  ) then
    raise exception 'That category is archived. Reactivate it or choose another.' using errcode = '22023';
  end if;
  if p_subcategory_id is distinct from v_row.subcategory_id and p_subcategory_id is not null and not exists (
    select 1 from public.inventory_subcategories s where s.id = p_subcategory_id and s.active
  ) then
    raise exception 'That subcategory is archived. Reactivate it or choose another.' using errcode = '22023';
  end if;

  perform private.inventory_check_product_unique(
    p_organization_id, v_row.id, p_vendor_id, v_name, v_size, p_unit_type, v_unit_label, v_sku
  );

  begin
    update public.inventory_products
    set vendor_id = p_vendor_id, name = v_name, category_id = p_category_id,
        subcategory_id = p_subcategory_id, size = v_size, unit_type = p_unit_type,
        unit_label = v_new_label, sku = v_sku, notes = v_notes,
        updated_by = v_actor, updated_at = now(), version = version + 1
    where id = v_row.id;
  exception when unique_violation then
    perform private.inventory_check_product_unique(
      p_organization_id, v_row.id, p_vendor_id, v_name, v_size, p_unit_type, v_unit_label, v_sku
    );
    raise exception 'That product already exists.' using errcode = '23505';
  end;

  perform private.inventory_log(p_organization_id, p_location_id, 'product', v_row.id, 'update', v_diff);
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_subcategory_create(p_organization_id uuid, p_location_id uuid, p_category_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('subcategory name', p_name, 80);
  v_category public.inventory_categories;
  v_existing public.inventory_subcategories;
  v_id uuid;
begin
  select * into v_category
  from public.inventory_categories c
  where c.id = p_category_id and c.organization_id = p_organization_id;
  if not found then
    raise exception 'Choose a category for the subcategory.' using errcode = '22023';
  end if;
  if not v_category.active then
    raise exception 'Reactivate the category "%" first.', v_category.name using errcode = '22023';
  end if;

  select * into v_existing
  from public.inventory_subcategories s
  where s.category_id = p_category_id and s.name_key = private.inventory_name_key(v_name);
  if found then
    perform private.inventory_raise_duplicate(
      'subcategory', 'name', v_existing.id, v_existing.name,
      format('"%s" already has a subcategory named "%s".', v_category.name, v_existing.name)
    );
  end if;

  begin
    insert into public.inventory_subcategories (organization_id, category_id, name, created_by)
    values (p_organization_id, p_category_id, v_name, v_actor)
    returning id into v_id;
  exception when unique_violation then
    select * into v_existing
    from public.inventory_subcategories s
    where s.category_id = p_category_id and s.name_key = private.inventory_name_key(v_name);
    perform private.inventory_raise_duplicate(
      'subcategory', 'name', v_existing.id, v_existing.name,
      format('"%s" already has a subcategory named "%s".', v_category.name, v_existing.name)
    );
  end;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'subcategory', v_id, 'create',
    jsonb_build_object('name', v_name, 'category_id', p_category_id)
  );
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_subcategory_set_active(p_organization_id uuid, p_location_id uuid, p_subcategory_id uuid, p_active boolean, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_row public.inventory_subcategories;
  v_category public.inventory_categories;
begin
  select * into v_row
  from public.inventory_subcategories s
  where s.id = p_subcategory_id and s.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That subcategory no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('subcategory', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if v_row.active = coalesce(p_active, false) then
    return v_row.version;
  end if;
  if p_active then
    select * into v_category from public.inventory_categories c where c.id = v_row.category_id;
    if not v_category.active then
      raise exception 'Reactivate the category "%" first.', v_category.name using errcode = '22023';
    end if;
  end if;

  update public.inventory_subcategories
  set active = coalesce(p_active, false), updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'subcategory', v_row.id,
    case when p_active then 'reactivate' else 'archive' end,
    jsonb_build_object('active', jsonb_build_array(v_row.active, p_active))
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_subcategory_update(p_organization_id uuid, p_location_id uuid, p_subcategory_id uuid, p_name text, p_category_id uuid, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('subcategory name', p_name, 80);
  v_row public.inventory_subcategories;
  v_category public.inventory_categories;
  v_existing public.inventory_subcategories;
  v_diff jsonb;
begin
  select * into v_row
  from public.inventory_subcategories s
  where s.id = p_subcategory_id and s.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That subcategory no longer exists.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('subcategory', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;

  select * into v_category
  from public.inventory_categories c
  where c.id = p_category_id and c.organization_id = p_organization_id;
  if not found then
    raise exception 'Choose a category for the subcategory.' using errcode = '22023';
  end if;

  v_diff := private.inventory_diff(
    jsonb_build_object('name', v_row.name, 'category_id', v_row.category_id),
    jsonb_build_object('name', v_name, 'category_id', p_category_id),
    array['name', 'category_id']
  );
  if v_diff = '{}'::jsonb then
    return v_row.version;
  end if;

  if p_category_id <> v_row.category_id then
    if not v_category.active then
      raise exception 'Reactivate the category "%" first.', v_category.name using errcode = '22023';
    end if;
    if exists (
      select 1 from public.inventory_products p where p.subcategory_id = v_row.id
    ) then
      raise exception 'Products still use this subcategory. Change those products first.' using errcode = '22023';
    end if;
  end if;

  select * into v_existing
  from public.inventory_subcategories s
  where s.category_id = p_category_id
    and s.name_key = private.inventory_name_key(v_name)
    and s.id <> v_row.id;
  if found then
    perform private.inventory_raise_duplicate(
      'subcategory', 'name', v_existing.id, v_existing.name,
      format('"%s" already has a subcategory named "%s".', v_category.name, v_existing.name)
    );
  end if;

  update public.inventory_subcategories
  set name = v_name, category_id = p_category_id, updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'subcategory', v_row.id,
    case when v_diff ? 'name' then 'rename' else 'update' end, v_diff
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_vendor_create(p_organization_id uuid, p_location_id uuid, p_name text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('vendor name', p_name, 120);
  v_notes text := private.inventory_optional_text('vendor notes', p_notes, 500);
  v_existing public.inventory_vendors;
  v_id uuid;
begin
  perform private.inventory_ensure_system_vendor(p_organization_id, v_actor);

  select * into v_existing
  from public.inventory_vendors v
  where v.organization_id = p_organization_id
    and v.name_key = private.inventory_name_key(v_name);
  if found then
    perform private.inventory_raise_duplicate(
      'vendor', 'name', v_existing.id, v_existing.name,
      format('A vendor named "%s" already exists.', v_existing.name)
    );
  end if;

  begin
    insert into public.inventory_vendors (organization_id, name, notes, created_by)
    values (p_organization_id, v_name, v_notes, v_actor)
    returning id into v_id;
  exception when unique_violation then
    select * into v_existing
    from public.inventory_vendors v
    where v.organization_id = p_organization_id
      and v.name_key = private.inventory_name_key(v_name);
    perform private.inventory_raise_duplicate(
      'vendor', 'name', v_existing.id, v_existing.name,
      format('A vendor named "%s" already exists.', v_existing.name)
    );
  end;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'vendor', v_id, 'create',
    jsonb_build_object('name', v_name)
  );
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_vendor_set_active(p_organization_id uuid, p_location_id uuid, p_vendor_id uuid, p_active boolean, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_row public.inventory_vendors;
begin
  select * into v_row
  from public.inventory_vendors v
  where v.id = p_vendor_id and v.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if v_row.is_system then
    raise exception 'The Unassigned vendor cannot be changed.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('vendor', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;
  if v_row.active = coalesce(p_active, false) then
    return v_row.version;
  end if;

  update public.inventory_vendors
  set active = coalesce(p_active, false), updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'vendor', v_row.id,
    case when p_active then 'reactivate' else 'archive' end,
    jsonb_build_object('active', jsonb_build_array(v_row.active, p_active))
  );
  return v_row.version + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_vendor_update(p_organization_id uuid, p_location_id uuid, p_vendor_id uuid, p_name text, p_notes text, p_expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.inventory_catalog_begin(p_organization_id, p_location_id);
  v_name text := private.inventory_valid_name('vendor name', p_name, 120);
  v_notes text := private.inventory_optional_text('vendor notes', p_notes, 500);
  v_row public.inventory_vendors;
  v_existing public.inventory_vendors;
  v_diff jsonb;
begin
  -- Keep the reserved name "Unassigned" taken before anyone can rename into it.
  perform private.inventory_ensure_system_vendor(p_organization_id, v_actor);

  select * into v_row
  from public.inventory_vendors v
  where v.id = p_vendor_id and v.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if v_row.is_system then
    raise exception 'The Unassigned vendor cannot be changed.' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    perform private.inventory_raise_stale('vendor', v_row.id, p_organization_id, v_row.version, v_row.updated_by, v_row.updated_at);
  end if;

  v_diff := private.inventory_diff(
    jsonb_build_object('name', v_row.name, 'notes', v_row.notes),
    jsonb_build_object('name', v_name, 'notes', v_notes),
    array['name', 'notes']
  );
  if v_diff = '{}'::jsonb then
    return v_row.version;
  end if;

  select * into v_existing
  from public.inventory_vendors v
  where v.organization_id = p_organization_id
    and v.name_key = private.inventory_name_key(v_name)
    and v.id <> v_row.id;
  if found then
    perform private.inventory_raise_duplicate(
      'vendor', 'name', v_existing.id, v_existing.name,
      format('A vendor named "%s" already exists.', v_existing.name)
    );
  end if;

  update public.inventory_vendors
  set name = v_name, notes = v_notes, updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_row.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'vendor', v_row.id,
    case when v_diff ? 'name' then 'rename' else 'update' end, v_diff
  );
  return v_row.version + 1;
end;
$function$;
