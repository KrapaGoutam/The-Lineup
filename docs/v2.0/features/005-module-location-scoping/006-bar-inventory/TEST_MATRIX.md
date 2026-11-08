# Feature V2-005.006: Bar Inventory Test Matrix

## Test Scenarios

| Test ID   | Area        | Scenario                                                  | Expected Outcome                                                                     |
| --------- | ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TC-INV-01 | Isolation   | Manager at Location A reads inventory snapshot            | Sees Location A stock quantities; does not see Location B stock                      |
| TC-INV-02 | Isolation   | Stock adjustment at Location A                            | Updates Location A on-hand/backup; Location B stock remains completely unchanged     |
| TC-INV-03 | Sharing     | Product created by Location A manager                     | Appears in catalog for both Location A and Location B                                |
| TC-INV-04 | Concurrency | Optimistic version conflict on stock update               | Returns `CatalogConflict` with current database version                              |
| TC-INV-05 | History     | History entries generated at Location A                   | Listed only under Location A; zero leakage into Location B                           |
| TC-INV-06 | Drafts      | Order draft created at Location A                         | Visible and editable only at Location A; invisible at Location B                     |
| TC-INV-07 | Drafts      | Order draft mark sent                                     | Transitions to 'sent' state; immutable thereafter; recorded with sent_by and sent_at |
| TC-INV-08 | Import      | CSV import commit at Location A                           | Updates stock strictly at Location A; import batch isolated to Location A            |
| TC-INV-09 | Authority   | Overall Owner / Manager without org membership            | Authoritative operations succeed; actor FK references profile cleanly                |
| TC-INV-10 | Authority   | Location Staff attempts inventory operation               | Denied (`level < 2`) with standard permission message                                |
| TC-INV-11 | Authority   | Cross-organization actor attempts inventory operation     | Denied with 42501 Unauthorized                                                       |
| TC-INV-12 | Context     | Stale workspace context passed                            | Rejected by `assertWorkspaceExpectation` with stale-context recovery signal          |
| TC-INV-13 | Enforcement | Module disabled at location                               | `guardModule` blocks access; RPC raises 42501                                        |
| TC-INV-14 | Direct DML  | Direct PostgREST INSERT/UPDATE/DELETE on inventory tables | Rejected by database grants (SELECT only for authenticated)                          |
