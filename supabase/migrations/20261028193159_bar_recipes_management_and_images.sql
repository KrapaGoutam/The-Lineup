-- Recipes V1 R2-A: management writes and private immutable image objects.
-- R-1 import functions and semantics remain unchanged.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.recipes_image_parts(p_name text) returns uuid[]
language plpgsql immutable set search_path = '' as $$
declare v_parts text[];
begin
  v_parts := regexp_match(p_name, '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?\.(webp|jpg)$');
  if v_parts is null then return null; end if;
  return array[v_parts[1]::uuid, v_parts[2]::uuid];
end;
$$;
create function private.recipes_can_read_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bar_recipes r
    where r.organization_id = (private.recipes_image_parts(p_name))[1]
      and r.id = (private.recipes_image_parts(p_name))[2]
      and private.recipes_can_read_recipe(r.id));
$$;
create function private.recipes_can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bar_recipes r
    where r.organization_id = (private.recipes_image_parts(p_name))[1]
      and r.id = (private.recipes_image_parts(p_name))[2]
      and r.is_active and private.recipes_is_manager(r.organization_id));
$$;
revoke all on function private.recipes_image_parts(text), private.recipes_can_read_image(text), private.recipes_can_write_image(text) from public, anon, authenticated;
grant execute on function private.recipes_can_read_image(text), private.recipes_can_write_image(text) to authenticated;

create policy recipe_images_select on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and private.recipes_can_read_image(name));
create policy recipe_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and private.recipes_can_write_image(name));
create policy recipe_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and private.recipes_can_write_image(name));
-- No UPDATE policy: image objects are immutable.

