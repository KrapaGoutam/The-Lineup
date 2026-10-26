# Test matrix — Cross-View Integrity

Layers: **D** domain (Vitest) · **C** component (Vitest + RTL) · **E** demo Playwright matrix (desktop + tablet + mobile) · **R** hosted DEV real mode (production build, `next start`) · **P** pgTAP.

Scenario data is machine-readable and shared: `src/features/allocation/testing/cross-view-scenarios.ts` (45 scenarios). D runs them through the pure reducer + shared claim classifier + read model (`cross-view-matrix.test.ts`); E drives the same steps through the real UI of the origin each names (`tests/e2e/table-allocation-cross-view.spec.ts`). Both assert **Grid, Floor, Picker, Servers and Dashboard** from ONE expectation (`checkViews` / `assertBoardAcrossViews`): owner per physical table, active/ended per server, active-table count, ended history; mid-scenario checkpoints where the views must agree after every step.

| ID     | Scenario                                                                                                                                    | Layers    | Result |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| XM-001 | mapped available table assigned from Grid / Floor / Picker / Servers                                                                        | D E       | PASS   |
| XM-011 | free-text "1" and mapped T1 are different tables (all five views)                                                                           | D C E R   | PASS   |
| XM-012 | off-map held table never marks a mapped table occupied                                                                                      | D C E R   | PASS   |
| XM-013 | off-map table guarded like any other: End + Assign                                                                                          | D E R P   | PASS   |
| XM-010 | registered-but-unpositioned table listed available / held (Floor + Picker sections, counts)                                                 | D C       | PASS   |
| XM-020 | same-server duplicate, 4 origins: notice, no mutation                                                                                       | D C E R P | PASS   |
| XM-021 | occupied → Transfer, 4 origins                                                                                                              | D C E R   | PASS   |
| XM-022 | occupied → End + Assign, 4 origins (atomic, history kept)                                                                                   | D C E R P | PASS   |
| XM-023 | occupied → Cancel, 4 origins                                                                                                                | D C E     | PASS   |
| XM-024 | End + Assign Undo/Redo; stale-client double-claim (PT409, Realtime blocked)                                                                 | D E R P   | PASS   |
| XM-025 | simultaneous assign / End + Assign of one table: one winner, deterministic conflict                                                         | R P       | PASS   |
| XM-030 | A ends T2 → history everywhere, count drops → B assigns T2 (Floor + Servers)                                                                | D E       | PASS   |
| XM-031 | transfer chain A→B→C→end, views agree after every step (Floor + Servers)                                                                    | D E       | PASS   |
| XM-040 | combined T4+T5: Transfer moves the whole assignment, 4 origins                                                                              | D C E     | PASS   |
| XM-041 | combined holder, wanted T4: End + Assign ends the WHOLE assignment, T5 released, 4 origins                                                  | D C E R P | PASS   |
| XM-042 | combined holder: Cancel intact, 4 origins                                                                                                   | D E       | PASS   |
| XM-050 | skip from Grid / Picker                                                                                                                     | D E       | PASS   |
| XM-051 | auto-open row: 2 servers; skipped / paused / added mid-row / removed mid-row; pause-resume-reorder keep ownership                           | D         | PASS   |
| XM-060 | unassign (Grid / Floor / Servers); clear cell / row / board; Undo restores                                                                  | D E       | PASS   |
| XM-062 | Clear board empties all five views, Undo restores                                                                                           | E         | PASS   |
| XM-070 | multi-context convergence without refresh (assign, transfer, End + Assign)                                                                  | R         | PASS   |
| XM-071 | offline → online convergence                                                                                                                | R         | PASS   |
| XM-072 | reload preserves active / ended / transferred / off-map                                                                                     | R         | PASS   |
| XM-080 | service day: 23:59→00:01, DST, UTC≠boundary (controlled instants); concurrent session open = 1 session; previous day read-only with history | D R       | PASS   |
| XM-081 | server with active tables cannot be removed (existing S25, still green)                                                                     | R P       | PASS   |
| XM-090 | permission parity: every DB role + a server-role user resolves a conflict identically                                                       | D R       | PASS   |

## Totals (final gate, 2026-10-26)

| Layer                             | Result                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Vitest                            | 70 files / 663 tests PASS                                                                       |
| Cross-view matrix                 | 45 scenarios × (desktop, host-tablet, server-mobile) = 135 PASS, plus 3 explicit extras × 3 = 9 |
| Demo Playwright, full suite       | 489 PASS (3 projects)                                                                           |
| pgTAP                             | 30 files / 588 assertions PASS (new 0030: 35)                                                   |
| Hosted DB (DEV)                   | 40 existing + 10 new PASS                                                                       |
| Hosted UI (DEV, production build) | 29 PASS (18 existing + 11 new)                                                                  |
| Production build                  | PASS; 0 files reference the PROD ref                                                            |

Mutation check: with `endWholeAssignment` forced false in the shared dialog, every XM-041 scenario fails — the matrix detects regressions rather than passing vacuously.
