# Test matrix -- #109 UX Consistency

| ID      | Scenario                                    | Layer      | Result |
| ------- | ------------------------------------------- | ---------- | ------ |
| 109-001 | Picker parent (cell/input) click opens map  | unit + e2e | PASS   |
| 109-002 | Picker inner button does not open map       | unit + e2e | PASS   |
| 109-003 | Picker keyboard Enter/Space on inner button | unit + e2e | PASS   |

U1 evidence: `picker-cell-click.test.tsx` (6 tests); e2e "Picker: a cell's inner buttons act
without opening the table layout popup" -- fails on the unfixed workspace (dialog opened after
Edit), passes with the fix.
