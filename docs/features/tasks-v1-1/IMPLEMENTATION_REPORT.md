# Tasks V1.1 — Implementation Report

Newest phase last. Plan: `PLAN.md`; matrix: `TEST_MATRIX.md`.

## T-1 — Default Tasks landing and `?tab=` module addressing (PLAN D-1)

**Branch:** `feature/tasks-v1-1-default-landing` (from `development` @ `126c72d`, reconciled with `development` @ `66d8fc6`). No migration, no `supabase/**` change.

### What changed

- `src/lib/app-tab.ts` (new, pure): `AppTab`, `DEFAULT_APP_TAB = "tasks"`, `tabFromParam` / `tabToParam` (Bar Inventory is `bar-inventory`), `resolveTab` (role fallback), `tabHref` (keeps path and unrelated query parameters; the default landing carries no `tab`, so `/` stays `/`).
- `restaurant-operations-app.tsx`: the module state starts from `?tab=` (else Tasks). A tab click still updates state immediately and pushes the URL; a URL change (back/forward) re-selects the module through a render-time comparison, not an effect. `resolveTab` is applied once after the signed-in guard, so staff on `?tab=bar-inventory` or `?tab=team` see Tasks (UX fallback only; the server still enforces access). Sign-out now resets to Tasks and clears the query (it used to leave `schedule` selected, which a demo-mode re-sign-in would have inherited).
- Unchanged on purpose: the brand "Home" button and Settings "Back" still go to Table Allocation. The brief asked for a default landing, not a redefinition of Home.

### Repo truth recorded

The app has no module routes. "Deep links respected" is delivered by `?tab=`; refresh keeps the module because the URL carries it. Demo mode keeps its session in memory, so a reload there returns to the passcode screen and the requested module is applied on the next sign-in (asserted in TS-002).

### Existing specs updated (they assumed Table Allocation after sign-in)

`dashboard.spec.ts` (manager modules, assistant-manager promotion, keypad sign-in), `team-management.spec.ts`, `payroll-timesheet-overhaul.spec.ts` ("lands on Table Allocation by default" became TS-001: lands on Tasks). Each keeps its original coverage by navigating to the module it needs.

### Reconcile with a much newer `development` (2026-10-27)

The parked commit `03d5d45` (based on `126c72d`, 30 commits behind) was classified **still required** and **safe to preserve**: no file it touches had changed on `development`, nothing else implements `?tab=`, and the Vendor Order Drafts specs added since reach Bar Inventory by clicking the nav (they do not depend on the landing module). Reconciled with a normal history-preserving merge of `origin/development` (`66d8fc6`) into the branch: no conflicts, no rebase, no force-push, parked history intact.

### Contract gaps found by audit, and closed

