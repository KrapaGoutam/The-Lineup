# Current Task: Table Rotation V2 — Part 1 (Table Allocation Version Upgrade)

# Table Rotation V2 Part 1 — Agent Handoff

**Branch:** `docs/table-rotation-v2-part1-closeout` (from `origin/development`) · feature branch `upgrade/table-allocation-v2-part1` HEAD `c3cd7ab` (merged) · **development HEAD:** `589b470` (merge of PR #131)
**Docs:** `docs/features/table-rotation-multi-view/` — `VERSION_UPGRADE_PART1_PLAN.md` (status), `PART1_ACCEPTANCE_CRITERIA.md`, `PART1_TEST_MATRIX.md`, `PART1_IMPLEMENTATION_REPORT.md`. Roadmap/backlog: `docs/ROADMAP.md`.
**GitHub:** parent #101 · milestone #2 "Table Allocation V2 — Part 1" · Project #4 · phase issues 1A #103, 1B #102/#104/#105, 1C #107, 1D #129, 1E #108, 1F #110.
**DEV:** `opmujepkemwcdxxorhfd` · **PROD:** `ftadewtkjlaotfdvtjcv` · **PROD touched: NO** · **development merged: NO (PR #131 open; `development` was created from `origin/main` @ 3403058)** · **main merged: NO**

## Phase checklist

- [x] 1A Database integrity (D-02)
- [x] 1B Authorization + trusted mutations (D-01, D-08)
- [x] 1C Canonical read model
- [x] 1D Undo / Redo (D-05, D-06)
- [x] 1E Client / Realtime consistency (D-03, D-04, D-07)
- [x] 1F Real-mode validation (30 scenarios + extended A/B/C)
- [x] PR #131 merged into `development` as merge commit `589b47003a417ad581341ca647eee79997869dce` (not squashed). CI: `application`, `browser-smoke`, Vercel pass; `Database / migrations-and-policies` failed 4× at `supabase start` with registry `toomanyrequests: Data limit exceeded` before `db:reset`/`db:test` ran — **owner-approved exception for PR #131 only; not a general red-CI bypass.** Independent evidence: 35 migrations clean, pgTAP 25 files/387, hosted DEV RPC/RLS 40/40, browser 15/15, Vitest 428, lint/typecheck/format/build pass.
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

## Processes

The DEV dev server and the local Supabase containers were stopped. Docker Desktop was started by the agent and left running (JobQuest containers are unrelated; do not stop them).

## Closeout session (2026-10-24) — state

- PR #131: head `c3cd7ab`, base `development`, OPEN, mergeable. Checks: application ✔, browser-smoke ✔, Vercel ✔, **Database ✘ (external)** — runs 40068611675 / 40068064898 / 40067458926 fail only at `supabase start` with `toomanyrequests: Data limit exceeded`; `db:reset`/`db:test` skipped. **Do not merge until green or the owner explicitly accepts the exception.** **Retry #4 (2026-10-24, attempt 2 of run 40068611675, job https://github.com/KrapaGoutam/The-Lineup/actions/runs/40068611675/job/120801565656): same `toomanyrequests: Data limit exceeded` at `supabase start` (postgrest/kong/postgres/gotrue pulls); `db:reset`/`db:test` did not run. Fourth consistent external failure; no further retries per policy. Preview verified demo-only (`NEXT_PUBLIC_DEMO_MODE` only, no PROD ref). Nothing merged; issues/Project/Milestone untouched; main and PROD untouched.** Next: owner decides — approve the infra exception (then merge PR #131 with a merge commit and run the post-merge issue/Project/Milestone reconciliation) or wait/add registry auth and re-run.
- Preview isolation PASS: Supabase/PIN/Neon vars are scoped to Production only; Preview has just `NEXT_PUBLIC_DEMO_MODE` (demo mode, no DB, cannot reach PROD).
- PR body corrected to 387 assertions.
- Tracking: #106 deferred → "Future Product Backlog" (open); #111–#114 deferred → "Platform / CI Reliability" (open); #109 partially satisfied (open; residual items in its comment — owner decision needed); #101/#102–#105/#107/#108/#110/#129 to close after merge. Project #4: Review (not Done) until merge. Milestone #2 open.
- Not done: merge, post-merge verification, docs closeout PR, closing issues, milestone close. `main` unchanged @ 3403058; PROD untouched; migrations not applied to PROD.

## Closeout state (2026-10-24)

- **development merged: YES** (`589b47003a417ad581341ca647eee79997869dce`) · **main merged: NO** · **DEV touched: YES (earlier validation only; no changes this session)** · **PROD touched: NO**; no Production migration/deploy workflow ran.
- Issues closed as completed: #101–#105, #107, #108, #110, #129 (Project #4 → Done). Deferred (open): #106, #109 (moved to Future Product Backlog milestone; Project Backlog), #111–#114 (Platform / CI Reliability). Milestone #2 closed.
- Preview is demo-only (`NEXT_PUBLIC_DEMO_MODE` only); no PROD reference.
- **Next action:** merge this docs PR into `development`. Then `development → main` awaits explicit owner approval (a push to `main` runs the production migration push; resolve #111/#113 first). Next infra: Preview → Supabase DEV; Database CI registry reliability. Next product: Tasks V1.
