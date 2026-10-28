# Current Task Handoff

## Current cycle

Tasks V1.1 — **T-1 COMPLETE**. **T-2 (Management Today, #169) IN PROGRESS.** T-3 NOT STARTED · Part 2 ON HOLD · `main` UNTOUCHED · PROD UNTOUCHED. Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Current phase

T-2 — Management Today / staff visibility (#169). Branch `feature/tasks-v1-1-management-today` from `origin/development` @ `c6f309eae5c674e71b3906ff1b26faae0440ca22` (verified = expected T-1 post-merge docs state). Scope: All Staff / My Tasks / specific staff member for Owner, Manager, Assistant Manager; Staff gets no control and no coworker data (RLS stays the gate). No migration expected.

## Execution

Claude Code Cloud (Sonnet 5.5, high effort, new session). No hosted DEV, no migration. PROD never targeted.

## Branch / base

- Branch: `feature/tasks-v1-1-management-today` from `origin/development` @ `c6f309eae5c674e71b3906ff1b26faae0440ca22` (T-1 post-merge docs state)
- T-1 (done): PR #203 tested `1e3e4b1`, merge `cf3ae39`; docs PR #204, merge `c6f309e`
- Issue: #169 (tracking) · Project #4 (card update not performed: Projects tooling unavailable in this session)
- T-3: NOT STARTED · Part 2: ON HOLD · `main`: UNTOUCHED · PROD: UNTOUCHED

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (PR #203, tested 1e3e4b1, merge cf3ae39)
Tasks T-2 IN PROGRESS: implemented + validated locally, PR/CI/merge pending
Tasks T-3..T-6 NOT STARTED
Part 2 (multi-org / multi-location / attendance) ON HOLD
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## T-2 result (local, pre-PR)

- Management Today: `Show tasks for` select (All Staff / My Tasks / person by profile id) for Owner, Manager, Assistant Manager; Opening / General / Closing groups; staff name on each row; staff unchanged. Detail: `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-2).
- Evidence: Vitest 1586/1586; `management-today.spec.ts` 7/7 on desktop and server-mobile; Tasks + default-landing + dashboard regression 57/57 desktop, server-mobile and Chromium-emulated iPad; check, build and the empty-Supabase-env build green. WebKit (host-tablet) not installable here: left to CI.

## Current State & Next Step

- [x] `origin/development` verified = `c6f309e`; branch created
- [x] Implementation, unit/component and Playwright tests, local gates, docs
- [ ] Commit explicit paths, push, PR -> `development`, exact-head CI (branch HEAD = remote = PR head = CI-tested SHA), MERGE COMMIT
- [ ] Post-merge sync PR `docs/tasks-v1-1-t2-post-merge-sync` (merge SHA), then T-3 in a NEW session

## T-1 result

- Contract: `/` -> Tasks Today; `?tab=tasks|allocation|schedule|bar-inventory|...` selects the module; `/r/<slug>?tab=` keeps the restaurant route; missing or invalid tab -> Tasks Today (URL corrected in place with `replaceState`); a module the role cannot open falls back to Tasks (UX only; the server still enforces access).
- Defect found and fixed: a fast Back could land before `useSearchParams` caught up and leave the UI on a module the URL no longer named (2 of 6 on host-tablet WebKit); now a `popstate` listener reads the real location. 60/60 with `--retries=0 --repeat-each=10` on all three projects afterwards.
- Evidence: Vitest 1568/1568; `default-landing.spec.ts` 33/33; navigation-sensitive regression 243/243 on desktop, host-tablet, server-mobile; check and build pass. Full Playwright suite left to exact-head CI.
- Not changed: Vendor Order Drafts, the brand "Home" and Settings "Back" (still Table Allocation, by design).

## Exact next command

```bash
git fetch origin && git status -sb && gh pr list --head feature/tasks-v1-1-management-today
```

## Read first

1. `tasks/current-task.md`
2. `docs/features/tasks-v1-1/PLAN.md` (D-2, phase table) and `TEST_MATRIX.md` (TS-010..TS-017)
3. `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-1)

## DO NOT

- Before pushing any phase, run `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` too: CI has no env files, so `/` is prerendered statically there but dynamic with the local `.env.development.local`.
- Do not start Part 2; T-2 only in a new session.
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
