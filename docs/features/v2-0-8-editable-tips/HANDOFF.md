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

| Piece                                    | Purpose                                                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tip_intervals.cash_cents/card_cents`    | Tender split. `0+0` = "tender not recorded" (every legacy row); otherwise `cash+card = amount_cents` (table CHECK).                                                                                                               |
| `tip_intervals.revision`, `updated_at`   | Optimistic-concurrency token.                                                                                                                                                                                                     |
| `tip_intervals.voided_at/by/void_reason` | Soft void (CHECK: all three or none; reason ≥ 3 chars).                                                                                                                                                                           |
| `tip_allocations.cash_cents/card_cents`  | Per-person tender totals (`cash+card ≤ total`).                                                                                                                                                                                   |
| `tip_revisions`                          | Append-only audit: before/after interval **and** distribution, editor, reason, affected people, org + branch (FK to `locations`). Manager-read RLS + module restrictive policy; no write grants.                                  |
| `private.tips_interval_shares`           | The single definition of how an interval is divided.                                                                                                                                                                              |
| `recalculate_tip_pool`                   | Tender- and void-aware; the total split is byte-for-byte the legacy split.                                                                                                                                                        |
| triggers on pools/intervals/participants | Capture **direct** table writes (the previously deployed app still writes directly) as `source = 'direct'` revisions. RPCs set a transaction-local flag so they are not double-recorded; cascades are skipped.                    |
| `tips_save_interval`                     | Create or update one interval (reason + revision required to update).                                                                                                                                                             |
| `tips_void_interval`                     | Audited soft delete.                                                                                                                                                                                                              |
| `tips_recalculate_pool`                  | Explicit re-derivation from SAVED intervals/participants; never reads attendance; idempotent.                                                                                                                                     |
| `tips_get_range`                         | One reader for editor, history and print. Manager: everything (+ audit trail on request, merged with the earlier workflow's finalize/reopen events). Staff: own days, own shares, no co-worker ids, no interval totals, no audit. |
| `tips_get_day_data`                      | Same contract; hides voided intervals (old and new apps agree).                                                                                                                                                                   |

**Application:** `src/features/tips/` — `domain/` (tender split, interval instants incl. cross-midnight/DST, period presets, range model + summaries, revision summaries, API contract, demo store), `actions/` (`saveTipIntervalAction`, `voidTipIntervalAction`, `recalculateTipsAction`, `getTipsRangeAction`, `reopenTipsAction`, `getClockedInRosterAction`), `data/` (`loadTipsRange`, `getTipsContext`, client API adapter), `components/` (`TipsModule`, editor, day review, history, printable report). `finalizeTipsAction` and `addTipIntervalAction` were removed; the old `tip-workspace.tsx` was replaced.

## Financial invariants (each is tested)

1. Integer cents everywhere; amounts validated 0 … $100,000.00 per tender; combined total > 0.
2. `sum(cash) = cash entered`, `sum(card) = card entered`, `sum(total) = combined`, per interval and per day; no cent lost or duplicated.
3. A person's TOTAL equals the legacy even split of cash + card (remainder cents to the first ranks by employee id). Cash is split the same way on its own and card is each person's total minus cash, which is provably never negative. The TypeScript mirror and the SQL are pinned to the same worked examples; a 20,000-case property test checks reconciliation, non-negativity, the legacy total split and ≤ 1¢ spread.
4. The rounding remainder is disclosed on the review screen, the live preview and the printed report ("N¢ … given one cent at a time in a fixed order (by employee ID) to: …").
5. Voided intervals are excluded from every allocation but are never deleted (row + participants preserved).
6. Legacy intervals keep their money; their tender shows as "Not split" / "Cash/card not recorded". Nothing in payroll or any issued snapshot is read or written.

## Audit and historical safeguards

Every change records previous and updated interval, before/after distribution, editor, timestamp, reason (required for update and void), organization, branch and affected employees. Direct table writes by the older app are captured too. Saved participant snapshots are preserved: on update, people already on an interval keep their place even if they have since left; only **newly added** people must be current workforce. Attendance never changes a saved distribution (no code path reads attendance after a save; `tips_recalculate_pool` is attendance-free; tested).

Days finalized by the earlier workflow are **locked**: save/void/recalculate are rejected by the database. The only way back is the existing audited reopen (reason ≥ 3 chars), offered as "Correct locked record" on locked days only. Reopening writes the existing audit event, and the Change history shows it next to the new revisions.

## Access control

Unchanged tiers: Overall management (permitted locations), organization management, branch management, assistant managers (operational Tips), staff (own data only). Every action takes only the route slug and the workspace expectation from the client; organization, location and time zone are server-verified each call. Staff cannot save/void/recalculate (database + action), cannot read revisions even through RLS, and never receive co-worker identities or interval totals. A module disabled for a branch blocks every new RPC and the range read. No Liquor Tap activation.

## Concurrency

Writers of one day serialize on the pool row; an update/void carries the revision it read. A stale tab gets a conflict message and the latest saved version is loaded. **Note:** the conflict SQLSTATE is `P0409`, deliberately not `40001`: PostgREST treats `40001` as retryable, so a deterministic conflict looped forever (found by the real-JWT suite).

## UI

New Distribution · Save · Edit · Update (reason required) · Void (reason) · Recalculate (re-derives the saved day) · View History · Print / Save PDF. Live "Preview — not saved" under the editor. History periods: Today, Yesterday, This week (Mon–Sun), This month, Previous month, Custom range, with per-employee totals and daily/weekly/monthly summaries; the on-screen report and the Letter PDF are the same document. Staff get "My tip estimate" plus their own history and print. Design tokens, dark/light and responsive layout reused; no unrelated module changed.

## Cross-midnight and DST

An end time at or before the start runs into the next calendar day (`23:00–01:00 (+1 day)`). Wall times resolve in the location's zone with the app's documented policy (a skipped wall time moves forward; a repeated one takes the first occurrence) and the **real elapsed** instants are stored. Tested in TS under `TZ=UTC/America/Chicago/Asia/Tokyo` and against the real database for 2026-03-08 (spring forward) and 2026-11-01 (fall back).

## Tests

Reused (re-run, unchanged expectations): full pgTAP (94 files / 3,868 assertions incl. the security sweep re-baseline), existing Tips old-app-compatibility, location and final-security real-JWT suites, `enforcement-coverage`.

Newly executed:

- pgTAP `0091_editable_tips` (93): reconciliation, fairness, validation, concurrency conflict, audit before/after, void, DST/cross-midnight, left-employee snapshot, staff/manager/cross-branch authorization, direct-write capture, legacy rows, locked days, audit-feed merge. `0088` sweep re-pinned for the 4 new RPCs (3 intentional pins: 120→124 RPCs, +2 management RPCs, no change to the 12 FK-less tables because `tip_revisions` has the composite FK).
- Real-JWT `tips-editable.local.test.ts` (8) driving the real actions against the real database; the three existing Tips real-JWT suites were adapted to the new actions (28 tests total).
- Vitest: Tips domain (tender split incl. property test, interval times, periods, range model, revision summaries, demo API), actions (40), data (reads fail closed), UI (11, incl. print safety), module-enforcement denial.
- Playwright: real-mode `tips-location.local.spec.ts` 21/21 on desktop, tablet and phone against the local stack; demo specs (Tips + dashboard) 52/52 desktop + mobile. `tips-schema-compat.local.spec.ts` selectors updated (the new app fails closed on a schema without `tips_get_range`) but **not executed** (needs an old-schema stack).
- Chromium Letter PDF generated from real data and inspected page by page. It found two defects fixed before delivery: the title block was a `<header>` (hidden by the shared print stylesheet) and each day forced a page. Guard test added.
- One cold `CI=1 next build --webpack` succeeds.

## Migration decision

A migration **was** genuinely required: cash/card, a concurrency token, soft void and a revision log do not exist in any current table. Validated locally (`db reset` replays all 100 migrations; full pgTAP). **Not applied to hosted DEV or Production** — that needs separate owner authorization.

- Rollout order: migration **first**, then the app (the new app fails closed with a clear notice if `tips_get_range` is missing). The previously deployed app keeps working on the new schema (old-app compatibility suite; direct writes still allowed and now audited).
- Compatibility: additive only; no existing column changes; legacy rows keep their money; payroll/attendance untouched. `tips_add_interval`, `tips_finalize_pool`, `tips_reopen_pool` remain.
- Rollback: drop the four new RPCs, the three triggers and `tip_revisions`; restore `recalculate_tip_pool` and `tips_get_day_data` from `20261107194700`; drop the added columns (only after confirming no row has `cash_cents/card_cents/voided_at` set, otherwise that data would be lost; voided rows would need to be re-instated first).

## Remaining limitations / decisions for the owner

1. **Board lock behaviour change.** Finalize used to lock the Table Allocation board at end of day. With no Finalize step, saving tips never locks the board. Days finalized by the earlier workflow still lock it until corrected. Decide whether an end-of-day board lock should exist some other way.
2. **Payroll readiness counter.** The DB-only `warnings.tip_pools_not_finalized` count (not shown in any UI) will now be non-zero for every saved day. Left untouched to avoid editing a payroll function; consider retiring it in a payroll batch.
3. **Cross-branch review.** History is per verified branch (switch branch with the existing switcher); the printed report names the branch. A combined multi-branch Tips view (and Reporting Center integration) is deferred.
4. **Direct table writes stay allowed** for old-app compatibility (audited, but not blocked). Revoke them in a follow-up after the new app is on Production.
5. **Cash/card for history** cannot be back-filled (the data was never captured); legacy days show "Not split".
6. Week starts Monday; changing it is a one-line domain change.
7. Hosted DEV apply, PR merge and the Group 2 Production release are separate approvals (Group 2 releases after V2.0.9 and one consolidated acceptance gate).
