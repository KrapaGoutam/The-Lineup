# The Lineup V2.0 — Architecture Specification

## 1. System Shape & Architecture Principles

The Lineup V2.0 preserves the modular monolith architecture established in V1: a unified Next.js application layer coupled to a single Supabase project providing PostgreSQL relational storage, Row Level Security (RLS), authentication, and Realtime event broadcast.

```mermaid
flowchart TD
  subgraph Client ["Client Surfaces"]
    UI["Management & Staff Web App (Desktop / Tablet / Mobile)"]
    KIOSK["Clock In / Clock Out Kiosk Surface (Station Tablet)"]
  end

  subgraph AppLayer ["Next.js Application Layer"]
    RSC["Server Components (Hydrate Context & Roster)"]
    ACT["Server Actions & Route Handlers"]
    RES["Canonical Authorization Resolver"]
  end

  subgraph DataLayer ["Supabase / PostgreSQL"]
    AUTH["Supabase Auth (Profiles & Passcodes)"]
    RLS["Row Level Security Policies"]
    RPCS["SECURITY DEFINER RPCs (Trusted Mutations)"]
    CORE["Core Schema (Multi-Org, Multi-Location, Roles)"]
    RT["Realtime Changes Broadcast"]
  end

  subgraph ExtData ["External Systems (Optional)"]
    NEON["Neon Postgres (External Attendance Database)"]
  end

  UI --> RSC
  UI --> ACT
  KIOSK --> ACT
  RSC --> RES
  ACT --> RES
  RES --> RPCS
  RSC --> CORE
  ACT --> CORE
  ACT -.-> NEON
  CORE --> RLS
  RPCS --> CORE
  CORE --> RT
  RT --> UI
```

---

## 2. Multi-Tenant Identity & Access Hierarchy

In V2.0, a person is decoupled from a single organization or location. The access hierarchy is modeled as follows:

```mermaid
flowchart TD
  P["Person (Profile)"]
  OA["Overall Access (Overall Owner / Manager / Assistant Manager)"]
  OM["Organization Memberships (Org A, Org B, ...)"]
  LA["Location Assignments (Loc 1, Loc 2, Loc 3, ...)"]
  SR["Location-Scoped Roles (Manager, Assistant Manager, Staff)"]

  P --> OA
  P --> OM
  OM --> LA
  LA --> SR
```

### Invariants:

1. **Profile**: Stable across organizations. Tied to `auth.users (id)`.
2. **Overall Access**: Baseline capabilities across all present and future organizations and locations.
3. **Organization Membership**: Validates that a person is an active affiliate of the organization (`memberships.active = true`).
4. **Location Assignment**: Validates that a person is explicitly assigned to work at a specific location.
5. **Effective Capability**: Computed via the canonical authorization resolver as the union of baseline overall capabilities, organization capabilities, and location-scoped capabilities.

---

## 3. Active Context Resolution

Operational screens require an active `(organization_id, location_id)` context.

```mermaid
sequenceDiagram
  participant B as Browser / Client
  participant S as Server Component (page-data)
  participant R as Context Resolver
  participant DB as Supabase DB

  B->>S: GET /dashboard (with optional context cookie)
  S->>R: resolveContext(user, cookie)
  R->>DB: Query user's active orgs & locations
  DB-->>R: User context options
  alt Single valid context (e.g. Tom at Monks / Webster)
    R-->>S: Auto-resolved (Monks, Webster)
  else Multi-context with valid cookie
    R-->>S: Cookie context (Liquor Tap, NASA)
  else Multi-context without cookie / invalid
    R-->>S: Default to primary active location
  end
  S-->>B: Render page within validated context
```

### Context Rules:

- Context is hydrated server-side.
- If a user changes location in one tab, cross-tab synchronization alerts or syncs active operational state.
- Client-supplied context is **untrusted**: every mutation RPC verifies that the caller actually possesses valid membership and role at the target location.

---

## 4. Clock In / Out Kiosk Architecture

The Clock Kiosk is a first-class, dedicated application surface designed specifically for on-site physical tablets.

```mermaid
flowchart TD
  subgraph Setup ["In-App Device Provisioning"]
    MGR["Manager at Management App"]
    PAIR_RPC["kiosk_register_device RPC"]
    PAIR_CODE["One-Time Pairing Code"]
    MGR --> PAIR_RPC --> PAIR_CODE
  end

  subgraph Tablet ["Physical Station Tablet"]
    INPUT["Enter Pairing Code"]
    STORE["Store Device Token in Secure Storage"]
    PIN_UI["Employee 4-Digit PIN Keypad"]
    INPUT --> STORE --> PIN_UI
  end

  subgraph Execution ["Trusted Clock Event"]
    CLOCK_RPC["kiosk_clock_event RPC"]
    TOKEN_CHECK["Validate Device Token Hash"]
    RESOLVE["Derive Org ID & Location ID from Device Row"]
    MODE_CHECK["Verify Location Attendance Mode = INTERNAL"]
    COMMIT["Insert Attendance Event Record"]

    PIN_UI --> CLOCK_RPC
    CLOCK_RPC --> TOKEN_CHECK
    TOKEN_CHECK --> RESOLVE
    RESOLVE --> MODE_CHECK
    MODE_CHECK --> COMMIT
  end

  PAIR_CODE -.-> INPUT
```

### Kiosk Trust Principles:

1. **Device Binding**: Kiosk device is bound to an exact `organization_id` and `location_id` in database record `kiosk_devices`.
2. **Zero Physical Geolocation**: Strictly prohibits browser geolocation, GPS, IP allowlists, or Wi-Fi scanning.
3. **Server-Derivation**: The client sends only employee PIN and device token. The server derives the location from the device binding.
4. **Fail-Closed**: If a device is revoked or its location is in `EXTERNAL` or `DISABLED` attendance mode, clock events fail immediately.

---

## 5. Attendance Operational Modes

Every location maintains an explicit `attendance_mode`:

| Mode                  | Behavior                                                                                           | Data Source                  |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| `EXTERNAL`            | Reads and reports attendance from the external Neon database; internal kiosk clocking is disabled. | External Neon Postgres       |
| `INTERNAL_THE_LINEUP` | Native Lineup clock-in/out records via Kiosk and manager adjustment tools.                         | Supabase `attendance_events` |
| `DISABLED`            | All attendance features and navigation are hidden and backend endpoints fail-closed.               | None                         |
