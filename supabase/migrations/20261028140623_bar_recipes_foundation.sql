-- Recipes V1 R-1: organization-wide read model and controlled import.

-- ===== categories =====
create table public.bar_recipe_categories (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  slug          text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 80),
  display_order integer not null default 0 check (display_order between 0 and 100000),
  is_active     boolean not null default true,
  is_fallback   boolean not null default false,
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  unique (organization_id, slug),
  constraint bar_recipe_categories_fallback_active check (not is_fallback or is_active),
  constraint bar_recipe_categories_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint bar_recipe_categories_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);
create unique index bar_recipe_categories_fallback_uidx
  on public.bar_recipe_categories (organization_id) where is_fallback;
create index bar_recipe_categories_order_idx
  on public.bar_recipe_categories (organization_id, is_fallback, display_order);
-- + creator/updater FK indexes, same shape as inventory_categories_*_idx

-- ===== recipes =====
create table public.bar_recipes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id     uuid not null,
  recipe_number   integer not null check (recipe_number between 1 and 9999),
  name            text not null check (length(trim(name)) between 1 and 120),
  slug            text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 80
                                       and slug not in ('new', 'edit')),
  alternate_name  text check (alternate_name is null or length(trim(alternate_name)) between 1 and 120),
  description     text check (description is null or length(trim(description)) between 1 and 200),
  base_spirit     text check (base_spirit is null or length(trim(base_spirit)) between 1 and 40),
  is_alcoholic    boolean not null default true,
  image_path       text,
  image_thumb_path text,
  is_menu_item    boolean not null default false,
  is_popular      boolean not null default false,
  is_active       boolean not null default true,
  archived_at     timestamptz,
  archived_by     uuid,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  version         integer not null default 1 check (version >= 1),
  unique (id, organization_id),
  unique (organization_id, recipe_number),
  unique (organization_id, slug),
  constraint bar_recipes_category_fk
    foreign key (category_id, organization_id) references public.bar_recipe_categories (id, organization_id),
  constraint bar_recipes_archive_consistency
    check ((is_active and archived_at is null and archived_by is null)
        or (not is_active and archived_at is not null)),
  constraint bar_recipes_image_pair
    check ((image_path is null) = (image_thumb_path is null)),
  constraint bar_recipes_image_scope                       -- an image can only live in the recipe's own folder
    check (image_path is null or (
         image_path       like organization_id::text || '/' || id::text || '/%'
     and image_thumb_path like organization_id::text || '/' || id::text || '/%')),
  constraint bar_recipes_creator_fk
    foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  constraint bar_recipes_updater_fk
    foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id),
  constraint bar_recipes_archiver_fk
    foreign key (organization_id, archived_by) references public.memberships (organization_id, profile_id)
);
create index bar_recipes_category_idx   on public.bar_recipes (category_id, organization_id);
create index bar_recipes_org_active_idx on public.bar_recipes (organization_id, is_active, recipe_number);
-- + creator/updater/archiver FK indexes (partial where not null), same shape as inventory_products_*_idx

-- ===== variants =====
create table public.bar_recipe_variants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  recipe_id        uuid not null,
  variant          text not null check (variant in ('perfect', 'house')),
  method           text check (method is null or length(trim(method)) between 1 and 60),
  rim_type         text check (rim_type is null or length(trim(rim_type)) between 1 and 40),
  rim_notes        text check (rim_notes is null or length(trim(rim_notes)) between 1 and 200),
  glass            text check (glass is null or length(trim(glass)) between 1 and 40),
  glass_notes      text check (glass_notes is null or length(trim(glass_notes)) between 1 and 200),
  presentation_notes text check (presentation_notes is null or length(trim(presentation_notes)) between 1 and 500),
  tips             text check (tips is null or length(trim(tips)) between 1 and 1000),
  batch_notes      text check (batch_notes is null or length(trim(batch_notes)) between 1 and 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (recipe_id, variant),                              -- at most one perfect, one house
  constraint bar_recipe_variants_recipe_fk
    foreign key (recipe_id, organization_id) references public.bar_recipes (id, organization_id) on delete cascade
);

