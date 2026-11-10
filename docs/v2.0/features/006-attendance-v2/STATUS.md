# Feature V2-006: Attendance V2 — Status

```text
Status: IN PROGRESS — BATCH A VERIFIED; BATCH B VERIFIED; BATCH C IMPLEMENTED LOCALLY
        (financial activation POLICY-BLOCKED); INDEPENDENT REVIEW PENDING;
        HOSTED DEV PENDING OWNER APPROVAL; FINAL PR NOT CREATED
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
Migrations: 20261110000000, 20261110010000 (unchanged; Batch C adds none). Local ledger 84.
Hosted DEV: ledger 82, untouched. Production: untouched. Neon: untouched.
Target Merge Branch: development (ONE consolidated PR, only after independent review)
```

## Batch C summary

- Native attendance is implemented as an inactive, testable financial source: canonical provenance-aware contract, eligibility with reasons, authority-before-read reader, read-only manager preview (no hours, no money). Payroll and Tips calculations, snapshots and confirmed records are untouched.
- **No owner approval exists for Q1–Q8.** Native attendance stays `BLOCKED_POLICY` (Q1, Q4, Q6). External and unconfigured locations keep their legacy Neon path unchanged.
- **P1 fixed:** Batch B had widened `getCurrentUser` to accept an Overall role with no membership, which gates service-role passcode-reset and member-deactivation routes. Restored; attendance uses a canonical-context actor instead (README §13.6).
- Tips "Pull clocked-in team" and the Allocation board prioritisation are source-aware for the verified location (suggestion only).
- Evidence: Vitest 3,784 pass (7 pre-existing skips); pgTAP 77 files / 2,929 assertions on a pristine DB; Prettier, ESLint, tsc and `next build --webpack` clean; Playwright 39/39; 150 reads during 40 corrections with 0 torn reads.

Details: README §13. Open owner decisions: README §11 and §13.2. Activation prerequisites: README §13.7. Independent review scope: README §13.11.
