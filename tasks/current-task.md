# Current Task: Table Rotation V2 — Part 1 (Table Allocation Version Upgrade)

# Table Rotation V2 Part 1 — Agent Handoff

**Branch:** `upgrade/table-allocation-v2-part1` · **Base:** `origin/main` @ `3403058` · **HEAD:** see `git log -1` (updated at each phase commit)
**Plan:** `docs/features/table-rotation-multi-view/VERSION_UPGRADE_PART1_PLAN.md` · **Criteria:** `PART1_ACCEPTANCE_CRITERIA.md` · **Matrix:** `PART1_TEST_MATRIX.md` · **Report:** `PART1_IMPLEMENTATION_REPORT.md` (same folder)
**GitHub:** parent #101, milestone "Table Allocation V2 — Part 1" (#2), Project #4. Phase issues: 1A #103, 1B #102/#104/#105, 1C #107, 1D (new), 1E #108, 1F #110.

**DEV project:** `opmujepkemwcdxxorhfd` · **PROD project:** `ftadewtkjlaotfdvtjcv` · **PROD touched:** NO · **Main merged:** NO · **Development merged:** NO

## Phase checklist

- [x] 1A Database integrity (D-02) — migrations applied to DEV; pgTAP + real-mode PASS
- [x] 1B Authorization + trusted mutations (D-01, D-08) — same migration pair
- [ ] 1C Canonical read model
- [x] 1D Undo / Redo (D-05, D-06) — same migration pair
- [ ] 1E Client / Realtime consistency (D-03, D-04, D-07) — in progress
- [ ] 1F Real-mode cross-view validation (30 scenarios + extended A/B/C)

## Completed

- Migrations created and **applied to DEV** (and recorded in `supabase_migrations.schema_migrations`):
  - `20261023100000_table_rotation_v2_session_integrity.sql`
  - `20261023110000_table_rotation_v2_trusted_mutations.sql`
- Verified from scratch locally: `npx supabase db reset` applies all 35 migrations; `npx supabase test db` → 25 files / 343 assertions PASS (new `0025`; updated 0006, 0007, 0013, 0014, 0019, 0021, 0024 for the RPC-only contract).
- Real-mode suite `npm run test:real` (hosted DEV, real JWTs, throw-away org/users per run) → 40/40 PASS.
- Docs: plan (living), acceptance criteria, test matrix created/updated.

## In progress / not started

- 1E client (uncommitted at the time of writing, see `git status`): `rotation-board.ts` (D-07 sparse-safe reducer, atomic-reassign + transfer-ends-source semantics, `getNextColumn`), `restaurant-operations-app.tsx` (D-04 keyed remount + pending sign-in state, no demo roster in real mode). Still to do: Realtime hook (D-03), read model (1C), workspace wiring, unit tests, browser validation.
- 1C: `domain/board-read-model.ts` + claims in `AllocationContext`.
- 1F: browser scenarios, `PART1_IMPLEMENTATION_REPORT.md`, final GitHub sync, final review.

## Files changed

See `git status` / `git log --stat`. Do not discard: both migrations, `supabase/tests/database/*`, `tests/real/**`, `vitest.real.config.ts`.

## Architecture decisions (summary — full text in the plan)

One physical table registry (`dining_tables`); one assignment model (entries = lifecycle, `section_assignments` = current claims); one session boundary (composite FKs); `board_*` RPCs are SECURITY DEFINER trusted functions (membership-only auth, session lock, derived historical lock); direct DML revoked; `board_events` append-only; atomic non-destructive reassign/transfer; remove-server blocked while tables are active.

## Environment / how to resume

- DEV-only. `LINEUP_SUPABASE_ACCESS_TOKEN` (user env) reaches the DEV Management API; scripts hard-code the DEV ref. Never print secrets.
- Blank `NEON_DATABASE_URL` for every server/test process (`NEON_DATABASE_URL= npx …`) — DEV holds the PROD Neon string.
- Local stack: Docker Desktop → `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta,supavisor`; `npx supabase test db`; `npx supabase db reset`. Stop with `npx supabase stop` when done (a separate JobQuest stack also runs in Docker — leave it).
- Apply a migration to DEV: POST the file (wrapped in begin/commit) to `/v1/projects/opmujepkemwcdxxorhfd/database/query`, then insert the version into `supabase_migrations.schema_migrations`. Forward-only; the pair above is unreleased so far, but do not edit them again once merged.

## Read first

1. `docs/features/table-rotation-multi-view/VERSION_UPGRADE_PART1_PLAN.md` (status table + decisions)
2. `docs/features/table-rotation-multi-view/PART1_TEST_MATRIX.md`
3. The two migrations above.

## Run first

1. `git status` · `git log --oneline -8`
2. `NEON_DATABASE_URL= npx vitest run src/features/allocation`
3. `NEON_DATABASE_URL= npm run test:real` (DEV, ~2 min)

## DO NOT

Touch PROD; merge to `main`/`development`; edit applied migrations after merge; `git add .` / `git clean` / `git reset --hard`; commit `docs/testing/` (it holds DEV credentials) or `The Lineup.code-workspace`.

## Known defects / open

- D-03, D-04, D-07 closed in code only after 1E lands and is browser-validated (matrix rows PENDING).
- #106 (`has_org_role` creator bypass) is intentionally outside the board path; documented as a remaining risk.
- Neon credential rotation is an operator task (DEV `NEON_DATABASE_URL` equals PROD's).
