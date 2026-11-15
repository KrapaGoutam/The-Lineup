# V2-003.004 — Status

Status: **`LOCALLY_VALIDATED`** (2026-11-04) — hosted DEV real-JWT 46/46, real Chromium 25/25 and WebKit iPad 25/25, real passcode sign-in/sign-out, race checks and exact-head CI. Merge into `development` follows the final CI check on the PR head (see the PR / [EVIDENCE.md](EVIDENCE.md)).

- Issue #290 · PR #291 · Parent #251 · Program #248 · Milestone #8
- Branch `feature/v2.0-003.004-secure-context-persistence` from `development` `398393bfa4f0a8edb5b99f33b78574960d74666a`; PR targets `development` only.
- Migration: none. `main` (`5e5b7747…`) and Production untouched.
- Plan: [PLAN.md](PLAN.md) · Tests: [TEST_MATRIX.md](TEST_MATRIX.md) · Evidence: [EVIDENCE.md](EVIDENCE.md)

## Merge blockers — all verified false on 2026-11-04

| #   | Blocker                                           | Evidence                                                                                        |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | unauthorized location persisted                   | LIVE-PERSIST-C/D, browser DEEPLINK-2 (0 cookies written)                                        |
| 2   | cookie written without server authentication      | writer only reachable from Server Actions / auth routes; unauthenticated selection never writes |
| 3   | invalid cookie falls back to a different branch   | LIVE-PERSIST-C, SW-OPS-02/03/04                                                                 |
| 4   | B-looking workspace performs an A action          | LIVE-PERSIST-G, browser RACE-C/D (refused, 0 rows); stripped-Referer residual below             |
| 5   | missing Referer selects an arbitrary branch       | LIVE-PERSIST-B, browser PERSIST-2 (row at the persisted location only)                          |
| 6   | stale/revoked assignment still usable             | LIVE-PERSIST-E, browser REVOKE                                                                  |
| 7   | sign-out leaves context for the next sign-in      | LIVE-PERSIST-F, browser SIGNOUT, PASSCODE-1                                                     |
| 8   | cross-organization cookie hydrates another tenant | LIVE-PERSIST-D, browser XORG                                                                    |
| 9   | unverified URL value decides authorization        | DEEPLINK (gate verifies server-side before opening)                                             |
| 10  | cookie/selection error hidden as an empty success | SWITCHFAIL, DEEPLINK abort, REVOKE ("Tasks could not be loaded")                                |

## Accepted residual risks (not blockers; owned elsewhere)

- A stale tab whose `Referer` was stripped writes to the **persisted** location while showing another (never to any other location). V2-003.005 / V2-005.
- A stale tab's refusal shows "No location is set up yet." — misleading copy. V2-003.005.

## Open dependencies (not closed here)

V2-003.005 (multi-tab), V2-005 (location RLS + module action binding — Production blockers), V2-008 (backfill).
