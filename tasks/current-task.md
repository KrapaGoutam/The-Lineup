# Current Task Handoff

## Current cycle

Vendor Order Drafts V1 — **COMPLETE** (VOD-4 GO, 2026-10-27). Next product sequence: Tasks V1.1.

## Current phase

VOD-4 — Hosted DEV / Final Vendor Order Drafts Gate — **GO**. Closure PR #201 merged; this file is synced after the merge.

## Execution

Local Windows PC (Claude Sonnet 5.5). Hosted DEV only; PROD never targeted.

## Branch / base

- Final-gate branch: `feature/vendor-order-drafts-v1-final-gate` (renamed locally from `test/vendor-order-drafts-v1-final-gate`)
- Base development SHA: `6b8dcead804a3aa803b2e8e3eb1dfd2c4bf1660c`
- Defect fix: `fix/sent-history-past-end-page` — PR #200, tested head `652c7652c41ff24869e434525f21dd8209fb37f2`, merge commit `f3b0e0de27b95cdb05961450554cd23a021731f6` (exact-head CI green; merge commit)
- Final tested development SHA: `f3b0e0de27b95cdb05961450554cd23a021731f6`; the final-gate branch merged it in (no history rewrite)
- Issue: #190 · Project #4 · Milestone: Future Product Backlog

## Phase ledger

```text
Dependency #188 COMPLETE · Tasks Plan #189 COMPLETE · VOD-0 #191 COMPLETE
VOD-1 #193 COMPLETE (876be20) · VOD-1 docs #194 COMPLETE (34c7481)
VOD-1.1 #195 COMPLETE (tested fa3762b, merge f6bab25)
VOD-2 #196 COMPLETE (tested f6c3fd0, merge 292ca1a) · VOD-2 docs #197 COMPLETE (merge 75d6ae3)
VOD-3 #198 COMPLETE (tested 054355d, merge 64e3007) · VOD-3 docs #199 COMPLETE (merge 6b8dcea)
VOD-4 COMPLETE — GO · defect fix #200 (merge f3b0e0d) · closure #201 (tested 260ffe1, merge 3f6509b)
Tasks T-1 PARKED (feature/tasks-v1-1-default-landing @ 03d5d45, NO PR, NOT MERGED) · T-2..T-6 NOT STARTED
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## VOD-4 result (detail: IMPLEMENTATION_REPORT.md "VOD-4 — hosted DEV final gate", TEST_MATRIX.md "VOD-4 coverage")

- DEV `opmujepkemwcdxxorhfd` was 2 migrations behind (49 → 51); applied only `20261027195142` and `20261027210000` via the Management API + `schema_migrations` row (hard-coded DEV ref). PROD not touched.
- New hosted suites: `tests/real/bar-inventory-order-drafts.db.real.test.ts` (38/38) and `tests/real/ui/bar-inventory-order-drafts.real.spec.ts` (15/15, run twice).
- Demo Playwright order-drafts specs 20/20 on desktop, host-tablet WebKit, server-mobile; whole Bar Inventory regression 78 · 78 · 76 + 2 skips; pgTAP 40 files / 1,171 assertions; Vitest 114 files / 1,559; format, lint, typecheck, `next build` pass.
- Defect D1 (low): Sent-history page past the end returned null (PostgREST `PGRST103`). Fixed in #200.
- Intermittent, unrelated: `bar-inventory-realtime-access` failed twice right after the bulk insert, then passed 3/3.
- Not run (stated in the report): hosted browser spec on tablet/phone; Assistant Manager in a browser (no synthetic passcode user); Staff server-action call from a hosted browser; forged export id from a hosted browser; VOD-077 delivery-after-send on DEV.
- DEV footprint: two immutable Sent orders tagged `VOD4-1793147896144` and `VOD4-1793150815862` (with the vendors/products/categories they reference) in the `the-monks` org. Cannot be deleted by design. 26 `V2 Harness` orgs untouched.

## Tasks T-1 PARKED

Branch `feature/tasks-v1-1-default-landing`, commit `03d5d45`, PR none, merged NO. Untouched during VOD-4. A separate session may now reconcile and resume it.

## Safety ledger

```text
development merged: YES — fix PR #200 / f3b0e0d (merge commit); final-gate PR #201 / 3f6509b (merge commit, exact-head CI green)
main merged: NO
DEV touched: YES — two repository migrations applied; synthetic hosted test data; two immutable Sent orders left (see above)
PROD touched: NO
PROD migrations: NO
```

## Current State & Next Step

- [x] Branch renamed; HEAD == origin/development == 6b8dcea at start
- [x] DEV proven (ref `opmujepkemwcdxxorhfd`), migration parity 51/51
- [x] Hosted real DB + browser suites, browser matrix, pgTAP, repo gates
- [x] Defect D1 fixed and merged (#200)
- [x] Closure docs written (PLAN, TEST_MATRIX, IMPLEMENTATION_REPORT, ROADMAP, STATUS, backlog, this file)
- [x] Closure PR #201: tested head `260ffe1c4760e93233fa5c45e4fb7eb6a956556a` = local = remote = PR head = CI-tested SHA; merge commit `3f6509b770dd2a03ff73792cf179be9dc71fe982`
- [x] #190 commented with the gate summary and CLOSED; Project #4 card Status = Done; milestone stays Future Product Backlog (no completion semantics, nothing else reorganised)
- [x] This `docs/vod-4-post-merge-sync` PR records the final-gate PR number and merge SHA (docs only)

## Exact next command

```bash
git status --short && git log --oneline -3
```

## Read first

1. `tasks/current-task.md`
2. `docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md` (VOD-4 section)
3. `docs/features/bar-inventory-vendor-order-drafts-v1/TEST_MATRIX.md` (VOD-4 coverage)

## DO NOT

- Do not touch `main`, PROD, or the parked Tasks branch in this phase.
- Do not delete or modify hosted DEV product data (including V2 Harness orgs and the two Sent orders).
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
