# Recipes V1 — Plan

**Status:** R-0 (planning) **COMPLETE** — merged into `development` by PR #221 (merge commit `26cceaf78cda08d20a04cdea16b0978e21626a3b`, tested head `f01ace87c83f412bd450342846aa5ba6021d69b3`). R-1 NEXT · R-2 PLANNED · Part 2 ON HOLD.
**Safety:** docs only. No application code, no migration, no Storage bucket, no seed or recipe data, DEV database untouched, PROD untouched, `main` untouched.
**Base:** `development` `73ebc210d97778db238b26acbee82481190560ea` (`main` `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05` = current Production, which already contains Tasks V1.1, Bar Inventory V1, Vendor Order Drafts V1, the same-server repeat-table fix and the dependency/security update). Recipes V1 starts after that release.
**Branch/PR policy (permanent):** R-0 → PR → `development` (merge commit) · R-1 → PR → `development` (merge commit) · R-2 → PR → `development` (merge commit) · Recipes final audit / release-readiness → explicit owner approval → `development → main` → Production verification. R-0/R-1/R-2 never go straight to `main`; no release PR during R-0.

## 1. Document map

| Document                                           | What it fixes                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`PRD.md`](PRD.md)                                 | problem, users, goals, non-goals, requirements, success criteria                                                                 |
| [`DATA_MODEL.md`](DATA_MODEL.md)                   | tables, columns, constraints, indexes, RLS, RPC/save model, org & location scope, migrations                                     |
| [`SECURITY_AND_ROLES.md`](SECURITY_AND_ROLES.md)   | role mapping to the real app roles, capability matrix, enforcement layers, error contract, pgTAP list                            |
| [`STORAGE_PLAN.md`](STORAGE_PLAN.md)               | bucket, paths, policies, limits, delivery, caching, orphan handling                                                              |
| [`UI_UX_PLAN.md`](UI_UX_PLAN.md)                   | naming, nav and routing (exact extension points), wireframes, states, accessibility, responsive                                  |
| [`SOURCE_MAPPING.md`](SOURCE_MAPPING.md)           | source authority, model mapping, import mechanism and format, ambiguities                                                        |
| [`TEST_MATRIX.md`](TEST_MATRIX.md)                 | 160 scenarios RC-001…RC-160 → layers U/D/E/H → phases                                                                            |
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | file tree, R-1 / R-2 / R-2g work order with files, migrations, tests, DEV validation, PR boundary, GO criteria, release sequence |

## 2. Repository truth that shaped the plan (verified 2026-10-28)

