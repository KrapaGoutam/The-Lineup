# Feature V2-006: Attendance V2

GitHub Issue: [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Branch: `feature/v2-006-attendance-v2`  
Status: `IN PROGRESS — BATCH A COMPLETE, READY FOR BATCH B`

---

## 1. Overview and Mission

Feature V2-006 delivers Attendance V2. It introduces per-location attendance mode configuration (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`), native internal attendance tracking (schema, clock integrity rules, manager adjustments), and unifies reporting and payroll/tips feeds across both modes.

Implementation proceeds across three planned batches on a single feature branch (`feature/v2-006-attendance-v2`), followed by one consolidated PR into `development`:

- **Batch A (Delivered)**: Mode Configuration (V2-006.001), Native Internal Attendance Data Model (V2-006.002), Clock Integrity Rules (V2-006.003).
- **Batch B (Next)**: Manager Corrections (V2-006.004), Attendance Reporting (V2-006.005).
- **Batch C**: Payroll / Tips Integration (V2-006.006), External Attendance Compatibility & Cutover (V2-006.007).

---

## 2. Batch A Architectural Specification

### 2.1 Attendance Mode Configuration (V2-006.001)

Locations configure their attendance source independently:

- `EXTERNAL`: Attendance is pulled from external POS / third-party clock system (e.g., Neon).
- `INTERNAL_THE_LINEUP`: Native internal attendance engine is active. Staff clock in/out, take breaks, and record sessions directly in The Lineup.
- `DISABLED`: Attendance tracking is disabled for this location. Clock-in actions are rejected.
- `NULL` (Unconfigured / Legacy): Missing configuration fails closed for native clock operations (`canClockInternal: false`) while preserving read compatibility with existing external attendance views (`canReadExternal: true`). No backfill or silent defaults were applied to existing rows.

#### Orthogonality with Module Configs

Attendance module activation (`location_module_configs.is_enabled` where `module_id = 'attendance'`) is orthogonal to the attendance source mode (`locations.attendance_mode`). A location with attendance enabled may operate either in `EXTERNAL` mode or `INTERNAL_THE_LINEUP` mode.

#### Atomic RPC: `set_location_attendance_mode`

- Security Definer with caller authority check (`private.attendance_can_manage_location`).
- Audit logging into `audit_logs` with previous mode, new mode, and caller ID.
- Concurrency protection: accepts optional `p_expected_updated_at` to prevent lost updates (`P0004` conflict).

### 2.2 Native Internal Attendance Data Model (V2-006.002)

#### Tables

1. **`attendance_sessions`**:
   - Primary key: `id UUID DEFAULT gen_random_uuid()`
   - Tenant scoping: `organization_id UUID`, `location_id UUID`
   - Employee: `profile_id UUID`
   - Date: `service_date DATE NOT NULL` (evaluated in location IANA time zone)
   - Status: `attendance_session_status` (`active`, `on_break`, `completed`, `adjusted`, `voided`)
   - Timestamps: `clock_in_at TIMESTAMPTZ NOT NULL`, `clock_out_at TIMESTAMPTZ`
   - Durations: `total_break_seconds INT DEFAULT 0`, `total_worked_seconds INT`
   - Metadata: `manager_notes TEXT`, `created_by UUID`, `updated_by UUID`
   - Partial unique constraint: `attendance_sessions_one_open_per_employee` on `(organization_id, profile_id) WHERE status IN ('active', 'on_break')`. Prevents overlapping concurrent shifts at database level.

2. **`attendance_breaks`**:
   - Tracks individual break periods within a session.
   - Partial unique constraint: `attendance_breaks_one_active_per_session` on `(session_id) WHERE end_time IS NULL`. Ensures at most one active break per session.
   - Durations computed as integer seconds `EXTRACT(EPOCH FROM (end_time - start_time))::INT`.

3. **`attendance_events`**:
   - Append-only immutable ledger recording every state change and transition.
   - Event types: `clock_in`, `clock_out`, `break_start`, `break_end`, `manager_edit`, `system_auto_out`, `void`.
   - Event sources: `employee_app`, `kiosk`, `manager_dashboard`, `system_cron`.
   - Immutability enforcement: Trigger `attendance_events_immutable_trigger` prohibits `UPDATE` or `DELETE` on any event row.
   - Network retry safety: Partial unique index `attendance_events_idempotency_idx` on `(organization_id, location_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

#### Multi-Tenant & RLS Isolation

- Composite tenant foreign keys enforce cross-tenant integrity:
  `(location_id, organization_id) REFERENCES locations(id, organization_id)`
  `(organization_id, profile_id) REFERENCES memberships(organization_id, profile_id)`
- Direct `INSERT`, `UPDATE`, `DELETE` grants are revoked from `authenticated`. All state modifications must pass through atomic security-definer RPCs.
- `SELECT` policies enforce tenant isolation and restrict staff to their own sessions unless granted management authority.

### 2.3 Clock Integrity Rules (V2-006.003)

#### State Machine & Transition Rules

- **Clock In (`attendance_clock_in`)**:
  - Rejects if location mode is not `INTERNAL_THE_LINEUP` (`22023`).
  - Verifies caller has active membership and location assignment (`42501`).
  - Checks partial unique index; duplicate clock-in while active/on_break raises `23505`.
  - Idempotent retry: if `p_idempotency_key` matches an existing event, returns previous event result with `idempotent: true`.
  - Assigns `service_date` based on `now() AT TIME ZONE location.time_zone`.
- **Clock Out (`attendance_clock_out`)**:
  - Requires open session (`active` or `on_break`).
  - If employee is on break when clocking out, the open break is automatically closed at `now()`.
  - Computes `total_worked_seconds = EXTRACT(EPOCH FROM (now() - clock_in_at))::INT - total_break_seconds`.
  - Transitions session status to `completed`.
- **Break Start (`attendance_break_start`)**:
  - Session must be in `active` status. Rejects if `on_break` (`22023`) or completed/not found (`P0002`).
  - Creates row in `attendance_breaks`, logs `break_start` event, updates session status to `on_break`.
- **Break End (`attendance_break_end`)**:
  - Session must be in `on_break` status with an open break.
  - Closes active break, increments session `total_break_seconds`, transitions session status back to `active`.

---

## 3. Migration and Artifact Ledger

- **Migration**: `supabase/migrations/20261110000000_attendance_v2_foundation.sql`
  - SHA256: `935babc5e94560109bce55e2063e1a85d6b390c4bec04e22e84539f17c6ab5ea`
  - Applied cleanly across all 83 migrations in local ledger.
- **Database Tests**: `supabase/tests/database/0073_attendance_v2_foundation.test.sql`
  - 41/41 pgTAP tests passing (enums, columns, constraints, immutability, RLS, RPC execution).
- **TypeScript & Application Layer**:
  - Domain: `src/features/attendance/domain/attendance-mode.ts`, `attendance-session.ts`, `clock-integrity.ts`.
  - Data: `src/features/attendance/data/attendance-mode-data.ts`, `native-attendance-data.ts`.
  - Actions: `src/features/attendance/actions/attendance-mode-actions.ts`, `native-clock-actions.ts`.
  - Unit tests: 12 test suites, 94 tests passing in `src/features/attendance/`.

---

## 4. Batch B Handoff & Readiness

Batch A provides the exact database, domain, and action foundation required by Batch B:

- **V2-006.004 Manager Corrections**:
  - Data model is ready: `attendance_events` has `manager_edit` event type, `attendance_sessions` has `adjusted` status and audit fields (`updated_by`, `manager_notes`).
  - Next step: Build atomic manager correction RPC and Server Action with mandatory reason tracking.
- **V2-006.005 Attendance Reporting**:
  - Data model is ready: `attendance_sessions` has `service_date`, `total_worked_seconds`, `total_break_seconds`.
  - Next step: Build unified reporting aggregator querying Neon when `mode = 'EXTERNAL'` and `attendance_sessions` when `mode = 'INTERNAL_THE_LINEUP'`.
