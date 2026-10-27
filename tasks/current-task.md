# Current Task Handoff

## Current cycle

Vendor Order Drafts V1

## Current phase

VOD-2 — Vendor Order Drafts UI + Editing — IN PROGRESS

## Execution

Claude Code Cloud (GitHub/origin is the source of truth; nothing relies on a local Windows checkout).

## Branch / base

- Branch: `feature/bar-order-drafts-v1-ui`
- Base development SHA: `f6bab25bb6d613fb583d11b853c4807e1fa77941` (verified `origin/development`; ancestry verified before editing)
- HEAD: see `git rev-parse HEAD` (updated after each commit)
- Issue: #190 (stays OPEN)
- PR: not opened yet
- Project #4: Status `In Progress`, Phase `Implementation`, Priority `P2`, Version `Future`, Work Type `Feature`
- Milestone: Future Product Backlog (unchanged)

## Phase ledger

```text
VOD-1.1:            COMPLETE
PR:                 #195
tested head:        fa3762ba0b7e214b9633c0a37a2e4feedbed6f18
merge:              f6bab25bb6d613fb583d11b853c4807e1fa77941
development base for VOD-2: f6bab25bb6d613fb583d11b853c4807e1fa77941

VOD-0 #191 COMPLETE · VOD-1 #193 COMPLETE (merge 876be20) · VOD-1 docs #194 COMPLETE (34c7481)
VOD-2:              IN PROGRESS
VOD-3:              NOT STARTED
VOD-4:              NOT STARTED
Tasks T-1:          PARKED   Tasks T-2..T-6: NOT STARTED
Final Development Gate: NOT STARTED
```

## VOD-1.1 correction (reuse, do not redo)

`#195` · `fa3762b` · `f6bab25`. `inventory_order_draft_save` now parses each line's Order Qty before comparing it with stored state, so quantity-only edits persist. Regression pgTAP `0040` (50 assertions). There is NO client workaround; none may be introduced.

## VOD-2 locked scope

Implement: Order Drafts tab (Dashboard · Inventory · Order Drafts · Manage), active vendor draft list/create/open, active draft editor, read-only Suggested Order, Order Qty editing, item note, vendor note, include/exclude, Fill from Suggestions, Clear Draft, Update suggestions (PLAN D-VOD-4), suggested/planned totals + manual-quantity indicator, Dashboard Order Soon "Create Order Draft"/"Open Order Draft" CTA, loading/empty/error states, PT409 conflict UI with Reload latest, desktop/host-tablet/server-mobile responsive layout, accessibility, demo-mode engine.

NOT in VOD-2 (VOD-3): Drafts | Sent switch, Mark Sent, Copy Order, CSV, XLSX, Sent history. Do not pre-code them.

No database migration is expected. If a backend defect blocks correct UI: STOP, report it, do not work around it in the client.

## Completed

- [x] Fetched origin; `origin/development` = `f6bab25`.
- [x] Read handoff + PLAN / ACCEPTANCE_CRITERIA / TEST_MATRIX / IMPLEMENTATION_REPORT.
- [x] Created `feature/bar-order-drafts-v1-ui` from `origin/development`.
- [x] `npm ci` (node_modules present in the Cloud VM).
- [x] First handoff update (this file).

## In progress

- [x] Inspect targeted Bar Inventory patterns.
- [x] Pure domain `order-draft-view.ts` + demo engine `order-draft-demo.ts` + unit tests (39 tests green).
- [x] Server data/actions, `use-order-drafts` hook, editor, view, Order soon CTA, module tab + dirty guard (typecheck + eslint clean).
- [ ] Component tests (editor / conflict / view / CTA) and Playwright spec.

## Not started

- [x] Unit tests (domain / demo engine / payload builder).
- [ ] Component tests (editor, conflict UI, view, CTA).
- [ ] Playwright (`tests/e2e/bar-inventory-order-drafts.spec.ts`) on desktop, host-tablet, server-mobile.
- [ ] `npm run check`, `npm run test`, `npm run build`.
- [ ] Commit, push, PR to `development`, exact-head CI, merge commit, sync docs/GitHub.

