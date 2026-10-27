-- Bar Inventory V1 / BI-8c: import batches and the atomic import commit.
--
-- What this adds
--   * public.inventory_import_batches: one row per confirmed import (filename,
--     format, sheet, actor, counts, the staged plan and the result). Written
--     only through the two RPCs below; clients can read their own location's.
--   * the foreign key from inventory_adjustments.import_batch_id (reserved in
--     BI-2) to the batch.
--   * private.inventory_stock_adjust_core: the body of inventory_stock_adjust,
--     now taking the ledger `source` and `import_batch_id`, so an import writes
--     the SAME audited rows as a manual adjustment (source = bulk_import). The
--     public inventory_stock_adjust is a thin wrapper with unchanged behavior.
--   * public.inventory_import_stage: validates and stores the plan the server
--     computed (idempotent on a client request id).
--   * public.inventory_import_commit: applies exactly the staged plan,
--     atomically, through the existing audited RPCs.
--
-- Trust model: the browser never supplies a plan to the commit. The server
-- recomputes the plan from the uploaded file against the current catalog and
-- stages it; the commit takes only a batch id and reads the staged plan.
--
-- Staged plan (jsonb)
--   { "summary": {rows, created, updated, skipped, errors},
--     "vendors":       [{ref, name}],
--     "categories":    [{ref, name}],
--     "subcategories": [{ref, name, category: {id}|{ref}}],
--     "rows": [{
--        row, action: create|update, product_id, expected_stock_version,
--        expected_product_version, set_product,
--        vendor: {id}|{ref}, category: {id}|{ref}|null, subcategory: ...|null,
--        name, size, unit_type, unit_label, sku, notes,
--        on_hand, backup, cutoff, warning, par }] }
--   `ref` names an entity this batch creates; `id` an existing one.

