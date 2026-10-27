-- Vendor Order Drafts V1 / VOD-1.1 -- corrective fix for inventory_order_draft_save.
-- The original change detection compared each stored order_qty against
-- v_order_qty before v_order_qty had been parsed for the current line. A line
-- therefore compared against NULL (first line) or the previous line's quantity,
-- so an Order Qty-only edit could be treated as a no-op and never persisted.
-- This migration redefines the function with identical signature, security,
-- grants, validation, concurrency and versioning; the only change is that the
-- current line's quantity is parsed and validated before it is compared.

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
  v_exists boolean;
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
    v_exists := found;
    if v_exists then
      v_name := v_item.product_name;
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
    end if;

    -- Parse and validate THIS line's quantity before any comparison uses it.
    if jsonb_typeof(v_line -> 'order_qty') not in ('number', 'null') then
      raise exception 'Order quantity for "%" must be a number or blank.', v_name using errcode = '22023';
    end if;
    begin
      v_order_qty := case when jsonb_typeof(v_line -> 'order_qty') = 'null' then null else (v_line ->> 'order_qty')::numeric end;
    exception when others then
      raise exception 'Order quantity for "%" must be a number or blank.', v_name using errcode = '22023';
    end;
    perform private.inventory_check_quantity(format('order quantity for "%s"', v_name), v_order_qty, false);

    if not v_exists then
      v_changed := true;
    elsif v_item.order_qty is distinct from v_order_qty
       or v_item.item_note is distinct from v_item_note
       or v_item.included is distinct from v_included then
      v_changed := true;
    end if;
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

-- CREATE OR REPLACE preserves privileges; restate them so the contract is explicit.
revoke all on function public.inventory_order_draft_save(uuid, uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.inventory_order_draft_save(uuid, uuid, uuid, integer, text, jsonb) to authenticated;
