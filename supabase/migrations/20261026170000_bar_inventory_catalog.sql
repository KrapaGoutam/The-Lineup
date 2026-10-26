-- Bar Inventory V1 / BI-1 -- organization-level catalog: vendors, categories,
-- subcategories, products, the non-quantity change log, authorization helpers
-- and the trusted catalog RPCs.
--
-- Shape (mirrors Tasks V1 / Table Rotation V2; see
-- docs/features/bar-inventory-v1/DATA_MODEL.md and SECURITY_AND_ROLES.md)
--   * Catalog is ORGANIZATION-level (owner decision D5). Stock, quantities and
--     the adjustment ledger are LOCATION-level and arrive in BI-2. Every RPC
--     still takes p_location_id so the single access seam
--     private.inventory_can_access_location is the only thing a future
--     multi-location change has to touch.
--   * Authenticated clients receive SELECT only; every write is a SECURITY
--     DEFINER public.inventory_* RPC with an empty search_path that reads
--     auth.uid(), requires an ACTIVE management membership (owner |
--     general_manager | shift_manager -- membership only, never
--     organizations.created_by, see #106) and validates every id against the
--     caller's organization. Staff (host | server) get nothing (D1).
--   * Vendors are structured entities (D2). The system vendor "Unassigned" is
--     created lazily per organization by inventory_bootstrap and is immutable.
--     Nothing here deletes a vendor/category/product: deactivate/archive only,
--     and foreign keys protect referenced rows.
--   * Matching keys (name_key, size_key, sku_key, unit_key) are GENERATED from
--     the display values by immutable functions, so they cannot drift and a
--     client can never supply one. Proven against
--     tests/fixtures/bar-inventory/keys-vectors.json.
--   * Optimistic concurrency: every mutable row has `version`; update RPCs take
--     p_expected_version and answer a stale write with PT409 kind 'stale'
--     (current version, who, when). Identical re-submits are no-ops.
--   * Plain-language errors with 42501 (permission) / 22023 (validation) /
--     23505 (duplicate, detail names the existing row) / PT409 (stale).
--
-- Forward-only. BI-2 adds stock/ledger in its own migration.

-- ---------------------------------------------------------------------
-- 1. Normalization-key functions (immutable; shared vectors in tests/fixtures)
-- ---------------------------------------------------------------------
-- nameKey: NFKD-normalize, drop combining marks, lowercase, keep letters and
-- digits only. "Del Papa" / "DelPapa" / "DEL PAPA" -> delpapa; "Tito's" ->
-- titos. NULL when nothing is left ("---").
create or replace function private.inventory_name_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(regexp_replace(normalize(coalesce(p_value, ''), nfkd), '[̀-ͯ]', '', 'g')),
      '[^[:alnum:]]', '', 'g'
    ),
    ''
  );
$$;

