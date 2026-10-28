# Recipes V1 — Data model

Status: **LOCKED in R-0** (planning only: no migration, no table, no bucket, no data exists yet). R-1 writes the first migration from this file; R-2 writes the second. Conventions are those of Bar Inventory V1 and Tasks V1 (audited, in production): `uuid` primary keys, `organization_id` on every table, composite `(id, organization_id)` foreign keys, `created_by`/`updated_by` as composite FKs to `memberships`, integer `version` for optimistic concurrency, text + `check` instead of Postgres enums, SELECT-only grants, writes through `SECURITY DEFINER` RPCs with an empty `search_path`.

Repository facts this file relies on (verified at `development` `73ebc21`):

| Fact                                                                                                                                                             | Consequence                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Newer modules use `uuid` ids, `organization_id uuid not null references public.organizations (id) on delete cascade`, `unique (id, organization_id)`.            | Same for every Recipes table.                                                                                         |
| Actor columns are `created_by uuid not null` / `updated_by uuid` with composite FK `(organization_id, created_by) → memberships (organization_id, profile_id)`.  | Same. An actor must be a member of that organization.                                                                 |
| Optimistic concurrency is `version integer not null default 1`; update RPCs take `p_expected_version` and answer a stale write with `PT409` and a JSON `detail`. | Same contract (`kind: 'stale'`). Recipes owns its own copy of the two tiny helpers; it does not import Bar Inventory. |
| Archive is `active boolean` + `archived_at` with a consistency `check` (Bar Inventory products).                                                                 | `is_active` + `archived_at` + `archived_by`, same check shape.                                                        |
| No Storage bucket, no Storage policy and no `[storage.buckets.*]` block exists in the repository. `next/image` is not used anywhere.                             | Recipes introduces the first bucket (R-2) and uses plain `<img>`; see `STORAGE_PLAN.md`.                              |
| `organizations.settings jsonb` exists.                                                                                                                           | A future per-organization label override (`settings.recipes.houseLabel`) needs no migration. Not built in V1.         |
| `locations` exist (one per organization today); Bar Inventory's catalog is organization-level and only its stock is location-level.                              | Decision D-3 below: Recipes content is organization-wide.                                                             |

## 1. Final table names

```text
public.bar_recipe_categories     category records, ordered, one fallback ("Others") per organization
public.bar_recipes               one row per drink; identity, number, slug, flags, image reference
public.bar_recipe_variants       0..1 'perfect' and 0..1 'house' per recipe; method, rim, glass, notes
public.bar_recipe_ingredients    ordered structured ingredient rows per variant
public.bar_recipe_steps          ordered instruction rows per variant
public.bar_recipe_garnishes      ordered garnish rows per variant
```

The prompt's working names `recipe_categories` / `bar_recipes` were harmonised to one prefix, `bar_recipe_`, matching `inventory_*` and `task_*`. Internally the feature is `recipes` (`src/features/recipes/`); the DB prefix says "bar" because a future food-recipe module must not collide. No table named `cocktail*`.

There is **no** audit/change-log table, **no** image table, **no** glassware table, **no** spirits table, **no** alias table (decisions D-9, D-10, D-12, D-13).

## 2. Decisions locked here

