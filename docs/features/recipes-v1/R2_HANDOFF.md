# Recipes V1 R-2 handoff

- R2-A: IN PROGRESS; local database GO; local GO; hosted gates pending.
- R2-B: NOT STARTED. All R2-C+, R2g and Part 2: NOT STARTED. R-2 PR: NOT OPENED.
- Branch: feature/recipes-v1-r2-management. Base development: 8f358a422c91275319c9f4479891a54a4cbb21c3. Starting HEAD: cb1fd09823e12c54a2befb8a80e674ec7a122ab5.
- Canonical migration: 20261028193159_bar_recipes_management_and_images.sql, CLI-created after inspecting migration-new help. Repository migrations: 56. Scratch draft removed after promotion; there is one canonical implementation.

## Implementation

Management save implements its own validated, atomic write path. R-1 bar_recipes_import and private.recipes_apply are unchanged. Every management RPC verifies auth.uid() and active management membership, pins search_path and scopes rows to organization_id. Organization lock is acquired before row locks, matching the import convention. Tables remain SELECT-only; private write helpers are inaccessible to clients.

All four draft defects are fixed: actual number/category UNIQUE violations receive structured existing-record detail; restore shares category serialization; create assigns per-org collision suffixes with reserved/fallback handling; edit can retain its current inactive category while create and category changes require an active category. Slugs remain immutable, renumbering preserves identity, stale versions fail before mutation, and the complete variant graph saves atomically.

Storage bucket recipe-images is private, 2 MiB, JPEG/WebP only. Safe UUID/path parsing plus membership/recipe lookups gate SELECT/INSERT/DELETE; there is no UPDATE policy. Image metadata RPC enforces paired paths, scope and expected version. No UI or R2-B work.

## Local evidence (2026-10-28)

- 0044 focused first pass: 75/75. Six more Staff/archive cases added before the full gate; 0044 reached 81 assertions in the full suite, then 82 after the final whitespace check; final focused PASS.
- R-1 existing regression: 51/51, including dry-run, create, repeat skip and explicit overwrite; PASS again in full suite.
- 0045: 33/33. First run hit current Storage protect_delete guard; rollback-only metadata tests now set the API's transaction-local allow_delete_query flag without disabling RLS. No file objects exist in those fixtures.
- Combined focused run before the six additional 0044 checks: 108/108 PASS.
- Clean replay: supabase db reset --local PASS, all 56 migrations, including canonical R2-A. Full database gate run ONCE after replay: 45 files, 1,462 assertions, PASS.
- Types regenerated from local post-replay schema, formatted; diff adds only six management RPC signatures.
- Real two-session local harness: node scripts/recipes/test-management-concurrency.mjs PASS. Observed pg_stat_activity advisory waits in both restore/deactivate orders; loser revalidates committed category/recipe state. Concurrent creates suffix correctly, concurrent number collision reports committed winner id/label, and same-version saves yield exactly one winner plus PT409. Synthetic fixture cleanup PASS. This is executed concurrency evidence, not static lock inspection.
- Renumber 23 to 38: same id/slug, version increment, PASS. Duplicate structured detail, stale graph rollback, invalid House-child graph rollback, inactive-current retention and different inactive rejection: PASS.
- Final diff review found whitespace-only single-line text could reach a raw table check; fixed normalization and added one focused assertion. A second clean replay of all 56 migrations PASS; focused 0043/0044/0045 on final SQL PASS, 3 files / 166 assertions (51 + 82 + 33), concurrency harness PASS again; types regenerated again. The full suite was run once before this narrow correction.
- Application quality: npm run check PASS; Vitest 129 files / 1708 tests PASS; DEV-pinned normal build PASS and explicit empty-public-Supabase-env build PASS (static root). Non-production bundle scans PASS. Targeted Playwright regression PASS: 45/45 across desktop, real WebKit tablet and mobile; assertions and teardown completed.

## Hosted DEV

Target independently verified via the existing OP1.0 Supabase connector: the-lineup-dev, ref opmujepkemwcdxxorhfd, ACTIVE_HEALTHY. Read-only SQL preflight: current_user/session_user postgres, 55 migrations, latest 20261028140623, zero recipes, zero recipe-images buckets and no storage.objects policies. Migration-role Storage policy creation, final parity, real-JWT tests and cleanup: PENDING. Existing linked CLI 403 does not block this authorized connector path.

## Safety and next action

DEV untouched in this continuation so far. PROD untouched; main/development unchanged; no real recipe import; no editor/image UI; no PR. Next: finish app gates, verify the-lineup-dev target, apply the migration through its authorized migration path, verify Storage policies and parity, run the isolated hosted Recipes suite and verify zero residue. Then complete docs, commit/push this branch and STOP before R2-B.
