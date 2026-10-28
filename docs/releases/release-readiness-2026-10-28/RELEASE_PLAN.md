# Release plan, recovery strategy and smoke test (2026-10-28)

**Nothing here has been executed.** It is the proposed procedure for a separately approved release session. It applies only after the owner approves this audit and conditions C1–C6 in `GO_NO_GO.md` are cleared. Re-use the proven route and tooling from the 2026-10-26 release (kept **outside** the repository, in the owner's `_release-backups` folder; never copy backups or scripts into the public repo).

## Ordering (why migrations first)

- New app on old schema: **fails** (no Bar Inventory tables, no reminder RPC).
- Old app (`main@d08eb4e`) on new schema: **works** (additive; see `MIGRATION_AUDIT.md`).
- Vercel Production deploys on any push to `main`, `deploy-migrations` cannot succeed (#111), and `main` is unprotected (#113). Therefore: **apply and verify the 13 migrations on PROD first, then merge.**

## Sequence

1. **Freeze.** Record `origin/development`, `origin/main`, PROD head. No other merge to `development` or `main`. Confirm the release candidate SHA the owner approved (the docs-merged SHA recorded in `tasks/current-task.md`).
2. **Owner clears C1 and C6** (decisions on AC-EXP-4 and contrast; acceptance of known open items) and **C2** (backup / PITR point noted with timestamp).
3. **Operator checks C3**: Vercel Production = `main@d08eb4e` READY; Production env points at PROD only (variable names, never values).
4. **Choose a quiet window** (no live service for the `America/Chicago` day; no staff session). Tell staff the app may be briefly unavailable. Paused-first-attempt lesson from 2026-10-26: check for an active session immediately before applying.
5. **Open the release PR** `development → main` (**merge-commit** policy). Wait for exact-head `application`, `browser-smoke`, `Database / migrations-and-policies` (replays all 54 migrations + pgTAP), Vercel Preview, all green on the PR head SHA. **Do not merge yet.** Do not touch the Dependabot PRs.
6. **PROD preflight (read-only), same day (C4):** target proven PROD (ref guard); `schema_migrations` = 41, head `20261026120000`, none of the 13 present; no active service.
7. **Dry run:** the 13 migrations in order, each in its own transaction (so `20261028100000` commits before `20261028100100`), ended by a `RAISE` that returns a verification JSON so nothing persists. Exactly these versions, in this order:
   `20261026150000, 20261026170000, 20261026180000, 20261026190000, 20261026190100, 20261026190200, 20261027120000, 20261027130000, 20261027195142, 20261027210000, 20261028090000, 20261028100000, 20261028100100`.
8. **Apply** via the proven Management API route (`POST /v1/projects/<PROD ref>/database/query`; one `begin; … commit;` per migration; guard DO block for PROD fingerprint, not-already-applied, predecessor applied; insert the `schema_migrations(version, name, statements)` row; **not** the `/database/migrations` endpoint). Stop at the first error; record each version. Bash: `MSYS_NO_PATHCONV=1`; Node: set `process.exitCode`, verify state before retrying any write after a transport error.
9. **Verify schema:** PROD migrations = **54**, list identical to `development`; `inventory_*` 10 tables all with RLS and no client write grants; `public.task_opening_reminders_sweep` exists, `anon` cannot execute, `private.tasks_opening_reminders_run` not executable by `authenticated`; `private.tasks_notify` has exactly one overload; security advisors show only the expected `authenticated_security_definer_function_executable` class; Realtime publication contains the two inventory tables.
10. **Smoke the _old_ app on the _new_ schema** (Production `d08eb4e` is still live): sign in, open Tasks, open the board, one read. This proves the migrate-then-deploy window is safe.
11. **Merge** the release PR with a **merge commit**. Vercel Production deploys; `deploy-migrations` is expected to fail at `supabase link` and apply nothing (record the red run; do not "fix" it in this session).
12. **Wait for Production READY** and the alias on the new `main` SHA; check the build log shows no DEV/PROD mix-up and no env error.
13. **Post-deploy smoke** (below), then **error scan** (Vercel runtime logs + Supabase logs: no new error class).
14. **Close out:** record SHAs, deployment id, PROD migration head (`20261028100100`, 54), smoke results; close #169 and #168 (and #164 if its checks pass); keep #111 / #113 / #106 open; write `PRODUCTION_RELEASE.md` in this folder (docs-only PR).

## Recovery / corrective strategy

Principle: **forward corrective migrations, never destructive rollback.** A Vercel rollback changes only the application artifact.

| Moment                                                  | State                                      | Action                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before step 8                                           | Nothing changed                            | Stop; no recovery needed                                                                                                                                                                                                                                                                |
| Migration _k_ of 13 fails                               | 1…k−1 applied (each atomic), k not applied | Stop. The old app keeps working on any prefix (all additive). Fix forward on a new branch; never edit an applied file. If `20261028100100` fails, the old overload of `tasks_notify` is intact (same transaction) and the enum value is harmless                                        |
| All 13 applied, app not deployed                        | New schema, old app                        | Safe to stay indefinitely (step 10 proves it)                                                                                                                                                                                                                                           |
| App deployed, migrations applied, functional regression | New schema, new app                        | Prefer a **forward fix**. App-only regression: Vercel **promote the previous Production deployment** (`main@d08eb4e`) — compatible with the new schema (the only visible differences are the generic error shown for a same-server repeat and the absence of Bar Inventory / reminders) |
| App deployed, migrations **not** applied (skew, #113)   | New app, old schema                        | Apply steps 6–9 immediately; if impossible, promote the previous Vercel deployment                                                                                                                                                                                                      |
| Smoke fails after both                                  | New schema, new app                        | Classify (data vs app). App: promote previous deployment, then forward-fix. Function body / policy: forward migration restoring the earlier definition from git (`board_assign` → `20261026120000`; `tasks_notify` → `20261025…`)                                                       |

**Can be undone:** the application (promote); any function body or policy (forward migration). **Cannot be safely rolled back:** the new tables, the `payload` column, the enum value — leave in place (harmless to the old app); dropping them risks data loss and is never part of recovery. **Data safety net:** the backup / PITR point from C2 (restoring loses everything written after it — last resort only).

## Production smoke (focused, non-destructive)

Use the owner/manager account (the owner types their own PIN). Create no real guest data; prefer a closed day. Allowed throwaway: none required.

1. **Sign-in** → lands on **Tasks → Today**; correct restaurant; no demo banner; no environment/config error.
2. **Tasks Today (management):** Show tasks for → All Staff / My Tasks / a person; each row names its owner or "Whole team" / "Anyone".
3. **Notifications:** inbox contains no ordinary-task assigned / completed / due noise from now on; `Opening` / `Closing` items only. If the Opening checklist is incomplete past opening time, the **Opening reminder** surface appears once (newest stage only) and Dismiss / View Opening Tasks change no task.
4. **Table Allocation:** Grid / Floor load today's board; one **read-only** look at Servers and Dashboard. Deferred #164 checks (`1` → `T1`, occupied conflict + Cancel, two-device Realtime) only if a quiet closed day allows without writing real rotation data.
5. **Bar Inventory** (management): landing / Dashboard, Inventory list and catalog load; filters work; Staff account cannot open the module (falls back to Tasks).
6. **Vendor Order Drafts:** Order Drafts tab loads; opening an existing/empty state works. Create a draft only if the owner explicitly accepts one throwaway DRAFT (it can be left or archived); never Mark Sent.
7. **Attendance** loads (proves `NEON_DATABASE_URL`), **Payroll** ledger loads (do **not** unconfirm anything), **Schedule** current week, **Team** list.
8. **Environment:** browser network calls only `ftadewtkjlaotfdvtjcv.supabase.co`; no `opmujepkemwcdxxorhfd` anywhere; no console errors; Vercel runtime and Supabase logs show no new error class.

Stop and apply the recovery table on any failure in 1, 2, 4 (writes) or 8.

## Not part of this release

Recipes (not started), Part 2 / multi-org / attendance kiosk (not started), the Dependabot PRs, stale PRs #16–#32 / #49 / #51, repairing #111 / #113 / #106.
