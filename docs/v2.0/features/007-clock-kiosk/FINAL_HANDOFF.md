# Feature V2-007: Clock In / Clock Out Kiosk — Final Handoff & Release Package

> Current continuation status: implementation validation is recorded in [CONTINUATION_VALIDATION.md](CONTINUATION_VALIDATION.md). The independent first-round review is recorded in [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md); final-head follow-up review and CI receipts are maintained in PR #324. Hosted DEV kiosk deployment/acceptance and development merge require separate owner approval. Earlier batch counts below are historical receipts and do not establish final-source acceptance.

**Parent Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
**Feature Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)  
**Milestone:** [Milestone #8 — The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
**Target Branch:** `development`  
**Feature Branch:** `feature/v2-007-clock-kiosk`  
**Base Commit:** `c821487cf0344c516cb174a0c77abdde3792a92a` (PR #323 on `origin/development`)  
**Status:** `REVIEW / CI RECEIPTS IN PR #324`

---

## 1. Release Overview

Feature **V2-007** implements the dedicated Clock In / Clock Out Kiosk application surface for The Lineup. Physical station tablets are paired in-app by authorized restaurant managers using cryptographically secure one-time pairing codes. Device location is derived strictly from server-stored records, completely eliminating GPS/IP spoofing risks.

The application delivers a touch-first, 4-digit PIN authentication interface that delegates directly to canonical attendance RPCs while protecting shared-tablet privacy via short-lived HMAC sessions, 45-second inactivity auto-purge, and print isolation.

---

## 2. Deliverables & File Manifest

### 2.1 Database & Migrations

- `supabase/migrations/20261111120000_kiosk_device_registration.sql`:
  - Tables: `public.kiosk_devices`, `public.kiosk_pairing_codes` with RLS forced.
  - RPCs: `kiosk_can_manage_location`, `kiosk_generate_pairing_code`, `kiosk_consume_pairing_code`, `kiosk_revoke_device`, `kiosk_rename_device`, `kiosk_reassign_device`.
- `supabase/tests/database/0077_kiosk_device_registration.test.sql`:
  - 32 pgTAP assertions covering code generation, permissions, atomic consumption, reuse prevention, rate-limit locking, device revocation, and RLS isolation.

### 2.2 Domain, Crypto & Cookie Management

- `src/features/kiosk/domain/kiosk-device.ts`: Pure domain types, status enums, validation functions.
- `src/features/kiosk/data/kiosk-crypto.ts`: Server-only cryptographic utilities (`generatePairingCode`, `hashPairingCode`, `generateDeviceToken`, `hashDeviceToken`).
- `src/features/kiosk/data/kiosk-cookie.ts`: Device cookie (`lineup_kiosk_device`) and HMAC-SHA256 session cookie (`lineup_kiosk_session`) managers.
- `src/features/kiosk/data/kiosk-device-data.ts`: Server-side data queries for device resolution and lookup.

### 2.3 Server Actions

- `src/features/kiosk/actions/kiosk-pairing-actions.ts`: `kioskConsumePairingCodeAction`, `kioskCheckDeviceStatusAction`.
- `src/features/kiosk/actions/kiosk-admin-actions.ts`: `kioskGeneratePairingCodeAction`, `kioskRevokeDeviceAction`, `kioskRenameDeviceAction`, `kioskReassignDeviceAction`.
- `src/features/kiosk/actions/kiosk-clock-actions.ts`: `kioskAuthenticatePinAction`, `kioskClockInAction`, `kioskClockOutAction`, `kioskBreakStartAction`, `kioskBreakEndAction`, `kioskGetActiveStatusAction`, `kioskGetEmployeeReportAction`, `kioskClearSessionAction`.

### 2.4 User Interface Surfaces

- `src/app/kiosk/layout.tsx`: Full-screen touch layout with high-contrast kiosk styling.
- `src/app/kiosk/page.tsx`: Root kiosk page handling server-side device token resolution.
- `src/features/kiosk/components/kiosk-app.tsx`: Client coordinator handling pairing vs home vs attendance screen transitions.
- `src/features/kiosk/components/kiosk-pairing-screen.tsx`: 6-character touch keypad for device pairing.
- `src/features/kiosk/components/kiosk-home-screen.tsx`: 4-digit PIN keypad with live station clock in restaurant timezone.
- `src/features/kiosk/components/kiosk-attendance-screen.tsx`: Clock in/out, break controls, status indicator, and 45s auto-timeout.
- `src/features/kiosk/components/kiosk-report-dialog.tsx`: Monthly timesheet report with `@media print` isolation.
- `src/features/kiosk/components/location-kiosk-management.tsx`: Location Administration tab for manager device oversight.
- `src/features/locations/components/location-administration.tsx`: Integrated Kiosks tab.

### 2.5 Tests

- `src/features/kiosk/domain/kiosk-device.test.ts` (7 tests)
- `src/features/kiosk/data/kiosk-cookie.test.ts` (12 tests)
- `src/features/kiosk/actions/kiosk-pairing-actions.test.ts` (13 tests)
- `src/features/kiosk/actions/kiosk-admin-actions.test.ts` (8 tests)
- `src/features/kiosk/actions/kiosk-clock-actions.test.ts` (12 tests)
- `src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (22 tests)
- `src/features/kiosk/components/kiosk-pairing-screen.test.tsx` (5 tests)
- `src/features/kiosk/components/kiosk-home-screen.test.tsx` (4 tests)
- `src/features/kiosk/components/kiosk-attendance-screen.test.tsx` (3 tests)
- `src/features/kiosk/components/kiosk-report-dialog.test.tsx` (2 tests)
- `src/features/kiosk/components/location-kiosk-management.test.tsx` (3 tests)
- `tests/e2e/kiosk.spec.ts` (6 Playwright tests across Chromium, WebKit iPad, and Pixel 7)

---

## 3. Verification & Quality Gates Summary

| Check                     | Command                    |  Result  | Notes                                                            |
| :------------------------ | :------------------------- | :------: | :--------------------------------------------------------------- |
| **Code Formatting**       | `npx prettier --check`     | **PASS** | Clean formatting across all new and modified files.              |
| **ESLint**                | `npx eslint`               | **PASS** | 0 warnings, 0 errors. React compiler rules and hooks validated.  |
| **Type Check**            | `npm run typecheck`        | **PASS** | Strict TypeScript; zero type errors.                             |
| **Combined Check**        | `npm run check`            | **PASS** | Exit code 0.                                                     |
| **Vitest Suite**          | `npm test`                 | **PASS** | 294 test files, 3,977 tests passing (91 kiosk tests).            |
| **pgTAP Migration Suite** | `0077_kiosk_device`        | **PASS** | 49/49 assertions passing on migration `20261111120000`.          |
| **Playwright E2E**        | `npx playwright test`      | **PASS** | 6/6 tests passing on desktop, tablet, and mobile viewports.      |
| **Production Build**      | `npx next build --webpack` | **PASS** | Zero build errors. Dynamic route `/kiosk` compiled successfully. |

---

## 4. Pull Request Metadata

### PR Title

`feat(kiosk): implement clock in / clock out kiosk application (V2-007)`

### PR Number

[PR #324](https://github.com/KrapaGoutam/The-Lineup/pull/324)

### Target Branch

`development`

### Summary of Changes

- Implements dedicated `/kiosk` touch-first application surface for physical tablets.
- Implements in-app pairing flow via short-lived 6-character alphanumeric codes with atomic consumption (15-minute TTL).
- Links kiosk devices strictly to server-stored `(organization_id, location_id)` records with RLS forced.
- Integrates Manager Kiosk Management into Location Administration.
- Implements 4-digit PIN authentication with dual rate limiting (5 per kiosk, 30 per organization).
- Connects clock in, clock out, and meal/rest breaks directly to canonical native attendance RPCs.
- Adds monthly employee attendance report with clean print isolation.
- **Mandatory Security Hardening (PR #324):**
  1. Eliminated raw employee Supabase JWT exposure in all server action responses (`KioskActiveStatusResponse`).
  2. Implemented database-backed server sessions (`public.kiosk_sessions`) with AES-256-GCM encrypted JWTs, opaque HMAC-signed cookie tokens (`kiosk_sess_<hex>.<sig>`), and unique `(device_id)` single-session database invariant.
  3. Enforced fail-closed dedicated session secret validation (`KIOSK_SESSION_SECRET` >= 32 chars) in deployed non-test environments without fallback to `APP_PIN_PEPPER`.
  4. Scoped pairing rate limiting to `client_identifier` (10 per 15 min), permanent code locking at 5 failures, revoking `anon` and `authenticated` execute on `kiosk_consume_pairing_code` (restricted exclusively to `service_role`), returning structured error responses without transaction rollback. Eliminated caller-controlled rate limit identity by deriving abuse identifiers from trusted platform edge headers (Vercel runtime only, validated `x-vercel-forwarded-for`, HMAC-hashed, no fallback). Added negative tests proving authenticated users cannot bypass rate limits by calling the RPC directly with changing identifiers.
  5. Guaranteed complete PIN failure accounting in `passcode_login_attempts` across all failure paths, with fail-closed handling (`rate_limit_unavailable`) if database rate-limit queries or attempt writes encounter errors.
  6. Enforced 3-minute hard TTL in database sessions and immediate session purging on device revocation or reassignment.
  7. Hardened SQL privileges by revoking direct table `INSERT`, `UPDATE`, `DELETE` on all kiosk tables from `authenticated` and `anon`.
- Delivers complete test coverage across pgTAP (49 assertions), Vitest (294 test files / 3,977 tests), and Playwright E2E (6 multi-viewport tests).
