# THE LINEUP V2.0 — V2-007 CLOCK IN / CLOCK OUT KIOSK

## Codex continuation — active checkpoint (November 11, 2026)

- [x] Recovered the existing worktree at `32809ec`; all seven Antigravity modifications preserved in `.tmp/continuation-recovery/antigravity.patch`.
- [x] Fetched once; local HEAD, remote feature, and PR #324 match; development remains `c821487`.
- [x] Read-only Hosted DEV ledger: 87 migrations, latest `20261110203355`; kiosk not applied.
- [x] Finish trusted Vercel source boundary and concurrent source throttling; preserve service-role-only grants.
- [x] Verify focused kiosk, database roles/RLS, committed failure accounting, code/source/session concurrency, browser smoke, checks, full unit suite, and build.
- [x] Reconcile documentation with actual evidence; independent final-SHA review is PENDING (no Claude reviewer available in this session).
- [ ] Commit/push and exact-head CI closeout in progress: final-source local gates PASS (93 kiosk, 3,979 full Vitest plus 7 skipped, 339 relevant pgTAP assertions, three concurrency cases, Playwright 6/6, check/build/scans). PR #324 remains the only integration target.
- [ ] Owner approval for Hosted DEV kiosk deployment and development merge (separate gates; neither authorized).

Data/auth scope: existing kiosk migration only; no new browser credentials or identity inputs. Pairing UI uses existing error state if trusted source is unavailable. Risks: Vercel-only ingress contract, same-NAT clients share a source allowance, distributed-source abuse remains an infrastructure concern. Tests will exercise direct roles, unknown/expired/reused codes, persisted failures, concurrency, and unrelated-source isolation. Historical completed checklists below are previous-session receipts, not final-source validation or independent acceptance.