-- ---------------------------------------------------------------------
-- 1. The audited adjust path takes a source and a batch id
-- ---------------------------------------------------------------------
create or replace function private.inventory_stock_adjust_core(
  p_organization_id uuid,
  p_location_id uuid,
  p_actor uuid,
  p_product_id uuid,
  p_mode text,
  p_on_hand numeric,
  p_backup numeric,
  p_reason text,
  p_note text,
  p_expected_version integer,
  p_source text,
  p_import_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  v_source := coalesce(p_source, case p_reason
    when 'stock_count' then 'count'
    when 'delivery_restock' then 'delivery'
    else 'manual_edit'
  end);

  update public.inventory_stock
  set on_hand = v_new_on, backup = v_new_back,
      version = version + 1, updated_at = now(), updated_by = p_actor, last_adjusted_at = now()
  where product_id = p_product_id and location_id = p_location_id;

  insert into public.inventory_adjustments (
    organization_id, location_id, product_id, import_batch_id, source, reason, note,
    prev_on_hand, new_on_hand, prev_backup, new_backup,
    cutoff_at_time, status_after, actor_profile_id, stock_version_after
  ) values (
    p_organization_id, p_location_id, p_product_id, p_import_batch_id, v_source, p_reason, v_note,
    v_stock.on_hand, v_new_on, v_stock.backup, v_new_back,
    v_stock.cutoff, v_status, p_actor, v_stock.version + 1
  );

  return jsonb_build_object(
    'changed', true, 'version', v_stock.version + 1,
    'on_hand', v_new_on, 'backup', v_new_back, 'total', v_new_on + v_new_back,
    'status', v_status
  );
end;
$$;

revoke all on function private.inventory_stock_adjust_core(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, integer, text, uuid)
  from public, anon, authenticated;

-- Same signature, same behavior as BI-2; only the body moved into the core.
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
begin
  return private.inventory_stock_adjust_core(
    p_organization_id, p_location_id, v_actor, p_product_id, p_mode,
    p_on_hand, p_backup, p_reason, p_note, p_expected_version, null, null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Import batches
-- ---------------------------------------------------------------------
create table public.inventory_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  -- Chosen by the browser per confirm attempt: a replay finds the same batch.
  request_id uuid not null,
  filename text not null check (length(filename) between 1 and 255),
  format text not null check (format in ('csv', 'xlsx')),
  sheet text check (sheet is null or length(sheet) <= 100),
  reason text not null check (reason in ('stock_count', 'delivery_restock')),
  status text not null default 'staged' check (status in ('staged', 'committed')),
  rows_in_file integer not null default 0 check (rows_in_file >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  vendors_created integer not null default 0 check (vendors_created >= 0),
  categories_created integer not null default 0 check (categories_created >= 0),
  subcategories_created integer not null default 0 check (subcategories_created >= 0),
  staged_plan jsonb not null,
  result jsonb,
  actor_profile_id uuid not null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint inventory_import_batches_request_unique unique (organization_id, request_id),
  constraint inventory_import_batches_location_fk
    foreign key (location_id, organization_id) references public.locations (id, organization_id)
    deferrable initially deferred,
  constraint inventory_import_batches_actor_fk
    foreign key (organization_id, actor_profile_id) references public.memberships (organization_id, profile_id)
    deferrable initially deferred,
  constraint inventory_import_batches_committed_has_result
    check (status <> 'committed' or (result is not null and committed_at is not null))
);

create index inventory_import_batches_org_created_idx
  on public.inventory_import_batches (organization_id, created_at desc);
create index inventory_import_batches_location_idx
  on public.inventory_import_batches (location_id, organization_id);
create index inventory_import_batches_actor_idx
  on public.inventory_import_batches (organization_id, actor_profile_id);

-- The ledger rows an import wrote point at their batch. Deferred, like the
-- other ledger foreign keys, so an organization teardown can cascade in any order.
alter table public.inventory_adjustments
  add constraint inventory_adjustments_import_batch_fk
  foreign key (import_batch_id) references public.inventory_import_batches (id)
  deferrable initially deferred;

alter table public.inventory_import_batches enable row level security;

create policy inventory_import_batches_select on public.inventory_import_batches
  for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

revoke all on table public.inventory_import_batches from public, anon, authenticated;
grant select on table public.inventory_import_batches to authenticated;

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
-- {id} -> that id; {ref} -> the id this batch created for it; null -> null.
create or replace function private.inventory_import_ref(p_ref jsonb, p_made jsonb)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_ref is null or jsonb_typeof(p_ref) <> 'object' then
    return null;
  end if;
  if p_ref ? 'id' then
    return (p_ref ->> 'id')::uuid;
  end if;
  v_text := p_made ->> (p_ref ->> 'ref');
  if v_text is null then
    raise exception 'The import plan refers to something it does not create.' using errcode = '22023';
  end if;
  return v_text::uuid;
end;
$$;

create or replace function private.inventory_import_num(p_row jsonb, p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_row -> p_key is null or jsonb_typeof(p_row -> p_key) = 'null' then null
    else (p_row ->> p_key)::numeric
  end;
$$;

revoke all on function private.inventory_import_ref(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.inventory_import_num(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. inventory_import_stage
-- ---------------------------------------------------------------------
create or replace function public.inventory_import_stage(
  p_organization_id uuid,
  p_location_id uuid,
  p_request_id uuid,
  p_filename text,
  p_format text,
  p_sheet text,
  p_reason text,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_existing uuid;
  v_id uuid;
  v_filename text := private.inventory_clean_text(p_filename);
  v_summary jsonb;
begin
  if p_request_id is null then
    raise exception 'That import request is not valid.' using errcode = '22023';
  end if;

  -- A replay (double click, retry, second tab) finds the batch it already made.
  select b.id into v_existing
  from public.inventory_import_batches b
  where b.organization_id = p_organization_id and b.request_id = p_request_id;
  if found then
    return v_existing;
  end if;

  if v_filename is null or v_filename = '' or length(v_filename) > 255 then
    raise exception 'The file needs a name of up to 255 characters.' using errcode = '22023';
  end if;
  if p_format is null or p_format not in ('csv', 'xlsx') then
    raise exception 'Choose CSV or XLSX.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('stock_count', 'delivery_restock') then
    raise exception 'Choose Stock Count or Delivery / Restock.' using errcode = '22023';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(p_plan -> 'rows') is distinct from 'array'
     or jsonb_typeof(coalesce(p_plan -> 'vendors', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'categories', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'subcategories', '[]'::jsonb)) <> 'array' then
    raise exception 'That import plan is not valid.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan -> 'rows') > 5000
     or jsonb_array_length(coalesce(p_plan -> 'vendors', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_plan -> 'categories', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_plan -> 'subcategories', '[]'::jsonb)) > 5000
     or pg_column_size(p_plan) > 8000000 then
    raise exception 'That import is too large.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plan -> 'rows') r
    where jsonb_typeof(r) <> 'object'
       or (r ->> 'action') is null or (r ->> 'action') not in ('create', 'update')
  ) then
    raise exception 'That import plan is not valid.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan -> 'rows') = 0 then
    raise exception 'There is nothing to import.' using errcode = '22023';
  end if;

  v_summary := coalesce(p_plan -> 'summary', '{}'::jsonb);
  insert into public.inventory_import_batches (
    organization_id, location_id, request_id, filename, format, sheet, reason,
    rows_in_file, created_count, updated_count, skipped_count, error_count,
    staged_plan, actor_profile_id
  ) values (
    p_organization_id, p_location_id, p_request_id, v_filename, p_format,
    nullif(private.inventory_clean_text(p_sheet), ''), p_reason,
    coalesce((v_summary ->> 'rows')::integer, 0),
    coalesce((v_summary ->> 'created')::integer, 0),
    coalesce((v_summary ->> 'updated')::integer, 0),
    coalesce((v_summary ->> 'skipped')::integer, 0),
    coalesce((v_summary ->> 'errors')::integer, 0),
    p_plan, v_actor
  )
  returning id into v_id;
  return v_id;
exception when unique_violation then
  -- Two replays raced: the other one won; return its batch.
  select b.id into v_existing
  from public.inventory_import_batches b
  where b.organization_id = p_organization_id and b.request_id = p_request_id;
  if found then
    return v_existing;
  end if;
  raise;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. inventory_import_commit
-- ---------------------------------------------------------------------
create or replace function public.inventory_import_commit(
  p_organization_id uuid,
  p_location_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_batch public.inventory_import_batches;
  v_plan jsonb;
  v_row jsonb;
  v_ent jsonb;
  v_vendors jsonb := '{}'::jsonb;
  v_categories jsonb := '{}'::jsonb;
  v_subcategories jsonb := '{}'::jsonb;
  v_id uuid;
  v_product_id uuid;
  v_stock public.inventory_stock;
  v_product public.inventory_products;
  v_conflicts jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_ledger integer := 0;
  v_cutoff numeric;
  v_warning numeric;
  v_par numeric;
  v_on numeric;
  v_back numeric;
  v_result jsonb;
begin
  select * into v_batch
  from public.inventory_import_batches b
  where b.id = p_batch_id
    and b.organization_id = p_organization_id
    and b.location_id = p_location_id
  for update;
  if not found then
    raise exception 'That import no longer exists.' using errcode = '22023';
  end if;

  -- Committed already (a replay): hand back the stored result, change nothing.
  if v_batch.status = 'committed' then
    return v_batch.result || jsonb_build_object('already', true);
  end if;

  v_plan := v_batch.staged_plan;

  -- ---- Pass 1: lock what the plan will touch and look for conflicts.
  -- A row whose stock (or product) changed since the preview is a conflict:
  -- nothing is applied, and the person previews again.
  for v_row in select value from jsonb_array_elements(v_plan -> 'rows') loop
    continue when v_row ->> 'action' <> 'update';
    v_product_id := (v_row ->> 'product_id')::uuid;

    select * into v_product
    from public.inventory_products p
    where p.id = v_product_id and p.organization_id = p_organization_id
    for update;
    if not found then
      v_conflicts := v_conflicts || jsonb_build_object(
        'row', (v_row ->> 'row')::integer, 'kind', 'missing');
      continue;
    end if;
    if not v_product.active then
      v_conflicts := v_conflicts || jsonb_build_object(
        'row', (v_row ->> 'row')::integer, 'kind', 'archived');
      continue;
    end if;
    if coalesce((v_row ->> 'set_product')::boolean, false)
       and v_product.version <> (v_row ->> 'expected_product_version')::integer then
      v_conflicts := v_conflicts || jsonb_build_object(
        'row', (v_row ->> 'row')::integer, 'kind', 'product',
        'current_version', v_product.version);
      continue;
    end if;

    select * into v_stock
    from public.inventory_stock s
    where s.product_id = v_product_id and s.location_id = p_location_id
    for update;
    if found and v_stock.version <> (v_row ->> 'expected_stock_version')::integer then
      v_conflicts := v_conflicts || jsonb_build_object(
        'row', (v_row ->> 'row')::integer, 'kind', 'stock',
        'current_version', v_stock.version,
        'on_hand', v_stock.on_hand, 'backup', v_stock.backup);
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('ok', false, 'conflicts', v_conflicts);
  end if;

  -- ---- Pass 2: apply everything. Any error aborts the whole call, so an
  -- import is applied completely or not at all.
  for v_ent in select value from jsonb_array_elements(coalesce(v_plan -> 'vendors', '[]'::jsonb)) loop
    v_id := public.inventory_vendor_create(p_organization_id, p_location_id, v_ent ->> 'name', null);
    v_vendors := v_vendors || jsonb_build_object(v_ent ->> 'ref', v_id::text);
  end loop;
  for v_ent in select value from jsonb_array_elements(coalesce(v_plan -> 'categories', '[]'::jsonb)) loop
    v_id := public.inventory_category_create(p_organization_id, p_location_id, v_ent ->> 'name');
    v_categories := v_categories || jsonb_build_object(v_ent ->> 'ref', v_id::text);
  end loop;
  for v_ent in select value from jsonb_array_elements(coalesce(v_plan -> 'subcategories', '[]'::jsonb)) loop
    v_id := public.inventory_subcategory_create(
      p_organization_id, p_location_id,
      private.inventory_import_ref(v_ent -> 'category', v_categories),
      v_ent ->> 'name');
    v_subcategories := v_subcategories || jsonb_build_object(v_ent ->> 'ref', v_id::text);
  end loop;

  for v_row in select value from jsonb_array_elements(v_plan -> 'rows') loop
    v_on := private.inventory_import_num(v_row, 'on_hand');
    v_back := private.inventory_import_num(v_row, 'backup');

    if v_row ->> 'action' = 'create' then
      v_product_id := public.inventory_product_create(
        p_organization_id, p_location_id,
        private.inventory_import_ref(v_row -> 'vendor', v_vendors),
        v_row ->> 'name',
        private.inventory_import_ref(v_row -> 'category', v_categories),
        private.inventory_import_ref(v_row -> 'subcategory', v_subcategories),
        v_row ->> 'size', v_row ->> 'unit_type', v_row ->> 'unit_label',
        v_row ->> 'sku', v_row ->> 'notes');
      v_created := v_created + 1;
    else
      v_product_id := (v_row ->> 'product_id')::uuid;
      if coalesce((v_row ->> 'set_product')::boolean, false) then
        perform public.inventory_product_update(
          p_organization_id, p_location_id, v_product_id,
          private.inventory_import_ref(v_row -> 'vendor', v_vendors),
          v_row ->> 'name',
          private.inventory_import_ref(v_row -> 'category', v_categories),
          private.inventory_import_ref(v_row -> 'subcategory', v_subcategories),
          v_row ->> 'size', v_row ->> 'unit_type', v_row ->> 'unit_label',
          v_row ->> 'sku', v_row ->> 'notes',
          (v_row ->> 'expected_product_version')::integer);
      end if;
      v_updated := v_updated + 1;
    end if;

    -- The stock row (seeded for a new product) as it is now.
    select * into v_stock
    from public.inventory_stock s
    where s.product_id = v_product_id and s.location_id = p_location_id
    for update;

    -- Levels: only the ones the file gave; the rest keep their value.
    v_cutoff := private.inventory_import_num(v_row, 'cutoff');
    v_warning := private.inventory_import_num(v_row, 'warning');
    v_par := private.inventory_import_num(v_row, 'par');
    if v_cutoff is not null or v_warning is not null or v_par is not null then
      perform public.inventory_stock_set_levels(
        p_organization_id, p_location_id, v_product_id,
        coalesce(v_cutoff, v_stock.cutoff),
        coalesce(v_warning, v_stock.warning),
        coalesce(v_par, v_stock.par),
        v_stock.version);
      select * into v_stock
      from public.inventory_stock s
      where s.product_id = v_product_id and s.location_id = p_location_id;
    end if;

    -- Counts: through the audited adjust path, as a bulk_import ledger row.
    if v_on is not null or v_back is not null then
      if (private.inventory_stock_adjust_core(
            p_organization_id, p_location_id, v_actor, v_product_id, 'set',
            v_on, v_back, v_batch.reason, null, v_stock.version,
            'bulk_import', v_batch.id) ->> 'changed')::boolean then
        v_ledger := v_ledger + 1;
      end if;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_batch.skipped_count,
    'errors', v_batch.error_count,
    'vendors_created', (select count(*) from jsonb_object_keys(v_vendors)),
    'categories_created', (select count(*) from jsonb_object_keys(v_categories)),
    'subcategories_created', (select count(*) from jsonb_object_keys(v_subcategories)),
    'ledger_rows', v_ledger
  );

  update public.inventory_import_batches
  set status = 'committed',
      committed_at = now(),
      created_count = v_created,
      updated_count = v_updated,
      vendors_created = (v_result ->> 'vendors_created')::integer,
      categories_created = (v_result ->> 'categories_created')::integer,
      subcategories_created = (v_result ->> 'subcategories_created')::integer,
      result = v_result
  where id = v_batch.id;

  perform private.inventory_log(
    p_organization_id, p_location_id, 'import', v_batch.id, 'import',
    jsonb_build_object(
      'filename', v_batch.filename, 'format', v_batch.format,
      'created', v_created, 'updated', v_updated, 'ledger_rows', v_ledger));

  return v_result;
end;
$$;

revoke all on function public.inventory_stock_adjust(uuid, uuid, uuid, text, numeric, numeric, text, text, integer) from public, anon;
grant execute on function public.inventory_stock_adjust(uuid, uuid, uuid, text, numeric, numeric, text, text, integer) to authenticated;

revoke all on function public.inventory_import_stage(uuid, uuid, uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.inventory_import_commit(uuid, uuid, uuid) from public, anon;
grant execute on function public.inventory_import_stage(uuid, uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.inventory_import_commit(uuid, uuid, uuid) to authenticated;
