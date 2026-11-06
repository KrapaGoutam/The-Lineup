# V2-005.001 - Independent security evidence

Review date: 2026-11-06. Existing PR #306; dedicated issue #307 (parent #253,
program #248, milestone #8). Starting HEAD b2a6ddbd798b5e19cd49c30894d71c2441eecb48.
This replaces the previous unsupported blanket PASS claims.

## Repository and scope

The existing feature worktree was clean; local HEAD and remote feature HEAD matched.
Fetched development 53ad8397dd8712b70846b13b067d9c3c1ef0c06a and main
5e5b7747693b6e81014eafdf299b87e56c3f033d. PR #305 is OPEN/unmerged at
7271141d0bc0c586ffb2d8477439bc938055cb9f; PR #306 was OPEN/mergeable at the starting
HEAD. Parent checkout (docs/recipes-owner-retest-handoff) and all its unrelated
working changes were preserved. Neither PR was merged. Hosted DEV migration metadata was read through list_migrations only: 73 entries,
latest 20261105210000; neither #305 nor #306 migration is deployed there.
No hosted operational data was queried or changed; no hosted database was
migrated, reset or activated. Production and main were untouched.

allocation-data.ts has no local omitted edit and no feature diff. Both operational
callers pass verified scope. Its scope-free locationForLoader path already uses
getPrimaryLocation, which verifies live canonical context and refuses malformed,
foreign, revoked or ambiguous selection. Removing that safe fallback was not
necessary; the earlier STATUS claim that the loader was changed was false.

## Findings and corrections

| ID      | Severity                 | Evidence / exploit                                                                                                                                                                                                                                        | Correction / residual risk                                                                                                                                                                                                            |
| ------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01  | High                     | can_operate_board and board_add_column treated any organization with zero assignment rows as legacy. Baseline actual JWT execution returned a service_sessions row to unassigned staff in a two-active-location fixture.                                  | Require exactly one active/non-archived location AND no assignment records anywhere in the organization. Inactive assignment rows also disable compatibility. Explicit location validation and current membership checks remain.      |
| SEC-02  | High                     | dining_tables_write_manager and dining_areas_write_manager are permissive FOR ALL policies, so their SELECT permission ORs with the new named SELECT policy. A-only shift-manager access was not constrained by replacing SELECT alone.                   | Restrictive location policies cover ALL commands on both tables. Focused pgTAP assertions prove B tables/areas remain invisible to A shift manager. Existing manager write grants are not broadened.                                  |
| SEC-03  | High                     | Organization Owner/GM exemption bypassed explicit operational assignments required by ACCESS_MODEL.md section 5 and resolveUserAccess.                                                                                                                    | Remove caller/target exemptions. Explicit Owner/GM denial tests added; historical label-resolution fixture actors receive assignments with all 58 original assertions preserved.                                                      |
| QA-01   | High verification defect | Original JWT fixture inserted nonexistent location_memberships.organization_id; several denial tests called nonexistent board_assign_table. npm test excludes the real config. Those assertions could not substantiate the stated authorization coverage. | Correct fixture schema/cleanup; add explicit loopback-only harness mode; call actual board_assign and reject PGRST missing-function errors as denial evidence. Snapshot all six persisted board graph tables for every tested denial. |
| AUTH-01 | Low consistency defect   | Historical action did getCurrentUser/auth.getUser but omitted the common explicit requireLiveSession guard used by other board actions.                                                                                                                   | Apply the existing guard before historical reads; focused expired-session unit assertion proves loader is not reached.                                                                                                                |

The membership-only has_board_role helper is used inside the allocation scope
check instead of reintroducing legacy has_org_role semantics. No global role
helper or unrelated module was changed. Target employee eligibility now precedes
session creation. RPC failure remains transactional. No FK, table, public RPC
signature or generated public type changed.

NULL location is an INTERNAL preliminary gate in begin_board_write, never a
location selector. Overall or valid member authority may pass that preliminary
check, but the session lock then resolves and reauthorizes a concrete location.
board_add_column now explicitly refuses NULL; the old session-creation helper
also requires a real location/time zone. Real JWT and pgTAP NULL public calls
are denied without durable graph changes.

## Action and database review

