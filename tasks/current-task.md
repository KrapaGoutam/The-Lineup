# Current Task Handoff

## Current cycle

Tasks V1.1 — **T-1 COMPLETE** (default Tasks landing + `?tab=` navigation). **T-2 (Management Today) is NEXT / NOT STARTED.** Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Current phase

T-1 — Default landing + `?tab=` navigation reconciliation (#169). Reconciled the parked branch with current `development` (`66d8fc6`) and closed three contract gaps (URL/UI mismatch, a back/forward race, missing tests). Detail: `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md`.

## Execution

Local Windows PC (Claude Sonnet 5.5). No database, no hosted DEV, no migration. PROD never targeted.

## Branch / base

- Branch: `feature/tasks-v1-1-default-landing` (parked commit `03d5d45` preserved; `origin/development` @ `66d8fc6` merged in, no conflicts)
- PR / tested SHA / merge SHA: recorded in the post-merge sync PR (see Phase ledger)
- Issue: #169 · Project #4

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (feature/tasks-v1-1-default-landing; PR + merge SHA in sync PR)
Tasks T-2 NEXT / NOT STARTED · T-3..T-6 NOT STARTED
Part 2 (multi-org / multi-location / attendance) ON HOLD
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## T-1 result

- Contract: `/` -> Tasks Today; `?tab=tasks|allocation|schedule|bar-inventory|...` selects the module; `/r/<slug>?tab=` keeps the restaurant route; missing or invalid tab -> Tasks Today (URL corrected in place with `replaceState`); a module the role cannot open falls back to Tasks (UX only; the server still enforces access).
- Defect found and fixed: a fast Back could land before `useSearchParams` caught up and leave the UI on a module the URL no longer named (2 of 6 on host-tablet WebKit); now a `popstate` listener reads the real location. 60/60 with `--retries=0 --repeat-each=10` on all three projects afterwards.
- Evidence: Vitest 1568/1568; `default-landing.spec.ts` 33/33; navigation-sensitive regression 243/243 on desktop, host-tablet, server-mobile; check and build pass. Full Playwright suite left to exact-head CI.
- Not changed: Vendor Order Drafts, the brand "Home" and Settings "Back" (still Table Allocation, by design).

## Current State & Next Step

- [x] Parked T-1 classified (still required / safe to preserve), `origin/development` merged in, no conflicts
- [x] URL/UI mismatch, popstate race and test gaps closed
- [x] Local gates green (check, Vitest, build, targeted Playwright x3 projects)
- [ ] PR -> `development`, exact-head CI, merge commit (see Phase ledger / sync PR)
- [ ] T-2 in a NEW session: `feature/tasks-v1-1-management-today` from the then-current `origin/development`

## Exact next command

```bash
git fetch origin && git log --oneline -5 origin/development
```

## Read first

1. `tasks/current-task.md`
2. `docs/features/tasks-v1-1/PLAN.md` (D-2, phase table) and `TEST_MATRIX.md` (TS-010..TS-017)
3. `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-1)

## DO NOT

- Do not start T-2 in this session; do not start Part 2.
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