-- ===== ingredients / steps / garnishes (same shape) =====
create table public.bar_recipe_ingredients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  variant_id      uuid not null,
  ingredient_name text not null check (length(trim(ingredient_name)) between 1 and 120),
  amount          text check (amount is null or length(trim(amount)) between 1 and 40),
  unit            text check (unit is null or length(trim(unit)) between 1 and 30),
  preparation     text check (preparation is null or length(trim(preparation)) between 1 and 120),
  sort_order      integer not null check (sort_order >= 0),
  unique (variant_id, sort_order),                          -- deterministic order, no ties
  constraint bar_recipe_ingredients_variant_fk
    foreign key (variant_id, organization_id) references public.bar_recipe_variants (id, organization_id) on delete cascade
);
create table public.bar_recipe_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  variant_id uuid not null,
  instruction text not null check (length(trim(instruction)) between 1 and 500),
  sort_order integer not null check (sort_order >= 0),
  unique (variant_id, sort_order),
  constraint bar_recipe_steps_variant_fk
    foreign key (variant_id, organization_id) references public.bar_recipe_variants (id, organization_id) on delete cascade
);
create table public.bar_recipe_garnishes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  variant_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  notes text check (notes is null or length(trim(notes)) between 1 and 200),
  sort_order integer not null check (sort_order >= 0),
  unique (variant_id, sort_order),
  constraint bar_recipe_garnishes_variant_fk
    foreign key (variant_id, organization_id) references public.bar_recipe_variants (id, organization_id) on delete cascade
);
create index bar_recipe_variants_recipe_idx on public.bar_recipe_variants (recipe_id, organization_id);
-- children: the unique (variant_id, sort_order) index already leads with variant_id; add (organization_id)
-- indexes only if the Supabase advisor flags the composite FK.

-- Index foreign keys used for membership attribution and tenant-scoped joins.
create index bar_recipe_categories_creator_idx on public.bar_recipe_categories (organization_id, created_by);
create index bar_recipe_categories_updater_idx on public.bar_recipe_categories (organization_id, updated_by) where updated_by is not null;
create index bar_recipes_creator_idx on public.bar_recipes (organization_id, created_by);
create index bar_recipes_updater_idx on public.bar_recipes (organization_id, updated_by) where updated_by is not null;
create index bar_recipes_archiver_idx on public.bar_recipes (organization_id, archived_by) where archived_by is not null;
create index bar_recipe_ingredients_variant_org_idx on public.bar_recipe_ingredients (variant_id, organization_id);
create index bar_recipe_steps_variant_org_idx on public.bar_recipe_steps (variant_id, organization_id);
create index bar_recipe_garnishes_variant_org_idx on public.bar_recipe_garnishes (variant_id, organization_id);

create function private.recipes_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organization_id = p_org and m.profile_id = (select auth.uid()) and m.active);
$$;
create function private.recipes_is_manager(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organization_id = p_org and m.profile_id = (select auth.uid()) and m.active and m.roles && array['owner','general_manager','shift_manager']::public.app_role[]);
$$;
create function private.recipes_can_read_recipe(p_recipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bar_recipes r where r.id = p_recipe and private.recipes_is_member(r.organization_id) and (r.is_active or private.recipes_is_manager(r.organization_id)));
$$;
create function private.recipes_can_read_variant(p_variant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bar_recipe_variants v where v.id = p_variant and private.recipes_can_read_recipe(v.recipe_id));
$$;
revoke all on function private.recipes_is_member(uuid), private.recipes_is_manager(uuid), private.recipes_can_read_recipe(uuid), private.recipes_can_read_variant(uuid) from public, anon, authenticated;
grant execute on function private.recipes_is_member(uuid), private.recipes_is_manager(uuid), private.recipes_can_read_recipe(uuid), private.recipes_can_read_variant(uuid) to authenticated;

