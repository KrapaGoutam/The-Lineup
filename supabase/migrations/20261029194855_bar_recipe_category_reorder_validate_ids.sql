-- Forward-only fix: qualify supplied IDs so correlated validation cannot bind c.id to itself.
-- Existing membership gate, tenant lock, error contract and EXECUTE grants are retained.
create or replace function public.bar_recipe_category_reorder(p_organization_id uuid, p_ordered_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_count integer;
begin
  v_actor := private.recipes_begin(p_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  select count(*) into v_count from public.bar_recipe_categories where organization_id=p_organization_id and not is_fallback;
  if p_ordered_ids is null or cardinality(p_ordered_ids)<>v_count or
     (select count(distinct ordered.id) from unnest(p_ordered_ids) as ordered(id))<>v_count or
     exists(select 1 from unnest(p_ordered_ids) as ordered(id) where not exists(select 1 from public.bar_recipe_categories c where c.id=ordered.id and c.organization_id=p_organization_id and not c.is_fallback)) then
    raise exception 'Invalid category order' using errcode='22023';
  end if;
  update public.bar_recipe_categories c set display_order=(x.ordinality-1)::integer, updated_by=v_actor,updated_at=now(),version=c.version+1
  from unnest(p_ordered_ids) with ordinality x(id,ordinality) where c.id=x.id and c.organization_id=p_organization_id;
  return jsonb_build_object('count',v_count);
end;
$$;
