# #134 Realtime Fix — Agent Handoff

Branch: `fix/table-rotation-production-realtime`
HEAD: see `git log -1` (fix commit + docs commit on top of the base)
Base development SHA: `93338b2` (Tasks V1 closeout merge, PR #146)

Phase:

- R1 ✅ reproduce — first production run failed S07 (manager never shows `Table T1, assigned to TestServer1`); `next dev` 14/14
- R2 ✅ root cause — see below and `docs/features/table-rotation-production-realtime/PLAN.md`
- R3 ✅ fix — `src/features/allocation/hooks/use-board-realtime.ts` (+ tests)
- R4 ✅ production-build validation — `next start` real UI 18/18, `next dev` 18/18
- R5 ✅ PR #147 → `development`, CI green on `bba051c`, merge commit `50fbd02`, #134 closed, Project #4 Done

Reproduction:

- next dev: PASS (14/14 unfixed, 18/18 fixed)
- next build + next start: unfixed FAIL once at S07, then 6 timing-dependent passes; fixed 18/18

Root cause: in the production bundle the hook's default `createClient` is inlined into an arrow created every render; it was an effect dependency, so each `router.refresh()` (triggered by every `SUBSCRIBED`) rebuilt the subscription — a refetch/resubscribe loop with same-topic channel reuse races (supabase-js returns the still-leaving registered channel for an identical topic). Dev keeps one identity, hence "dev passes". StrictMode is NOT the cause.

Fix approach: `createClient` in a ref (not a dependency); one channel per lifecycle (SIGNED_IN + getSession no longer double-subscribe); no channel creation while a same-topic removal is pending.

Files changed: `use-board-realtime.ts`, `use-board-realtime.test.ts`, new `use-board-realtime.hook.test.tsx`, `docs/features/table-rotation-production-realtime/*`, `docs/ROADMAP.md`, `docs/STATUS.md`, this file.
Uncommitted: nothing expected after the docs commit (untracked and never to be staged: `The Lineup.code-workspace`, `docs/testing/`).

Tests:

- unit: Vitest 491/491 (hook tests 13/13); lint, typecheck pass; format:check warns only on the untracked workspace file
- browser: demo-mode Playwright is CI's `browser-smoke` job (realtime is disabled in demo mode)
- production build: `next build` with DEV env passes; PROD ref absent from `.next`
- real-mode: `test:real:ui` 18/18 on `next start` and on `next dev`
- A/B/C: pass on both

DEV Supabase: `opmujepkemwcdxxorhfd` (hosted real suites only; synthetic data, board reset by the suite)
PROD Supabase: `ftadewtkjlaotfdvtjcv`
PROD ref found: NO

GitHub issue #134: milestone "Platform / CI Reliability" (#4), labels type:bug, module:table-allocation, priority:p1; Project #4 status set to In Progress when work started
Project #4: Done · Milestone "Platform / CI Reliability" stays open (other issues remain)
PR: #147 (`fix/table-rotation-production-realtime` → `development`), merged with a merge commit

Docs updated: feature docs (PLAN, ACCEPTANCE_CRITERIA, TEST_MATRIX, IMPLEMENTATION_REPORT), ROADMAP, STATUS, this file.

development merged: YES (`50fbd02`) · main merged: NO · DEV touched: YES (hosted real-mode suites) · PROD touched: NO

Running processes: none (dev/start servers on :3000 stopped).
Exact next command: none — #134 is complete.
Exact next task: owner decides `development → main` promotion (and PROD migration deploy) and the PR #135 Preview gate; optional next engineering item is #109 (not started).
Read first: `docs/features/table-rotation-production-realtime/PLAN.md`, `src/features/allocation/hooks/use-board-realtime.ts`.
DO NOT: merge to `main`, touch PROD or PR #135, start #109, add Realtime to Tasks, use `git add -A`, stage `docs/testing/` or `*.code-workspace`, raise Playwright timeouts, add `NODE_ENV` branches.

Local real-mode recipe (secrets never printed): pin DEV env in the process env (process env beats `.env.production.local`), blank `NEON_DATABASE_URL`, then `next build && next start` and `npx playwright test --config playwright.real.config.ts`; the suite's `assertServerIsDev` refuses a PROD-referencing bundle.
