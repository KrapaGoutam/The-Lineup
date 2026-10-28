# Recipes V1 — R-1 Handoff

## State

Phase: R-1
Status: IN PROGRESS
Branch: feature/recipes-v1-r1-core
Base development SHA: c3e44536c8dc39023eac81b1d5795ce7e145b9a9
Current HEAD: 2c3a7ab (preflight checkpoint; check git for any later commit)
Main: UNCHANGED
DEV DB touched: NO
PROD touched: NO
R-2 started: NO

## Current Milestone

R1-A — database, access controls and import foundation.

## Completed

- Fetched remote refs; clean local development fast-forwarded to the expected R-0 base.
- Verified no existing local or remote R-1 branch; created the requested branch.
- Preflight handoff committed and pushed as 2c3a7ab. Local Docker responds; Supabase CLI 2.76.8 is installed.

## In Progress

- Review the locked R-0 schema and existing database conventions before implementation.

## Not Started

- Migration, importer, UI, tests, hosted DEV validation, PR and merge.

## Locked Decisions

- Organization-wide recipes; no location_id. All active roles read; Staff cannot write.
- Persist Perfect and House; recipe numbers remain unique per organization, including archived records.
- R-1 uses synthetic content only. No editor, Storage, Picture Book or R-2 work.
- Controlled service-role import must be atomic; authenticated clients receive no broad write grants.

## Schema / RPCs Added

- None yet.

## Files Changed

- This handoff and tasks/current-task.md: preflight state.

## Tests Already Passing

- None run for R-1.

## Known Failures

- None identified.

## Hosted DEV State

- Migrations applied: none for R-1.
- Synthetic records: none. Cleanup: not required.
- Project ref verification: not yet performed.

## Git State

- Committed and pushed: preflight checkpoint 2c3a7ab.
- Inspect git status for current uncommitted work. PR: none.

## Exact Next Action

1. Read remaining R-0 contract and relevant existing database patterns, then implement the R-1 foundation with focused policy and importer tests.
2. Validate local migration replay and tests before any hosted DEV mutation.

## Safety

development merged: NO
main changed: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
R-2 started: NO
Part 2 started: NO
