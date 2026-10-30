# Recipes V1 — Implementation plan (R-1, R-2, R-2g, release)

Status: **LOCKED in R-0.** R-1 and R-2 implement from these documents without making product decisions. If a step needs a decision this plan does not contain, **stop and ask** (do not improvise): the product contract is `PRD.md`, `PLAN.md` (decision register), `DATA_MODEL.md`, `SECURITY_AND_ROLES.md`, `STORAGE_PLAN.md`, `UI_UX_PLAN.md`, `SOURCE_MAPPING.md`, `TEST_MATRIX.md`.

## 0. Phase table

| Phase | Agent / model / effort / session                                | Branch (suggested)                 | PR → `development`     | Scope in one line                                                                                                                             |
| ----- | --------------------------------------------------------------- | ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R-0   | Claude Code Cloud · Sonnet 5.5 · high · NEW                     | `docs/recipes-v1-r0-planning`      | docs only (this phase) | planning                                                                                                                                      |
| R-1   | **Codex · GPT-5.6 Sol · high · NEW**                            | `feature/recipes-v1-r1-foundation` | one PR, merge commit   | DB schema + RLS, categories, numbering, import mechanism, nav, List View, detail (Perfect/House), search, Staff + management read             |
| R-2   | **Antigravity 2.0 · Gemini 3.8 Flash · high** (R2-F/G complete) | `feature/recipes-v1-r2-management` | one PR, merge commit   | COMPLETE: Add/Edit, Archive/Restore, Copy, images, Picture Book, Popular / Menu, filters, categories, Quick Glance/Measure, responsive + a11y |
| R-2g  | **Claude Code Local Windows · Sonnet 5.5 · high · NEW**         | `feature/recipes-v1-final-gate`    | one PR, merge commit   | NEXT: final gate: full matrix, real WebKit, hosted DEV, security, accessibility                                                               |
| —     | Release-readiness audit → owner approval → `development → main` | (release PR)                       | owner-approved         | §6                                                                                                                                            |

