# Current Task Handoff

## Current cycle

Vendor Order Drafts V1

## Current phase

VOD-3 — Sharing / Export / Mark Sent / Sent History — IMPLEMENTED, PR into `development` pending exact-head CI. VOD-2 COMPLETE. VOD-4 NOT STARTED.

## Execution

Claude Code Cloud (GitHub/origin is the source of truth).

## Branch / base

- VOD-3 branch: `feature/bar-order-drafts-v1-sharing-history`
- Base development SHA: `75d6ae35cfdfda1ba53d4994b067e12b241c9291`
- Implementation PR: see GitHub (opened after this commit); merge commit only after exact-head CI is green
- Issue: #190 (stays OPEN until VOD-4 passes)
- Project #4: update NOT PERFORMED — Projects tool unavailable. Milestone unchanged: Future Product Backlog.

## Phase ledger

```text
Dependency #188 COMPLETE · Tasks Plan #189 COMPLETE · VOD-0 #191 COMPLETE
VOD-1 #193 COMPLETE (876be20) · VOD-1 docs #194 COMPLETE (34c7481)
VOD-1.1 #195 COMPLETE (tested fa3762b, merge f6bab25)
VOD-2 #196 COMPLETE (tested f6c3fd0, merge 292ca1a) · VOD-2 docs #197 COMPLETE (merge 75d6ae3)
VOD-3 IMPLEMENTED — PR pending exact-head CI / merge · VOD-4 NOT STARTED
Tasks T-1 PARKED (feature/tasks-v1-1-default-landing @ 03d5d45, NO PR, NOT MERGED) · T-2..T-6 NOT STARTED
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## VOD-3 delivered (detail in IMPLEMENTATION_REPORT.md "VOD-3 sharing delivered")

- Copy Order + clipboard fallback: `domain/order-draft-share.ts`, `components/order-draft-share.tsx`.
- Export: new `ExportRequest` kind `order_draft` (draftId only) through `exportDataAction` / `prepareExport`; CSV = Order sheet, XLSX = Order + Summary; existing formula guard.
- Mark Sent: `markOrderDraftSentAction` (reviewed version, PT409, idempotent), dialog in `order-draft-editor.tsx`, demo twin `markSentDemo`.
- Drafts | Sent switch + paged (20/page, exact count) newest-first Sent list + read-only Sent order: `order-drafts-view.tsx`, `order-draft-sent.tsx`, `data/order-draft-data.ts`, `domain/order-draft-sent.ts`.
- No migration; no `supabase/**` change (database workflow path-gated / not required).
- Tests: Vitest 114 files / 1557 tests; new Playwright spec `tests/e2e/bar-inventory-order-drafts-sharing.spec.ts` (desktop 11/11, server-mobile 11/11); all bar-inventory specs desktop 77/77, server-mobile 75 + 2 intentional skips.

## Known issues / gaps for VOD-4

- host-tablet (WebKit) Playwright has NOT RUN for VOD-2 or VOD-3 (no WebKit in Cloud; CI runs desktop only). Chromium with the iPad viewport passed 19/19 as a supplemental, non-WebKit check. VOD-4 must run host-tablet and server-mobile on a machine with the browsers.
- Real-database behaviour (RLS for Sent reads and the order export, two-context Mark Sent PT409, no inventory mutation against the real ledger, rename/archive after send in a real browser, paging beyond one real page) is untested until VOD-4 (hosted DEV). pgTAP 0039/0040 cover the RPCs.
- Not built (backlog): "Add item" UI, in-app guard for leaving Bar Inventory entirely with unsaved draft edits, Realtime for drafts, export audit log (AC-EXP-4, owner decision pending).
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).

## Tasks T-1 PARKED

Branch `feature/tasks-v1-1-default-landing`, commit `03d5d45`, PR none, merged NO. Do not resume until VOD-4 completes.

## Safety ledger

```text
development merged: NO for VOD-3 yet (PR pending) — VOD-2 #196 / 292ca1a and docs #197 / 75d6ae3 are merged
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## Uncommitted files

None after the VOD-3 commit.

## Running processes

None.

## Exact next command

```bash
git fetch origin && git rev-parse origin/development origin/feature/bar-order-drafts-v1-sharing-history
```

## Exact next action

Verify exact-head CI on the VOD-3 PR (local head = remote head = PR head = CI-tested SHA), fix only real failures, merge with a MERGE COMMIT (no squash / rebase), then record the merge SHA in a small `docs/vod-3-post-merge-sync` PR if needed and STOP. Do not start VOD-4 or Tasks T-1 in this session.

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
