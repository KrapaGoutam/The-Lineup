# THE LINEUP V2.0 — V2-008 MIGRATION & COMPATIBILITY (Batch B1)

Issue [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256) · parent #248 · branch `feature/v2-008-migration-compatibility` (base `development` `790fd2db560c41cb27affe98a70faeb7bd3f07cd`; Batch A checkpoint `874091eb`). Local commits only: not pushed, no PR, upstream deliberately unset.

Previous feature **V2-007 is COMPLETE** (PR #324 → `790fd2db`, #255 closed); its evidence lives under `docs/v2.0/features/007-clock-kiosk/`.

## Batch A — read-only discovery (done, `874091eb`)

- [x] A0–A6: inventory, mapping, role plan, dependencies, D7 plan, decision register, handoff. See [HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md).

## Batch B1 — D7 location-scoped Kiosks + F-1 hardening (owner-authorized, LOCAL ONLY)

- [x] B1.0 Recovery: worktree/branch/HEAD `874091eb`, clean tree, no upstream, `development` unchanged.
- [x] B1-A Authorization matrix (13 actor classes) and session-check mechanism: repo-standard `*_live_session` pattern adopted.
- [x] Proof of defect: predicate section of pgTAP `0078` vs the unfixed 88-migration DB → exactly the 11 F-1 assertions fail.
- [x] B1-B Migration `20261112200000_kiosk_manager_authority_hardening.sql` (live-session gate + org-membership join + listing RPC); local ledger 88 → 89.
- [x] pgTAP `0078` 105/105, `0077` 57/57, full suite 81 files / 3294 PASS.
- [x] Real GoTrue suite `tests/local/kiosk-authority.local.test.ts` 7/7 (+ negative control: 4/7 fail on the old predicate).
- [x] B1-C Action + data + domain + hook + `KioskManagementPage` + Settings Kiosks card; focused Vitest 430/430.
- [x] Browser (real cookies, local stack) 6/6 × desktop, WebKit tablet, mobile; demo specs `kiosk` + `location-administration` 18/18.
- [x] `npm run check` (Prettier, ESLint 0 warnings, tsc) clean.
- [x] B1-E independent security review: non-blocking findings only; comment corrected; U-1 recorded (see HANDOFF §3).
- [x] Docs: HANDOFF, STATUS, D7 plan §8, decision register D-9 note, B2–B4 package, CURRENT_STATE entry.
- [x] One local B1 implementation commit.

Result: **V2-008 B1 PASSED — LOCAL IMPLEMENTATION COMPLETE, HOSTED DEV APPROVAL PENDING.**

## Current State & Next Step

- Resume from [V2-008 HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md). Hosted DEV is still ledger 88; the B1 migration is local only.
- Next exact action: **owner decisions**, not engineering — D-2/D-2b/D-2c (role ladder), the E-1 remediation path, whether to fix U-1 (`kiosk_reassign_device` revived revoked devices) and the shared `session_id`-less-JWT contract (P2-1), and **D-7** before any Hosted DEV push. Then B2 parameterized validator ([package](../docs/v2.0/features/008-migration-compatibility/B2_B4_NEXT_STEP_PACKAGE.md)). Do not start B2–B4 or Batch C automatically.
- Do not: write to Hosted DEV / Production / Neon, apply the B1 migration anywhere hosted, create backfill SQL, archive fixtures, activate enforcement or finance, change attendance modes or module configs, create Overall Owners, push, open a PR, merge, or restore an upstream on this branch.
- Hard invariants: Hosted DEV ledger 88 · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747`.
