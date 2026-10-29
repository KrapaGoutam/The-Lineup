# Recipes V1 — Test matrix

Created in R-0. Scenario ids `RC-nnn` map to a test layer and the phase that must land them. A phase is not done until every row assigned to it is implemented and green; each phase records status in its own section of a (future) `IMPLEMENTATION_REPORT.md`.

**Layers** (matching the repository): **U** Vitest unit/component (incl. Testing Library) · **D** pgTAP (`supabase/tests/database`, run by the CI `Database` job and locally with `supabase test db --local`) · **E** Playwright demo suite (3 projects: `desktop`, `host-tablet`, `server-mobile`) · **H** hosted-DEV real tests (`tests/real/*.db.real.test.ts` RLS through real JWTs; `tests/real/ui/*.real.spec.ts` real-mode UI on a production build).

**Phases**: **R-1** foundation · **R-2** management/visual implementation (Codex) · **R-2g** final gate (a separate Claude Code Local Windows session, real WebKit).

**Fixtures.** Demo-mode and hosted tests use **synthetic** recipes only (`Sample Recipe A`, `Demo Margarita`, a recipe numbered 23 named `Sample Recipe 23`, …) — never the Monks source content. Hosted tests create their **own** uniquely named organization/users with the shared harness (`tests/real/support/harness.ts`), delete them afterwards, and never touch an existing DEV organization (including the V2 Harness organizations).

## Navigation and routing (NAV)

| ID     | Scenario                                                                                                         | Layers | Phase |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| RC-001 | `?tab=recipes` ↔ `recipes` round-trips through `tabFromParam` / `tabToParam`                                    | U      | R-1   |
| RC-002 | Unknown or missing `tab` still lands on Tasks; Tasks remains the default landing                                 | U, E   | R-1   |
| RC-003 | `tabHref` drops `recipe`/`mode` when leaving Recipes and keeps every other parameter                             | U      | R-1   |
| RC-004 | `resolveTab("recipes", …)` is `recipes` for Staff, management and demo mode                                      | U      | R-1   |
| RC-005 | Desktop secondary tier: Recipes follows Bar Inventory (management) / Attendance (Staff); primary tier unchanged  | E      | R-1   |
| RC-006 | Mobile dock still 3 buttons; the More sheet lists Recipes for every role and opens it                            | E      | R-1   |
| RC-007 | `/r/<slug>?tab=recipes` and `…&recipe=<slug>` deep links open and survive refresh                                | E, H   | R-1   |
| RC-008 | Regression: Table Allocation, Schedule, Team, Attendance, Bar Inventory, Tip Split, Payroll, Settings still open | E      | R-1   |
| RC-009 | Back/Forward: Tasks → Recipes → detail → Back → index → Forward → detail                                         | E      | R-1   |
| RC-010 | Clicking the Recipes nav while a detail is open returns to the index                                             | E      | R-1   |
| RC-011 | Sign-out clears the URL; `recipe` never leaks into another module's URL                                          | E      | R-1   |
| RC-012 | A dead session inside Recipes triggers the shared forced sign-out (`sessionInvalid`)                             | U, E   | R-1   |

## Roles and permissions (ROLE)

| ID     | Scenario                                                                                                 | Layers | Phase                                 |
| ------ | -------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------- |
| RC-013 | `isRecipesManager` truth table: owner / manager / assistant_manager true, staff false                    | U      | R-1                                   |
| RC-014 | Staff view shows no Add, Edit, Archive, Restore, Upload, Manage categories, Show archived (not rendered) | E      | R-1 (Add / Show archived), R-2 (rest) |
| RC-015 | Owner, Manager, Assistant Manager each see every management control                                      | E      | R-2                                   |
| RC-016 | Staff opening `&mode=edit` or `mode=new` falls back to the read-only detail / index                      | E      | R-2                                   |
| RC-017 | Server Actions reject non-management before the database (plain message); read actions work for Staff    | U      | R-2                                   |
| RC-018 | Staff `SELECT` returns active recipes only; archived recipe/variants/children return zero rows           | D, H   | R-1                                   |
| RC-019 | Staff cannot call any write RPC (`42501`) and has no table DML                                           | D, H   | R-2                                   |
| RC-020 | Inactive membership: reads zero rows, writes `42501`                                                     | D, H   | R-1, R-2                              |
| RC-021 | `anon` has no privilege on any Recipes table or function                                                 | D      | R-1                                   |
| RC-022 | `authenticated` has `SELECT` only on all six tables; no INSERT/UPDATE/DELETE/TRUNCATE grant              | D      | R-1                                   |