executeBoardActionRemote, undoBoardAction, redoBoardAction and historical reads
re-authenticate and bind caller organization plus canonical server location.
The browser expectation is a comparison only. Omitted legacy expectations resolve
from server context; a forged input location cannot select a different workspace.
Client organization/time zone do not determine the mutation target/date. Every
non-null supplied session is checked against verified organization/location.
Round/member RPC seams assert parent-session ownership; table labels resolve
against the concrete location. Denials return no foreign board detail.

All eight protected table reads were reviewed. Session-based child policies use
an empty-search_path SECURITY DEFINER parent lookup without RLS recursion.
Grants remain explicit; PUBLIC/anon EXECUTE is revoked on public RPCs. Trusted
mutation migration already revoked direct client graph writes, so adding direct
write policies would be incorrect. Session serialization (FOR NO KEY UPDATE),
historical/finalized locks, audit attribution and occupied-table safeguards remain.

Overall-only identity is still a pre-existing integration limitation: getCurrentUser
and several board-manager/actor FK contracts require organization membership for
writes. SQL and real-JWT reads cover all three Overall roles; actual no-membership
board_add_column attempts fail with 23503 actor-membership FK violations and
leave persisted state unchanged. The application getCurrentUser path likewise
requires tenant membership. This review does not silently widen manager privileges
or relax actor FKs. Owner acceptance of this remaining coverage/contract limit is
required before a blanket GO for the entire canonical hierarchy.

## Actual standalone execution

Verified local project restaurant-roster: API http://127.0.0.1:54321; database
127.0.0.1:54322/postgres in supabase_db_restaurant-roster. JobQuest2.0 uses
55321/55322 and was neither stopped nor changed. CLI 2.76.8. The local database
had zero organizations/Auth users before reset. No environment file was written. The final local catalog audit confirms all eight
protected tables have RLS; all 17 public board RPCs are SECURITY DEFINER with
empty search_path, authenticated EXECUTE and no anon EXECUTE. Final residue:
zero organizations, profiles, Auth users and module-config rows; enforcement staged.
Local credentials were read into process environment from supabase status JSON.

- npm ci --no-audit --no-fund: PASS.
- npm run check: PASS (formatting, zero-warning lint and TypeScript); final documentation formatting also checked.
- npm run check:local-paths: PASS.
- npm test: 233 files; 3,163 passed, 7 skipped, 0 failed (3,170 total).
- npx next build --webpack: PASS.
- npx supabase db reset --local --no-seed: PASS, full standalone replay.
- npx supabase test db: PASS, 63 files / 2,077 assertions (allocation 65).
- LINEUP_REAL_LOCAL=1 plus process-only local URL/keys;
  npx vitest run --config vitest.real.config.ts tests/real/table-allocation-location-scoping.real.test.ts:
  PASS, 23 passed / 0 failed / 0 skipped. Three tests reproduce the known Overall actor-FK write limitation; their passing status is not proof that Overall mutations work.

Baseline reproduction ran that actual suite before the SQL correction: 16 passed,
2 failed. One failure was the reproduced data leak; the other was an overly
specific test error-message regex, corrected from round to row. Final denials
verify unchanged sessions, columns, rounds, entries, claims and events. Fixture
teardown checks organization/profile/Auth IDs; subsequent independent SQL counts
confirmed zero organizations and Auth users.

## PR #305 compatibility

Disposable detached worktree: .tmp/v2-allocation-review-integration, rooted at
#305 7271141 plus local no-commit merge of #306 b2a6ddb and reviewed fixes copied
from the feature worktree. It does not move development or either PR branch.

Migration order: 20261106120000 then 20261106150000. #306 does NOT redefine
begin*board_write, so #305's assert_location_module_enabled(v_location,
'table_allocation') assertion remains. Distinct restrictive
module policies and location policies AND together. No defaults activate
backend enforcement. Both distinct 0063*\* pgTAP files execute; prefix uniqueness
is not a runner requirement, so neither file nor applied migration was renamed.

Actual integration conflicts: allocation-actions.ts and tasks/current-task.md.
Minimal safe action resolution: retain #306 caller, expectation, verified time
zone, session and scope logic; retain #305 guardModule import/calls for execute,
undo, redo and date reads. Pass verified caller organization/location, and run
the mutation guard after location resolution but BEFORE session queries. Date
reads guard before loading. Checklist reconciliation is documentation only.
The combined #305 SQL and local-JWT fixtures also require explicit owner assignments to preserve their module-denial assertions under canonical scope. This adaptation is confined to the disposable workspace; #305 is untouched. The first local resolution ran guards too late for #305's denial tests; moving
them before session reads corrected it. Real PR #305 remains unchanged.

