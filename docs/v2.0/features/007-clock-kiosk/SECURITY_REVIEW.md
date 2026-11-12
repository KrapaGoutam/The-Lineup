# Feature V2-007: Clock In / Clock Out Kiosk — Security Remediation & Review Status

**Parent Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)
**Feature Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)
**Pull Request:** [#324](https://github.com/KrapaGoutam/The-Lineup/pull/324)
**Implementation reviewer:** Codex; independent source reviewer: Claude Sonnet 5 High (exact SHA and scope in INDEPENDENT_REVIEW.md)
**Review Date:** November 11, 2026
**Status:** `REVIEW / CI RECEIPTS IN PR #324`

---

## 1. Executive Summary

This document records the independent security review and mandatory remediation for Feature **V2-007: Clock In / Clock Out Kiosk** prior to merging PR #324 into `development`.

The historical handoff attributes seven findings at `a568d1b` to an independent source review. The continuation preserves that history, corrects additional implementation defects, and records new test evidence below. The genuine independent review at cf4d1a9 and its M1 resolution are recorded below; final-head follow-up receipts are maintained in PR #324.

---

## 2. Mandatory Security Remediation Matrix (PR #324)

| Finding                                      |   Severity   | Description & Root Cause                                                                                                                                                                                                                                      | Implemented Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verification Evidence                                                                                                                                                                                                                 |
| :------------------------------------------- | :----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Employee JWT Exposure**                 | **Critical** | `kioskGetActiveStatusAction` returned `KioskEmployeeSession` containing raw Supabase JWT `accessToken`, exposing long-lived user credentials to browser memory.                                                                                               | Redesigned return payload to `KioskActiveStatusResponse` containing only `employee` metadata (`profileId`, `displayName`, `organizationId`, `locationId`) and `currentSession`. Zero tokens or credentials are serialized or returned to browser JS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/features/kiosk/actions/kiosk-clock-actions.test.ts`<br>`src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (Remediation 1 test)                                                                                        |
| **2. Session Storage Confidentiality**       |   **High**   | `lineup_kiosk_session` cookie Base64URL-encoded JSON containing the access token. HMAC provides integrity, but does not provide confidentiality against physical inspection or network proxies.                                                               | Replaced client session cookie with database-backed server sessions (`public.kiosk_sessions`). Access token is encrypted with AES-256-GCM using authenticated GCM tags. Client receives only an opaque random token (`kiosk_sess_<hex>.<sig>`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/features/kiosk/data/kiosk-cookie.test.ts` (12 tests)<br>`src/features/kiosk/data/kiosk-crypto.ts` (AES-256-GCM + HMAC)<br>`kiosk-lifecycle-security.test.ts` (Remediation 2 test)                                                |
| **3. Predictable Session-Secret Fallback**   |  **Medium**  | `kiosk-crypto.ts` fell back to `APP_PIN_PEPPER` if `KIOSK_SESSION_SECRET` was missing.                                                                                                                                                                        | Hardened `getKioskSessionSecret()` in `kiosk-crypto.ts` to strictly require dedicated `KIOSK_SESSION_SECRET` (>= 32 chars) in deployed environments (`process.env.NODE_ENV !== "test"`), removing any fallback to `APP_PIN_PEPPER`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `src/features/kiosk/data/kiosk-crypto.ts`<br>`src/features/kiosk/data/kiosk-cookie.test.ts`<br>`kiosk-lifecycle-security.test.ts` (Remediation 3 test)                                                                                |
| **4. Pairing Code Brute-Force & Accounting** |   **High**   | Pairing consumption failed to atomically account for invalid pairing codes, and a blanket 10-failure global count enabled cross-organization denial-of-service. Direct authenticated RPC access allowed callers to bypass throttling by changing identifiers. | Added `public.kiosk_pairing_attempts` and scoped rate limiting by `client_identifier` (10 per 15 min). Codes lock at 5 attempts (`attempt_count >= max_attempts`). Revoked direct execute on `kiosk_consume_pairing_code` and `kiosk_record_pairing_failure` from `anon` and `authenticated` (restricted exclusively to `service_role`). Caller-controlled rate limit identity eliminated via `getTrustedClientIdentifier` requiring `VERCEL=1` and a valid single-IP `x-vercel-forwarded-for`; HMAC-hashed with the dedicated secret, with no forwarding-header or shared-identity fallback. Added negative tests proving authenticated users cannot bypass rate limits by calling the RPC directly with changing identifiers. | `supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`supabase/tests/database/0077_kiosk_device_registration.test.sql` (tests 14-16, 40-46)<br>`src/features/kiosk/actions/kiosk-pairing-actions.test.ts` (13 tests) |
| **5. PIN Failure Accounting Integrity**      |   **High**   | Some failure branches in `kioskAuthenticatePinAction` failed to insert `succeeded: false` rows into `passcode_login_attempts`, and database rate-limit query errors were treated as 0 failures.                                                               | Guaranteed all 6 failure paths insert `{ succeeded: false, fingerprint }`. Inspected database errors on all rate-limit count queries and attempt-insert writes, failing closed with `rate_limit_unavailable` if database errors occur.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `src/features/kiosk/actions/kiosk-clock-actions.ts`<br>`src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (Remediation 5 test)                                                                                             |
| **6. Inactivity & Single Session Invariant** |   **High**   | Sessions had no explicit server-side TTL table record, device revocation did not purge sessions, and concurrent logins on the same device lacked database uniqueness.                                                                                         | Created `expires_at` column in `public.kiosk_sessions` with 3-minute hard TTL. Added `unique (device_id)` constraint and atomic `.upsert(..., { onConflict: "device_id" })` ensuring at most one active session per physical device. Purged on revocation/reassignment.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `src/features/kiosk/data/kiosk-cookie.ts`<br>`supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`0077_kiosk_device_registration.test.sql` (tests 45-47)                                                            |
| **7. SQL Table Privileges Hardening**        | **Critical** | `authenticated` role had default INSERT/UPDATE table privileges on `kiosk_devices` and `kiosk_pairing_codes`, permitting managers to bypass audited RPCs and write directly to tables.                                                                        | Explicitly revoked all direct `INSERT`, `UPDATE`, `DELETE` from `public, anon, authenticated` on `kiosk_devices`, `kiosk_pairing_codes`, `kiosk_pairing_attempts`, and `kiosk_sessions`. Granted only `SELECT` to `authenticated`. All mutations must execute via audited RPCs.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `supabase/migrations/20261111120000_kiosk_device_registration.sql`<br>`0077_kiosk_device_registration.test.sql` (tests 34-37)                                                                                                         |

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
       ├─► 1. Verify HMAC-SHA256 signature using dedicated KIOSK_SESSION_SECRET.
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

| Table                           | `anon` | `authenticated` | `service_role` | Mutation Mechanism                                                                                                      |
| :------------------------------ | :----: | :-------------: | :------------: | :---------------------------------------------------------------------------------------------------------------------- |
| `public.kiosk_devices`          | _None_ |    `SELECT`     |     `ALL`      | Audited RPCs only (`kiosk_consume_pairing_code`, `kiosk_rename_device`, `kiosk_reassign_device`, `kiosk_revoke_device`) |
| `public.kiosk_pairing_codes`    | _None_ |    `SELECT`     |     `ALL`      | Audited RPCs only (`kiosk_generate_pairing_code`, `kiosk_consume_pairing_code`)                                         |
| `public.kiosk_pairing_attempts` | _None_ |     _None_      |     `ALL`      | Service-role RPCs only (`kiosk_record_pairing_failure`, `kiosk_consume_pairing_code`)                                   |
| `public.kiosk_sessions`         | _None_ |     _None_      |     `ALL`      | Service-role admin client only (`kiosk-cookie.ts`, `kiosk_revoke_device`, `kiosk_reassign_device`)                      |

### 3.3 RPC Privilege Boundaries & Abuse Prevention

| RPC Function                          | `anon` | `authenticated` | `service_role` | Invocation Mechanism & Access Control                                                                                                                  |
| :------------------------------------ | :----: | :-------------: | :------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.kiosk_generate_pairing_code`  | _None_ |    `EXECUTE`    |   `EXECUTE`    | Authenticated managers only; verifies `kiosk_can_manage_location(location_id)`                                                                         |
| `public.kiosk_rename_device`          | _None_ |    `EXECUTE`    |   `EXECUTE`    | Authenticated managers only; location scoped                                                                                                           |
| `public.kiosk_reassign_device`        | _None_ |    `EXECUTE`    |   `EXECUTE`    | Authenticated owners only; rotates device token hash                                                                                                   |
| `public.kiosk_revoke_device`          | _None_ |    `EXECUTE`    |   `EXECUTE`    | Authenticated managers only; purges active sessions                                                                                                    |
| `public.kiosk_consume_pairing_code`   | _None_ |     _None_      |   `EXECUTE`    | **Exclusively service_role**. Direct execution denied (`42501`) to authenticated/anon. Only invoked via Next.js server action `pairKioskDeviceAction`. |
| `public.kiosk_record_pairing_failure` | _None_ |     _None_      |   `EXECUTE`    | **Exclusively service_role**. Direct execution denied (`42501`) to authenticated/anon.                                                                 |

Client abuse identity comes from the server-only `data/kiosk-pairing-identity.ts` helper. Only the Vercel runtime and its single-IP `x-vercel-forwarded-for` are trusted. Other forwarding headers and payload identifiers are ignored; missing identity denies pairing. The source is HMAC-hashed before storage. A transaction advisory lock serializes each source count/write, independently of the code row lock. [Vercel header contract](https://vercel.com/docs/headers/request-headers). Shared NATs share the allowance; distributed real sources remain a residual infrastructure risk.

---

## 4. Verification evidence

See [the continuation receipt](CONTINUATION_VALIDATION.md) for newly executed tests, local rehearsal limits, exact-head CI links, and deployment gates. Browser tests exercise the pairing surface and manager navigation in demo mode; they do not establish Hosted DEV acceptance. Unit tests cover JWT privacy, opaque/encrypted sessions, TTL, revocation/reassignment, canonical attendance delegation, and fail-closed rate-query/attempt-write errors. Database tests use real roles; the separate concurrency harness uses independent PostgreSQL connections.

## 5. Independent review gate

A separate Claude Sonnet 5 High process reviewed public source commit cf4d1a9f266c7c72684c7ba8eca764d837c087a6 and returned APPROVE IMPLEMENTATION FOR OWNER REVIEW, with no critical/high findings, one recommended medium hardening item (M1), and four low-severity residual observations. [Verbatim report and qualifications](INDEPENDENT_REVIEW.md).

M1 is corrected: the data-layer source is required and fails closed when absent or blank, with three negative tests. Final-head follow-up review and exact-head CI receipts are maintained in [PR #324](https://github.com/KrapaGoutam/The-Lineup/pull/324). Codex's own implementation review is not described as independent. Owner approval for Hosted DEV kiosk migration and development merge remains separate.
