# V2-005.004 Schedule / Roster Location Scoping — Evidence

## 1. Baseline & Environment

- **Repository**: `KrapaGoutam/The-Lineup`
- **Worktree**: `.tmp/v2-005-batch-a`
- **Base SHA**: `8e95d9e641d7a76c0010a40c3730a708ae90a0d0` (`origin/development`)
- **Branch**: `feature/v2.0-005-batch-a-schedule-team-settings`
- **Parent Issue**: #253 | Program: #248 | Milestone: #8 — The Lineup V2.0

## 2. Implemented Schema & Security Architecture

- **Single Forward-Only Migration**: `supabase/migrations/20261107224300_batch_a_schedule_team_settings.sql` (all 79 migrations replayed cleanly with 0 errors).
- **Security Definer RLS Helpers**:
  - `private.schedule_workforce_eligible(p_org uuid, p_location uuid, p_profile uuid)`: Determines if profile is active in `location_memberships` (or sole active location in organization).
  - `private.schedule_profile_level(p_org uuid, p_location uuid, p_profile uuid)`: Computes canonical role tier (4 = Owner, 3 = Manager, 2 = Assistant Manager, 1 = Staff, 0 = None), admitting Overall roles without fake tenant memberships.
  - `private.schedule_live_session()`: Enforces authentic unbanned, unexpired Supabase Auth session.
  - `private.schedule_can_access_location(p_org uuid, p_location uuid)`: Requires live session and level > 0.
  - `private.schedule_is_manager(p_org uuid, p_location uuid)`: Requires live session and level >= 2.
  - `private.shift_assignment_can_access` & `private.shift_assignment_can_write`: Validates shift assignment read access and workforce eligibility on write.
- **RPC**:
  - `public.schedule_location_roster(p_organization_id uuid, p_location_id uuid)`: Returns `(profile_id, display_name, roles, active, eligible)`. Accurately retains historical assignees/publishers with `eligible = false` for display while marking active location members with `eligible = true`.
- **Publisher Attribution**:
  - Dropped legacy composite foreign key `schedule_publisher_member_fk` so Overall managers and owners can publish schedules without synthetic tenant membership rows.
- **Audit Integrity Correction (V2-005.003 Residual Fix)**:
  - Added `and entity_type <> 'tip_pool'` to `public.audit_events_insert_operator` RLS policy, ensuring clients cannot forge tip pool audit records and must use audited atomic RPCs.
  - Dropped legacy `tip_pools_reopen_manager` policy on `public.tip_pools`.
  - Hardened `tip_pools_update_draft_manager` with `with check (status = 'draft' and finalized_at is null and finalized_by is null and private.tips_is_manager(organization_id, location_id))`.

## 3. Server-Side Actions & Workspace Enforcement

- `src/features/schedules/data/schedule-actor.ts`:
  - `getScheduleActor(restaurantSlug)` resolves the verified active location and actor role, validating with `schedule_location_authorized` RPC.
- `src/features/schedules/actions/schedule-actions.ts`:
  - Enforces `requireLiveSession(supabase)`.
  - Validates request-context consistency via `checkWorkspace` and `assertWorkspaceExpectation`; returns `{ ok: false, error: STALE_CONTEXT_MESSAGE, contextStale: true }` on location mismatches.
  - Validates caller role with `isManagerRole(actor.viewer.designation)`.
  - Enforces `guardModule({ module: "schedule", ... })`.
  - Validates workforce eligibility against `schedule_location_roster` before writing shift assignments.
  - Records location-scoped audit events with genuine actor profile IDs.

## 4. Verification Receipts

### A. Database pgTAP Tests

- `supabase/tests/database/0068_batch_a_schedule_team_settings.test.sql`: **50/50 PASS**
  - Tips audit integrity tests (blocked direct finalize, blocked direct reopen, blocked direct audit event insertion).
  - Schedule location scoping (manager A operates Loc A, Manager A blocked at Loc B).
  - Workforce eligibility (eligible staff assigned, foreign branch staff rejected with 42501, departed staff rejected with 42501).
  - Roster RPC returns eligible active staff, ineligible historical staff, and excludes foreign branch staff.
  - Draft isolation (manager A cannot read Loc B draft shifts).
  - Publication transition (staff can read published shifts at Loc A).
  - Overall Manager operates Loc A and Loc B without membership row.
  - Schedule audit events require location authority.
- `supabase/tests/database/0067_tips_final_security.test.sql`: **60/60 PASS**

### B. Local Real-JWT Integration Tests

- `tests/local/schedule-location.local.test.ts`: **9/9 PASS**
  - Manager A adds, updates, and deletes shifts at Loc A.
  - Manager A cross-location write rejected at Loc B (action and DB RLS 42501).
  - Staff A cannot add, update, or delete shifts at Loc A.
  - Manager A cannot assign foreign branch Staff B to Loc A shift.
  - Manager A cannot save operating hours or shift defaults at Loc B.
  - Stale workspace expectation returns `contextStale: true`.
  - Overall Manager manages schedules and publishes at Loc A and Loc B.
  - Local manager cannot rename members or change team designations.
  - Org Owner CAN rename members and change designations.

### C. Full Test Suite & Quality Gates

- `npm run check`: **PASS**
  - `prettier --check .`: All matched files use Prettier code style.
  - `eslint . --max-warnings=0`: 0 warnings, 0 errors.
  - `next typegen && tsc --noEmit`: Types generated successfully, 0 errors.
- `npm test`: **244 passed (244 test files), 3,303 passed tests**, 0 failed.
- `npm run build`: **PASS** (Next.js 16.4.3 production build succeeded, all dynamic and static routes generated).
