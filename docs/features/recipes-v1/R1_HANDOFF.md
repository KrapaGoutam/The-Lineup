# Recipes V1 — R-1 Handoff

## State

Phase: R-1
Status: R1-A COMPLETE; R1-B NOT STARTED
Branch: feature/recipes-v1-r1-core
Base development SHA: c3e44536c8dc39023eac81b1d5795ce7e145b9a9
Current HEAD: c63b70e (implementation checkpoint; check git for later commits)
Main: UNCHANGED
DEV DB touched: YES (Recipes migration and rolled-back synthetic tests)
PROD touched: NO
R-2 started: NO

## Current Milestone

R1-A COMPLETE — R1-B is next, in a new session.

## Completed

- Fetched remote refs; clean local development fast-forwarded to the expected R-0 base.
- Verified no existing local or remote R-1 branch; created the requested branch.
- Preflight handoffs committed and pushed as 2c3a7ab and 7d5d933. Local Supabase is running; CLI 2.76.8 is installed.
- Recovery checkpoint `0d7d4fa` committed and pushed the existing draft migration, test and handoff. Fetch confirmed origin/development remained `c3e44536` and the feature branch matched the checkpoint.
- R1-A migration, import foundation, synthetic fixture, generated types and local DB tests completed. DEV migration applied and synthetic validation passed.

## In Progress

- None for R1-A. See Exact Next Action for R1-B.

## Not Started

- R1-B navigation, read layer and List View; R1-C detail/search; R1-D final R-1 gate, PR and merge; R-2.

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

1. Start R1-B in a new Codex session on the same branch: Recipes navigation, read layer and List View.
2. Fetch and check branch, local/remote HEAD and status; read this handoff and the relevant R-0 UI sections.
3. Do not open the final R-1 PR until R1-B, R1-C and R1-D are complete. Do not touch main or PROD.

## Safety

development merged: NO
main changed: NO
DEV touched: YES (Recipes migration and rolled-back synthetic validation)
PROD touched: NO
PROD migrations: NO
R-2 started: NO
Part 2 started: NO
