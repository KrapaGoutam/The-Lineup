# Test matrix — Canonical Table Input Resolution (#157)

Layers: **P** pgTAP · **U** unit (Vitest) · **D** domain scenario matrix (Vitest) · **E** demo Playwright matrix (desktop + host-tablet + server-mobile) · **R** hosted DEV DB (real RPC) · **H** hosted DEV UI on a production build (separate browser contexts).

The existing 45-scenario cross-view matrix is **extended, not rebuilt**: `Step` gained one optional field, `typed` — the string the operator actually types in the Grid. `table` stays the canonical identity every view is asserted on, so one expectation (`checkViews` / `assertBoardAcrossViews`) covers all five views for every input form. The domain driver refuses a scenario whose `typed` does not resolve to its `table`, so the matrix cannot drift from the resolver.

## Input-form axis

| Form                        | Example typed            | Canonical                  | Where proven             |
| --------------------------- | ------------------------ | -------------------------- | ------------------------ |
| canonical registered label  | `T1`                     | `T1`                       | existing XM-0xx, P, R    |
| numeric shorthand           | `1`, `2`, `6`            | `T1`, `T2`, `T6`           | XM-011, 013–018, P, R, H |
| combined shorthand          | `1 + 2`                  | `T1 + T2`                  | XM-018, P, R             |
| shorthand + free text       | `3 + 99`, `19 + Patio A` | `T3 + 99`, `T19 + Patio A` | XM-019, P, R             |
| free-text fallback          | `99`, `Patio A`          | unchanged                  | XM-012, P, R, H          |
| leading zero                | `01`, `031`              | `T01` / unchanged          | P, U, R                  |
| exact label beats shorthand | `5` (table "5" + `T5`)   | `5`                        | P, U, R                  |

## Scenarios

| ID                                   | Scenario                                                                                                                                                                        | Layers  | Result |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| XM-011-shorthand-is-registered-table | A types `1` → T1 owned by A in all five views; a later `T1` request collides (Cancel)                                                                                           | D E H   | PASS   |
| XM-012-free-text-fallback            | `99` (no T99) stays off-map in all five views and never marks T1                                                                                                                | D E H   | PASS   |
| XM-013-shorthand-conflict-end-assign | A holds T1, B types `1` → same dialog as Picker → End + Assign: A ended, B active                                                                                               | D E P R | PASS   |
| XM-014-shorthand-conflict-transfer   | A holds T2, B types `2` → Transfer moves the assignment (history kept)                                                                                                          | D E R   | PASS   |
| XM-015-shorthand-conflict-cancel     | A holds T6, B types `6` → Cancel: no change                                                                                                                                     | D E     | PASS   |
| XM-016-shorthand-same-server         | A holds T3, A types `3` → "T3 is already assigned to A", no mutation                                                                                                            | D E P R | PASS   |
| XM-017-shorthand-undo-redo           | A types `1`; Undo frees T1; Redo re-assigns canonical T1                                                                                                                        | D E P R | PASS   |
| XM-018-shorthand-combined            | A types `1 + 2` → T1 + T2; B types `2` → End + Assign ends the WHOLE assignment                                                                                                 | D E P R | PASS   |
| XM-019-shorthand-mixed-label         | A types `3 + 99` → T3 (physical) + free-text 99                                                                                                                                 | D E P R | PASS   |
| CR-UI (hosted)                       | stale browser (Realtime blocked) types `2` while the owner holds T2 → DB answers PT409 for T2, conflict dialog, End + Assign converges both contexts, no free-text `2` row      | H       | PASS   |
| XM-011 (hosted, rewritten)           | `1` → T1 in Grid/Floor/Picker/Servers/Dashboard (no off-map), live in a second context; `99` off-map; both survive reload                                                       | H       | PASS   |
| CR-01…CR-04 (hosted DB)              | shorthand store/claim/event, exact wins, `99`, `031`, Undo/Redo, held/same-server/End + Assign/Transfer/`board_end_and_assign`, combined, simultaneous `31` vs `T31`, all roles | R       | PASS   |
| pgTAP 0031                           | 58 assertions: resolver vectors, location scoping, inactive table, combined, trigger shares the resolver, privileges/search_path, auth unchanged                                | P       | PASS   |
| table-input.test.ts                  | mirror of the resolver (same vectors as 0031)                                                                                                                                   | U       | PASS   |

## Old-contract tests changed deliberately

| Test                                               | Old assertion                                 | Now                                                                                 |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| pgTAP 0030 §3                                      | Bea can take free-text `1` while Ann holds T1 | `1` collides with T1 (PT409); no separate entry                                     |
| pgTAP 0030 `label_parts` assertion                 | "`1` and `T1` are different labels"           | `label_parts` is textual only; the resolution is `resolve_table_input` (0031)       |
| XM-011/012/013 (matrix)                            | free-text `1` ≠ T1                            | rewritten as the shorthand scenarios above                                          |
| hosted XM-011 (UI)                                 | "`1` is accounted for off-map, is not T1"     | `1` is T1 everywhere; the off-map assertions moved to `99`                          |
| hosted DB `4+5` / `5+6` stored text                | stored as typed                               | stored canonically as `4 + 5` / `5 + 6` (spacing normalised)                        |
| `cross-view-integrity.test.{ts,tsx}` ("1" off-map) | titled as the owner's case                    | kept (a STORED legacy free-text `1` still renders exactly as stored); titles say so |

## Totals (final gate, 2026-10-26)

See `IMPLEMENTATION_REPORT.md` (filled in from the actual runs).
