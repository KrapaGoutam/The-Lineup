# Release inventory — what enters Production

Compared: `origin/main...origin/development` (`3403058...4ec6fe3`). 68 commits, 13 first-parent merges (PRs #131, #132, #145–#150, #152, #156, #135, #158, #159), 167 files (+33,276 / −561): 130 added, 37 modified, 0 deleted.

## By domain

| Domain                                                   | Changed                                                                                                                                             | Notes                                                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database / migrations                                    | 8 new files (5,156 lines), `database.generated.ts`                                                                                                  | See `MIGRATION_AUDIT.md`. No existing migration modified.                                                                                                                                         |
| Table Allocation                                         | `src/features/allocation/**` (domain, data, actions, components, hooks, testing), pgTAP                                                             | Rotation V2, cross-view integrity, conflict dialog, Transfer / End + Assign, ended history, off-map, `1 → T1`, combined assignments, Realtime.                                                    |
| Tasks                                                    | `src/features/tasks/**` (new), 4 migrations                                                                                                         | First Production rollout of Tasks: tables are new and empty on PROD.                                                                                                                              |
| App shell                                                | `src/components/restaurant-operations-app.tsx` (+241/−30)                                                                                           | Primary nav now Allocation + Tasks; **Tip Split, Schedule, Team, Attendance, Payroll, Settings move one tier down**; mobile dock = Allocation, Tasks, More. Behaviour of those modules unchanged. |
| Attendance / Payroll / Tips / Schedule / Team / Settings | **No source changes** (one Playwright spec, `tests/e2e/attendance-reporting.spec.ts`, and a test file only)                                         | Regression-safe by construction; Payroll gains `unconfirm_payroll_payment` only through the **already-on-`main`** migration `20260911130000` that PROD lacks (#161).                              |
| Authentication                                           | none                                                                                                                                                | No change to login, PIN, session, middleware.                                                                                                                                                     |
| CI/CD                                                    | `.github/workflows/ci.yml`, `database.yml`, `scripts/ci/supabase-run.mjs`, `scripts/check-nonprod-env.mjs`, `scripts/check-tracked-local-paths.mjs` | Registry-mirror wrapper; PROD-ref guard; `deploy-migrations` unchanged (still push-to-`main`, still `supabase db push`).                                                                          |
| Vercel                                                   | none in repo (no `vercel.json`)                                                                                                                     | Env mapping is project-side; verified in `PROD_CONFIGURATION_AUDIT.md`.                                                                                                                           |
| Tests                                                    | Vitest, pgTAP, Playwright (demo + real-mode), hosted DEV suites                                                                                     | See below.                                                                                                                                                                                        |
| Documentation                                            | docs/, tasks/                                                                                                                                       | —                                                                                                                                                                                                 |

## Feature summary

### Table Allocation (V2 Part 1 + Part 2)

- Authoritative server-side board mutations: all writes through `board_*` RPCs; direct-write RLS policies on rotation tables are **dropped** (SELECT only remains).
- Structural session integrity (entry ↔ round ↔ member ↔ session; claim ↔ session ↔ location).
- One canonical board state across Grid, Floor, Servers, Picker and Dashboard; Realtime convergence; production-build Realtime fix (#134/#147).
- Occupied-table conflict dialog with server-authoritative PT409; **Transfer**; **End + Assign** (whole assignment); ended-session history; off-map table handling.
- Canonical numeric input: typing `1` where `T1` is registered is `T1`; `01` never collapses; combined labels resolved per component; one private resolver shared by `board_assign`, `board_end_and_assign`, `displace_conflicting_entries` and the occupancy trigger.
- Cross-view integrity matrix (52 domain tests) and hosted multi-user suites.

### Tasks V1

Today, My Tasks, Assigned, Opening, Closing, recurrence series, checklists/templates, audit events (append-only), notifications (due-soon/overdue sweep, mark-read). **#154 (limit notifications to Opening/Closing) is NOT included** — current notifications cover all tasks; accepted follow-up (not a correctness/safety problem).

### Not included

#154 notification narrowing, #155 Tips V2 / Finalize Day, #106 `has_org_role` hardening, #120/#121 and other backlog.

## Tests (trusted evidence — quoted from the repo handoff/STATUS and exact-head CI, not re-run)

| Suite                              | Result                                                                                             | Source                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| pgTAP                              | 31 files / 646 assertions                                                                          | `docs/STATUS.md`, PR #158 `Database` check ✅ |
| Vitest                             | 74 files / 715 tests                                                                               | `docs/STATUS.md`                              |
| Demo Playwright                    | 507 passed                                                                                         | `docs/STATUS.md`                              |
| Hosted DEV DB (real JWTs, RPC/RLS) | 78 passed                                                                                          | `tasks/current-task.md` (pre-audit handoff)   |
| Hosted DEV UI (3 browser contexts) | 30 passed                                                                                          | same                                          |
| Build / lint / typecheck / format  | pass                                                                                               | same                                          |
| Exact-head CI PR #158 (`f8fa191`)  | application ✅, browser-smoke ✅, migrations-and-policies ✅, Vercel ✅, deploy-migrations skipped | `gh pr view 158`                              |
| Exact-head CI PR #159 (docs)       | application ✅, browser-smoke ✅, Vercel ✅                                                        | `gh pr view 159`                              |

CI does not run on pushes to `development` (only on PRs and pushes to `main`), so the cumulative `development` head has no CI run of its own; the release PR will provide it (condition C6). The most recent code-bearing PR (#158) ran green on its head, and #159 is docs-only.

### XM-024

Failed once in the first of three full hosted UI runs; passed in the next two full runs, an isolated rerun and exact-head CI. Classification: **transient / non-reproduced**. No new evidence in this audit (the hosted suites were not re-run; no recurrence recorded anywhere since).

## Known accepted limitations

- **Attendance on the protected DEV Preview shows "Attendance data unavailable"**: expected. `NEON_DATABASE_URL` exists only in the **Production** Vercel scope (Preview/Development intentionally omit it). The release does not touch Attendance code. Production configuration is present; live behaviour is covered by the post-deploy smoke, not exercised here.
- #134-class Realtime behaviour under production builds was fixed and verified (18/18) before merge; still included in the smoke plan.
