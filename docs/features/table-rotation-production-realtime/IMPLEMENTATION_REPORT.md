# #134 — Implementation report

Status: fix implemented and validated locally; PR / CI / merge state is recorded in the PR and `tasks/current-task.md`.

## Summary

Root cause: the production bundle inlines the hook's default `createClient`, giving the subscription effect a new dependency every render → resubscribe on every `router.refresh()`, a refetch loop and same-topic channel reuse races. Dev kept a stable identity, so the suite passed there. Fix: stable client ref, one channel per lifecycle, and no channel creation while a same-topic removal is pending. Details and evidence: `PLAN.md`, `TEST_MATRIX.md`.

## Files

- `src/features/allocation/hooks/use-board-realtime.ts` — fix.
- `src/features/allocation/hooks/use-board-realtime.test.ts` — +3 lifecycle tests, 1 adjusted for the deferred join.
- `src/features/allocation/hooks/use-board-realtime.hook.test.tsx` — new React-binding tests.
- Docs: this directory, `docs/ROADMAP.md`, `docs/STATUS.md`, `tasks/current-task.md`.

## Not done / follow-ups

- Hosted real-mode suites stay out of ordinary CI (DEV secrets); a protected CI job is already on the roadmap.
- #109 residuals untouched. PR #135 untouched. Tasks V1 untouched (still no Realtime; "Realtime invalidation for Tasks" remains a backlog item that can now be re-evaluated).
- Promotion `development → main` and PROD migrations are the owner's decision.
