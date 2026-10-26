-- Bar Inventory V1 / BI-2 -- location-level stock, the immutable adjustment
-- ledger, the derived status view and the two trusted quantity RPCs.
--
-- Shape (see docs/features/bar-inventory-v1/DATA_MODEL.md)
--   * inventory_stock is LOCATION-level (owner decision D5): one row per
--     (product, location) holding on hand, backup, cutoff, warning, par and a
--     `version` for optimistic concurrency. `total` is a generated column
--     (on hand + backup) so it can never drift. A row is created for every
--     location of the organization when a product is created (trigger) and is
--     backfilled here for existing products.
--   * Quantities change ONLY through public.inventory_stock_adjust, which
--     locks the stock row, reads the previous values FROM THAT ROW (a client
--     cannot forge them), writes the new values and appends one immutable
--     inventory_adjustments row in the same transaction. Two modes:
--       set    absolute counts; needs the expected version (stale -> PT409)
--       delta  relative change; commutative under the row lock, never stale
--     An identical set / a zero delta is a no-op: no write, no ledger row,
--     no version bump (a double submit cannot duplicate history).
--   * Thresholds (cutoff / warning / par) change through
--     inventory_stock_set_levels (versioned, validated, change-logged).
--   * Status is derived, never stored: the security-invoker view
--     inventory_stock_status computes effective warning, status, suggested
--     order and "order needed" from the same rules as the TypeScript mirror,
--     proven against tests/fixtures/bar-inventory/status-vectors.json. The
--     warning fallback is computed at read time (never written to the row).
--   * Quantities are numeric(12,2) with strict input validation (at most two
--     decimals, never rounded silently); comparisons are exact.
--   * Same boundary as BI-1: clients get SELECT only (management roles, with
--     location access); every write is a SECURITY DEFINER RPC, actor from
--     auth.uid(), empty search_path, plain-language errors with 42501 / 22023
--     / PT409.
--
-- Forward-only.

