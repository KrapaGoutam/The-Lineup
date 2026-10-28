# Recipes V1 — R-1 Handoff

## State

Phase: R-1
Status: R1-A COMPLETE; R1-B COMPLETE; R1-C COMPLETE; R1-D NEXT / NOT STARTED
Branch: feature/recipes-v1-r1-core
Base development SHA: c3e44536c8dc39023eac81b1d5795ce7e145b9a9
Starting R1-B HEAD: d47bcbe7f0b3a09a07ca3f00150be2c4474ca885 (check git for current HEAD)
Main: UNCHANGED
DEV DB touched: YES (Recipes migration and rolled-back synthetic tests)
PROD touched: NO
R-2 started: NO

## Current Milestone

R1-A COMPLETE; R1-B COMPLETE; R1-C COMPLETE; R1-D NEXT / NOT STARTED.

## Completed

- Fetched remote refs; clean local development fast-forwarded to the expected R-0 base.
- Verified no existing local or remote R-1 branch; created the requested branch.
- Preflight handoffs committed and pushed as 2c3a7ab and 7d5d933. Local Supabase is running; CLI 2.76.8 is installed.
- Recovery checkpoint `0d7d4fa` committed and pushed the existing draft migration, test and handoff. Fetch confirmed origin/development remained `c3e44536` and the feature branch matched the checkpoint.
- R1-A migration, import foundation, synthetic fixture, generated types and local DB tests completed. DEV migration applied and synthetic validation passed.

## In Progress

- None; R1-C implementation and validation completed.

## Not Started

- R1-D final R-1 gate, PR and merge; R-2.

## Locked Decisions

- Organization-wide recipes; no location_id. All active roles read; Staff cannot write.
- Persist Perfect and House; recipe numbers remain unique per organization, including archived records.
- R-1 uses synthetic content only. No editor, Storage, Picture Book or R-2 work.
- Controlled service-role import must be atomic; authenticated clients receive no broad write grants.

## Schema / RPCs Added

- Six tables, private read/write/validation helpers, six SELECT policies, authenticated SELECT grants and service-role-only `bar_recipes_import`. No authenticated write RPC.

## Files Changed

- Migration `supabase/migrations/20261028140623_bar_recipes_foundation.sql`; tests `supabase/tests/database/0043_bar_recipes_foundation.test.sql`, `scripts/recipes/import-recipes.test.ts`; importer `scripts/recipes/import-recipes.mjs` and `import-schema.mjs`; synthetic fixture `tests/fixtures/recipes/import-sample.synthetic.json`; generated types `src/types/database.generated.ts`.

## Tests Already Passing

- 16/16 draft pgTAP assertions passed through local Docker psql in a rolled-back transaction with the draft migration. This is not a full migration replay.
- Reproduced the same 16/16 on 2026-10-28 against local Docker, again in a rolled-back transaction, before the expanded suite below.
- Clean local reset/replay: 55 migrations, PASS. Focused pgTAP: 51/51. Full pgTAP: 43 files / 1348 assertions, PASS. Script Vitest: 3/3. Local synthetic importer: dry-run 2, create 2, repeat skips 2, cleanup PASS. TypeScript and focused ESLint passed. Hosted DEV synthetic SQL/RPC tests: active Staff read, Staff write denial, management read, inactive denial, cross-org denial, archived visibility, number/variant uniqueness, dry-run/create/repeat and invalid second recipe rollback PASS.

## Known Failures

- `python` was unavailable; Node fed the initial local psql transaction instead. Subsequent replay and validations passed.
- Import defaults to create-only and supports R-0's explicitly selected per-number overwrite; local tests cover actor authorization, rollback, duplicate input and overwrite.
- `npx supabase db push --linked --dry-run` failed with HTTP 403 initializing the login role; `SUPABASE_DB_PASSWORD` is absent. The documented DEV-pinned Management API route was used successfully instead.

## Hosted DEV State

- Migration `20261028140623_bar_recipes_foundation` applied via DEV-pinned Management API in a guarded transaction (HTTP 201). DEV 54 → 55 versions; version list equals repository/local.
- Synthetic transactions rolled back. Follow-up counts for the test organization: categories, recipes, variants, ingredients, steps and garnishes all zero. Local synthetic importer was also cleaned. No real recipe data imported.
- Project ref verification: Supabase account project listing and project details identify `opmujepkemwcdxxorhfd` as `the-lineup-dev`; local linked ref matches.
- Guarded Management API migration dry-run returned HTTP 201 and rolled back before the actual migration. Hosted security advisor reported no Recipes findings; existing non-Recipes advisories remain.

## Git State

- Committed and pushed: preflight checkpoints 2c3a7ab and 7d5d933; recovery checkpoint 0d7d4fa; documentation checkpoint c9d960a; local implementation checkpoint c63b70e.
- Inspect git status for current uncommitted work. PR: none.

## Exact Next Action

