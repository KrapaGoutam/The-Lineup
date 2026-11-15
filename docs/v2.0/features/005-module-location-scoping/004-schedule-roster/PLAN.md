# V2-005.004 Schedule / Roster Location Scoping — Plan

GitHub Issue: #253  
Parent Issue: #248 | Milestone: #8 — The Lineup V2.0  
Base: `8e95d9e641d7a76c0010a40c3730a708ae90a0d0`  
Target: `development`

## 1. Objective

Scope all Schedule and Roster operations strictly to the server-verified active organization and location context:

1. **Schedule Data Loading**:
   - Scope schedule periods, shifts, templates, operating hours, and shift defaults to the verified active location.
   - Filter `shifts` queries by both `organization_id` AND `location_id`.
   - Retire legacy `getPrimaryLocation` calls in week navigation.
2. **Location-Scoped Workforce**:
   - Provide `schedule_location_roster` RPC returning eligible location workforce (`location_memberships` where `active = true`) plus historical shift assignees at the location.
   - Restrict shift assignment pickers and CSV import strictly to the location's eligible workforce.
3. **Database Security & RLS**:
   - Implement canonical location authority helpers: `private.schedule_workforce_eligible`, `private.schedule_profile_level`, `private.schedule_live_session`, `private.schedule_can_access_location`, `private.schedule_is_manager`.
   - Update RLS policies on `schedule_periods`, `shifts`, `shift_assignments`, `shift_templates`, `operating_hours`, `shift_kind_defaults`.
   - Ensure `shift_assignments` write policies enforce workforce eligibility at the target shift's location.
4. **Server Actions**:
   - Verify caller live session, active context, and applicable location role (Owner, Manager, Assistant Manager).
   - Reject stale workspace expectations via `assertWorkspaceExpectation`.
   - Prevent foreign-location shift modification, deletion, or assignment.
   - Ensure audit events record `location_id` and genuine actor attribution.
5. **Realtime & History Integrity**:
   - Preserve morning/evening/full-day shift kinds, DST handling, publication locks, and local calendar dates.
   - Prevent cross-location information disclosure between branches.
