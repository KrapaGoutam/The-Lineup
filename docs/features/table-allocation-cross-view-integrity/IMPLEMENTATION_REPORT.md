# Implementation report — Cross-View Integrity

Tracker #153 · branch `fix/table-allocation-cross-view-integrity` · base `development` `63fdbe0`. Contracts: PLAN.md. Evidence: TEST_MATRIX.md.

| Phase | State | Notes                                                                                                                |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| X0    | done  | Audit complete; identity proven from DEV (`1` has no `dining_tables` row; `T1` is id 19)                             |
| X1    | done  | Table identity + off-map in all five views                                                                           |
| X2    | done  | One classifier, one dialog, atomic End + Assign, server-authoritative PT409                                          |
| X3    | done  | Servers session history (ended stays, struck through)                                                                |
| X4    | done  | 45-scenario shared matrix, domain + Playwright × 3 viewports                                                         |
| X5    | done  | Hosted DEV, production build: 10 DB + 11 UI tests; PROD ref absent                                                   |
| X6    | open  | After merge to `development`: merge into `infra/dev-preview-ci-reliability`, exact-head CI, new Preview, owner smoke |

## What was wrong (owner Preview smoke)

- **A. Identity / off-map.** The owner's "Table 1" is a free-text board label with **no** `dining_tables` row (DEV: registered labels include `T1` id 19, `T2` id 18, `T6` id 12; `1` is not registered). It has no ledger claim, so Floor/Picker (drawn from positioned registry rows only) never showed it, and "T1 is free" read as a contradiction. Registered tables with no coordinates were silently dropped by `getAllocationContext` too.
- **B. Ended history vanished in Servers.** Cards used active entries only.
- **C. Occupied-table conflict.** Grid silently ended the other server's entry; Picker/Servers showed a dead-end error; Floor had only Transfer; the DB refused to end a wider combined holder, and did not guard free-text labels at all.

## What changed

- `domain/floor-layout.ts` — `RegistryTable`, `resolveOccupancyByLabel` (exact label identity; no normalization).
- `domain/board-read-model.ts` — `TableIdentity`, `resolveTableIdentity`, `offMapTables`, `sessionHistory`, `availableOffMapTables`, `endedAssignments`; `registry` input.
- `data/allocation-data.ts` — `registeredTables` (positioned or not).
- `domain/table-conflict.ts` + `components/table-claim.tsx` — shared classifier, copy and dialog (`useTableClaim`); Grid typed entry, Picker, Servers (`+ Table`) and Floor (new "Assign to another server…" on an occupied tile) all route through it. `table-assignment-decision.tsx` takes an `intercept`.
- `components/off-map-tables.tsx` — Floor rail, Picker section, Servers chooser section; Grid "Off-map" badge; Servers chip marker; Servers "Session history".
- `actions/allocation-actions.ts` — PT409 → structured `conflict` result (member ids mapped to profile ids server-side).
- `rotation-board.ts` — `endWholeAssignment`; same-server duplicate guard (mirrors the DB).
- Migration `20261026090000_table_allocation_conflict_resolution.sql` (forward-only): `private.label_parts`, exact-label `displace_conflicting_entries(…, p_end_whole)`, `board_assign` + `p_end_whole_assignment` and pre-write PT409 conflict detection (`held` / `same_server`). Old 7-arg overload dropped (PostgREST ambiguity). pgTAP `0030` (35).
- Types: `database.generated.ts` (`p_end_whole_assignment`).

## Decisions

- Mutations stay label-addressed (entries and combined assignments persist label text; undo payloads depend on it). Identity is resolved exactly, once, through the registry; `section_assignments.dining_table_id` remains the authoritative physical claim for registered tables, and the new check makes free-text labels equally guarded at the board level.
- Transfer reuses `board_transfer` unchanged (dest cell = earliest empty round of the receiving server, not necessarily the clicked cell). Transfer is offered only when one holder covers everything wanted; otherwise End + Assign / Cancel.
- End + Assign reuses the `assign` event with `displaced`, so Undo/Redo needed no change.
- Service day = calendar date in the location time zone (no business-day cutoff); documented and pinned, not redesigned.
- Old specs that encoded the defect were updated, not weakened: ended tables now assert on active chips (`activeChip`) and in "Session history"; selectors made exact where off-map rows share a server name; the hosted A/B/C scenario resolves its Grid take through the dialog.

## Safety

DEV touched: migration applied to `opmujepkemwcdxxorhfd` (version row recorded), hosted suites (synthetic data; today/yesterday boards reset). PROD: untouched (`ftadewtkjlaotfdvtjcv` absent from the production bundle: 0 files). `main` not merged. PR #135 untouched.

## Known limits / follow-ups

- Picker cell body still has no keyboard route to open the map (#109 note, unchanged).
- A Transfer made from the dialog lands in the receiving server's earliest empty round (existing Transfer contract).
- Tasks notification scope (#154) and Tips V2 (#155) are planned only.