## Categories (CAT)

| ID     | Scenario                                                                                                      | Layers  | Phase    |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| RC-023 | The six initial categories are created from the import file in the expected order                             | D, H    | R-1      |
| RC-024 | Category order is `(is_fallback, display_order, name)`; **Others** is always last                             | U, D    | R-1      |
| RC-025 | Category `slug` unique per organization; the same slug is allowed in two organizations                        | D       | R-1      |
| RC-026 | At most one fallback category per organization                                                                | D       | R-1      |
| RC-027 | Fallback category: rename allowed; reorder / deactivate refused                                               | D, E    | R-2      |
| RC-028 | Deactivating a category with active recipes is refused with a plain message                                   | D, E    | R-2      |
| RC-029 | Management creates a category with no migration; it appears in the index (once it has recipes) and the editor | D, E, H | R-2      |
| RC-030 | Reorder categories is deterministic and persists                                                              | D, E    | R-2      |
| RC-031 | Empty categories are not shown in the index                                                                   | U, E    | R-1      |
| RC-032 | A recipe pointing at another organization's category is refused (composite FK + RPC validation)               | D       | R-1, R-2 |
| RC-033 | Add defaults to **Others** when no category is chosen; an explicitly chosen category is never overridden      | U, E    | R-2      |
| RC-034 | Restoring a recipe whose category is inactive requires choosing a category                                    | D, E    | R-2      |

## Recipe numbering and slug (NUM)

