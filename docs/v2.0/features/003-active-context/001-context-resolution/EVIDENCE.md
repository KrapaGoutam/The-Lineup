# V2-003.001 — Evidence

Environment: Claude Code Cloud. No Supabase credentials, no Docker. Hosted DEV (`opmujepkemwcdxxorhfd`) **not** contacted. Production (`ftadewtkjlaotfdvtjcv`) **not** contacted. `main` untouched. No migration.

Base: `origin/development` `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`; PR #282 verified merged (`c543856a`), Issue #250 closed.

## Local gates (final code)

| Gate                                                                          | Result                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check`                                                            | pass                                                                                                                                                                                                                    |
| `npm run format:check`                                                        | pass                                                                                                                                                                                                                    |
| `npm run lint` (`--max-warnings=0`)                                           | pass                                                                                                                                                                                                                    |
| `npm run typecheck`                                                           | pass                                                                                                                                                                                                                    |
| `npm test` (Vitest)                                                           | **200 files / 2,733 passed / 7 pre-existing skips** (baseline 2,617 → +116 new tests in 9 new files; no previously passing test changed)                                                                                |
| `npm run check:local-paths`                                                   | pass                                                                                                                                                                                                                    |
| `npx next build --webpack` (demo)                                             | pass; `/` static (unchanged)                                                                                                                                                                                            |
| `npx next build --webpack` (real mode, placeholder public config, no network) | pass; `/` and `/r/[restaurantSlug]` dynamic (`ƒ`) — the cookie read keeps the entry request-time                                                                                                                        |
| Playwright desktop + server-mobile (demo)                                     | **136 / 136 passed**: default-landing, dashboard (login/role flows), location-administration, location-lifecycle, staff-assignment-management, settings, management-today, allocation-open-editing, recurring-schedules |
| Playwright `host-tablet` (WebKit)                                             | not run — WebKit unavailable in Cloud (same as V2-002.005)                                                                                                                                                              |

## What the tests do and do not prove

- The data-boundary matrix runs the **real** loader and the **real** canonical resolver against `src/features/context/testing/fake-supabase.ts`, an in-memory client holding table rows that applies the read rules of the real RLS policies (`organizations`/`locations`: Overall or active member; own active `memberships`; own `location_memberships`/`overall_roles`). `loadPageData` tests double only the Supabase client, the cookie store and the three loaders (spied to assert their arguments). Real loaders are separately run with a verified scope and asserted never to query the primary location (`entry-loaders.test.ts`).
- Mutation checks (reverted afterwards): ignoring `archived_at`; first-eligible fallback; skipping the route/cookie organization comparison — each failed the intended tests.
- Review finding fixed during the work: catch-all blocks around `createClient()`/`cookies()` would have swallowed Next.js's request-time (dynamic) signal; they now `unstable_rethrow` it (tested with a `DYNAMIC_SERVER_USAGE` error). Also fixed: an `role="alert"` that had replaced the notice heading's semantics.
- **Not proven here:** real Supabase Auth JWT + PostgREST behavior of the new read paths (`overall_roles`, own `memberships`/`location_memberships`, org/location select for Overall holders) on hosted DEV, and the real two-user/WebKit browser experience. The fake mirrors the policies as read from the migrations (`20261103030000`, `20261103040000`, `20261103050000`), but it is a model, not the database.

## Pending verification (see PR)

Exact-head CI result and the merge/handoff decision are recorded in the PR and the final report. A minimal Codex Local authenticated hosted-DEV verification is the recommended next step if the PR is held for it: sign in as real DEV identities and confirm (1) Overall owner with no membership resolves, (2) a scoped single-location user resolves, (3) a scoped multi-location user gets `selection_required`, (4) revoked membership/assignment/inactive/archived location each deny, with no schedule/tips/allocation data rendered.

## Local closeout — hosted DEV verification (Claude Code Local, 2026-11-04)

Environment: DEV `opmujepkemwcdxxorhfd` only (harness hard-aborts otherwise); Production not contacted; `main` untouched. Suite: `tests/real/active-context.db.real.test.ts` (`npm run test:real` config), **15/15 passed**. The REAL loader + REAL canonical resolver ran with real Supabase Auth JWTs against real RLS/PostgREST over synthetic organizations/users; teardown verified (0 organizations / profiles / auth users left).

| # | Check | Result |
| - | ----- | ------ |
| 1 | Overall Owner without membership | authorized; two eligible locations → `selection_required`; cookie → `resolved` |
| 2/3 | Overall Manager / Assistant | `resolved`, tiered capabilities differ (manager has `overall:manage`, `org:admin`, `location:manage`; assistant does not) |
| 4 | Scoped user, one assignment (B; A is oldest) | `resolved` to **B** |
| 5/6 | Multi-location, no cookie / valid cookie | `selection_required` / `resolved` to the cookie location |
| 7 | Cookie org ≠ route org (authorized in both) / cookie location from another org | `invalid_context` |
| 8–11 | Inactive org membership, inactive assignment, inactive location, archived location, revoked creator (Issue #106) | `no_access` (also stale cookie to C/D → denied) |
| 12 | Malformed (not-JSON, `{}`, wrong version, oversize), stale (random location / org) cookies | `invalid_context` |
| 13 | Session revoked via `auth.admin.signOut(jwt,"global")`; never-signed-in client | `unauthenticated` |
| 14 | Org Owner/GM with no location assignment | `no_access` (canonical resolver; V2-008 backfill dependency) |
| – | Unknown / other-org route slug | `no_access` (no enumeration) |

Denied contexts never reach `loadPageData`'s schedule/tips/allocation loaders (only `resolved` hydrates; covered by the integration tests).

### Legacy `getPrimaryLocation()` probe (real RLS)

Findings before the fix: (a) the helper returned the oldest location regardless of assignment, active or archived state; (b) module-table RLS (`private.has_org_role`, e.g. `tip_pools`) is **organization-role based, not location-assigned**: a manager assigned only to B could read and insert `tip_pools` rows at unassigned A directly via PostgREST — pre-existing on `main`, independent of this PR, and only closable by V2-005 location-scoped RLS; (c) writes to an inactive location are blocked by the lifecycle trigger (`LOCATION_NOT_ACTIVE`).

**Narrow fix on this PR** (`primary-location.ts`): the helper now considers only active, un-archived locations and, for a caller with active assignments in the organization, only those assigned locations (null/fail-closed when none is eligible). Callers without assignments (Overall roles, legacy org-level members) keep the oldest **active** location. Verified on DEV: B-only user → B (not A); oldest-inactive org → the assigned active location; user whose only assignment is an inactive/archived location → `null`; unassigned org owner → oldest active.

Residual limitation (documented for V2-005): org-level RLS still permits direct cross-location access inside a user's organization, and a user whose assignments were all revoked is indistinguishable from a legacy org-level member (falls back to oldest active) until V2-005/V2-008.

### Gates after the fix
format, lint (`--max-warnings=0`), typecheck pass; Vitest **200 files / 2,736 passed / 7 skipped**. WebKit `host-tablet` (default-landing, dashboard, location-administration, location-lifecycle, staff-assignment-management, settings): 58 passed + 2 flaky-on-retry; `default-landing TS-004` flake reproduces on the `development` base (2/12 failures at `cacdd7c`) so it is pre-existing.