**Parent Issue:** #248  
**Feature Issue:** #255  
**Milestone:** #8 — The Lineup V2.0  
**Feature Branch:** `feature/v2-007-clock-kiosk`  
**Worktree:** `.tmp/v2-007-clock-kiosk`  
**Base Commit:** `c821487cf0344c516cb174a0c77abdde3792a92a` (PR #323 on `origin/development`)  
**Execution Model:** Batch A → Batch B → Batch C, one final PR targeting `development`.

---

## Gate 0 — Hosted DEV Attendance Readiness

- [x] Check PR #323 merged on origin/development (`c821487`).
- [x] Verify migration `20261110203355_attendance_manual_entry.sql` hash `99C8BCB14A12D46745B2B80F5CBB44183A10C5A340290EC483B4E02D76977854`.
- [x] Confirm Hosted DEV deployment receipt (`hosted-dev-deploy-receipt.json`, ledger count 87).
- [x] Verify 13/13 authenticated DEV acceptance tests passed and database reconciled.
- [x] Confirm financial activation OFF and backend enforcement STAGED.
- [x] Worktree `.tmp/v2-007-clock-kiosk` initialized cleanly on `c821487`.

---

## Batch A — Kiosk Foundation (V2-007.001 - V2-007.004)

- [x] Schema & Migration: `kiosk_devices`, `kiosk_pairing_codes`, indexes, RLS, functions (`kiosk_generate_pairing_code`, `kiosk_consume_pairing_code`, `kiosk_revoke_device`, `kiosk_rename_device`, `kiosk_reassign_device`).
- [x] pgTAP Test Suite (`0077_kiosk_device_registration.test.sql`):
  - Valid pairing code generation by authorized manager.
  - Rejection of pairing code generation by unauthorized staff / shift manager / foreign org.
  - Successful atomic code consumption & device creation.
  - Rejection of expired pairing code.
  - Rejection of reused pairing code.
  - Attempt count throttling & lockout.
  - Device revocation & query isolation.
- [x] Kiosk Domain & Data Layer:
  - Device credential token generation & hashing.
  - Pairing code format (6-char uppercase alphanumeric, secure random).
  - Cookie management (`lineup_kiosk_device` HttpOnly, SameSite=Lax, Secure).
  - Server actions for device pairing and management.
- [x] Manager Kiosk Management UI:
  - Add Kiosks tab to Location Administration (`LocationAdministration` component).
  - Device list with status badges, last active, location binding.
  - "Pair New Tablet" modal with code display & countdown timer.
  - Device rename, reassign, and revoke controls.
- [x] Dedicated Kiosk Surface (`/kiosk`):
  - Kiosk layout (full-screen, touch-first, portrait & landscape responsive).
  - Tablet pairing screen (enter 6-digit code, touch numeric/alphanumeric keypad).
  - Device pairing submission & persistence.
- [x] Batch A Unit, Component, and Security Tests.

---

## Batch B — Employee PIN Clock In / Clock Out (V2-007.005)

- [x] Kiosk Home Screen UI:
  - Location header (dynamic org name, location name, formatted date, live clock in location timezone).
  - 4-digit PIN keypad (1-9, 0, Clear, Backspace, physical keyboard, auto-submit on 4th digit, masked input).
  - Loading, error shake, and lockout notifications.
- [x] Canonical PIN Authentication & Resolution:
  - Validate device credential from cookie/header.
  - Resolve trusted location binding.
  - Check device rate limits.
  - Authenticate 4-digit PIN against `passcode_credentials`.
  - Verify active membership & location assignment (`location_memberships`).
  - Verify location internal attendance mode (`internal_the_lineup`).
  - Establish scoped, short-lived employee kiosk session.
- [x] Employee Attendance Screen UI:
  - Welcome banner with employee name & location.
  - Current status display ("Not Clocked In" vs "Clocked In at HH:MM AM/PM").
  - Primary Action buttons: [CLOCK IN] or [CLOCK OUT] (+ Break controls if enabled).
  - [My Attendance] button.
  - [Finish] / [Back] button with immediate session purge.
- [x] Clock In / Clock Out Execution:
  - Monotonic server time via canonical `attendance_clock_in` / `attendance_clock_out`.
  - Duplicate prevention & idempotency handling.
  - Success confirmation screen with recorded timestamps and shift duration.
- [x] Employee Attendance Report & Print Isolation:
  - Monthly attendance history for current employee only.
  - Month selector.
  - Daily worked duration & monthly total hours.
  - Print button with print-isolated styles (no navigation, tokens, or PINs in print output).
- [x] Shared-Tablet Privacy & Guardrails:
  - Auto-timeout on inactivity (45s).
  - Immediate state purge on Finish/Done.
  - Cache and bfcache isolation.
- [x] Batch B Unit, Component, and Playwright Tests.

---

## Batch C — Lifecycle, Security, and Final Integration (V2-007.006 - V2-007.007)

- [x] Device Revocation & Fail-Closed Enforcement:
  - Immediate invalidation on server-side revocation.
  - Revoked device denied on PIN, clocking, and reporting.
- [x] Device Reassignment & Location Recovery:
  - Controlled location reassignment with credential rotation.
  - Stale session denial across location changes.
- [x] Comprehensive Security Hardening:
  - Rate limiting (per-device and per-org).
  - Cross-tenant & cross-location isolation verification.
  - Cross-employee attendance report isolation.
  - No secret leakage, no client-side spoofing.
- [ ] Independent final-commit Security Review (pending; historical attribution below is unverified):
  - Claude Code Sonnet High independent inspection.
  - P0/P1 verification and fixes.
- [x] Consolidated Final Quality Gates:
  - `npm run check` (Prettier, ESLint, strict TypeScript).
  - Full Vitest suite.
  - Complete pgTAP suite.
  - Playwright E2E across Chromium, WebKit iPad, Mobile viewports.
  - Production webpack build (`npx next build --webpack`).
- [x] Documentation & Pull Request:
  - Update `docs/v2.0/features/007-clock-kiosk/` documentation suite.
  - Single consolidated PR to `development`.

---

## Mandatory Security Remediation (PR #324)

- [x] Defect 1: Eliminate employee JWT exposure in `kioskGetActiveStatusAction` and serialized responses.
- [x] Defect 2: Secure server-side session storage (`public.kiosk_sessions`, AES-256-GCM encrypted JWTs, opaque HMAC-signed cookie tokens `kiosk_sess_<hex>.<sig>`).
- [x] Defect 3: Dedicated KIOSK_SESSION_SECRET without predictable fallback (`getKioskSessionSecret` fails closed in deployed non-test environments; removed APP_PIN_PEPPER fallback).
- [x] Defect 4: Pairing code brute-force protection & atomicity (`public.kiosk_pairing_attempts`, scoped rate limiting per client_identifier, 5-attempt lockout, revoked `anon` and `authenticated` execute on `kiosk_consume_pairing_code` and `kiosk_record_pairing_failure` exclusively to `service_role`; eliminated caller-controlled rate limit identity via the server-only Vercel identity helper; added negative tests for direct RPC bypass).
- [x] Defect 5: Complete PIN failure accounting integrity (`passcode_login_attempts` records `succeeded: false` on all failure branches; fail closed with `rate_limit_unavailable` on database query errors).
- [x] Defect 6: Inactivity and single active session invariant (server-enforced 3-min TTL in DB, `unique (device_id)` constraint, atomic upsert, session purging on device revocation/reassignment).
- [x] Defect 7: SQL privileges hardening (revoked direct table `INSERT`, `UPDATE`, `DELETE` on all kiosk tables from `authenticated` and `anon`).
- [x] Quality Gates Verified:
  - `npm run check` (Prettier, ESLint 0 warnings, TypeScript 0 errors).
  - Full Vitest suite: 294 test files, 3,977 tests passing (91 kiosk tests).
  - Database pgTAP: 49/49 assertions passing (`0077_kiosk_device_registration.test.sql`).
  - Playwright E2E: 6/6 tests passing across Chromium, WebKit iPad, and Mobile viewports.
  - Production Webpack build: `npx next build --webpack` succeeded with 13 routes.
- [x] Documentation reconciled across `README.md`, `SECURITY_REVIEW.md`, `FINAL_HANDOFF.md`, and `tasks/current-task.md` (15-minute pairing code expiry).
- [x] PR #324 updated with security remediation findings and verification evidence.