-- sizeKey: lowercase, no whitespace, leading number without trailing zeros
-- ("750 mL" -> 750ml, "1.750 L" -> 1.75l, "1.0 L" -> 1l). No unit conversion.
create or replace function private.inventory_size_key(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text := lower(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
  v_match text[];
  v_frac text;
begin
  v_match := regexp_match(v_key, '^(\d+)(?:\.(\d+))?(.*)$');
  if v_match is null then
    return v_key;
  end if;
  v_frac := rtrim(coalesce(v_match[2], ''), '0');
  return v_match[1] || case when v_frac <> '' then '.' || v_frac else '' end || v_match[3];
end;
$$;

-- skuKey: whitespace removed, uppercase, punctuation kept; NULL when blank.
create or replace function private.inventory_sku_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g')), '');
$$;

-- unitKey: curated types are their own key; 'other' is 'other:<nameKey(label)>'
-- and needs a label. NULL for anything else (rejected by NOT NULL / checks).
create or replace function private.inventory_unit_key(p_unit_type text, p_unit_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit_type in ('bottle', 'can', 'pack', 'case', 'keg') then p_unit_type
    when p_unit_type = 'other' and private.inventory_name_key(p_unit_label) is not null
      then 'other:' || private.inventory_name_key(p_unit_label)
    else null
  end;
$$;

-- Display text: trimmed, inner whitespace collapsed to single spaces.
create or replace function private.inventory_clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g');
$$;

-- ---------------------------------------------------------------------
-- 2. Tables (organization-level catalog)
-- ---------------------------------------------------------------------
create table public.inventory_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  name_key text generated always as (private.inventory_name_key(name)) stored not null,
  is_system boolean not null default false,
  active boolean not null default true,
  notes text check (notes is null or length(notes) <= 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  unique (organization_id, name_key),
  constraint inventory_vendors_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint inventory_vendors_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id),
  constraint inventory_vendors_system_active check (not is_system or active)
);

-- Exactly one system vendor ("Unassigned") per organization.
create unique index inventory_vendors_system_uidx on public.inventory_vendors (organization_id) where is_system;

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  name_key text generated always as (private.inventory_name_key(name)) stored not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  unique (organization_id, name_key),
  constraint inventory_categories_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint inventory_categories_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

create table public.inventory_subcategories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  name_key text generated always as (private.inventory_name_key(name)) stored not null,
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  unique (id, category_id),
  unique (category_id, name_key),
  constraint inventory_subcategories_category_fk
    foreign key (category_id, organization_id) references public.inventory_categories (id, organization_id),
  constraint inventory_subcategories_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint inventory_subcategories_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vendor_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  name_key text generated always as (private.inventory_name_key(name)) stored not null,
  category_id uuid,
  subcategory_id uuid,
  size text check (size is null or length(trim(size)) between 1 and 40),
  size_key text generated always as (private.inventory_size_key(size)) stored not null,
  unit_type text not null check (unit_type in ('bottle', 'can', 'pack', 'case', 'keg', 'other')),
  unit_label text check (unit_label is null or length(trim(unit_label)) between 1 and 40),
  unit_key text generated always as (private.inventory_unit_key(unit_type, unit_label)) stored not null,
  sku text check (sku is null or length(trim(sku)) between 1 and 60),
  sku_key text generated always as (private.inventory_sku_key(sku)) stored,
  notes text check (notes is null or length(notes) <= 500),
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  constraint inventory_products_vendor_fk
    foreign key (vendor_id, organization_id) references public.inventory_vendors (id, organization_id),
  constraint inventory_products_category_fk
    foreign key (category_id, organization_id) references public.inventory_categories (id, organization_id),
  -- The subcategory must belong to the product's category (MATCH SIMPLE only
  -- enforces this when both are set; the check below forbids a lone subcategory).
  constraint inventory_products_subcategory_fk
    foreign key (subcategory_id, category_id) references public.inventory_subcategories (id, category_id),
  constraint inventory_products_subcategory_needs_category
    check (subcategory_id is null or category_id is not null),
  constraint inventory_products_unit_label_rule
    check ((unit_type = 'other') = (unit_label is not null)),
  constraint inventory_products_archive_consistency
    check ((active and archived_at is null) or (not active and archived_at is not null)),
  constraint inventory_products_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint inventory_products_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

-- Catalog identity (owner brief: vendor + name + size + unit). An archived
-- product does not block re-creating the same product.
create unique index inventory_products_identity_uidx
  on public.inventory_products (organization_id, vendor_id, name_key, size_key, unit_key)
  where active;
-- SKU is a stronger key for import when present.
create unique index inventory_products_sku_uidx
  on public.inventory_products (organization_id, sku_key)
  where sku_key is not null and active;

-- Non-quantity audit trail (quantity changes get their own ledger in BI-2).
create table public.inventory_change_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid,
  entity_type text not null check (entity_type in
    ('vendor', 'category', 'subcategory', 'product', 'stock_levels', 'export', 'import')),
  entity_id uuid,
  action text not null check (action in
    ('create', 'update', 'rename', 'archive', 'reactivate', 'export', 'import')),
  diff jsonb not null default '{}'::jsonb,
  actor_profile_id uuid not null,
  created_at timestamptz not null default now(),
  constraint inventory_change_log_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint inventory_change_log_actor_fk
    foreign key (organization_id, actor_profile_id) references public.memberships (organization_id, profile_id)
);

