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
