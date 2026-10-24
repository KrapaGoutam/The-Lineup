# Current Task: Table Rotation V2 — Part 1 (Table Allocation Version Upgrade)

# Table Rotation V2 Part 1 — Agent Handoff

**Branch:** `upgrade/table-allocation-v2-part1` · **Base:** `origin/main` @ `3403058` · **HEAD:** see `git log -1`
**Docs:** `docs/features/table-rotation-multi-view/` — `VERSION_UPGRADE_PART1_PLAN.md` (status), `PART1_ACCEPTANCE_CRITERIA.md`, `PART1_TEST_MATRIX.md`, `PART1_IMPLEMENTATION_REPORT.md`. Roadmap/backlog: `docs/ROADMAP.md`.
**GitHub:** parent #101 · milestone #2 "Table Allocation V2 — Part 1" · Project #4 · phase issues 1A #103, 1B #102/#104/#105, 1C #107, 1D #129, 1E #108, 1F #110.
**DEV:** `opmujepkemwcdxxorhfd` · **PROD:** `ftadewtkjlaotfdvtjcv` · **PROD touched: NO** · **development merged: see PR** · **main merged: NO**

## Phase checklist

- [x] 1A Database integrity (D-02)
- [x] 1B Authorization + trusted mutations (D-01, D-08)
- [x] 1C Canonical read model
- [x] 1D Undo / Redo (D-05, D-06)
- [x] 1E Client / Realtime consistency (D-03, D-04, D-07)
- [x] 1F Real-mode validation (30 scenarios + extended A/B/C)
- [ ] CI green on the feature PR → merge (merge commit, not squash) into `development`
- [ ] Final `development` → `main` promotion — ONLY after explicit user approval

## Evidence (final gate)

hosted-DEV RPC suite 40/40 · browser suite 15/15 · pgTAP 25 files/387 assertions · `supabase db reset` 35 migrations · Vitest 428 · demo e2e (desktop) all pass · lint/typecheck/format/build pass · build output has no PROD ref.

## How to resume

- `NEON_DATABASE_URL=` must be blank for every DEV process.
- Browser suite: start `NEON_DATABASE_URL= npm run dev` (DEV env), then `npm run test:real:ui`; hosted RPC suite: `npm run test:real`; local DB: Docker Desktop + `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta,supavisor`, `npx supabase test db`.
- Demo e2e needs port 3000 free (stop any DEV dev server first, otherwise the DEV server is reused).
- Applied DEV migrations: `20261023100000_table_rotation_v2_session_integrity`, `20261023110000_table_rotation_v2_trusted_mutations` (recorded in `supabase_migrations.schema_migrations`). Do not edit them after merge.

## DO NOT

Touch PROD; merge to `main`; `git add .` / `git clean` / `git reset --hard`; commit `docs/testing/` (DEV credentials) or `The Lineup.code-workspace`; start Part 2.

## Remaining risks / backlog

See the report §5 and `docs/ROADMAP.md` (#106, Neon rotation, Picker takeover, hosted suites in CI, Part 2).
