# V2.0.8 — Editable Tips Management

**Status:** review (PR to `development`; not merged, not promoted).
**Branch:** `feature/v2-008-editable-tips` · **Worktree:** `.tmp/v2-008-editable-tips`
**Baseline:** `development` fast-forwarded to `27b8988144eee098fc2d1b66f213f71cc32b2d49` (Production `main`, Release Group 1 PR #357). The three merge commits it added had a tree identical to the previous `development` head (`6e1e7f0`), so the sync lost no history.
**PR:** see the PR link recorded in `tasks/current-task.md` and the PR thread.

## User outcome

Managers and assistant managers work in a **Create → Save → Edit/Update → Recalculate → Review → Print/Export** loop. A saved distribution is never "done": it can be opened, corrected with a reason, and every change is kept. There is no daily Finalize / Unfinalize / Unlock step.

Non-goals: payroll changes (Tips and Payroll stay independent), changing the existing interval calculator, activating Tips for Liquor Tap branches, cross-branch aggregation (see Remaining limitations), V2.0.9 Dashboard.

## What was reused (unchanged)

- `allocateTipInterval` / `calculateTipSplits` (only an additive `splitCentsEvenly` export; behaviour identical, existing tests untouched).
- PR #312 location scoping: `tips_is_manager`, `tips_workforce_eligible`, `tips_can_access_location`, `tips_location_roster`, the module guard (`guardModule` + `assert_location_module_enabled`), the workspace expectation (stale-tab) check, RLS policies, the "Pull clocked-in team" action and its eligibility filtering.
- Print infrastructure: `.report-document/.report-keep/.report-table` CSS, `triggerPrintWithFilename`, `formatReportPeriodLabel`.
- Release Group 1 evidence was reused rather than re-derived: reporting/print behaviour is unchanged, and the full Vitest run (below) re-confirms it. Reporting does not read tips.

## Implemented

**Database** (`supabase/migrations/20261119120000_editable_tips.sql`, additive):

| Piece                                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tip_intervals.cash_cents/card_cents`                                       | Tender split. `0+0` = "tender not recorded" (every legacy row); otherwise `cash+card = amount_cents` (table CHECK).                                                                                                                                                                                                                                     |
| `tip_intervals.revision`, `updated_at`                                      | Optimistic-concurrency token.                                                                                                                                                                                                                                                                                                                           |
| `tip_intervals.voided_at/by/void_reason`                                    | Soft void (CHECK: all three or none; reason ≥ 3 chars).                                                                                                                                                                                                                                                                                                 |
| `tip_allocations.cash_cents/card_cents`                                     | Per-person tender totals (`cash+card ≤ total`).                                                                                                                                                                                                                                                                                                         |
| `tip_revisions`                                                             | Append-only audit: before/after interval **and** distribution, editor, reason, affected people, org + branch (FK to `locations`). Manager-read RLS + module restrictive policy; no write grants.                                                                                                                                                        |
| `private.tips_interval_shares`                                              | The single definition of how an interval is divided.                                                                                                                                                                                                                                                                                                    |
| `recalculate_tip_pool`                                                      | Tender- and void-aware; the total split is byte-for-byte the legacy split.                                                                                                                                                                                                                                                                              |
| `revoke insert, update, delete` on the four tip tables from `authenticated` | **Direct table writes are closed.** Production's app reaches Tips only through RPCs (verified: no `from("tip_*")` in `src` at `27b8988`). With Finalize gone every day stays a draft, so open table DML would let a manager bypass void/revision/reconciliation or delete a day. All writes go through the audited RPCs; reads keep their RLS policies. |
| triggers on pools/intervals/participants                                    | Defence in depth: privileged (service-role / migration) direct writes are captured as `source = 'direct'` revisions. RPCs set a transaction-local flag so they are not double-recorded; cascades are skipped (a privileged pool delete records only the pool row).                                                                                      |
| `tips_save_interval`                                                        | Create or update one interval (reason + revision required to update). Overlap is judged across the previous, same and next service date (an interval may run past midnight); those pools are locked in date order; the first save of a day is race-safe.                                                                                                |
| `tips_add_interval` (legacy)                                                | Now **delegates** to `tips_save_interval` (amount recorded as cash): same signature, inherits every rule and the audit.                                                                                                                                                                                                                                 |
| `tips_void_interval`                                                        | Audited soft delete.                                                                                                                                                                                                                                                                                                                                    |
| `tips_recalculate_pool`                                                     | Explicit re-derivation from SAVED intervals/participants; never reads attendance; idempotent.                                                                                                                                                                                                                                                           |
| `tips_get_range`                                                            | One reader for editor, history and print. Manager: everything (+ audit trail on request, merged with the earlier workflow's finalize/reopen events). Staff: own days, own shares, no co-worker ids, no interval totals, no audit.                                                                                                                       |
| `tips_get_day_data`                                                         | Same contract; hides voided intervals (old and new apps agree).                                                                                                                                                                                                                                                                                         |

**Application:** `src/features/tips/` — `domain/` (tender split, interval instants incl. cross-midnight/DST, period presets, range model + summaries, revision summaries, API contract, demo store), `actions/` (`saveTipIntervalAction`, `voidTipIntervalAction`, `recalculateTipsAction`, `getTipsRangeAction`, `reopenTipsAction`, `getClockedInRosterAction`), `data/` (`loadTipsRange`, `getTipsContext`, client API adapter), `components/` (`TipsModule`, editor, day review, history, printable report). `finalizeTipsAction` and `addTipIntervalAction` were removed; the old `tip-workspace.tsx` was replaced.

## Financial invariants (each is tested)

1. Integer cents everywhere; amounts validated 0 … $100,000.00 per tender; combined total > 0; one day cannot exceed $20,000,000.00 (a clear error instead of an integer overflow).
2. `sum(cash) = cash entered`, `sum(card) = card entered`, `sum(total) = combined`, per interval and per day; no cent lost or duplicated.
3. A person's TOTAL equals the legacy even split of cash + card (remainder cents to the first ranks by employee id). Cash is split the same way on its own and card is each person's total minus cash, which is provably never negative. The TypeScript mirror and the SQL are pinned to the same worked examples; a 20,000-case property test checks reconciliation, non-negativity, the legacy total split and ≤ 1¢ spread.
4. The rounding remainder is disclosed on the review screen, the live preview and the printed report ("N¢ … given one cent at a time in a fixed order (by employee ID) to: …").
5. Voided intervals are excluded from every allocation but are never deleted (row + participants preserved).
6. Legacy intervals keep their money; their tender shows as "Not split" / "Cash/card not recorded". Nothing in payroll or any issued snapshot is read or written.

## Audit and historical safeguards

Every change records previous and updated interval, before/after distribution, editor, timestamp, reason (required for update and void), organization, branch and affected employees. Privileged direct writes are captured too; authenticated users cannot write the tables at all. Saved participant snapshots are preserved: on update, people already on an interval keep their place even if they have since left; only **newly added** people must be current workforce. Attendance never changes a saved distribution (no code path reads attendance after a save; `tips_recalculate_pool` is attendance-free; tested).

Days finalized by the earlier workflow are **locked**: save/void/recalculate are rejected by the database. The only way back is the existing audited reopen (reason ≥ 3 chars), offered as "Correct locked record" on locked days only. Reopening writes the existing audit event, and the Change history shows it next to the new revisions.

## Access control

Unchanged tiers: Overall management (permitted locations), organization management, branch management, assistant managers (operational Tips), staff (own data only). Every action takes only the route slug and the workspace expectation from the client; organization, location and time zone are server-verified each call. Staff cannot save/void/recalculate (database + action), cannot read revisions even through RLS, and never receive co-worker identities or interval totals. A module disabled for a branch blocks every new RPC and the range read. No Liquor Tap activation.

## Concurrency

Writers of one day serialize on the pool row; an update/void carries the revision it read. A stale tab gets a conflict message and the latest saved version is loaded. **Note:** the conflict SQLSTATE is `P0409`, deliberately not `40001`: PostgREST treats `40001` as retryable, so a deterministic conflict looped forever (found by the real-JWT suite).

## UI

New Distribution · Save · Edit · Update (reason required) · Void (reason) · Recalculate (re-derives the saved day) · View History · Print / Save PDF. Live "Preview — not saved" under the editor. History periods: Today, Yesterday, This week (Mon–Sun), This month, Previous month, Custom range, with per-employee totals and daily/weekly/monthly summaries; the on-screen report and the Letter PDF are the same document. Staff get "My tip estimate" plus their own history and print. Design tokens, dark/light and responsive layout reused; no unrelated module changed.

## Cross-midnight and DST

An end time at or before the start runs into the next calendar day (`23:00–01:00 (+1 day)`). An interval may last up to 25 hours (a fall-back day really has 25). Wall times resolve in the location's zone with the app's documented policy (a skipped wall time moves forward; a repeated one takes the first occurrence) and the **real elapsed** instants are stored. Tested in TS under `TZ=UTC/America/Chicago/Asia/Tokyo` and against the real database for 2026-03-08 (spring forward) and 2026-11-01 (fall back).

## Tests

Reused (re-run): full pgTAP (94 files / 3,877 assertions incl. the security sweep re-baseline), the existing Tips location and final-security real-JWT suites, `enforcement-coverage`. Tests that asserted "direct writes are allowed or a silent no-op under RLS" (pgTAP 0063/0067/0068, `module-enforcement` BE-31, `tips-final-security`, `tips-old-app-compat`) were converted to assert the stronger guarantee: a direct write is refused (42501).

Newly executed:

- pgTAP `0091_editable_tips` (102): reconciliation, fairness, validation, concurrency conflict, audit before/after, void, DST/cross-midnight, left-employee snapshot, staff/manager/cross-branch authorization, direct writes refused for managers (update, sneaky void, whole-day delete, insert, participants), privileged-write capture, cross-date overlap, the delegating legacy RPC, legacy rows, locked days, audit-feed merge. `0088` sweep re-pinned for the 4 new RPCs.
- Real-JWT `tips-editable.local.test.ts` (8) driving the real actions against the real database; the three existing Tips real-JWT suites were adapted to the new actions (43 tests with `module-enforcement`).
- Vitest (158 in `src/features/tips`): Tips domain (tender split incl. property test, interval times, periods, range model, revision summaries, demo API), actions (40), data (reads fail closed), UI (11, incl. print safety), module-enforcement denial.
- Playwright: real-mode `tips-location.local.spec.ts` 21/21 on desktop, tablet and phone against the local stack; demo specs (Tips + dashboard) 52/52 desktop + mobile. `tips-schema-compat.local.spec.ts` selectors updated (the new app fails closed on a schema without `tips_get_range`) but **not executed** (needs an old-schema stack).
- Chromium Letter PDF generated from real data and inspected page by page. It found two defects fixed before delivery: the title block was a `<header>` (hidden by the shared print stylesheet) and each day forced a page. Guard test added.
- One cold `CI=1 next build --webpack` succeeds.

## Migration decision

A migration **was** genuinely required: cash/card, a concurrency token, soft void and a revision log do not exist in any current table. Validated locally (`db reset` replays all 100 migrations; full pgTAP). **Not applied to hosted DEV or Production** — that needs separate owner authorization.

- Rollout order: migration **first**, then the app (the new app fails closed with a clear notice if `tips_get_range` is missing). The currently deployed app (RPC-only) keeps working on the new schema: it never touches the tables directly, `tips_add_interval` keeps its signature, and `tips_get_day_data` keeps its shape.
- Compatibility: additive only; no existing column changes; legacy rows keep their money; payroll/attendance untouched. `tips_add_interval`, `tips_finalize_pool`, `tips_reopen_pool` remain.
- Rollback: drop the four new RPCs, the three triggers and `tip_revisions`; restore `recalculate_tip_pool` and `tips_get_day_data` from `20261107194700`; drop the added columns (only after confirming no row has `cash_cents/card_cents/voided_at` set, otherwise that data would be lost; voided rows would need to be re-instated first).

## Remaining limitations / decisions for the owner

1. **Board lock — DECIDED (owner): no new lock.** Saving or updating tips never locks Table Allocation, and no Finalize/Unlock control exists. Days finalized by the earlier workflow keep their lock until the audited correction (covered by the demo spec and the real-mode legacy-lock spec).
2. **Payroll readiness counter — DECIDED (owner): document only.** The DB-only `warnings.tip_pools_not_finalized` count (shown in no UI) is now non-zero for every saved day. Left untouched; retire it in a future payroll cleanup batch. No unrelated payroll SQL is changed here.
3. **Cross-branch review.** History is per verified branch (switch branch with the existing switcher); the printed report names the branch. A combined multi-branch Tips view (and Reporting Center integration) is deferred.
4. **After-midnight intervals — DECIDED (owner): keep the service-date rule.** An interval starts on the service date shown; tips after midnight that belong to the previous night go on that night's date. The editor now says so; persisted time semantics and the database contract are unchanged.
5. **Cash/card for history** cannot be back-filled (the data was never captured); legacy days show "Not split".
6. Week starts Monday; changing it is a one-line domain change.
7. Hosted DEV apply, PR merge and the Group 2 Production release are separate approvals (Group 2 releases after V2.0.9 and one consolidated acceptance gate).

## Independent review (one focused pass, before the push)

Verdict: APPROVE WITH CHANGES, no P0. Accepted and fixed in this PR:

- **P1 direct writes** (the earlier compatibility rationale was wrong): table DML revoked; legacy RPC delegates; tests inverted and added.
- **P2** overlap across the midnight pool boundary (double pay) is now rejected, with ordered pool locking; the conflict message and latest version are no longer lost when the editor remounts; reopening an older legacy day no longer unlocks today's allocation board.
- **P3** race on the first save of a day; day-total overflow gives a clear error; raw Postgres text never reaches the user and `reopenTipsAction` validates its input; 25-hour cap for fall-back days; request sequencing and failed-load handling in the module; the staff report no longer shows a misleading People column; migration comment corrected.

Not changed (recorded): the editor still pre-checks the first four selectable people (pre-existing; the manager approves the list); `participant_count` and a day's `updated_at` are visible to staff who took part (no identity or amount leaks); TS/SQL split parity is pinned by worked examples plus a TS-only property test, not a randomized cross-language test; concurrency is tested sequentially (stale revision), not with two racing sessions.

## Hosted DEV migration and compatibility checklist (STOP: needs explicit owner approval)

Nothing below has been run. Migration `20261119120000_editable_tips.sql` is applied to the local stack only.

**Order (migration first):** 1) approval, 2) read-only preflight, 3) backup, 4) dry run, 5) apply, 6) post-checks, 7) existing-app smoke, 8) PR #358 Preview (new app) smoke, 9) only then merge, 10) never to `main`/Production in this batch.

1. **Approval and target.** DEV only, with the hard-coded DEV project-ref guard of the existing apply tooling. The `deploy-migrations` CI job only runs from `main`, so DEV uses the documented manual one-transaction route.
2. **Read-only preflight.** DEV ledger head is the migration immediately before this one (`20261117140000`) with nothing pending in between; `tip_*` row counts; Tips module enabled at the smoke branch (enforcement mode and configs); no scripts or integrations write the tip tables directly (repo check: none in `src`, `tests` or `scripts` besides service-role fixtures).
3. **Backup.** Data snapshot of `tip_pools`, `tip_intervals`, `tip_interval_participants`, `tip_allocations` and the `audit_events` rows with `entity_type = 'tip_pool'`, with counts recorded.
4. **Dry run** in one transaction ending in a deliberate `RAISE` that returns verify JSON: new columns present; every existing interval satisfies the tender CHECK (`cash+card = 0` or `= amount`) and `revision >= 1`; row counts unchanged; `authenticated` has SELECT only on the five tip tables and `anon` nothing; `tips_add_interval` still executable by `authenticated`, not `anon`; all new functions have `search_path = ''`.
5. **Apply** the exact file verbatim in one transaction with its `schema_migrations` row; ledger +1.
6. **Post-checks:** counts equal the snapshot; legacy allocations unchanged (legacy rows show no tender, same totals); `tips_get_range` and `tips_get_day_data` answer for a DEV manager.
7. **Existing-app compatibility (before the new app is anywhere):** the currently deployed DEV app is RPC-only (`tips_get_day_data`, `tips_location_roster`, `tips_add_interval`, `tips_finalize_pool`, `tips_reopen_pool`, `recalculate_tip_pool`); all are retained with the same signatures. Smoke it once: open Tips, add an interval, confirm it shows.
8. **One targeted authenticated smoke on the PR #358 Preview** (new app on DEV): a manager Saves cash + card, Updates with a reason, Voids, opens History and the print preview; a staff user sees only their own figures; Table Allocation is **not** locked after Save. Use a synthetic service date; revision rows are append-only, and any service-role cleanup is itself captured as a `direct` revision (expected).
9. **Risks:** (a) direct table writes are closed, so any out-of-repo client writing the tip tables directly would get `42501` (none known); (b) a stale-revision conflict uses SQLSTATE `P0409`, never `40001`; (c) the new app fails closed with a clear notice if deployed before the migration.
10. **Rollback precautions:** take the step-3 snapshot first. The documented rollback (drop the 4 new RPCs, the triggers and `tip_revisions`; restore `recalculate_tip_pool`, `tips_get_day_data` and the original `tips_add_interval` from `20261107194700`; re-grant table DML; drop the added columns) is only safe while no row uses `cash_cents`, `card_cents` or `voided_at`. After real use prefer a forward fix. Because the migration also revokes table DML and replaces `tips_add_interval`, a rollback must restore those two items explicitly.
