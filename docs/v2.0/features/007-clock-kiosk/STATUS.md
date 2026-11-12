# Feature V2-007: Clock In / Clock Out Kiosk — Status

> Current continuation status: implementation validation is recorded in [CONTINUATION_VALIDATION.md](CONTINUATION_VALIDATION.md). The independent first-round review is recorded in [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md); final-head follow-up review and CI receipts are maintained in PR #324. Hosted DEV kiosk deployment/acceptance and development merge require separate owner approval. Earlier batch counts below are historical receipts and do not establish final-source acceptance.

```text
Status: REVIEW / CI RECEIPTS IN PR #324
GitHub Issue: #255
Parent Issue: #248
Milestone: #8 — The Lineup V2.0
Target Branch: development
Feature Branch: feature/v2-007-clock-kiosk
```

---

## Gate 8 stabilization (November 12, 2026)

Gate 7 is CONDITIONAL PASS (18/18). Gate 8 stabilization fixed pairing-code alphabet D1, revoke-reason UX D2 and timesheet print isolation D3 in one batch on PR #324, classified D7 as an owner policy decision, and confirmed the `development` Preview still lacks a dedicated `KIOSK_SESSION_SECRET`. Authenticated pairing retest, physical-tablet validation, the `development` secret and the merge remain owner-gated. Details: [HANDOFF.md](HANDOFF.md). Gate 8 is not closed.

---

## Batch Execution Summary

### Gate 0: Hosted DEV Attendance Readiness — [PASS]

- Base Commit: `c821487cf0344c516cb174a0c77abdde3792a92a` (PR #323 on `origin/development`)
- Verified migration `20261110203355_attendance_manual_entry.sql` hash.
- Verified hosted DEV deployment receipt (`hosted-dev-deploy-receipt.json`, ledger count 87).
- Verified 13/13 authenticated DEV acceptance tests passed and database reconciled.
- Confirmed financial activation strictly `enabled: false`.
- Confirmed backend module enforcement strictly `mode: 'staged'`.

### Batch A: Kiosk Foundation & Pairing — [PASS]

- Subfeatures: V2-007.001 (App Surface), V2-007.002 (Device Pairing), V2-007.003 (Org/Location Binding), V2-007.004 (Manager Permissions).
- Database Migration: `20261111120000_kiosk_device_registration.sql`.
- Tables: `public.kiosk_devices`, `public.kiosk_pairing_codes` with RLS forced.
- Functions: `kiosk_can_manage_location`, `kiosk_generate_pairing_code`, `kiosk_consume_pairing_code`, `kiosk_revoke_device`, `kiosk_rename_device`, `kiosk_reassign_device`.
- Dedicated App Surface: `/kiosk` with full-screen, high-contrast dark theme.
- Manager UI: `LocationKioskManagement` tab integrated in Location Administration.

### Batch B: Employee PIN Clock In / Clock Out — [PASS]

- Subfeature: V2-007.005 (Employee PIN Clock Flow).
- 4-Digit Keypad: Touch-first numeric keypad with live station clock in location timezone.
- Shared-Tablet Isolation: Isolated Supabase Auth, scoped in-memory bearer token, 3-minute HMAC session cookie.
- Canonical Attendance Delegation: Native RPC execution (`attendance_clock_in`, `attendance_clock_out`, `attendance_break_start`, `attendance_break_end`).
- Employee Timesheet: Monthly attendance history with print isolation (`@media print`).
- 45s Inactivity Auto-Finish & manual finish with state purge.

### Batch C: Lifecycle, Security & Consolidated Integration — [PASS]

- Subfeatures: V2-007.006 (Reassignment/Revocation/Recovery), V2-007.007 (Security & Validation).
- Fail-Closed Revocation: Immediate rejection across all 7 clock actions upon device revocation.
- Location Reassignment: Immediate session expiration if device location changes.
- Rate Limiting: 5-failure device lockout (15 min) and 30-failure org lockout (30 min).
- Cross-Tenant & Cross-Employee Isolation: Verified via Vitest and pgTAP suites.
- Consolidated Quality Gates:
  - `npm run check`: 0 Prettier errors, 0 ESLint warnings, 0 TypeScript errors.
  - Vitest Unit & Integration Suite: 294/294 test files, 3951/3951 tests pass.
  - pgTAP Database Tests: 32/32 assertions pass (`0077_kiosk_device_registration.test.sql`), 53/53 assertions pass (`0076_attendance_manual_entry.test.sql`).
  - Playwright E2E Suite: 6/6 tests pass across Desktop Chrome, iPad Tablet, and Mobile Pixel 7.
  - Production Webpack Build: Compiled and static page generation complete with 0 errors.
