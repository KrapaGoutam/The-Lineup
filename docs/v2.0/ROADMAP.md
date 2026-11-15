# The Lineup V2.0 — Feature Roadmap

Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Current Status: `IN_PROGRESS` (V2-001, V2-002 and V2-003.001–.005 complete; V2-003 awaiting owner review; V2-004.001 complete; V2-004 in progress)

---

## 1. Implementation Order and Dependencies

```text
PHASE 0 — Planning Foundation (Complete)
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
- **Status:** Complete (PR #272 Merged)
- **Directory:** `docs/v2.0/features/001-access-foundation/`
- **Subfeatures:**
  - [x] **V2-001.001**: Overall Roles (PR #260 Merged; hosted DEV migration verified)
  - [x] **V2-001.002**: Organization Membership (PR #262 Merged)
  - [x] **V2-001.003**: Location Access (PR #264 Merged; hosted DEV migration verified)
  - [x] **V2-001.004**: Per-Location Roles (PR #266 Merged; hosted DEV migration verified)
  - [x] **V2-001.005**: Multi-Location / Multi-Role Assignment (PR #268 Merged; hosted DEV migration verified)
  - [x] **V2-001.006**: Canonical Authorization Resolver (PR #270 Merged)
  - [x] **V2-001.007**: RLS / Server Security Hardening (PR #272 Merged; hosted DEV migration verified; Issue #106 closed)

### V2-002 — Organizations & Locations

- **GitHub Issue:** [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250)
- **Status:** Complete (PR #282 merged as c543856a767b9f55452bf5f1c26bf5449d2e624b)
- **Directory:** `docs/v2.0/features/002-organizations-locations/`
- **Subfeatures:**
  - [x] **V2-002.001**: Organization Model (Tenant lifecycle, branding, slug management, and settings — Complete; PR #274)
  - [x] **V2-002.002**: Location Model (Branch entity, addresses, timezones, and operating metadata — Complete; PR #276)
  - [x] **V2-002.003**: Location Administration (Manager/Owner UI for provisioning and configuring branches — Complete; Issue #277)
  - [x] **V2-002.004**: Staff Assignment Management (Complete; PR #280 merged as `b08efeee`)
  - [x] **V2-002.005**: Location Lifecycle Integrity (Complete; PR #282; hosted DEV, actual JWT, concurrency, WebKit and exact-head CI verified)

### V2-003 — Active Organization / Location Context

- **GitHub Issue:** [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251)
- **Status:** In progress (V2-003.001 complete — PR #284 merged; V2-003.002 complete — PR #286 merge 3c83535, hosted DEV 16/16, browser 10/10; V2-003.003 complete — PR #289, hosted DEV 22/22, browser 8/8; V2-003.004 complete — PR #291 merge `a649e82c`, hosted DEV 46/46, Chromium 25/25, WebKit iPad 25/25; V2-003.005 complete — PR #296 merge `de8c6732`, hosted DEV 17/17, Chromium 20/20, WebKit iPad 20/20, HTTPS Preview 7/7; V2-003 awaits owner review (V2-005 module binding + RLS remain Production blockers))
- **Directory:** `docs/v2.0/features/003-active-context/`
- **Subfeatures:**
  - [x] **V2-003.001**: Context Resolution (Server-side hydration of active organization and location from session/cookies — Issue #283; PR #284 merged into `development` at `5333a526`; hosted DEV real-JWT verified)
  - [x] **V2-003.002**: Organization / Location Switcher (Header/App Shell interactive selector with visible active indicator; explicit `?location=` selection, no cookie writes — COMPLETE; see its STATUS.md)
  - [x] **V2-003.003**: Single-Context Auto Resolution (Zero-friction auto-select for single-org / single-location staff; `/` redirects a non-default single-context user to the canonical route; no-`Referer` follow-ups fail closed — COMPLETE, PR #289; see its STATUS.md)
  - [x] **V2-003.004**: Context Persistence (HttpOnly server-verified cookie, `Referer` replaced by persisted context, deep-link reconciliation, sign-in/out clearing — Issue #290; complete — PR #291, see its STATUS.md)
  - [x] **V2-003.005**: Multi-Tab / Stale Context Safety (Server-verified workspace assertion on the Tasks write/read path, BroadcastChannel notification, stale-workspace guard and recovery, history-safe reconciliation — Issue #295; complete — PR #296, see its STATUS.md)

### V2-004 — Per-Location Module Configuration

- **GitHub Issue:** [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252)
- **Status:** In progress (V2-004.001/.002 complete; V2-004.003 acceptance complete (#302; delivery PR #303); V2-004.004 implemented, activation blocked (#304))
- **Directory:** `docs/v2.0/features/004-location-module-configuration/`
- **Subfeatures:**
  - [x] **V2-004.001**: Module Configuration Contract (Schema and types for per-location module flags and metadata — Issue [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298); PR #299; validated on the official local stack and hosted DEV, real-JWT 10/10; see its [STATUS.md](features/004-location-module-configuration/001-module-configuration-contract/STATUS.md))
  - [x] **V2-004.002**: Location Module Settings (Management UI for enabling/disabling modules per location) - COMPLETE, PR #301 merge `6000e6c`
  - [ ] **V2-004.003**: Navigation Enforcement (Dynamic hiding of disabled module tabs and navigation entries) - ACCEPTANCE COMPLETE, #302; delivery PR #303; [status](features/004-location-module-configuration/003-navigation-enforcement/STATUS.md)
  - [ ] **V2-004.004**: Backend Enforcement (Server Actions and RPCs fail-closed if module is disabled at target location) - IMPLEMENTED, ACTIVATION BLOCKED, #304; staged switch, database refuses activation until every active location has owner-approved rows (hosted DEV: 0/44); [status](features/004-location-module-configuration/004-backend-enforcement/STATUS.md)

### V2-005 — Existing Module Location Scoping

- **GitHub Issue:** [#253](https://github.com/KrapaGoutam/The-Lineup/issues/253)
- **Status:** Planned
- **Directory:** `docs/v2.0/features/005-module-location-scoping/`
- **Subfeatures:**
  - [x] **V2-005.001**: Table Allocation / Rotation (Bind rotation board sessions and physical tables strictly to active location)
  - [x] **V2-005.002**: Tasks (Enforce location scoping in `private.tasks_can_access_location` and UI filters)
  - [x] **V2-005.003**: Tips (Scope tip pools, intervals, and splits to active location)
  - [x] **V2-005.004**: Schedule / Roster (Scope schedule periods, shifts, and templates to active location)
  - [x] **V2-005.005**: Payroll (Retain org-level compensation settings with location-filtered reporting and snapshots)
  - [x] **V2-005.006**: Bar Inventory (Retain org catalog with location-scoped stock ledger, counts, and orders)
  - [x] **V2-005.007**: Recipes (Retain org-wide recipe book by default with optional location menu filtering)
  - [x] **V2-005.008**: Team / Settings (Hybrid scoping: org-level memberships vs location-specific staff rosters)

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

- **GitHub Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255) (CLOSED)
- **Status:** Complete — merged into `development` (PR #324, `790fd2db`, 2026-11-12). D7 location-scoped Kiosks UI carried to V2-008; physical-tablet acceptance carried to V2-009.
- **Directory:** `docs/v2.0/features/007-clock-kiosk/`
- **Subfeatures:**
  - [x] **V2-007.001**: Dedicated Kiosk App Surface (Optimized full-screen touch/tablet interface for fast station clocking)
  - [x] **V2-007.002**: Device Registration / Pairing (Secure one-time pairing code flow to register physical tablet)
  - [x] **V2-007.003**: Organization / Location Device Binding (Server-stored device record bound to `(org_id, location_id)`)
  - [x] **V2-007.004**: Kiosk Management Permissions (Capability checks defining which manager roles can pair/manage devices) — backend + org-level UI done; location-scoped UI entry (D7) → V2-008
  - [x] **V2-007.005**: Employee PIN Clock Flow (Keypad PIN authentication against location-assigned staff roster)
  - [x] **V2-007.006**: Reassignment / Revocation / Recovery (Device decommissioning, relocation, and emergency recovery)
  - [x] **V2-007.007**: Kiosk Security & Validation (Device token rotation, fail-closed revocation check, tamper resistance) — live post-revoke tablet replay (T5) accepted as an owner exception

### V2-008 — Migration & Compatibility

- **GitHub Issue:** [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256)
- **Status:** In progress — Batch A (read-only discovery, mapping, D7 design) complete locally; implementation (Batch B), hosted validation (Batch C) and owner decisions pending. See [STATUS.md](features/008-migration-compatibility/STATUS.md). Also carries **D7** (location-scoped Kiosks UI, required before Production).
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

## V2-004.002 - complete

PR #301 is merged: source head `2a8ed9c312bfe73bb80a3c1b0250eee9b9911273`, development merge `6000e6cdffeb24496fce192020d3edce0f669341`. Its accepted schema/reader/writer/editor are the baseline for V2-004.003. No schema or backend enforcement change in .003. Q1-Q4 remain open. See the .003 evidence for current acceptance and delivery status.
