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

## Executed assertion reconciliation - independent review

Scenario identifiers describe requirements, not test counts. The original JWT file did not execute under npm test, inserted a nonexistent organization_id column into location_memberships, and used nonexistent board_assign_table RPCs for several denials. Those denials are replaced with actual board_assign calls; the harness now rejects missing-RPC errors as authorization evidence.

| IDs                                                      | Independent executable evidence / limit                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AL-01/02/03/04/08/10/11/12/14/15/16/17/18/22/23/24/26/28 | 23-test local JWT suite: assigned access, manager operations, undo/redo, foreign org/location/round, revocation, lifecycle, physical table mapping, NULL and exact persisted graph snapshots on denial. AL-18 verifies same-label resolution to A, not rejection of valid off-map text. |
| AL-09/25/27                                              | Anonymous RPC EXECUTE denial, direct rotation-round INSERT denied, existing grants/RPC seams reviewed plus pgTAP. Direct write case does not imply every CRUD verb was separately executed.                                                                                             |
| AL-06/13/16/21/30/32                                     | 15 focused action unit tests plus existing context/time-zone suites. Includes omitted expectation with forged location and ambiguous legacy undo. Malformed payload handling is not exhaustive.                                                                                         |
| AL-07/19/20                                              | Existing cross-view/domain and trusted-RPC pgTAP coverage; focused browser regressions separately recorded. No blanket claim every permutation has real-JWT coverage.                                                                                                                   |
| AL-05/29/31/34/36                                        | New local authenticated Playwright suite exercises independent boards, switch/reload, persisted assign/undo/redo, foreign deep link and disabled module across configured devices; final execution totals are in EVIDENCE.md.                                                           |
| AL-30/32/33/35                                           | Existing history/stale-context guard, cross-view read-model and demo regression suites; authenticated Back is checked for non-disclosure, but Forward and concurrent in-flight cross-tab races are not exhaustively re-driven here.                                                     |

Audit A-E additionally covers sole-active-location compatibility; two active locations with no assignments; partial rollout; inactive assignment in a sole-active-location org; and public NULL-location refusal. pgTAP expands from 53 to 65 assertions. Both distinct 0063\_\* filenames execute together; no renumbering is required by the runner.

Previous independent review (superseded by the repair below): three additional actual JWT tests proved Overall Owner/Manager/Assistant Manager can read without tenant membership but mutation fails with 23503 due to actor membership FKs. This is a BLOCKER, not a successful mutation claim. Two further JWT cases reject unassigned Organization Owner/GM; organization admin is not operational location authority under the canonical resolver. Final local JWT suite has 23 tests.

## Overall repair acceptance - current results supersede the earlier limitation

Actual real-JWT suites: table-allocation-location-scoping (23) and
allocation-overall-actor (22), 45 cases total, no skipped acceptance cases.

| ID    | Actual assertion                                                                                                                       | Result |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OA-01 | Membership-free Overall Owner opens floor, assigns and ends table                                                                      | PASS   |
| OA-02 | Membership-free Overall Manager opens floor, assigns and ends table                                                                    | PASS   |
| OA-03 | Membership-free Overall Assistant Manager does permitted floor operations                                                              | PASS   |
| OA-04 | Event actor/profile, organization, concrete location, operation and timestamp; empty membership roles and exact effective Overall tier | PASS   |
| OA-05 | Different Overall actor undoes/redoes; immutable original event and reversal linkage; renewed assignment attributed to redo actor      | PASS   |
| OA-06 | Every Overall tier mutates second organization without any tenant memberships                                                          | PASS   |
| OA-07 | Existing organization-member manager mutation and physical claim persist                                                               | PASS   |
| OA-08 | Assigned server mutation and physical claim persist                                                                                    | PASS   |
| OA-09 | Overall Assistant Manager denied actual Manager-only assignment management; assignment rows unchanged                                  | PASS   |
| OA-10 | Overall Manager denied Owner-only provision_organization                                                                               | PASS   |
| OA-11 | Ordinary server cannot insert trusted Overall role                                                                                     | PASS   |
| OA-12 | A-only staff denied B; no graph changes                                                                                                | PASS   |
| OA-13 | Foreign member without Overall denied A                                                                                                | PASS   |
| OA-14 | Inactive tenant membership denied despite remaining location assignment                                                                | PASS   |
| OA-15 | Inactive location denied to Overall Owner                                                                                              | PASS   |
| OA-16 | Archived location denied to Overall Owner                                                                                              | PASS   |
| OA-17 | Raw board-event insertion with forged actor denied                                                                                     | PASS   |
| OA-18 | Mismatched organization/location and NULL public location denied; action tests reject forged/stale expectations                        | PASS   |
| OA-19 | Wrong-organization session and foreign-location round denied                                                                           | PASS   |
| OA-20 | Every denial snapshots all six persisted graph tables; tier denials additionally check relevant identity/assignment rows               | PASS   |
| OA-21 | Existing Audit A/B/D tests preserve one-active-location/zero-assignment compatibility and deny multi-location/revoked fallback         | PASS   |
| OA-22 | Overall role revocation denies the same unrefreshed Auth JWT immediately                                                               | PASS   |

Additional tests: serialized simultaneous events from three Overall actors;
transactional failure creates no event; legacy actor names remain available after
location assignment removal; validated actor FKs and preserved participant/tenant
constraints (27 new pgTAP assertions); immutable actor-name presenter fallback.
All current board actions have existing open-editing capability. OA-09/10 test the
accepted higher-tier assignment-management and tenant-provisioning boundaries,
not invented board restrictions.

Browser acceptance now adds each Overall role to the existing two scoped scenarios:
5 scenarios x desktop Chromium / WebKit iPad / mobile = 15. Each Overall scenario
writes through the actual Server Action, confirms the persisted actor, undoes and
redoes, and checks the rendered actor name before and after reload. Stale-context,
expired historical session, unassigned deep-link and disabled-module regressions
retain their existing action/browser coverage. Totals and limitations: EVIDENCE.md.
