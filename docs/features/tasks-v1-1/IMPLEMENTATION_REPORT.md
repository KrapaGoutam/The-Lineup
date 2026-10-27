# Tasks V1.1 — Implementation Report

Newest phase last. Plan: `PLAN.md`; matrix: `TEST_MATRIX.md`.

## T-1 — Default Tasks landing and `?tab=` module addressing (PLAN D-1)

**Branch:** `feature/tasks-v1-1-default-landing` (from `development` @ `126c72d`). No migration, no `supabase/**` change.

### What changed

- `src/lib/app-tab.ts` (new, pure): `AppTab`, `DEFAULT_APP_TAB = "tasks"`, `tabFromParam` / `tabToParam` (Bar Inventory is `bar-inventory`), `resolveTab` (role fallback), `tabHref` (keeps path and unrelated query parameters; the default landing carries no `tab`, so `/` stays `/`).
- `restaurant-operations-app.tsx`: the module state starts from `?tab=` (else Tasks). A tab click still updates state immediately and pushes the URL; a URL change (back/forward) re-selects the module through a render-time comparison, not an effect. `resolveTab` is applied once after the signed-in guard, so staff on `?tab=bar-inventory` or `?tab=team` see Tasks (UX fallback only; the server still enforces access). Sign-out now resets to Tasks and clears the query (it used to leave `schedule` selected, which a demo-mode re-sign-in would have inherited).
- Unchanged on purpose: the brand "Home" button and Settings "Back" still go to Table Allocation. The brief asked for a default landing, not a redefinition of Home.

### Repo truth recorded

The app has no module routes. "Deep links respected" is delivered by `?tab=`; refresh keeps the module because the URL carries it. Demo mode keeps its session in memory, so a reload there returns to the passcode screen and the requested module is applied on the next sign-in (asserted in TS-002).

### Existing specs updated (they assumed Table Allocation after sign-in)

`dashboard.spec.ts` (manager modules, assistant-manager promotion, keypad sign-in), `team-management.spec.ts`, `payroll-timesheet-overhaul.spec.ts` ("lands on Table Allocation by default" became TS-001: lands on Tasks). Each keeps its original coverage by navigating to the module it needs.

### Tests

| Layer                                   | Result                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                                  | 1415/1415 (+9 in `app-tab.test.ts`: default, parameter round trip, `tabHref`, role fallback)                                                                                        |
| Playwright new                          | `default-landing.spec.ts`: TS-001 (manager, staff, mobile dock highlight), TS-002 (deep link + reload), TS-003, TS-004 (URL, back, forward), TS-005 (staff fallback, manager opens) |
| Playwright full (`CI=1`, `--workers=2`) | desktop 248 · host-tablet 248 · server-mobile 246 + 2 skips; 0 failures                                                                                                             |
| Static                                  | prettier · eslint · tsc clean                                                                                                                                                       |

### Status

Implemented and validated locally. **Pushed, no PR, not merged:** the owner's order is Vendor Order Drafts (VOD-0..VOD-4) before any Tasks code. Open the PR (and re-run exact-head CI after rebasing onto the then-current `development`) once VOD-4 is complete. The shared handoff (`tasks/current-task.md`) is deliberately not edited on this branch to avoid conflicts with the VOD handoff.
