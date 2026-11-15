# V2-005.006-E: Hosted DEV Integration Evidence

Target: Supabase DEV `opmujepkemwcdxxorhfd`. Production (`ftadewtkjlaotfdvtjcv`) was never contacted.

## Before (read-only)

ledger 81, latest `20261108160000`, ledger md5 `b301b60c6c7a20aeff41b252ba51e0cd`, enforcement `staged`,
0 module configs, no storage tables.

## Controlled apply

- Bundle from `git archive 277efd6`: 82 migration files; first 81 byte-identical to `origin/development`; their
  version digest equalled the live ledger md5; exactly ONE pending file (hash above).
- `supabase link` verified the ref; `db push --linked --dry-run` listed only that file; `db push --linked --yes`
  applied it. Prerequisites at apply time: backup verified + restored, rehearsal PASS, exact-head CI green.

## After (read-only SELECTs through the Management API)

| Check                                                     | Value                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger                                                    | 82, latest `20261109120000`                                                                                                                                                  |
| Enforcement / module configs                              | `staged` / 0 (unchanged; not activated, not seeded)                                                                                                                          |
| RLS on the 4 new tables                                   | enabled                                                                                                                                                                      |
| New RPCs                                                  | 8 SECURITY DEFINER, empty search_path, authenticated-only, not anon                                                                                                          |
| Non-deferrable inventory FKs to locations/memberships     | 0                                                                                                                                                                            |
| New-table rows                                            | 0 (no demo cooler/shelf data added)                                                                                                                                          |
| products / stock rows / adjustments / date lots / recipes | 148 / 236 / 123 / 47 / 32 (unchanged)                                                                                                                                        |
| Stock digest                                              | `8a2b5a62c43a3515af5ad0457b381915` (every stock row and version unchanged)                                                                                                   |
| Full snapshot vs rehearsal (2915 lines)                   | all DATA identical; 0 function/grant/index/RLS/trigger/column diffs; only 8 constraint + 54 policy deparse artifacts (hosted vs container), none on this migration's objects |
| PR Preview client bundles                                 | reference DEV ref (3 hits), Production ref (0 hits)                                                                                                                          |

## Evidence labels

- Local real GoTrue JWT suite (29 tests, local stack only): live-session, ban, revoked session, forged ids, racing writers.
- pgTAP (local stack and GitHub CI): grants, RLS, versions, atomicity, idempotency, Option A.
- Hosted DEV: structural/read-only verification and the rehearsal's rollback-only probe equivalents. No hosted
  authenticated UI test was run (DEV has no module configuration; none was seeded). **Deferred.**
