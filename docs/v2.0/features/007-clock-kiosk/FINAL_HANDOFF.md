# Feature V2-007: Clock In / Clock Out Kiosk — Final Handoff & Release Package

**Parent Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
**Feature Issue:** [#255](https://github.com/KrapaGoutam/The-Lineup/issues/255)  
**Milestone:** [Milestone #8 — The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
**Target Branch:** `development`  
**Feature Branch:** `feature/v2-007-clock-kiosk`  
**Base Commit:** `c821487cf0344c516cb174a0c77abdde3792a92a` (PR #323 on `origin/development`)  
**Status:** `READY FOR MERGE`

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
- `src/features/kiosk/data/kiosk-cookie.test.ts` (4 tests)
- `src/features/kiosk/actions/kiosk-pairing-actions.test.ts` (6 tests)
- `src/features/kiosk/actions/kiosk-admin-actions.test.ts` (8 tests)
- `src/features/kiosk/actions/kiosk-clock-actions.test.ts` (12 tests)
- `src/features/kiosk/actions/kiosk-lifecycle-security.test.ts` (11 tests)
- `src/features/kiosk/components/kiosk-pairing-screen.test.tsx` (5 tests)
- `src/features/kiosk/components/kiosk-home-screen.test.tsx` (4 tests)
- `src/features/kiosk/components/kiosk-attendance-screen.test.tsx` (3 tests)
- `src/features/kiosk/components/kiosk-report-dialog.test.tsx` (2 tests)
- `src/features/kiosk/components/location-kiosk-management.test.tsx` (3 tests)
- `src/features/modules/enforcement-coverage.test.ts` (23 tests)
- `tests/e2e/kiosk.spec.ts` (6 Playwright tests across Chromium, WebKit iPad, and Pixel 7)

---

## 3. Verification & Quality Gates Summary

| Check                      | Command                    |  Result  | Notes                                                            |
| :------------------------- | :------------------------- | :------: | :--------------------------------------------------------------- |
| **Code Formatting**        | `npx prettier --check`     | **PASS** | Clean formatting across all new and modified files.              |
| **ESLint**                 | `npx eslint`               | **PASS** | 0 warnings, 0 errors. React compiler rules and hooks validated.  |
| **Type Check**             | `npm run typecheck`        | **PASS** | Strict TypeScript; zero type errors.                             |
| **Combined Check**         | `npm run check`            | **PASS** | Exit code 0.                                                     |
| **Vitest Suite**           | `npm test`                 | **PASS** | 294 test files, 3,951 tests passing.                             |
| **pgTAP Migration Suite**  | `pg_prove` (Local DB)      | **PASS** | 32/32 assertions passing on migration `20261111120000`.          |
| **pgTAP Regression Suite** | `pg_prove` (Local DB)      | **PASS** | 53/53 assertions passing on migration `20261110203355`.          |
| **Playwright E2E**         | `npx playwright test`      | **PASS** | 6/6 tests passing on desktop, tablet, and mobile viewports.      |
| **Production Build**       | `npx next build --webpack` | **PASS** | Zero build errors. Dynamic route `/kiosk` compiled successfully. |

---

## 4. Pull Request Metadata

### PR Title

`feat(kiosk): implement clock in / clock out kiosk application (V2-007)`

### Target Branch

`development`

### Summary of Changes

- Implements dedicated `/kiosk` touch-first application surface for physical tablets.
- Implements in-app pairing flow via short-lived 6-character alphanumeric codes with atomic consumption.
- Links kiosk devices strictly to server-stored `(organization_id, location_id)` records with RLS forced.
- Integrates Manager Kiosk Management into Location Administration.
- Implements 4-digit PIN authentication with dual rate limiting (5 per kiosk, 30 per organization).
- Implements shared-tablet isolation with 3-minute HMAC session tokens and 45-second inactivity timeout.
- Connects clock in, clock out, and meal/rest breaks directly to canonical native attendance RPCs.
- Adds monthly employee attendance report with clean print isolation.
- Delivers complete test coverage across pgTAP (32 assertions), Vitest (294 test files / 3951 tests), and Playwright E2E (6 multi-viewport tests).
