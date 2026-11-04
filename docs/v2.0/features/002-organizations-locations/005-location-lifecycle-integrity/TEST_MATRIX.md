# V2-002.005 — Test Matrix

| ID              | Layer           | Requirement                                                                                           | Evidence                                                  |
| --------------- | --------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| DB-001          | pgTAP 0059      | valid deactivation (Org Owner; warning-only)                                                          | 0059 DB-001a/b/c                                          |
| DB-002          | pgTAP 0059      | valid reactivation, nothing restored                                                                  | DB-002a/b/c                                               |
| DB-003          | pgTAP 0059      | valid archive; stays ARCHIVED                                                                         | DB-003a/b/c                                               |
| DB-004          | pgTAP 0059      | invalid transitions / unknown action / audit CHECK                                                    | DB-004a–e                                                 |
| DB-005          | pgTAP 0059      | archived cannot silently reactivate; restore → INACTIVE                                               | DB-005a–d                                                 |
| DB-006          | pgTAP 0059      | reason required (null, blank, short, long)                                                            | DB-006a–d                                                 |
| DB-007          | pgTAP 0059      | actor server-derived (no actor parameter; audit = auth.uid())                                         | DB-007a/b                                                 |
| DB-008          | pgTAP 0059      | cross-org manager denied; audit read scope                                                            | DB-008a–e                                                 |
| DB-009          | pgTAP 0059      | staff, location manager, overall assistant, anon denied                                               | DB-009a–f                                                 |
| DB-010          | pgTAP 0059      | revoked creator denied (Issue #106)                                                                   | DB-010                                                    |
| DB-011          | pgTAP 0059      | Overall Owner / Manager without membership allowed                                                    | DB-011a/c                                                 |
| DB-012          | pgTAP 0059      | direct `active`/`archived_at` update + insert bypass denied; metadata edit still allowed              | DB-012a–g                                                 |
| DB-013          | pgTAP 0059      | audit generated; no forge/update/delete/truncate                                                      | DB-013, a–j                                               |
| DB-014          | pgTAP 0059      | failed audit insert rolls the transition back                                                         | DB-014a/b                                                 |
| DB-015          | pgTAP 0059      | hard delete denied (privilege, trigger, FK, no definer delete)                                        | DB-015a–g                                                 |
| DB-016          | pgTAP 0059      | blocker detected with real count; hard vs warning vs archive                                          | DB-016a–e                                                 |
| DB-017          | pgTAP 0059      | blocked transition leaves location and audit unchanged                                                | DB-017                                                    |
| DB-018          | pgTAP 0059      | history preserved; corrections (finalize tip pool, close session) allowed                             | DB-018a–e, DB-023g                                        |
| DB-019          | pgTAP 0059      | sibling location unchanged                                                                            | DB-019a                                                   |
| DB-020          | pgTAP 0059      | no automatic staff membership mutation                                                                | DB-020a/b, DB-002c                                        |
| DB-021 / DB-022 | pgTAP 0059      | inactive / archived block assignment (RPC and direct insert)                                          | DB-021a/b, DB-022a/b                                      |
| DB-023          | pgTAP 0059      | operational guards: sessions, activation, periods, tip pools, tasks; trigger inventory (13)           | DB-023a–g                                                 |
| DB-024          | pgTAP + manual  | stale state `LC003`; lock modes; real two-session races                                               | DB-024a–c; EVIDENCE.md race runs                          |
| DB-025          | pgTAP 0059      | legacy `active` compat; no contradictory state                                                        | DB-025a–d                                                 |
| LC-DOM-\*       | Vitest          | status mapping, transitions, reason, evaluation, parsing                                              | `location-lifecycle.test.ts` (20)                         |
| ACT-001…014     | Vitest          | authz, tenant mismatch, forged fields ignored, error mapping                                          | `location-lifecycle-actions.test.ts` (22)                 |
| UI-L01…L14      | Vitest (jsdom)  | dialog: blockers, warnings, reason, pending, failure, stale, archive name, retry, keyboard            | `location-lifecycle-dialog.test.tsx` (14)                 |
| UI-L20…L25      | Vitest (jsdom)  | list actions per state, archived section, authority gating, demo flow + isolation                     | `location-lifecycle-admin.test.tsx` (6)                   |
| E2E-L1…L4       | Playwright      | deactivate → reactivate → archive → history; blockers; keyboard; staff denied; no horizontal overflow | `tests/e2e/location-lifecycle.spec.ts` (desktop + mobile) |
| Regression      | pgTAP 0050–0058 | prior V2 suites unchanged                                                                             | 0050–0058 pass with the migration applied                 |
