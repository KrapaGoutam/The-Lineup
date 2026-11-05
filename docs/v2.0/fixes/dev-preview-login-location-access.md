# DEV Preview Login Hotfix — test-user location access + post-login no-access state

Status: **source fix + DEV data repair done; local real-login, Chromium, WebKit iPad and Vercel Preview verification PASSED (see "Local QA")**. The Cloud session had no test passcodes or browsers against DEV; the Local QA session below closed that gap.

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

## Local QA (2026-11-05)

**Tested source HEAD:** `69116364cd382491103fe9e3bdfdc2b85de29f90` (no source change was needed; this document is the only edit made in Local QA).
**Environment:** local `next build --webpack` + `next start` of that HEAD (production mode) with the process env pinned to DEV (`NEON_DATABASE_URL` blanked, no env files in the worktree); `.next` scanned: 0 references to the Production ref, DEV ref present. Real `/api/auth/passcode` login; no passcode, token or cookie value was printed or stored. Supabase project: `the-lineup-dev` (`opmujepkemwcdxxorhfd`). Production was never contacted.

**Persistent fixtures (read-only re-verification):** all five accounts have exactly one active `DEV Location` assignment, org roles unchanged (TestOwner owner/manager, TestManager general_manager/manager, TestServer1/TestServer2/TestHost server/staff); 5 assignment rows exist in total. No passcode was modified (all five logged in with their original PINs throughout).

**Scenarios, run on each target** (spec was throwaway and is not committed; one browser context reused across accounts to test session isolation):

| Target                               | Five accounts | Invalid passcode         | Unassigned user |
| ------------------------------------ | ------------- | ------------------------ | --------------- |
| Local, Chromium desktop              | pass          | pass (HTTP 401)          | pass            |
| Local, WebKit iPad (gen 7 landscape) | pass          | pass (HTTP 401)          | pass            |
| Vercel Preview, Chromium desktop     | pass          | pass (HTTP 401)          | pass            |
| Vercel Preview, WebKit iPad          | pass          | not run (limiter budget) | pass            |

- **Five accounts:** from a signed-out screen the PIN reaches the real workspace (header shows the employee name and role; page shows `DEV Location`; no "Signing in as…" and no no-access screen), the manager-only "Store hours" action appears only for TestOwner/TestManager, a reload keeps the session, "Sign out" returns to the passcode screen with no `sb-*` or `lineup_active_context` cookies, `/r/the-monks` is signed-out and shows no previous employee, and the next account never inherits the previous identity. The UI role label for `general_manager` is "manager" (pre-existing mapping).
- **Unassigned synthetic user** (active org membership, no assignment, created for the run): "No restaurant location assigned" with **Check again** and **Sign out** at both `/` and `/r/the-monks`; no workspace header, no `DEV Location`, 0 browser Supabase REST calls; Check again and reload stay denied; Sign out clears cookies; after granting `staff` through `apply_location_assignment_changes` as TestOwner (the approved workflow), **Check again** enters the workspace. Layout at 1024 and 390 px: no horizontal overflow, every button ≥ 44 px tall.
- **Authorization with each account's own JWT:** staff accounts were denied self-promotion (`location_memberships` update 0 rows, assignment RPC 42501), store-hours edit (0 rows) and org-role elevation (0 rows); all five were denied inserting an assignment at a foreign location (42501) and saw only their own organization/location (1 org, 1 location, 0 foreign) among 30 orgs / 44 locations. A byte-for-byte snapshot of assignments, locations and memberships was identical before and after.
- **Preview binding:** deployment `dpl_8jhyv3C9sorTZD4RGHbjxSXhY8JM`, READY, git SHA `69116364…`, alias `the-lineup-git-fix-v2-preview-login-location-access-onepiece11.vercel.app`; its client bundle references the DEV ref and not the Production ref; a synthetic user that exists only in DEV signed in on it.
- **Unit/component:** 18 files / 249 tests (restaurant-entry, page-data-login-access, login, context, sign-out, single-context, passcode) passed.
- **Cleanup:** the synthetic user was removed. One run's `afterAll` missed it because the app had written 2 `task_notifications` rows for it after the grant; those rows and the user were then removed by hand. DEV is back to the baseline (53 auth users, 30 orgs, 44 locations, 5 assignments). The five persistent accounts and their assignments were not touched.
- **Harness notes (not application defects):** a WebKit login failed once when the spec typed the PIN before hydration (`body[data-hydrated]` marker); waiting for the marker fixed it. A duplicate account-menu node (desktop/mobile variants) needed a visibility filter.

**Residual risk:** WebKit is Playwright's Windows WebKit, not a physical iPad. Preview invalid-passcode was exercised in Chromium only. A genuine member without an assignment still stays denied by design until a manager assigns them (V2-008 backfill and V2-003.005 multi-tab/stale-context safety remain separate work).

## Limitations

Does not implement V2-008 (permanent backfill) or V2-003.005. A genuine member without an assignment stays denied by design.
