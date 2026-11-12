# Feature V2-007: Clock In / Clock Out Kiosk — Independent Security Review & Remediation Report

**Parent Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
**Feature Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)  
**Pull Request:** [#324](https://github.com/KrapaGoutam/The-Lineup/pull/324)  
**Auditor / Review Agent:** Independent Security Reviewer (Claude Code Sonnet High / Antigravity Inspection)  
**Review Date:** November 11, 2026  
**Status:** `APPROVED — ALL 7 SECURITY REMEDIATIONS COMPLETED & VERIFIED`

---

## 1. Executive Summary

This document records the independent security review and mandatory remediation for Feature **V2-007: Clock In / Clock Out Kiosk** prior to merging PR #324 into `development`.

An independent source review conducted on commit `a568d1b` identified 7 specific security vulnerabilities regarding token exposure, cookie confidentiality, credential brute-force resistance, and database mutation permissions. All 7 defects have been resolved with defense-in-depth architectural remediations, verified against local PostgreSQL, Vitest, pgTAP, and Playwright suites.

---

## 2. Mandatory Security Remediation Matrix (PR #324)

| Finding | Severity | Description & Root Cause | Implemented Remediation | Verification Evidence |
| :--- | :---: | :--- | :--- | :--- |
| **1. Employee JWT Exposure** | **Critical** | `kioskGetActiveStatusAction` returned `KioskEmployeeSession` containing raw Supabase JWT `accessToken`, exposing long-lived user credentials to browser memory. | Redesigned return payload to `KioskActiveStatusResponse` containing only `employee` metadata (`profileId`, `displayName`, `organizationId`, `locationId`) and `currentSession`. Zero tokens or credentials are serialized or returned to browser JS. | `src/features/kiosk/actions/kiosk-clock-actions.test.ts`<br>`src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (Remediation 1 test) |
| **2. Session Storage Confidentiality** | **High** | `lineup_kiosk_session` cookie Base64URL-encoded JSON containing the access token. HMAC provides integrity, but does not provide confidentiality against physical inspection or network proxies. | Replaced client session cookie with database-backed server sessions (`public.kiosk_sessions`). Access token is encrypted with AES-256-GCM using authenticated GCM tags. Client receives only an opaque random token (`kiosk_sess_<hex>.<sig>`). | `src/features/kiosk/data/kiosk-cookie.test.ts` (12 tests)<br>`src/features/kiosk/data/kiosk-crypto.ts` (AES-256-GCM + HMAC)<br>`kiosk-lifecycle-security.test.ts` (Remediation 2 test) |
| **3. Predictable Session-Secret Fallback** | **Medium** | `kiosk-cookie.ts` fell back to a hardcoded string or pepper if `KIOSK_SESSION_SECRET` was missing. | Hardened `getKioskSessionSecret()` in `kiosk-crypto.ts` to fail closed: in non-test deployed environments (`process.env.NODE_ENV !== "test"`), missing secret or secret shorter than 32 characters throws immediately. | `src/features/kiosk/data/kiosk-crypto.ts`<br>`kiosk-lifecycle-security.test.ts` (Remediation 3 test) |
| **4. Pairing Code Brute-Force & Accounting** | **High** | Pairing consumption failed to atomically account for invalid pairing codes, and lacked global attempt throttling against random guessing. | Added dedicated tracking table `public.kiosk_pairing_attempts` and atomic RPC `kiosk_record_pairing_failure`. Pairing codes permanently lock after 5 failed attempts (`attempt_count >= max_attempts`). Global rate limit locks pairing after 10 failures in 15 minutes. | `supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`supabase/tests/database/0077_kiosk_device_registration.test.sql` (tests 37-41) |
| **5. PIN Failure Accounting Integrity** | **High** | Some failure branches in `kioskAuthenticatePinAction` failed to insert `succeeded: false` rows into `passcode_login_attempts`, allowing attackers to evade device lockout. | Guaranteed all 6 failure paths (unrecognized locator, inactive membership, location unassigned, attendance mode disabled, password failure, auth failure) insert `{ succeeded: false, fingerprint }`. Only completed sign-in inserts `{ succeeded: true }`. | `src/features/kiosk/actions/kiosk-clock-actions.ts`<br>`src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (Remediation 5 test) |
| **6. Inactivity & Revocation Boundaries** | **High** | Sessions had no explicit server-side TTL table record, and device revocation did not guarantee active employee session purging. | Created `expires_at` column in `public.kiosk_sessions` with 3-minute hard TTL enforced by database queries. `kiosk_revoke_device` and `kiosk_reassign_device` now atomically delete active sessions from `kiosk_sessions`. | `src/features/kiosk/data/kiosk-cookie.ts`<br>`supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`0077_kiosk_device_registration.test.sql` (tests 42-43) |
| **7. SQL Table Privileges Hardening** | **Critical** | `authenticated` role had default INSERT/UPDATE table privileges on `kiosk_devices` and `kiosk_pairing_codes`, permitting managers to bypass audited RPCs and write directly to tables. | Explicitly revoked all direct `INSERT`, `UPDATE`, `DELETE` from `public, anon, authenticated` on `kiosk_devices`, `kiosk_pairing_codes`, `kiosk_pairing_attempts`, and `kiosk_sessions`. Granted only `SELECT` to `authenticated`. All mutations must execute via audited RPCs. | `supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`0077_kiosk_device_registration.test.sql` (tests 33-36) |

---

## 3. Cryptographic and Architecture Safeguards

### 3.1 Opaque Cookie + AES-256-GCM Storage

```
[ Browser / Tablet ]
       │
       │ HttpOnly Cookie: lineup_kiosk_session=kiosk_sess_<64 hex>.<signature>
       ▼
[ Next.js Server Action ]
       │
       ├─► 1. Verify HMAC-SHA256 signature using KIOSK_SESSION_SECRET.
       ├─► 2. SHA-256 hash raw token -> session_token_hash.
       ├─► 3. Query PostgreSQL public.kiosk_sessions WHERE session_token_hash = $1 AND expires_at > now().
       ├─► 4. Decrypt encrypted_access_token via AES-256-GCM with GCM auth tag check.
       │
       ▼
[ Transient In-Memory Employee Client ]
       │
       ├─► Supabase RPC: attendance_clock_in / attendance_clock_out / etc.
       │
       ▼
[ Client Response: Zero Token Leakage ]
       │
       └─► Returns KioskActiveStatusResponse { employee: {...}, currentSession: {...} }
```

### 3.2 SQL Grants & Privilege Boundaries

Direct database privileges on kiosk tables in PostgreSQL:

| Table | `anon` | `authenticated` | `service_role` | Mutation Mechanism |
| :--- | :---: | :---: | :---: | :--- |
| `public.kiosk_devices` | *None* | `SELECT` | `ALL` | Audited RPCs only (`kiosk_consume_pairing_code`, `kiosk_rename_device`, `kiosk_reassign_device`, `kiosk_revoke_device`) |
| `public.kiosk_pairing_codes` | *None* | `SELECT` | `ALL` | Audited RPCs only (`kiosk_generate_pairing_code`, `kiosk_consume_pairing_code`) |
| `public.kiosk_pairing_attempts` | *None* | *None* | `ALL` | Service-role RPCs only (`kiosk_record_pairing_failure`, `kiosk_consume_pairing_code`) |
| `public.kiosk_sessions` | *None* | *None* | `ALL` | Service-role admin client only (`kiosk-cookie.ts`, `kiosk_revoke_device`, `kiosk_reassign_device`) |

---

## 4. Verification & Quality Gates Telemetry

### 4.1 Vitest Unit & Integration Suites
- **Kiosk Feature Suites:** 11 test files, 83 tests passing (**100% PASS**):
  - `src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (21 tests)
  - `src/features/kiosk/actions/kiosk-clock-actions.test.ts` (12 tests)
  - `src/features/kiosk/data/kiosk-cookie.test.ts` (12 tests)
  - `src/features/kiosk/actions/kiosk-admin-actions.test.ts` (8 tests)
  - `src/features/kiosk/domain/kiosk-device.test.ts` (7 tests)
  - `src/features/kiosk/actions/kiosk-pairing-actions.test.ts` (6 tests)
  - `src/features/kiosk/components/kiosk-pairing-screen.test.tsx` (5 tests)
  - `src/features/kiosk/components/kiosk-home-screen.test.tsx` (4 tests)
  - `src/features/kiosk/components/kiosk-attendance-screen.test.tsx` (3 tests)
  - `src/features/kiosk/components/location-kiosk-management.test.tsx` (3 tests)
  - `src/features/kiosk/components/kiosk-report-dialog.test.tsx` (2 tests)
- **Repository Full Vitest Suite:** 294 test files, 3,969 tests passing (**100% PASS**).

### 4.2 Database & pgTAP Suites
- `supabase/tests/database/0077_kiosk_device_registration.test.sql`: 43/43 assertions passing (**100% PASS**).
- Verified RLS policies, direct table write denial (`42501`), brute-force increment and lockout, 15-minute global rate limits, and device revocation session purging.

### 4.3 End-to-End Playwright Suite
- `tests/e2e/kiosk.spec.ts`: 6/6 tests passing across Desktop Chrome, Tablet iPad WebKit, and Mobile Pixel 7 (**100% PASS**).

### 4.4 Static Analysis & Build
- `npm run check`: Prettier code style verified, ESLint 0 warnings, TypeScript 0 errors.
- `npx next build --webpack`: Production build successful, all 13 routes compiled.

---

## 5. Auditor Conclusion & Approval

All 7 security vulnerabilities identified during independent source review have been completely remediated, hardened with defense-in-depth, and verified across all test layers.

**Final Verdict: APPROVED FOR MERGE INTO `development` (PR #324).**