-- Indexes: every foreign key that is not already the leading column of a
-- unique index (and the common read paths).
create index inventory_vendors_creator_idx on public.inventory_vendors (organization_id, created_by);
create index inventory_vendors_updater_idx on public.inventory_vendors (organization_id, updated_by) where updated_by is not null;
create index inventory_categories_creator_idx on public.inventory_categories (organization_id, created_by);
create index inventory_categories_updater_idx on public.inventory_categories (organization_id, updated_by) where updated_by is not null;
create index inventory_subcategories_category_idx on public.inventory_subcategories (category_id, organization_id);
create index inventory_subcategories_creator_idx on public.inventory_subcategories (organization_id, created_by);
create index inventory_subcategories_updater_idx on public.inventory_subcategories (organization_id, updated_by) where updated_by is not null;
create index inventory_products_vendor_idx on public.inventory_products (vendor_id, organization_id);
create index inventory_products_category_idx on public.inventory_products (category_id, organization_id) where category_id is not null;
create index inventory_products_subcategory_idx on public.inventory_products (subcategory_id, category_id) where subcategory_id is not null;
create index inventory_products_creator_idx on public.inventory_products (organization_id, created_by);
create index inventory_products_updater_idx on public.inventory_products (organization_id, updated_by) where updated_by is not null;
create index inventory_products_org_active_idx on public.inventory_products (organization_id, active);
create index inventory_change_log_org_created_idx on public.inventory_change_log (organization_id, created_at desc);
create index inventory_change_log_entity_idx on public.inventory_change_log (entity_type, entity_id, id desc);
create index inventory_change_log_actor_idx on public.inventory_change_log (organization_id, actor_profile_id);
create index inventory_change_log_location_idx on public.inventory_change_log (location_id, organization_id) where location_id is not null;

-- ---------------------------------------------------------------------
-- 3. Authorization helpers (membership-only; one seam per concern)
-- ---------------------------------------------------------------------
-- Owner / Manager / Assistant Manager = owner | general_manager | shift_manager.
create or replace function private.inventory_is_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.active
      and m.roles && array['owner', 'general_manager', 'shift_manager']::public.app_role[]
  );
$$;

-- The single seam for "may this caller use Bar Inventory at this location".
-- Today every active manager works every location of the organization; the
-- future per-location access change touches THIS function only.
create or replace function private.inventory_can_access_location(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_is_manager(p_organization_id)
    and exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.organization_id = p_organization_id
    );
$$;