create function private.recipes_begin(p_org uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.recipes_is_manager(p_org) then
    raise exception 'You do not have permission to change recipes' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function private.recipes_begin(uuid) from public, anon, authenticated;

create function private.recipes_check_version(p_expected integer, p_current integer, p_who uuid, p_when timestamptz) returns void
language plpgsql set search_path = '' as $$
begin
  if p_expected is distinct from p_current then
    raise exception 'This recipe was changed by someone else' using errcode = 'PT409',
      detail = jsonb_build_object('kind','stale','current_version',p_current,'updated_by',p_who,'updated_at',p_when)::text;
  end if;
end;
$$;
revoke all on function private.recipes_check_version(integer,integer,uuid,timestamptz) from public, anon, authenticated;

-- Management-only text validation/normalization. Limits are checked before a
-- table constraint can turn a useful field error into a raw check violation.
create function private.recipes_management_text(p_value jsonb, p_field text, p_limit integer, p_required boolean default false, p_multiline boolean default false) returns text
language plpgsql immutable set search_path = '' as $$
declare v_text text;
begin
  perform private.recipes_check_text(p_value,p_field,p_required);
  v_text := regexp_replace(p_value->>p_field,'^\s+|\s+$','','g');
  if not p_multiline then v_text := regexp_replace(v_text,'\s+',' ','g'); end if;
  v_text := nullif(v_text,'');
  if (p_required and v_text is null) or length(v_text)>p_limit then
    raise exception 'Invalid field: % (maximum % characters)',p_field,p_limit using errcode='22023';
  end if;
  return v_text;
end;
$$;
revoke all on function private.recipes_management_text(jsonb,text,integer,boolean,boolean) from public, anon, authenticated;

create function public.bar_recipe_save(p_organization_id uuid, p_recipe_id uuid, p_expected_version integer, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_recipe public.bar_recipes%rowtype; v_category uuid; v_number integer;
  v_slug text; v_base text; v_suffix integer := 1; v_name text; v_field text;
  v_variant jsonb; v_kind text; v_variant_id uuid; v_item jsonb; v_order bigint; v_values jsonb;
  v_constraint text; v_conflict public.bar_recipes%rowtype;
begin
  v_actor := private.recipes_begin(p_organization_id);
  -- Same lock as import, category mutation and archive/restore, always before
  -- row locks. It protects category validity and concurrent slug assignment.
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  if p_recipe_id is not null then
    select * into v_recipe from public.bar_recipes where id=p_recipe_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Recipe not found' using errcode='22023'; end if;
    if not v_recipe.is_active then raise exception 'Restore this recipe before editing' using errcode='22023'; end if;
    perform private.recipes_check_version(p_expected_version,v_recipe.version,v_recipe.updated_by,v_recipe.updated_at);
  end if;
  perform private.recipes_check_keys(p_payload,array['category_id','recipe_number','name','alternate_name','description','base_spirit','is_alcoholic','is_popular','is_menu_item','variants']);
  if jsonb_typeof(p_payload->'category_id') is distinct from 'string' or
     (p_payload->>'category_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Invalid category_id' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'recipe_number') is distinct from 'number' or (p_payload->>'recipe_number') !~ '^[0-9]{1,4}$' then
    raise exception 'Invalid recipe_number' using errcode='22023';
  end if;
  v_category := (p_payload->>'category_id')::uuid;
  v_number := (p_payload->>'recipe_number')::integer;
  if v_number not between 1 and 9999 then raise exception 'Invalid recipe_number' using errcode='22023'; end if;
  if not exists (select 1 from public.bar_recipe_categories c where c.organization_id=p_organization_id and c.id=v_category
    and (c.is_active or (p_recipe_id is not null and c.id=v_recipe.category_id))) then
    raise exception 'Invalid category_id: choose an active category' using errcode='22023';
  end if;
  v_name := private.recipes_management_text(p_payload,'name',120,true);
  foreach v_field in array array['is_alcoholic','is_popular','is_menu_item'] loop
    if p_payload ? v_field and jsonb_typeof(p_payload->v_field) is distinct from 'boolean' then
      raise exception 'Invalid boolean field: %',v_field using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'variants') is distinct from 'object' then raise exception 'Invalid variants' using errcode='22023'; end if;
  perform private.recipes_check_keys(p_payload->'variants',array['perfect','house']);
  if coalesce(p_payload->'variants'->'perfect','null'::jsonb)='null'::jsonb and coalesce(p_payload->'variants'->'house','null'::jsonb)='null'::jsonb then
    raise exception 'At least one variant is required' using errcode='22023';
  end if;
  if p_recipe_id is null then
    if (select count(*) from public.bar_recipes where organization_id=p_organization_id)>=2000 then raise exception 'Too many recipes' using errcode='22023'; end if;
    v_base := rtrim(left(private.recipes_slugify(v_name),80),'-');
    if v_base='' or v_base in ('new','edit') then v_base := 'recipe-' || v_number; end if;
    v_slug := v_base;
    while exists(select 1 from public.bar_recipes where organization_id=p_organization_id and slug=v_slug) loop
      v_suffix := v_suffix+1;
      v_slug := rtrim(left(v_base,80-length(v_suffix::text)-1),'-') || '-' || v_suffix;
    end loop;
    insert into public.bar_recipes (organization_id,category_id,recipe_number,name,slug,alternate_name,description,base_spirit,is_alcoholic,is_popular,is_menu_item,created_by)
    values (p_organization_id,v_category,v_number,v_name,v_slug,
      private.recipes_management_text(p_payload,'alternate_name',120),private.recipes_management_text(p_payload,'description',200,false,true),
      private.recipes_management_text(p_payload,'base_spirit',40),coalesce((p_payload->>'is_alcoholic')::boolean,true),
      coalesce((p_payload->>'is_popular')::boolean,false),coalesce((p_payload->>'is_menu_item')::boolean,false),v_actor) returning * into v_recipe;
  else
    update public.bar_recipes set category_id=v_category,recipe_number=v_number,name=v_name,
      alternate_name=private.recipes_management_text(p_payload,'alternate_name',120),description=private.recipes_management_text(p_payload,'description',200,false,true),
      base_spirit=private.recipes_management_text(p_payload,'base_spirit',40),is_alcoholic=coalesce((p_payload->>'is_alcoholic')::boolean,true),
      is_popular=coalesce((p_payload->>'is_popular')::boolean,false),is_menu_item=coalesce((p_payload->>'is_menu_item')::boolean,false),
      updated_by=v_actor,updated_at=now(),version=version+1 where id=p_recipe_id and organization_id=p_organization_id returning * into v_recipe;
  end if;
  -- Replace removed variants; preserve existing variant rows, replace children.
  delete from public.bar_recipe_variants where organization_id=p_organization_id and recipe_id=v_recipe.id
    and coalesce(p_payload->'variants'->variant,'null'::jsonb)='null'::jsonb;
  foreach v_kind in array array['perfect','house'] loop
    v_variant := p_payload->'variants'->v_kind;
    if v_variant is null or v_variant='null'::jsonb then continue; end if;
    perform private.recipes_check_keys(v_variant,array['method','rim_type','rim_notes','glass','glass_notes','presentation_notes','tips','batch_notes','ingredients','steps','garnishes']);
    insert into public.bar_recipe_variants (organization_id,recipe_id,variant,method,rim_type,rim_notes,glass,glass_notes,presentation_notes,tips,batch_notes)
    values (p_organization_id,v_recipe.id,v_kind,private.recipes_management_text(v_variant,'method',60),private.recipes_management_text(v_variant,'rim_type',40),
      private.recipes_management_text(v_variant,'rim_notes',200),private.recipes_management_text(v_variant,'glass',40),private.recipes_management_text(v_variant,'glass_notes',200),
      private.recipes_management_text(v_variant,'presentation_notes',500),private.recipes_management_text(v_variant,'tips',1000,false,true),private.recipes_management_text(v_variant,'batch_notes',1000,false,true))
    on conflict (recipe_id,variant) do update set method=excluded.method,rim_type=excluded.rim_type,rim_notes=excluded.rim_notes,glass=excluded.glass,glass_notes=excluded.glass_notes,
      presentation_notes=excluded.presentation_notes,tips=excluded.tips,batch_notes=excluded.batch_notes,updated_at=now() returning id into v_variant_id;
    delete from public.bar_recipe_ingredients where organization_id=p_organization_id and variant_id=v_variant_id;
    delete from public.bar_recipe_steps where organization_id=p_organization_id and variant_id=v_variant_id;
    delete from public.bar_recipe_garnishes where organization_id=p_organization_id and variant_id=v_variant_id;
    v_values := coalesce(v_variant->'ingredients','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' then raise exception 'Invalid ingredients' using errcode='22023'; end if;
    if jsonb_array_length(v_values)>30 then raise exception 'Too many ingredients' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      perform private.recipes_check_keys(v_item,array['ingredient_name','amount','unit','preparation']);
      insert into public.bar_recipe_ingredients (organization_id,variant_id,ingredient_name,amount,unit,preparation,sort_order)
      values (p_organization_id,v_variant_id,private.recipes_management_text(v_item,'ingredient_name',120,true),private.recipes_management_text(v_item,'amount',40),
        private.recipes_management_text(v_item,'unit',30),private.recipes_management_text(v_item,'preparation',120),v_order);
    end loop;
    v_values := coalesce(v_variant->'steps','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' then raise exception 'Invalid steps' using errcode='22023'; end if;
    if jsonb_array_length(v_values)>20 then raise exception 'Too many steps' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      perform private.recipes_check_keys(v_item,array['instruction']);
      insert into public.bar_recipe_steps (organization_id,variant_id,instruction,sort_order)
      values (p_organization_id,v_variant_id,private.recipes_management_text(v_item,'instruction',500,true,true),v_order);
    end loop;
    v_values := coalesce(v_variant->'garnishes','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' then raise exception 'Invalid garnishes' using errcode='22023'; end if;
    if jsonb_array_length(v_values)>10 then raise exception 'Too many garnishes' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      perform private.recipes_check_keys(v_item,array['name','notes']);
      insert into public.bar_recipe_garnishes (organization_id,variant_id,name,notes,sort_order)
      values (p_organization_id,v_variant_id,private.recipes_management_text(v_item,'name',120,true),private.recipes_management_text(v_item,'notes',200),v_order);
    end loop;
  end loop;
  return jsonb_build_object('id',v_recipe.id,'slug',v_recipe.slug,'version',v_recipe.version,'recipe_number',v_recipe.recipe_number);
exception when unique_violation then
  -- Translate the actual UNIQUE failure, including concurrent collisions. The
  -- exception subtransaction has rolled back every recipe/child mutation.
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint='bar_recipes_organization_id_recipe_number_key' then
    select * into v_conflict from public.bar_recipes where organization_id=p_organization_id and recipe_number=v_number;
    raise exception 'Recipe number % is already used',v_number using errcode='23505',
      detail=jsonb_build_object('kind','duplicate','entity','recipe','field','recipe_number','existing_id',v_conflict.id,'existing_label',v_conflict.recipe_number || ' ' || v_conflict.name)::text;
  elsif v_constraint='bar_recipes_organization_id_slug_key' then
    select * into v_conflict from public.bar_recipes where organization_id=p_organization_id and slug=v_slug;
    raise exception 'Recipe slug is already used' using errcode='23505',
      detail=jsonb_build_object('kind','duplicate','entity','recipe','field','slug','existing_id',v_conflict.id,'existing_label',v_conflict.recipe_number || ' ' || v_conflict.name)::text;
  end if;
  raise;
end;
$$;
revoke all on function public.bar_recipe_save(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.bar_recipe_save(uuid,uuid,integer,jsonb) to authenticated;

create function public.bar_recipe_set_archived(p_organization_id uuid, p_recipe_id uuid, p_expected_version integer, p_archived boolean, p_category_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_recipe public.bar_recipes%rowtype; v_category uuid;
begin
  v_actor := private.recipes_begin(p_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  select * into v_recipe from public.bar_recipes where organization_id=p_organization_id and id=p_recipe_id for update;
  if not found then raise exception 'Recipe not found' using errcode='22023'; end if;
  perform private.recipes_check_version(p_expected_version,v_recipe.version,v_recipe.updated_by,v_recipe.updated_at);
  if p_archived is null then raise exception 'Invalid archive state' using errcode='22023'; end if;
  v_category := coalesce(p_category_id,v_recipe.category_id);
  if not p_archived and not exists (select 1 from public.bar_recipe_categories where organization_id=p_organization_id and id=v_category and is_active) then
    raise exception 'Choose an active category' using errcode='22023';
  end if;
  update public.bar_recipes set is_active=not p_archived, archived_at=case when p_archived then now() else null end,
    archived_by=case when p_archived then v_actor else null end, category_id=case when p_archived then category_id else v_category end,
    updated_by=v_actor,updated_at=now(),version=version+1 where id=p_recipe_id and organization_id=p_organization_id returning * into v_recipe;
  return jsonb_build_object('id',v_recipe.id,'slug',v_recipe.slug,'version',v_recipe.version,'recipe_number',v_recipe.recipe_number);
end;
$$;

create function public.bar_recipe_set_image(p_organization_id uuid, p_recipe_id uuid, p_expected_version integer, p_image_path text, p_thumb_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_recipe public.bar_recipes%rowtype; v_parts uuid[];
begin
  v_actor := private.recipes_begin(p_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  select * into v_recipe from public.bar_recipes where organization_id=p_organization_id and id=p_recipe_id for update;
  if not found then raise exception 'Recipe not found' using errcode='22023'; end if;
  if not v_recipe.is_active then raise exception 'Restore this recipe before editing' using errcode='22023'; end if;
  perform private.recipes_check_version(p_expected_version,v_recipe.version,v_recipe.updated_by,v_recipe.updated_at);
  if (p_image_path is null) <> (p_thumb_path is null) then raise exception 'Both image paths are required' using errcode='22023'; end if;
  if p_image_path is not null then
    v_parts := private.recipes_image_parts(p_image_path);
    if v_parts is distinct from array[p_organization_id,p_recipe_id] or private.recipes_image_parts(p_thumb_path) is distinct from v_parts
       or p_image_path !~ '\.(webp|jpg)$' or p_image_path ~ '-thumb\.'
       or p_thumb_path <> regexp_replace(p_image_path, '\.(webp|jpg)$', '-thumb.\1') then
      raise exception 'Invalid image paths' using errcode='22023';
    end if;
  end if;
  update public.bar_recipes set image_path=p_image_path,image_thumb_path=p_thumb_path,updated_by=v_actor,updated_at=now(),version=version+1
    where id=p_recipe_id and organization_id=p_organization_id returning * into v_recipe;
  return jsonb_build_object('id',v_recipe.id,'version',v_recipe.version);
end;
$$;
revoke all on function public.bar_recipe_set_archived(uuid,uuid,integer,boolean,uuid), public.bar_recipe_set_image(uuid,uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.bar_recipe_set_archived(uuid,uuid,integer,boolean,uuid), public.bar_recipe_set_image(uuid,uuid,integer,text,text) to authenticated;

create function public.bar_recipe_category_save(p_organization_id uuid, p_category_id uuid, p_expected_version integer, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_category public.bar_recipe_categories%rowtype; v_slug text; v_order integer; v_constraint text;
begin
  v_actor := private.recipes_begin(p_organization_id);
  p_name := regexp_replace(btrim(p_name),'\s+',' ','g');
  if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Invalid category name' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  if p_category_id is null then
    if (select count(*) from public.bar_recipe_categories where organization_id=p_organization_id)>=40 then raise exception 'Too many categories' using errcode='22023'; end if;
    v_slug := rtrim(left(private.recipes_slugify(p_name),80),'-');
    if v_slug='' then raise exception 'Invalid category name' using errcode='22023'; end if;
    select coalesce(max(display_order),-1)+1 into v_order from public.bar_recipe_categories where organization_id=p_organization_id and not is_fallback;
    insert into public.bar_recipe_categories (organization_id,name,slug,display_order,created_by) values (p_organization_id,trim(p_name),v_slug,v_order,v_actor) returning * into v_category;
  else
    select * into v_category from public.bar_recipe_categories where organization_id=p_organization_id and id=p_category_id for update;
    if not found then raise exception 'Category not found' using errcode='22023'; end if;
    perform private.recipes_check_version(p_expected_version,v_category.version,v_category.updated_by,v_category.updated_at);
    update public.bar_recipe_categories set name=trim(p_name),updated_by=v_actor,updated_at=now(),version=version+1 where id=p_category_id and organization_id=p_organization_id returning * into v_category;
  end if;
  return jsonb_build_object('id',v_category.id,'version',v_category.version);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint='bar_recipe_categories_organization_id_slug_key' then
    select * into v_category from public.bar_recipe_categories where organization_id=p_organization_id and slug=v_slug;
    raise exception 'Category already exists' using errcode='23505',
      detail=jsonb_build_object('kind','duplicate','entity','category','field','slug','existing_id',v_category.id,'existing_label',v_category.name)::text;
  end if;
  raise;
end;
$$;
create function public.bar_recipe_category_set_active(p_organization_id uuid, p_category_id uuid, p_expected_version integer, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_category public.bar_recipe_categories%rowtype;
begin
  v_actor := private.recipes_begin(p_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  select * into v_category from public.bar_recipe_categories where organization_id=p_organization_id and id=p_category_id for update;
  if not found or p_active is null then raise exception 'Invalid category' using errcode='22023'; end if;
  perform private.recipes_check_version(p_expected_version,v_category.version,v_category.updated_by,v_category.updated_at);
  if not p_active and (v_category.is_fallback or exists(select 1 from public.bar_recipes where organization_id=p_organization_id and category_id=p_category_id and is_active)) then
    raise exception 'This category cannot be deactivated' using errcode='22023';
  end if;
  update public.bar_recipe_categories set is_active=p_active,updated_by=v_actor,updated_at=now(),version=version+1 where id=p_category_id and organization_id=p_organization_id returning * into v_category;
  return jsonb_build_object('id',v_category.id,'version',v_category.version);
end;
$$;
create function public.bar_recipe_category_reorder(p_organization_id uuid, p_ordered_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_count integer;
begin
  v_actor := private.recipes_begin(p_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  select count(*) into v_count from public.bar_recipe_categories where organization_id=p_organization_id and not is_fallback;
  if p_ordered_ids is null or cardinality(p_ordered_ids)<>v_count or
     (select count(distinct id) from unnest(p_ordered_ids) id)<>v_count or
     exists(select 1 from unnest(p_ordered_ids) id where not exists(select 1 from public.bar_recipe_categories c where c.id=id and c.organization_id=p_organization_id and not c.is_fallback)) then
    raise exception 'Invalid category order' using errcode='22023';
  end if;
  update public.bar_recipe_categories c set display_order=(x.ordinality-1)::integer, updated_by=v_actor,updated_at=now(),version=c.version+1
  from unnest(p_ordered_ids) with ordinality x(id,ordinality) where c.id=x.id and c.organization_id=p_organization_id;
  return jsonb_build_object('count',v_count);
end;
$$;
revoke all on function public.bar_recipe_category_save(uuid,uuid,integer,text), public.bar_recipe_category_set_active(uuid,uuid,integer,boolean), public.bar_recipe_category_reorder(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.bar_recipe_category_save(uuid,uuid,integer,text), public.bar_recipe_category_set_active(uuid,uuid,integer,boolean), public.bar_recipe_category_reorder(uuid,uuid[]) to authenticated;
