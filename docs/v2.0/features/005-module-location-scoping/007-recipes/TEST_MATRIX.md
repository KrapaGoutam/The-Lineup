# Feature V2-005.007: Recipes Test Matrix

## Test Scenarios

| Test ID   | Area        | Scenario                                                    | Expected Outcome                                                                                      |
| --------- | ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TC-REC-01 | Sharing     | Switch between Location A and Location B in same org        | Canonical recipes and categories remain identical across locations                                    |
| TC-REC-02 | Isolation   | Switch to another Organization C                            | Shows only Organization C recipes; zero leakage from Org A                                            |
| TC-REC-03 | Roles       | Staff role views recipe index                               | Sees active recipes only; archived recipes hidden                                                     |
| TC-REC-04 | Roles       | Manager role views recipe index                             | Sees active + archived recipes with management controls                                               |
| TC-REC-05 | Roles       | Staff role attempts to save or archive a recipe             | Denied with permission error                                                                          |
| TC-REC-06 | Roles       | Overall Owner / Manager without org membership edits recipe | Succeeds cleanly; updated_by / created_by FKs reference profile                                       |
| TC-REC-07 | Variants    | Recipe detail loads Perfect and House variants              | Both variants, ingredients, steps, and garnishes accurately populated                                 |
| TC-REC-08 | Concurrency | Concurrent edits with stale version                         | Returns version conflict error                                                                        |
| TC-REC-09 | Images      | Image upload and retrieval from private storage             | Private storage policy checks `recipes_can_read_image` / `write_image`; signed URLs generate properly |
| TC-REC-10 | Enforcement | Module disabled at location                                 | `guardModule` blocks access; RPC raises 42501                                                         |
| TC-REC-11 | Direct DML  | Direct PostgREST INSERT/UPDATE/DELETE on recipe tables      | Rejected by database grants (SELECT only for authenticated)                                           |

## Independent review additions (Batch B)

| Test ID   | Area        | Scenario                                                                                     | Where                                |
| --------- | ----------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| TC-REC-12 | Sharing     | Location-manager edit visible to staff and managers at every location; staff see active only | pgTAP 0070 RV-056..060; browser      |
| TC-REC-13 | Isolation   | Foreign owner and revoked member read/write nothing                                          | pgTAP 0070 RV-061..064; hosted probe |
| TC-REC-14 | Images      | Path organization must own the recipe; archived images hidden from staff; revoked denied     | pgTAP 0070 RV-069..075; hosted probe |
| TC-REC-15 | Attribution | Authorship is the real caller; importer with an actor parameter is not client-callable       | pgTAP 0070 RV-051, RV-066            |
