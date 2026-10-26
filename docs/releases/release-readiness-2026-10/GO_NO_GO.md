# Release-readiness decision — `development` → `main`

Audit date: 2026-10-26 · Tracking issue: #160 · Blocker issue: #161

| Ref                        | SHA                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| `origin/main` (Production) | `3403058`                                                                        |
| `origin/development`       | `4ec6fe3`                                                                        |
| merge-base                 | `3403058` (development is a strict superset of main: 68 commits ahead, 0 behind) |

## Decision

# NO-GO

**Recommendation: RELEASE BLOCKED** (until the conditions below are cleared, then re-evaluate; expected outcome after C1–C4 is **CONDITIONAL GO**).

The application and database code on `development` is release-quality. The decision is driven by the **Production delivery path**, which is broken and was never proven for this release, plus one verified Production schema drift. Nothing in this audit found a security, tenant-isolation or data-loss defect in the code.

## Why NO-GO (verified, read-only)

1. **Production migration automation is broken.** `deploy-migrations` (Database workflow, push to `main`) failed on the last four pushes to `main` (2026-09-11 → 09-20) with a Supabase authorisation error (#111, P1, `status:blocked`). The `SUPABASE_ACCESS_TOKEN` secret has not been shown to work since.
2. **PROD migration history is out of order.** PROD has 32 history rows; `main` has 33 migration files. `20260911130000_payroll_payment_unconfirm` was never applied, although later migrations (`20260919…`–`20260923…`) were applied by hand. Consequences: (a) `public.unconfirm_payroll_payment` does not exist in PROD, so _Unconfirm payment_ is broken in Production today (pre-existing, #161); (b) `supabase db push` rejects out-of-order local migrations unless `--include-all` is used, so even a repaired job would not apply the release set as-is.
3. **Release skew is unguarded (#113).** A push to `main` starts the Vercel Production deploy and `deploy-migrations` in parallel with no ordering and no gate. The release needs migrations **first**; there is no mechanism that enforces it, and `main` has no branch protection, no required checks and the `production` GitHub environment has no reviewers.

## What is fine

- Migration history is append-only relative to `main`. One in-place edit of two already-DEV-applied migrations (`96ee4af`, 2026-10-24) was found and **reconciled** (DEV carries the edited function bodies; PROD never applied the files) — accepted deviation, details in `MIGRATION_AUDIT.md` §Append-only check.
- DEV history (41) == `development` files (41). PROD's only discrepancy is the single skipped version above; no unexpected PROD-only migrations.
- The PROD data satisfies the V2 integrity pre-flight (0 cross-session entries, 0 cross-session/location claims) — the first pending migration will not abort.
- Numeric-label pre-flight: 968 PROD rows would resolve differently, **all on past service days (read-only, inert)**; **0 on the current service day** at audit time.
- Security posture of the new database surface is sound (`SECURITY_AUDIT.md`).
- Vercel/Supabase environment isolation is correct (`PROD_CONFIGURATION_AUDIT.md`).
- Trusted test evidence is green on exact-head CI (`RELEASE_INVENTORY.md` §Tests).
- The old (`main`) application remains functional against the new schema (RPC names/arguments are compatible; only conflict handling and a few semantics change), so **migrations-first** is a safe order.

## Conditions to clear (each is required before this can become CONDITIONAL GO / GO)

| #   | Condition                                                                                                                                                                                                        | Owner action             | Tracking               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------- |
| C1  | Choose and prove a Production migration route: repair the Supabase token/secret (#111) **or** designate a manual, reviewed apply (same method used for DEV, hard-guarded to the PROD ref).                       | Owner                    | #111, #161             |
| C2  | Reconcile the PROD history: apply `20260911130000` first, then the 8 release migrations in version order; confirm `migration list` parity (41 == 41). `--include-all` / dry-run first if the CLI is used.        | Owner (approved process) | #161                   |
| C3  | Apply migrations **before** merging to `main` (migrations-first), so the parallel Vercel deploy lands on the new schema. Do not rely on `deploy-migrations`.                                                     | Owner                    | #113                   |
| C4  | Confirm a restorable backup / PITR for PROD immediately before migrating (not verifiable from here; #124 is open).                                                                                               | Owner                    | #124                   |
| C5  | Re-run the numeric-label probe and live-board check immediately before the migration and release outside service hours (no active session for the local `America/Chicago` day).                                  | Release operator         | `RELEASE_PLAN.md`      |
| C6  | Open `development → main` PR with exact-head CI green (`application`, `browser-smoke`, `Database / migrations-and-policies`, Vercel).                                                                            | Release operator         | `RELEASE_PLAN.md`      |
| C7  | Owner accepts the documented known issues: #106 unchanged (global `has_org_role` creator bypass, pre-existing in PROD), #154/#155 not included, Tip Split moves from the primary nav tier to the secondary tier. | Owner                    | `RELEASE_INVENTORY.md` |
| C8  | Run the post-deploy smoke (`RELEASE_PLAN.md`), including Attendance on Production, and keep the corrective plan ready.                                                                                           | Release operator         | `RELEASE_PLAN.md`      |

Recommended hardening (not a gate): enable branch protection on `main` (required checks, no direct push) and add required reviewers to the `production` environment.

## Open P0 / P1 classification

No open P0. Open P1: #106 (follow-up, not a release blocker — pre-existing in PROD, board path already membership-only), #111 (**blocker**), #112 (release follow-up; mitigated by the manual, ref-guarded process), #113 (**blocker** until C3 is the agreed procedure). New: #161 (**blocker**). Details in `CI_CD_AUDIT.md` §Issues.

## Safety statement

- development merged: YES (audit docs go through a docs PR into `development`)
- main merged: **NO**
- DEV touched: read-only queries only
- PROD touched: **READ-ONLY** (SELECT-only catalog / migration-history / row-count statements through the Management API query endpoint, plus one GET of the security advisors; nothing was written. The request carried a `read_only` flag, but its enforcement was not independently verified — read-only-ness rests on the statements being plain SELECTs, all of which are listed in `PROD_CONFIGURATION_AUDIT.md` §Queries)
- PROD migrations: **NO**