alter table public.bar_recipe_categories enable row level security;
alter table public.bar_recipes enable row level security;
alter table public.bar_recipe_variants enable row level security;
alter table public.bar_recipe_ingredients enable row level security;
alter table public.bar_recipe_steps enable row level security;
alter table public.bar_recipe_garnishes enable row level security;
revoke all on table public.bar_recipe_categories, public.bar_recipes, public.bar_recipe_variants, public.bar_recipe_ingredients, public.bar_recipe_steps, public.bar_recipe_garnishes from public, anon, authenticated;
grant select on table public.bar_recipe_categories, public.bar_recipes, public.bar_recipe_variants, public.bar_recipe_ingredients, public.bar_recipe_steps, public.bar_recipe_garnishes to authenticated;
create policy bar_recipe_categories_select on public.bar_recipe_categories for select to authenticated using (private.recipes_is_member(organization_id) and (is_active or private.recipes_is_manager(organization_id)));
create policy bar_recipes_select on public.bar_recipes for select to authenticated using (private.recipes_is_member(organization_id) and (is_active or private.recipes_is_manager(organization_id)));
create policy bar_recipe_variants_select on public.bar_recipe_variants for select to authenticated using (private.recipes_can_read_recipe(recipe_id));
create policy bar_recipe_ingredients_select on public.bar_recipe_ingredients for select to authenticated using (private.recipes_can_read_variant(variant_id));
create policy bar_recipe_steps_select on public.bar_recipe_steps for select to authenticated using (private.recipes_can_read_variant(variant_id));
create policy bar_recipe_garnishes_select on public.bar_recipe_garnishes for select to authenticated using (private.recipes_can_read_variant(variant_id));

-- Shared write core. Only trusted import code may call it; authenticated
-- editing is deliberately deferred to the management migration.
create function private.recipes_slugify(p_name text) returns text
language sql immutable strict set search_path = '' as $$
  select trim(both '-' from regexp_replace(translate(regexp_replace(normalize(lower(p_name), NFD), U&'[\0300-\036f]', '', 'g'),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy'),
    '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function private.recipes_slugify(text) from public, anon, authenticated;

create function private.recipes_check_text(p_object jsonb, p_field text, p_required boolean default false)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_object) is distinct from 'object' or
    (p_required and jsonb_typeof(p_object->p_field) is distinct from 'string') or
    (p_object ? p_field and p_object->p_field <> 'null'::jsonb and jsonb_typeof(p_object->p_field) is distinct from 'string') then
    raise exception 'Invalid text field: %', p_field using errcode='22023';
  end if;
end;
$$;
revoke all on function private.recipes_check_text(jsonb,text,boolean) from public, anon, authenticated;

create function private.recipes_check_keys(p_object jsonb, p_allowed text[])
returns void language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_object) is distinct from 'object' then
    raise exception 'Expected an object' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_object) k where not k=any(p_allowed)) then
    raise exception 'Unexpected field in import payload' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.recipes_check_keys(jsonb,text[]) from public, anon, authenticated;

