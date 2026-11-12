# THE LINEUP V2.0 — V2-007 CLOCK IN / CLOCK OUT KIOSK

## Gate 7 Run 2 — service-role synthetic acceptance — November 12, 2026

Run `V2-007-ACCEPTANCE-20261112-d0d772`. Authorization: Q8-style service-role fixtures only; no Overall Owner, no existing account, no sign-out of any kind. This supersedes the blocked Attempt 1 section below (kept as history).

- [x] Preflight: worktree/HEAD `3c314682`, Preview READY and bound to DEV, ledger 88, Finance OFF, enforcement STAGED, kiosk tables empty.
- [x] PIN pepper compatibility proven non-disclosingly (HMAC request-fingerprint match against the earlier Preview login).
- [x] Fresh baseline with per-row hashed Auth inventory; write-ahead manifest; guarded cleanup dry run before any write.
- [x] Provision 2 organizations, 4 locations, 5 identities (manifest-owned); mid-run and final reconciliation 27/27.
- [x] Execute all 18 canonical scenarios on the real Preview: 17 PASS, 1 PASS under print-media emulation (D3). Supplementary: spoofed headers, stale-credential server replay, WebKit iPad emulation.
- [x] Retire synthetic fixtures (5 devices revoked, 4 locations archived, 5 memberships/8 location memberships/5 credentials deactivated, 5 users banned); verified denied. Nothing deleted.
- [x] Update [HOSTED_DEV_ACCEPTANCE.md](../docs/v2.0/features/007-clock-kiosk/HOSTED_DEV_ACCEPTANCE.md) (Attempt 1 and the `TestOwner` incident preserved).

Result: **GATE 7 CONDITIONAL PASS — SPECIFIC VERIFICATION OUTSTANDING.**

## Current State & Next Step

- Owner decision needed on **D1** (medium): the pairing-code generator can emit `L`, which the kiosk keypad and keyboard handler cannot enter (about 17% of codes). One-line fix candidate in `src/features/kiosk/data/kiosk-crypto.ts`; re-test pairing afterwards. Lower findings D2 to D8 are in the acceptance receipt.
- Physical-tablet check (pairing, PIN, clock, print) still outstanding; all tablet evidence is emulation.
- Gate 8, not started: dedicated `KIOSK_SESSION_SECRET` for the `development` Preview; final exact-head CI and integration checks; explicit owner approval to merge PR #324 into `development` only; post-merge verification; formal V2-007 closure. Do not touch `main`, Production or V2-008.
- Separate future task: Platform Overall Owner governance (bootstrap, organization provisioning, audit); not part of V2-007.

## Owner-authorized synthetic Hosted DEV acceptance — November 12, 2026

Run: `v2007-20261112-1422-d11871`. Scope: the canonical 18 scenarios from preserved readiness commit `8744924`, DEV `opmujepkemwcdxxorhfd`, exact feature Preview/source `3c314682`. This new authorization supersedes the older migration-only scope below. No application/schema/configuration corrections or merge are authorized.

- [x] Preserve existing migration receipt and locate canonical 18-scenario matrix.
- [x] Verify worktree/PR exact head, Preview metadata/DEV binding, ledger 88, forced RLS/privileged RPC restrictions, Finance OFF/enforcement STAGED, and empty kiosk fixture tables.
- [x] Capture pre-fixture baseline: all 122 tables, stable organization/location/profile/membership IDs and fingerprints; all 44 existing location modes unchanged/unconfigured.
- [x] Check canonical provisioning authority: existing synthetic TestOwner login succeeds, but DEV has zero Overall Owners; first-owner bootstrap refuses the 29 existing owner memberships. Stop before fixture creation.
- [ ] Provision 2 synthetic organizations, 4 locations, 5 identities using canonical account/PIN and authorized management flows; record manifest before testing.
- [ ] Execute deployed 18-scenario acceptance and capture database effects and denials.
- [ ] Clean up safely by verified run/resource IDs, reconcile baseline, and enumerate retained audit/history.
- [ ] Complete sanitized acceptance documentation, validate and review documentation-only diff, commit/push only if complete and safe.

