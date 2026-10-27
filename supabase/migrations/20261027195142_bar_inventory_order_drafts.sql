-- Vendor Order Drafts V1 / VOD-1 -- database and domain foundation.
-- Additive only: two RLS-protected tables, immutable Sent history, one active
-- draft per organization/location/vendor, and six RPC-authoritative writes.
-- No function in this migration mutates inventory stock or its adjustment
-- ledger. Mark Sent records an external send only.

-- ---------------------------------------------------------------------
-- 1. Tables and indexes
-- ---------------------------------------------------------------------
create table public.inventory_order_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  vendor_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  vendor_note text check (vendor_note is null or length(vendor_note) <= 1000),
  vendor_name text not null check (length(vendor_name) between 1 and 120),
  version integer not null default 1 check (version >= 1),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  sent_by uuid,
  sent_at timestamptz,
  unique (id, organization_id, location_id),
  constraint inventory_order_drafts_location_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id)
    deferrable initially deferred,
  constraint inventory_order_drafts_vendor_fk
    foreign key (vendor_id, organization_id)
    references public.inventory_vendors (id, organization_id)
    deferrable initially deferred,
  constraint inventory_order_drafts_creator_fk
    foreign key (organization_id, created_by)
    references public.memberships (organization_id, profile_id)
    deferrable initially deferred,
  constraint inventory_order_drafts_updater_fk
    foreign key (organization_id, updated_by)
    references public.memberships (organization_id, profile_id)
    deferrable initially deferred,
  constraint inventory_order_drafts_sender_fk
    foreign key (organization_id, sent_by)
    references public.memberships (organization_id, profile_id)
    deferrable initially deferred,
  constraint inventory_order_drafts_sent_consistency check (
    (status = 'draft' and sent_by is null and sent_at is null)
    or (status = 'sent' and sent_by is not null and sent_at is not null)
  )
);

create unique index inventory_order_drafts_active_uidx
  on public.inventory_order_drafts (organization_id, location_id, vendor_id)
  where status = 'draft';
create index inventory_order_drafts_location_status_idx
  on public.inventory_order_drafts (location_id, status, sent_at desc, created_at desc);
create index inventory_order_drafts_vendor_idx
  on public.inventory_order_drafts (vendor_id, organization_id);
create index inventory_order_drafts_creator_idx
  on public.inventory_order_drafts (organization_id, created_by);
create index inventory_order_drafts_updater_idx
  on public.inventory_order_drafts (organization_id, updated_by);
create index inventory_order_drafts_sender_idx
  on public.inventory_order_drafts (organization_id, sent_by)
  where sent_by is not null;

create table public.inventory_order_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  product_id uuid not null,
  included boolean not null default true,
  order_qty numeric(12, 2) check (order_qty is null or order_qty >= 0),
  item_note text check (item_note is null or length(item_note) <= 200),
  suggested_qty numeric(12, 2) check (suggested_qty is null or suggested_qty >= 0),
  total_at_snapshot numeric(13, 2) not null check (total_at_snapshot >= 0),
  par_at_snapshot numeric(12, 2) check (par_at_snapshot is null or par_at_snapshot >= 0),
  status_at_snapshot text not null
    check (status_at_snapshot in ('critical', 'low', 'healthy', 'no_cutoff', 'archived')),
  product_name text not null check (length(product_name) between 1 and 160),
  size text check (size is null or length(size) <= 40),
  unit text not null check (length(unit) between 1 and 40),
  sku text check (sku is null or length(sku) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, product_id),
  constraint inventory_order_draft_items_draft_fk
    foreign key (draft_id, organization_id, location_id)
    references public.inventory_order_drafts (id, organization_id, location_id)
    on delete cascade,
  constraint inventory_order_draft_items_product_fk
    foreign key (product_id, organization_id)
    references public.inventory_products (id, organization_id)
    deferrable initially deferred
);

create index inventory_order_draft_items_draft_idx
  on public.inventory_order_draft_items (draft_id);
create index inventory_order_draft_items_location_idx
  on public.inventory_order_draft_items (location_id, organization_id);
create index inventory_order_draft_items_product_idx
  on public.inventory_order_draft_items (product_id, organization_id);