- Clean combined db reset: PASS.
- Combined pgTAP: PASS, 64 files / 2,136 assertions.
- Combined allocation real JWT: PASS, 23/23, none skipped (including three regression assertions that demonstrate the unresolved Overall actor-FK limitation).
- #305 module-enforcement local JWT: PASS, 15/15; synthetic activation tests restore
  staged mode and verify no fixture residue.
- Combined focused action/module units: PASS, 14 files / 183 tests.
- Combined TypeScript and production webpack build: PASS.

#306 can be reviewed/merged as code independently: it does not import #305's
application module guard or depend on its migration. Hosted deployment order
needs owner coordination: #305's earlier migration would be missing if #306 is
applied first, and the checked-in deploy command is plain supabase db push
(no include-all). Prefer #305 then #306 with the documented conflict resolution;
keep enforcement staged. This is a recommendation, not merge authorization.
Hosted DEV module configuration/activation remains an owner decision. A skipped
production-only deploy job proves nothing about hosted DEV migration presence.

## Browser execution and limitations

Demo command: PLAYWRIGHT_BASE_URL=http://localhost:3126 npx playwright test
tests/e2e/allocation-open-editing.spec.ts tests/e2e/table-rotation-multi-view.spec.ts --workers=3.
Initial: 155 passed / 4 failed / 0 skipped, 159 total, across desktop Chromium,
WebKit iPad and Chromium mobile. All four failed cases passed targeted serial reruns (WebKit 3/3, mobile 1/1). The initial run remains a recorded flaky 155/159, not a falsely reported clean single run.

New authenticated command: LINEUP_REAL_LOCAL=1 plus process-only local credentials;
npx playwright test --config playwright.allocation-local.config.ts.
The application is the production-built combined workspace on localhost:3127;
fixtures, memberships and module rows are synthetic. Real Supabase SSR session
cookies are issued in memory; traces disabled so JWT cookies are not persisted.
The first dev-server run passed both WebKit cases; desktop hit a cold-compile
poll timeout and mobile taps were intercepted by a development overlay. The
production-build run then exposed a test-navigation race (the synthetic fixture has only Allocation enabled, so clicking More was unnecessary). The corrected helper waits for the mounted Grid. Final authenticated run: 6/6 PASS across all three devices, no skipped tests.

Tests cover board switching, independent sessions, scoped column rendering,
assignment and undo/redo persistence, reload, Back non-disclosure, unauthorized
deep links and disabled-module non-mounting. Existing demo flow covers transfer;
new local acceptance does not drive every transfer permutation, browser Forward,
concurrent tab races, or live The Monk's/Liquor Tap configuration. Hosted DEV
browser acceptance is SKIPPED: read-only ledger verification confirms both pending
migrations absent, and this task forbids deploying them. No hosted configuration was changed to obtain a pass.

## Delivery

Issue: https://github.com/KrapaGoutam/The-Lineup/issues/307
PR: https://github.com/KrapaGoutam/The-Lineup/pull/306
Final-head checks and decision are recorded on the existing PR after pushing.
No old-head check is used as evidence for a new commit. Local detailed logs and
screenshots live under ignored artifacts/security-review and test-results;
no credentials, screenshots, logs or unrelated files belong in the commit.

## Final technical disposition

BLOCKED for unconditional V2-005.001 completion: Overall-only cross-tenant writes conflict with existing membership-based identity and audit-FK contracts. The regression tests intentionally capture this failure; they are not acceptance of it. Repair requires a separately reviewed identity/audit-contract change, or explicit owner acceptance of a bounded limitation. Do not relax FKs or create shadow memberships merely to turn a test green. PR #305 activation and merge/deployment order remain owner-controlled.

A temporary heterogeneous fixture insert omitted role on staff rows after manager rows were added, causing setup failure (23 skipped; no authorization tests executed in that run). Corrected every row to carry its explicit role. Verified residue was exactly two synthetic organizations and six harness Auth users; local replay removed it before the successful final 23-test run. No existing data was involved.