1. Start R1-D final R-1 validation, documentation and PR in a new session on this same branch.
2. Fetch and verify HEAD and status; use this handoff as the starting point.
3. Do not start R-2 or touch main or PROD.

## Safety

development merged: NO
main changed: NO
DEV touched: YES (Recipes migration and rolled-back synthetic validation)
PROD touched: NO
PROD migrations: NO
R-2 started: NO
Part 2 started: NO

## R1-B execution checkpoint (historical)

- Current milestone: R1-B IN PROGRESS; R1-A COMPLETE; R1-C NOT STARTED.
- Starting HEAD: `d47bcbe7f0b3a09a07ca3f00150be2c4474ca885`; fetched feature branch matched and working tree clean.
- DEV schema already at 55 migrations; PROD untouched. No database change planned.
- Expected files: canonical app-tab/navigation and tests, `src/features/recipes/` read model and list components, focused browser tests, this handoff and `tasks/current-task.md`.
- Data/security: read organization-scoped categories and active recipe summaries through existing server identity and RLS; no detail graph or elevated client. Staff and management share read access.
- UI states: grouped list, empty, loading and read error; desktop, tablet, mobile More. Baseline search is included under R1.5; detail remains R1-C.
- Risks/tests: preserve default Tasks, route and history; verify category/fallback and recipe-number ordering, roles, isolation, focused browser/navigation regressions, check and both builds.
- Exact first task: inspect canonical app-tab/navigation and existing server read patterns, then add the Recipes tab and compact read layer.

### R1-B working checkpoint (historical)

- Navigation wired in `src/lib/app-tab.ts` and `src/components/restaurant-operations-app.tsx`; Recipes appears after Bar Inventory and in More, with no role gate.
- Added `src/features/recipes/{actions,components,domain}`. The server action validates slug, verifies live session and membership, and reads active categories and paged active summaries scoped by organization through RLS. No detail graph or database changes.
- Grouped List View, empty/loading/error, and search are implemented. Search belongs here because IMPLEMENTATION_PLAN R1.5 explicitly assigns it; detail remains R1-C.
- Focused domain and app-tab Vitest: 13/13 passed. TypeScript passed before latest changes.
- Remaining: focused browser coverage and navigation regressions; component/read security tests; check, normal and empty-env builds; review, handoff, commit and push. Exact next action: add and run Recipes browser tests.

### R1-B verification checkpoint (historical)

- Focused Vitest: 19/19 (domain, component, action and canonical tab tests). Full Vitest before the final component/test additions: 126 files, 1699 assertions passed.
- Recipes browser tests: all 9 cases reported passed across desktop, host-tablet and server-mobile; the Windows Playwright process remained in web-server teardown and was interrupted after the nine pass lines. Earlier combined default-landing and Recipes run: all 33 default-landing cases and 5/6 Recipes cases passed; tablet history case failed before the test waited for the destination heading, and passed on both subsequent tablet runs.
- `npm run check` passed; normal and empty-public-Supabase-env builds passed after the loading skeleton change.
- No R1-B migration or hosted data changes. R1-A's existing DEV RLS evidence remains valid; this session's server-action authorization checks are mocked. Browser coverage uses synthetic demo data; empty/error/loading are component-tested, not browser-tested. Actual R1-B authenticated read and browser empty state remain unverified.
- Follow-up: guarded real-mode DEV browser test passed 2/2 for TestManager and TestServer1, each reading the empty landing through the actual server action. No recipe records were created. Existing Tasks sign-in/landing actions also ran in DEV.

### R1-B complete

- R1-A HEAD: `d47bcbe7f0b3a09a07ca3f00150be2c4474ca885`; R1-B code checkpoint: `c5e0b58e64675fbb396864928bb70c20efac2af5`. Check git for final R1-B documentation/test commit HEAD.
- Navigation: canonical Recipes tab after Bar Inventory, all roles, More on mobile; default Tasks and restaurant route retained. The tab helper strips recipe-specific parameters when leaving.
- Read: server-resolved active membership and live session, organization filters and existing RLS, active categories and paged active recipe summaries. DEV manager and staff empty reads passed; cross-org and inactive-policy evidence remains the R1-A pgTAP/DEV validation, complemented by mocked action tests.
- List: category metadata ordering, fallback last, stored number ordering, empty, existing loading skeleton and error states. Baseline search implemented per R1.5; detail, links and editing remain later scope.
- Tests: focused Vitest 19/19; full Vitest 1699/1699 before final focused test additions; nine Recipes demo browser cases reported passing across desktop/tablet/mobile, with Windows server teardown interrupted after the pass lines; 33 default-landing regression cases passed in the earlier combined run. Real-mode DEV empty landing 2/2 passed. Check and both normal/empty-public-env builds passed after the final application changes. The real-mode test was added after these builds.
- DEV: no migration or recipe data created in R1-B; real-mode sign-in also ran existing Tasks actions. PROD untouched. No R-1 PR opened.
- Exact next action: start R1-C in a new session on this same branch, beginning with this handoff. Do not merge development or touch main or PROD.