R-1 and R-2 stay **separate** (default locked in the brief; R-0 found no reason to combine: the R-1 migration, RLS, import and read UI are reviewable on their own, and R-2's write RPCs, Storage and editor are a distinct risk surface). All phases: merge commit only (no squash, no rebase merge); never push to `main`; DEV migrations only; exact-head CI (local HEAD = remote HEAD = PR head = CI-tested SHA) before merge.

## 1. Target code layout (exact)

```text
src/features/recipes/
  actions/
    recipe-actions.ts              R-1  "use server": listRecipesAction, getRecipeAction(slug)  (read; Staff + management)
    recipe-write-actions.ts        R-2  saveRecipeAction, setRecipeArchivedAction, category actions, nextNumber
    recipe-image-actions.ts        R-2  uploadRecipeImageAction, removeRecipeImageAction, getRecipeImageUrlsAction
  components/
    recipes-module.tsx             R-1  route state (index | detail | edit | new), data load, view switch, guards
    recipe-toolbar.tsx             R-1  search, (R-2) view toggle, chips, show-archived, + Add
    recipe-list-view.tsx           R-1  grouped rows
    recipe-search-results.tsx      R-1  flat "Results (n)" (list rows; R-2 adds the card variant)
    recipe-detail.tsx              R-1  header, hero (placeholder in R-1), variant panels / tabs
    variant-panel.tsx              R-1  Ingredients / Method / Steps / Rim / Glass / Garnish / Tips / Batch
    variant-tabs.tsx               R-1  ARIA tabs (mobile)
    recipe-image.tsx               R-1  <img> with placeholder (R-1: placeholder only; R-2: signed URLs)
    recipe-states.tsx              R-1  skeleton / empty / error / not-found
    recipe-picture-book.tsx        R-2  grouped cards
    recipe-card.tsx                R-2
    editor/recipe-editor.tsx       R-2  form shell, Save/Cancel, dirty guard, stale banner
    editor/basic-info-section.tsx  R-2
    editor/image-section.tsx       R-2
    editor/variant-editor.tsx      R-2
    editor/row-lists.tsx           R-2  ingredient / step / garnish repeaters
    editor/combobox-field.tsx      R-2  suggestions + free text
    editor/copy-variant-dialog.tsx R-2
    editor/archive-dialog.tsx      R-2
    editor/category-dialog.tsx     R-2
  data/
    recipe-data.ts                 R-1  server-only reads (index, detail, categories), error mapping
    recipe-write-data.ts           R-2  server-only RPC callers
    recipe-image-data.ts           R-2  server-only Storage (upload, delete, signed URLs)
  domain/
    recipe-types.ts                R-1  view models, isRecipesManager, Variant type
    recipe-format.ts               R-1  formatRecipeNumber, ingredientLine, labels
    recipe-grouping.ts             R-1  groupByCategory, sort
    recipe-search.ts               R-1  normalize + match + rank
    recipe-filters.ts              R-2  chips, A–Z
    recipe-slug.ts                 R-1  slugify (mirror of SQL; shared vectors)
    recipe-validation.ts           R-1  zod: recipe payload + limits (also the import record)
    recipe-import-schema.ts        R-1  zod: import file
    recipe-db-error.ts             R-1  PT409 / 23505 / 22023 / 42501 mapping (own copy)
    variant-labels.ts              R-1  perfect/house wording (D-LBL)
    glassware.ts methods.ts rims.ts spirits.ts units.ts   R-1 suggestion constants
    demo-recipes.ts                R-1  SYNTHETIC demo data + demo engine (in-memory read; R-2 adds writes)
    recipe-editor-state.ts         R-2  form model, dirty compare, row ops
    copy-variant.ts                R-2  pure Perfect → House copy
    image-rules.ts image-pipeline.ts   R-2  limits, magic bytes, browser resize (pure parts unit-tested)
  hooks/
    use-recipes-route.ts           R-1  parse/push `recipe`, `mode` (history, scroll restore)
    use-recipes-controller.ts      R-1  load/refresh/demo binding
    use-view-preference.ts         R-2  list | picture (localStorage, try/catch)
    use-recipe-images.ts           R-2  signed URL cache + refresh
scripts/recipes/
  import-recipes.mjs               R-1  + import-recipes.test.ts (guard + format)
supabase/migrations/
  <ts>_bar_recipes_foundation.sql            R-1
  <ts>_bar_recipes_management_and_images.sql R-2
supabase/tests/database/
  0043_bar_recipes_foundation.test.sql       R-1
  0044_bar_recipes_management.test.sql       R-2
  0045_bar_recipes_storage.test.sql          R-2
tests/e2e/recipes-*.spec.ts                  R-1 (read), R-2 (management/visual)
tests/real/recipes-*.db.real.test.ts, tests/real/ui/recipes.real.spec.ts   R-1, R-2
tests/fixtures/recipes/{import-sample.synthetic.json, slug-vectors.json}   R-1
docs/features/recipes-v1/IMPLEMENTATION_REPORT.md   each phase appends its section
```

Existing files touched by R-1 only: `src/lib/app-tab.ts` (+test), `src/components/restaurant-operations-app.tsx`, `src/types/database.generated.ts` (regenerated), nav assertions in `tests/e2e/*.spec.ts`, docs (`STATUS.md`, `ROADMAP.md`, `tasks/*`). Nothing else.

**Server-action / data-layer pattern (do not invent a new framework).** Mirror Bar Inventory: `"use server"` action → `getCurrentUser(restaurantSlug)` (organization from session + membership) → `requireLiveSession` → server-only `data/` function using `createClient()` from `@/lib/supabase/server` (the caller's session; RLS applies) → typed result `{ ok: true, data } | { ok: false, error, sessionInvalid?, conflict? }`. Demo mode: the module receives a `demo` binding and never calls actions (same as `InventoryModule`). No Route Handlers for Recipes.

---

## 2. R-1 — Core (Codex)

**Goal.** A working, read-only-for-everyone Recipes module on DEV: schema, RLS, categories, numbering, import mechanism, navigation, List View, search, recipe detail with Perfect/House, Staff and management read, core tests. **Not in R-1:** editor, Add/Edit/Archive/Restore, Copy, images/Storage, Picture Book, filter chips, A–Z, category dialog, Show archived toggle, write RPCs for authenticated users.

Read first: `AGENTS.md`, `tasks/current-task.md`, `docs/features/recipes-v1/*`, `src/lib/app-tab.ts`, `supabase/migrations/20261026170000_bar_inventory_catalog.sql` (conventions), `docs/DESIGN_SYSTEM.md`.

| Step | Work                                                                                                                                                                                                                                                                  | Files likely touched                                                                                                        | Migration             | DB tests (D)                                                                                                                          | Unit (U)                                                                      | Playwright (E)                                                                                                                          | DEV validation                                                                                                      | Commit boundary / GO check                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R1.0 | Preflight: fetch, verify base, create branch, mark `tasks/current-task.md` R-1 IN PROGRESS, install deps                                                                                                                                                              | `tasks/current-task.md`                                                                                                     | —                     | —                                                                                                                                     | —                                                                             | —                                                                                                                                       | —                                                                                                                   | handoff committed                                                                                                      |
| R1.1 | **Foundation migration**: six tables, constraints, indexes, helpers (`recipes_is_member/_is_manager/_can_read_recipe/_can_read_variant`), grants, RLS + `SELECT` policies, `recipes_slugify`, `recipes_apply` core, `bar_recipes_import` (service_role)               | `supabase/migrations/<ts>_bar_recipes_foundation.sql`, `src/types/database.generated.ts`                                    | **yes**               | `0043_bar_recipes_foundation.test.sql`: RC-018, 020–026, 032, 036–038, 043–045, 048–049, 051–052, 060–061, 130, 132, 134–137, 139–146 | slug vectors vs SQL (`tests/fixtures/recipes/slug-vectors.json`)              | —                                                                                                                                       | local stack only (`supabase db reset --local`)                                                                      | `supabase test db --local` green incl. all prior files; advisor-style audits (RLS on, no anon exec, search_path) clean |
| R1.2 | **Domain layer**: types, `isRecipesManager`, number/ingredient formatting, grouping, search (normalize, match, rank), slug mirror, zod validation + import schema, db-error mapping, variant labels, suggestion constants                                             | `src/features/recipes/domain/*`                                                                                             | —                     | —                                                                                                                                     | RC-013, 031, 035, 042–045, 049, 051–059, 061–063, 071–075, 077, 091, 093, 138 | —                                                                                                                                       | —                                                                                                                   | Vitest green; no UI yet                                                                                                |
| R1.3 | **Import mechanism**: `scripts/recipes/import-recipes.mjs` (dry-run default, PROD guard, report), synthetic fixture, script tests; apply migration to **hosted DEV**; dry-run + create the synthetic fixture into a **synthetic test organization**; verify; clean up | `scripts/recipes/*`, `tests/fixtures/recipes/*`                                                                             | (applies R1.1 to DEV) | RC-139–144, 146 (in 0043)                                                                                                             | RC-138, 145 and an import-report test                                         | —                                                                                                                                       | DEV 54 → 55 migrations; DEV parity recorded                                                                         | script never runs against PROD (guard test); DEV rows cleaned                                                          |
| R1.4 | **Data layer + read actions + demo data**: `recipe-data.ts`, `recipe-actions.ts`, error mapping, `demo-recipes.ts` (synthetic, includes: no-image, single-variant, flexible amounts, popular, an archived row, a recipe numbered 23)                                  | `src/features/recipes/{data,actions}/*`, `domain/demo-recipes.ts`                                                           | —                     | —                                                                                                                                     | action tests (Staff + management shapes, session-invalid), demo engine        | —                                                                                                                                       | read through hosted DEV with the synthetic org (H)                                                                  | RC-018, 070, 078 on DEV pass (`tests/real/recipes-read.db.real.test.ts`)                                               |
| R1.5 | **Navigation + module shell + List View + search**: `AppTab` + `tabHref`, shell wiring (§ UI_UX_PLAN.md "Exact extension points"), `RecipesModule`, toolbar (search only), grouped list, results list, states, view-state in URL, scroll restore                      | `src/lib/app-tab.ts(+test)`, `src/components/restaurant-operations-app.tsx`, `src/features/recipes/components/*`, `hooks/*` | —                     | —                                                                                                                                     | RC-001–004, 012, 064–067, 149                                                 | RC-002, 005–011, 014 (Staff has no Add), 064–068, 075–076, 150                                                                          | —                                                                                                                   | all existing e2e still green (RC-008); 3 projects                                                                      |
| R1.6 | **Recipe detail**: header, placeholder hero, two-column desktop, mobile ARIA tabs (House default), single-variant layout, omitted empty sections, not-found/archived notice (management only), focus management, deep link + refresh                                  | `components/recipe-detail.tsx`, `variant-*.tsx`, `recipe-image.tsx`, `use-recipes-route.ts`                                 | —                     | —                                                                                                                                     | RC-053, 055–059, 062, 091, 093                                                | RC-047, 054, 057–059, 089–099 (3 projects)                                                                                              | real-mode UI on DEV production build (`tests/real/ui/recipes.real.spec.ts`: Staff reads imported synthetic recipes) | RC-007, 097 on DEV pass                                                                                                |
| R1.7 | **Regression + hosted tests + gates**: whole existing e2e suite, new specs, `tests/real` read suite, pgTAP full, build gates, empty-env build, docs, report                                                                                                           | `tests/**`, `docs/features/recipes-v1/IMPLEMENTATION_REPORT.md`, `docs/{STATUS,ROADMAP}.md`, `tasks/*`                      | —                     | full local run                                                                                                                        | full Vitest                                                                   | desktop + server-mobile full; `host-tablet` per environment capability (record honestly if WebKit absent; real WebKit is the R-2g gate) | DEV parity recorded                                                                                                 | PR checks green on exact head                                                                                          |

**R-1 PR boundary.** One PR (`feature/recipes-v1-r1-foundation → development`), one commit per step above (explicit paths only). **R-1 GO criteria:** all R-1 rows of `TEST_MATRIX.md` green; Staff can open Recipes, search, group, open a detail, switch Perfect/House on mobile; management sees the same read-only module; no write RPC is executable by `authenticated`; import dry-run/create/re-run proven on DEV with the synthetic fixture; `npm run check`, `npm test`, `npm run build` **and** `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` green; pgTAP green; PROD untouched; no `main` change.

**Real-import dependency.** Importing the actual recipe book requires the owner's DOCX (and approval of the dry-run report, `SOURCE_MAPPING.md` §5). If the files are available to the R-1 session, R-1 performs steps 3–6 of that procedure on hosted DEV; **if not, R-1 completes with the synthetic fixture and reports the real import as pending** (it does not block R-1 GO; it blocks R-2g's "real data" smoke and the release).

---

## 3. R-2 — Management, visual, polish (Codex)

**Goal.** Everything management and visual: Add/Edit, both-variant editor, Copy Perfect → House, Archive/Restore, Show archived, category dialog, images (upload/replace/remove), Picture Book, Popular/Menu/Non-alcoholic chips, A–Z, view toggle, responsive + accessibility polish, demo-mode editing, hosted tests. **Not in R-2:** Duplicate recipe, ingredient search, audit history table, Realtime, drag-and-drop, bulk image upload, shell-level leave guard, pricing, per-location scope, anything in Part 2.

| Step | Work                                                                                                                                                        | Files likely touched                                                                                                                                                           | Migration                                                                                       | DB tests                                                                                                                       | Unit                                         | Playwright                    | DEV validation                                                             | Commit boundary / GO check                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| R2.0 | Preflight: sync to merged R-1, branch, handoff                                                                                                              | `tasks/current-task.md`                                                                                                                                                        | —                                                                                               | —                                                                                                                              | —                                            | —                             | —                                                                          | handoff committed                                                                                          |
| R2.1 | **Management migration**: `bar_recipe_save`, `set_archived`, `set_image`, category RPCs; `recipe-images` bucket; `storage.objects` policies + image helpers | `supabase/migrations/<ts>_bar_recipes_management_and_images.sql`, generated types                                                                                              | **yes**                                                                                         | `0044` (RC-019, 020, 027, 028, 030, 032–034, 038–041, 046, 050, 060, 108, 110–115, 117, 133, 136) and `0045` (RC-119, 121–125) | —                                            | —                             | local, then hosted DEV; **prove storage policy creation on DEV**           | pgTAP green; if `storage.objects` policy creation is not permitted for the migration role, STOP and report |
| R2.2 | **Write data layer + actions**: save/archive/category callers, zod payloads, PT409/23505/22023 mapping, next-number read; non-management rejected before DB | `data/recipe-write-data.ts`, `actions/recipe-write-actions.ts`, `domain/recipe-validation.ts`                                                                                  | —                                                                                               | —                                                                                                                              | RC-017, 040, 060 (RPC), 102 (server mapping) | —                             | `tests/real/recipes-write.db.real.test.ts`: RC-019, 038, 039, 110–114, 133 | hosted write suite green, cleaned                                                                          |
| R2.3 | **Editor core**: Add/Edit routes (`mode=new                                                                                                                 | edit`), Basic Info, variant editor with repeatable rows, comboboxes, validation, dirty guard + `beforeunload`, Save, stale banner, success message; demo-mode in-memory writes | `components/editor/*`, `domain/recipe-editor-state.ts`, `recipes-module.tsx`, `demo-recipes.ts` | —                                                                                                                              | —                                            | RC-102–104, 109               | RC-100–104, 109, 111, 118                                                  | —                                                                                                          | editor happy path works in demo and on DEV |
| R2.4 | **Copy Perfect → House** + Add/Remove variant                                                                                                               | `domain/copy-variant.ts`, `editor/copy-variant-dialog.tsx`                                                                                                                     | —                                                                                               | —                                                                                                                              | RC-105–108                                   | RC-105, 106, 108              | —                                                                          | overwrite warning proven; nothing saved before Save                                                        |
| R2.5 | **Archive / Restore + Show archived + category dialog**                                                                                                     | `editor/archive-dialog.tsx`, `editor/category-dialog.tsx`, toolbar                                                                                                             | —                                                                                               | (in 0044)                                                                                                                      | RC-069 logic, 028                            | RC-027–030, 033, 069, 113–116 | hosted: RC-113, 114                                                        | Staff immediately loses archived recipe on DEV                                                             |
| R2.6 | **Images**: browser pipeline, magic-byte validation, upload/remove actions with compensation, editor image block, signed-URL hook, hero in detail           | `domain/image-*.ts`, `data/recipe-image-data.ts`, `actions/recipe-image-actions.ts`, `editor/image-section.tsx`, `recipe-image.tsx`, `use-recipe-images.ts`                    | —                                                                                               | (in 0045)                                                                                                                      | RC-087, 127–129                              | RC-094 (real image), 100      | hosted: RC-120, 122, 123, 126, 129, 131 with a tiny generated image        | no objects left after cleanup                                                                              |
| R2.7 | **Picture Book + chips + A–Z + view toggle**                                                                                                                | `recipe-picture-book.tsx`, `recipe-card.tsx`, `recipe-filters.ts`, `use-view-preference.ts`                                                                                    | —                                                                                               | —                                                                                                                              | RC-079, 080, 082, 084, 085                   | RC-079–088                    | —                                                                          | grouped cards, one tab stop per card                                                                       |
| R2.8 | **Responsive + accessibility polish**, full new e2e specs for the three projects, hosted real-mode UI spec (create → Staff reads → archive hides → cleanup) | `tests/e2e/recipes-*.spec.ts`, `tests/real/ui/recipes.real.spec.ts`                                                                                                            | —                                                                                               | —                                                                                                                              | —                                            | RC-147, 148, 151, 152         | RC-156                                                                     | all R-2 rows green                                                                                         |
| R2.9 | **Gates + report + PR**: check, Vitest, normal + empty-env builds, full pgTAP, existing e2e regression, DEV parity, docs                                    | docs, `tasks/*`                                                                                                                                                                | —                                                                                               | full local run                                                                                                                 | full                                         | full desktop + server-mobile  | DEV parity (56 migrations expected)                                        | exact-head CI green                                                                                        |

**R-2 GO criteria:** all R-1 **and** R-2 rows of `TEST_MATRIX.md` green; Staff provably read-only at grant, RLS, RPC and Storage level; save atomic and stale-safe; Copy never destroys House content silently; image upload/replace/remove works for management and is denied to Staff and other organizations; no orphan objects after tests; builds green; PROD untouched.

## 4. R-2g — Final gate (Claude Code · Local Windows · Sonnet 5.5 · high · NEW session)

Mirrors Tasks T-6 / Bar Inventory BI-11. Runs after R-2 is merged; may fix small defects it finds (each documented); no new features.

1. Sync; confirm `development` includes R-2; record SHAs.
2. Local Supabase: `db reset --local` (all migrations) + full pgTAP.
3. Hosted DEV: migrations identical to the repository; `tests/real` Recipes suites; real-mode UI on a production build, **DEV-pinned** (assert zero PROD references in `.next`).
4. Playwright: **desktop, `host-tablet` on real WebKit, `server-mobile`** — full relevant matrix (Recipes + the existing regression suite).
5. Security audit: grants, RLS on every table, no `anon` execute, `search_path` on all new functions, Storage policies, service-role key absent from the bundle; cross-organization checks; Staff matrix re-run end-to-end.
6. Accessibility pass: keyboard-only walk-through, tabs pattern, dialogs, light/dark contrast (RC-153, RC-154), 44 px targets.
7. Real-data check **if the owner's import was performed on DEV**: review every recipe (both versions) against the book; otherwise record "real import pending".
8. Report **GO / NO-GO**; PR with the report; merge commit. DEV touched (controlled, cleaned) · PROD not touched.

## 5. Build gates (every implementation phase)

`npm run check` · `npm test` · `npm run build` · `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` (CI has no env files, so `/` is prerendered statically there) · targeted Playwright · `node scripts/check-tracked-local-paths.mjs` · `node scripts/check-nonprod-env.mjs --scan .next` after a build. Database changes: `supabase db reset --local` + `supabase test db --local`. Never commit the `AGENTS.md` heading change `next dev` makes (`git checkout AGENTS.md`).

## 6. Release (after R-2g GO) — not part of R-0, R-1 or R-2

Locked sequence (owner-approved in the brief):

```text
R-2g GO
→ Recipes V1 release-readiness audit (docs/releases/…; same shape as the 2026-10-28 audit)
→ explicit owner approval
→ same-day PROD preflight (read-only: migration head, quiet window, no Recipes objects exist)
→ apply the TWO additive Recipes migrations to PROD, migrations first, dry-run first,
   one guarded transaction per migration (the route proven on 2026-10-26/28; the `deploy-migrations`
   job still fails at `supabase link`, #111, and is not relied on)
→ verify on PROD read-only: new tables RLS-on, no client write grants, no anon execute, bucket private with limits,
   storage.objects policies present, migration list identical to development
→ PROD data step: import dry-run → owner reviews the report → create (same approved file, hash recorded)
→ development → main by MERGE COMMIT with exact-head CI
→ Vercel Production verification (PROD-pinned build, no DEV ref)
→ Production smoke (owner and a Staff account): open Recipes, search, List, Picture Book, detail, switch variant;
   management: edit one recipe and revert, upload/remove one image on a recipe the owner designates
→ Recipes V1 release complete
→ Part 2 (multi-organization / multi-location / module configuration) may begin
```

Release implications to carry into that audit: both migrations are **additive** (no existing object changes, so the previous app runs on the new schema); the only non-table objects are the `recipe-images` bucket and `storage.objects` policies (verify permission to create them on PROD in the dry run); the Recipes tab is visible to **all roles**, so Staff see it immediately after deploy — the PROD import must therefore happen **before** the merge, or Staff will see the empty state; data rollback is "archive" (no hard delete), schema rollback is forward-only; the app can be rolled back by promoting the previous Vercel deployment.

## 7. Scope guard (applies to every phase)

No scope expansion. Out of V1 (all recorded in `tasks/backlog.md`): duplicate recipe (B-RC-1), field-level audit history (B-RC-2), Realtime (B-RC-3), ingredient-name search (B-RC-4), orphan-image repair script (B-RC-5), stable-URL image route (B-RC-6), shell-level unsaved-changes guard (B-RC-7), bulk image upload, structured batch recipes, pricing, per-location recipes, recipe scaling/unit conversion, favorites, print/PDF export, drag-and-drop reorder, organization-configurable labels UI.

## Recipes V1 R-1 checkpoint

R1-A, R1-B and R1-C complete; R1-D local validation complete, PR #223 merged to development after exact-head CI passed. R-2 not started.

## Recipes + Inventory integration checkpoint — 2026-10-29

GO for coexistence on development baseline `508cab9584bb77aacee89107f2d6940314b47214` (PR #235 merged). Focused unit/component and three-device/two-theme browser evidence, actual module boundaries and IS-01–IS-20 are recorded in [TEST_MATRIX.md](TEST_MATRIX.md#recipes--inventory-integration-sanity--2026-10-29). No application or database change required. Exact-head CI/PR/merge tracked under #220.

Next: Recipes V1 release-readiness audit, new independent session; do not start automatically. Owner browser acceptance retest, deferred detail findings/owner decisions, Staff TC-19 and persistent DEV realistic-data review remain SHELVED / LATER. #234 and milestone #7 stay open; this checkpoint does not mark release readiness or authorize Production/main promotion.

## Release Readiness Audit — 2026-10-29

Independent audit of `development` `754b34a5d5860269f2fda48b27efb56fbfb90993`: **GO — ready to enter Production preflight; no release blocker.** Full report and Production prerequisite checklist: [RELEASE_READINESS_AUDIT.md](RELEASE_READINESS_AUDIT.md). Preflight must close: Production import target (the script currently refuses Production), the owner-supplied canonical payload (not in repository), the Low reorder-validator defect decision, all 7 pending migrations, and Bar Inventory data status. No application, schema, Production, `main` or import change in the audit.