- [x] Preserve a complete blocked-run receipt in [HOSTED_DEV_ACCEPTANCE.md](../docs/v2.0/features/007-clock-kiosk/HOSTED_DEV_ACCEPTANCE.md), including all 18 BLOCKED / NOT EXECUTED scenarios and the Auth-session scope incident.
- [x] Validate blocked documentation: Prettier and git diff whitespace checks PASS; migration receipt byte-identical; no application/schema change or credentials in public evidence. Full suites intentionally not repeated.

Stopped: **HOSTED DEV ACCEPTANCE BLOCKED — ACTION REQUIRED**. No new organization/location/identity/device/Attendance fixture was created. 117/122 table digests and all original organizations/locations/profiles/memberships match; ledger 88, Finance OFF and enforcement STAGED preserved. The synthetic TestOwner login added one retained success attempt and Auth login state. Agent cleanup incorrectly invoked the app's default GLOBAL sign-out: pre-existing synthetic TestOwner sessions/tokens were invalidated (sessions 79→58, claims 79→58, refresh tokens 114→58). This exceeds temporary-session scope; no restoration or source correction attempted. Auth per-row preflight inventory was not captured, so complete removed-ID reconciliation is unavailable. Zero kiosk sessions/codes/attempts/devices remain. Browser closed. Desktop read-only entry smoke PASS; WebKit certificate failure remains an environment limitation.

Next owner action: designate and separately authorize a supported Overall Owner provisioning/bootstrap path; acknowledge the Auth-session incident and decide any further read-only reconciliation. Restart only with task-only provisioning credentials and a fresh baseline. Gate 7 incomplete; development Preview secret, final CI/integration, explicit PR #324 merge authorization and formal closure remain Gate 8 work. No commit/push because acceptance is incomplete. Existing migration receipt and prior local edits preserved; no broad suite/rehearsal rerun.

## Owner-authorized Hosted DEV migration — November 12, 2026

Authorization: apply only `20261111120000_kiosk_device_registration.sql` (SHA-256 `a83150c1abd5f2b143e5f29da33549dc7ef255727be2384b56ac5b1ddd531f82`) to DEV `opmujepkemwcdxxorhfd` after every preflight passes. Source HEAD remains `3c314682e1b211df3470eab290ac21acb1d3e7b3`; no acceptance fixtures, Attendance-mode activation, Vercel changes or merge authorized.

- [x] Verify exact DEV identity, file hash, 87-entry ledger/latest `20261110203355`, kiosk absence, OFF/STAGED state and expected-commit READY Preview.
- [x] Locate fresh owner-private encrypted backup and successful isolated restore/exact kiosk rehearsal receipts (339 assertions and concurrency PASS).
- [x] Revalidate encrypted backup/component integrity and owner-only file ACLs; restore/exact rehearsal remains applicable. All business content and application catalog/security fingerprints match. Auth drift is verified existing-session token rotation/timestamps only (58 column comparisons; no identity/credential/authorization change); no material drift and no refresh needed.
- [x] Verify exact pending set and pinned 2.76.8 controlled runner dry-run: only the approved kiosk file; all 88 runner files byte-identical to source and explicit DEV link verified.
- [x] Apply only the approved migration through the guarded runner after every preflight passed (2026-11-12 13:59 UTC); no seed/role/include-all/history-repair options.
- [x] Verify ledger 88; four empty forced-RLS tables, two policies, 16 valid indexes, 24 validated constraints, seven hardened functions and restricted grants. All 118 pre-existing non-ledger tables and existing catalog/security fingerprints unchanged; original 87 ledger rows unchanged. OFF/STAGED preserved.
- [x] Record [HOSTED_DEV_MIGRATION.md](../docs/v2.0/features/007-clock-kiosk/HOSTED_DEV_MIGRATION.md) and ignored machine-readable/encrypted diagnostics; stop at separate synthetic-acceptance approval gate.

Current state: HOSTED DEV MIGRATION PASSED — READY FOR SYNTHETIC ACCEPTANCE APPROVAL. No fixture creation, hosted acceptance, Attendance-mode activation, Vercel changes, merge or V2-008 work performed. Source HEAD remains the authorized `3c314682`; local execution documentation is uncommitted and not pushed. Earlier approval/pending-migration statements below are historical and superseded by this owner-authorized migration receipt.

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
