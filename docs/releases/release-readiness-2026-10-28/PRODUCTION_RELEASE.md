# Production release record — 2026-10-28

Owner-approved controlled release (owner approved conditions C1–C6 of `GO_NO_GO.md` and authorized the release). Executed from Local Windows (Claude Code, Sonnet 5.5, high). Method: **migrations first** via the Management API route proven on 2026-10-26, then merge by merge commit.

## Result

```text
Status:                    PRODUCTION MIGRATED AND DEPLOYED; authenticated owner smoke PENDING (owner)
Release PR:                #216  development -> main  (MERGE COMMIT)
Tested/merged head:        94e5e3e6e75309dce540a9142986c0678178c4c4  (= PR head = CI-tested SHA)
Previous main:             d08eb4e0b7331859b0f80d4ad89c2a15c9db71be
New main:                  9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05  (parents d08eb4e + 94e5e3e; tree == development tree)
PROD migrations:           41 -> 54, head 20261028100100, version list identical to development
Vercel Production:         deployment of 9e0be4b: success (commit status "Vercel: success")
Post-merge CI on main:     application success, browser-smoke success
deploy-migrations:         FAILED at `supabase link` (known #111); db push never ran; no effect (PROD already at 54)
```

## Owner conditions (as approved)

| #   | Condition                                | Record                                                                                                                                                                                                                                    |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | BI-11 owner decisions                    | Owner approved shipping **without** the export audit log (AC-EXP-4, build later) and with the **current** light-theme contrast tokens. Both stay backlog follow-ups                                                                       |
| C2  | Backup / PITR point                      | Owner-approved. No new logical backup was taken: the 13 migrations are additive and change no existing PROD row except adding a nullable column. The dashboard restore point remains the owner's safety net                               |
| C3  | Vercel Production state                  | Before the merge: GitHub's Production deployment record for `d08eb4e` was `success`, alias `the-lineup-dusky.vercel.app` served the old app PROD-pinned. After the merge: see Result. (The Vercel connector still needs interactive auth) |
| C4  | Same-day PROD preflight and quiet window | 07:24 America/Chicago: PROD 41 / head `20261026120000`, none of the new objects existed, **0 service sessions today**, last session 2026-10-27. The quiet-window guard was re-checked inside every migration transaction                  |
| C5  | Migrations first, exact-head checks      | Done in that order (below)                                                                                                                                                                                                                |
| C6  | Known open items accepted                | #111 / #113 unchanged (the post-merge `deploy-migrations` failure is the expected no-op), #106, #164                                                                                                                                      |

## Sequence as executed

1. Refs verified: `origin/development` `94e5e3e`, `origin/main` `d08eb4e`; zero non-doc diff from the audited `efd7d4c`.
2. New ref-pinned script (kept outside the repository with the other release tooling, never printing the token): the pending set is **derived from git** (development minus main) and must equal the audited 13 versions, all additions, migration text read from the git objects; refuses if either ref moved.
3. **Dry run on PROD:** all 13 in one transaction ending in an intentional `RAISE` carrying a verification JSON; PROD was proven unchanged afterwards (41, head `20261026120000`).
4. **Release PR #216 opened** and checks awaited on the exact head: `application`, `browser-smoke`, `Database / migrations-and-policies` (all 54 migrations replayed + pgTAP), Vercel and Preview Comments green; `deploy-migrations` skipped on the PR.
5. **Applied to PROD**, one `begin; guard; migration; schema_migrations row; commit;` per migration, stopping on the first error: 13 × HTTP 201. `20261028100000` (enum) and `20261028100100` ran in separate transactions.
6. **Verified on PROD:** 54 migrations, head `20261028100100`, list identical to development; 10 `inventory_*` tables, all with RLS, no INSERT / UPDATE / DELETE / TRUNCATE grant to `anon` or `authenticated`, none to `anon`; 0 tables without RLS; `public.task_opening_reminders_sweep` exists, executable by `authenticated` only (not `anon`); `private.tasks_opening_reminders_run` not executable by `authenticated`; exactly one `tasks_notify` and one `board_assign` overload; enum value present; 0 security-definer functions without `search_path`; 0 `public` functions executable by `anon`; 2 inventory tables in the Realtime publication; 0 `opening_reminder` rows.
7. Old app on new schema (unauthenticated): the Production alias still served the login page, PROD ref only.
8. **Merged #216 with a merge commit** (`9e0be4b`); Vercel Production deployed it; `deploy-migrations` failed at `supabase link` as predicted.
9. **Post-deploy checks (read-only):** the Production alias serves the new build (Bar Inventory and Opening-reminder client code present, login page renders, PROD ref present, **no DEV ref**); PROD read-only state after deploy: 54 / head `20261028100100`, 0 reminder rows, 0 tables without RLS.

## NOT performed (needs the owner's PIN)

An authenticated smoke was not run: the owner's PIN is theirs to enter and none was used or looked up. Still to do by the owner on the Production URL, using the checklist in `RELEASE_PLAN.md` (read-only where possible; never Mark Sent, never unconfirm payroll): sign-in lands on **Tasks → Today**; management All Staff / My Tasks / person; Opening reminder appears once and Dismiss / View Opening Tasks change no task; Table Allocation (+ the deferred #164 checks on a quiet day); Bar Inventory landing, Inventory and catalog (Staff cannot open it); Order Drafts tab loads; Attendance, Payroll ledger, Schedule, Team load; browser calls only `ftadewtkjlaotfdvtjcv.supabase.co`; no console error. Note the first Tasks load after opening time runs the reminder sweep and stores reminder rows for eligible people (intended).

## Recovery state

Nothing needed. If a regression is found: app-only → Vercel promote of the previous Production deployment (`main@d08eb4e`, compatible with the new schema); database → forward corrective migration (`RELEASE_PLAN.md`). Never drop the new tables / column / enum value.

## Follow-ups

Close #169 and #168 after the owner's authenticated smoke passes; #164 with the same session. #111 / #113 / #106 remain open. Backlog: export audit log (AC-EXP-4), light-theme contrast tokens. Recipes V1 R-0 is next after owner sign-off; Part 2 on hold.
