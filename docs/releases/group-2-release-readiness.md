# Release Group 2 — consolidated release readiness

Date 2026-11-19. **Status: READY for the consolidated Production release. NOT released.** Production and `main` are untouched; both need the owner's separate final release authorization.

## Contents

| Part | Feature                           | PR / commit                                                 | State                                               |
| ---- | --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| A    | V2.0.8 Editable Tips              | PR #358, `94f05eb9`                                         | Merged to `development`; DEV ledger 100             |
| B    | V2.0.9 Daily Operations Dashboard | PR #359, `b3cedd8c`                                         | Merged to `development`; no migration               |
| C    | Integrated Operations Check       | [PHASE_C.md](../features/v2-0-9-daily-dashboard/PHASE_C.md) | PASS on hosted DEV; one item NOT TESTED (see below) |

`main` is still `27b8988` (Release Group 1). `development` is `b3cedd8c`.

## Required Production migration sequence (migrations first, then the application)

1. `20261117140000_table_allocation_7day_retention.sql` (pg_cron `table_allocation_records_retention`, 03:30 UTC)
2. `20261119120000_editable_tips.sql`

Both must be applied to Production before the Group 2 application is deployed. The V2.0.9 Dashboard needs no migration. DEV applied them in this order (ledger 98 → 99 → 100). Production's ledger and recovery point must be re-verified read-only immediately before the apply (a fresh backup and rehearsal are the Release Group 1 recipe).

## Rollback posture

- Application: roll back to the previous Production deployment. The Dashboard is read-only and the Tips UI is the only consumer of the new RPCs, so an application rollback is safe while the migrations stay.
- Migration 100 is forward-fix only once tender, void or revision data exist (as on DEV). Take the Production backup first.

## Evidence summary

- V2.0.8: PR #358 exact-head CI green, DEV smoke PASS (save, update, recalculate, void, history/print, staff self-only, legacy RPCs).
- V2.0.9: PR #359 exact-head CI green (`application`, `browser-smoke`, Vercel); focused Vitest, demo Playwright 9/9 on three viewports, one independent review with fixes applied.
- Phase C: real-database DEV acceptance, see the record. Figures reconcile to raw-table arithmetic; staff privacy, branch/organization boundaries and disabled modules hold.

## Open items (do not block, owner awareness)

- NOT TESTED on DEV: confirmed-payment netting and the overpaid-period rule (unit-proven; confirmed payments are undeletable so no disposable fixture can hold one). Re-verify read-only against real Production data after release with the existing Payroll screen as the reference.
- Dashboard limits (documented): external or unconfigured attendance and internal-attendance payroll show Unavailable; legacy branch-less payroll periods are excluded; Pending Payroll's outstanding balance spans all months of the branch while the draft count is the current month. The latter is an owner question carried since V2.0.9.
- Post-release smoke by an owner-authenticated session on Production (cards, a Tips edit, the retention job's first natural run) is recommended.

## What this record does not authorize

No Production migration, no Production deployment, no merge to `main`, no Release Group 3.
