# Acceptance criteria — Canonical Table Input Resolution (#157)

Status: ⬜ pending · ✅ proven (evidence in `IMPLEMENTATION_REPORT.md`).

## Resolution

- [ ] AC-1 `1` → `T1` (id of T1) when T1 is registered and active at the location.
- [ ] AC-2 `T1` → `T1`; exact registered label always wins (a table registered as `5` beside `T5`: `5` stays `5`).
- [ ] AC-3 `99` with no `T99` → free text `99`; `Patio A` → free text; no case folding (`t1` is free text).
- [ ] AC-4 `01`: `T01` if registered, else free text `01`; never `T1`.
- [ ] AC-5 Same location only; never resolved across locations or organizations; inactive tables are not registered.
- [ ] AC-6 Combined labels resolve per part: `1 + 2`→`T1 + T2`, `1 + Patio A`→`T1 + Patio A`.

## Server authority

- [ ] AC-7 `board_assign` and `board_end_and_assign` store the canonical label (never raw `1` when T1 exists).
- [ ] AC-8 Canonicalization happens before conflict, same-server, End + Assign displacement, insert, event and occupancy.
- [ ] AC-9 The occupancy trigger uses the same resolver; ledger row points at T1's `dining_table_id`.
- [ ] AC-10 No second resolver implementation (one DB function; one TS mirror for latency/demo only).
- [ ] AC-11 Helpers private, SECURITY DEFINER, fixed `search_path`, not executable by public/anon/authenticated; no RLS or grant widened.
- [ ] AC-12 Migration is forward-only, new file; DEV applied; PROD untouched.

## Conflicts

- [ ] AC-13 A owns T1, B enters `1` → held conflict naming T1 (Transfer / End + Assign / Cancel); no off-map `1` created.
- [ ] AC-14 A owns T1, A enters `1` → same-server "T1 is already assigned to A"; no mutation.
- [ ] AC-15 End + Assign via `1`: A's T1 ended (history kept), B's T1 active, atomic.
- [ ] AC-16 Transfer after `1`: whole assignment moves via the existing `board_transfer`.
- [ ] AC-17 Combined holder `T1 + T2`, B enters `1` → conflict states T1 belongs to the combined assignment; whole-assignment semantics preserved.
- [ ] AC-18 Cancel leaves T-holder unchanged, no mutation, no event.
- [ ] AC-19 Stale client typing `1` gets the authoritative PT409, never creates off-map `1`.

## Cross-view

- [ ] AC-20 After typing `1` in Grid: Grid `T1`, Floor T1 occupied, Picker T1 occupied (not in off-map), Servers `T1`, Dashboard 1 physical table, no "not on the floor map" note.
- [ ] AC-21 Typing `T1` converges to the identical state.
- [ ] AC-22 Typing `99` (no T99) stays off-map in all five views.
- [ ] AC-23 Undo/Redo of a shorthand assignment works; events and Recent Activity name `T1`.
- [ ] AC-24 Historical rows are not rewritten.

## Automation

- [ ] AC-25 pgTAP resolver + mutation cases; unit tests; shared matrix gains the input-form axis reusing `assertBoardAcrossViews`.
- [ ] AC-26 Hosted DEV production-build suites incl. two-context shorthand conflict + convergence; PROD ref absent.
- [ ] AC-27 Exact-head CI green; merged to `development` with a merge commit; `main` and PROD untouched.
