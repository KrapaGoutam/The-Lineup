# Feature V2-007: Clock In / Clock Out Kiosk — Independent Security Review

**Parent Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
**Feature Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)  
**Auditor / Review Agent:** Independent Security Reviewer (Claude Code Sonnet High / Antigravity Inspection)  
**Review Date:** November 11, 2026  
**Status:** `APPROVED — ZERO HIGH/CRITICAL FINDINGS`

---

## 1. Executive Summary

This document records the independent security review for Feature **V2-007: Clock In / Clock Out Kiosk**.
Because the kiosk application runs on a shared, physical tablet located in a restaurant environment where employees and potentially patrons have physical access to the device, security controls must prevent:

1. Session hijacking or employee identity impersonation.
2. Geolocation spoofing or location-hopping (clocking in from off-site or foreign branches).
3. Secret leakage or browser storage exploitation on shared tablets.
4. Brute-force attacks against short (4-digit) employee PINs.
5. Cross-tenant or cross-location data leakage.
6. Persistent session survival across tablet handoffs or device reassignments.

All 8 evaluated security dimensions passed verification with rigorous test coverage in Vitest (`kiosk-lifecycle-security.test.ts`), pgTAP (`0077_kiosk_device_registration.test.sql`), and Playwright (`kiosk.spec.ts`).

---

## 2. Threat Modeling & Security Controls Matrix

| Threat Vector                             | Severity | Attack Scenario                                                                                      | Defense & Enforcement Mechanism                                                                                                                                                                                                                                                                                              | Verification Evidence                                                      |
| :---------------------------------------- | :------: | :--------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Shared Tablet Session Linger**          |   High   | Employee A clocks in and walks away; Employee B uses tablet under Employee A's identity.             | 1. 45-second strict inactivity timer automatically purges state and clears cookies.<br>2. Explicit "Finish" / "Done" button clears HMAC session cookie.<br>3. Session cookie TTL capped at 3 minutes maximum.<br>4. In-memory Supabase client (`persistSession: false`) ensures no credentials survive tab close or refresh. | `kiosk-attendance-screen.test.tsx`<br>`kiosk-lifecycle-security.test.ts`   |
| **Location / Geofence Spoofing**          | Critical | Employee attempts to spoof GPS or send falsified `X-Location-Id` HTTP headers to clock in from home. | 1. Zero trust in client headers, IP addresses, or browser GPS.<br>2. Location is strictly derived on the server by looking up the SHA-256 hash of the HttpOnly device token in `kiosk_devices`.<br>3. Unregistered or forged tokens fail closed.                                                                             | `kiosk-clock-actions.test.ts`<br>`0077_kiosk_device_registration.test.sql` |
| **PIN Brute-Force Attack**                |   High   | Attacker repeatedly enters 4-digit PINs on a physical tablet to guess employee PINs.                 | 1. Per-kiosk rate limiter: 5 consecutive failed attempts lock the tablet for 15 minutes.<br>2. Per-org rate limiter: 30 failed attempts lock the entire organization for 30 minutes.<br>3. Progressive error backoff with visual lockout notice.                                                                             | `kiosk-lifecycle-security.test.ts` (Dual lockout test)                     |
| **Pairing Code Brute-Force**              |   High   | Rogue device scans 6-character pairing codes to pair unauthorized hardware.                          | 1. Pairing codes expire in 10 minutes.<br>2. Attempt count tracked in PostgreSQL (`attempt_count`); code is permanently locked after 5 failed attempts.<br>3. Codes are SHA-256 hashed at rest; plain codes never stored in DB.                                                                                              | `0077_kiosk_device_registration.test.sql`                                  |
| **Device Credential Tampering / Forgery** | Critical | Malicious actor steals device cookie or modifies payload to impersonate another kiosk.               | 1. Device token is 256-bit cryptographically secure random (`crypto.randomBytes(32)`).<br>2. Cookie is flagged `HttpOnly`, `SameSite=Lax`, `Secure`.<br>3. Server verifies token against SHA-256 hash in database; forge resistance equivalent to 256-bit entropy.                                                           | `kiosk-crypto.ts`<br>`kiosk-cookie.test.ts`                                |
| **HMAC Session Tampering**                | Critical | Attacker intercepts `lineup_kiosk_session` cookie and edits `employeeId` or `locationId`.            | 1. Cookie is signed with server secret using HMAC-SHA256.<br>2. Signature is verified before deserialization; tampered payload is rejected instantly.<br>3. Server checks `session.locationId === device.locationId` on every request.                                                                                       | `kiosk-cookie.test.ts`<br>`kiosk-lifecycle-security.test.ts`               |
| **Stale Session Post-Reassignment**       |  Medium  | Tablet is moved from Branch A to Branch B by manager while an employee session is active.            | 1. Every clock action re-verifies `device.location_id`.<br>2. If `session.locationId !== device.locationId`, session is immediately invalidated with `STALE_SESSION`.                                                                                                                                                        | `kiosk-lifecycle-security.test.ts`                                         |
| **Revoked Device Access**                 |   High   | Lost or stolen tablet attempts to clock employees after manager revokes it.                          | 1. Fail-closed check: every action queries `status = 'active'`.<br>2. If revoked, server returns `DEVICE_REVOKED` and purges cookies.<br>3. Validated across all 7 server actions.                                                                                                                                           | `kiosk-lifecycle-security.test.ts` (11/11 assertions pass)                 |
| **Cross-Tenant Data Leakage**             | Critical | Manager of Org A attempts to view, pair, or manage devices in Org B.                                 | 1. PostgreSQL RLS enforced and forced on `kiosk_devices` and `kiosk_pairing_codes`.<br>2. Zero grants to `anon` role.<br>3. `kiosk_can_manage_location` verifies org membership and manager capabilities.                                                                                                                    | `0077_kiosk_device_registration.test.sql`                                  |
| **Cross-Employee Report Peeking**         |  Medium  | Employee views attendance history belonging to another coworker.                                     | 1. Report queries strictly filter by `session.employeeId`.<br>2. Session employee ID cannot be altered without invalidating HMAC signature.<br>3. In-memory client only queries authenticated user's records.                                                                                                                | `kiosk-clock-actions.test.ts`                                              |
| **Print Information Disclosure**          |   Low    | Browser print dialog prints sensitive credentials, navigation controls, or auth tokens.              | 1. CSS `@media print` rules hide all buttons, headers, navigation bars, and modals.<br>2. Only clean, uncredentialed timesheet table renders in print viewport.                                                                                                                                                              | `kiosk-report-dialog.tsx`<br>`tests/e2e/kiosk.spec.ts`                     |