create function private.recipes_apply(p_org uuid, p_actor uuid, p_category uuid, p_payload jsonb, p_existing uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_recipe uuid; v_slug text; v_number integer; v_variant jsonb; v_kind text;
  v_variant_id uuid; v_item jsonb; v_order bigint; v_values jsonb; v_field text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'recipe_number') is distinct from 'number'
    or (p_payload->>'recipe_number') !~ '^[0-9]+$' or jsonb_typeof(p_payload->'name') is distinct from 'string'
    or jsonb_typeof(p_payload->'variants') is distinct from 'object' then
    raise exception 'Invalid recipe payload' using errcode = '22023';
  end if;
  perform private.recipes_check_keys(p_payload,array['recipe_number','name','category_slug','alternate_name','description','base_spirit','is_alcoholic','is_popular','is_menu_item','variants','source_ref','source_notes']);
  foreach v_field in array array['alternate_name','description','base_spirit'] loop
    perform private.recipes_check_text(p_payload,v_field);
  end loop;
  foreach v_field in array array['is_alcoholic','is_popular','is_menu_item'] loop
    if p_payload ? v_field and jsonb_typeof(p_payload->v_field) is distinct from 'boolean' then
      raise exception 'Invalid boolean field: %',v_field using errcode='22023';
    end if;
  end loop;
  v_number := (p_payload->>'recipe_number')::integer;
  if not exists (select 1 from public.bar_recipe_categories c where c.id=p_category and c.organization_id=p_org and c.is_active) then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload->'variants') k where k not in ('perfect','house'))
     or (coalesce(p_payload->'variants'->'perfect','null'::jsonb) = 'null'::jsonb and coalesce(p_payload->'variants'->'house','null'::jsonb) = 'null'::jsonb) then
    raise exception 'Invalid variants' using errcode = '22023';
  end if;
  v_slug := left(private.recipes_slugify(p_payload->>'name'),80);
  v_slug := rtrim(v_slug,'-');
  if v_slug = '' or v_slug in ('new','edit') then v_slug := 'recipe-' || v_number; end if;
  if p_existing is null then
    insert into public.bar_recipes (organization_id,category_id,recipe_number,name,slug,alternate_name,description,base_spirit,is_alcoholic,is_popular,is_menu_item,created_by)
    values (p_org,p_category,v_number,trim(p_payload->>'name'),v_slug,nullif(trim(p_payload->>'alternate_name'),''),nullif(trim(p_payload->>'description'),''),nullif(trim(p_payload->>'base_spirit'),''),coalesce((p_payload->>'is_alcoholic')::boolean,true),coalesce((p_payload->>'is_popular')::boolean,false),coalesce((p_payload->>'is_menu_item')::boolean,false),p_actor)
    returning id into v_recipe;
  else
    update public.bar_recipes set category_id=p_category, name=trim(p_payload->>'name'), alternate_name=nullif(trim(p_payload->>'alternate_name'),''), description=nullif(trim(p_payload->>'description'),''), base_spirit=nullif(trim(p_payload->>'base_spirit'),''), is_alcoholic=coalesce((p_payload->>'is_alcoholic')::boolean,true), is_popular=coalesce((p_payload->>'is_popular')::boolean,false), is_menu_item=coalesce((p_payload->>'is_menu_item')::boolean,false), updated_by=p_actor, updated_at=now(), version=version+1
    where id=p_existing and organization_id=p_org and recipe_number=v_number and is_active returning id,slug into v_recipe,v_slug;
    if v_recipe is null then raise exception 'Invalid existing recipe' using errcode='22023'; end if;
    delete from public.bar_recipe_variants where recipe_id=v_recipe and organization_id=p_org;
  end if;
  for v_kind in select unnest(array['perfect','house']) loop
    v_variant := p_payload->'variants'->v_kind;
    if v_variant is null or v_variant='null'::jsonb then continue; end if;
    if jsonb_typeof(v_variant)<>'object' then raise exception 'Invalid variant' using errcode='22023'; end if;
    perform private.recipes_check_keys(v_variant,array['method','rim_type','rim_notes','glass','glass_notes','presentation_notes','tips','batch_notes','ingredients','steps','garnishes']);
    foreach v_field in array array['method','rim_type','rim_notes','glass','glass_notes','presentation_notes','tips','batch_notes'] loop
      perform private.recipes_check_text(v_variant,v_field);
    end loop;
    insert into public.bar_recipe_variants (organization_id,recipe_id,variant,method,rim_type,rim_notes,glass,glass_notes,presentation_notes,tips,batch_notes)
      values (p_org,v_recipe,v_kind,nullif(trim(v_variant->>'method'),''),nullif(trim(v_variant->>'rim_type'),''),nullif(trim(v_variant->>'rim_notes'),''),nullif(trim(v_variant->>'glass'),''),nullif(trim(v_variant->>'glass_notes'),''),nullif(trim(v_variant->>'presentation_notes'),''),nullif(trim(v_variant->>'tips'),''),nullif(trim(v_variant->>'batch_notes'),'')) returning id into v_variant_id;
    v_values := coalesce(v_variant->'ingredients','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' or jsonb_array_length(v_values)>30 then raise exception 'Invalid ingredients' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'ingredient_name') is distinct from 'string' or v_item ? 'sort_order' then raise exception 'Invalid ingredient' using errcode='22023'; end if;
      perform private.recipes_check_keys(v_item,array['ingredient_name','amount','unit','preparation']);
      foreach v_field in array array['amount','unit','preparation'] loop perform private.recipes_check_text(v_item,v_field); end loop;
      insert into public.bar_recipe_ingredients (organization_id,variant_id,ingredient_name,amount,unit,preparation,sort_order) values (p_org,v_variant_id,trim(v_item->>'ingredient_name'),nullif(trim(v_item->>'amount'),''),nullif(trim(v_item->>'unit'),''),nullif(trim(v_item->>'preparation'),''),v_order);
    end loop;
    v_values := coalesce(v_variant->'steps','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' or jsonb_array_length(v_values)>20 then raise exception 'Invalid steps' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'instruction') is distinct from 'string' or v_item ? 'sort_order' then raise exception 'Invalid step' using errcode='22023'; end if;
      perform private.recipes_check_keys(v_item,array['instruction']);
      insert into public.bar_recipe_steps (organization_id,variant_id,instruction,sort_order) values (p_org,v_variant_id,trim(v_item->>'instruction'),v_order);
    end loop;
    v_values := coalesce(v_variant->'garnishes','[]'::jsonb);
    if jsonb_typeof(v_values)<>'array' or jsonb_array_length(v_values)>10 then raise exception 'Invalid garnishes' using errcode='22023'; end if;
    for v_item,v_order in select value,ordinality-1 from jsonb_array_elements(v_values) with ordinality loop
      if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'name') is distinct from 'string' or v_item ? 'sort_order' then raise exception 'Invalid garnish' using errcode='22023'; end if;
      perform private.recipes_check_keys(v_item,array['name','notes']);
      perform private.recipes_check_text(v_item,'notes');
      insert into public.bar_recipe_garnishes (organization_id,variant_id,name,notes,sort_order) values (p_org,v_variant_id,trim(v_item->>'name'),nullif(trim(v_item->>'notes'),''),v_order);
    end loop;
  end loop;
  return jsonb_build_object('id',v_recipe,'slug',v_slug,'recipe_number',v_number);
