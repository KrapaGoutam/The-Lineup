-- BI-E2: one transaction, existing immutable ledger, strict stale preflight.
create function public.inventory_bulk_count(
  p_organization_id uuid,p_location_id uuid,p_rows jsonb,p_reason text,p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id,p_location_id);
  v_note text := private.inventory_optional_text('note',p_note,500);
  v_row jsonb;
  v_product public.inventory_products;
  v_stock public.inventory_stock;
  v_id uuid;
  v_name text;
  v_result jsonb;
  v_changed integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'Choose between 1 and 5000 products.' using errcode='22023';
  end if;
  if p_reason is null or p_reason not in ('stock_count','delivery_restock','usage','breakage','comp','transfer_in','transfer_out','correction','other') then
    raise exception 'Choose a reason for the change.' using errcode='22023';
  end if;
  -- Validate the entire request before locks/writes, including explicit JSON types.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or jsonb_typeof(v_row->'productId') is distinct from 'string'
      or jsonb_typeof(v_row->'expectedVersion') is distinct from 'number'
      or coalesce(v_row->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
      or coalesce(jsonb_typeof(v_row->'onHand'),'null') not in ('number','null')
      or coalesce(jsonb_typeof(v_row->'backup'),'null') not in ('number','null')
      or ((v_row->>'onHand') is null and (v_row->>'backup') is null) then
      raise exception 'Invalid count row. Refresh and review your counts.' using errcode='22023';
    end if;
    v_id := (v_row->>'productId')::uuid;
    perform private.inventory_check_quantity('on hand count',(v_row->>'onHand')::numeric,false);
    perform private.inventory_check_quantity('backup count',(v_row->>'backup')::numeric,false);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_rows) r group by (r->>'productId')::uuid having count(*)>1) then
    raise exception 'Each product may appear only once.' using errcode='22023';
  end if;
  -- All requests acquire product/stock locks in the same UUID order.
  for v_row in select value from jsonb_array_elements(p_rows) order by (value->>'productId')::uuid loop
    v_id := (v_row->>'productId')::uuid;
    select * into v_product from public.inventory_products where id=v_id and organization_id=p_organization_id and active for share;
    if not found then raise exception 'A selected product is archived or unavailable here.' using errcode='22023'; end if;
    insert into public.inventory_stock(product_id,location_id,organization_id) values(v_id,p_location_id,p_organization_id) on conflict do nothing;
    select * into v_stock from public.inventory_stock where product_id=v_id and location_id=p_location_id and organization_id=p_organization_id for update;
    -- Unlike single-cell retry/no-op behavior, a reviewed batch ALWAYS checks
    -- its version, even if a concurrent count happened to reach the same value.
    if v_stock.version <> (v_row->>'expectedVersion')::integer then
      select display_name into v_name from public.profiles where id=v_stock.updated_by;
      raise exception '% changed after this count was opened. Nothing was saved.',v_product.name using errcode='PT409',
        detail=jsonb_build_object('kind','stale','entity','stock','id',v_id,'current_version',v_stock.version,'on_hand',v_stock.on_hand,'backup',v_stock.backup,'updated_by',v_name,'updated_at',v_stock.updated_at)::text;
    end if;
  end loop;
  -- Calls remain inside this transaction; any exception rolls everything back.
  for v_row in select value from jsonb_array_elements(p_rows) order by (value->>'productId')::uuid loop
    v_result := public.inventory_stock_adjust(p_organization_id,p_location_id,(v_row->>'productId')::uuid,'set',
      (v_row->>'onHand')::numeric,(v_row->>'backup')::numeric,p_reason,v_note,(v_row->>'expectedVersion')::integer);
    if (v_result->>'changed')::boolean then v_changed:=v_changed+1; end if;
  end loop;
  return jsonb_build_object('changed',v_changed);
end $$;
revoke all on function public.inventory_bulk_count(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.inventory_bulk_count(uuid,uuid,jsonb,text,text) to authenticated;
