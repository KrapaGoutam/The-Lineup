# V2-004.004 — Test Matrix

Companion to [PLAN.md](PLAN.md). Maps the BE-01…BE-50 matrix to the tests that exist. Status is what actually ran — see [EVIDENCE.md](EVIDENCE.md) for counts and commands.

Suites: **U** = Vitest unit (`npm test`) · **DB** = pgTAP `0063_module_backend_enforcement.test.sql` (`BE-DB-nn`, local stack) · **L** = real-JWT suite on the disposable local stack (`npm run test:local`, loopback-only) · **H** = hosted DEV.

`PASS` = automated test exists and passed. `PARTIAL` = the Server Action layer is tested but a database/direct-access leg is **BLOCKED on V2-005** (organization-level data with no `location_id`). `BLOCKED — ENVIRONMENT ACTIVATION` = cannot be exercised on hosted DEV because DEV is not reconciled (the activation gate refuses it). Nothing is marked PASS on the strength of a mock alone where a real leg was possible.

## Domain guard

| ID    | Expectation                                         | Tests                                                                                      | Status |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| BE-01 | Explicit Enabled permits (subject to existing auth) | U `module-enforcement.test.ts` BE-01; U data "active: allows an explicitly Enabled module" | PASS   |
| BE-02 | Explicit Disabled denies                            | U BE-02; DB-24/25                                                                          | PASS   |
| BE-03 | Missing denies when active                          | U BE-03 (all 9 modules); DB-28                                                             | PASS   |
| BE-04 | Invalid configuration denies                        | U BE-04                                                                                    | PASS   |
| BE-05 | Schema missing fails closed when active             | U BE-05                                                                                    | PASS   |
| BE-06 | Database unavailable fails closed when active       | U BE-06; U data BE-05/06                                                                   | PASS   |
| BE-07 | Unauthorized denies                                 | U BE-07                                                                                    | PASS   |
| BE-08 | Invalid module key denies                           | U BE-08 (both modes); U data BE-08                                                         | PASS   |
| BE-09 | Settings / system-required stays available          | U BE-09 (incl. switch unreadable); DB-59; L-BE28/40                                        | PASS   |
| BE-10 | One location's Enabled row does not grant another   | U BE-10; DB-25; U data "VERIFIED location only"; L-BE49                                    | PASS   |

## Authentication and authorization

| ID    | Expectation                                      | Tests                                                                                                                 | Status |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------ |
| BE-11 | Anonymous denies                                 | U data BE-11 (`sessionInvalid`); `anon` has no `EXECUTE` on any operational RPC; L-BE46 (anon cannot read the switch) | PASS   |
| BE-12 | Staff cannot gain management rights from Enabled | DB-40; L-BE12                                                                                                         | PASS   |
| BE-13 | Revoked membership denies                        | DB-55                                                                                                                 | PASS   |
| BE-14 | Foreign organization denies (and learns nothing) | DB-41; L-BE14                                                                                                         | PASS   |
| BE-15 | Wrong location denies                            | DB-56; U data "claimed ≠ verified ⇒ stale"; U-DEN `claimedLocationId`                                                 | PASS   |
| BE-16 | Inactive location denies operational access      | DB-30, DB-57; U (`location_unavailable`)                                                                              | PASS   |
| BE-17 | Archived location denies operational access      | DB-58; U (`location_unavailable`)                                                                                     | PASS   |
| BE-18 | Stale workspace denies                           | U data BE-18; existing Tasks MT-11…MT-13 (retained)                                                                   | PASS   |
| BE-19 | Session/account mismatch denies                  | existing V2-003.005 `different_user` coverage (retained, unchanged); guard uses the same live session                 | PASS   |
| BE-20 | Denied operation causes no data change           | DB-38/39; L-BE32; U-DEN (database client never called)                                                                | PASS   |

## Module operations

| ID    | Expectation                                                  | Tests                                                                                                                                                                                                 | Status                                                                     |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| BE-21 | Allocation action and RPC denied when Disabled               | U-DEN ×2; DB-36/37; catalog query: 17/17 board RPCs reach the seam                                                                                                                                    | PASS                                                                       |
| BE-22 | Tasks action and RPC denied when Disabled                    | U-TASKS (write, snapshot, history); DB-31/32/33; L-BE22; 17/17 RPCs reach seam                                                                                                                        | PASS                                                                       |
| BE-23 | Tips action and RPC denied when Disabled                     | U-DEN; DB-46/47; L-BE31                                                                                                                                                                               | PASS                                                                       |
| BE-24 | Schedule action and RPC denied when Disabled                 | U-DEN (delete, publish); DB-44/45                                                                                                                                                                     | PASS                                                                       |
| BE-25 | Attendance action and exposed data path denied               | U-COV (7/7 guarded). Data = external Neon (read-only); `attendance_identity_links` has no `location_id`                                                                                               | PARTIAL — action PASS; DB leg BLOCKED (V2-005)                             |
| BE-26 | Payroll action/export denied when Disabled                   | U-COV (21/21 guarded)                                                                                                                                                                                 | PARTIAL — action PASS; DB leg BLOCKED (V2-005)                             |
| BE-27 | Inventory action and RPC denied when Disabled                | U-DEN; DB-34/35; L-BE27; 28/28 RPCs reach seam                                                                                                                                                        | PASS                                                                       |
| BE-28 | Recipes action / direct data path denied                     | U-DEN, U-COV (11/11 guarded)                                                                                                                                                                          | PARTIAL — action PASS; direct data path BLOCKED (V2-005, no `location_id`) |
| BE-29 | Team optional operation denied when Disabled                 | U-DEN (rename, designation)                                                                                                                                                                           | PARTIAL — action PASS; DB leg BLOCKED (V2-005)                             |
| BE-30 | Direct HTTP mutation bypass denied                           | The 9 route handlers are identity/credential routes only and may not import the guard (`module-isolation.test.ts`); no operational HTTP route exists. Server Action POSTs are the action layer above. | PASS (by inventory)                                                        |
| BE-31 | Direct authenticated PostgREST bypass denied (where exposed) | DB-42…47; L-BE31; reads: DB-48/49, L (protected reads)                                                                                                                                                | PASS for location-bound tables; org-level tables **BLOCKED (V2-005)**      |
| BE-32 | Direct exposed RPC bypass denied                             | DB-32/33/35/36/37; L-BE32; L-BE27                                                                                                                                                                     | PASS                                                                       |

