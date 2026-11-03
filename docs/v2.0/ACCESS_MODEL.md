# The Lineup V2.0 — Access Model & Acceptance Matrix

## 1. Access Model Formalization

In The Lineup V2.0, access is decoupled from a single organization or location. Authorization derives from four discrete layers evaluated in order:

```text
Person (auth.users / profiles)
  ↓
1. Overall Role (Baseline across all orgs and locations, if any)
  +
2. Organization Membership (Validates active affiliation with the tenant)
  +
3. Location Assignment (Explicit assignment to work at a specific location)
  +
4. Role at Applicable Scope (Location-specific or organization-specific role)
```

---

## 2. Example Organizations & Locations

### Monks
```text
Monks (Organization)
└── Webster (Location)
```

### Liquor Tap
```text
Liquor Tap (Organization)
├── NASA (Location)
└── League City (Location)
```

> **Note on Terminology:**  
> `location` is the canonical domain model and database identifier.  
> `branch` is recognized as an approved display synonym in user interfaces. They represent the exact same entity.

---

## 3. Canonical Permanent Acceptance Matrix

The following scenarios constitute the mandatory, permanent test matrix for V2.0 authorization verification.

| User | Target Organization | Target Location | Expected Evaluation | Rule Rationale |
|---|---|---|---|---|
| **Jack** | Monks | Webster | **ALLOW** | Assigned to Monks &rarr; Webster |
| **Jack** | Liquor Tap | NASA | **ALLOW** | Assigned to Liquor Tap &rarr; NASA |
| **Jack** | Liquor Tap | League City | **ALLOW** | Assigned to Liquor Tap &rarr; League City |
| **Sam** | Liquor Tap | NASA | **ALLOW** | Explicitly assigned to NASA |
| **Sam** | Liquor Tap | League City | **DENY** | Belonging to Liquor Tap does NOT grant access to other locations |
| **Sam** | Monks | Webster | **DENY** | No membership or assignment in Monks |
| **Tom** | Monks | Webster | **ALLOW** | Explicitly assigned to Webster |
| **Tom** | Liquor Tap | NASA | **DENY** | No assignment in Liquor Tap |
| **Jerry** | Monks | Webster | **ALLOW** | Assigned to Monks &rarr; Webster |
| **Jerry** | Liquor Tap | NASA | **ALLOW** | Assigned to Liquor Tap &rarr; NASA |
| **Jerry** | Liquor Tap | League City | **DENY** | No assignment to League City despite Liquor Tap membership |

---

## 4. Role Hierarchy and Precedence

### 4.1. Overall Roles
Overall roles grant system-wide capabilities across **all existing and future organizations and locations**:
1. **Overall Owner**: Full administrative, configuration, and operational authority everywhere.
2. **Overall Manager**: Managerial authority across all organizations and locations. Owner-exclusive actions (e.g., destructive purges, tenant creation) remain owner-only.
3. **Overall Assistant Manager**: Assistant manager capabilities across all organizations and locations.

### 4.2. Location-Scoped Roles
A user without an Overall role holds independent roles scoped to specific locations.

#### Example: John (Mixed Branch Roles)
```text
John
├── Liquor Tap / NASA         → Manager
├── Liquor Tap / League City  → Assistant Manager
└── Monks / Webster           → Manager
```
- At **NASA**, John operates with full `Manager` capabilities.
- At **League City**, John operates with `Assistant Manager` capabilities (cannot alter manager designations or delete historical records).
- At **Webster**, John operates with full `Manager` capabilities.
- At any newly created location, John has **NO access** until explicitly assigned.

---

## 5. Capability Resolution Algorithm

When a user performs an action within an `(Active Organization, Active Location)` context, the effective role tier is resolved via the following deterministic precedence:

```text
effective_tier = MAX(
  overall_tier(user),
  location_tier(user, active_location)
)
```

Where tier precedence is ordered:
$$\text{Owner} > \text{Manager} > \text{Assistant Manager} > \text{Staff} > \text{None}$$

1. If the user holds an **Overall Owner** role, `effective_tier = Owner`.
2. If the user holds an **Overall Manager** role and a location role of `Assistant Manager` at Location X, the effective tier at Location X is `Manager` (baseline dominates).
3. If the user holds an **Overall Assistant Manager** role and a location role of `Manager` at Location X, the effective tier at Location X is `Manager` (location elevates capability for that specific location).
4. If the user has no Overall role, their capabilities are strictly determined by their explicit assignment at that location.
5. If the user has no assignment at the active location and no Overall role, access is **DENIED** (fails closed).
