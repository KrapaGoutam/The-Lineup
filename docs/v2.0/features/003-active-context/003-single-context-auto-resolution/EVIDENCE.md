# V2-003.003 — Evidence

> Cloud evidence used an in-memory Supabase double. The sections below are Claude Code Local hosted-DEV evidence.

## Cloud (2026-11-04)

2,813 Vitest tests (7 pre-existing skips), desktop Playwright 1/1, format/lint/typecheck/local-paths/build, exact-head Application CI + Browser Smoke CI, Vercel preview. No migration.

## Local verification (2026-11-04, Claude Code Local) — hosted DEV `opmujepkemwcdxxorhfd` only

### Real JWT + RLS — `tests/real/single-context-auto.db.real.test.ts`: **22/22 passed**

Drives the real `loadPageData` entry path (`globalEntry`), `getPrimaryLocation` and the real `runTaskCommandAction` Server Action with each synthetic user's own Supabase Auth session. Synthetic organizations/users only.

| ID                                        | Result                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIVE-AUTO-01 default-tenant, one location | `/` resolves in place (`sole_eligible_location`), no redirect, schedule/tips/allocation loaded only for that location                                                                                                                                                                  |
| LIVE-AUTO-02 non-default org              | redirect to exactly `/r/<verified-slug>?location=<verified-id>`; destination resolves with `redirectTo = null`; 3 refreshes + bare route stable (no loop)                                                                                                                              |
| LIVE-AUTO-03 two locations                | `selection_required`, no data, no redirect; each explicit location resolves                                                                                                                                                                                                            |
| LIVE-AUTO-04 two orgs                     | `/` with an inaccessible default tenant never redirects or resolves; routes load only the route org's data; foreign explicit location rejected                                                                                                                                         |
| LIVE-AUTO-05 revoked/inactive             | revoked membership, revoked assignment, inactive and archived locations denied; revoking an assignment denies the **very next** request and re-granting restores it; admin sign-out (session revoked) → next request not resolved, no redirect, no data; anonymous → `unauthenticated` |
| LIVE-AUTO-06 invalid preferences          | malformed cookie → `invalid_context` (also on `/`, no redirect); ghost/unauthorized cookie → no redirect, no data; unauthorized or malformed `?location=` → `invalid_context`; unknown slug → not resolved; route-over-cookie, no cross-tenant leak                                    |
| LIVE-AUTO-07 Overall roles                | Overall Owner without local rows: not resolved, no arbitrary pick (many orgs); outsider gets nothing                                                                                                                                                                                   |

### No-`Referer` safety (real `runTaskCommandAction` create, DB rows checked via service role)

| Scenario                                                                                            | Result                                                                                                                                | DB rows                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A one eligible location                                                                             | `getPrimaryLocation` → that location; action `ok`                                                                                     | 1 row, correct `location_id` + `organization_id`       |
| B two eligible locations                                                                            | `null`; action refused                                                                                                                | 0                                                      |
| C remaining assignment revoked                                                                      | next call `null`, refused; re-granting the other location makes it the sole one                                                       | 0                                                      |
| D malformed / unauthorized / other-org / repeated `?location=` in `Referer`; cross-origin `Referer` | all `null` / refused, **no substitution** of the user's sole location; valid explicit `Referer` still writes to the selected location | 0 for denied; 1 for the valid one                      |
| E client-claimed foreign org (slug and `Referer`)                                                   | `getPrimaryLocation(foreignOrg)` = `null`; actions refused in both directions                                                         | 0; final per-run table = exactly the two intended rows |

### Real browser (Next dev server pinned to DEV, session cookies, `NEXT_PUBLIC_RESTAURANT_SLUG` = synthetic default tenant) — `tests/real/ui/single-context-auto.real.spec.ts`

Chromium (desktop) **4/4** + WebKit iPad landscape (host-tablet) **4/4** = **8/8**: default-tenant `/` stays on `/` with org + location indicator and no dropdown; non-default `/` navigates once to the canonical route (one distinct destination, no loop after 3 s), refresh, direct org URL, back/forward stable; two-location user sees the selection screen with no redirect and an explicit `?location=` opens that location; sign-out then another user shows none of the previous user's data and cannot open the previous org; back does not resurrect it.

### Cleanup

DEV after every run: 0 `v2a-*`/`v2auto-*` organizations, 0 `V2A`/`V2UI` profiles, 0 `v2a-`/`v2ui-` auth users, 0 `v2a-*` tasks. (45 unrelated `v2h-*@harness.invalid` auth users from an earlier suite were present before and were left untouched.)

### Notes

- No source change was needed; no new defect found in this feature.
- The `Referer` mechanism remains temporary: V2-003.004 replaces it. Direct-PostgREST cross-location RLS (V2-005) and client-supplied `locationId` binding (V2-005) are unchanged and remain release blockers.