| #    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | **Categories are rows**, not a TypeScript enum. Adding "Frozen Cocktails" needs no migration. Ordering is `(is_fallback, display_order, name)`; the fallback category (**Others**) is flagged `is_fallback` (not recognised by name) and always sorts last. One fallback per organization (partial unique index). The fallback can be renamed; it can never be reordered, deactivated or removed.                                                                                                                           |
| D-2  | **Recipe numbers are stored** (`recipe_number integer`), never derived. `unique (organization_id, recipe_number)` across **all** rows including archived ones: an archived recipe keeps its number, so a restore can never collide. The Add form suggests `max(recipe_number) + 1` (archived included); the database rejects a duplicate regardless of the client (`23505`, `detail` names the existing recipe). Gaps are allowed. Two numbers are swapped by moving one to a free number first (no deferrable constraint). |
| D-3  | **Organization-wide, no `location_id`.** The recipe book is a brand asset (one book per restaurant company, today one location). Adding `location_id` later is a nullable column plus a policy-helper change (see "Seam" below); Part 2 can decide per-location overrides with evidence. Not added reflexively.                                                                                                                                                                                                             |
| D-4  | **Variants are rows** (`perfect`, `house`), at most one of each per recipe. A recipe has **at least one** variant (enforced in the save RPC, not by a cross-table constraint). Persisted value is `house`, never `your`. User-facing labels live in one TypeScript function (`variant-labels.ts`).                                                                                                                                                                                                                          |
| D-5  | **Ingredients are structured**: `ingredient_name`, `amount text`, `unit text`, `preparation text`, `sort_order`. `amount` is **free text** ("2", "0.75", "Top", "Splash", "2 dashes", "1 bar spoon", "To taste", "8 leaves"). Nothing parses, converts or scales amounts. `unit` is optional free text with suggestions; "2 dashes" may be stored as amount `2 dashes` or amount `2` + unit `dashes`; the UI joins `amount unit name` either way.                                                                           |
| D-6  | **Method is free text with suggestions** (`method text`, ≤ 60). Combinations ("Muddle + Shake", "Shake + Float", "Roll or Stir") are legal. The editor offers a combobox of common methods and accepts anything.                                                                                                                                                                                                                                                                                                            |
| D-7  | **Steps are ordered rows**; the step number shown is the position, not stored.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-8  | **Rim**: `rim_type text` (label, ≤ 40; `null` = not specified, `None` = explicitly none) + `rim_notes text`. Suggestions: None, Salt, Half Salt, Sugar, Tajín, Half Tajín, Salt + Tajín, Caramel Sugar, Toasted Coconut, Chocolate, Custom (typing anything else is the "Custom" path; the word "Custom" itself is not persisted). Not an enum.                                                                                                                                                                             |
| D-9  | **Glass**: `glass text` (≤ 40) + `glass_notes text`. The 18 initial names are a TypeScript suggestion list (`glassware.ts`); any other text is stored as typed (the "Other" path). No glassware table.                                                                                                                                                                                                                                                                                                                      |
| D-10 | **Base spirit**: `base_spirit text` (≤ 40) with a suggestion list (Vodka, Gin, Rum, Tequila, Whiskey, Bourbon, Cachaça, …). No taxonomy. **`is_alcoholic boolean` is a separate explicit column** (the Alcohol/Mocktail filter must not be inferred from a category or a spirit name). A mocktail has `is_alcoholic = false` and normally no `base_spirit`.                                                                                                                                                                 |
| D-11 | **Garnish** rows (`name`, `notes`, `sort_order`), multiple per variant. `presentation_notes` on the variant is for plating ("lime wheel at 2 o'clock").                                                                                                                                                                                                                                                                                                                                                                     |
| D-12 | **Batch** (Green Tea Shot "4-shot batch"): one nullable `batch_notes text` (≤ 1000) per variant, shown as a "Batch" section when present. No batch/servings subsystem. Trade-off: batch quantities are prose and cannot be scaled; accepted because one source recipe needs it. Revisit if three or more recipes need structured batches.                                                                                                                                                                                   |
| D-13 | **No pricing.** Recipes is a reference module, not menu/POS management. Any price in the source is **not imported** (recorded in `SOURCE_MAPPING.md` as a source ambiguity for the owner).                                                                                                                                                                                                                                                                                                                                  |
| D-14 | **Alternate name**: one nullable `alternate_name` (≤ 120) on the recipe, searched. No alias table. **Description**: nullable `description` (≤ 200), shown under the name. Neither is required.                                                                                                                                                                                                                                                                                                                              |
| D-15 | **Archive, not delete.** `is_active` + `archived_at` + `archived_by`. No client or RPC hard delete exists. Archived recipes are invisible to Staff by RLS; management sees them with "Show archived". Archived recipes are read-only until restored. Only organization teardown (cascade) removes rows.                                                                                                                                                                                                                     |
| D-16 | **Slug**: assigned at creation from the name, unique per organization, **never rewritten on rename** (links keep working). Not editable in V1. Collisions get `-2`, `-3`. `new` and `edit` are reserved. Fallback `recipe-<number>` when the name has no letters or digits.                                                                                                                                                                                                                                                 |
| D-17 | **Atomic save = one RPC** (`bar_recipe_save`) taking the whole recipe as `jsonb`; child rows are **replaced** in the same transaction (delete + insert). Child ids are therefore not stable across saves and nothing may reference them. See §6.                                                                                                                                                                                                                                                                            |
| D-18 | **Stale-write protection**: `version` on categories and recipes; every save/archive/restore/image change takes `p_expected_version`. Two tabs: the second save gets `PT409` with who/when. No realtime, no merge UI.                                                                                                                                                                                                                                                                                                        |
| D-19 | **Audit** = `created_by/at`, `updated_by/at`, `archived_by/at`, `version`. No field-by-field history in V1 (backlog B-RC-2). Restore is attributable through `updated_by`/`updated_at`.                                                                                                                                                                                                                                                                                                                                     |
| D-20 | **No Realtime** (backlog B-RC-3). No tables are added to the `supabase_realtime` publication.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-21 | **Images**: two nullable paths on the recipe (`image_path` hero, `image_thumb_path` thumbnail), both set or both null, prefix-checked to the recipe's own `<organization_id>/<recipe_id>/` folder. Full design in `STORAGE_PLAN.md`.                                                                                                                                                                                                                                                                                        |
| D-22 | **Popular ≠ Menu ≠ Active.** `is_popular` highlights, `is_menu_item` marks "restaurant sells it now", `is_active` is visibility. Popular is a badge and a filter chip, not a category and not a featured strip.                                                                                                                                                                                                                                                                                                             |
| D-23 | **Duplicate recipe** is _future backlog_ (B-RC-1), not V1. Copy Perfect → House (D-24) is the only copy feature in V1.                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-24 | **Copy Perfect → House is client-side** form state, saved by the normal save. No DB function. See `UI_UX_PLAN.md` §7.                                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Pseudo-SQL (the contract R-1 and R-2 migrate from)