## Recovery and shared data

| ID    | Expectation                                       | Tests                                                                                                                                                                                       | Status                                           |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| BE-33 | Authorized account reset works with Team Disabled | `/api/auth/passcode/reset` and `loadAccountRecoveryAction` are exempt and cannot import the guard (U-COV exemption list + `module-isolation.test.ts`); existing account-recovery tests pass | PASS (structural); browser leg N/A — see Rollout |
| BE-34 | Unauthorized account reset denied                 | route unchanged; existing role/target tests retained                                                                                                                                        | PASS (unchanged)                                 |
| BE-35 | Self-service change remains available             | exempt route (same structural proof)                                                                                                                                                        | PASS (structural)                                |
| BE-36 | Sign-in and sign-out work                         | exempt routes (same structural proof)                                                                                                                                                       | PASS (structural)                                |
| BE-37 | Context switching works                           | `context-actions.ts` on the exemption list (U-COV)                                                                                                                                          | PASS (structural)                                |
| BE-38 | Settings works with all modules Disabled          | U BE-09; DB-50/51; L-BE28/40                                                                                                                                                                | PASS                                             |
| BE-39 | Settings works with all modules Missing           | U BE-09 (empty snapshot)                                                                                                                                                                    | PASS                                             |
| BE-40 | Shared organization data is not deleted           | L-BE28/40 (vendor preserved); L (staged-era task hidden, **not deleted**); DB-59                                                                                                            | PASS                                             |
| BE-41 | Inventory catalog preserved                       | DB-59 (no policy on vendors/products/categories); L-BE28/40                                                                                                                                 | PASS                                             |
| BE-42 | Recipe book preserved                             | DB-59 (no policy on `bar_recipe*`)                                                                                                                                                          | PASS                                             |

## Rollout

| ID    | Expectation                                                  | Tests                                                                                                                        | Status                                                         |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| BE-43 | Readiness rejects missing active-location rows               | U `module-readiness.test.ts`; script test; DB-07/08/12; L-BE43                                                               | PASS                                                           |
| BE-44 | Readiness accepts explicitly complete valid configuration    | U; script test; DB-09/19/20; L-BE44                                                                                          | PASS                                                           |
| BE-45 | Readiness does not mutate rows                               | U; DB-14; L-BE45                                                                                                             | PASS                                                           |
| BE-46 | Activation cannot be controlled by an untrusted client       | DB-15/16/17/18; L-BE46; U data BE-46                                                                                         | PASS                                                           |
| BE-47 | Pre-activation behaviour matches the documented safe rollout | U staged tests; DB-03…06; L-BE47; full pgTAP (all pre-existing files unchanged); page-data tests                             | PASS                                                           |
| BE-48 | Active enforcement denies Disabled operations                | DB-31…37, 42…47; L-BE22/27/31/32; U data BE-48                                                                               | PASS (local) · hosted DEV **BLOCKED — ENVIRONMENT ACTIVATION** |
| BE-49 | Independent DEV user sessions cannot bypass enforcement      | L-BE49 (real JWTs, local stack)                                                                                              | PASS (local) · hosted DEV **BLOCKED — ENVIRONMENT ACTIVATION** |
| BE-50 | Existing DEV locations not silently backfilled               | Hosted DEV read-only readiness before/after: 44 active locations, **0** rows; pgTAP 0062 MC-013a (migration inserts no rows) | PASS                                                           |

## Additional tests

| Area                | Test                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness        | `enforcement-coverage.test.ts`: 98 exported Server Actions — every one is guarded or on the reasoned exemption list; module keys are valid registry keys. Mutation-checked (removing a guard fails `enforcement-denial`). |
| Isolation           | `module-isolation.test.ts`: only `lib/page-data.ts` and `features/*/actions/*.ts` may import the enforcement entry; routes and components may not.                                                                        |
| Reversibility       | DB-52/53/54; L (back to staged restores legacy behaviour)                                                                                                                                                                 |
| Authorization order | DB-40/41/55/56: unauthorized callers get the existing error, never module state                                                                                                                                           |
| Script safety       | `module-enforcement-readiness.test.ts`: refuses Production and any non-DEV hosted project; no drift between SQL rule, typed evaluator and script                                                                          |
