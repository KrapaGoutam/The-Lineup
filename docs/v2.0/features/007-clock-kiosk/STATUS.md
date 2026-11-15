# Feature V2-007: Clock In / Clock Out Kiosk — Status

> Current continuation status: implementation validation is recorded in [CONTINUATION_VALIDATION.md](CONTINUATION_VALIDATION.md). The independent first-round review is recorded in [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md); final-head follow-up review and CI receipts are maintained in PR #324. Hosted DEV kiosk deployment/acceptance and development merge require separate owner approval. Earlier batch counts below are historical receipts and do not establish final-source acceptance.

```text
Status: COMPLETE — MERGED INTO development (PR #324, merge 790fd2db560c41cb27affe98a70faeb7bd3f07cd, 2026-11-12T19:25:49Z); issue #255 CLOSED
GitHub Issue: #255
Parent Issue: #248
Milestone: #8 — The Lineup V2.0
Target Branch: development
Feature Branch: feature/v2-007-clock-kiosk (reviewed head 1d82adb058fc34a20a26e3dd98f74f2df6ef45c3)
```

---

## Final closeout record (Gate 8E / 8F / 8H, November 12, 2026)

Recorded in V2-008 Batch A from the previously uncommitted Gate 8 documents; each statement was re-verified against GitHub (PR #324 MERGED, head `1d82adb`, merge `790fd2db`, #255 CLOSED, #256/#257/#248 OPEN).

- **8E:** dedicated `KIOSK_SESSION_SECRET` configured (Preview, Git branch `development` only). See [PREVIEW_CONFIGURATION.md](PREVIEW_CONFIGURATION.md).
- **8F:** targeted retest `V2-007-RETEST-20261112-0718df`: pairing (D1), PIN, clock in/out, print-media (D3), revocation (D2) PASS; **33/33 reconciliation**. See [HOSTED_DEV_ACCEPTANCE.md](HOSTED_DEV_ACCEPTANCE.md).
- **8H:** merged to `development` only; development Preview `dpl_6Xhek5v3EpbHWgq6qQJWsgfJon8V` READY and smoked with no DEV writes.
- **Exception:** the T5 stale-cookie replay of a revoked tablet was not repeated; owner-accepted exception, **not** a pass.
- **Carried forward:** D7 (location-scoped Kiosks UI) → V2-008 (#256); physical-tablet acceptance → V2-009 (#257). Not production-ready until both are done.
- Invariants at closeout: ledger 88, finance OFF, enforcement STAGED, 0 Overall Owners, `main` `5e5b7747` and Production untouched.

Next: [V2-008 Migration & Compatibility](../008-migration-compatibility/STATUS.md).

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