Not a migration. Names, types, constraints and indexes are binding; incidental formatting is not.

```sql
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
```

`on delete cascade` on the child FKs exists **only** so organization teardown (tests, harness cleanup) and the save RPC's replace-children step work; no code path deletes a recipe.

Plain-language `check (length(trim(...)))` is the repository convention. The RPC trims and collapses whitespace **before** insert (single-line fields collapse inner whitespace; `tips`, `batch_notes`, `description` and `instruction` keep line breaks). It does **not** change case, spelling, punctuation, brands or measurements — recipe content is stored exactly as supplied (source rule, `SOURCE_MAPPING.md`).

### Limits (single table, enforced in SQL checks, the RPC and the zod schema)

| Field                                   | Limit                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| Category name / slug                    | 1–80                                                                |
| Recipe name / alternate name            | 1–120                                                               |
| Description                             | ≤ 200                                                               |
| Base spirit                             | ≤ 40                                                                |
| Recipe number                           | integer 1–9999                                                      |
| Method / Rim type / Glass               | ≤ 60 / ≤ 40 / ≤ 40                                                  |
| Rim notes / Glass notes                 | ≤ 200 / ≤ 200                                                       |
| Presentation notes / Tips / Batch notes | ≤ 500 / ≤ 1000 / ≤ 1000                                             |
| Ingredient name / amount / unit / prep  | 1–120 / ≤ 40 / ≤ 30 / ≤ 120                                         |
| Step instruction                        | 1–500                                                               |
| Garnish name / notes                    | 1–120 / ≤ 200                                                       |
| Rows per variant                        | ≤ 30 ingredients, ≤ 20 steps, ≤ 10 garnishes (RPC, not table check) |
| Categories per organization             | ≤ 40 (RPC)                                                          |
| Recipes per organization                | soft expectation 40–250; the RPC caps at 2,000 as a runaway guard   |

## 4. Authorization helpers (membership-only, one seam per concern)

```text
private.recipes_is_member(org)    -- any ACTIVE membership of the organization (owner, general_manager,
                                  --   shift_manager, host, server). auth.uid() only; never organizations.created_by (#106)
private.recipes_is_manager(org)   -- ACTIVE membership with owner | general_manager | shift_manager
private.recipes_can_read_recipe(recipe_id)   -- member of the recipe's org AND (recipe.is_active OR manager)
private.recipes_can_read_variant(variant_id) -- recipes_can_read_recipe(variant.recipe_id)
private.recipes_begin(org)        -- preamble of every authenticated write RPC: auth.uid() not null (42501),
                                  --   recipes_is_manager(org) (42501)
```

All `language sql stable security definer set search_path = ''`; predicates used in policies are `grant execute … to authenticated`; internal helpers are revoked from `public, anon, authenticated`. This is the same shape as `private.inventory_is_manager` / `inventory_begin`.

**Seam.** "Staff may read", "who is management" and "which locations a manager works" each change in exactly one function. A future per-location recipe scope adds an argument to `recipes_is_member`/`recipes_is_manager` and a nullable `location_id` column; no policy text changes elsewhere.

The management set equals `tasks_is_manager` and `inventory_is_manager` (`owner | general_manager | shift_manager`) and the TypeScript `designation !== "staff"`. Recipes defines its own one-line predicate in each language (matching the repository: each module has one) and does **not** introduce a parallel role system or a new `AppRole`.