## R1-C execution checkpoint

- Status: R1-A COMPLETE; R1-B COMPLETE; R1-C IN PROGRESS; R1-D NOT STARTED.
- Starting HEAD: `f63c6c7e430e4028db093fb13321851b39e8c46e`; fetched remote matched; working tree clean.
- Expected files: Recipes action/read model, module and detail components, focused unit and browser tests, this handoff and current-task. No migration planned.
- Detail read strategy: validate restaurant and recipe slugs, verify live session and active membership using the R1-B pattern, query a single active recipe scoped to the resolved organization and its ordered variant graph under RLS. Staff and management share active detail; archived management mode is R-2.
- UI states: direct URL and history, loading, error/retry, missing recipe, missing variants/sections, desktop comparison, mobile accessible House-first tabs. Risks: tenant isolation, stale async responses, path/history and focus restoration, empty-env builds.
- Focused tests: server authorization and mapping/order, component variants/accessibility, desktop/tablet/mobile Playwright and navigation/search regressions; then check, full Vitest and both builds.
- DEV schema: 55 migrations. Real recipe data: NONE. PROD: UNTOUCHED.
- Exact next action: inspect the existing URL-state integration and implement the scoped detail read and synthetic fixture.

### R1-C implementation midpoint

- Starting HEAD `1aefca9d7e20aedccea9020a92ff8d220b2871f0`. Files: Recipes action, detail types and component, module integration, shell navigation, focused tests and synthetic demo fixture.
- Detail action verifies live session and server-resolved membership, filters active recipe by organization and slug, and batches category, variants and ordered child reads with caller RLS. No schema change.
- URL uses existing `?tab=recipes&recipe=<slug>` and native history; search state remains in the mounted module. Detail provides comparison on tablet/desktop, accessible House-first mobile tabs and a single-variant fallback.
- Focused Recipes Vitest: 14/14 passed. Focused desktop Playwright: 1/1 passed with separate demo server. Initial Playwright failures were test locator and demo re-sign-in after reload; fixed. Initial built-in web-server teardown was interrupted after a failure.
- Remaining: tablet/mobile and regressions, expand security/ordering and accessibility evidence, scroll restoration, review, check, full Vitest, both builds, hosted validation as applicable, final handoff and commit/push.
- Exact next action: run host-tablet and server-mobile detail specs, fix failures, then complete the remaining gates.

### R1-C complete

- Starting HEAD: `1aefca9d7e20aedccea9020a92ff8d220b2871f0`; implementation commit: `01e502d`; final documentation commit: inspect git HEAD. Branch: `feature/recipes-v1-r1-core`.
- Detail: `?tab=recipes&recipe=<slug>` preserves the pathname and query context. Links use native history; list/search, Back/Forward, refresh and restaurant path verified. Landing scroll and link focus are restored after opening a recipe.
- Read: `getRecipeDetailAction` checks live session and active membership, resolves the organization server-side and selects one active recipe with batched organization-scoped variant and ordered child reads. Both roles read both variants. Unknown, foreign and archived slugs return unavailable. No migration or Storage work.
- UI: Perfect and House comparison at md and above; mobile ARIA tabs default to House and support arrow keys; single variants occupy the full width. Actual stored optional sections are rendered; missing sections are omitted. Placeholder hero only.
- Evidence: Recipes focused Vitest 15/15; final full Vitest 129 files / 1708 tests. Detail browser 1/1 each desktop, host-tablet WebKit and server-mobile, including keyboard, history, path, refresh and no overflow. Recipes landing: 8/9 in combined run plus isolated host-tablet 3/3 (one tablet history case failed under 12-worker load and passed in isolation); default-landing 33/33. Explicit separate server avoided the known teardown hang; initial Playwright run hung during teardown following a test failure and was interrupted.
- `npm run check` passed; normal build explicitly pinned to DEV passed and bundle scan passed; empty-public-Supabase-env build passed with static root. First normal build loaded the local production public configuration; it completed without an observed database operation. It was replaced locally with the DEV-pinned build; no PROD migration, data operation or deployment was performed.
- Hosted DEV: guarded synthetic import and real-mode UI passed manager and Staff 2/2, including both variants and refresh; cleanup verified zero fixture recipes, variants, ingredients, steps, garnishes and category. Empty landing passed both roles after cleanup. Cross-organization and archived RLS evidence remains the R1-A hosted/pgTAP validation; R1-C action tests check organization and active filters and inactive/session denial with mocks, not a fresh hosted foreign-organization browser test. No real recipe content.
- PROD: no database or deployment operation; see build configuration note above. R1-D, R-2 and Part 2 not started; no PR opened.
- Exact next action: R1-D final R-1 gate, documentation and PR in a new session, same branch. Do not start R-2 or touch main or PROD.
