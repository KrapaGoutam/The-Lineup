# Current Task Handoff

## Current cycle

Vendor Order Drafts V1

## Current phase

VOD-2 — Vendor Order Drafts UI + Editing — COMPLETE (merged). VOD-3 NEXT / NOT STARTED.

## Execution

Claude Code Cloud (GitHub/origin is the source of truth).

## Branch / base

- VOD-2 branch: `feature/bar-order-drafts-v1-ui` (merged; do not reuse)
- Base development SHA: `f6bab25bb6d613fb583d11b853c4807e1fa77941`
- VOD-2 exact tested head: `f6c3fd0fa8cffc954672d67fbbd998b5fdab0b8e`
- VOD-2 merge commit on `development`: `292ca1a12ad136ff25d7af57537533fbc3c61209` (PR #196, merge commit, merged by the owner after exact-head CI was green)
- This post-merge docs sync: branch `docs/vod2-post-merge-sync` from `292ca1a` (PR number in GitHub)
- Issue: #190 (stays OPEN)
- Project #4: update NOT PERFORMED — tool unavailable in Cloud. Handoff item: set Project #4 to reflect VOD-2 complete / VOD-3 next if tooling exists. Milestone unchanged: Future Product Backlog.

## Phase ledger

```text
Dependency #188 COMPLETE · Tasks Plan #189 COMPLETE · VOD-0 #191 COMPLETE
VOD-1 #193 COMPLETE (876be20) · VOD-1 docs #194 COMPLETE (34c7481)
VOD-1.1 #195 COMPLETE (tested fa3762b, merge f6bab25)
VOD-2 #196 COMPLETE (tested f6c3fd0, merge 292ca1a)
VOD-3 NEXT / NOT STARTED · VOD-4 NOT STARTED
Tasks T-1 PARKED (feature/tasks-v1-1-default-landing @ 03d5d45, NO PR, NOT MERGED) · T-2..T-6 NOT STARTED
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## VOD-1.1 correction (reuse, do not redo)

`#195` · `fa3762b` · `f6bab25`. `inventory_order_draft_save` now parses each line's Order Qty before comparing it with stored state, so quantity-only edits persist. Regression pgTAP `0040` (50 assertions). There is NO client workaround; none may be introduced.

## VOD-2 delivered (summary; detail in IMPLEMENTATION_REPORT.md "VOD-2 UI delivered")

Order Drafts tab; active vendor drafts (Create/Open from the picker and Dashboard Order soon); read-only Suggested Order beside Order Qty; item and vendor notes (newlines kept); Include/Exclude; Fill from Suggestions (empty-only / confirmed replace-all); Update suggestions; Clear Draft; suggested/planned totals and manual-quantity count; explicit sparse Save; PT409 UI (Reload latest / Keep my edits on the latest); unsaved-edit guard; demo-mode engine; responsive + accessible layout. No migration. No VOD-3 feature was pre-coded.

- UI architecture / data layer: `domain/order-draft-view.ts`, `domain/order-draft-demo.ts`, `domain/db-conflict.ts`, `data/order-draft-data.ts`, `actions/order-draft-actions.ts`, `hooks/use-order-drafts.ts`, `components/order-drafts-view.tsx`, `components/order-draft-editor.tsx`, CTA in `components/order-soon.tsx`, tab + guard in `components/inventory-module.tsx`.
- Tests: Vitest 109 files / 1492 tests; new spec `tests/e2e/bar-inventory-order-drafts.spec.ts`; `BI-NAV-001` updated for the fourth tab.
- CI on `f6c3fd0` (run 40594938733): application success, browser-smoke success (CI runs the `desktop` project only), Vercel success; database workflow path-gated / not required.

## Known issues / gaps for VOD-4

- host-tablet (WebKit) Playwright was NOT RUN for VOD-2 (no WebKit in Cloud, CI runs desktop only); server-mobile ran locally only. VOD-4 must run both on a machine with the browsers.
- Real-database behaviour of the new Server Actions (RLS, two-context PT409) is untested until VOD-4 (hosted DEV); pgTAP 0039/0040 cover the RPCs.
- Not guarded: leaving Bar Inventory entirely with unsaved draft edits (only `beforeunload`). No "Add item" UI. No Realtime for drafts. All recorded in `tasks/backlog.md`.
- `next dev` rewrites the `AGENTS.md` heading (`#` → `##`); never commit that change (`git checkout AGENTS.md`).
- I stated in the PR body and the #190 comment that GitHub CI is authoritative for host-tablet; CI actually runs `desktop` only (corrected in docs).

## Backlog

Updated in VOD-2 (deferrals above) and in this sync (VOD-4 browser-project requirement).

## Tasks T-1 PARKED

Branch `feature/tasks-v1-1-default-landing`, commit `03d5d45`, PR none, merged NO. Do not resume until VOD-4 completes.

## Safety ledger

```text
development merged: YES — VOD-2 PR #196 / 292ca1a (merge commit)
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## Uncommitted files

None after the docs-sync commit.

## Running processes

None.

## Exact next command

```bash
git fetch origin && git rev-parse origin/development
```

## Exact next action

STOP. VOD-2 is complete. VOD-3 (Drafts | Sent switch, Copy Order, CSV, XLSX, Mark Sent, Sent history) starts in a FRESH session from the updated `development`: create `feature/bar-order-drafts-v1-sharing-history`, re-read the five VOD docs, and keep Tasks T-1 parked. Do not start VOD-3 in this session.

## Read first

1. `tasks/current-task.md`
2. `docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md`
3. `docs/features/bar-inventory-vendor-order-drafts-v1/ACCEPTANCE_CRITERIA.md`
4. `docs/features/bar-inventory-vendor-order-drafts-v1/TEST_MATRIX.md`
5. `docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md`

## DO NOT

- Do not touch `main`, PROD, or the parked Tasks branch.
- Do not delete or modify hosted DEV product data (including V2 Harness orgs).
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