- **URL/UI mismatch.** An unknown `?tab=` (or a module the role cannot open) showed Tasks while the URL kept naming something else. Now, once signed in, the URL is corrected in place with `replaceState` (no extra history entry, no loop; unrelated query parameters survive). Before sign-in the requested module is left alone so it survives the passcode screen and a reload.
- **Back/forward race (real defect, found by a 2-of-6 intermittent failure on host-tablet WebKit).** `useSearchParams` commits lazily after a `pushState`; a fast Back could land before it caught up, so the observed value never changed and the UI stayed on a module the URL no longer named. Back/forward now re-select the module straight from the real location via a `popstate` listener. After the fix the back/forward specs pass 60/60 with `--retries=0 --repeat-each=10` on all three projects.
- **CI-only build failure (found by exact-head CI, PR #203 first head `2f2299b`).** `useSearchParams` without a Suspense boundary fails `next build` when `/` is statically prerendered, which happens whenever Supabase is not configured (demo mode, CI). My local `.env.development.local` made `/` dynamic, so local builds passed. The shell is now wrapped in `<Suspense fallback={null}>` inside `RestaurantOperationsApp`. Reproduced locally with `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build`, and the landing, dashboard and tasks specs re-run against that production build (`next start`, `PLAYWRIGHT_BASE_URL`): 150/150. **Later phases: build with those variables blanked before pushing.**
- **Missing tests:** `?tab=tasks`, invalid tab, `/r/<slug>?tab=` (path preserved across module switches and Back), bare `/r/<slug>`, Bar Inventory reload persistence.

### Tests

| Layer                 | Result                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                | 1568/1568 (115 files; +9 in `app-tab.test.ts`)                                                                                                                                                                          |
| Playwright new        | `default-landing.spec.ts`: TS-001..TS-009, 11 tests x 3 projects = 33/33                                                                                                                                                |
| Playwright regression | dashboard, team-management, payroll-timesheet-overhaul, tasks, settings, tips-clocked-in-roster, recurring-schedules, bar-inventory, order-drafts, order-drafts-sharing on desktop, host-tablet, server-mobile: 243/243 |
| Static / build        | prettier, eslint, tsc clean; `next build` green (`/` and `/r/[restaurantSlug]` dynamic, so no Suspense requirement for `useSearchParams`)                                                                               |
| Not run locally       | The full 750-test Playwright suite (left to exact-head CI); hosted DEV (no database change)                                                                                                                             |

Demo mode keeps its session in memory, so "refresh" there returns to the passcode screen and the requested module is applied on the next sign-in; real-mode refresh keeps the cookie session and the URL carries the module (covered by the same URL logic, not by a hosted browser run).

### Status

**T-1 COMPLETE.** PR #203, tested head `1e3e4b1` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `cf3ae39` (merge commit, two parents). T-2 (Management Today) followed; see below.

## T-2 — Management Today / staff visibility (PLAN D-2, #169)

**Branch:** `feature/tasks-v1-1-management-today` from `development` @ `c6f309e` (verified equal to the expected T-1 post-merge docs state). Claude Code Cloud. **No migration, no `supabase/**`change, no hosted DEV,`main` and PROD untouched.\*\*

### What changed

- `domain/task-rules.ts` (pure): `TodayScope` (`all | mine | person(id)`), `scopeToValue/scopeFromValue`, `resolveScope`, `filterByScope`, `buildTodayGroups`, `staffLabel`.
- `components/management-today.tsx` (new): labelled native `<select>` ("Show tasks for": All Staff, My Tasks, then an optgroup of active team members by profile id), a polite status line ("Mia Chen: 4 tasks today"), Opening / General / Closing groups, the staff name on every row, explicit empty states. `today-view.tsx` mounts it for managers instead of "Up next for you"; staff keep the unchanged "Up next for you". `tasks-workspace.tsx` holds the scope so it survives hopping between Tasks sections. The existing summary cards are unchanged.
- `task-row.tsx`: the staff text now comes from `staffLabel` (the plan's rule); the Assigned view therefore reads "Whole team" instead of "All team". `data-testid="task-staff"` marks it.

### Rules (as built)

- **Today** is the same meaning as My Tasks: today's work plus anything overdue plus work finished today (faded, so a check-off does not vanish); upcoming and cancelled never appear; Opening / Closing come from today's checklist instances only. Overdue sorts first.
- **My Tasks** reuses `isMine` (assigned to me, or open to the whole team / anyone). It is not "created by me" and matches the existing My Tasks tab and the Today card.
- **Specific person** matches **named assignees only**, by `profileId` (never by display name); shared work is not attributed to a person (D-2). This is deliberately narrower than My Tasks, so a manager who picks themselves as a person sees only their named work.
- **Row identity:** individual / multiple -> names joined; all_team -> "Whole team"; anyone -> "Anyone"; no named assignee -> nothing (not invented).

### Security (server-authoritative; nothing new on the server)

T-2 adds **no server surface**. Visibility is what it was: RLS `tasks_can_view` shapes `tasks` for the caller's own session; `getTasksSnapshot` fetches the roster, events, templates and series for managers only; the viewer's designation is derived server-side from the session (`getCurrentUser`), never from the client. A staff snapshot therefore contains no coworker individual tasks, `team: []`, `events: []`. The selector is a view over that snapshot, and `resolveScope` pins non-managers to `all` even if a stale value existed, so hiding the control is not the protection. Staff still see every Opening/Closing item (RLS: non-`task` kinds are visible to members) exactly as before.

### Existing behaviour preserved

Mutations (complete / reopen / assign / cancel / carry forward / edit, recurrence, audit) are untouched and still run through the same `run`/RPC path on authoritative rows; the filter makes no copies. The actor is the signed-in manager. T-1 navigation (`?tab=`, popstate, Suspense) is untouched.

### Tests

| Layer              | Result                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest             | 1586/1586 (116 files; +9 `task-rules.test.ts`, +9 `management-today.test.tsx`) from 1568                                                                                                                                                                         |
| Playwright new     | `management-today.spec.ts`, 7 tests: desktop 7/7, server-mobile 7/7                                                                                                                                                                                              |
| Playwright regress | `tasks.spec.ts`, `default-landing.spec.ts`, `management-today.spec.ts`, `dashboard.spec.ts`: desktop 57/57, server-mobile 57/57 (desktop = tasks + default-landing + management-today 32 and dashboard 25)                                                       |
| host-tablet        | **The WebKit browser is not installed in this cloud container**, so the `host-tablet` project cannot launch here. The same specs (57) passed on **Chromium emulating the iPad (gen 7) landscape profile** via a temporary, uncommitted config; WebKit left to CI |
| Static / build     | prettier, eslint, tsc clean; `npm run build` green; **`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` green (`/` static)**; a placeholder-env-backed build also green                                                            |
| Not run            | Full Playwright suite (exact-head CI); pgTAP / `supabase test db` and hosted DEV (no database change; no Docker/DB here); an Assistant Manager browser run (no demo passcode)                                                                                    |

### Status

**T-2 COMPLETE.** PR #205, tested head `c2ef864` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `46ea022` (two parents). Caveat: the `host-tablet` WebKit project was not run (not installable in the cloud container; CI browser-smoke is `desktop` only) — covered by Chromium iPad emulation locally; run real WebKit at T-6. T-3 (notification narrowing) **not started**; Part 2 on hold.

## T-3 — Notification narrowing (PLAN D-3, #154)

**Branch:** `feature/tasks-v1-1-notification-scope` from `development` @ `f4f1aae26fdcf95d7d6b960eafb624ca05bcaa27` (verified equal to the expected T-2 post-merge docs state). Claude Code Cloud. **One additive migration, `supabase/migrations/20261028090000_tasks_v1_1_notification_scope.sql`; DEV only, no hosted DEV run, `main` and PROD untouched.**

### Why a migration (the plan's choice, confirmed against the code)

Notifications are written **only** by `private.tasks_notify` (security definer, called from `task_create`, `task_assign`, `task_complete`, `task_notifications_sweep` and `checklist_generate_daily`). The client never creates them, and the inbox reads `task_notifications` through RLS. Suppression therefore has to live in that one function: an application-only or client-side filter would still store, fetch and count the noise. The function keeps its signature, so call sites, grants and the `(recipient, dedupe_key)` idempotency are unchanged. Rollback is re-creating the previous body.

### Notification policy, before and after

| Event (writer)                                                       | Before                     | After                                        |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| Normal task assigned (`task_create`)                                 | stored for each assignee   | **suppressed**                               |
| Normal task reassigned (`task_assign`)                               | stored for each new person | **suppressed**                               |
| Normal task completed for you / to creator (`task_complete`)         | stored                     | **suppressed**                               |
| Normal task due soon / overdue (`task_notifications_sweep`)          | stored                     | **suppressed** (sweep kept, now returns 0)   |
| Opening / Closing `checklist_available` (`checklist_generate_daily`) | stored                     | **kept**                                     |
| Opening / Closing task `assigned` / `reassigned` / `completed`       | stored when emitted        | **kept at the gate** (see the finding below) |

The gate: a notification is stored only if `p_type = 'checklist_available'` or `p_task_id` names a task **in the same organization** whose `kind` is `opening` or `closing`. Classification uses the structured `tasks.kind`, never title text. It fails closed: a call that names no operational source stores nothing. `opening_reminder` is deliberately not in the gate; T-4 adds the enum value and extends the gate.

**Finding recorded for T-4.** Today's lifecycle RPCs only call `tasks_notify` for assignment, reassignment and completion when `kind = 'task'` (`if t.kind = 'task'` guards), so Opening / Closing assigned / reassigned / completed notifications were **never emitted by any caller before T-3**. The plan's "kept (as today)" is therefore honoured at the gate (they pass if ever emitted, proven by direct `tasks_notify` calls in pgTAP 0041 and vitest), and the only operational notification stored in practice is `checklist_available`. T-3 added no new emitter (that would be recipient expansion, outside scope).

### Audit preserved

`task_events` and `private.tasks_emit` are not touched. pgTAP 0041 drives a normal task through create → reassign → complete (as the assignee) → reopen → cancel: **zero** notification rows, and `task_events` holds exactly `created, reassigned, completed, reopened, cancelled` with the real actor on `completed`. Checklist generation audit is unchanged. Existing stored notifications are **not** deleted (0041 seeds a legacy row; it survives and can still be marked read).

### TypeScript demo engine

`isOperationalNotification` (pure, exported) mirrors the SQL gate and is applied at the top of `notify`, so demo mode and the database agree. `sweepNotifications` is unchanged and is now a natural no-op. Shared policy vectors (type x source kind, 13 rows) are in `notifications.test.ts` and pgTAP 0041 asserts the same pairs.

### Privacy and isolation

No recipient logic changed. Recipients are still exactly the named person (or all other active members for a checklist announcement); inactive members get nothing; an Opening task id from another organization does not open the gate; RLS on `task_notifications` is unchanged (staff read only their own, another organization reads none), asserted in 0041. Narrowing only reduces what is stored, so no new information reaches anyone.

### Tests

| Layer          | Result                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest         | 1606/1606 (116 files; +20 from 1586, all in `notifications.test.ts` rewritten for the new policy)                                                                                                                                                                                                                                                                                                                      |
| pgTAP (local)  | New `0041_tasks_v1_1_notification_scope` 19/19; updated 0026 (81) and 0029 (13) pass; 0027 and 0028 pass unchanged. All 41 files pass **except 0039** (needs a `dblink` loopback the local harness does not provide; Vendor Order Drafts, unrelated). Run on a throwaway PostgreSQL 16 with stubbed Supabase `auth`/roles/`pg_cron`, applying all 52 migrations; the CI `Database` job is the Supabase-image authority |
| Playwright     | `tasks`, `management-today`, `default-landing`, `dashboard` specs (57 each): `desktop` 57/57, `server-mobile` 57/57, Chromium emulating iPad (gen 7) landscape 57/57. The rewritten notification test passes on all three                                                                                                                                                                                              |
| Static / build | prettier, eslint, tsc clean; `npm run build` green; `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` green (`/` static). This container has no `.env*.local`, so the two builds exercise the same configuration; the empty-variable build was still run explicitly                                                                                                                      |
| Not run        | Real `host-tablet` (WebKit is not installable here; CI browser-smoke is desktop only; T-6 should run it); hosted DEV and `tests/real/tasks-v1.db.real.test.ts` (updated for the new policy, not executed); the full Playwright suite (exact-head CI)                                                                                                                                                                   |

### Updated existing tests

`tests/e2e/tasks.spec.ts` notification test now asserts the Opening / Closing checklist announcements appear and the ordinary assignment adds none (the old "open a notification, jump to its task" step is gone because no task-bearing notification remains in V1). pgTAP 0026 (assigned / reassigned now absent) and 0029 (sweep stores nothing; read state exercised on checklist notifications) were updated to the new contract.

### Status

**T-3 COMPLETE.** PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`). T-4 NOT STARTED; Part 2 on hold; `main` and PROD untouched.
