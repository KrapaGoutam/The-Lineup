# Recipes V1 R-2 handoff

- R2-A: COMPLETE.
- R2-B: NEXT / NOT STARTED. All R2-C+, R2g and Part 2: NOT STARTED. R-2 PR: NOT OPENED.
- Branch: feature/recipes-v1-r2-management. Base development: 8f358a422c91275319c9f4479891a54a4cbb21c3. Starting HEAD: cb1fd09823e12c54a2befb8a80e674ec7a122ab5.
- Canonical migration: 20261028193159_bar_recipes_management_and_images.sql, CLI-created after inspecting migration-new help. Repository migrations: 56. Scratch draft removed after promotion; there is one canonical implementation.
- Local-GO implementation commit: 4a4c551. Final validated implementation/test SHA: b05569c70426c6974054b620d99b0b7db3bec598. The final branch SHA is the completion documentation commit containing this handoff, resolvable with `git log -1 --format=%H --grep='docs(recipes): complete R2-A handoff'`; final response records it explicitly. Same feature branch, no rebase/reset/merge.

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

Target independently verified via the existing OP1.0 Supabase connector: the-lineup-dev, ref opmujepkemwcdxxorhfd, ACTIVE_HEALTHY. Read-only SQL preflight: current_user/session_user postgres, 55 migrations, latest 20261028140623, zero recipes, zero recipe-images buckets and no storage.objects policies. Existing linked CLI 403 did not block the authorized connector path; no new credential was requested.

- After all local gates, the connector's apply_migration executed the exact canonical SQL successfully. This migration itself created recipe-images plus recipe_images_select, recipe_images_insert and recipe_images_delete on hosted storage.objects (owned by supabase_storage_admin). No privileged manual policy bypass was used. Hosted migration-role policy creation: PASS.
- Connector-generated history version was 20261028194926. A narrowly scoped history-row UPDATE aligned that one applied entry to repository version 20261028193159, without reapplying SQL. This is metadata reconciliation for the connector's automatic timestamp. Count before 55; after 56; repository 56. A full version/name comparison returned zero mismatches; canonical migration statement content hash matched the repository. Parity PASS; latest 20261028193159_bar_recipes_management_and_images.
- Hosted suite: `npm run test:real -- tests/real/recipes-management.db.real.test.ts`, 7/7 PASS (five management tests, two Storage tests), real JWTs via PostgREST/Storage. It creates only its own randomly named Recipes R2 organizations/users, never uses or deletes V2 Harness data. Covers create/edit/renumber, number duplicate detail, slug suffix, stale/child rollback, Staff/inactive/foreign denial, direct writes, category rules/current-inactive retention, archive/restore attribution and Staff visibility, image metadata, actual upload/download/sign/delete, foreign and Staff write denial, archive visibility, and overwrite denial.
- First hosted run passed 6/7, with the final post-delete download still returning cached bytes. Corrected the test to require exactly one object in the DELETE response and an empty authoritative folder listing. Final run 7/7; SQL and policies required no change. Both runs completed cleanup. No claim that cached/signed bytes are revoked immediately.
- Final independent SQL audit: six RLS tables; zero authenticated direct DML/TRUNCATE privileges; six management RPC grants; zero anonymous RPC grants; zero bad SECURITY DEFINER search paths. Storage UPDATE/ALL policies: zero.
- Security advisor reviewed: the six authenticated SECURITY DEFINER RPC notices are intentional, authorized RPC boundaries verified above ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); remaining notices concern existing non-Recipes objects/Auth configuration. No new Recipes isolation defect found.
- Cleanup PASS: Storage API removed this run's exact objects and folder listing was empty. Independent SQL then found 0 rows in each of recipes/categories/variants/ingredients/steps/garnishes, 0 recipe-images object metadata rows, 0 Recipes R2 organizations and 0 synthetic Auth users. Orphan test objects: 0. Bucket and policies retained.
- Built-output scans: zero PROD project references and zero exact DEV Supabase secret/service-role values. No credentials or generated runtime artifacts committed.

## Safety and next action

DEV touched only for the R2-A migration, its history alignment, controlled security validation and cleanup. PROD untouched; no PROD migration; main/development unchanged; no real Monks recipe import; no editor/image UI; R-2 PR NOT OPENED; Part 2 NOT STARTED.

R2-A COMPLETE. Next: R2-B, management write actions and editor core. Use Codex, LOCAL, GPT-6.1 Terra, Medium, NEW SESSION. Continue SAME branch feature/recipes-v1-r2-management, starting with this handoff. Do not start R2-C, open the R-2 PR, touch main or touch PROD. STOP here.
