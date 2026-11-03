# The Lineup V2.0 — Architecture Decisions

This document records the locked architecture decisions governing The Lineup V2.0. Proposed modifications must be documented under a dedicated `## Decision change` proposal including rationale, risk analysis, and migration impact prior to approval.

---

### V2-D001: Multi-Organization and Multi-Location Membership
A single person (profile) may belong to one or more organizations, one or more locations within an organization, and across different organizations simultaneously. A person must not be permanently modeled as belonging to only one organization or one location.

### V2-D002: Scoped Roles Representation
A user's role is not modeled as a single global column on the profile. Authorization derives from distinct scopes: Overall system roles, Organization memberships, and Location-specific role assignments.

### V2-D003: Overall Role Span of Control
Overall roles (`Overall Owner`, `Overall Manager`, `Overall Assistant Manager`) operate across all organizations, all existing locations, and all future locations created in the platform, carrying system-wide capabilities for their respective tier.

### V2-D004: Independent Location-Scoped Roles
A user may hold different management and operational roles across different locations (e.g., Manager at Location A, Assistant Manager at Location B, Server at Location C).

### V2-D005: Baseline vs. Scoped Precedence
Overall roles establish the system-wide baseline capability. Location-scoped assignments grant location-specific capabilities. When evaluating capabilities at a given location, the effective capability is the highest applicable capability granted by either the user's Overall role or their specific location assignment.

### V2-D006: Canonical Domain Terminology
`location` is the canonical technical entity and database identifier. "Branch" is recognized strictly as an allowed synonym in UI and user-facing copy.

### V2-D007: Active Context for Multi-Context Users
Operational user interfaces must operate within an explicit `(Active Organization, Active Location)` context. Users with access to multiple contexts require clear visual indication of active context and an intuitive context switcher.

### V2-D008: Single-Context Auto-Resolution
Users who possess access to exactly one organization and one location must automatically resolve into their valid context without being forced through redundant picker dialogs or selection screens.

### V2-D009: Server-Authoritative Security Boundary
Security and tenant isolation remain strictly database- and server-authoritative (RLS policies, `SECURITY DEFINER` RPCs, validated Server Actions). UI controls, route parameters, local storage, and client-supplied identifiers (`organization_id`, `location_id`) are never treated as security boundaries.

### V2-D010: Intentional Per-Module Scoping
Not all modules automatically become location-scoped. Modules are explicitly audited and classified into `ORGANIZATION`, `LOCATION`, or `HYBRID` scopes (e.g., Recipes remain Organization-scoped by default; Table Allocation is Location-scoped).

### V2-D011: Configurable Attendance Modes
Attendance functionality is configurable per location with three supported operational modes:
1. `EXTERNAL`: Continues using the external Neon database integration.
2. `INTERNAL_THE_LINEUP`: Uses native Lineup Clock In / Clock Out event records.
3. `DISABLED`: Completely disables attendance views and actions for that location.

### V2-D012: First-Class Clock Kiosk Application Surface
The Clock In / Clock Out Kiosk is a dedicated, first-class operational surface built to run on physical station tablets, sharing the core Lineup backend, identity, database, and design primitives.

### V2-D013: In-App Kiosk Device Assignment
A kiosk device is provisioned and paired within the management application, establishing an in-app binding to a specific `(organization_id, location_id)`.

### V2-D014: Exclusion of Unreliable Physical Geolocation
Kiosk location determination strictly prohibits GPS, browser geolocation APIs, IP lookup/allowlists, Wi-Fi BSSID detection, Bluetooth beacons, and OS location permissions. Trusted location derives solely from in-app device pairing.

### V2-D015: Server-Verified Device Attribution
Clock events originating from a kiosk derive their `organization_id` and `location_id` on the server from the trusted device session/token binding, preventing client-side spoofing.

### V2-D016: Kiosk Fail-Closed Invariant
An unassigned, unauthenticated, or revoked kiosk device fails closed: no clock events are accepted. If a location's attendance mode is `EXTERNAL` or `DISABLED`, the kiosk refuses internal clock events.

### V2-D017: Preservation of External Attendance
The existing external Neon attendance integration remains fully operational for locations configured in `EXTERNAL` mode without forced schema rewrites or breaking changes.

### V2-D018: Cumulative Integration on Development Branch
All V2 features integrate into `development` through validated pull requests. `main` is promoted only at final owner-approved release after V2-009 verification gates pass.

### V2-D019: Highest Applicable Capability Resolver
When evaluating permissions for a user within an active `(organization_id, location_id)`, the resolver calculates the effective capability as the union of:
1. Baseline capabilities from an active Overall role (if present).
2. Organization-level capabilities from an active Organization membership.
3. Location-level capabilities from an active Location assignment.
Role hierarchy: `owner > general_manager (manager) > shift_manager (assistant_manager) > host/server (staff)`.

### V2-D020: Elimination of Creator Bypass in `has_org_role`
The historic authorization gap in `private.has_org_role` (Issue #106)—which granted full access to `organizations.created_by` regardless of active membership—is permanently removed in V2-001.007. All authorization must strictly derive from active, server-verified membership and location assignments.
