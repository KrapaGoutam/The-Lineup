# Test matrix -- #109 UX Consistency

| ID      | Scenario                                                            | Layer      | Result |
| ------- | ------------------------------------------------------------------- | ---------- | ------ |
| 109-001 | Picker parent (cell/input) click opens map                          | unit + e2e | PASS   |
| 109-002 | Picker inner button does not open map                               | unit + e2e | PASS   |
| 109-003 | Picker keyboard Enter/Space on inner button                         | unit + e2e | PASS   |
| 109-010 | Assign event display                                                | unit       | PASS   |
| 109-011 | End / displaced-assign event display                                | unit       | PASS   |
| 109-012 | Transfer (combined label) event display                             | unit       | PASS   |
| 109-013 | Undo / Redo display + undone marker                                 | unit       | PASS   |
| 109-014 | Unknown event, inherited names, malformed payloads fall back safely | unit       | PASS   |
| 109-015 | All 18 enum values covered (enum-driven)                            | unit       | PASS   |
| 109-016 | Newest-first deterministic ordering (created_at, id) and cap        | unit       | PASS   |
| 109-017 | Dashboard list render, undone text, time zone, unreadable timestamp | component  | PASS   |

U1 evidence: `picker-cell-click.test.tsx` (6 tests); e2e "Picker: a cell's inner buttons act
without opening the table layout popup" -- fails on the unfixed workspace (dialog opened after
Edit), passes with the fix.