-- ---------------------------------------------------------------------
-- 1. Pure rules (the SQL half of the shared golden vectors)
-- ---------------------------------------------------------------------
-- Warning = explicit value, else cutoff + max(1, ceil(cutoff * 0.25)).
-- NULL when there is neither a warning nor a cutoff.
create or replace function private.inventory_effective_warning(p_cutoff numeric, p_warning numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_warning is not null then p_warning
    when p_cutoff is null then null
    else p_cutoff + greatest(1::numeric, ceil(p_cutoff * 0.25))
  end;
$$;

-- archived > no_cutoff > critical (total <= cutoff) > low (<= effective
-- warning) > healthy.
create or replace function private.inventory_status(
  p_on_hand numeric,
  p_backup numeric,
  p_cutoff numeric,
  p_warning numeric,
  p_archived boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_archived then 'archived'
    when p_cutoff is null then 'no_cutoff'
    when p_on_hand + p_backup <= p_cutoff then 'critical'
    when p_on_hand + p_backup <= private.inventory_effective_warning(p_cutoff, p_warning) then 'low'
    else 'healthy'
  end;
$$;

-- Quantity input check: at most two decimals (never rounded silently), bounded.
create or replace function private.inventory_check_quantity(
  p_label text,
  p_value numeric,
  p_allow_negative boolean
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null then
    return;
  end if;
  if p_value <> round(p_value, 2) then
    raise exception 'The % can have at most two decimal places.', p_label using errcode = '22023';
  end if;
  if abs(p_value) > 9999999999.99 then
    raise exception 'The % is too large.', p_label using errcode = '22023';
  end if;
  if p_value < 0 and not p_allow_negative then
    raise exception 'The % cannot be negative.', p_label using errcode = '22023';
  end if;
end;
$$;

grant execute on function private.inventory_effective_warning(numeric, numeric) to authenticated;
grant execute on function private.inventory_status(numeric, numeric, numeric, numeric, boolean) to authenticated;
revoke all on function private.inventory_effective_warning(numeric, numeric) from public, anon;
revoke all on function private.inventory_status(numeric, numeric, numeric, numeric, boolean) from public, anon;
revoke all on function private.inventory_check_quantity(text, numeric, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table public.inventory_stock (
  product_id uuid not null,
  location_id uuid not null,
  organization_id uuid not null,
  on_hand numeric(12, 2) not null default 0 check (on_hand >= 0),
  backup numeric(12, 2) not null default 0 check (backup >= 0),
  total numeric(13, 2) generated always as (on_hand + backup) stored,
  cutoff numeric(12, 2) check (cutoff is null or cutoff >= 0),
  warning numeric(12, 2) check (warning is null or warning >= 0),
  par numeric(12, 2) check (par is null or par >= 0),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  last_adjusted_at timestamptz,
  primary key (product_id, location_id),
  constraint inventory_stock_warning_not_below_cutoff
    check (warning is null or cutoff is null or warning >= cutoff),
  -- Deleting a product (service-role maintenance only; there is no client
  -- delete path) clears its stock, as Tasks does for its events.
  constraint inventory_stock_product_fk
    foreign key (product_id, organization_id) references public.inventory_products (id, organization_id)
    on delete cascade,
  constraint inventory_stock_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint inventory_stock_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

create table public.inventory_adjustments (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  location_id uuid not null,
  product_id uuid not null,
  -- BI-8 adds the foreign key to inventory_import_batches.
  import_batch_id uuid,
  source text not null check (source in ('manual_edit', 'bulk_import', 'delivery', 'count', 'receiving', 'system')),
  reason text not null check (reason in
    ('stock_count', 'delivery_restock', 'usage', 'breakage', 'comp', 'transfer_in', 'transfer_out', 'correction', 'other')),
  note text check (note is null or length(note) <= 500),
  prev_on_hand numeric(12, 2) not null,
  new_on_hand numeric(12, 2) not null,
  prev_backup numeric(12, 2) not null,
  new_backup numeric(12, 2) not null,
  delta_on_hand numeric(13, 2) generated always as (new_on_hand - prev_on_hand) stored,
  delta_backup numeric(13, 2) generated always as (new_backup - prev_backup) stored,
  delta_total numeric(14, 2) generated always as ((new_on_hand + new_backup) - (prev_on_hand + prev_backup)) stored,
  cutoff_at_time numeric(12, 2),
  status_after text not null check (status_after in ('critical', 'low', 'healthy', 'no_cutoff')),
  actor_profile_id uuid not null,
  created_at timestamptz not null default now(),
  stock_version_after integer not null,
  constraint inventory_adjustments_changed check (new_on_hand <> prev_on_hand or new_backup <> prev_backup),
  constraint inventory_adjustments_product_fk
    foreign key (product_id, organization_id) references public.inventory_products (id, organization_id)
    on delete cascade,
  constraint inventory_adjustments_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id),
  constraint inventory_adjustments_actor_fk
    foreign key (organization_id, actor_profile_id) references public.memberships (organization_id, profile_id)
);

create index inventory_stock_org_location_idx on public.inventory_stock (location_id, organization_id);
create index inventory_stock_product_org_idx on public.inventory_stock (product_id, organization_id);
create index inventory_stock_updater_idx on public.inventory_stock (organization_id, updated_by) where updated_by is not null;
create index inventory_stock_location_total_idx on public.inventory_stock (location_id, total);
create index inventory_adjustments_item_idx on public.inventory_adjustments (location_id, product_id, id desc);
create index inventory_adjustments_created_idx on public.inventory_adjustments (location_id, created_at);
create index inventory_adjustments_product_org_idx on public.inventory_adjustments (product_id, organization_id);
create index inventory_adjustments_actor_idx on public.inventory_adjustments (organization_id, actor_profile_id);
create index inventory_adjustments_batch_idx on public.inventory_adjustments (import_batch_id) where import_batch_id is not null;

-- ---------------------------------------------------------------------
-- 3. Guards: immutable ledger; a stock row for every location of every product
-- ---------------------------------------------------------------------
create or replace function private.inventory_adjustments_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascading deletes (organization / product removal) run at trigger depth > 1.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Inventory history is append-only.' using errcode = '23514';
end;
$$;

create or replace function private.inventory_adjustments_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory history is append-only.' using errcode = '23514';
end;
$$;

revoke all on function private.inventory_adjustments_append_only() from public, anon, authenticated;
revoke all on function private.inventory_adjustments_no_truncate() from public, anon, authenticated;

create trigger inventory_adjustments_append_only
  before update or delete on public.inventory_adjustments
  for each row execute function private.inventory_adjustments_append_only();
create trigger inventory_adjustments_no_truncate
  before truncate on public.inventory_adjustments
  for each statement execute function private.inventory_adjustments_no_truncate();

-- Every product gets a (zero) stock row at every location of its organization.
create or replace function private.inventory_products_seed_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_stock (product_id, location_id, organization_id)
  select new.id, l.id, new.organization_id
  from public.locations l
  where l.organization_id = new.organization_id
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.inventory_products_seed_stock() from public, anon, authenticated;

create trigger inventory_products_seed_stock
  after insert on public.inventory_products
  for each row execute function private.inventory_products_seed_stock();

-- Backfill: products created by BI-1 before this migration.
insert into public.inventory_stock (product_id, location_id, organization_id)
select p.id, l.id, p.organization_id
from public.inventory_products p
join public.locations l on l.organization_id = p.organization_id
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. RLS and grants (management role + location access; SELECT only)
-- ---------------------------------------------------------------------
alter table public.inventory_stock enable row level security;
alter table public.inventory_adjustments enable row level security;

revoke all on table public.inventory_stock, public.inventory_adjustments from public, anon, authenticated;
grant select on table public.inventory_stock, public.inventory_adjustments to authenticated;

create policy inventory_stock_select on public.inventory_stock
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));
create policy inventory_adjustments_select on public.inventory_adjustments
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

-- ---------------------------------------------------------------------
-- 5. The derived status view (RLS of the base tables applies)
-- ---------------------------------------------------------------------
create view public.inventory_stock_status
with (security_invoker = true) as
select
  s.product_id,
  s.location_id,
  s.organization_id,
  p.active as product_active,
  s.on_hand,
  s.backup,
  s.total,
  s.cutoff,
  s.warning,
  s.par,
  private.inventory_effective_warning(s.cutoff, s.warning) as effective_warning,
  st.status,
  case
    when st.status in ('critical', 'low') and s.par is not null then greatest(0::numeric, s.par - s.total)
  end as suggested_order,
  (st.status in ('critical', 'low') and s.par is null) as order_needed,
  s.version,
  s.updated_at,
  s.updated_by,
  s.last_adjusted_at
from public.inventory_stock s
join public.inventory_products p on p.id = s.product_id and p.organization_id = s.organization_id
cross join lateral (
  select private.inventory_status(s.on_hand, s.backup, s.cutoff, s.warning, not p.active) as status
) st;

revoke all on public.inventory_stock_status from public, anon, authenticated;
grant select on public.inventory_stock_status to authenticated;

-- ---------------------------------------------------------------------
-- 6. inventory_stock_adjust -- the ONLY way quantities change
-- ---------------------------------------------------------------------
create or replace function public.inventory_stock_adjust(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_mode text,
  p_on_hand numeric,
  p_backup numeric,
  p_reason text,
  p_note text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_note text := private.inventory_optional_text('note', p_note, 500);
  v_product public.inventory_products;
  v_stock public.inventory_stock;
  v_new_on numeric;
  v_new_back numeric;
  v_status text;
  v_source text;
  v_name text;
begin
  if p_mode is null or p_mode not in ('set', 'delta') then
    raise exception 'Choose set or delta.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in
     ('stock_count', 'delivery_restock', 'usage', 'breakage', 'comp', 'transfer_in', 'transfer_out', 'correction', 'other') then
    raise exception 'Choose a reason for the change.' using errcode = '22023';
  end if;
  if p_on_hand is null and p_backup is null then
    raise exception 'Enter a quantity.' using errcode = '22023';
  end if;
  perform private.inventory_check_quantity('on hand count', p_on_hand, p_mode = 'delta');
  perform private.inventory_check_quantity('backup count', p_backup, p_mode = 'delta');

  select * into v_product
  from public.inventory_products p
  where p.id = p_product_id and p.organization_id = p_organization_id;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  if not v_product.active then
    raise exception 'Reactivate this product before changing its count.' using errcode = '22023';
  end if;

  -- A row can be missing for a location added after the product was created.
  insert into public.inventory_stock (product_id, location_id, organization_id)
  values (p_product_id, p_location_id, p_organization_id)
  on conflict do nothing;

  select * into v_stock
  from public.inventory_stock s
  where s.product_id = p_product_id and s.location_id = p_location_id
  for update;

  if p_mode = 'set' then
    v_new_on := coalesce(p_on_hand, v_stock.on_hand);
    v_new_back := coalesce(p_backup, v_stock.backup);
  else
    v_new_on := v_stock.on_hand + coalesce(p_on_hand, 0);
    v_new_back := v_stock.backup + coalesce(p_backup, 0);
    if v_new_on < 0 or v_new_back < 0 then
      raise exception 'That would take the count below zero.' using errcode = '22023';
    end if;
  end if;

  -- Identical request (double submit / retry): nothing to do, nothing to log.
  if v_new_on = v_stock.on_hand and v_new_back = v_stock.backup then
    return jsonb_build_object(
      'changed', false, 'version', v_stock.version,
      'on_hand', v_stock.on_hand, 'backup', v_stock.backup, 'total', v_stock.total,
      'status', private.inventory_status(v_stock.on_hand, v_stock.backup, v_stock.cutoff, v_stock.warning, false)
    );
  end if;

  if p_mode = 'set' then
    if p_expected_version is null then
      raise exception 'Reload the item and try again.' using errcode = '22023';
    end if;
    if v_stock.version <> p_expected_version then
      select pr.display_name into v_name from public.profiles pr where pr.id = v_stock.updated_by;
      raise exception 'Someone else changed this count. Review the latest and try again.'
        using errcode = 'PT409',
              detail = jsonb_build_object(
                'kind', 'stale',
                'entity', 'stock',
                'id', p_product_id,
                'current_version', v_stock.version,
                'on_hand', v_stock.on_hand,
                'backup', v_stock.backup,
                'updated_by', v_name,
                'updated_at', v_stock.updated_at
              )::text;
    end if;
  end if;

  v_status := private.inventory_status(v_new_on, v_new_back, v_stock.cutoff, v_stock.warning, false);
  v_source := case p_reason
    when 'stock_count' then 'count'
    when 'delivery_restock' then 'delivery'
    else 'manual_edit'
  end;

  update public.inventory_stock
  set on_hand = v_new_on, backup = v_new_back,
      version = version + 1, updated_at = now(), updated_by = v_actor, last_adjusted_at = now()
  where product_id = p_product_id and location_id = p_location_id;

  insert into public.inventory_adjustments (
    organization_id, location_id, product_id, source, reason, note,
    prev_on_hand, new_on_hand, prev_backup, new_backup,
    cutoff_at_time, status_after, actor_profile_id, stock_version_after
  ) values (
    p_organization_id, p_location_id, p_product_id, v_source, p_reason, v_note,
    v_stock.on_hand, v_new_on, v_stock.backup, v_new_back,
    v_stock.cutoff, v_status, v_actor, v_stock.version + 1
  );

  return jsonb_build_object(
    'changed', true, 'version', v_stock.version + 1,
    'on_hand', v_new_on, 'backup', v_new_back, 'total', v_new_on + v_new_back,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. inventory_stock_set_levels -- cutoff / warning / par (absolute values)
-- ---------------------------------------------------------------------
create or replace function public.inventory_stock_set_levels(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_cutoff numeric,
  p_warning numeric,
  p_par numeric,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_product public.inventory_products;
  v_stock public.inventory_stock;
  v_diff jsonb;
  v_name text;
begin
  perform private.inventory_check_quantity('cutoff', p_cutoff, false);
  perform private.inventory_check_quantity('warning level', p_warning, false);
  perform private.inventory_check_quantity('par level', p_par, false);
  if p_warning is not null and p_cutoff is not null and p_warning < p_cutoff then
    raise exception 'The warning level must be at least the cutoff.' using errcode = '22023';
  end if;

  select * into v_product
  from public.inventory_products p
  where p.id = p_product_id and p.organization_id = p_organization_id;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  if not v_product.active then
    raise exception 'Reactivate this product before changing its levels.' using errcode = '22023';
  end if;

  insert into public.inventory_stock (product_id, location_id, organization_id)
  values (p_product_id, p_location_id, p_organization_id)
  on conflict do nothing;

  select * into v_stock
  from public.inventory_stock s
  where s.product_id = p_product_id and s.location_id = p_location_id
  for update;

  v_diff := private.inventory_diff(
    jsonb_build_object('cutoff', v_stock.cutoff, 'warning', v_stock.warning, 'par', v_stock.par),
    jsonb_build_object('cutoff', p_cutoff, 'warning', p_warning, 'par', p_par),
    array['cutoff', 'warning', 'par']
  );
  if v_diff = '{}'::jsonb then
    return v_stock.version;
  end if;

  if p_expected_version is null or v_stock.version <> p_expected_version then
    select pr.display_name into v_name from public.profiles pr where pr.id = v_stock.updated_by;
    raise exception 'Someone else changed this item. Review the latest and try again.'
      using errcode = 'PT409',
            detail = jsonb_build_object(
              'kind', 'stale',
              'entity', 'stock',
              'id', p_product_id,
              'current_version', v_stock.version,
              'updated_by', v_name,
              'updated_at', v_stock.updated_at
            )::text;
  end if;

  update public.inventory_stock
  set cutoff = p_cutoff, warning = p_warning, par = p_par,
      version = version + 1, updated_at = now(), updated_by = v_actor
  where product_id = p_product_id and location_id = p_location_id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'stock_levels', p_product_id, 'update', v_diff
  );
  return v_stock.version + 1;
end;
$$;

revoke all on function public.inventory_stock_adjust(uuid, uuid, uuid, text, numeric, numeric, text, text, integer) from public, anon;
revoke all on function public.inventory_stock_set_levels(uuid, uuid, uuid, numeric, numeric, numeric, integer) from public, anon;
grant execute on function public.inventory_stock_adjust(uuid, uuid, uuid, text, numeric, numeric, text, text, integer) to authenticated;
grant execute on function public.inventory_stock_set_levels(uuid, uuid, uuid, numeric, numeric, numeric, integer) to authenticated;
