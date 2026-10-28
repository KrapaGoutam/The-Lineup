# Current Task Handoff

## Current cycle

Vendor Order Drafts V1

## Current phase

VOD-4 — Hosted DEV / Final Vendor Order Drafts Gate — IN PROGRESS (VOD-3 COMPLETE, merged).

## Execution

Local Windows PC (Claude Sonnet 5.5). Hosted DEV only; PROD forbidden.

## Branch / base

- VOD-4 branch: `feature/vendor-order-drafts-v1-final-gate` (renamed locally from `test/vendor-order-drafts-v1-final-gate`; no commits of its own)
- VOD-4 base development SHA: `6b8dcead804a3aa803b2e8e3eb1dfd2c4bf1660c` (= origin/development)
- Tasks T-1 PARKED at `03d5d45`; main UNTOUCHED; PROD UNTOUCHED

- VOD-3 branch: `feature/bar-order-drafts-v1-sharing-history`
- Base development SHA: `75d6ae35cfdfda1ba53d4994b067e12b241c9291`
- Implementation PR: #198 — exact tested head `054355ddd4c049812965cb9d27424a396c3d7667`, merge commit `64e3007457c67a1506997dd98c3d2c778f3ca165` (merge commit method, exact-head CI green)
- Post-merge docs sync: branch `docs/vod-3-post-merge-sync` from `64e3007` (PR number in GitHub)
- Issue: #190 (stays OPEN until VOD-4 passes)
- Project #4: update NOT PERFORMED — Projects tool unavailable. Milestone unchanged: Future Product Backlog.

## Phase ledger

```text
Dependency #188 COMPLETE · Tasks Plan #189 COMPLETE · VOD-0 #191 COMPLETE
VOD-1 #193 COMPLETE (876be20) · VOD-1 docs #194 COMPLETE (34c7481)
VOD-1.1 #195 COMPLETE (tested fa3762b, merge f6bab25)
VOD-2 #196 COMPLETE (tested f6c3fd0, merge 292ca1a) · VOD-2 docs #197 COMPLETE (merge 75d6ae3)
VOD-3 #198 COMPLETE (tested 054355d, merge 64e3007) · VOD-4 NEXT / NOT STARTED
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
development merged: YES — VOD-3 PR #198 / 64e3007 (merge commit); VOD-2 #196 / 292ca1a and docs #197 / 75d6ae3 earlier
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

## Current State & Next Step (VOD-4)

- [x] Branch renamed, HEAD == origin/development == 6b8dcea, tree clean
- [x] Prove DEV target: `.env.development.local` -> ref `opmujepkemwcdxxorhfd` (DEV); PROD ref `ftadewtkjlaotfdvtjcv` is only in `.env.production.local`; harness hard-aborts on anything but DEV
- [x] DEV migration parity: BEFORE 49 migrations (latest 20261027130000, no order-draft tables). APPLIED to DEV via Management API + schema*migrations row (repo precedent): 20261027195142_bar_inventory_order_drafts, 20261027210000_bar_inventory_order_draft_save_order_qty_fix. AFTER 51/51, latest 20261027210000, 6 `inventory_order_draft*\*` RPCs present. PROD untouched.
- [x] Wrote hosted real DB test `tests/real/bar-inventory-order-drafts.db.real.test.ts` (38 tests, disposable harness org, real JWTs, role matrix, RLS, PT409 two-context, Mark Sent stock/ledger isolation, immutability, retry, new draft, frozen labels, real data layer paging past 1,000 rows). Run 2: 36/38 passed.
- DEFECT D1 (real, found by hosted run): `getSentOrderDraftsPage` returns null for a page past the end because PostgREST answers an out-of-range offset with PGRST103 (416), not an empty page; the clamp branch only handles empty data. Unit fake never produced PGRST103. Needs `fix/sent-history-past-end-page` from origin/development: failing-first unit test + clamp via head count. Severity low (Sent history never shrinks; only stale/crafted page numbers). Keep the failing real assertion until fixed.
- (test-expectation bugs fixed, NOT product defects: 1e9 is a valid Order Qty — cap is 9,999,999,999.99; summary arithmetic)
- [x] VOD demo-mode Playwright (bar-inventory-order-drafts + -sharing, 20 tests each project, --workers=2): desktop 20/20, host-tablet (WebKit 26.6, build 2359 already installed) 20/20, server-mobile 20/20
- [x] Hosted real UI spec `tests/real/ui/bar-inventory-order-drafts.real.spec.ts` on a DEV-pinned PRODUCTION build (0 PROD-ref matches in .next): 15/15 PASS (desktop Chromium; Owner + Manager + Staff contexts; real import seed, concurrent Create -> 1 draft, qty-only blank->5->6->0->blank across real reloads, notes/Include, Clear/Fill/Update suggestions, two-window PT409 + Keep my edits, stale Mark Sent refused, Copy/CSV/XLSX + formula neutralisation, Mark Sent no stock/ledger change, Chicago time, idempotent retry, Sent immutable, Sent list/detail, new draft, rename after Sent frozen, Sent exports). Left in DEV the-monks: ONE immutable Sent order tagged `VOD4-1793147764614` + its vendor/2 products/1 category/1 subcategory (cannot be deleted by design). All other tagged data removed.
- Test-side fixes only (not defects): stale Owner screen needs reload (no Realtime for drafts = known deferred), conflict banner wording, Windows clipboard CRLF.
- [ ] Broader Bar Inventory regression x3 projects; repo gates (check parts, vitest, build)
- [ ] Defect D1 fix branch; closure docs; PR
- NOTE: `next dev` rewrites AGENTS.md -> `git checkout AGENTS.md` before any commit.
- [ ] tests/real, Playwright (desktop / host-tablet WebKit / server-mobile), repo gates, closure docs

## Exact next action (VOD-3 text, superseded by VOD-4 start)

STOP. VOD-3 is complete. VOD-4 (hosted DEV / final Vendor Order Drafts gate: real RLS, Staff denial, two-context PT409, no inventory mutation against the real ledger, full browser matrix including host-tablet WebKit and server-mobile, tests/real) starts in a FRESH session from the updated `development`. Keep Tasks T-1 parked. Do not touch `main` or PROD.

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
