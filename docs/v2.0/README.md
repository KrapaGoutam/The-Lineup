# The Lineup V2.0

> Multi-Organization · Multi-Location · Scoped Roles · Location Configuration · Attendance · Clock In/Out Kiosk

Historical identifier: **Part 2**  
Integration branch: `development`  
Tracking milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Parent GitHub Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)

---

## 1. Mission and Objectives

The Lineup V2.0 transforms ServiceFlow from a single-restaurant pilot into a multi-organization, multi-location platform while preserving strict tenant isolation, deterministic business rules, and high operational reliability.

### Core Pillars
1. **Multi-Organization & Multi-Location Access**: A user may belong to one or more organizations, one or more locations, and hold different roles across locations.
2. **Layered Authorization & Scoped Roles**: Authoritative server-side evaluation deriving capabilities from Overall Roles (system-wide baseline) and Location-Scoped Roles.
3. **Active Context**: Predictable organization and location context selection with single-context auto-resolution and multi-tab safety.
4. **Per-Location Module Configuration**: Independent toggle and configuration for features (Attendance, Table Allocation, Tasks, Tips, Schedule, etc.) by location.
5. **Attendance V2 & Clock In/Out Kiosk**: Configurable attendance modes (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`) paired with a dedicated physical kiosk client authenticated via trusted in-app device binding (no GPS/IP geolocation).

---

## 2. Canonical Documentation Sitemap

| Document | Purpose |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Canonical roadmap for V2-001 through V2-009 with subfeature checklists and issue links |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Compact operational status tracker for active phase, branches, commits, and gates |
| [ARCHITECTURE.md](ARCHITECTURE.md) | High-level system architecture, entity boundaries, and kiosk device trust model |
| [DECISIONS.md](DECISIONS.md) | Locked architecture decisions (V2-D001 through V2-D020) |
| [ACCESS_MODEL.md](ACCESS_MODEL.md) | Formal user-access model, role precedence, and permanent acceptance test matrix |
| [DATA_MODEL.md](DATA_MODEL.md) | Target relational entities, keys, invariants, and foreign key graphs |
| [SECURITY_RLS.md](SECURITY_RLS.md) | Server/database authorization contracts, RLS policies, kiosk trust, and #106 resolution |
| [MODULE_SCOPE_MATRIX.md](MODULE_SCOPE_MATRIX.md) | Comprehensive audit and classification (Org, Location, Hybrid) for all modules |
| [MIGRATION_STRATEGY.md](MIGRATION_STRATEGY.md) | Forward-only migration paths, Monks &rarr; Webster default backfill, and DEV validation |
| [CI_CD_STRATEGY.md](CI_CD_STRATEGY.md) | Git workflow, feature branches, exact-head CI, and hosted DEV verification gates |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Layered test suites (Unit, pgTAP, RPC, Server Action, Playwright) and edge-case matrix |
| [RELEASE_GATES.md](RELEASE_GATES.md) | Quality, security, and sign-off gates required prior to promotion to `main` |
| [AGENT_EXECUTION_RULES.md](AGENT_EXECUTION_RULES.md) | Prompt templates, token-efficiency rules, subagent limits, and session standards |

---

## 3. Top-Level Features

| ID | Feature | Issue | Directory | Status |
|---|---|---|---|---|
| **V2-001** | Access & Role Foundation | [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249) | [001-access-foundation/](features/001-access-foundation/README.md) | Planned (Next) |
| **V2-002** | Organizations & Locations | [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250) | [002-organizations-locations/](features/002-organizations-locations/README.md) | Planned |
| **V2-003** | Active Organization / Location Context | [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251) | [003-active-context/](features/003-active-context/README.md) | Planned |
| **V2-004** | Per-Location Module Configuration | [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252) | [004-location-module-configuration/](features/004-location-module-configuration/README.md) | Planned |
| **V2-005** | Existing Module Location Scoping | [#253](https://github.com/KrapaGoutam/The-Lineup/issues/253) | [005-module-location-scoping/](features/005-module-location-scoping/README.md) | Planned |
| **V2-006** | Attendance V2 | [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254) | [006-attendance-v2/](features/006-attendance-v2/README.md) | Planned |
| **V2-007** | Clock In / Clock Out Kiosk | [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255) | [007-clock-kiosk/](features/007-clock-kiosk/README.md) | Planned |
| **V2-008** | Migration & Compatibility | [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256) | [008-migration-compatibility/](features/008-migration-compatibility/README.md) | Planned |
| **V2-009** | Final Security & Release Gate | [#257](https://github.com/KrapaGoutam/The-Lineup/issues/257) | [009-final-gate-release/](features/009-final-gate-release/README.md) | Planned |

---

## 4. Execution Discipline

- **Phase 0 is Planning Only**: No runtime code, no migrations, no DB mutations, no promotion to `main`.
- **Cumulative Integration**: All approved V2 feature branches integrate into `development`. `main` is touched only upon final owner sign-off at V2-009.
- **Fail-Closed Security**: Client parameters (`organization_id`, `location_id`, roles) are untrusted. Database RLS and server-side RPCs enforce authorization authoritative boundaries.