| Fact                                                                                                                                                                                                                                                                                                                             | Consequence                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app is one client shell; modules are addressed by `?tab=` (`src/lib/app-tab.ts`, T-1); only routes are `/` and `/r/[restaurantSlug]`. `AppTab` has 9 members; `resolveTab` gates only Team/Bar Inventory (managers) and Payroll (not demo).                                                                                  | Recipes = one new `AppTab` member (`recipes`) visible to all roles; detail rides `&recipe=<slug>`; **no router change**.                                              |
| Desktop has primary (Table Allocation, Tasks) and secondary tiers; mobile has a fixed 3-button dock (Allocation, Tasks, More) and a More sheet that renders `secondaryTabs`.                                                                                                                                                     | Add Recipes to `secondaryTabs` after Bar Inventory; the More sheet reaches it on phones. **Dock untouched.**                                                          |
| Roles: DB `owner / general_manager / shift_manager / host / server` → `AppRole owner / manager / server`; designation `owner / manager / assistant_manager / staff`; every module defines its own one-line manager predicate (`isInventoryManager`, `isTasksManager`) and SQL seam (`inventory_is_manager`, `tasks_is_manager`). | Recipes adds `isRecipesManager` and `recipes_is_manager`/`recipes_is_member`; **no parallel role system**; `has_org_role` (with its `created_by` bypass) is not used. |
| Newer modules: `uuid` ids, `organization_id` on every table, composite FKs, actor FKs to `memberships`, `version` + `PT409`, SELECT-only grants + `SECURITY DEFINER` RPCs, text+check instead of enums, archive = `active` + `archived_at`.                                                                                      | Recipes follows all of it.                                                                                                                                            |
| Bar Inventory's catalog is organization-level; only stock is location-level. Part 2 is the multi-organization/multi-location phase.                                                                                                                                                                                              | Recipes is organization-wide; no `location_id` (D-3).                                                                                                                 |
| There is **no** Storage bucket/policy/config and `next/image` is unused; Server Actions already allow 8 MB bodies; the browser Supabase client is realtime-only.                                                                                                                                                                 | First bucket is Recipes' (R-2); plain `<img>`; uploads via Server Action; signed URLs.                                                                                |
| The shell has no cross-module "leave" guard; Bar Inventory's Order Drafts guards in-module navigation and `beforeunload` only.                                                                                                                                                                                                   | Editor does the same; shell guard is backlog B-RC-7.                                                                                                                  |
| `deploy-migrations` on push to `main` fails at `supabase link` (#111); PROD migrations are applied by the guarded Management-API route proven 2026-10-26/28.                                                                                                                                                                     | The Recipes release applies its two additive migrations that way, migrations first (`IMPLEMENTATION_PLAN.md` §6).                                                     |
| The app runs in demo mode when Supabase env is absent; the Playwright demo suite is the main UI test layer.                                                                                                                                                                                                                      | Recipes ships a **synthetic** demo dataset and in-memory engine; real recipe content is never in demo data.                                                           |
| Source recipe-book files (DOCX/PDF) are **not** in the repository or the cloud container.                                                                                                                                                                                                                                        | No recipe content is written in R-0; import format + process are defined; the real import is owner-gated.                                                             |
| No GitHub issue for Recipes existed; Bar Inventory used one parent issue (#168) with phases in the body; labels `type:feature`, `priority:p*`, `module:*`; milestone "Future Product Backlog".                                                                                                                                   | One parent issue for Recipes V1 (see §7).                                                                                                                             |

## 3. Decision register (all LOCKED; detail in the linked document)

| ID   | Decision                                                                                                                                                                                                                            | Where                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| P-1  | Module label **Recipes**, page heading **Bar Recipes**, internal `recipes` / `bar_recipe*`; never "Cocktail Database"                                                                                                               | UI_UX §1                        |
| P-2  | Variants persisted `perfect` / `house`; UI "Perfect Bartending Recipe" / "House Recipe"; mobile tabs "Perfect" / "House"; Tips label "Bartender Tips" / "House Notes"                                                               | UI_UX §5, DATA_MODEL D-4        |
| P-3  | Categories are rows (`bar_recipe_categories`), ordered `(is_fallback, display_order, name)`, **Others** is `is_fallback` and always last; management can add/rename/reorder/deactivate (R-2) with no migration                      | DATA_MODEL D-1, UI_UX §8        |
| P-4  | `recipe_number` stored; `unique (organization_id, recipe_number)` including archived; Add suggests `max+1`; DB rejects duplicates                                                                                                   | DATA_MODEL D-2                  |
| P-5  | **Organization-wide, no `location_id`**; future per-location scope = nullable column + helper change                                                                                                                                | DATA_MODEL D-3                  |
| P-6  | Structured ingredients with **free-text amount** + optional unit + preparation; ordered rows; method/rim/glass/base spirit are free text with suggestion lists (no enums, no glassware/spirit tables)                               | DATA_MODEL D-5…D-10             |
| P-7  | Garnish rows + presentation notes; `batch_notes` (no batch subsystem); **pricing out of scope**; `alternate_name` + `description` included (nullable); no alias table                                                               | DATA_MODEL D-11…D-14            |
| P-8  | `is_alcoholic` explicit boolean for the Mocktail filter; `is_popular` = badge + chip (no featured strip); `is_menu_item` = "On menu" chip; Active/Archived only (no publish workflow)                                               | DATA_MODEL D-10, D-22; UI_UX §3 |
| P-9  | Archive/Restore, no delete; Staff never see archived (RLS); management "Show archived"; archived read-only until restored                                                                                                           | DATA_MODEL D-15                 |
| P-10 | Slug assigned at creation, unique per organization, **never rewritten on rename**                                                                                                                                                   | DATA_MODEL D-16                 |
| P-11 | **One atomic save RPC** (`bar_recipe_save`, jsonb, children replaced in one transaction); `version` + `PT409` stale protection; no autosave; no Realtime                                                                            | DATA_MODEL D-17…D-20, §6        |
| P-12 | Audit = created/updated/archived by+at + `version`; no history table in V1                                                                                                                                                          | DATA_MODEL D-19                 |
| P-13 | Copy Perfect → House is **client-side form state** with a confirm (and an explicit replace warning when House has content); saved by the normal Save                                                                                | UI_UX §7                        |
| P-14 | Duplicate recipe = **future backlog** (not V1)                                                                                                                                                                                      | DATA_MODEL D-23                 |
| P-15 | Routing: `/?tab=recipes[&recipe=<slug>]`, editor `&mode=edit`, add `?tab=recipes&mode=new`; `tabHref` strips module params when leaving; View preference in `localStorage`                                                          | UI_UX §1                        |
| P-16 | Search: client-side, normalized, name/alt name/category/base spirit/number, AND words, flat "Results" while searching; ingredient search deferred                                                                                   | UI_UX §3                        |
| P-17 | Landing default **List**; Picture Book keeps category headings; cards show number/name/image only                                                                                                                                   | UI_UX §2, §4                    |
| P-18 | Mobile detail: Perfect/House tabs, **House default when present**                                                                                                                                                                   | UI_UX §5                        |
| P-19 | Images: private bucket `recipe-images`, path `<org>/<recipe>/<uuid>[-thumb].<ext>`, management write only, Staff read active, signed URLs 1 h, 1600/480 px, 2 MiB limit, browser re-encode, Server Action upload, immutable objects | STORAGE_PLAN                    |
| P-20 | Roles: Owner = Manager = Assistant Manager = management; Staff read-only; membership-only helpers; SELECT-only grants; RPC writes                                                                                                   | SECURITY_AND_ROLES              |
| P-21 | Import: reviewed JSON → `scripts/recipes/import-recipes.mjs` → service-role-only `bar_recipes_import` RPC; dry-run default; create-only; no migration seed; real file outside the repo by default                                   | SOURCE_MAPPING §5               |
| P-22 | Source priority: owner corrections > DOCX > PDF (visual only) > earlier; no normalization or "correction" by general knowledge                                                                                                      | SOURCE_MAPPING §1               |
| P-23 | Phases: R-1 (Codex) core + read; R-2 (Codex) management + visual; R-2g (Claude Local Windows) final gate; then release audit → owner approval → PROD                                                                                | IMPLEMENTATION_PLAN             |
| P-24 | Design system: existing tokens and components only; no Recipes palette; light/dark via the existing theme                                                                                                                           | UI_UX (header)                  |

## 4. Owner-overridable defaults and open inputs (none blocks R-1)

| ID   | Item                                                                     | Default applied                                                                | Needed by                                 |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------- |
| OD-1 | The source files (DOCX, PDF, approved corrections, drink images/artwork) | R-1 builds and tests with a synthetic fixture; real import waits for the files | real DEV import, R-2g data check, release |
| OD-2 | Whether the approved import file may be committed to the repository      | **No** — kept outside the repo; hash + report recorded                         | real import                               |
| OD-3 | Wording of the second version: "House Recipe" vs "Your Recipe"           | **House Recipe** (one constant to change)                                      | R-1 (UI copy)                             |
| OD-4 | Default mobile tab                                                       | **House** when present                                                         | R-1                                       |
| OD-5 | Price printed on Green Tea Shot (pricing is out of scope)                | not imported                                                                   | real import                               |
| OD-6 | Whether the book separates Lemonades from Mocktails                      | follow the book's headings; otherwise Mocktails                                | real import                               |
| OD-7 | Staff may read **House** recipes                                         | **yes** (staff make the drinks)                                                | R-1                                       |

## 5. Rollout, migration and rollback

- **R-1:** one additive migration (DEV only). **R-2:** one additive migration (DEV only; bucket + policies). Types regenerated per phase.
- **Feature flag:** none. The module is visible to all roles once merged to `development`; `main`/PROD are unaffected until the release phase.
- **Backfill:** none (the import is a separate, operator-run data step).
- **Rollback:** forward-only. Defects → forward corrective migration. Bad data → archive (Staff read-only, so archive-all is a complete kill switch). App → promote the previous Vercel deployment. Never drop the tables once PROD has them.
- **Release implications:** `IMPLEMENTATION_PLAN.md` §6 (two additive migrations; storage policy creation to be proven; PROD import before the merge so Staff never see an empty module).

## 6. Risks

| Risk                                                                   | Mitigation                                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source files unavailable/late                                          | Importer + format finished and tested on synthetic data; real import is a gated step; no content invented |
| `storage.objects` policy creation not permitted to the migration role  | Proven in R-2 on local + hosted DEV before merge; otherwise a documented manual release step              |
| Staff see an empty module on release day                               | PROD import happens before the merge in the release sequence                                              |
| Editor complexity (many nested rows) → bugs                            | Pure editor-state module + unit tests; single atomic RPC; Playwright on three viewports                   |
| Scope creep (duplicate, ingredient search, history, Realtime, pricing) | Explicit non-goals + backlog ids; the Codex prompts forbid expansion                                      |
| Hard-coded assumptions about the 37-ish initial recipes                | No code depends on counts, ranges or names; categories/numbers come from data                             |
| Demo data mistaken for real recipes                                    | Synthetic names ("Sample …", "Demo …"); never the Monks content                                           |

## 7. Tracking

Parent issue: **[#220](https://github.com/KrapaGoutam/The-Lineup/issues/220)** — one "Recipes V1" feature issue with an R-0 / R-1 / R-2 / R-2g checklist (not one issue per phase). GitHub Project #4: **update NOT PERFORMED — Projects tooling unavailable in this session** (recorded in `tasks/current-task.md`).

## 8. R-0 review checklist — every question answered

| Question                                   | Answer (and where)                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| What is Recipes V1?                        | A categorized, numbered, searchable cocktail recipe book (Index, Detail, Editor) with Perfect vs House versions. PRD §1–§3                                                       |
| Who can view?                              | Every active member (Staff + management) — active recipes; management also archived. SECURITY §2                                                                                 |
| Who can edit?                              | Owner, Manager, Assistant Manager (`owner`/`general_manager`/`shift_manager`); Staff never. SECURITY §1–§2                                                                       |
| What is a category?                        | A database row (`bar_recipe_categories`), not an enum. DATA_MODEL D-1                                                                                                            |
| How are categories ordered?                | `(is_fallback, display_order, name)`; Others last. DATA_MODEL D-1                                                                                                                |
| What is `recipe_number`?                   | The stored, printed recipe number (integer 1–9999), first-class data. DATA_MODEL D-2                                                                                             |
| How is it unique?                          | `unique (organization_id, recipe_number)` across active and archived rows; DB rejects duplicates. DATA_MODEL D-2                                                                 |
| What is Perfect?                           | Variant `perfect` — the textbook recipe. DATA_MODEL D-4                                                                                                                          |
| What is House?                             | Variant `house` — the restaurant's version (book: "Your Version"); label "House Recipe". DATA_MODEL D-4, UI_UX §5                                                                |
| How are ingredients represented?           | Rows: name, free-text amount, optional unit, optional preparation, `sort_order`. DATA_MODEL D-5                                                                                  |
| How are flexible measurements represented? | `amount` is free text (`Top`, `2 dashes`, `0.75`, `To taste`); nothing parsed or scaled. DATA_MODEL D-5                                                                          |
| How are steps represented?                 | Ordered rows `instruction` + `sort_order`; displayed number = position. DATA_MODEL D-7                                                                                           |
| How are garnish/rim/glass represented?     | Garnish rows; `rim_type`+`rim_notes`; `glass`+`glass_notes` (free text with suggestion lists). DATA_MODEL D-8…D-11                                                               |
| How are images stored?                     | Private bucket `recipe-images`, `<org>/<recipe>/<uuid>[-thumb].<ext>`, paths on the recipe row, signed URLs. STORAGE_PLAN                                                        |
| How is archive handled?                    | `is_active`+`archived_at/by`; no delete; Staff cannot see archived; management Show archived/Restore. DATA_MODEL D-15                                                            |
| How does search work?                      | Client-side, normalized, name/alt name/category/base spirit/number; flat Results while searching. UI_UX §3                                                                       |
| What is List View?                         | Default landing: category blocks of numbered rows. UI_UX §2                                                                                                                      |
| What is Picture Book?                      | Same category blocks as cards (image, number, name); not a flat gallery. UI_UX §4                                                                                                |
| How does mobile detail work?               | Header + hero, then Perfect/House tabs (House default), one variant at a time. UI_UX §5                                                                                          |
| How does routing work?                     | `?tab=recipes` + `&recipe=<slug>` (+ `/r/<slug>`), `mode=new                                                                                                                     | edit`; pushState/Back; no router rewrite. UI_UX §1 |
| How are saves atomic?                      | One `bar_recipe_save` RPC (single transaction, children replaced) with `version` stale check. DATA_MODEL §6                                                                      |
| How is cross-org isolation enforced?       | `organization_id` everywhere, composite FKs, membership-only RLS helpers, org-validated RPCs, Storage policies keyed by org folder. SECURITY §3                                  |
| How does initial source data enter?        | Reviewed JSON → import script → service-role RPC, dry-run first, create-only, never a migration. SOURCE_MAPPING §5                                                               |
| What is R-1?                               | Foundation: schema/RLS/import, nav, List View, detail, search, read-only. IMPLEMENTATION_PLAN §2                                                                                 |
| What is R-2?                               | Management + visual: editor, copy, archive/restore, images, Picture Book, filters, categories dialog, polish. IMPLEMENTATION_PLAN §3                                             |
| What happens after R-2?                    | R-2g final gate (Claude Local Windows) → release-readiness audit → owner approval → PROD migrations → import → `development → main` → smoke → Part 2. IMPLEMENTATION_PLAN §4, §6 |

## 9. R-0 completion criteria

Schema contract, category design, numbering, variant model, ingredient model, search/filter contract, List/Picture Book UX, detail UX, editor contract, roles, RLS approach, Storage approach, routing, archive strategy, import strategy, source priority, R-1 scope, R-2 scope, test matrix and implementation plan are all locked **in these documents**. R-0 is COMPLETE when they are merged into `development` by merge commit with exact-head CI green. Until then: IN PROGRESS.

## Codex build prompt

R-1 (copy into a NEW Codex session; GPT-5.6 Sol, high):

```text
Implement Recipes V1 phase R-1 exactly as specified in docs/features/recipes-v1/ (IMPLEMENTATION_PLAN.md section 2 is your work order; DATA_MODEL.md, SECURITY_AND_ROLES.md, UI_UX_PLAN.md, SOURCE_MAPPING.md and TEST_MATRIX.md are the contract). Follow AGENTS.md.

Branch feature/recipes-v1-r1-foundation from the current origin/development (verify it contains the merged R-0 docs). Open a PR into development; merge by merge commit only after exact-head CI is green (local HEAD = remote HEAD = PR head = CI-tested SHA). Keep tasks/current-task.md current and check off each step as it compiles and passes its unit tests.

Scope: the foundation migration (six bar_recipe* tables, RLS, SELECT-only grants, helpers, recipes_slugify, recipes_apply, the service_role-only bar_recipes_import), the import script with its synthetic fixture, the domain layer, read-only data layer and Server Actions, demo data (SYNTHETIC only), the Recipes navigation entry (AppTab + shell + More sheet), the Recipes module, List View with search, and the recipe detail with Perfect/House (two columns on tablet/desktop, tabs on mobile), plus the R-1 rows of TEST_MATRIX.md.

Hard limits: do NOT build the editor, Add/Edit/Archive/Restore, Copy Perfect -> House, images or Storage, Picture Book, filter chips, A-Z, the category dialog, or any authenticated write path. Do NOT invent, correct or normalize recipe content; demo and fixture data must be obviously synthetic. Do NOT touch main, PROD, or any existing Bar Inventory/Tasks behaviour. Do not add dependencies. Do not expand scope or change product policy; if a decision is missing, stop and ask.

Apply the migration to hosted DEV only (never PROD). Run the repository quality gate: npm run check, npm test, npm run build, NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build, targeted Playwright on desktop and server-mobile, supabase db reset --local + supabase test db --local, and the hosted DEV read suite. Return a diff summary, verification evidence mapped to TEST_MATRIX row ids, DEV/PROD status, and remaining risk. Then STOP; do not start R-2.
```

R-2 (a different NEW Codex session, after R-1 is merged):

```text
Implement Recipes V1 phase R-2 exactly as specified in docs/features/recipes-v1/ (IMPLEMENTATION_PLAN.md section 3 is your work order). Follow AGENTS.md. Branch feature/recipes-v1-r2-management from the current origin/development (verify R-1 is merged). Same PR, CI and merge-commit rules as R-1; keep tasks/current-task.md current.

Scope: the management migration (bar_recipe_save, set_archived, set_image, category RPCs, the private recipe-images bucket and its storage.objects policies), write data layer and Server Actions, the structured editor (Basic Info, Image, Perfect, House; repeatable rows; comboboxes; validation; dirty guard; stale-write handling), Copy Perfect -> House with the specified replace warning, Archive/Restore and Show archived, the category dialog, image upload/replace/remove (browser re-encode, Server Action upload with compensation, signed URLs, placeholder), Picture Book, view toggle, Popular/On menu/Non-alcoholic chips and A-Z, demo-mode editing, responsive and accessibility polish, and all R-2 rows of TEST_MATRIX.md.

Hard limits: no duplicate-recipe action, ingredient search, audit-history table, Realtime, drag-and-drop, bulk image upload, pricing, per-location scope, shell-level leave guard, or anything from Part 2. Do not change the R-1 schema except through a new forward migration. Do not invent or alter recipe content. Do not touch main or PROD. If storage.objects policy creation is not permitted for the migration role, stop and report. Apply the migration to hosted DEV only.

Run the full gate (check, test, both builds, full pgTAP, the existing e2e regression plus the new Recipes specs on desktop and server-mobile, hosted DEV write/storage/UI suites with a tiny generated test image and full cleanup). Return a diff summary, evidence mapped to TEST_MATRIX row ids, DEV/PROD status and remaining risk. Then STOP; the final gate (R-2g) is a separate Claude Code Local Windows session.
```

## Recipes V1 R-1 checkpoint

R-1 implementation and local validation are complete; PR #223 merged to development after exact-head CI passed. R-2 is next and has not started.