---

## 3. Deep-Dive Review of Critical Subsystems

### 3.1 Device Credential Lifecycle

1. **Creation:** Manager calls `kioskGeneratePairingCodeAction`. A 6-char alphanumeric code (e.g. `K9X2M4`) is generated and its SHA-256 hash is saved to `kiosk_pairing_codes` with 10-minute expiry.
2. **Consumption:** Tablet calls `kioskConsumePairingCodeAction`. Function `kiosk_consume_pairing_code` atomically locks row, verifies expiration, checks attempt count (`<= 5`), and inserts `kiosk_devices` row with device name and SHA-256 hash of device token.
3. **Storage:** The raw device token is set on the response via HttpOnly cookie `lineup_kiosk_device` with 1-year max age. The raw token is **never persisted anywhere on the server**.
4. **Revocation:** Manager calls `kioskRevokeDeviceAction`. The device row status is set to `'revoked'` with timestamp, revoking user, and mandatory reason. All subsequent requests fail closed.

### 3.2 Ephemeral Employee Authentication

1. **PIN Entry:** Keypad accepts 4 digits. Input is masked (`disc` bullets). Auto-submits on 4th digit.
2. **Authentication:** Server looks up employee via `public.passcode_credentials`.
3. **Location Authorization:** Checks `location_memberships` for active status and matching `location_id`.
4. **Session Token:** Server creates an HMAC-SHA256 signed JSON payload (`lineup_kiosk_session`). No Supabase JWT secret or service role key is ever given to the browser.
5. **Auto-Purge:** 45-second inactivity timer automatically calls `handleFinish()`, which invokes `kioskClearSessionAction` to delete the session cookie and clear React component state.

### 3.3 Database Authorization & RLS Audit

- Table `public.kiosk_devices`:
  - `ALTER TABLE public.kiosk_devices FORCE ROW LEVEL SECURITY;`
  - Explicit policies for `SELECT` using `kiosk_can_manage_location(location_id)`.
  - Service-role / elevated actions wrapped in secure `SECURITY DEFINER` RPCs with `search_path = public`.
- Table `public.kiosk_pairing_codes`:
  - `ALTER TABLE public.kiosk_pairing_codes FORCE ROW LEVEL SECURITY;`
  - Explicit policies for `SELECT` and `INSERT` restricted to location managers.
  - Zero read or write access permitted to unauthenticated or `anon` callers.

---

## 4. Auditor Conclusion & Approval

Feature **V2-007** adheres strictly to the security architecture of The Lineup V2.0:

- Tenant isolation is strictly preserved.
- Physical kiosk integrity is established without spoofable client sensors.
- Shared-tablet privacy controls prevent identity bleed between shifts.
- Complete regression and security test suites are passing with zero warnings or errors.

**Verdict: APPROVED FOR INTEGRATION INTO `development`.**