| ID     | Scenario                                                                                                                   | Layers | Phase             |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| RC-035 | The displayed number is the stored `recipe_number`; changing search/A–Z/categories never changes it (recipe #23 stays #23) | U, E   | R-1               |
| RC-036 | `unique (organization_id, recipe_number)` holds across active **and archived** rows                                        | D      | R-1               |
| RC-037 | The same number may exist in two organizations                                                                             | D      | R-1               |
| RC-038 | Duplicate number on create or edit → `23505`, message names the existing recipe, even when the client check is bypassed    | D, H   | R-1 (import), R-2 |
| RC-039 | Two parallel creates with the same number: exactly one succeeds                                                            | H, D   | R-2               |
| RC-040 | Suggested next number = `max + 1` including archived; editable; gaps allowed                                               | U, E   | R-2               |
| RC-041 | Changing a number to a free value works; swapping two numbers works via a free number                                      | D, E   | R-2               |
| RC-042 | `formatRecipeNumber`: `1→01`, `23→23`, `100→100`                                                                           | U      | R-1               |
| RC-043 | Number outside 1–9999 refused (table check, RPC, zod)                                                                      | U, D   | R-1               |
| RC-044 | Slug derivation vectors identical in TypeScript and SQL (diacritics, punctuation, empty-after-clean → `recipe-<n>`)        | U, D   | R-1               |
| RC-045 | Slug unique per organization; collisions get `-2`; `new`/`edit` reserved                                                   | D, U   | R-1               |
| RC-046 | Renaming a recipe does not change its slug; the old URL still opens it                                                     | D, E   | R-2               |
| RC-047 | Detail resolves by slug, including names with diacritics                                                                   | E, H   | R-1               |

## Variants and structured content (VAR)

| ID     | Scenario                                                                                                                    | Layers | Phase                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| RC-048 | At most one `perfect` and one `house` per recipe (second of either refused)                                                 | D      | R-1                     |
| RC-049 | Variant domain is exactly `perfect`/`house`; `your` is refused                                                              | D, U   | R-1                     |
| RC-050 | A save requires at least one variant; absent/`null` variant deletes it and its children                                     | D      | R-2                     |
| RC-051 | Ingredient `sort_order` unique per variant; reads return the saved order                                                    | D, U   | R-1                     |
| RC-052 | Flexible amounts stored and shown verbatim: `2`, `0.75`, `Top`, `Splash`, `2 dashes`, `1 bar spoon`, `To taste`, `8 leaves` | U, D   | R-1                     |
| RC-053 | Ingredient line formatting (`amount unit name — preparation`; any part may be empty)                                        | U      | R-1                     |
| RC-054 | Steps ordered; displayed numbers are positions                                                                              | U, E   | R-1                     |
| RC-055 | Rim: `null` (not shown) vs `None` vs custom text; rim notes shown                                                           | U      | R-1                     |
| RC-056 | Glass + glass notes displayed; any text is accepted                                                                         | U      | R-1                     |
| RC-057 | Multiple garnishes ordered, with notes; presentation notes shown                                                            | U, E   | R-1                     |
| RC-058 | Batch notes section appears only when present                                                                               | U, E   | R-1                     |
| RC-059 | Empty sections are omitted from the detail view                                                                             | U, E   | R-1                     |
| RC-060 | Field length limits and row caps enforced (table checks, RPC, zod) with field-named messages                                | U, D   | R-1 (checks), R-2 (RPC) |
| RC-061 | Content is stored verbatim: case, spelling, punctuation, brands and measurement style unchanged (only whitespace trimmed)   | U, D   | R-1                     |
| RC-062 | Tips label is "Bartender Tips" on Perfect and "House Notes" on House                                                        | U, E   | R-1                     |

## List View (LST)

| ID     | Scenario                                                                                                             | Layers | Phase |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| RC-063 | `groupByCategory`: category order and `recipe_number` order within a category                                        | U      | R-1   |
| RC-064 | Each row is an anchor with the detail `href`; click navigates in-app (pushState); open-in-new-tab works              | U, E   | R-1   |
| RC-065 | Row shows the zero-padded stored number and name; Popular star has accessible text                                   | U, E   | R-1   |
| RC-066 | List is the default view; the choice persists per device; `localStorage` failure is tolerated                        | U, E   | R-1   |
| RC-067 | Loading skeleton, empty (Staff vs management wording) and error-with-retry states                                    | U, E   | R-1   |
| RC-068 | Scroll position restored after opening a recipe and pressing Back                                                    | E      | R-1   |
| RC-069 | Show archived: absent for Staff; management toggles it; archived rows dimmed with a badge; excluded from chip counts | E      | R-2   |
| RC-070 | Index of 250 synthetic recipes loads in one request per table and renders without pagination                         | H, U   | R-1   |

## Search and filters (SRC)

| ID     | Scenario                                                                                                      | Layers | Phase |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| RC-071 | Normalization: case, diacritics (`jalapeno` finds `Jalapeño`), extra spaces, `#23`/`023`/`23`                 | U      | R-1   |
| RC-072 | Matches name, alternate name, category name, base spirit and number                                           | U      | R-1   |
| RC-073 | Multiple words are AND-ed across fields                                                                       | U      | R-1   |
| RC-074 | Ranking: exact number → name prefix → name contains → alternate name → base spirit → category; ties by number | U      | R-1   |
| RC-075 | Non-empty query replaces grouping with one "Results (n)" list; clearing restores grouping and scroll          | U, E   | R-1   |
| RC-076 | No-match state with Clear search                                                                              | E      | R-1   |
| RC-077 | Ingredient names are **not** searched in V1 (negative test, so the contract is explicit)                      | U      | R-1   |
| RC-078 | Search never returns archived recipes to Staff                                                                | D, H   | R-1   |
| RC-079 | Chips Popular / On menu / Non-alcoholic filter and combine with search and grouping; `aria-pressed`           | U, E   | R-2   |
| RC-080 | `Book order` vs `A–Z` within categories                                                                       | U, E   | R-2   |

## Picture Book (PIC)

| ID     | Scenario                                                                                                  | Layers | Phase |
| ------ | --------------------------------------------------------------------------------------------------------- | ------ | ----- |
| RC-081 | Same category headings and order as List View (not a flat gallery)                                        | E      | R-2   |
| RC-082 | Card shows number, name, image, Popular star only — no ingredients                                        | U, E   | R-2   |
| RC-083 | Image and name open the same detail; one tab stop per card                                                | E      | R-2   |
| RC-084 | No image → placeholder tile (never a broken image); name always present as text                           | U, E   | R-2   |
| RC-085 | Thumbnails only, `loading="lazy"`, reserved aspect ratio; List View loads no images                       | U, E   | R-2   |
| RC-086 | Grid columns per viewport (2 / 3 / 4–5) with no horizontal scroll                                         | E      | R-2   |
| RC-087 | Expired signed URL → one automatic refresh → placeholder if it still fails                                | U      | R-2   |
| RC-088 | View toggle is an accessible pressed-state group; choice persists; search results show a category caption | E      | R-2   |

## Recipe detail (DET)

| ID     | Scenario                                                                                       | Layers  | Phase                         |
| ------ | ---------------------------------------------------------------------------------------------- | ------- | ----------------------------- |
| RC-089 | Desktop/tablet: hero above two labelled columns "Perfect Bartending Recipe" and "House Recipe" | E       | R-1                           |
| RC-090 | Mobile: one variant at a time with Perfect/House tabs; header and hero stay above              | E       | R-1                           |
| RC-091 | Default mobile tab is House when it exists, else Perfect                                       | U, E    | R-1                           |
| RC-092 | Tabs follow the ARIA tabs pattern: arrows, Home/End, roving tabindex, ≥ 44 px                  | E       | R-1                           |
| RC-093 | A recipe with one variant renders full width without tabs or an empty column                   | U, E    | R-1                           |
| RC-094 | Hero: placeholder when no image (R-1); real image from a signed URL (R-2)                      | E       | R-1, R-2                      |
| RC-095 | Archived recipe: Staff get "Recipe not found"; management see an Archived banner and Restore   | D, E, H | R-1 (Staff), R-2 (management) |
| RC-096 | Unknown slug shows the not-found state with a link back                                        | E       | R-1                           |
| RC-097 | Refresh on a detail URL, shareable link, `/r/<slug>` preserved                                 | E, H    | R-1                           |
| RC-098 | Focus moves to the recipe heading on open and back to the originating link on Back             | E       | R-1                           |
| RC-099 | Header shows number, name, badges, category chip and base spirit / description subline         | E       | R-1                           |

## Editor, save, archive (EDT) — R-2

| ID     | Scenario                                                                                                            | Layers  | Phase |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------- | ----- |
| RC-100 | Add Recipe happy path (all sections) and the saved recipe appears in the index and detail                           | E, H    | R-2   |
| RC-101 | Edit both variants; changes persist after reload                                                                    | E, H    | R-2   |
| RC-102 | Field validation: inline messages, `aria-invalid`, `aria-describedby`, first-error focus, error summary             | U, E    | R-2   |
| RC-103 | Repeatable rows: add, remove, move up/down; resulting order is exactly what is saved                                | U, E    | R-2   |
| RC-104 | Method, rim, glass, base spirit and unit comboboxes accept custom values                                            | U, E    | R-2   |
| RC-105 | Copy Perfect → House into an empty House after confirmation                                                         | U, E    | R-2   |
| RC-106 | Copy with existing House content shows the replace warning; Cancel leaves House unchanged; nothing saved until Save | U, E    | R-2   |
| RC-107 | Copy is a deep copy: editing House afterwards does not change Perfect                                               | U       | R-2   |
| RC-108 | Remove / Add House variant (and Perfect) with the at-least-one rule                                                 | U, E, D | R-2   |
| RC-109 | Dirty tracking; discard dialog on Cancel / Back / opening another recipe; `beforeunload` while dirty                | U, E    | R-2   |
| RC-110 | Atomic save: a failing child row leaves recipe, version and every child unchanged                                   | D, H    | R-2   |
| RC-111 | Stale save → `PT409` with who/when; the form is kept; Reload latest / Keep editing                                  | D, E, H | R-2   |
| RC-112 | Two parallel saves of the same recipe: exactly one wins                                                             | D, H    | R-2   |
| RC-113 | Archive confirms, disappears for Staff immediately, stays for management under Show archived                        | D, E, H | R-2   |
| RC-114 | Restore returns it to Staff; `archived_by`/`updated_by` are attributable                                            | D, E, H | R-2   |
| RC-115 | Archived recipe cannot be saved until restored; Archive/Restore disabled while the form is dirty                    | D, E    | R-2   |
| RC-116 | Popular and Menu flags persist and drive the chips; `is_alcoholic = false` drives Non-alcoholic                     | E, H    | R-2   |
| RC-117 | The client cannot send `sort_order`, `slug`, `is_active` or image paths through `bar_recipe_save`                   | D       | R-2   |
| RC-118 | Demo mode: the editor works fully in memory with synthetic recipes                                                  | E       | R-2   |

## Storage and images (IMG) — R-2 unless stated

| ID     | Scenario                                                                                                             | Layers | Phase |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| RC-119 | Bucket `recipe-images` is private with the size/MIME limits                                                          | D      | R-2   |
| RC-120 | Management upload → Staff reads through a signed URL                                                                 | H      | R-2   |
| RC-121 | Staff cannot insert or delete objects                                                                                | D, H   | R-2   |
| RC-122 | Cross-organization select / insert / delete denied                                                                   | D, H   | R-2   |
| RC-123 | Staff cannot read the images of an archived recipe                                                                   | D, H   | R-2   |
| RC-124 | Insert into another recipe's folder or with a non-conforming name is denied                                          | D      | R-2   |
| RC-125 | No UPDATE policy: an existing object cannot be overwritten                                                           | D      | R-2   |
| RC-126 | Replace: new objects, old deleted, version bumps; Remove: columns null and objects deleted                           | H      | R-2   |
| RC-127 | Browser pipeline (pure): output dimensions ≤ 1600 / 480, WebP with JPEG fallback, rejects non-images and tiny images | U      | R-2   |
| RC-128 | Upload action rejects oversize and wrong magic bytes regardless of the claimed MIME type                             | U      | R-2   |
| RC-129 | A failed `set_image` deletes the just-uploaded objects (no orphans)                                                  | U, H   | R-2   |
| RC-130 | `bar_recipes_image_scope` check refuses a path outside the recipe's own folder                                       | D      | R-1   |
| RC-131 | Hosted image tests use a tiny generated image and delete their prefix                                                | H      | R-2   |

## RLS, tenancy, import (SEC / IMP)

| ID     | Scenario                                                                                            | Layers | Phase    |
| ------ | --------------------------------------------------------------------------------------------------- | ------ | -------- |
| RC-132 | Cross-organization `SELECT` returns zero rows on all six tables                                     | D, H   | R-1      |
| RC-133 | Cross-organization writes fail (RPCs `42501`/`22023`); ids from another tenant never accepted       | D, H   | R-2      |
| RC-134 | Composite FKs prevent a child pointing at another tenant's parent                                   | D      | R-1      |
| RC-135 | Children inherit archived visibility (variants, ingredients, steps, garnishes unreadable to Staff)  | D      | R-1      |
| RC-136 | No security-definer function without `search_path`; none of the new functions executable by `anon`  | D      | R-1, R-2 |
| RC-137 | Organization teardown cascades all Recipes rows                                                     | D      | R-1      |
| RC-138 | Import schema (zod) accepts the synthetic sample and rejects each invalid case with a field path    | U      | R-1      |
| RC-139 | `bar_recipes_import` is executable by `service_role` only                                           | D      | R-1      |
| RC-140 | Import `dry_run` writes nothing and reports the mapping table                                       | D, H   | R-1      |
| RC-141 | Import `create` inserts, re-run skips, and never overwrites a management-edited recipe              | D, H   | R-1      |
| RC-142 | Overwrite happens only for numbers named explicitly                                                 | D      | R-1      |
| RC-143 | Any error rolls back the whole import                                                               | D      | R-1      |
| RC-144 | Import actor must be an active management member of the target organization                         | D      | R-1      |
| RC-145 | Importer script refuses the PROD project ref without both `--allow-prod` and a matching `--confirm` | U      | R-1      |
| RC-146 | Categories are created when missing and never modified when present                                 | D      | R-1      |

## Responsive, accessibility, theme (A11Y)

| ID     | Scenario                                                                                                      | Layers    | Phase    |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------- | -------- |
| RC-147 | No horizontal page scroll on `server-mobile`, `host-tablet`, `desktop` for index, detail and (R-2) editor     | E         | R-1, R-2 |
| RC-148 | Touch targets ≥ 44 px (rows 48 px) in list, cards, tabs, chips                                                | E         | R-1, R-2 |
| RC-149 | Heading hierarchy and landmarks: one `h1`, category `h2`, lists are real lists                                | U, E      | R-1      |
| RC-150 | Keyboard-only path: search → open recipe → switch variant → Back                                              | E         | R-1      |
| RC-151 | `:focus-visible` indicators on rows, cards, tabs, chips, toggles                                              | E         | R-1, R-2 |
| RC-152 | Dialogs trap and restore focus; Escape closes non-destructive dialogs; live-region announcements (copy, save) | E         | R-2      |
| RC-153 | Light and dark themes render rows, cards, detail and forms without Recipes-only styles                        | E, manual | R-2g     |
| RC-154 | Contrast of badges, muted text, placeholder and archived state in both themes                                 | manual    | R-2g     |

## Hosted DEV and gates (GATE)

| ID     | Scenario                                                                                                                                             | Layers | Phase          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| RC-155 | DEV migration list identical to the repository after each phase; types regenerated                                                                   | H      | R-1, R-2       |
| RC-156 | Real-mode UI on a production build: management creates a recipe, Staff reads it, archive hides it; test data cleaned                                 | H      | R-2            |
| RC-157 | Every phase: `npm run check`, Vitest, normal build, **empty-Supabase-env build**, targeted Playwright                                                | build  | R-1, R-2       |
| RC-158 | Final gate: full relevant desktop / `host-tablet` (real WebKit) / `server-mobile` matrix, full pgTAP, hosted DEV, security audit, accessibility pass | all    | R-2g           |
| RC-159 | `.next` scans show no PROD project reference and no service-role key                                                                                 | build  | R-1, R-2, R-2g |
| RC-160 | PROD untouched throughout R-1 / R-2 / R-2g (recorded in each report)                                                                                 | record | R-1, R-2, R-2g |

## Coverage rules

- Every row is assigned to exactly the phase(s) shown; a row listing two phases is split as written in that row.
- The section tables are authoritative. Any row whose layers include **D** or **H** is required to pass in the CI `Database` job or the hosted-DEV run of that phase; rows with **E** run in all three Playwright projects unless the scenario is viewport-specific (RC-006, RC-086, RC-090, RC-092 name the viewport behaviour they need).
- R-2g re-runs the entire matrix (not only R-2 rows) and adds RC-153, RC-154, RC-158.
- Total: 160 scenarios (RC-001 … RC-160).

## Recipes V1 R-1 checkpoint

R1-D evidence: check PASS; Vitest 1708/1708; controlled single-worker tablet landing 15/15 over five repetitions; combined Recipes/default landing 45/45 across desktop, WebKit tablet and mobile. Post-review tablet assertions 3/3 passed; teardown hung. Cross-org: pgTAP and mocked server actions PASS; archived Staff denial: pgTAP and server-action behavior PASS. Fresh hosted browser duplication of these two security cases NOT RUN. DEV parity: PASS, independent authenticated read-only Supabase project query, 55 migrations, latest 20261028140623_bar_recipes_foundation. DEV synthetic cleanup: PASS, six tables zero.

## Concept E owner browser acceptance — NO-GO

Owner/TestOwner executed TC-01 through TC-22: 15 PASS, 6 FAIL, 1 BLOCKED. The individual case outcome mapping was not supplied. Viewport harness: 1440×900, 820×1180 and 390×844. Staff TC-19 was blocked without a Staff session. Signed-image visual/network smoke was performed; no page-level horizontal overflow across 15 records × 3 widths. Temporary QA records 9901–9904 were reported archived. Retest TC-03, TC-04, TC-07, TC-08, TC-12 House-only creation, TC-22 and relevant overflow after merge.

Findings are tracked in [#234](https://github.com/KrapaGoutam/The-Lineup/issues/234): RD-E-001 preparation difference; 002 sticky header jump; 003 garnish fallback; 004 Light focus; 005 long-token overlap; 006 target focus; 007 small-text contrast; 008 Perfect-side difference treatment; 009 House-only creation. TC-19 and observations O-1 through O-4 remain open. Owner acceptance is not complete.

## Recipes + Inventory integration sanity — 2026-10-29

**Result: GO for this integration checkpoint only.** Baseline `508cab9584bb77aacee89107f2d6940314b47214` includes PR #235 (final head `bd5e147f0dba2950f6edc77ae59a5cd40953b1f7`, application/browser-smoke/Vercel green). Recipes release readiness remains pending; #234 and milestone #7 stay open.

### Actual boundary

Both modules share `RestaurantOperationsApp`, `/` and `/r/<restaurantSlug>`, desktop secondary navigation, mobile More, verified `getCurrentUser(restaurantSlug)` membership/organization identity, theme tokens, Button/Input/Select/Dialog and responsive containers. Recipes also imports Inventory's display-only `TableSkeleton`; this is existing UI reuse, not data coupling. Manager predicates are separate equivalent designation checks, not one shared helper; Inventory is management-only, Recipes allows member reads with management-only authoring. Inventory resolves the primary location and subscribes to Inventory Realtime; Recipes is organization-wide and has no Realtime subscription.

Actual URLs: `?tab=recipes`, `?tab=recipes&recipe=<slug>`, `?tab=bar-inventory`. Inventory's Inventory/Dashboard/Manage/detail sheet are internal views rather than separate detail routes. Inventory filters use namespaced URL keys (`inv.*`, `bi.org`); Recipe search/filter state is module-local, with only List/Picture Book preference persisted separately as `recipes-view-preference`. Unrelated query keys may remain in the URL and are ignored by the other module. Returning to Inventory lands on Dashboard, then reopening Inventory restores its URL filter; visiting Recipes does not change quantities or counts.

No ingredient mapping, stock deduction/consumption, costing, pricing, automatic purchasing, Inventory mutation on Recipe save/read, or Recipe Realtime integration exists. Recipe reads select `bar_recipe_*` and sign private images; writes call `bar_recipe_save`, `bar_recipe_set_archived`, category RPCs and `bar_recipe_set_image` / `recipe-images` Storage only. Inventory actions/data contain no Recipe RPC or image mutation calls. Recipe migrations contain no Inventory mutation (the two Inventory-name mentions are index-shape comments). No SQL or hosted database test was needed for this unchanged contract.

### Focused matrix

Browser evidence: new `tests/e2e/recipes-inventory-integration.spec.ts` (two themes × desktop Chromium 1280×720, real WebKit iPad landscape 1080×810, Pixel 7 412×839) plus three existing Inventory scenarios per device. Deterministic demo manager `2468`; isolated worktree server on port 3018, no `.env` copied. No Staff browser acceptance or Concept E owner suite executed.

| ID    | Check                                | Result         | Evidence                                                                                                                                                                                                                                          |
| ----- | ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IS-01 | Desktop primary navigation           | PASS           | Inventory → Recipes/detail → Inventory → Recipes; URL/heading and single selected desktop secondary item asserted; Back returns to index.                                                                                                         |
| IS-02 | Mobile navigation                    | PASS           | Both modules reached through More; existing manager nav smoke preserves primary tools; dialogs close before navigation.                                                                                                                           |
| IS-03 | Tablet shell                         | PASS           | Configured real WebKit iPad landscape runs; normal content, safe dialogs and navigation remain usable.                                                                                                                                            |
| IS-04 | Direct routes                        | PASS           | Manager enters direct Inventory URL and direct Recipe Detail URL; index reached through navigation and browser Back; internal Inventory table/item sheet loads.                                                                                   |
| IS-05 | Shared shell                         | PASS           | Browser navigation/screenshots and scoped diff inspection; #235 only adds `data-app-header` to the existing shell header.                                                                                                                         |
| IS-06 | Light theme                          | PASS           | Both modules, input/button keyboard rings, categories/item/add-product dialogs and selected navigation checked; shared ring `#9a4a00`; destructive tokens unchanged.                                                                              |
| IS-07 | Dark theme                           | PASS           | Persisted app preference and matching browser color scheme; both modules and focus checked; ring remains `#f2a65a`.                                                                                                                               |
| IS-08 | Keyboard focus                       | PASS           | Actual Tab/Shift+Tab reaches Inventory search and Recipe categories trigger with focus-visible 2px ring; Recipe dialog restores trigger focus.                                                                                                    |
| IS-09 | Normal horizontal overflow           | PASS           | Strict document scrollWidth ≤ clientWidth for Recipe list/Picture Book/detail and Inventory at all configured widths; shelved long-token case not tested.                                                                                         |
| IS-10 | Recipe reads do not mutate Inventory | PASS           | Full Inventory text snapshot unchanged after search/detail/Picture Book/categories read; static read/action separation. Perfect/House are simultaneously rendered or stacked, not a layout mutation.                                              |
| IS-11 | Recipe authoring isolation           | PASS           | Static inspection of save, archive/restore, categories and image action/data RPC/Storage calls; focused authorization action tests. No live authoring.                                                                                            |
| IS-12 | Inventory mutation isolation         | PASS           | Inventory actions/data/hooks have no Recipe API imports or RPC names; Recipe migrations do not change Inventory objects.                                                                                                                          |
| IS-13 | Organization context                 | PASS           | Both action boundaries use live session plus `getCurrentUser`; active membership and organization resolved from restaurant slug, not editable metadata; Recipe queries/RPCs scoped by org, Inventory by org/primary location. Static sanity only. |
| IS-14 | Authorization compatibility          | PASS           | Auth helpers, current-user, tab resolver and Inventory source unchanged by #235; existing app-tab/passcode and Recipe action permission tests pass. TC-19 remains shelved.                                                                        |
| IS-15 | Search/filter isolation              | PASS           | Inventory unmatched search persists only in its namespaced URL; Recipes initially unfiltered; clearing Inventory search restores original rows/counts; Recipe search resets on remount as implemented.                                            |
| IS-16 | Dialog isolation                     | PASS           | Recipe Manage Categories and Inventory item sheet cancelled; no dialogs survive module change; native focus trap/Escape, bounds and Add product dialog covered by existing responsive test.                                                       |
| IS-17 | Shared toast infrastructure          | NOT APPLICABLE | Neither module uses shared toast infrastructure; Recipe save uses inline `role=status`, Inventory notices use inline `role=alert`; no forced errors or saves.                                                                                     |
| IS-18 | Browser console                      | PASS           | No console errors/page errors during cross-module scenarios on all devices/themes; harness NO_COLOR/FORCE_COLOR warnings are unrelated.                                                                                                           |
| IS-19 | Shared responsive components         | PASS           | #235 shared CSS diff is only Light `--ring`; header gains only data attribute. Recipe Detail styles remain component-local; shared primitives/auth/Inventory unchanged.                                                                           |
| IS-20 | Inventory core smoke                 | PASS           | Existing manager navigation, golden Critical/Low/Healthy/No cutoff rows/counts/order quantities and safe item/Add product dialogs pass on all devices; search and unchanged snapshot additionally covered.                                        |

Vendor Order Drafts: navigation tab remains present in the existing manager nav assertion. Not expanded — outside focused Recipes + Inventory sanity scope.

### Validation and limitations

- Focused Vitest: **11 files, 116 tests passed**: `src/lib/app-tab.test.ts`, `src/hooks/use-theme.test.tsx`, `src/features/auth/domain/passcode.test.ts`, four Recipe action suites (read/write/management/image), `recipes-module.test.tsx`, Inventory `stock-rules.test.ts`, `use-catalog-controller.test.tsx`, `filterable-table.test.tsx`.
- Playwright: **15 unique targeted cases passed** (9 existing Inventory cases plus final 6 cross-module theme/device cases). Initial combined run was 14/15 because the test directly overrode `data-theme` while the app retained its system preference; corrected fixture persists `serviceflow-theme` before page load and emulates the matching browser scheme. Final six cases rerun on that correction; existing nine unchanged cases reused. An earlier draft asserted RGB serialization for an opacity-mixed CSS ring; corrected to actual keyboard focus, visible ring geometry and theme token. No application regression reproduced.
- Initial desktop drafting reused port 3000; final evidence above uses the isolated worktree on 3018. Turbopack could not resolve junction-linked dependencies outside its root; `npm run dev -- --webpack --port 3018` succeeds without installing/changing packages. Tooling setup issue only.
- No application source, schema, migration, policy, Production, main or import change. Only the cross-module regression test and canonical tracking docs changed.
- Full local Vitest/check/build deliberately not repeated under the focused-checkpoint instruction; exact PR-head CI runs format/lint/typecheck/full Vitest/build and desktop browser-smoke. CI and merge evidence recorded in canonical issue #220 and the linked PR.
- No new integration defect found. No full accessibility audit, Staff TC-19, real-data owner review, signed-image acceptance retest or production-readiness claim.

Next: Recipes V1 release-readiness audit in a new independent session after green CI/development merge. Owner browser acceptance, RD-E-005/007/008, O-1–O-4, TC-19 and persistent DEV realistic-data review remain SHELVED / LATER.
