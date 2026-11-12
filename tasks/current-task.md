# THE LINEUP V2.0 — V2-008 MIGRATION & COMPATIBILITY (Batch B1 + Security Gate S1)

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

## Security Gate S1 — U-1 fix, E-1 plan, D-2 packet (owner-authorized, LOCAL ONLY)

- [x] S1.0 Recovery: worktree/branch/HEAD `6457c1ae`, clean tree, no upstream; B1 migration checksum re-verified; local ledger 89.
- [x] S1-A U-1 analysis: unintended (no contract requires reactivation; re-pair creates a new row).
- [x] S1-B Regression first: pgTAP `0079` fails 21/69 on the unfixed schema; migration `20261112220000_kiosk_reassign_revoked_device_guard.sql`; local ledger 89 → 90; 69/69.
- [x] S1-C Real GoTrue `kiosk-revoked-device-lifecycle` 8/8 (+ negative control), browser stale-tab scenario 21/21, Vitest kiosk 136/136, clean 90-migration replay, full pgTAP 82 files / 3363 PASS.
- [x] S1-D E-1: reproduced with real RPCs (306-row matrix), classified, plan written — **not implemented** ([plan](../docs/v2.0/features/008-migration-compatibility/E1_RECIPES_INVENTORY_SECURITY_PLAN.md)).
- [x] S1-E D-2/2b/2c packet with measured equivalence evidence; B2 rule 8 corrected; completeness proof specified.
- [x] S1-F shared `session_id` review: no bypass; H-S1 tracked; minor UI findings decided.
- [x] Independent read-only review: no P0/P1; P3 notes recorded.
- [x] `npm run check` clean; diff and secret scan; one local S1 checkpoint commit.

Result: see the final line of the S1 chat report and [SECURITY_GATE_S1.md](../docs/v2.0/features/008-migration-compatibility/SECURITY_GATE_S1.md).

## Current State & Next Step

- Resume from [V2-008 HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md) (S1 section first). Hosted DEV is still ledger 88; the B1 and U-1 migrations are local only (local ledger 90).
- Next exact action: **owner decisions, not engineering** — D-10 (E-1 authority model) with D-2/D-2b/D-2c (packet in OWNER_DECISIONS_REQUIRED §4). Then B2 validator/dry-run (N=1 only), the E-1 correction as its own approved package before any N≥2 backfill, then a separately authorized Batch C for Hosted DEV (D-7).
- Do not: write to Hosted DEV / Production / Neon, apply either local migration anywhere hosted, create backfill SQL, archive fixtures, activate enforcement or finance, change attendance modes or module configs, implement E-1 without approval, or start B2/B3/B4.
- Hard invariants: Hosted DEV ledger 88 · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747`.