## 5. Grants and RLS

```sql
alter table public.bar_recipe_categories enable row level security;  -- and the 5 other tables
revoke all on table <all six> from public, anon, authenticated;
grant select on table <all six> to authenticated;                    -- no insert / update / delete / truncate
```

| Table                                            | `SELECT` policy (`to authenticated`)                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `bar_recipe_categories`                          | `private.recipes_is_member(organization_id) and (is_active or private.recipes_is_manager(organization_id))` |
| `bar_recipes`                                    | `private.recipes_is_member(organization_id) and (is_active or private.recipes_is_manager(organization_id))` |
| `bar_recipe_variants`                            | `private.recipes_can_read_recipe(recipe_id)`                                                                |
| `bar_recipe_ingredients` / `steps` / `garnishes` | `private.recipes_can_read_variant(variant_id)`                                                              |

There is **no** INSERT/UPDATE/DELETE policy on any table, so even a mistaken grant cannot open a write path. Staff reading an archived recipe by id or slug gets zero rows (indistinguishable from a missing recipe — no information leak). A category that is inactive is hidden from Staff; Staff still see active recipes only through their active category (a recipe in an inactive category cannot exist for Staff because deactivating a category requires it to have no active recipes; archived recipes may reference an inactive category).

Full role matrix, RPC contract and pgTAP list: `SECURITY_AND_ROLES.md`.

## 6. Writes: RPCs and the atomic save

### R-1 (foundation; only the import path writes)

```text
private.recipes_slugify(text)                      immutable; mirrors src/features/recipes/domain/recipe-slug.ts
private.recipes_apply(...)                         the ONE write core: validates a recipe payload, resolves category,
                                                   assigns slug, upserts the recipe, replaces variants/children,
                                                   bumps version, stamps updated_by. Both entry points call it.
public.bar_recipes_import(p_organization_id, p_actor_profile_id, p_payload jsonb, p_mode text, p_overwrite int[])
                                                   service_role ONLY (revoked from public, anon, authenticated).
                                                   Verifies p_actor_profile_id is an ACTIVE management member.
                                                   p_mode = 'dry_run' | 'create'. Returns a per-recipe report.
```

`dry_run` runs the full validation and writes nothing. `create` inserts recipes whose number **and** slug do not exist and **skips** (reports) the rest; it never overwrites. Overwriting an existing recipe needs its number in `p_overwrite` (explicit, per recipe). Categories in the payload are created when their `slug` is absent for the organization and never modified when present. The whole call is one transaction: a validation error rolls back everything.

### R-2 (management writes; authenticated)

```text
public.bar_recipe_save(p_organization_id, p_recipe_id uuid /*null = create*/, p_expected_version int, p_payload jsonb) → jsonb
public.bar_recipe_set_archived(p_organization_id, p_recipe_id, p_expected_version, p_archived boolean, p_category_id uuid default null) → jsonb
public.bar_recipe_set_image(p_organization_id, p_recipe_id, p_expected_version, p_image_path text, p_thumb_path text) → jsonb
public.bar_recipe_category_save(p_organization_id, p_category_id /*null = create*/, p_expected_version, p_name text) → jsonb
public.bar_recipe_category_set_active(p_organization_id, p_category_id, p_expected_version, p_active boolean) → jsonb
public.bar_recipe_category_reorder(p_organization_id, p_ordered_ids uuid[]) → jsonb
```

All: `security definer`, `set search_path = ''`, `recipes_begin(org)` first, `revoke … from public, anon`, `grant execute … to authenticated`, plain-language errors with `42501` (permission), `22023` (validation), `23505` (duplicate number/slug/category, `detail` names the existing row), `PT409` (stale).

**`bar_recipe_save` payload** (also the import format for one recipe; the import wraps it in `{categories, recipes}`):

```json
{
  "category_id": "uuid",
  "recipe_number": 23,
  "name": "…",
  "alternate_name": null,
  "description": null,
  "base_spirit": "Tequila",
  "is_alcoholic": true,
  "is_popular": false,
  "is_menu_item": true,
  "variants": {
    "perfect": {
      "method": "Shake",
      "rim_type": "Salt",
      "rim_notes": null,
      "glass": "Margarita",
      "glass_notes": null,
      "presentation_notes": null,
      "tips": null,
      "batch_notes": null,
      "ingredients": [
        {
          "ingredient_name": "…",
          "amount": "2",
          "unit": "oz",
          "preparation": null
        }
      ],
      "steps": [{ "instruction": "…" }],
      "garnishes": [{ "name": "…", "notes": null }]
    },
    "house": null
  }
}
```

