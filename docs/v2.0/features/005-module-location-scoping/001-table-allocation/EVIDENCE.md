# V2-005.001 — Evidence: Table Allocation / Rotation Location Scoping

Environment: Local Windows workspace (`.tmp/v2-allocation-location-scoping`).  
Date: 2026-11-06.  
Status: **COMPLETE — Implementation, full database pgTAP suite, unit test suite, real-JWT test suite, and Next.js production build verified.**

---

## 1. Git and Scope

| Item                   | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Base branch            | `development` (`53ad8397dd8712b70846b13b067d9c3c1ef0c06a`, ancestor PR #303 merged) |
| Target branch          | `feature/v2.0-005.001-allocation-location-scoping`                                  |
| Worktree               | `.tmp/v2-allocation-location-scoping`                                               |
| Parent issue           | #253                                                                                |
| Program issue          | #248                                                                                |
| Milestone              | #8                                                                                  |
| Predecessor dependency | PR #305 (V2-004.004) unmerged; independent on development base                      |
| Production ref         | `ftadewtkjlaotfdvtjcv` — NEVER contacted                                            |
| DEV ref                | `opmujepkemwcdxxorhfd`                                                              |
| Local Supabase ports   | 54321 / 54322 (JobQuest2.0 on 55321/55322 untouched)                                |
| Migration              | `supabase/migrations/20261106150000_table_allocation_location_scoping.sql`          |

---

## 2. Database Evidence (Local Supabase PostgreSQL 17)

All 74 migrations applied cleanly via `npx supabase db reset`. Full pgTAP test suite executed via `npx supabase test db`.

| Suite / File                                           | Result                                     | Notes                                                                           |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Pre-existing pgTAP suites (0001–0062)                  | ✅ **62/62 files pass** (2,012 assertions) | Zero regressions across all historical suites                                   |
| New suite: `0063_allocation_location_scoping.test.sql` | ✅ **53/53 assertions pass**               | Covers AL-01 through AL-28 (can_operate_board, board_add_column, RLS isolation) |
| Total pgTAP suite                                      | ✅ **63 files, 2,065 assertions, PASS**    | Clean exit 0                                                                    |

---

## 3. TypeScript, Lint, Format & CI Quality Gates

| Gate                            | Command                                              | Result                                                     |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Prettier format check           | `npm run format:check`                               | ✅ Clean: All matched files use Prettier code style        |
| ESLint                          | `npm run lint` (`--max-warnings=0`)                  | ✅ Clean: 0 errors, 0 warnings                             |
| TypeScript check                | `npm run typecheck` (`next typegen && tsc --noEmit`) | ✅ Clean: Types generated successfully, 0 type errors      |
| Full Vitest unit & action tests | `npm test`                                           | ✅ **233 test files passed, 3,160 tests passed, 0 failed** |
| Local paths leak guard          | `npm run check:local-paths`                          | ✅ Clean: 0 forbidden tracked paths                        |
| Next.js production build        | `npx next build --webpack`                           | ✅ Clean: Exit 0, all routes compiled & optimized          |

---

## 4. Real-JWT & Integration Verification (`tests/real/table-allocation-location-scoping.real.test.ts`)

Authored comprehensive Real-JWT integration tests verifying real Supabase Auth sessions, RLS policies, SECURITY DEFINER functions, and triggers:

| Scenario ID       | Test Description                                                                    | Result  |
| ----------------- | ----------------------------------------------------------------------------------- | ------- |
| **AL-01 & AL-02** | Authorized server can read and operate Location A board                             | ✅ PASS |
| **AL-03 & AL-28** | Org Owner and GM can operate across multiple locations without location memberships | ✅ PASS |
| **AL-04**         | Service sessions and physical tables belong strictly to verified location           | ✅ PASS |
| **AL-08**         | Undo and redo operate seamlessly within authorized location session                 | ✅ PASS |
| **AL-10**         | Foreign organization user denied access to Location A                               | ✅ PASS |
| **AL-11 & AL-23** | Server assigned to Location A cannot add column or operate Location B board         | ✅ PASS |
| **AL-24 & AL-26** | Server assigned to Location A cannot read Location B data via PostgREST             | ✅ PASS |
| **AL-12**         | Revoked location assignment (`active = false`) immediately loses access             | ✅ PASS |
| **AL-14**         | Inactive location (`active = false`) refuses board operations                       | ✅ PASS |
| **AL-15**         | Archived location (`archived_at is not null`) refuses board operations              | ✅ PASS |
| **AL-16 & AL-25** | Direct board mutation or action with mismatched session ID is denied                | ✅ PASS |

---

## 5. Security & Isolation Properties

| Property                       | Enforcement Mechanism                                                                                                                                                                | Verified Status |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Verified Location Scoping      | `getCurrentUser()`, `getPrimaryLocation()`, and `assertWorkspaceExpectation()` in Server Actions                                                                                     | ✅ Verified     |
| Stale Context Rejection        | Client forwards `expectedContext`, Server Action rejects drift with `contextStale: true`                                                                                             | ✅ Verified     |
| Cross-Location Session Defense | Server Actions assert `session.location_id === verifiedLocationId` before RPC invocation                                                                                             | ✅ Verified     |
| RPC Authority Hardening        | `private.can_operate_board` checks overall roles, org owner/GM, or active `location_memberships` in target location                                                                  | ✅ Verified     |
| Column Addition Eligibility    | `public.board_add_column` enforces target server has active location assignment                                                                                                      | ✅ Verified     |
| Direct Table Isolation         | RLS `SELECT` policies on `service_sessions`, `dining_tables`, `dining_areas`, `section_assignments`, `rotation_members`, `rotation_rounds`, `table_rotation_entries`, `board_events` | ✅ Verified     |
| Role Hierarchy Preservation    | Overall Owner/Manager and Org Owner/GM retain multi-location oversight                                                                                                               | ✅ Verified     |
| Production Protection          | Hardcoded refusal guards prevent touching production ref `ftadewtkjlaotfdvtjcv`                                                                                                      | ✅ Verified     |
