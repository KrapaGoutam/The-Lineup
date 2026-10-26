# Release plan, recovery strategy and smoke test

**Nothing here has been executed.** This is the proposed procedure for an eventual, separately-approved release. It is valid only once the conditions in `GO_NO_GO.md` are cleared.

## Why migrations must come first

- Old app (`main`) on the new schema: **works.** It uses only `board_*` RPCs for writes (all names kept; `board_assign`'s new argument has a default) and plain SELECTs for reads; `service_session_id` etc. are additive; the dropped write policies are not used by it. What changes for the old app: occupied-table conflicts now return the server's PT409 instead of the old confirm-transfer flow (it shows a raw error), and `1` resolves to `T1`.
- New app on the old schema: **fails.** No Tasks tables, no `p_end_whole_assignment`, no `service_session_id` on entries, no canonical resolver.
- Therefore: **migrate PROD, then deploy the app.** The two must not be allowed to race, and the repository's own pipeline does exactly that (merge → parallel Vercel deploy + `deploy-migrations`). So migrations are applied **before** the merge (migrations-first); the post-merge `deploy-migrations` run then has nothing to apply.

## Proposed sequence (do not execute)

1. **Freeze.** Record `origin/development` SHA, `origin/main` SHA, migration heads. No other merges to `development`.
2. **Owner approval** of this plan and of conditions C1–C8.
3. **Clear C1/C2:** agree the PROD migration route; repair `SUPABASE_ACCESS_TOKEN` if the CLI route is used.
4. **Pick the window (C5):** a time with no service for the local `America/Chicago` day (e.g. a closed day or well before first seating). Notify staff the app may be briefly unavailable.
5. **Open the release PR** `development → main` (merge-commit policy). Wait for exact-head `application`, `browser-smoke`, `Database / migrations-and-policies`, Vercel Preview — all green (C6). Do **not** merge.
6. **Pre-flight on PROD (read-only), same day:**
   - `supabase_migrations.schema_migrations` head still `20260923100000` and `20260911130000` absent (or applied);
   - numeric-label query (`PROD_CONFIGURATION_AUDIT.md`) returns **0 rows for today**, and the V2 integrity pre-flight (§ `MIGRATION_AUDIT.md`) returns zeros;
   - confirm a restorable backup / PITR point exists (C4) and note its time.
7. **Dry run** the apply from an authorised, ref-guarded context (`supabase db push --dry-run --include-all` when using the CLI) and confirm it lists exactly the 9 migrations in this order: `20260911130000, 20261023100000, 20261023110000, 20261025090000, 20261025100000, 20261025110000, 20261025120000, 20261026090000, 20261026120000`.
8. **Apply the 9 migrations to PROD** in that order, one at a time, stopping at the first error (each file is a self-contained, forward-only transaction; the first has a built-in pre-flight that aborts without changes). Record each version in `schema_migrations`.
9. **Verify the schema:** `migration list` parity (PROD 41 == `development` 41); 49 public tables; `unconfirm_payroll_payment` exists; rotation tables have SELECT-only policies; spot-run `SELECT private.resolve_table_input(...)` is **not** callable by clients (permission denied); security advisors show only the 34 expected `authenticated_security_definer_function_executable` warnings.
10. **Smoke the _old_ app on the _new_ schema** (the Production deployment `3403058` is still live): login, open the board, one assignment. This proves the "migrate, then deploy" window is safe.
11. **Merge** the release PR into `main` with a **merge commit**. Vercel deploys Production; `deploy-migrations` starts and should find nothing to apply (or fail on auth if #111 is unresolved — a red run with no effect; record it).
12. **Wait for the Production deployment to be READY** and the production alias to point at the new `main` SHA; check the build logs contain no PROD/DEV ref mix-up (Production → PROD only).
13. **Post-deploy smoke** (below) on the Production URL.
14. **Verify Realtime / DB / auth** (two devices see each other's change within seconds; no error spike in Vercel runtime logs or Supabase logs).
15. **Close the release:** record SHAs, migration head, deployment id, smoke results in #160; close #160/#161; keep #111/#113/#106 open as follow-ups.

## Recovery / corrective strategy

Principle: **forward corrective migrations, not destructive rollback.** Vercel rollback changes only the application artifact.

| Moment                                                              | State                                                 | Action                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before any migration (steps 1–7)                                    | Nothing changed                                       | Stop; no recovery needed.                                                                                                                                                                                                                                                                                                          |
| Migration k of 9 fails                                              | Migrations 1…k−1 applied (each atomic), k not applied | Stop. Fix forward in a new branch; do **not** edit applied files. If k=`20261023100000`, its pre-flight aborted without changes (the data is unchanged). The old app keeps working on any prefix of the migrations (additive + compatible RPCs) until `20261023110000` drops the write policies — which the old app does not need. |
| All migrations applied, app not yet deployed                        | New schema, old app                                   | Safe to remain indefinitely (old app compatible; step 10). Tasks tables simply unused.                                                                                                                                                                                                                                             |
| App deployed, migrations applied, functional regression             | New schema, new app                                   | Prefer a **forward fix** (new migration / app patch). If the regression is app-only: promote the previous Production deployment (`3403058` build) from Vercel — works against the new schema (see above) except conflict messaging and `1→T1`.                                                                                     |
| App deployed but migrations _not_ applied (skew; the #113 scenario) | New app, old schema                                   | Immediately apply the migrations (steps 7–9); if impossible, promote the previous Vercel deployment.                                                                                                                                                                                                                               |
| Wrong data interpretation after release (numeric labels)            | Active `15` etc. colliding with `T15`                 | Operational: end/re-enter the affected assignment in the app; no data repair needed. History is untouched.                                                                                                                                                                                                                         |

What **can** be undone: the application (Vercel promote); any function body or policy, by a forward migration that restores the earlier definition from git (`20261026120000` → `20261026090000` → `20261023110000` text; the 8 dropped policy definitions are in the pre-release rotation migrations on `main`).

What **cannot** be safely rolled back: the added NOT NULL columns/constraints on the rotation tables, the composite FKs, and the Tasks tables — leave them in place (additive, harmless to the old app); dropping them would risk data loss and is never part of recovery. `20261026090000` re-created `board_assign` with an extra defaulted argument; restoring the old 7-argument signature would require dropping the new one first and is only needed if the old app ever stops working, which testing shows it does not.

Data safety net: PITR/backup (C4). Restoring a backup is the only way to undo data changes and would lose any boards written after the restore point — a last resort.

## Post-deploy smoke (Production, minimal, non-destructive)

Use the owner/manager account; create no real guest data. Prefer a location/day with no live service.

1. **Login** with PIN → lands on the dashboard; correct restaurant (`the-monks`); no demo banner.
2. **Table Allocation (Grid)**: open today's board; assign a table to a server; confirm toast/state.
3. **Type `1`** in the Grid cell for a server with no other claim on `T1` → stored/shown as **`T1`** (not "1"). End it afterwards.
4. **Floor** shows `T1` occupied by that server; **Servers** view agrees; **Dashboard** recent activity lists it.
5. **Occupied conflict**: from a second server, enter `T1` → conflict dialog appears → press **Cancel** → nothing changed.
6. **Servers history**: ended assignment appears under ended history.
7. **Tasks**: open Tasks → Today / My Tasks load; create then complete a throwaway task; confirm Assigned view and no console errors.
8. **Schedule** loads current week; **Team** lists members.
9. **Attendance** loads data (proves `NEON_DATABASE_URL` works in Production — not "Attendance data unavailable").
10. **Payroll sanity**: open Payroll, ledger loads; (after migration #0) _Unconfirm payment_ is available on a confirmed payment — do **not** actually unconfirm real payroll; just confirm the action is offered/works on a test period if one exists.
11. **Tip Split** opens from its new (secondary) nav position.
12. **Realtime, two devices**: a change on device A appears on device B within a few seconds without reload.
13. **Environment**: browser network tab calls only `ftadewtkjlaotfdvtjcv.supabase.co`; no `opmujepkemwcdxxorhfd` anywhere; Vercel runtime logs and Supabase logs show no new error class.

Stop and apply the recovery table on any failure in 2–5, 9, 12 or 13.