## UI architecture

- New tab `Order Drafts` between Inventory and Manage in `components/inventory-module.tsx` (`View` gains `"drafts"`).
- Pure domain: `domain/order-draft-view.ts` (view types, qty text parsing, sparse save payload builder, eligibility) and `domain/order-draft-demo.ts` (in-memory engine mirroring the six RPCs; demo state lives on `CatalogState.orderDrafts`).
- Server: `data/order-draft-data.ts` (paged RLS reads), `actions/order-draft-actions.ts` (list/open/save/fill/clear/sync; each returns the authoritative active-drafts list).
- Client: `hooks/use-order-drafts.ts` (one controller; demo → engine, real → actions), `components/order-drafts-view.tsx`, `components/order-draft-editor.tsx`, CTA in `components/order-soon.tsx`.

## Data/RPC layer

Reads go through the caller's RLS (SELECT-only). Writes go ONLY through the six `inventory_order_draft_*` RPCs via server actions. After every mutation the action re-reads the active drafts and returns them (database truth → canonical state). No client-side persisted state.

## Save strategy

Explicit Save/Discard (no per-keystroke RPC). One sparse `save` carrying only changed lines + vendor note. Fill/Clear/Update suggestions are separate confirmed RPCs and are blocked while unsaved edits exist (save or discard first). States shown: clean, dirty, saving, saved (only after a successful response), error, conflict.

## PT409 handling

A stale write shows an inline alert ("This order draft changed elsewhere…") and keeps typed edits. Actions: **Reload latest** (discard my edits, load server version) and **Keep my edits on latest** (load server version, keep unsaved edits for review — never auto-saved). Same-person stale reloads quietly.

## Responsive behavior

One DOM, CSS grid rows: stacked card-like rows on phone, aligned columns from `md`. No horizontal page scroll; touch targets ≥ 44 px (existing `min-h-11` primitives).

## Tests

- Unit: `order-draft-view.test.ts` (21) and `order-draft-demo.test.ts` (18) PASS, including quantity-only blank→5, blank→0, 5→blank, same-value no-op, stale PT409 shape, fill/clear/sync.
- Component + Playwright: pending.

## CI

Pending.

## GitHub tracking

Issue #190 open; Project #4 / milestone to be verified after PR (tooling availability recorded at that time).

## Docs

To update at completion: `PLAN.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_REPORT.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `tasks/backlog.md` (only if something changed), this file.

## Backlog

No change yet.

## Known issues

- Cloud VM has no Docker/Supabase/hosted credentials: pgTAP and `tests/real` are NOT RUN here; GitHub CI is authoritative. No migration is part of this phase.

## Uncommitted files

See `git status`; the first checkpoint commit contains the domain, server, hook and UI files.

## Running processes

None.

## Safety ledger

```text
development merged: NO (this phase not merged yet)
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
Tasks T-1 PARKED: feature/tasks-v1-1-default-landing @ 03d5d45, NO PR, NOT MERGED
```

## Exact next command

```bash
git status --short --branch
```

## Exact next action

Write component tests for `OrderDraftEditor` (conflict banner, Reload latest, Keep my edits, qty-only save, validation errors, fill/clear dialogs) and `OrderDraftsView`, then `tests/e2e/bar-inventory-order-drafts.spec.ts` (demo mode, 3 projects), then run `npm run check`, `npm run test`, `npm run build`.

## Read first

1. `tasks/current-task.md`
2. `docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md`
3. `docs/features/bar-inventory-vendor-order-drafts-v1/ACCEPTANCE_CRITERIA.md`
4. `docs/features/bar-inventory-vendor-order-drafts-v1/TEST_MATRIX.md`
5. `docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md`

## DO NOT

- Do not touch `main`, PROD, or the parked Tasks branch (`feature/tasks-v1-1-default-landing`).
- Do not start VOD-3, create its branch, or implement Copy/CSV/XLSX/Mark Sent/Sent history.
- Do not delete or modify hosted DEV product data (including V2 Harness orgs).
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
