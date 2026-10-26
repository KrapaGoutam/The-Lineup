# Test matrix -- #109 UX Consistency

| ID      | Scenario                                                                                                                                            | Layer               | Result |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------ |
| 109-001 | Picker parent (cell/input) click opens map                                                                                                          | unit + e2e          | PASS   |
| 109-002 | Picker inner button does not open map                                                                                                               | unit + e2e          | PASS   |
| 109-003 | Picker keyboard Enter/Space on inner button                                                                                                         | unit + e2e          | PASS   |
| 109-010 | Assign event display                                                                                                                                | unit                | PASS   |
| 109-011 | End / displaced-assign event display                                                                                                                | unit                | PASS   |
| 109-012 | Transfer (combined label) event display                                                                                                             | unit                | PASS   |
| 109-013 | Undo / Redo display + undone marker                                                                                                                 | unit                | PASS   |
| 109-014 | Unknown event, inherited names, malformed payloads fall back safely                                                                                 | unit                | PASS   |
| 109-015 | All 18 enum values covered (enum-driven)                                                                                                            | unit                | PASS   |
| 109-016 | Newest-first deterministic ordering (created_at, id) and cap                                                                                        | unit                | PASS   |
| 109-017 | Dashboard list render, undone text, time zone, unreadable timestamp                                                                                 | component           | PASS   |
| 109-020 | Single table: no extra scope copy (Floor panel, Servers dialog, scope module)                                                                       | unit + component    | PASS   |
| 109-021 | Combined label: Floor badge/summary, Servers card line, map tile name                                                                               | component           | PASS   |
| 109-022 | Combined End copy ("releases both tables"), described by the button                                                                                 | component           | PASS   |
| 109-023 | Combined Transfer copy ("moves the entire assignment"), transfer step title                                                                         | component           | PASS   |
| 109-024 | resolveFloorTables carries the whole assignment; ended combined cell holds nothing                                                                  | unit                | PASS   |
| 109-030 | Mapped + off-map held tables all counted                                                                                                            | unit                | PASS   |
| 109-031 | One off-map claim: count + "not on the floor map (99)" + actionable pill                                                                            | unit + component    | PASS   |
| 109-032 | Multiple off-map claims                                                                                                                             | unit + component    | PASS   |
| 109-033 | Ended claim excluded, table released                                                                                                                | unit + component    | PASS   |
| 109-034 | Combined assignment counts each physical part; partially off-map                                                                                    | unit + component    | PASS   |
| 109-035 | Servers cards sum = Dashboard "Active tables" = Floor legend                                                                                        | unit + component    | PASS   |
| 109-036 | Combined scope + off-map + activity across Floor/Servers/Dashboard (demo browser)                                                                   | e2e (desktop)       | PASS   |
| 109-037 | Existing demo e2e (multi-view, dashboard, open-editing) unchanged                                                                                   | e2e (desktop) 77/77 | PASS   |
| 109-040 | Tablet (iPad landscape, WebKit) - allocation spec 50/50; combined/off-map screenshots                                                               | e2e                 | PASS   |
| 109-041 | Mobile (Pixel 7) - full demo suite; combined panel/dialog + off-map note screenshot review                                                          | e2e                 | PASS   |
| 109-042 | Keyboard/a11y: Enter/Space on inner Picker buttons; aria-describedby scope notes; text (not colour) for off-map and undone                          | unit + e2e          | PASS   |
| 109-043 | #134 regression: hosted real-mode UI suite on a production build (`next build` + `next start`, DEV) 18/18; use-board-realtime unit tests in the 559 | real e2e + unit     | PASS   |
| 109-044 | U2 against real board_events (A/B/C scenario: newest-first "assigned Table T7 to TestServer1", no raw payload)                                      | real e2e            | PASS   |

Final gate (after the last code change): prettier (only the untracked workspace file warns), eslint
--max-warnings=0, typecheck, Vitest 64 files / 559 tests, `next build` with DEV env (PROD ref absent
from `.next`), demo Playwright desktop + server-mobile 230/230 (+ host-tablet allocation spec 50/50),
hosted real UI 18/18. pgTAP / `db:test` not run: no migration or DB path changed (the `Database` CI job
does not trigger).

U1 evidence: `picker-cell-click.test.tsx` (6 tests); e2e "Picker: a cell's inner buttons act
without opening the table layout popup" -- fails on the unfixed workspace (dialog opened after
Edit), passes with the fix.
