# Feature V2-006: Attendance V2 — Status

```text
Status: IN PROGRESS — BATCH A VERIFIED + CORRECTED; BATCH B DELIVERED (UNMERGED); BATCH C NOT STARTED
GitHub Issue: #254
Parent Issue: #248
Milestone: #8 (The Lineup V2.0)
Feature Branch: feature/v2-006-attendance-v2 (LOCAL ONLY — not pushed; no PR)
Base Commit: e796eee3fb616a3b3b0b5f525452f9b3958e8196
Commits: 378ee9e (WIP snapshot, unverified) → 3428e5a (Batch A verified checkpoint)
         → b5dcba6 (Batch B corrections backend) → 76099f9 (Batch B reporting + guard fix) → docs
Next Batch: Batch C (V2-006.006 Payroll/Tips, V2-006.007 External compatibility) — BLOCKED on owner decisions Q1, Q4, Q6
Target Merge Branch: development (single consolidated PR after Batch C)
Hosted DEV / Production: untouched (both migrations applied to the disposable local DB only)
```

Batch A independent review: 14 findings (5 × P1, 6 × P2, 3 × P3) fixed — README §3 and §10.
Batch B: manager corrections (append-only, versioned, audited) and unified reporting (one source per location, never merged) — README §5–§9.
Open owner decisions Q1–Q8 — README §11. Batch C handoff — README §12.
