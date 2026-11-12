# V2-007 Clock In / Out Kiosk — Agent Handoff (Gate 8 stabilization)

Feature-specific; other V2.0 features keep their own state. Evidence lives in [HOSTED_DEV_ACCEPTANCE.md](HOSTED_DEV_ACCEPTANCE.md), [HOSTED_DEV_MIGRATION.md](HOSTED_DEV_MIGRATION.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), [PREVIEW_CONFIGURATION.md](PREVIEW_CONFIGURATION.md), [FINAL_HANDOFF.md](FINAL_HANDOFF.md), [STATUS.md](STATUS.md). Do not duplicate them.

## 1. Where we are

- Gate 7 = CONDITIONAL PASS (run `V2-007-ACCEPTANCE-20261112-d0d772`, 18/18, 27/27 reconciliation, source `3c314682`).
- **Gate 8 stabilization: code corrections done (D1-D3), D7 classified, `development` secret missing, owner approvals pending.** Gate 8 is NOT closed.
- Branch `feature/v2-007-clock-kiosk` -> PR [#324](https://github.com/KrapaGoutam/The-Lineup/pull/324) -> `development`. Started at `bd91ac8f`; `development` tip `c821487c` had not advanced (0 commits behind, clean merge-tree). Final source SHA: see chat report / PR #324 head (a handoff cannot embed its own commit SHA).

## 2. Work completed in this package

- **Batch A (code):** D1 `PAIRING_CODE_ALPHABET` (31 chars, no `L`) is now the single client-safe source in `domain/kiosk-device.ts`; generator (`kiosk-crypto.ts`) uses unbiased CSPRNG `randomInt` (+ optional injectable index source for tests); keypad rows derive from it; keyboard handler ignores modifier/multi-char/unsupported keys. Length, expiry, rate limits, hashing, consumption and the server format validator (still `[A-Z0-9]{6}`, so old codes still verify) are unchanged. D2 revoke reason labelled required (min 3 trimmed chars, max 200), inline error, submit disabled until valid, server contract unchanged. D3 attendance screen `main`/`footer` are `print:hidden` (root `print:bg-white print:min-h-0 print:p-0`); the report dialog is a sibling so the timesheet still prints; shared `globals.css` print rules untouched.
- **Batch B (validation):** focused kiosk + locations Vitest 29 files / 359 tests pass; `npm run check` pass; Playwright `kiosk.spec.ts` desktop + host-tablet 4/4 pass; one push, exact-head CI/Preview per PR #324.
- **Batch C (read-only):** `development` Preview scope has `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_RESTAURANT_SLUG`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_PIN_PEPPER`, `SUPABASE_SECRET_KEY` and **no `KIOSK_SESSION_SECRET`**. Nothing written; no values decoded.

Files: `src/features/kiosk/{domain/kiosk-device.ts, data/kiosk-crypto.ts, components/kiosk-pairing-screen.tsx, components/location-kiosk-management.tsx, components/kiosk-attendance-screen.tsx}` + tests (`kiosk-crypto.test.ts` new; pairing, management, attendance, location-admin tests; `tests/e2e/kiosk.spec.ts`); docs: this file, `STATUS.md`, `tasks/current-task.md`.

## 3. Findings register

| ID        | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1        | Fixed + unit/component/e2e covered. **Live authenticated pairing retest NOT done** (needs Hosted DEV writes).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D2        | Fixed + covered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D3        | Fixed; class-contract tests only. **No Playwright print-media run of the live attendance screen** (needs a paired session).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D7        | **Owner policy decision.** Backend `kiosk_can_manage_location` allows an active `location_memberships.role='manager'` (pgTAP covers it); UI gate `getLocationAdminContextAction` is org-scoped (overall owner/manager, org owner/general_manager) for the whole Location Administration screen, and its copy says so. A location-only manager cannot reach Kiosks. Not UI-only: the screen also creates/archives locations and edits hours/staff, so a fix needs a location-scoped entry point. Not changed; current behaviour pinned by a test. |
| D4-D6, D8 | Informational/low, unchanged, not implemented (event `source='web'`; reassigned old record stays `active`; no scheduled session purge; inert cookie after revoke). No security/privacy defect found on inspection.                                                                                                                                                                                                                                                                                                                               |

## 4. Prohibited repeat work

18-scenario acceptance, backup/restore rehearsal, kiosk migration, 27-check reconciliation, full pgTAP/Vitest/Playwright, independent security review of unchanged modules. Never reactivate/unban/reuse/delete the retired Gate 7 fixtures (5 devices revoked, 4 locations archived, 5 users banned).

## 5. Owner approvals still required (none implied)

1. Create a **new, dedicated** `KIOSK_SESSION_SECRET`, Preview target, Git branch `development` only (do not copy the feature secret; never print it). Without it `/kiosk` actions fail closed on the `development` Preview.
2. Optional minimal Hosted DEV synthetic retest of pairing with a generated code (new fixtures + cleanup safeguards; proposal in the chat report).
3. Physical-tablet acceptance (pairing, touch keypad, PIN, clock in/out, Finish/timeout, print preview) — unverified; emulation only so far.
4. D7 role-policy decision.
5. Explicit merge of PR #324 into `development` only; then post-merge verification and formal closure.

## 6. Invariants

Ledger 88 (latest `20261111120000_kiosk_device_registration`), Finance OFF, enforcement STAGED, no migration/schema change in this package. `main`/Production/Neon untouched. Do not start V2-008 or native Payroll.

## 7. Next action

Owner reviews the chat report, then decides items 1-5. Next agent: confirm PR #324 head checks are green, apply the approved `development` secret (after approval), verify on a `development` Preview, then merge only on explicit approval. State: this handoff is committed and pushed with the final source commit of this package.
