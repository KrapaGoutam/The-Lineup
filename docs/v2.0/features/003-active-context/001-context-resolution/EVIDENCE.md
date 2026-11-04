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
