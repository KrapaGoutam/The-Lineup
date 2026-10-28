# Recipes V1 — R-1 Handoff

## State

Phase: R-1
Status: IN PROGRESS
Branch: feature/recipes-v1-r1-core
Base development SHA: c3e44536c8dc39023eac81b1d5795ce7e145b9a9
Current HEAD: 0d7d4fa (recovery checkpoint; check git for later commits)
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

- Draft migration `20261028140623_bar_recipes_foundation.sql` contains six tables, indexes, read helpers, RLS and grants; import functions remain to be implemented.
- Draft `0043_bar_recipes_foundation.test.sql` covers 16 schema and authorization assertions.
- Validate local replay, constraints, grants, isolation and import rollback before considering hosted DEV.

## Not Started

- Import RPC and script, synthetic import fixture, generated types, full migration replay, further DB tests, hosted DEV validation, UI, PR and merge.

## Locked Decisions

- Organization-wide recipes; no location_id. All active roles read; Staff cannot write.
- Persist Perfect and House; recipe numbers remain unique per organization, including archived records.
- R-1 uses synthetic content only. No editor, Storage, Picture Book or R-2 work.
- Controlled service-role import must be atomic; authenticated clients receive no broad write grants.

## Schema / RPCs Added

- Draft only: six tables, four private read helpers, six SELECT policies and authenticated SELECT grants. No import RPC yet.

## Files Changed

- Uncommitted: this handoff, draft foundation migration and draft focused pgTAP file.

## Tests Already Passing

- 16/16 draft pgTAP assertions passed through local Docker psql in a rolled-back transaction with the draft migration. This is not a full migration replay.
- Reproduced the same 16/16 on 2026-10-28 against local Docker, again in a rolled-back transaction; no clean replay or full database suite has been run in this continuation.

## Known Failures

- `python` was unavailable; Node fed the local psql transaction instead. Import, replay and hosted validation remain unrun.
- The continuation request emphasizes create-only import. The locked R-0 contract also describes explicitly selected per-number overwrite; preserve the request's create-only boundary while resolving that contract difference before implementing an overwrite path.

## Hosted DEV State

- Migrations applied: none for R-1.
- Synthetic records: none. Cleanup: not required.
- Project ref verification: not yet performed.

## Git State

- Committed and pushed: preflight checkpoints 2c3a7ab and 7d5d933; recovery checkpoint 0d7d4fa.
- Inspect git status for current uncommitted work. PR: none.

## Exact Next Action

1. Complete `private.recipes_slugify`, `private.recipes_apply`, service-role-only `public.bar_recipes_import`, the guarded importer script and synthetic fixture according to DATA_MODEL.md §6 and SOURCE_MAPPING.md §5.
2. Expand focused pgTAP for importer atomicity, grants, constraints and actor validation; regenerate types.
3. Run clean local replay and focused/full required DB tests; only then verify the DEV target and consider hosted migration.

## Safety

development merged: NO
main changed: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
R-2 started: NO
Part 2 started: NO
