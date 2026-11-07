# V2-005.004 Schedule / Roster Location Scoping — Status

**Current State**: COMPLETE (Implemented, Tested, Verified in Batch A)  
**Parent Issue**: #253  
**Milestone**: #8 — The Lineup V2.0  
**Target**: `development`  
**Branch**: `feature/v2.0-005-batch-a-schedule-team-settings`  
**Migration**: `supabase/migrations/20261107224300_batch_a_schedule_team_settings.sql`

## Acceptance Checklist
- [x] Schedules, shifts, shift templates, operating hours, and shift defaults scoped strictly to the verified active location.
- [x] Location-scoped workforce roster via `schedule_location_roster` RPC ensuring cross-location assignment is prevented while historical assignees are retained for display.
- [x] RLS policies enforced on `schedule_periods`, `shifts`, `shift_assignments`, `shift_templates`, `operating_hours`, `shift_kind_defaults`.
- [x] Overall roles (Owner, Manager, Assistant Manager) authorized to manage schedules without synthetic organization memberships.
- [x] Composite foreign key `schedule_publisher_member_fk` dropped to allow genuine Overall actor attribution on schedule publication.
- [x] Server actions enforce request-context consistency, module availability, manager authority, and workforce eligibility.
- [x] Residual Tips audit vulnerability closed (`audit_events_insert_operator` forbids `entity_type = 'tip_pool'`).
- [x] Local pgTAP suite (`0068_batch_a_schedule_team_settings.test.sql`) 50/50 PASS.
- [x] Local real-JWT integration suite (`tests/local/schedule-location.local.test.ts`) 9/9 PASS.
- [x] `npm run check`, `npm test` (3,303/3,303 PASS), and `npm run build` all green.
