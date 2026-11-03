# The Lineup V2.0 — Feature Roadmap

Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Current Status: `PLANNING` (Phase 0)

---

## 1. Implementation Order and Dependencies

```text
PHASE 0 — Planning Foundation (Current)
       ↓
V2-001 — Access & Role Foundation
       ↓
V2-002 — Organizations & Locations
       ↓
V2-003 — Active Context
       ↓
V2-004 — Location Module Configuration
       ↓
V2-005 — Existing Module Location Scoping
       ↓
V2-006 — Attendance V2
       ↓
V2-007 — Clock Kiosk
       ↓
V2-008 — Migration & Compatibility
       ↓
V2-009 — Final Security / Release Gate
       ↓
OWNER APPROVAL
       ↓
development → main (Production)
```

---

## 2. Top-Level Feature Breakdown

### V2-001 — Access & Role Foundation

- **GitHub Issue:** [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)
- **Status:** In Progress (V2-001.005 active)
- **Directory:** `docs/v2.0/features/001-access-foundation/`
- **Subfeatures:**
  - [x] **V2-001.001**: Overall Roles (PR #260 Merged; hosted DEV migration verified)
  - [x] **V2-001.002**: Organization Membership (PR #262 Merged)
  - [x] **V2-001.003**: Location Access (PR #264 Merged; hosted DEV migration verified)
  - [x] **V2-001.004**: Per-Location Roles (PR #266 Merged; hosted DEV migration verified)
  - [ ] **V2-001.005**: Multi-Location / Multi-Role Assignment (#267 — Staff assignment across multiple branches with distinct roles; In Progress)
  - [ ] **V2-001.006**: Canonical Authorization Resolver (Unified pure resolver calculating effective capability union)
  - [ ] **V2-001.007**: RLS / Server Security Hardening (Eliminate #106 creator bypass from `private.has_org_role`, enforce active memberships)

### V2-002 — Organizations & Locations

- **GitHub Issue:** [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/002-organizations-locations/`
- **Subfeatures:**
  - [ ] **V2-002.001**: Organization Model (Tenant lifecycle, branding, slug management, and settings)
  - [ ] **V2-002.002**: Location Model (Location entity, addresses, timezones, and operating metadata)
  - [ ] **V2-002.003**: Location Administration (Manager/Owner UI for provisioning and configuring branches)
  - [ ] **V2-002.004**: Staff Assignment Management (Assigning staff to locations, designating roles, and revoking access)
  - [ ] **V2-002.005**: Location Lifecycle Integrity (Safe deactivation, archive rules, and operational cascade protection)

### V2-003 — Active Organization / Location Context

- **GitHub Issue:** [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/003-active-context/`
- **Subfeatures:**
  - [ ] **V2-003.001**: Context Resolution (Server-side hydration of active organization and location from session/cookies)
  - [ ] **V2-003.002**: Organization / Location Switcher (Header/App Shell interactive selector with visible active indicator)
  - [ ] **V2-003.003**: Single-Context Auto Resolution (Zero-friction auto-select for single-org / single-location staff)
  - [ ] **V2-003.004**: Context Persistence (Reliable server cookie persistence honoring security boundaries)
  - [ ] **V2-003.005**: Multi-Tab / Stale Context Safety (Cross-tab broadcast channel sync and invalidation guards)

### V2-004 — Per-Location Module Configuration

- **GitHub Issue:** [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/004-location-module-configuration/`
- **Subfeatures:**
  - [ ] **V2-004.001**: Module Configuration Contract (Schema and types for per-location module flags and metadata)
  - [ ] **V2-004.002**: Location Module Settings (Management UI for enabling/disabling modules per location)
  - [ ] **V2-004.003**: Navigation Enforcement (Dynamic hiding of disabled module tabs and navigation entries)
  - [ ] **V2-004.004**: Backend Enforcement (Server Actions and RPCs fail-closed if module is disabled at target location)

### V2-005 — Existing Module Location Scoping

- **GitHub Issue:** [#253](https://github.com/KrapaGoutam/The-Lineup/issues/253)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/005-module-location-scoping/`
- **Subfeatures:**
  - [ ] **V2-005.001**: Table Allocation / Rotation (Bind rotation board sessions and physical tables strictly to active location)
  - [ ] **V2-005.002**: Tasks (Enforce location scoping in `private.tasks_can_access_location` and UI filters)
  - [ ] **V2-005.003**: Tips (Scope tip pools, intervals, and splits to active location)
  - [ ] **V2-005.004**: Schedule / Roster (Scope schedule periods, shifts, and templates to active location)
  - [ ] **V2-005.005**: Payroll (Retain org-level compensation settings with location-filtered reporting and snapshots)
  - [ ] **V2-005.006**: Bar Inventory (Retain org catalog with location-scoped stock ledger, counts, and orders)
  - [ ] **V2-005.007**: Recipes (Retain org-wide recipe book by default with optional location menu filtering)
  - [ ] **V2-005.008**: Team / Settings (Hybrid scoping: org-level memberships vs location-specific staff rosters)

### V2-006 — Attendance V2

- **GitHub Issue:** [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/006-attendance-v2/`
- **Subfeatures:**
  - [ ] **V2-006.001**: Attendance Mode Configuration (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED` per location)
  - [ ] **V2-006.002**: Internal Attendance Data Model (Native clock events, breaks, auto-clock-out, and audit trail)
  - [ ] **V2-006.003**: Clock Integrity Rules (Duplicate clock-in rejection, minimum interval, and timestamp validation)
  - [ ] **V2-006.004**: Manager Corrections (Reason-required timesheet adjustments and audit event recording)
  - [ ] **V2-006.005**: Attendance Reporting (Unified reporting dashboard switching transparently by location mode)
  - [ ] **V2-006.006**: Payroll / Tips Integration (Feed internal attendance data directly into Tip Split and Payroll snapshots)
  - [ ] **V2-006.007**: External Attendance Compatibility (Preserve Neon integration for locations configured in `EXTERNAL` mode)

### V2-007 — Clock In / Clock Out Kiosk

- **GitHub Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/007-clock-kiosk/`
- **Subfeatures:**
  - [ ] **V2-007.001**: Dedicated Kiosk App Surface (Optimized full-screen touch/tablet interface for fast station clocking)
  - [ ] **V2-007.002**: Device Registration / Pairing (Secure one-time pairing code flow to register physical tablet)
  - [ ] **V2-007.003**: Organization / Location Device Binding (Server-stored device record bound to `(org_id, location_id)`)
  - [ ] **V2-007.004**: Kiosk Management Permissions (Capability checks defining which manager roles can pair/manage devices)
  - [ ] **V2-007.005**: Employee PIN Clock Flow (Keypad PIN authentication against location-assigned staff roster)
  - [ ] **V2-007.006**: Reassignment / Revocation / Recovery (Device decommissioning, relocation, and emergency recovery)
  - [ ] **V2-007.007**: Kiosk Security & Validation (Device token rotation, fail-closed revocation check, tamper resistance)

### V2-008 — Migration & Compatibility

- **GitHub Issue:** [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/008-migration-compatibility/`
- **Subfeatures:**
  - [ ] **V2-008.001**: Existing Data Inventory (Audit existing organizations, profiles, locations, and operational rows)
  - [ ] **V2-008.002**: Organization / Location Backfill (Map Monks pilot to Webster location; backfill missing location bindings)
  - [ ] **V2-008.003**: Existing Role Migration (Translate legacy `memberships.roles` into new baseline and location assignments)
  - [ ] **V2-008.004**: Module Configuration Backfill (Seed default module enablement for all existing locations)
  - [ ] **V2-008.005**: Attendance Compatibility (Backfill default `EXTERNAL` mode for Monks to preserve Neon workflow)
  - [ ] **V2-008.006**: Hosted DEV Migration Validation (Execute forward migration rehearsals on hosted DEV database)
  - [ ] **V2-008.007**: Recovery / Forward-Fix Strategy (Deterministic rollback and forward-fix runbooks for migration safety)

### V2-009 — Final Security / Release Gate

- **GitHub Issue:** [#257](https://github.com/KrapaGoutam/The-Lineup/issues/257)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/009-final-gate-release/`
- **Subfeatures:**
  - [ ] **V2-009.001**: Cross-Organization Security Gate (Automated verification that no tenant boundary leakage exists)
  - [ ] **V2-009.002**: Cross-Location Security Gate (Automated verification that location-scoped roles cannot mutate other branches)
  - [ ] **V2-009.003**: Role Matrix E2E (Full Playwright validation of Jack, Sam, Tom, Jerry, and John scenarios)
  - [ ] **V2-009.004**: Kiosk E2E (End-to-end verification of kiosk pairing, PIN clock-in/out, and revocation fail-closed)
  - [ ] **V2-009.005**: Existing Module Regression (Complete test suite run across Allocation, Schedules, Tips, Tasks, Inventory, Recipes)
  - [ ] **V2-009.006**: Production Readiness Audit (Database index usage, connection pool limits, and performance under load)
  - [ ] **V2-009.007**: Owner-Approved Release (Formal owner acceptance sign-off, promotion from `development` to `main`)
