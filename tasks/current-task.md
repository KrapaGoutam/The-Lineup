# Tasks → History

Approved feature: add a read-only **History** tab to the Tasks module.
Plan / handoff: `docs/features/tasks-history.md`
Branch: `feature/tasks-history` (from `origin/development`)

## Implementation Checklist

- [x] Inspect Tasks module, schema and RLS (no DB change needed)
- [x] Pure domain logic + unit tests (`domain/task-history.ts`)
- [x] Read query, mapper and server action (`data/task-history-*.ts`, `getTaskHistoryAction`)
- [x] Controller `loadHistory` (real + demo)
- [x] `HistoryView` + tab in `TasksWorkspace`
- [x] Component tests and Playwright spec
- [x] `npm run check`, `npm run test`, `npm run build`
- [ ] Commit, push, PR to `development`, exact-head CI, merge commit

## Current State & Next Step

Implementation and local validation complete. Next: commit, push, open PR,
wait for CI on the exact head, merge with a merge commit.
