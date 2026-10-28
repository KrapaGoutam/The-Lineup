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

T-2 implemented; PR to `development` follows the merge-commit rule. T-3 (notification narrowing) **not started**; Part 2 on hold.