-- ---------------------------------------------------------------------
-- 2. Private helpers and immutability guards
-- ---------------------------------------------------------------------
create or replace function private.inventory_order_draft_optional_text(
  p_label text,
  p_value text,
  p_max integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Trim only the edges. Internal spaces and newlines are meaningful notes.
  v_text text := nullif(
    regexp_replace(regexp_replace(coalesce(p_value, ''), '^\s+', ''), '\s+$', ''),
    ''
  );
begin
  if v_text is not null and length(v_text) > p_max then
    raise exception 'The % can be at most % characters.', p_label, p_max
      using errcode = '22023';
  end if;
  return v_text;
end;
$$;

create or replace function private.inventory_order_draft_unit(
  p_unit_type text,
  p_unit_label text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit_type = 'other' then coalesce(p_unit_label, 'Other')
    else initcap(replace(p_unit_type, '_', ' '))
  end;
$$;

create or replace function private.inventory_order_draft_locked(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid
)
returns public.inventory_order_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.inventory_order_drafts;
begin
  select * into v_draft
  from public.inventory_order_drafts d
  where d.id = p_draft_id
    and d.organization_id = p_organization_id
    and d.location_id = p_location_id
  for update;
  if not found then
    raise exception 'That order draft is not available for this location.'
      using errcode = '22023';
  end if;
  return v_draft;
end;
$$;

create or replace function private.inventory_order_drafts_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.status = 'sent' then
    raise exception 'A sent order cannot be changed or removed.' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.inventory_order_draft_items_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select d.status into v_status
    from public.inventory_order_drafts d
    where d.id = old.draft_id;
    if v_status = 'sent' then
      raise exception 'A sent order cannot be changed or removed.' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select d.status into v_status
    from public.inventory_order_drafts d
    where d.id = new.draft_id;
    if v_status = 'sent' then
      raise exception 'Items cannot be added or moved into a sent order.' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.inventory_order_drafts_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Order draft history cannot be truncated.' using errcode = '23514';
end;
$$;

revoke all on function private.inventory_order_draft_optional_text(text, text, integer) from public, anon, authenticated;
revoke all on function private.inventory_order_draft_unit(text, text) from public, anon, authenticated;
revoke all on function private.inventory_order_draft_locked(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.inventory_order_drafts_immutable() from public, anon, authenticated;
revoke all on function private.inventory_order_draft_items_immutable() from public, anon, authenticated;
revoke all on function private.inventory_order_drafts_no_truncate() from public, anon, authenticated;

create trigger inventory_order_drafts_immutable
  before update or delete on public.inventory_order_drafts
  for each row execute function private.inventory_order_drafts_immutable();
create trigger inventory_order_draft_items_immutable
  before insert or update or delete on public.inventory_order_draft_items
  for each row execute function private.inventory_order_draft_items_immutable();
create trigger inventory_order_drafts_no_truncate
  before truncate on public.inventory_order_drafts
  for each statement execute function private.inventory_order_drafts_no_truncate();
create trigger inventory_order_draft_items_no_truncate
  before truncate on public.inventory_order_draft_items
  for each statement execute function private.inventory_order_drafts_no_truncate();

-- ---------------------------------------------------------------------
-- 3. RLS and grants: management reads, RPC-only writes
-- ---------------------------------------------------------------------
alter table public.inventory_order_drafts enable row level security;
alter table public.inventory_order_draft_items enable row level security;

revoke all on table
  public.inventory_order_drafts,
  public.inventory_order_draft_items
from public, anon, authenticated;

grant select on table
  public.inventory_order_drafts,
  public.inventory_order_draft_items
to authenticated;

create policy inventory_order_drafts_select on public.inventory_order_drafts
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));
create policy inventory_order_draft_items_select on public.inventory_order_draft_items
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

-- ---------------------------------------------------------------------
-- 4. Open/create the one active draft and seed current recommendations
-- ---------------------------------------------------------------------
create or replace function public.inventory_order_draft_open(
  p_organization_id uuid,
  p_location_id uuid,
  p_vendor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_vendor public.inventory_vendors;
  v_draft_id uuid;
  v_inserted boolean := false;
begin
  select d.id into v_draft_id
  from public.inventory_order_drafts d
  where d.organization_id = p_organization_id
    and d.location_id = p_location_id
    and d.vendor_id = p_vendor_id
    and d.status = 'draft';
  if v_draft_id is not null then
    return v_draft_id;
  end if;

  select * into v_vendor
  from public.inventory_vendors v
  where v.id = p_vendor_id and v.organization_id = p_organization_id;
  if not found then
    raise exception 'That vendor is not available for this organization.' using errcode = '22023';
  end if;
  if v_vendor.is_system then
    raise exception 'Assign a vendor before drafting an order.' using errcode = '22023';
  end if;
  if not v_vendor.active then
    raise exception 'That vendor is inactive. Reactivate it before drafting a new order.' using errcode = '22023';
  end if;

  insert into public.inventory_order_drafts
    (organization_id, location_id, vendor_id, vendor_name, created_by, updated_by)
  values
    (p_organization_id, p_location_id, p_vendor_id, v_vendor.name, v_actor, v_actor)
  on conflict (organization_id, location_id, vendor_id) where status = 'draft'
    do nothing
  returning id into v_draft_id;

  v_inserted := v_draft_id is not null;
  if not v_inserted then
    select d.id into v_draft_id
    from public.inventory_order_drafts d
    where d.organization_id = p_organization_id
      and d.location_id = p_location_id
      and d.vendor_id = p_vendor_id
      and d.status = 'draft';
    return v_draft_id;
  end if;

  insert into public.inventory_order_draft_items
    (draft_id, organization_id, location_id, product_id, suggested_qty,
     total_at_snapshot, par_at_snapshot, status_at_snapshot,
     product_name, size, unit, sku)
  select
    v_draft_id, p_organization_id, p_location_id, p.id, s.suggested_order,
    s.total, s.par, s.status, p.name, p.size,
    private.inventory_order_draft_unit(p.unit_type, p.unit_label), p.sku
  from public.inventory_products p
  join public.inventory_stock_status s
    on s.product_id = p.id
   and s.organization_id = p.organization_id
   and s.location_id = p_location_id
  where p.organization_id = p_organization_id
    and p.vendor_id = p_vendor_id
    and p.active
    and s.status in ('critical', 'low')
  on conflict (draft_id, product_id) do nothing;

  return v_draft_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Sparse save (editable values only; snapshots are never arguments)
-- ---------------------------------------------------------------------
create or replace function public.inventory_order_draft_save(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid,
  p_expected_version integer,
  p_vendor_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_draft public.inventory_order_drafts := private.inventory_order_draft_locked(p_organization_id, p_location_id, p_draft_id);
  v_vendor_note text := private.inventory_order_draft_optional_text('vendor note', p_vendor_note, 1000);
  v_line jsonb;
  v_product_id uuid;
  v_order_qty numeric;
  v_item_note text;
  v_included boolean;
  v_item public.inventory_order_draft_items;
  v_product public.inventory_products;
  v_changed boolean := false;
  v_name text;
  v_inserted_rows integer;
begin
  if v_draft.status = 'sent' then
    raise exception 'A sent order cannot be changed.' using errcode = '23514';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Order lines must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 500 then
    raise exception 'Save at most 500 order lines at a time.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) e
    group by e ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception 'Each item may appear only once in a save.' using errcode = '22023';
  end if;

  v_changed := v_vendor_note is distinct from v_draft.vendor_note;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
       or not (v_line ? 'product_id' and v_line ? 'order_qty' and v_line ? 'item_note' and v_line ? 'included')
       or (v_line - array['product_id','order_qty','item_note','included']::text[]) <> '{}'::jsonb then
      raise exception 'Each order line must contain only product_id, order_qty, item_note, and included.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'product_id') <> 'string'
       or jsonb_typeof(v_line -> 'item_note') not in ('string', 'null')
       or jsonb_typeof(v_line -> 'included') <> 'boolean' then
      raise exception 'An order line has an invalid item, quantity, note, or Included value.' using errcode = '22023';
    end if;
    begin
      v_product_id := (v_line ->> 'product_id')::uuid;
      v_included := (v_line ->> 'included')::boolean;
    exception when others then
      raise exception 'An order line has an invalid item, quantity, or Included value.' using errcode = '22023';
    end;
    if v_included is null then
      raise exception 'Choose whether the item is included.' using errcode = '22023';
    end if;
    v_item_note := private.inventory_order_draft_optional_text('item note', v_line ->> 'item_note', 200);

    select * into v_item from public.inventory_order_draft_items i
    where i.draft_id = p_draft_id and i.product_id = v_product_id;
    if found then
      v_name := v_item.product_name;
      if v_item.order_qty is distinct from v_order_qty
         or v_item.item_note is distinct from v_item_note
         or v_item.included is distinct from v_included then
        v_changed := true;
      end if;
    else
      select * into v_product from public.inventory_products p
      where p.id = v_product_id
        and p.organization_id = p_organization_id
        and p.vendor_id = v_draft.vendor_id
        and p.active
      for key share;
      if not found then
        raise exception 'Choose an active item from this draft vendor.' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_changed := true;
    end if;
    if jsonb_typeof(v_line -> 'order_qty') not in ('number', 'null') then
      raise exception 'Order quantity for "%" must be a number or blank.', v_name using errcode = '22023';
    end if;
    begin
      v_order_qty := case when jsonb_typeof(v_line -> 'order_qty') = 'null' then null else (v_line ->> 'order_qty')::numeric end;
    exception when others then
      raise exception 'Order quantity for "%" must be a number or blank.', v_name using errcode = '22023';
    end;
    perform private.inventory_check_quantity(format('order quantity for "%s"', v_name), v_order_qty, false);
  end loop;

  if not v_changed then
    return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', false);
  end if;
  if p_expected_version is null then
    raise exception 'Refresh the order draft and try again.' using errcode = '22023';
  end if;
  if p_expected_version <> v_draft.version then
    perform private.inventory_raise_stale('order_draft', v_draft.id, v_draft.organization_id,
      v_draft.version, v_draft.updated_by, v_draft.updated_at);
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_order_qty := case when jsonb_typeof(v_line -> 'order_qty') = 'null' then null else (v_line ->> 'order_qty')::numeric end;
    v_item_note := private.inventory_order_draft_optional_text('item note', v_line ->> 'item_note', 200);
    v_included := (v_line ->> 'included')::boolean;

    update public.inventory_order_draft_items
    set order_qty = v_order_qty,
        item_note = v_item_note,
        included = v_included,
        updated_at = now()
    where draft_id = p_draft_id and product_id = v_product_id;
    if not found then
      insert into public.inventory_order_draft_items
        (draft_id, organization_id, location_id, product_id, included, order_qty, item_note,
         suggested_qty, total_at_snapshot, par_at_snapshot, status_at_snapshot,
         product_name, size, unit, sku)
      select
        p_draft_id, p_organization_id, p_location_id, p.id, v_included, v_order_qty, v_item_note,
        s.suggested_order, s.total, s.par, s.status,
        p.name, p.size, private.inventory_order_draft_unit(p.unit_type, p.unit_label), p.sku
      from public.inventory_products p
      join public.inventory_stock_status s
        on s.product_id = p.id
       and s.organization_id = p.organization_id
       and s.location_id = p_location_id
      where p.id = v_product_id
        and p.organization_id = p_organization_id
        and p.vendor_id = v_draft.vendor_id
        and p.active;
      get diagnostics v_inserted_rows = row_count;
      if v_inserted_rows <> 1 then
        raise exception 'The requested item changed while the order was being saved. Refresh and try again.' using errcode = 'PT409';
      end if;
    end if;
  end loop;

  update public.inventory_order_drafts
  set vendor_note = v_vendor_note,
      version = version + 1,
      updated_by = v_actor,
      updated_at = now()
  where id = p_draft_id
  returning version, updated_at into v_draft.version, v_draft.updated_at;

  return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', true,
    'updated_at', v_draft.updated_at);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Fill, clear, and update suggestion snapshots
-- ---------------------------------------------------------------------
create or replace function public.inventory_order_draft_fill(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid,
  p_expected_version integer,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_draft public.inventory_order_drafts := private.inventory_order_draft_locked(p_organization_id, p_location_id, p_draft_id);
  v_changed boolean;
begin
  if v_draft.status = 'sent' then
    raise exception 'A sent order cannot be changed.' using errcode = '23514';
  end if;
  if p_mode is null or p_mode not in ('empty_only', 'replace_all') then
    raise exception 'Choose fill empty only or replace all.' using errcode = '22023';
  end if;
  select exists (
    select 1 from public.inventory_order_draft_items i
    where i.draft_id = p_draft_id
      and case when p_mode = 'empty_only'
        then i.order_qty is null and i.suggested_qty is not null
        else i.order_qty is distinct from i.suggested_qty end
  ) into v_changed;
  if not v_changed then
    return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', false);
  end if;
  if p_expected_version is null or p_expected_version <> v_draft.version then
    perform private.inventory_raise_stale('order_draft', v_draft.id, v_draft.organization_id,
      v_draft.version, v_draft.updated_by, v_draft.updated_at);
  end if;
  if p_mode = 'empty_only' then
    update public.inventory_order_draft_items
    set order_qty = suggested_qty, updated_at = now()
    where draft_id = p_draft_id and order_qty is null and suggested_qty is not null;
  else
    update public.inventory_order_draft_items
    set order_qty = suggested_qty, updated_at = now()
    where draft_id = p_draft_id and order_qty is distinct from suggested_qty;
  end if;
  update public.inventory_order_drafts
  set version = version + 1, updated_by = v_actor, updated_at = now()
  where id = p_draft_id returning version into v_draft.version;
  return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', true);
end;
$$;

create or replace function public.inventory_order_draft_clear(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_draft public.inventory_order_drafts := private.inventory_order_draft_locked(p_organization_id, p_location_id, p_draft_id);
  v_changed boolean;
begin
  if v_draft.status = 'sent' then
    raise exception 'A sent order cannot be changed.' using errcode = '23514';
  end if;
  select v_draft.vendor_note is not null or exists (
    select 1 from public.inventory_order_draft_items i
    where i.draft_id = p_draft_id
      and (i.order_qty is not null or i.item_note is not null or not i.included)
  ) into v_changed;
  if not v_changed then
    return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', false);
  end if;
  if p_expected_version is null or p_expected_version <> v_draft.version then
    perform private.inventory_raise_stale('order_draft', v_draft.id, v_draft.organization_id,
      v_draft.version, v_draft.updated_by, v_draft.updated_at);
  end if;
  update public.inventory_order_draft_items
  set order_qty = null, item_note = null, included = true, updated_at = now()
  where draft_id = p_draft_id
    and (order_qty is not null or item_note is not null or not included);
  update public.inventory_order_drafts
  set vendor_note = null, version = version + 1, updated_by = v_actor, updated_at = now()
  where id = p_draft_id returning version into v_draft.version;
  return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', true);
end;
$$;

create or replace function public.inventory_order_draft_sync(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_draft public.inventory_order_drafts := private.inventory_order_draft_locked(p_organization_id, p_location_id, p_draft_id);
  v_changed boolean;
begin
  if v_draft.status = 'sent' then
    raise exception 'A sent order cannot be changed.' using errcode = '23514';
  end if;
  select exists (
    select 1
    from public.inventory_order_draft_items i
    join public.inventory_stock_status s
      on s.product_id = i.product_id
     and s.organization_id = i.organization_id
     and s.location_id = i.location_id
    where i.draft_id = p_draft_id
      and (i.suggested_qty is distinct from s.suggested_order
        or i.total_at_snapshot is distinct from s.total
        or i.par_at_snapshot is distinct from s.par
        or i.status_at_snapshot is distinct from s.status)
  ) or exists (
    select 1
    from public.inventory_products p
    join public.inventory_stock_status s
      on s.product_id = p.id and s.organization_id = p.organization_id and s.location_id = p_location_id
    where p.organization_id = p_organization_id
      and p.vendor_id = v_draft.vendor_id
      and p.active and s.status in ('critical', 'low')
      and not exists (
        select 1 from public.inventory_order_draft_items i
        where i.draft_id = p_draft_id and i.product_id = p.id
      )
  ) into v_changed;
  if not v_changed then
    return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', false);
  end if;
  if p_expected_version is null or p_expected_version <> v_draft.version then
    perform private.inventory_raise_stale('order_draft', v_draft.id, v_draft.organization_id,
      v_draft.version, v_draft.updated_by, v_draft.updated_at);
  end if;

  update public.inventory_order_draft_items i
  set suggested_qty = s.suggested_order,
      total_at_snapshot = s.total,
      par_at_snapshot = s.par,
      status_at_snapshot = s.status,
      updated_at = now()
  from public.inventory_stock_status s
  where i.draft_id = p_draft_id
    and s.product_id = i.product_id
    and s.organization_id = i.organization_id
    and s.location_id = i.location_id
    and (i.suggested_qty is distinct from s.suggested_order
      or i.total_at_snapshot is distinct from s.total
      or i.par_at_snapshot is distinct from s.par
      or i.status_at_snapshot is distinct from s.status);

  insert into public.inventory_order_draft_items
    (draft_id, organization_id, location_id, product_id, suggested_qty,
     total_at_snapshot, par_at_snapshot, status_at_snapshot,
     product_name, size, unit, sku)
  select p_draft_id, p_organization_id, p_location_id, p.id, s.suggested_order,
    s.total, s.par, s.status, p.name, p.size,
    private.inventory_order_draft_unit(p.unit_type, p.unit_label), p.sku
  from public.inventory_products p
  join public.inventory_stock_status s
    on s.product_id = p.id and s.organization_id = p.organization_id and s.location_id = p_location_id
  where p.organization_id = p_organization_id
    and p.vendor_id = v_draft.vendor_id
    and p.active and s.status in ('critical', 'low')
  on conflict (draft_id, product_id) do nothing;

  update public.inventory_order_drafts
  set version = version + 1, updated_by = v_actor, updated_at = now()
  where id = p_draft_id returning version into v_draft.version;
  return jsonb_build_object('id', p_draft_id, 'version', v_draft.version, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Mark Sent: freeze labels and record the external send only
-- ---------------------------------------------------------------------
create or replace function public.inventory_order_draft_mark_sent(
  p_organization_id uuid,
  p_location_id uuid,
  p_draft_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_draft public.inventory_order_drafts := private.inventory_order_draft_locked(p_organization_id, p_location_id, p_draft_id);
  v_sent_name text;
begin
  if v_draft.status = 'sent' then
    select p.display_name into v_sent_name from public.profiles p where p.id = v_draft.sent_by;
    return jsonb_build_object('id', v_draft.id, 'status', v_draft.status,
      'version', v_draft.version, 'sent_by', v_sent_name, 'sent_at', v_draft.sent_at,
      'changed', false);
  end if;
  if p_expected_version is null or p_expected_version <> v_draft.version then
    perform private.inventory_raise_stale('order_draft', v_draft.id, v_draft.organization_id,
      v_draft.version, v_draft.updated_by, v_draft.updated_at);
  end if;
  if not exists (
    select 1 from public.inventory_order_draft_items i
    where i.draft_id = p_draft_id and i.included and i.order_qty > 0
  ) then
    raise exception 'Add a quantity before marking this order sent.' using errcode = '22023';
  end if;

  -- Freeze current catalog labels before the parent becomes immutable.
  update public.inventory_order_draft_items i
  set product_name = p.name,
      size = p.size,
      unit = private.inventory_order_draft_unit(p.unit_type, p.unit_label),
      sku = p.sku,
      updated_at = now()
  from public.inventory_products p
  where i.draft_id = p_draft_id
    and p.id = i.product_id
    and p.organization_id = i.organization_id;

  update public.inventory_order_drafts d
  set status = 'sent',
      vendor_name = v.name,
      sent_by = v_actor,
      sent_at = now(),
      version = d.version + 1,
      updated_by = v_actor,
      updated_at = now()
  from public.inventory_vendors v
  where d.id = p_draft_id
    and v.id = d.vendor_id
    and v.organization_id = d.organization_id
  returning d.version, d.sent_at into v_draft.version, v_draft.sent_at;

  select p.display_name into v_sent_name from public.profiles p where p.id = v_actor;
  return jsonb_build_object('id', p_draft_id, 'status', 'sent',
    'version', v_draft.version, 'sent_by', v_sent_name, 'sent_at', v_draft.sent_at,
    'changed', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Public RPC privileges
-- ---------------------------------------------------------------------
revoke all on function public.inventory_order_draft_open(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_order_draft_save(uuid, uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.inventory_order_draft_fill(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.inventory_order_draft_clear(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.inventory_order_draft_sync(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.inventory_order_draft_mark_sent(uuid, uuid, uuid, integer) from public, anon, authenticated;

grant execute on function public.inventory_order_draft_open(uuid, uuid, uuid) to authenticated;
grant execute on function public.inventory_order_draft_save(uuid, uuid, uuid, integer, text, jsonb) to authenticated;
grant execute on function public.inventory_order_draft_fill(uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.inventory_order_draft_clear(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.inventory_order_draft_sync(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.inventory_order_draft_mark_sent(uuid, uuid, uuid, integer) to authenticated;
