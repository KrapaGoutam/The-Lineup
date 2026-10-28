# Recipes V1 — R-1 Handoff

## State

Phase: R-1
Status: IN PROGRESS
Branch: feature/recipes-v1-r1-core
Base development SHA: c3e44536c8dc39023eac81b1d5795ce7e145b9a9
Current HEAD: c9d960a (continuation documentation checkpoint; check git for later commits)
Main: UNCHANGED
DEV DB touched: NO
PROD touched: NO
R-2 started: NO

## Current Milestone

R1-A — database, access controls and import foundation.

## Completed

- Fetched remote refs; clean local development fast-forwarded to the expected R-0 base.
- Verified no existing local or remote R-1 branch; created the requested branch.
- Preflight handoffs committed and pushed as 2c3a7ab and 7d5d933. Local Supabase is running; CLI 2.76.8 is installed.
- Recovery checkpoint `0d7d4fa` committed and pushed the existing draft migration, test and handoff. Fetch confirmed origin/development remained `c3e44536` and the feature branch matched the checkpoint.

## In Progress

- Local implementation includes migration `20261028140623_bar_recipes_foundation.sql`, service-only `public.bar_recipes_import`, private apply/validation helpers, guarded `scripts/recipes/import-recipes.mjs`, and `tests/fixtures/recipes/import-sample.synthetic.json`.
- Local generated types updated in `src/types/database.generated.ts`. Hosted validation remains outstanding.

## Not Started

- Hosted DEV migration and validation, UI, PR and merge.

## Locked Decisions

- Organization-wide recipes; no location_id. All active roles read; Staff cannot write.
- Persist Perfect and House; recipe numbers remain unique per organization, including archived records.
- R-1 uses synthetic content only. No editor, Storage, Picture Book or R-2 work.
- Controlled service-role import must be atomic; authenticated clients receive no broad write grants.

## Schema / RPCs Added

- Six tables, private read/write/validation helpers, six SELECT policies, authenticated SELECT grants and service-role-only `bar_recipes_import`. No authenticated write RPC.

## Files Changed

- Uncommitted: this handoff, foundation migration, focused pgTAP, `scripts/recipes/` and `tests/fixtures/recipes/`.

## Tests Already Passing

- 16/16 draft pgTAP assertions passed through local Docker psql in a rolled-back transaction with the draft migration. This is not a full migration replay.
- Reproduced the same 16/16 on 2026-10-28 against local Docker, again in a rolled-back transaction; no clean replay or full database suite has been run in this continuation.
- Clean local reset/replay: 55 migrations, PASS. Focused pgTAP: 51/51. Full pgTAP: 43 files / 1348 assertions, PASS. Script Vitest: 3/3. Local synthetic importer: dry-run 2, create 2, repeat skips 2, cleanup PASS. TypeScript and focused ESLint passed.

## Known Failures

- `python` was unavailable; Node fed the local psql transaction instead. Import, replay and hosted validation remain unrun.
- Import defaults to create-only and supports R-0's explicitly selected per-number overwrite; local tests cover actor authorization, rollback, duplicate input and overwrite. Hosted verification remains unrun.
- `npx supabase db push --linked --dry-run` failed with HTTP 403 initializing the login role; `SUPABASE_DB_PASSWORD` is absent. The repository documents a DEV-pinned Management API transaction as an alternative; verify it and preserve the local checkpoint before using it.

## Hosted DEV State

- Migrations applied: none for R-1.
- Synthetic records: none. Cleanup: not required.
- Project ref verification: Supabase account project listing and project details identify `opmujepkemwcdxxorhfd` as `the-lineup-dev`; local linked ref matches. Current hosted migration history is 54 versions, ending `20261028100100`.

## Git State

- Committed and pushed: preflight checkpoints 2c3a7ab and 7d5d933; recovery checkpoint 0d7d4fa; documentation checkpoint c9d960a.
- Inspect git status for current uncommitted work. PR: none.

## Exact Next Action

1. Review local diff and checkpoint it; perform a guarded DEV migration dry run against the verified linked DEV target.
2. Apply only the Recipes migration if the guarded dry run and target checks pass, verify 55-version parity, then run hosted synthetic import/security checks and clean up.
3. Record actual hosted evidence, update this handoff and current-task, commit and push; do not start R1-B in this session.

## Safety

development merged: NO
main changed: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
R-2 started: NO
Part 2 started: NO
