# V2-005.002 Tasks location scoping — READY FOR OWNER REVIEW

Approved owner contract: docs/v2.0/features/005-module-location-scoping/002-tasks/PLAN.md. Issue #310 / parent #253 / program #248. Base 3fa0bf72, isolated feature worktree.

- [x] CP-T00 baseline and durable handoff.
- [x] CP-T01 contracts, data/auth/UI risks and tests mapped.
- [x] CP-T02 database authorization and actor integrity.
- [x] CP-T03 verified-location application binding.
- [x] CP-T04 notification/history/recurrence validation.
- [x] CP-T05 security tests.
- [x] CP-T06 regression and independent review.
- [x] CP-T07 Preview compatibility, push and PR.
- [x] CP-T08 exact-head CI.
- [x] CP-T09 final handoff.

Implementation `ab8780b1e31016ea417b0013c519212a32baa2a3` is pushed in PR311 to development; all five source-head checks SUCCESS, including browser337. Local JWT17, browser18, old-schema compatibility1, replay77, pgTAP2198, units3261/7 skips, check/build/scans and independent review PASS. Final documentation-only PR head is verified before delivery, with exact SHA/run IDs in local CP-T08/T09 handoff and owner report. PR remains open/unmerged, auto-merge off. Next owner action: review/approval. Hosted changes/activation, retained backup changes, merge, main and Production remain prohibited; enforcement STAGED. Parent253 remains open; .003–008 not started.
