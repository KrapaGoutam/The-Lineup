# The Lineup V2.0 — Security & RLS Architecture

## 1. Authoritative Security Model

In The Lineup V2.0, all authorization decisions are strictly server- and database-authoritative.

The authorization pipeline evaluates:
```text
Verified Identity (auth.uid())
  +
Overall Role (if assigned)
  +
Active Organization Membership (memberships.active = true)
  +
Active Location Assignment (location_assignments.active = true)
  +
Effective Capability at Scope (resolved capability)
  +
Module Availability (location_module_configs.is_enabled)
```

---

## 2. Non-Security Boundaries (Explicit Exclusions)

The following items are conveniences for user experience and **MUST NEVER** be treated as security or tenant boundaries:

| Mechanism | Risk if Trusted | Enforcement Mechanism |
|---|---|---|
| **Hidden UI / Disabled Buttons** | Client can inspect DOM or execute fetch in console | Server Actions & RLS reject unauthorized actions |
| **Selected Dropdown Option** | Tampered form submission with spoofed IDs | Server validates caller's assignment to selected ID |
| **Route Parameters (`/r/[slug]`)** | Direct URL manipulation to access other tenants | Server verifies membership in slug's tenant |
| **`localStorage` / Client State** | User edits keys or values in DevTools | Purely transient UI cache; server ignores client assertions |
| **Client-Supplied `organization_id`** | Forging another organization's UUID | Server derives/validates org ID against `auth.uid()` |
| **Client-Supplied `location_id`** | Forging a location UUID the user lacks access to | Server validates caller's explicit assignment |
| **Client-Supplied Role / Tier** | Elevating from staff to manager | Role is fetched directly from database membership |

---

## 3. Resolution of Organization-Creator Bypass Debt (#106)

### Historic Defect
In V1 foundation migration `20260905065702_initial_schema.sql`, `private.has_org_role` included an unconditional creator bypass:
```sql
or exists (
  select 1
  from public.organizations
  where organizations.id = target_organization_id
    and organizations.created_by = (select auth.uid())
);
```
As documented in Issue [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106), when an organization creator is deactivated (`memberships.active = false`), they retain privileged authorization because this function bypasses membership checks.

### V2.0 Resolution (Subfeature V2-001.007)
Subfeature **V2-001.007** permanently eliminates the `organizations.created_by` bypass from `private.has_org_role`:
1. Authorization requires an explicit, active `memberships` row.
2. Legitimate owners maintain active `owner` memberships.
3. Deactivated creators immediately lose all platform and operational access.
4. Comprehensive pgTAP regression tests (`0008_member_deactivation` and new V2 test suites) enforce this invariant.

---

## 4. Kiosk Trust and Device Security Model

### 4.1. Hardware & Network Independence
Kiosk security relies on **cryptographic device tokens**, not physical network heuristics:
- **NO GPS / Browser Geolocation**: Subject to spoofing, indoors degradation, and permission prompts.
- **NO IP Allowlists**: Commercial restaurant dynamic IPs and cellular failover break IP pinning.
- **NO Wi-Fi BSSID / Bluetooth**: Complex OS permissions, easily fooled by portable hotspots.

### 4.2. Pairing and Authentication Handshake
1. Manager initiates device pairing in the management console:
   - Enters device name, selects target Location.
   - Generates a short-lived, high-entropy 6-digit numeric pairing code.
   - Stores `pairing_code_hash = crypt(code, gen_salt('bf'))` with 10-minute expiry.
2. On physical station tablet:
   - Operator navigates to `/kiosk/pair` and inputs the code.
   - Server verifies code hash, generates a 256-bit cryptographically secure device secret (`device_token`), and stores `device_token_hash = sha256(device_token)`.
   - Client persists `device_token` in secure client storage (HTTP-only secure cookie or dedicated native container).
   - Pairing code is invalidated immediately.

### 4.3. Fail-Closed Invariants
1. **Clock Event Attribution**: The kiosk client sends `(device_token, pin, event_type)`.
2. The server hashes `device_token`, queries `kiosk_devices`, and derives `(organization_id, location_id)`.
3. If device row is not found or `status != 'active'`, RPC immediately throws `42501 (Unauthorized: Device revoked)`.
4. If target location has `attendance_mode != 'internal_the_lineup'`, RPC throws `42501 (Unauthorized: Internal attendance not enabled)`.
5. No attendance record is created under any failure condition.
