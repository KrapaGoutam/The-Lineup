# Release Group 2 — Production release record (2026-11-19)

**Status: DEPLOYED. Owner-authenticated Production smoke PENDING (not yet RELEASED).**

| Step           | Result                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates          | PR #361 head `5aa3a81f`, CI green; Production `the-lineup` (`ftadewtkjlaotfdvtjcv`) ledger 98, head `20261116180009`                                                                                                                                                                  |
| Backup         | Fresh read-only DPAPI-encrypted backup, round-trip verified, 0 drift tables: `TheLineup-PROD-Backups\GROUP2-20261119\prod-20261119T210143Z.zip.dpapi` (bundle sha256 `6c256aec…3416`)                                                                                                 |
| Rehearsal      | Backup restored into an isolated container: 7,131 rows in 96 tables identical; migrations 99 + 100 applied in ~1.4 s; no changed original columns, no row-count change, 0 orphan FKs, RLS on all 92 public tables, 0 anon table grants. Only known platform-level catalog differences |
| Compatibility  | Every legacy Tips RPC the old app uses still exists (`tips_finalize_pool`, `tips_get_day_data`, `tips_location_authorized`, `tips_location_roster`, `tips_reopen_pool`, `tips_add_interval`)                                                                                          |
| Migration 99   | `20261117140000_table_allocation_7day_retention` applied (own transaction + ledger row); ledger 99; cron `table_allocation_records_retention` once at 30 3 \* \* \*; nothing deleted                                                                                                  |
| Migration 100  | `20261119120000_editable_tips` applied; ledger 100, no gaps (100 of 100 vs repo)                                                                                                                                                                                                      |
| Data unchanged | tip pools 5, intervals 10, allocations 24 (sum 18,750 = interval sum), sessions 53, section assignments 159, rotation entries 1,554, audit events 167, payroll payments 25 — identical before and after; retention-eligible sessions 0 (all 53 are `active`)                          |
| New surface    | `tips_save_interval`, `tips_void_interval`, `tips_recalculate_pool`, `tips_get_range` executable by authenticated only (anon 0); `tip_revisions` RLS on, SELECT only; direct writes to tip tables closed                                                                              |
| Merge          | PR #361 merged to `main`: `c3899d8704cd728ce533b0630efe112af6bbb0b8`                                                                                                                                                                                                                  |
| Deployment     | Vercel Production `dpl_2x53bpic9kPykcYGZZUrBLS9m2QD` READY for that SHA; `the-lineup-dusky.vercel.app` and `the-lineup-onepiece11.vercel.app` return 200                                                                                                                              |

## Smoke status

Not run: no authorized Production session was available to the release agent and a Tips save would write real records. **Owner to run** (smallest safe record, history preserved): Dashboard cards scoped per role; Tips Save, Edit, Recalculate, Void, History; the 10 existing intervals show "Not split" with unchanged totals; staff see only their own tips; branch/organization access; quick actions and deep links; Table Allocation unaffected by a Tips save.

Read-only payroll check: 27 external-clock periods, 18 with confirmed payments, none overpaid; outstanding $25,231.30 (equals the net, as expected with no overpayment). The overpaid-period rule stays unit-proven only.

## Rollback

Application: promote the previous Production deployment (migrations stay; they are compatible with the old app). Migration 100 is forward-fix only once Tips revision data exists.

## Deferred / maintenance

First natural retention run (03:30 UTC) is to be observed, not triggered (expect no deletions). DEV synthetic org `v2h-3e34ec40` with confirmed payments stays as DEV cleanup debt. Next.js security upgrade is a separate maintenance item. Group 3 not started.
