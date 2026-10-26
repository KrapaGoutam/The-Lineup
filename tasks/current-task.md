# Release Readiness Audit — Handoff

Branch: `docs/release-readiness-audit` (docs only, from `origin/development`)
HEAD: see PR (docs commit on top of `4ec6fe3`)
main: `3403058`
development: `4ec6fe3` (PR #159 merge — the previously "pending" detail is resolved: #158 and #159 are both merged)
merge-base: `3403058` (development is 68 commits ahead, 0 behind)

Release issue: #160 (open) — https://github.com/KrapaGoutam/The-Lineup/issues/160
Blocker issue: #161 (new) — PROD missing migration `20260911130000`
Project #4: #160 In Progress, #161 Blocked
Milestone: "Platform / CI Reliability"

Development-only commits: 68 (13 first-parent merges: #131 #132 #145–#150 #152 #156 #135 #158 #159)
Pending migrations (9 for PROD): `20260911130000` (skipped on PROD, on `main`) + `20261023100000`, `20261023110000`, `20261025090000`, `20261025100000`, `20261025110000`, `20261025120000`, `20261026090000`, `20261026120000`
DEV migration head: `20261026120000` (41 == 41 files)
PROD migration head: `20260923100000` (32 rows vs 33 files on main)

Numeric-label PROD probe (read-only, equivalent form because PROD has no `service_session_id` yet): 968 rows / 32 PAST service dates would resolve to `T<n>`; 0 on today's service day (no session today). Inert (past days are read-only; history not rewritten). Re-run immediately before release.
Open P0/P1 blockers: no P0. Blockers: #111 (deploy-migrations auth), #113 (release skew), #161 (new). Follow-ups: #112, #106.

Vercel:
Production branch: `main` (deployed `3403058`, aliases the-lineup-dusky.vercel.app …)
Preview target: DEV Supabase (`opmujepkemwcdxxorhfd`); `development` Preview READY on `4ec6fe3`
Production Supabase target: PROD (`ftadewtkjlaotfdvtjcv`)
DEV Supabase target: Preview + Development scopes only
Attendance: `NEON_DATABASE_URL` is Production-only (Preview "unavailable" is expected); not exercised

Security: no blocker (all 80 definer fns `search_path=''`, none anon-executable, private helpers revoked, rotation tables SELECT-only after release, RLS on all tables, 0 `user_metadata` policies). Advisors: 34 expected WARNs on DEV (the new RPCs).
CI/CD: `deploy-migrations` = push to `main` touching `supabase/migrations/**`; it FAILED on the last 4 main pushes; no branch protection on main/development; no CI on `development` pushes.
Migration safety: all forward-only/additive; V2 pre-flight on PROD data = zeros (will not abort). One in-place edit of two DEV-applied migrations (`96ee4af`) found and reconciled (DEV carries the edited bodies; PROD never applied them).
Data compatibility: no backfill of labels; only `service_session_id` / `location_id` backfills (structural); 1,029 active entries all on past days; 0 combined labels; one free-text `O`.
Rollback/corrective plan: forward corrective migrations; Vercel promote for app-only; migrations-FIRST ordering (old app works on new schema) — see `docs/releases/release-readiness-2026-10/RELEASE_PLAN.md`.

Release decision: **NO-GO** (Recommendation: RELEASE BLOCKED)

Conditions to clear (C1–C8, see `GO_NO_GO.md`): C1 PROD migration route proven/approved (#111); C2 apply `20260911130000` then the 8 in order (#161); C3 migrations BEFORE merge to main (#113); C4 confirm PROD backup/PITR; C5 re-run numeric probe and release outside service hours; C6 release PR exact-head CI green; C7 owner accepts #106/#154/#155/Tip Split nav move; C8 post-deploy smoke incl. Attendance.

development merged: YES (docs PR into `development`)
main merged: NO
DEV touched: read-only SELECTs
PROD touched: READ-ONLY ONLY (SELECTs + advisors GET)
PROD migrations: NO

Audit documents: `docs/releases/release-readiness-2026-10/` — RELEASE_INVENTORY, MIGRATION_AUDIT, SECURITY_AUDIT, CI_CD_AUDIT, PROD_CONFIGURATION_AUDIT, RELEASE_PLAN, GO_NO_GO.

Exact next action: owner reviews `GO_NO_GO.md` and decides how to clear C1–C4 (token repair vs approved manual apply) in a SEPARATE task; then re-run the release-readiness check on the same-day PROD state. Optionally open a separate fix branch for the release-pipeline gap (#113) and branch protection.

DO NOT: merge development -> main, deploy Production, apply PROD migrations (including `20260911130000`), change Vercel/Supabase secrets, begin #154, begin #155, `git add -A`, stage `docs/testing/` or `*.code-workspace`
