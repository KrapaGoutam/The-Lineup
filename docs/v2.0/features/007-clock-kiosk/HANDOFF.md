# V2-007 Clock In / Out Kiosk — Agent Handoff (Gate 8 COMPLETE, merged to development)

Feature-specific; other V2.0 features keep their own state. Evidence lives in [HOSTED_DEV_ACCEPTANCE.md](HOSTED_DEV_ACCEPTANCE.md) (Gate 7 + Gate 8F), [HOSTED_DEV_MIGRATION.md](HOSTED_DEV_MIGRATION.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), [PREVIEW_CONFIGURATION.md](PREVIEW_CONFIGURATION.md), [FINAL_HANDOFF.md](FINAL_HANDOFF.md), [STATUS.md](STATUS.md). Do not duplicate them.

## 1. Where we are

- Gate 7 = CONDITIONAL PASS (run `V2-007-ACCEPTANCE-20261112-d0d772`, 18/18, 27/27 reconciliation, source `3c314682`).
- **Gate 8E PASS:** dedicated `KIOSK_SESSION_SECRET` configured for Preview, Git branch `development` only (sensitive). Feature-branch secret untouched; no Production change.
- **Gate 8F PASS (targeted retest, run `V2-007-RETEST-20261112-0718df`):** live D1 pairing, employee PIN, Clock In/Out, D3 print-media, manager revocation, D2 dialog, and 33/33 reconciliation. One scoped gap (see §3).
- **Gate 8H COMPLETE:** PR [#324](https://github.com/KrapaGoutam/The-Lineup/pull/324) MERGED into `development` only (regular merge, pinned to head `1d82adb058fc34a20a26e3dd98f74f2df6ef45c3`) as **`790fd2db560c41cb27affe98a70faeb7bd3f07cd`** at 2026-11-12T19:25:49Z; merge tree identical to the reviewed head; `main` still `5e5b7747`. Issue #255 CLOSED, #248 checklist updated (milestone not complete), obligations posted on #256 (D7) and #257 (hardware).
- **Development Preview:** `dpl_6Xhek5v3EpbHWgq6qQJWsgfJon8V` READY at `790fd2db` (alias `the-lineup-git-development-onepiece11.vercel.app`): assets bind only to DEV, demo off, `/kiosk` shows the unpaired pairing screen with the 31-character alphabet (no `L`), no data without a device, no page errors/5xx, no Production/Neon reference. Smoke made no DEV write and no new device; the `development` secret exists (metadata) but its runtime use was not exercised (needs a pairing). No merge-commit CI exists (workflows run on PRs and `main` only); exact-head CI on `1d82adb` is green.

## 2. Gate 8E/8F facts to reuse

- Secret metadata: `KIOSK_SESSION_SECRET`, Secret, Preview, branch `development` only; feature-branch entry unchanged. Value never printed/stored. The first real `development` kiosk runtime smoke can only happen after the merge produces that Preview.
- Preview `dpl_HEj5Whtdmmpe1Wc7523aCQU5PcJt` (`1d82adb`): page payload `demoMode:false`; assets reference only DEV `opmujepkemwcdxxorhfd`; PIN login worked, so the local pepper is compatible.
- Retest: 1 org, 1 location, manager M (org general_manager + location manager), employee E; 1 device, 1 shift (clock_in, clock_out). Live code `shown 3-3`, 6 chars, all in the 31-character alphabet, no `L`; keyboard (5 chars, lowercase) + touch (1 char) paired; every alphabet key present, no keys for I/L/O/0/1.
- Print (Chromium print-media + one-page PDF): report only (org, location, employee, summary, 1:11 PM / 1:13 PM Chicago); Current Status card hidden while visible in screen media; no clock/break/finish controls, keypad, footer or countdown.
- Retired, not deleted: device revoked (credential version 2), location archived, 2 memberships + 2 location memberships + 2 credentials deactivated, 2 Auth users banned. Ledger 88, finance OFF, enforcement STAGED, 0 Overall Owners, 0 kiosk sessions, 0 active devices. Evidence (ignored): `.tmp/hosted-acceptance/v3/`.

## 3. Findings and decisions

| ID               | State                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1               | Fixed and live-verified (Gate 8F T1).                                                                                                                                                                                                                                                                                                                                      |
| D2               | Fixed; dialog verified live (label "required, at least 3 characters", inline error, disabled submit).                                                                                                                                                                                                                                                                      |
| D3               | Fixed and live-verified under print-media (Gate 8F T4).                                                                                                                                                                                                                                                                                                                    |
| D7               | **Owner policy APPROVED, implementation deferred to V2-008 (authorization/compatibility closeout, before Production).** Location-only managers must manage kiosk devices for their assigned locations through a separate location-scoped Kiosks entry point, not general Location Administration. Not implemented; does not block this merge.                              |
| D4-D6, D8        | Informational, unchanged.                                                                                                                                                                                                                                                                                                                                                  |
| Physical tablets | **Unverified; deferred to V2-009 before Production** (pairing, touch keypad + PIN, clock in/out, Finish/session privacy, inactivity timeout, print preview). Emulation is not hardware acceptance.                                                                                                                                                                         |
| T5 gap           | The tablet browser context was closed unsaved after a harness navigation fault, so the live post-revoke tablet request was not repeated. Revocation itself, audit, session removal and no attendance mutation are verified; the live fail-closed behavior of a revoked tablet is Gate 7 scenario 14 on unchanged server code. A second device was not created (scope cap). |

## 4. Prohibited repeat work

18-scenario acceptance, backup/restore rehearsal, kiosk migration, full pgTAP/Vitest/Playwright, independent security review of unchanged modules, CI reruns on `1d82adb`. Never reuse/unban/delete the Gate 7 or retest fixtures. No global sign-out.

## 5. Remaining decisions

None for V2-007. Do not describe the Gate 8F stale-cookie replay as passed.

## 6. Invariants

Ledger 88 (latest `20261111120000`), Finance OFF, enforcement STAGED, no migration/schema change. `main`/Production/Neon untouched. Do not start V2-008 or native Payroll before closure.

## 7. Next action

No further V2-007 implementation is required. Next work package: **V2-008 Batch A** (Migration & Compatibility, #256) including D7. Physical-tablet acceptance is owned by V2-009 (#257). Not production-ready until both are done.

**Documentation persistence:** this handoff, `HOSTED_DEV_ACCEPTANCE.md` (Gate 8F section), `PREVIEW_CONFIGURATION.md` (Gate 8E section) and `tasks/current-task.md` were updated after the PR head was fixed and are **local, uncommitted worktree changes in `.tmp/v2-007-clock-kiosk`; they are not in `development`** (its `HANDOFF.md` is the earlier stabilization version). Integrate them at the next authorized documentation checkpoint (e.g. with V2-008 Batch A); do not push a docs-only change just for them. Do not discard the worktree until then.
