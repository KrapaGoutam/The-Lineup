# The Lineup V2.0 — Release Gates & Definition of Done

This document defines the strict gate criteria that each phase and feature in V2.0 must satisfy before merging to `development`, and the final criteria required before promoting `development` to `main` (Production).

---

## 1. Feature Definition of Done (Subfeature Level)

Every individual subfeature must satisfy:

1. **Acceptance Criteria**: All approved acceptance requirements in the subfeature spec pass.
2. **Zero `any` Types**: TypeScript typecheck (`npm run check`) passes with zero avoidable `any` and zero errors.
3. **Multi-State UI**: Loading, empty, active, error, permission-denied, and responsive mobile/tablet states are implemented.
4. **Security & RLS**: Every modified table has enabled RLS, explicit authenticated grants, and covering pgTAP policy tests.
5. **Deterministic Business Rules**: Pure logic is covered by unit tests in Vitest outside Next.js bundler dependencies.
6. **Hosted DEV Parity**: Where schema changes occur, migrations apply cleanly to hosted DEV (`opmujepkemwcdxxorhfd`) without residue.
7. **No Commits to `main`**: All subfeature PRs target `development`.
8. **Documentation Synchronized**: `CURRENT_STATE.md`, feature `STATUS.md`, and the linked GitHub issue/milestone are updated.

---

## 2. Top-Level Phase Gates

| Phase                                        | Milestone Gate Criteria                                                                                                                                         | Required Evidence                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **V2-001: Access & Role Foundation**         | Overall Roles, Organization Memberships, and Location Assignments operational; #106 creator bypass removed from `private.has_org_role`; pgTAP RLS suite passes. | Full pgTAP suite green; resolver unit tests green; hosted DEV migration applied.            |
| **V2-002: Organizations & Locations**        | Admin UI can create and manage branches; staff assignment lifecycle active; cascade integrity verified.                                                         | Playwright manager branch CRUD tests; location assignment lifecycle tests.                  |
| **V2-003: Active Context**                   | Context switcher in App Shell; auto-resolution for single-context users; multi-tab safety verified.                                                             | Playwright context switching tests; cross-tab sync tests.                                   |
| **V2-004: Location Module Configuration**    | Modules toggleable per branch; navigation and Server Actions enforce module disablement.                                                                        | Unit tests on config contract; Playwright navigation hiding tests; backend rejection tests. |
| **V2-005: Existing Module Location Scoping** | Rotation, Tasks, Tips, Schedule, Inventory, and Settings operate seamlessly within active location.                                                             | Full existing regression suites green; no cross-location data leakage.                      |
| **V2-006: Attendance V2**                    | Native Lineup attendance data model operational; manager adjustments audited; Neon compatibility verified.                                                      | Vitest and pgTAP attendance tests; timesheet adjustment audit log assertions.               |
| **V2-007: Clock In / Out Kiosk**             | Kiosk surface operational; in-app device pairing; employee PIN clocking; fail-closed revocation verified.                                                       | Playwright kiosk touch flow; tablet viewport validation; token revocation tests.            |
| **V2-008: Migration & Compatibility**        | Monks pilot backfilled to Webster; existing staff assigned; default external attendance unbroken.                                                               | Hosted DEV migration rehearsal report; zero-downtime forward migration script.              |
| **V2-009: Final Security & Release Gate**    | Complete automated test suite green; manual owner acceptance; production preflight complete.                                                                    | Final release audit document; formal owner sign-off.                                        |

---

## 3. Final Production Release Gate (V2-009 &rarr; `main`)

Promotion from `development` to `main` requires:

- [ ] **Cross-Organization Tenant Boundary Gate**: Zero data cross-talk under automated adversarial tests.
- [ ] **Cross-Location Security Gate**: Location-scoped staff strictly restricted to their assigned branches.
- [ ] **Permanent Acceptance Scenarios**: 100% pass on Jack, Sam, Tom, Jerry, and John test suites.
- [ ] **Kiosk Fail-Closed Gate**: Revoked or misconfigured devices rejected 100% of the time.
- [ ] **Full Suite Green**: `npm run check`, Vitest (2,000+ tests), pgTAP suites, and Playwright suites pass.
- [ ] **Production Migration Preflight**: Forward migrations dry-run and ready for expand/migrate/contract execution.
- [ ] **Owner Sign-Off**: Explicit, written approval from product owner before git merge to `main`.