revoke all on function private.inventory_is_manager(uuid) from public, anon;
revoke all on function private.inventory_can_access_location(uuid, uuid) from public, anon;
grant execute on function private.inventory_is_manager(uuid) to authenticated;
grant execute on function private.inventory_can_access_location(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Guards: append-only change log, immutable system vendor
-- ---------------------------------------------------------------------
create or replace function private.inventory_change_log_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascading deletes (organization removal) run at trigger depth > 1.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Inventory history is append-only.' using errcode = '23514';
end;
$$;

create or replace function private.inventory_change_log_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory history is append-only.' using errcode = '23514';
end;
$$;

revoke all on function private.inventory_change_log_append_only() from public, anon, authenticated;
revoke all on function private.inventory_change_log_no_truncate() from public, anon, authenticated;

create trigger inventory_change_log_append_only
  before update or delete on public.inventory_change_log
  for each row execute function private.inventory_change_log_append_only();
create trigger inventory_change_log_no_truncate
  before truncate on public.inventory_change_log
  for each statement execute function private.inventory_change_log_no_truncate();

create or replace function private.inventory_vendors_system_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system and pg_trigger_depth() <= 1 then
      raise exception 'The Unassigned vendor cannot be removed.' using errcode = '23514';
    end if;
    return old;
  end if;
  if old.is_system and (
       new.name is distinct from old.name
    or new.is_system is distinct from old.is_system
    or new.active is distinct from old.active
  ) then
    raise exception 'The Unassigned vendor cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.inventory_vendors_system_guard() from public, anon, authenticated;

create trigger inventory_vendors_system_guard
  before update or delete on public.inventory_vendors
  for each row execute function private.inventory_vendors_system_guard();

-- ---------------------------------------------------------------------
-- 5. RLS and grants: clients read (management only), RPCs write
-- ---------------------------------------------------------------------
alter table public.inventory_vendors enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_subcategories enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_change_log enable row level security;

revoke all on table
  public.inventory_vendors,
  public.inventory_categories,
  public.inventory_subcategories,
  public.inventory_products,
  public.inventory_change_log
from public, anon, authenticated;

grant select on table
  public.inventory_vendors,
  public.inventory_categories,
  public.inventory_subcategories,
  public.inventory_products,
  public.inventory_change_log
to authenticated;

create policy inventory_vendors_select on public.inventory_vendors
  for select to authenticated using (private.inventory_is_manager(organization_id));
create policy inventory_categories_select on public.inventory_categories
  for select to authenticated using (private.inventory_is_manager(organization_id));
create policy inventory_subcategories_select on public.inventory_subcategories
  for select to authenticated using (private.inventory_is_manager(organization_id));
create policy inventory_products_select on public.inventory_products
  for select to authenticated using (private.inventory_is_manager(organization_id));
create policy inventory_change_log_select on public.inventory_change_log
  for select to authenticated
  using (
    private.inventory_is_manager(organization_id)
    and (location_id is null or private.inventory_can_access_location(organization_id, location_id))
  );

-- ---------------------------------------------------------------------
-- 6. Internal write helpers (not callable by clients)
-- ---------------------------------------------------------------------
create or replace function private.inventory_begin(p_organization_id uuid, p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if not private.inventory_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to Bar Inventory for this location.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

-- Display name and validation of a catalog name; raises 22023.
create or replace function private.inventory_valid_name(p_label text, p_value text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := private.inventory_clean_text(p_value);
begin
  if v_name = '' then
    raise exception 'Enter a %.', p_label using errcode = '22023';
  end if;
  if length(v_name) > p_max then
    raise exception 'The % can be at most % characters.', p_label, p_max using errcode = '22023';
  end if;
  if private.inventory_name_key(v_name) is null then
    raise exception 'The % needs at least one letter or number.', p_label using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Optional free text: trimmed, NULL when blank, length-checked.
create or replace function private.inventory_optional_text(p_label text, p_value text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(private.inventory_clean_text(p_value), '');
begin
  if v_text is not null and length(v_text) > p_max then
    raise exception 'The % can be at most % characters.', p_label, p_max using errcode = '22023';
  end if;
  return v_text;
end;
$$;

create or replace function private.inventory_log(
  p_organization_id uuid,
  p_location_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_diff jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.inventory_change_log
    (organization_id, location_id, entity_type, entity_id, action, diff, actor_profile_id)
  values
    (p_organization_id, p_location_id, p_entity_type, p_entity_id, p_action,
     coalesce(p_diff, '{}'::jsonb), (select auth.uid()));
$$;

-- {field: [old, new]} for the keys that changed.
create or replace function private.inventory_diff(p_old jsonb, p_new jsonb, p_keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(k, jsonb_build_array(p_old -> k, p_new -> k))
      filter (where (p_old -> k) is distinct from (p_new -> k)),
    '{}'::jsonb
  )
  from unnest(p_keys) as k;
$$;

-- Always raises PT409 kind 'stale' with who changed the row and when.
create or replace function private.inventory_raise_stale(
  p_entity text,
  p_id uuid,
  p_organization_id uuid,
  p_current_version integer,
  p_updated_by uuid,
  p_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select pr.display_name into v_name from public.profiles pr where pr.id = p_updated_by;
  raise exception 'Someone else changed this %. Review the latest and try again.', p_entity
    using errcode = 'PT409',
          detail = jsonb_build_object(
            'kind', 'stale',
            'entity', p_entity,
            'id', p_id,
            'current_version', p_current_version,
            'updated_by', v_name,
            'updated_at', p_updated_at
          )::text;
end;
$$;

-- Raises 23505 naming the existing row so the UI can say which one collides.
create or replace function private.inventory_raise_duplicate(
  p_entity text,
  p_field text,
  p_existing_id uuid,
  p_existing_label text,
  p_message text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_message
    using errcode = '23505',
          detail = jsonb_build_object(
            'kind', 'duplicate',
            'entity', p_entity,
            'field', p_field,
            'existing_id', p_existing_id,
            'existing_label', p_existing_label
          )::text;
end;
$$;

-- The system vendor "Unassigned": idempotent, created lazily for the org.
create or replace function private.inventory_ensure_system_vendor(
  p_organization_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select v.id into v_id
  from public.inventory_vendors v
  where v.organization_id = p_organization_id and v.is_system;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.inventory_vendors (organization_id, name, is_system, created_by)
  values (p_organization_id, 'Unassigned', true, p_actor)
  on conflict (organization_id) where is_system do nothing
  returning id into v_id;
  if v_id is null then
    select v.id into v_id
    from public.inventory_vendors v
    where v.organization_id = p_organization_id and v.is_system;
  end if;
  return v_id;
end;
$$;

revoke all on function private.inventory_begin(uuid, uuid) from public, anon, authenticated;
revoke all on function private.inventory_valid_name(text, text, integer) from public, anon, authenticated;
revoke all on function private.inventory_optional_text(text, text, integer) from public, anon, authenticated;
revoke all on function private.inventory_log(uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.inventory_diff(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function private.inventory_raise_stale(text, uuid, uuid, integer, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.inventory_raise_duplicate(text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function private.inventory_ensure_system_vendor(uuid, uuid) from public, anon, authenticated;
revoke all on function private.inventory_name_key(text) from public, anon, authenticated;
revoke all on function private.inventory_size_key(text) from public, anon, authenticated;
revoke all on function private.inventory_sku_key(text) from public, anon, authenticated;
revoke all on function private.inventory_unit_key(text, text) from public, anon, authenticated;
revoke all on function private.inventory_clean_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RPCs: bootstrap + vendors
-- ---------------------------------------------------------------------
-- Idempotent; returns the id of the system "Unassigned" vendor.
create or replace function public.inventory_bootstrap(p_organization_id uuid, p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
begin
  return private.inventory_ensure_system_vendor(p_organization_id, v_actor);
end;
$$;

create or replace function public.inventory_vendor_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_name text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_vendor_update(
  p_organization_id uuid,
  p_location_id uuid,
  p_vendor_id uuid,
  p_name text,
  p_notes text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_vendor_set_active(
  p_organization_id uuid,
  p_location_id uuid,
  p_vendor_id uuid,
  p_active boolean,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

-- ---------------------------------------------------------------------
-- 8. RPCs: categories and subcategories
-- ---------------------------------------------------------------------
create or replace function public.inventory_category_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_category_update(
  p_organization_id uuid,
  p_location_id uuid,
  p_category_id uuid,
  p_name text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_category_set_active(
  p_organization_id uuid,
  p_location_id uuid,
  p_category_id uuid,
  p_active boolean,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_subcategory_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_category_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

-- Rename and/or move to another category. Products that use the subcategory
-- keep their (category, subcategory) pair consistent, so a move is refused
-- while any product still uses it under the old category.
create or replace function public.inventory_subcategory_update(
  p_organization_id uuid,
  p_location_id uuid,
  p_subcategory_id uuid,
  p_name text,
  p_category_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_subcategory_set_active(
  p_organization_id uuid,
  p_location_id uuid,
  p_subcategory_id uuid,
  p_active boolean,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

-- ---------------------------------------------------------------------
-- 9. RPCs: products
-- ---------------------------------------------------------------------
-- Shared validation for create/update. Raises 22023 with plain language;
-- returns the cleaned values so both RPCs write exactly what was validated.
create or replace function private.inventory_validate_product(
  p_organization_id uuid,
  p_vendor_id uuid,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_unit_type text,
  p_unit_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor public.inventory_vendors;
  v_category public.inventory_categories;
  v_sub public.inventory_subcategories;
begin
  select * into v_vendor
  from public.inventory_vendors v
  where v.id = p_vendor_id and v.organization_id = p_organization_id;
  if not found then
    raise exception 'Choose a vendor (or Unassigned).' using errcode = '22023';
  end if;

  if p_category_id is not null then
    select * into v_category
    from public.inventory_categories c
    where c.id = p_category_id and c.organization_id = p_organization_id;
    if not found then
      raise exception 'That category no longer exists.' using errcode = '22023';
    end if;
  end if;

  if p_subcategory_id is not null then
    if p_category_id is null then
      raise exception 'Pick a category before choosing a subcategory.' using errcode = '22023';
    end if;
    select * into v_sub
    from public.inventory_subcategories s
    where s.id = p_subcategory_id and s.category_id = p_category_id and s.organization_id = p_organization_id;
    if not found then
      raise exception 'That subcategory does not belong to the chosen category.' using errcode = '22023';
    end if;
  end if;

  if p_unit_type is null or p_unit_type not in ('bottle', 'can', 'pack', 'case', 'keg', 'other') then
    raise exception 'Choose a unit: Bottle, Can, Pack, Case, Keg or Other.' using errcode = '22023';
  end if;
  if p_unit_type = 'other' and private.inventory_name_key(p_unit_label) is null then
    raise exception 'Name the unit when you choose Other.' using errcode = '22023';
  end if;
  if p_unit_type <> 'other' and nullif(trim(coalesce(p_unit_label, '')), '') is not null then
    raise exception 'A unit label is only used with Other.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.inventory_validate_product(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- Reports an identity or SKU collision against another ACTIVE product.
create or replace function private.inventory_check_product_unique(
  p_organization_id uuid,
  p_self_id uuid,
  p_vendor_id uuid,
  p_name text,
  p_size text,
  p_unit_type text,
  p_unit_label text,
  p_sku text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other public.inventory_products;
  v_vendor_name text;
begin
  select * into v_other
  from public.inventory_products p
  where p.organization_id = p_organization_id
    and p.active
    and p.id is distinct from p_self_id
    and p.vendor_id = p_vendor_id
    and p.name_key = private.inventory_name_key(p_name)
    and p.size_key = private.inventory_size_key(p_size)
    and p.unit_key = private.inventory_unit_key(p_unit_type, p_unit_label);
  if found then
    select v.name into v_vendor_name from public.inventory_vendors v where v.id = v_other.vendor_id;
    perform private.inventory_raise_duplicate(
      'product', 'identity', v_other.id, v_other.name,
      format('That product already exists: "%s"%s (%s).', v_other.name,
        case when v_other.size is not null then ' ' || v_other.size else '' end, v_vendor_name)
    );
  end if;

  if private.inventory_sku_key(p_sku) is not null then
    select * into v_other
    from public.inventory_products p
    where p.organization_id = p_organization_id
      and p.active
      and p.id is distinct from p_self_id
      and p.sku_key = private.inventory_sku_key(p_sku);
    if found then
      perform private.inventory_raise_duplicate(
        'product', 'sku', v_other.id, v_other.name,
        format('SKU "%s" is already used by "%s".', p_sku, v_other.name)
      );
    end if;
  end if;
end;
$$;

revoke all on function private.inventory_check_product_unique(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.inventory_product_create(
  p_organization_id uuid,
  p_location_id uuid,
  p_vendor_id uuid,
  p_name text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_size text,
  p_unit_type text,
  p_unit_label text,
  p_sku text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_product_update(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_vendor_id uuid,
  p_name text,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_size text,
  p_unit_type text,
  p_unit_label text,
  p_sku text,
  p_notes text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

create or replace function public.inventory_product_set_active(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_active boolean,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
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
$$;

-- ---------------------------------------------------------------------
-- 10. Execute grants for the RPC surface (authenticated only)
-- ---------------------------------------------------------------------
revoke all on function public.inventory_bootstrap(uuid, uuid) from public, anon;
revoke all on function public.inventory_vendor_create(uuid, uuid, text, text) from public, anon;
revoke all on function public.inventory_vendor_update(uuid, uuid, uuid, text, text, integer) from public, anon;
revoke all on function public.inventory_vendor_set_active(uuid, uuid, uuid, boolean, integer) from public, anon;
revoke all on function public.inventory_category_create(uuid, uuid, text) from public, anon;
revoke all on function public.inventory_category_update(uuid, uuid, uuid, text, integer) from public, anon;
revoke all on function public.inventory_category_set_active(uuid, uuid, uuid, boolean, integer) from public, anon;
revoke all on function public.inventory_subcategory_create(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.inventory_subcategory_update(uuid, uuid, uuid, text, uuid, integer) from public, anon;
revoke all on function public.inventory_subcategory_set_active(uuid, uuid, uuid, boolean, integer) from public, anon;
revoke all on function public.inventory_product_create(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.inventory_product_update(uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, text, integer) from public, anon;
revoke all on function public.inventory_product_set_active(uuid, uuid, uuid, boolean, integer) from public, anon;

grant execute on function public.inventory_bootstrap(uuid, uuid) to authenticated;
grant execute on function public.inventory_vendor_create(uuid, uuid, text, text) to authenticated;
grant execute on function public.inventory_vendor_update(uuid, uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.inventory_vendor_set_active(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.inventory_category_create(uuid, uuid, text) to authenticated;
grant execute on function public.inventory_category_update(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.inventory_category_set_active(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.inventory_subcategory_create(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.inventory_subcategory_update(uuid, uuid, uuid, text, uuid, integer) to authenticated;
grant execute on function public.inventory_subcategory_set_active(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.inventory_product_create(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.inventory_product_update(uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.inventory_product_set_active(uuid, uuid, uuid, boolean, integer) to authenticated;
