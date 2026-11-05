# DEV Preview Login Hotfix — test-user location access + post-login no-access state

Status: **source fix + DEV data repair done; hosted real-JWT login, browser and Vercel Preview verification PENDING** (Cloud session: no test passcodes, no browsers against DEV). Not merged.

## Root cause

Passcode sign-in only needs an **active organization membership**, so `/api/auth/passcode` succeeded and the client entered its "Signing in as …" pending state and called `router.refresh()`. Workspace hydration needs a **location context** (canonical resolver: active membership **and** active location assignment). The five DEV test accounts had memberships but zero assignments, so `loadPageData` returned `no_access` with `initialUser = null`. `RestaurantEntry` treated `no_access` like signed-out and rendered the operations app, whose `pendingAccount` waits for an `initialUser` that never arrives until the 10 s "taking longer than expected" notice.

## Source fix (narrow)

- `RestaurantEntry`: `no_access` (an _authenticated_ denial; unauthenticated is a separate status) now renders `ContextUnavailableNotice`, never the operations app.
- `ContextUnavailableNotice`: new `no_access` state — "No restaurant location assigned", **Check again** (`router.refresh()`), **Sign out** (shared `requestSignOut()` → trusted `/api/auth/signout` clears session + context cookie → refresh to the passcode screen). No data loaded, no choices, no auto-assignment.
- Resolver, access model, RLS, passcode route: unchanged. No timeout change.

## DEV data remediation (persistent test fixtures)

Project verified as `the-lineup-dev` (`opmujepkemwcdxxorhfd`); Production not contacted. Bootstrap problem: every account lacked an assignment, so no administrator could enter the app to use `applyStaffLocationChangesAction` / `apply_location_assignment_changes`; one narrow, idempotent maintenance INSERT keyed on exact profile/organization/location UUIDs (guarded: location belongs to the organization, active, not archived; profile has an active membership; `ON CONFLICT (location_id, profile_id)`) created exactly:

| Account     | Org role (unchanged) | Location     | Location role |
| ----------- | -------------------- | ------------ | ------------- |
| TestOwner   | owner                | DEV Location | manager       |
| TestManager | general_manager      | DEV Location | manager       |
| TestServer1 | server               | DEV Location | staff         |
| TestServer2 | server               | DEV Location | staff         |
| TestHost    | server               | DEV Location | staff         |

Before: 0 assignment rows for the five (and 0 in the organization). After: exactly 1 active row each, 5 in the organization, no Overall roles, memberships untouched, no passcode change. No migration, no permanent bypass code.

## Tests

`LOGIN-FIX-01…03, 05…09` — `src/lib/page-data-login-access.test.ts` (real resolver + entry path; includes `/`), `src/components/restaurant-entry.test.tsx` (no-access screen, retry, ordered sign-out). LOGIN-FIX-10 — existing demo specs (Playwright demo 12/12 re-run) and demo unit tests. LOGIN-FIX-04 (invalid passcode) — route unchanged; covered by existing behavior, not re-tested in Cloud.
Full gates: Vitest 210 files / 2,893 passed / 7 skipped; lint, typecheck, format, local-paths; `next build --webpack` demo + real mode.

## Pending (not claimed)

Hosted real-JWT login per account and role-distinction checks, Chromium/WebKit login of all five accounts plus a synthetic unassigned user, Vercel Preview (confirm it is bound to DEV), exact-head CI. Needs the local test credentials (never printed).

## Limitations

Does not implement V2-008 (permanent backfill) or V2-003.005. A genuine member without an assignment stays denied by design.
