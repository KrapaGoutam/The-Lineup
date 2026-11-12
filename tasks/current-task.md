# THE LINEUP V2.0 — V2-007 CLOCK IN / CLOCK OUT KIOSK

## Preview configuration continuation — November 12, 2026

- [x] Verify existing clean feature worktree, remote PR #324 head `b6cb82a`, preserved local documentation branch `8744924`, authenticated Vercel owner/project and ready Preview.
- [x] Verify inherited Preview DEV binding equals the expected project, demo disabled, server credential present, Node 24.x, and system environment exposure enabled. No branch-specific variables existed at preflight.
- [x] Correct both isolated kiosk clients to use the existing publishable key; validate PIN and employee JWT client configuration without the legacy variable (96/96 kiosk tests).
- [x] Provision a dedicated secret from 48 cryptographically random bytes as Secret, Preview, feature branch only; verify metadata without retrieving its value.
- [x] Run focused kiosk tests, repository quality checks and production webpack build; review focused diff. Normal local Turbopack cannot resolve this worktree's external dependency junction; exact-head CI/Vercel verify the normal build.
- [x] Record the configuration receipt, platform ingress contract and remaining owner gates in [PREVIEW_CONFIGURATION.md](../docs/v2.0/features/007-clock-kiosk/PREVIEW_CONFIGURATION.md).

Delivery checkpoint: local correction and checks complete; prepare one focused commit and push to existing PR #324. The PR's external delivery receipt is authoritative for the resulting SHA, full CI/browser gates and replacement feature Preview (these cannot be recorded in their own source commit). Do not declare readiness until those exact-head checks and deployed configuration pass. No further implementation or database work is authorized by this checkpoint.

Data/authorization: no schema or hosted data changes; employee clients retain public credentials plus employee JWTs, and privileged operations remain server-only. UI states and attendance behavior are unchanged. Main risks are wrong environment scope, accidental credential exposure and build-time public-variable substitution. Verification covers isolated PIN/client creation, existing kiosk privacy/lifecycle tests, build and exact-head CI. Do not repeat backup/restore/migration rehearsal/full source security review. Hosted DEV migration and fixtures, development merge, financial activation, enforcement and Production remain separately gated.

## Codex continuation — active checkpoint (November 11, 2026)

- [x] Recovered the existing worktree at `32809ec`; all seven Antigravity modifications preserved in `.tmp/continuation-recovery/antigravity.patch`.
- [x] Fetched once; local HEAD, remote feature, and PR #324 match; development remains `c821487`.
- [x] Read-only Hosted DEV ledger: 87 migrations, latest `20261110203355`; kiosk not applied.
- [x] Finish trusted Vercel source boundary and concurrent source throttling; preserve service-role-only grants.
- [x] Verify focused kiosk, database roles/RLS, committed failure accounting, code/source/session concurrency, browser smoke, checks, full unit suite, and build.
- [x] Reconcile documentation and record genuine Claude Sonnet 5 High first-round source review at cf4d1a9; no critical/high findings. Recommended M1 corrected and 96 focused kiosk tests PASS. Final-head follow-up receipt is maintained in PR #324.
- [x] Implementation cf4d1a9 committed/pushed and all exact-head gates green: application, 346 desktop browser tests, Database 80 files / 3,189 assertions, Vercel Preview. Follow-up M1 correction and review receipt are the final continuation commit; final-head follow-up review and CI outcomes are maintained in PR #324 (external closeout receipt).
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
- [x] Independent source Security Review (actual Claude Sonnet 5 High receipt in INDEPENDENT_REVIEW.md; final-head follow-up in PR #324):
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