Array order **is** `sort_order` (the RPC assigns 0..n-1; clients never send `sort_order`). A variant key that is absent or `null` means "this recipe has no such variant"; on update that deletes the variant and its children. At least one variant must be present. Image columns, `is_active` and `slug` are **not** part of the payload (image via `set_image`, archive via `set_archived`, slug immutable).

**Save algorithm** (one statement-level transaction, so any error leaves nothing half-saved):

1. `recipes_begin(org)`.
2. Create: `pg_advisory_xact_lock(hashtextextended('bar_recipe:' || org, 0))` (serialises slug/number assignment), validate, derive slug, insert. Update: `select … for update` the recipe row; wrong org/id → `22023`; archived → `22023` ("Restore this recipe before editing"); `version <> p_expected_version` → `PT409`.
3. Validate category belongs to the org and is active (or is the recipe's current category).
4. Validate every field/limit; a violation raises `22023` naming the field.
5. Upsert the recipe row; `version = version + 1`, `updated_by = auth.uid()`, `updated_at = now()`.
6. For each variant: delete the variants no longer present; upsert the present ones on `(recipe_id, variant)`; delete and re-insert that variant's ingredients/steps/garnishes with sequential `sort_order`.
7. Return `{ id, slug, version, recipe_number }`.

A duplicate `recipe_number` raises `23505` with `detail = {"kind":"duplicate","entity":"recipe","field":"recipe_number","existing_id":…,"existing_label":"23 Cadillac Margarita"}` — also when two sessions race (the unique index is the final arbiter).

**Idempotence.** Saving identical content still bumps `version` (children are re-inserted); the client suppresses a no-op save by comparing to its loaded snapshot. No idempotency key is needed for a human-driven editor.

## 7. Reads

- **Index**: one query for categories (`order by is_fallback, display_order, name`) and one for recipes (`id, recipe_number, name, slug, category_id, alternate_name, base_spirit, is_alcoholic, is_popular, is_menu_item, is_active, image_thumb_path, version`). Both are far below PostgREST's 1,000-row page (expected 40–250 recipes); the data layer asserts `count < 1000` and pages if ever exceeded (as `catalog-data.ts` does). Staff get active rows by RLS; management adds `is_active` via the "Show archived" toggle (a client filter over rows RLS already returns).
- **Detail**: one nested select by `(organization_id, slug)` returning the recipe, its variants and their ordered children (`order(sort_order)` on each embedded table).
- **Next number** (management editor only): `select max(recipe_number)` over `bar_recipes` (RLS returns archived rows to management). Advisory only; the unique index decides.
- **Search / grouping / filters / sorting** run in TypeScript over the loaded index (`recipe-search.ts`, `recipe-grouping.ts`, `recipe-filters.ts`). Expected scale ≈ 40–250 recipes: no pagination, virtualization, trigram/FTS index, or Elasticsearch in V1.

## 8. Organization-scope proof obligations (pgTAP, R-1/R-2)

Every table carries `organization_id`; every cross-table link is a composite FK containing it, so a child can never point at another tenant's parent. A forged `category_id` from another organization fails (composite FK + RPC validation). Cross-organization read returns zero rows; cross-organization write fails `42501`/`22023`. See `TEST_MATRIX.md` RC-1xx.

## 9. Migration plan

| Migration (names are indicative; timestamps must sort after `20261028100100`) | Phase | Contents                                                                                                                         |
| ----------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `<ts>_bar_recipes_foundation.sql`                                             | R-1   | six tables, constraints, indexes, helpers, RLS + grants, `recipes_slugify`, `recipes_apply`, `bar_recipes_import` (service_role) |
| `<ts>_bar_recipes_management_and_images.sql`                                  | R-2   | `bar_recipe_*` authenticated RPCs, `recipe-images` bucket (`insert … on conflict do update`), `storage.objects` policies         |

Forward-only and **additive** (no existing object altered), so the previous app on the new schema is unaffected. `src/types/database.generated.ts` is regenerated in each phase. Applied to hosted **DEV only** during R-1/R-2; PROD only in the release phase after owner approval (`IMPLEMENTATION_PLAN.md` §6).

Rollback limit: never drop the tables once PROD has them; a defect is fixed by a forward corrective migration, and bad data by archiving (the module is read-only for Staff, so archive-all is a complete data kill-switch).
