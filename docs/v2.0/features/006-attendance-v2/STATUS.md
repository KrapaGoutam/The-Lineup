# Feature V2-006: Attendance V2 — Status

```text
Status: IN PROGRESS — BATCH A/B/C VERIFIED; R1 REVIEW DONE; R2 FINANCIAL GAP CLOSURE IMPLEMENTED LOCALLY
        (decisions Q1/Q4/Q6/Q9/Q9b approved 2026-11-10; ACTIVATION, payments, hosted DEV NOT authorized);
        INDEPENDENT REVIEW COMPLETE, TWO P1 FIXES AND ALL LOCAL VERIFICATION PASS;
        HOSTED DEV PENDING OWNER APPROVAL (Q8); FINAL PR NOT CREATED
GitHub Issue: #254 (OPEN)
Parent Issue: #248
Milestone: #8 (The Lineup V2.0)
Feature Branch: feature/v2-006-attendance-v2 (LOCAL ONLY — not pushed; no PR)
Base Commit: e796eee3fb616a3b3b0b5f525452f9b3958e8196 (origin/development, unchanged)
Commits: 378ee9e (WIP snapshot, unverified) -> 3428e5a (Batch A verified)
         -> b5dcba6 / 76099f9 (Batch B) -> ac1ade1 (docs) -> 8593684 (Batch B browser acceptance)
         -> a76e00a (P1: restore membership-strict getCurrentUser) -> 3dea698 (Batch C contract,
            native adapter, readiness preview, source-aware roster) -> e45f74e (pgTAP 0075)
         -> 5ccb4b2 (Allocation pass-through, e2e) -> Batch C documentation
Migrations: 20261110000000, 20261110010000, 20261110145124, 20261110160147 (confirmation integrity). Local ledger 86.
Hosted DEV: prior reported ledger 82, not contacted. Production: untouched. Neon: untouched.
Target Merge Branch: development (ONE consolidated PR, only after independent review)
```

## Batch C summary

- Native attendance is implemented as an inactive, testable financial source: canonical provenance-aware contract, eligibility with reasons, authority-before-read reader, read-only manager preview (no hours, no money). Payroll and Tips calculations, snapshots and confirmed records are untouched.
- **Historical Batch C receipt:** no owner approvals existed then. R2 subsequently recorded Q1/Q4/Q6/Q9/Q9b decisions; activation remains separately blocked and external compatibility is preserved.
- **P1 fixed:** Batch B had widened `getCurrentUser` to accept an Overall role with no membership, which gates service-role passcode-reset and member-deactivation routes. Restored; attendance uses a canonical-context actor instead (README §13.6).
- Tips "Pull clocked-in team" and the Allocation board prioritisation are source-aware for the verified location (suggestion only).
- Evidence: Vitest 3,784 pass (7 pre-existing skips); pgTAP 77 files / 2,929 assertions on a pristine DB; Prettier, ESLint, tsc and `next build --webpack` clean; Playwright 39/39; 150 reads during 40 corrections with 0 torn reads.

## R2 summary (2026-11-10)

- Native Payroll identity (Option A), atomic version-aware consumption ledger, cross-key double-pay guard, correction-after-confirmation review (no automatic money), and a first-of-month source-transition gate — all behind a default-off switch. Payroll UI for native employees is NOT built.
- Evidence: full pgTAP 78 files / 3,076 PASS on a fresh DB (0076 = 146); full Vitest 3,837 PASS; cold `next build --webpack` PASS; concurrency harness 25/25; Playwright deferred to the final PR gate.
- Two pre-existing test defects fixed (UTC-hour-dependent fixtures in 0074/0075; vacuous isolation assertion in 0075). One own P1 caught by tests before commit.
- Review scope, limits and the hosted DEV package: R2_REVIEW_AND_DEV_APPROVAL_PACKAGE.md.

Details: README §13, §15. Open owner decisions: README §11 and §13.2. Activation prerequisites: README §13.7. Independent review scope: README §13.11.

## Consolidated independent closeout (2026-11-10)

Two P1 native confirmation defects reproduced with actual JWTs and repaired by a
forward-only migration: busy attendance now blocks confirmation; confirmed native
periods cannot reopen. Neon unlock is unchanged. Local results: pristine replay
86; pgTAP 78 files/3,079; Vitest 3,837; actual JWT 12/12; concurrency 25/25;
check/build pass; real browser Attendance 42 cases and Payroll 15/15. Q8 and staged closure remain
unapproved; expected DEV migration set is now four files (82 → 86).
See [the authoritative closeout](FINAL_CONSOLIDATED_CLOSEOUT.md).