end;
$$;
revoke all on function private.recipes_apply(uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated;

-- One service-only call owns the complete import transaction. Dry-run executes
-- the same writes in a subtransaction and deliberately rolls them back.
create function public.bar_recipes_import(p_organization_id uuid, p_actor_profile_id uuid, p_payload jsonb, p_mode text, p_overwrite integer[] default '{}'::integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cat jsonb; v_recipe jsonb; v_category_id uuid; v_existing uuid;
  v_existing_slug uuid; v_num integer; v_slug text; v_result jsonb;
  v_report jsonb := '[]'::jsonb; v_result_report jsonb := '[]'::jsonb;
  v_numbers integer[] := '{}'::integer[]; v_slugs text[] := '{}'::text[];
  v_category_slugs text[] := '{}'::text[];
  v_validation_number integer; v_validation_payload jsonb;
begin
  if not exists (select 1 from public.memberships m where m.organization_id=p_organization_id and m.profile_id=p_actor_profile_id and m.active and m.roles && array['owner','general_manager','shift_manager']::public.app_role[]) then
    raise exception 'Active management actor required' using errcode='42501';
  end if;
  if p_mode not in ('dry_run','create') or p_mode is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_payload->>'format' is distinct from 'the-lineup.bar-recipes.import' or p_payload->>'version' is distinct from '1'
     or jsonb_typeof(p_payload->'categories') is distinct from 'array' or jsonb_typeof(p_payload->'recipes') is distinct from 'array'
     or jsonb_array_length(p_payload->'categories')>40 or jsonb_array_length(p_payload->'recipes')>2000 then
    raise exception 'Invalid import payload' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bar_recipe:' || p_organization_id::text,0));
  begin
    for v_cat in select value from jsonb_array_elements(p_payload->'categories') loop
      if jsonb_typeof(v_cat) is distinct from 'object' or jsonb_typeof(v_cat->'name') is distinct from 'string'
         or jsonb_typeof(v_cat->'slug') is distinct from 'string'
         or (v_cat ? 'display_order' and (jsonb_typeof(v_cat->'display_order') is distinct from 'number' or (v_cat->>'display_order') !~ '^[0-9]+$'))
         or (v_cat ? 'is_fallback' and jsonb_typeof(v_cat->'is_fallback') is distinct from 'boolean') then raise exception 'Invalid category' using errcode='22023'; end if;
      perform private.recipes_check_keys(v_cat,array['name','slug','display_order','is_fallback']);
      if v_cat->>'slug'=any(v_category_slugs) then raise exception 'Duplicate category' using errcode='23505'; end if;
      v_category_slugs:=array_append(v_category_slugs,v_cat->>'slug');
      insert into public.bar_recipe_categories (organization_id,name,slug,display_order,is_fallback,created_by)
      values (p_organization_id,trim(v_cat->>'name'),v_cat->>'slug',coalesce((v_cat->>'display_order')::integer,0),coalesce((v_cat->>'is_fallback')::boolean,false),p_actor_profile_id)
      on conflict (organization_id,slug) do nothing;
    end loop;
    if (select count(*) from public.bar_recipe_categories where organization_id=p_organization_id)>40 then
      raise exception 'Too many categories' using errcode='22023';
    end if;
    for v_recipe in select value from jsonb_array_elements(p_payload->'recipes') loop
      if jsonb_typeof(v_recipe) is distinct from 'object' or jsonb_typeof(v_recipe->'recipe_number') is distinct from 'number'
         or (v_recipe->>'recipe_number') !~ '^[0-9]+$' or jsonb_typeof(v_recipe->'name') is distinct from 'string'
         or jsonb_typeof(v_recipe->'category_slug') is distinct from 'string' then
        raise exception 'Invalid recipe' using errcode='22023';
      end if;
      v_num := (v_recipe->>'recipe_number')::integer;
      if v_num not between 1 and 9999 or length(trim(v_recipe->>'name')) not between 1 and 120 then
        raise exception 'Invalid recipe number or name' using errcode='22023';
      end if;
      v_slug := rtrim(left(private.recipes_slugify(v_recipe->>'name'),80),'-');
      if v_slug='' or v_slug in ('new','edit') then v_slug:='recipe-' || v_num; end if;
      if v_num=any(v_numbers) or v_slug=any(v_slugs) then raise exception 'Duplicate recipe in import' using errcode='23505'; end if;
      v_numbers:=array_append(v_numbers,v_num); v_slugs:=array_append(v_slugs,v_slug);
      select id into v_category_id from public.bar_recipe_categories where organization_id=p_organization_id and slug=v_recipe->>'category_slug' and is_active;
      if v_category_id is null then raise exception 'Unknown category' using errcode='22023'; end if;
      select id into v_existing from public.bar_recipes where organization_id=p_organization_id and recipe_number=v_num;
      select id into v_existing_slug from public.bar_recipes where organization_id=p_organization_id and slug=v_slug;
      if v_existing is not null and v_num=any(coalesce(p_overwrite,'{}'::integer[])) then
        if v_existing_slug is not null and v_existing_slug<>v_existing then raise exception 'Slug belongs to another recipe' using errcode='23505'; end if;
        v_result:=private.recipes_apply(p_organization_id,p_actor_profile_id,v_category_id,v_recipe,v_existing);
        v_report:=v_report || jsonb_build_array((case when p_mode='dry_run' then v_result - 'id' else v_result end) || jsonb_build_object('status','updated'));
      elsif v_existing is not null or v_existing_slug is not null then
        -- Validate even skipped records, without modifying the existing recipe.
        -- The organization lock prevents competing imports from taking this number.
        select n into v_validation_number from generate_series(1,9999) n
          where not exists (select 1 from public.bar_recipes r where r.organization_id=p_organization_id and r.recipe_number=n)
          limit 1;
        if v_validation_number is null then raise exception 'No validation number available' using errcode='22023'; end if;
        v_validation_payload := jsonb_set(jsonb_set(v_recipe,'{recipe_number}',to_jsonb(v_validation_number)),'{name}',to_jsonb('validation-' || gen_random_uuid()::text));
        begin
          perform private.recipes_apply(p_organization_id,p_actor_profile_id,v_category_id,v_validation_payload,null);
          raise exception 'validation rollback' using errcode='P9002';
        exception when sqlstate 'P9002' then null;
        end;
        v_report:=v_report || jsonb_build_array(jsonb_build_object('recipe_number',v_num,'slug',v_slug,'status','skipped-existing'));
      else
        v_result:=private.recipes_apply(p_organization_id,p_actor_profile_id,v_category_id,v_recipe,null);
        v_report:=v_report || jsonb_build_array((case when p_mode='dry_run' then v_result - 'id' else v_result end) || jsonb_build_object('status','created'));
      end if;
    end loop;
    if (select count(*) from public.bar_recipes where organization_id=p_organization_id)>2000 then
      raise exception 'Too many recipes' using errcode='22023';
    end if;
    if exists (select 1 from unnest(coalesce(p_overwrite,'{}'::integer[])) n where not n=any(v_numbers)) then
      raise exception 'Overwrite number missing from payload' using errcode='22023';
    end if;
    v_result_report:=v_report;
    if p_mode='dry_run' then raise exception 'dry run rollback' using errcode='P9001'; end if;
  exception when sqlstate 'P9001' then null;
  end;
  return jsonb_build_object('mode',p_mode,'recipes',v_result_report);
end;
$$;
revoke all on function public.bar_recipes_import(uuid,uuid,jsonb,text,integer[]) from public, anon, authenticated;
grant execute on function public.bar_recipes_import(uuid,uuid,jsonb,text,integer[]) to service_role;
