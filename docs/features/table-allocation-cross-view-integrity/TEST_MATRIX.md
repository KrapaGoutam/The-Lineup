# Test matrix — Cross-View Integrity

Layers: **D** domain (Vitest) · **C** component (Vitest + RTL) · **E** demo Playwright cross-view matrix · **R** hosted DEV real-mode (production build) · **P** pgTAP.

Scenario data lives in `src/features/allocation/domain/cross-view-scenarios.ts` (shared by D, C and E); `assertBoardAcrossViews` asserts Grid, Floor, Picker, Servers and Dashboard against one expectation.

Result column is filled as phases complete. (PLANNED = not run yet.)

| ID     | Scenario                                                                    | Layers  | Result  |
| ------ | --------------------------------------------------------------------------- | ------- | ------- |
| XM-001 | mapped available → assign from Grid                                         | D E     | PLANNED |
| XM-002 | mapped available → assign from Floor                                        | D E     | PLANNED |
| XM-003 | mapped available → assign from Picker                                       | D E     | PLANNED |
| XM-004 | mapped available → add from Servers                                         | D E     | PLANNED |
| XM-010 | off-map available (registered, unpositioned) → assign                       | D C R   | PLANNED |
| XM-011 | off-map active (unregistered label) represented in all five views           | D C E R | PLANNED |
| XM-012 | off-map never marks mapped `T1` occupied                                    | D C E   | PLANNED |
| XM-020 | same-server duplicate (each origin)                                         | D E     | PLANNED |
| XM-021 | occupied → Transfer (each origin)                                           | D E R   | PLANNED |
| XM-022 | occupied → End + Assign (each origin)                                       | D E R P | PLANNED |
| XM-023 | occupied → Cancel (each origin)                                             | D E     | PLANNED |
| XM-024 | stale client double-claim → server conflict dialog                          | R P     | PLANNED |
| XM-025 | simultaneous assign of one table                                            | R P     | PLANNED |
| XM-030 | A ends T2 → history everywhere, count drops; B assigns T2                   | D C E R | PLANNED |
| XM-031 | transfer chain A→B→C→end (one active owner, full history)                   | D E R   | PLANNED |
| XM-040 | combined T4+T5: transfer whole / end whole / undo / redo                    | D E P   | PLANNED |
| XM-041 | combined holder, wanted single table → whole-assignment copy + End + Assign | D C E P | PLANNED |
| XM-050 | skip / reorder / pause / resume / undo / redo keep next-turn correct        | D E     | PLANNED |
| XM-051 | auto-open row: all active servers have a turn → next row                    | D E     | PLANNED |
| XM-052 | skipped / paused / added-mid-row / removed-mid-row variants                 | D       | PLANNED |
| XM-060 | clear cell / row / board: history, availability, counts, undo               | D E R   | PLANNED |
| XM-070 | multi-context convergence (assign/transfer/end/End+Assign)                  | R       | PLANNED |
| XM-071 | reconnect / offline convergence                                             | R       | PLANNED |
| XM-072 | refresh preserves active/ended/transferred/combined/off-map                 | R       | PLANNED |
| XM-080 | service-day 23:59→00:01 and previous-date rendering                         | D R     | PLANNED |
| XM-081 | server with active tables cannot be removed                                 | D R     | PLANNED |
| XM-090 | permission parity across views (owner / GM / shift manager / server)        | D R     | PLANNED |
