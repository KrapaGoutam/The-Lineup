# V2-005.001 Table Allocation / Rotation — Test Matrix

This matrix formalizes the verification suite for Table Allocation / Rotation location scoping across positive access, security denials, direct database boundaries, and context/UI isolation.

---

## 1. Positive Access Scenarios

| ID        | Case Description                                        | Test Level             | Expected Outcome                                                                                          |
| --------- | ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **AL-01** | Authorized user loads their active location's board     | Integration / Real JWT | Board loads with correct columns, rounds, entries, claims, and physical tables for the verified location. |
| **AL-02** | Authorized server performs permitted board operation    | Unit / Real JWT        | Operation (assign, clear-cell, add-column, transfer, end-table) succeeds and revalidates board.           |
| **AL-03** | Authorized manager performs manager-only operation      | Unit / Real JWT        | Manager creates new session or adds initial column for today.                                             |
| **AL-04** | Session and tables belong to same verified location     | Real JWT / DB          | All queried rows share the exact verified `location_id`.                                                  |
| **AL-05** | Same-org multi-location user switches legitimately      | Real JWT / UI          | Context switch updates active location; board renders new location's independent state.                   |
| **AL-06** | Local date/time zone is resolved from verified location | Unit / Real JWT        | Date calculation respects location's IANA time zone (e.g. `America/Chicago`).                             |
| **AL-07** | Existing conflict and transfer behavior preserved       | Unit / Integration     | Table conflict (PT409) and transfer within the location operate identically to pre-V2.                    |
| **AL-08** | Existing undo/redo behavior preserved                   | Real JWT / DB          | `board_undo` and `board_redo` revert/reapply actions within the verified location's session.              |

---

## 2. Security Denials

| ID        | Case Description                              | Test Level         | Expected Outcome                                                                                                                           |
| --------- | --------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **AL-09** | Anonymous user denied                         | Real JWT / DB      | Unauthenticated caller rejected with `42501` / `UNAUTHENTICATED`.                                                                          |
| **AL-10** | Foreign organization denied                   | Real JWT / DB      | User in Org B cannot read or operate Org A's board.                                                                                        |
| **AL-11** | Same organization, unassigned location denied | Real JWT / DB      | User assigned to Location A attempting to read/operate Location B is denied unless canonical authority (Overall role / Org Owner) permits. |
| **AL-12** | Revoked assignment denied                     | Real JWT / DB      | User with `active = false` assignment is refused access.                                                                                   |
| **AL-13** | Stale workspace denied                        | Unit / Integration | Stale browser expectation (`expectedContext` mismatch) refused before database write.                                                      |
| **AL-14** | Location inactive denied                      | Real JWT / DB      | Inactive location cannot be opened, loaded, or operated.                                                                                   |
| **AL-15** | Location archived denied                      | Real JWT / DB      | Archived location refuses operational reads and mutations.                                                                                 |
| **AL-16** | Session belongs to different location         | Action / Real JWT  | Action targeting session from another location is rejected (`That service session belongs to a different location.`).                      |
| **AL-17** | Round belongs to different session            | DB / RPC           | Attempting to operate on round belonging to another session fails assertion.                                                               |
| **AL-18** | Table belongs to different location           | DB / RPC           | Attempting to assign table registered to another location fails resolution.                                                                |
| **AL-19** | Cross-location transfer denied                | DB / Action        | Cannot transfer assignment between servers across location boundaries.                                                                     |
| **AL-20** | Unauthorized manager-only operation denied    | Real JWT / DB      | Server attempting to open new session when none exists is refused.                                                                         |
| **AL-21** | Invalid IDs denied                            | Unit / Action      | Malformed UUIDs or non-numeric session/round IDs rejected cleanly.                                                                         |
| **AL-22** | Failure leaves database unchanged             | Real JWT / DB      | Denied operation does not create sessions, members, entries, or audit events.                                                              |

---

## 3. Direct Database Access (PostgREST & RPC)

| ID        | Case Description                                      | Test Level       | Expected Outcome                                                                                                                        |
| --------- | ----------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **AL-23** | Direct board RPC with foreign location denied         | Real JWT / pgTAP | Direct call to `board_assign`, `board_add_column`, `board_clear_cell`, `board_undo`, etc. for unassigned location raises `42501`.       |
| **AL-24** | Direct table read respects location RLS               | Real JWT / pgTAP | Direct `select` on `service_sessions`, `dining_tables`, `dining_areas`, `section_assignments` returns 0 rows for unassigned locations.  |
| **AL-25** | Direct mutation cannot bypass session ownership       | Real JWT / pgTAP | Direct `insert`/`update`/`delete` on `table_rotation_entries` or `rotation_rounds` for foreign session fails RLS check.                 |
| **AL-26** | Direct child-row lookup cannot disclose foreign board | Real JWT / pgTAP | Direct `select` on `rotation_members`, `rotation_rounds`, `table_rotation_entries`, `board_events` returns 0 rows for foreign sessions. |
| **AL-27** | Existing organization permissions not broadened       | pgTAP / Audit    | No service-role bypass, no broad grants to `authenticated` or `anon`.                                                                   |
| **AL-28** | Existing role hierarchy remains intact                | Real JWT / DB    | Overall Owner/Manager and Org Owner authority preserved according to accepted matrix.                                                   |

---

## 4. Context and UI States

| ID        | Case Description                                      | Test Level         | Expected Outcome                                                                   |
| --------- | ----------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| **AL-29** | Location A board never displayed in Location B        | Integration / E2E  | Board snapshot renders only active location's columns and tables.                  |
| **AL-30** | Browser Back cannot restore stale operational context | Unit / Guard       | Stale expectation guard detects drift and requires refresh or re-verification.     |
| **AL-31** | Reload maintains verified context                     | Integration        | Full reload re-verifies active location and loads matching board data.             |
| **AL-32** | In-flight context switch prevents stale mutation      | Unit / Action      | In-flight context change causes subsequent actions on old location to fail closed. |
| **AL-33** | Desktop grid and floor remain consistent              | Unit / Integration | Floor map and grid view render identical registered tables for active location.    |
| **AL-34** | Mobile/tablet rendering remains consistent            | Unit / Integration | Responsive views display scoped location data accurately.                          |
| **AL-35** | Demo remains independent from hosted DB               | Unit               | Demo mode uses synthetic in-memory state; no network or DB calls made.             |
| **AL-36** | Existing module navigation filtering remains intact   | Unit / Integration | Module navigation policy respects location module enablement.                      |
