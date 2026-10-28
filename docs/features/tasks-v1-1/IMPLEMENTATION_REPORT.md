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

**T-1 COMPLETE.** PR #203, tested head `1e3e4b1` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `cf3ae39` (merge commit, two parents). T-2 (Management Today) is next and **not started**.
