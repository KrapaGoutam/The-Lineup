# V2-003.004 — Test Matrix

Legend: **Cloud** = automated, runs in `npm test` (RLS-emulating in-memory Supabase double running the real loader, canonical resolver, Server Actions, cookie writer and `getPrimaryLocation`) — _a model of RLS, not hosted DEV_. **Local** = hosted DEV real-JWT (`npm run test:real`) / real browser — written, **not executed in Cloud**.

Files: `src/features/context/context-persistence.test.ts` (CP), `src/features/locations/data/primary-location.test.ts` (PL), `src/lib/page-data-reconcile.test.ts` (PR), `src/features/context/domain/context-cookie.test.ts` (CK), `…/request-consistency.test.ts` (RC), `src/features/context/components/context-reconcile-gate.test.tsx` (GATE), `src/components/restaurant-entry.test.tsx` (NOTICE), `src/lib/client-sign-out.test.ts` (SO), `src/features/context/entry-boundary.test.ts` (GUARD). Hosted: `tests/real/context-persistence.db.real.test.ts` (LIVE-PERSIST-A…G), updated `tests/real/{org-location-switcher,single-context-auto}.db.real.test.ts`, `tests/real/ui/org-location-switcher.real.spec.ts`.

| ID         | Behavior                                                         | Cloud                                                                 | Local                            |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| PERSIST-01 | Valid authenticated selection writes the correct cookie          | CP                                                                    | LIVE-A                           |
| PERSIST-02 | Unauthenticated selection does not write                         | CP                                                                    | —                                |
| PERSIST-03 | Revoked/expired session cannot write; auth outage ≠ success      | CP, NOTICE                                                            | —                                |
| PERSIST-04 | Organization/location mismatch denied                            | CP                                                                    | LIVE-C                           |
| PERSIST-05 | Missing location assignment denied                               | CP                                                                    | LIVE-C                           |
| PERSIST-06 | Inactive membership / assignment denied                          | CP                                                                    | —                                |
| PERSIST-07 | Inactive location denied                                         | CP                                                                    | —                                |
| PERSIST-08 | Archived location denied                                         | CP                                                                    | —                                |
| PERSIST-09 | Overall Owner without membership can select an eligible location | CP                                                                    | —                                |
| PERSIST-10 | Capability tier preserved (forged cookie adds nothing)           | CP                                                                    | —                                |
| PERSIST-11 | Cookie v1 format unchanged, ids only                             | CK, CP                                                                | LIVE-A                           |
| PERSIST-12 | HttpOnly / Secure(production) / SameSite / path / no Domain      | CK, CP                                                                | UI spec (real browser)           |
| PERSIST-13 | 7-day fixed lifetime                                             | CK, CP                                                                | UI spec                          |
| PERSIST-14 | Refresh retains valid context                                    | CP, PR                                                                | LIVE-A, UI spec                  |
| PERSIST-15 | Ordinary navigation retains context                              | CP (repeated resolution)                                              | UI spec                          |
| PERSIST-16 | Browser restart retains preference while valid                   | persistent `Max-Age` (CK) only                                        | **Local** (restart real browser) |
| PERSIST-17 | Sign-out clears the cookie                                       | CP, GUARD                                                             | LIVE-F, UI spec                  |
| PERSIST-18 | A different user signing in inherits nothing                     | CP (after sign-out), GUARD (sign-in clear)                            | LIVE-F, **sign-in clear: Local** |
| PERSIST-19 | Explicit URL overrides cookie only after validation/persist      | PR, CP                                                                | LIVE-G                           |
| PERSIST-20 | URL/cookie mismatch cannot cause wrong-location writes           | PL, CP, PR, GATE, RC                                                  | LIVE-G                           |
| PERSIST-21 | Cross-organization switch updates persisted context              | CP                                                                    | LIVE-D                           |
| PERSIST-22 | Invalid cookie fails closed                                      | PL, CP                                                                | LIVE-C                           |
| PERSIST-23 | Stale cookie fails closed                                        | CP                                                                    | LIVE-C                           |
| PERSIST-24 | Revoked assignment invalidates preference next request           | CP                                                                    | LIVE-E                           |
| PERSIST-25 | Multiple locations without cookie require selection              | PL, CP                                                                | LIVE-B                           |
| PERSIST-26 | Single eligible context works without cookie                     | PL, CP, PR                                                            | existing LIVE-AUTO               |
| PERSIST-27 | Server Action with no Referer uses the persisted context         | PL, CP                                                                | LIVE-B                           |
| PERSIST-28 | Server Action with invalid cookie refuses                        | PL, CP                                                                | LIVE-C                           |
| PERSIST-29 | Conflicting organization refuses                                 | PL, CP                                                                | LIVE-D                           |
| PERSIST-30 | Query failure never becomes a fallback                           | CP                                                                    | —                                |
| PERSIST-31 | Single-context redirect/entry unchanged                          | existing `page-data-auto-resolution.test.ts` (unchanged, passing), PR | existing LIVE-AUTO               |
| PERSIST-32 | Back/forward cannot silently mutate another location             | CP, RC (server-side refusal)                                          | UI spec back/forward             |
| PERSIST-33 | Context switch discards stale client state                       | NOTICE, GATE, existing `ContextScopeBoundary` tests                   | UI spec                          |
| PERSIST-34 | Demo mode unaffected                                             | PR, existing demo Playwright 26/26                                    | —                                |
| PERSIST-35 | Logout / session invalidation leaves no usable stale workspace   | CP, SO                                                                | LIVE-F                           |
| PERSIST-36 | No creator-bypass / location-role escalation                     | CP (Katy vs Webster), existing resolver suites                        | —                                |

## Negative / additional

| Case                                                                                 | Test       |
| ------------------------------------------------------------------------------------ | ---------- |
| Repeated submissions ignored while in flight                                         | NOTICE     |
| Selection-action failure / thrown error → no navigation, alert                       | NOTICE     |
| Failed selection leaves a previous valid cookie untouched                            | CP         |
| Strict input schema (extra keys, non-UUID, bad tab, arrays)                          | CP         |
| Denial reason does not reveal tenant existence                                       | CP         |
| Stale session / retry (gate: refused, thrown, retry, choose-location)                | GATE       |
| Clear requires a session; clear grants nothing; failed clear announced               | CP, NOTICE |
| Sign-out clears cookie even when `signOut` fails; no secret in body                  | CP         |
| Delayed sign-out cannot overtake the next sign-in                                    | SO         |
| Only the central writer may set the cookie; no service-role/client storage           | GUARD      |
| Referer can only reject: cross-origin / missing / malformed / repeated / undecodable | RC, PL     |

## Mutation checks performed

See EVIDENCE.md.

## Local validation (2026-11-04) — executed

Hosted DEV real-JWT 46/46 (`context-persistence` 7, `org-location-switcher` 17, `single-context-auto` 22). Real browser, Chromium 25/25 and WebKit iPad 25/25, in `tests/real/ui/context-persistence.real.spec.ts` (new) and `org-location-switcher.real.spec.ts`:

| Spec id         | Covers                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PASSCODE-1/2/3  | real sign-in clears saved context and shows the picker; failed passcode leaves it; single-location auto-entry (PERSIST-18, 26) |
| PERSIST-1       | wire + stored cookie attributes, HttpOnly, reload, new tab, `?tab=`, module navigation, browser restart (PERSIST-11–16)        |
| PERSIST-2       | no-Referer action writes only the persisted location; contradicting Referer refused (PERSIST-27, 20)                           |
| DEEPLINK / -2   | confirmation gate, abort, retry, choose-location, unauthorized deep link (PERSIST-19, 20)                                      |
| XORG            | cross-organization switch (PERSIST-21, 29)                                                                                     |
| SIGNOUT         | sign-out + shared device (PERSIST-17, 18, 35)                                                                                  |
| RACE-A/B/C/D/E  | double selection, delayed sign-out, stale tab, in-flight action, two devices                                                   |
| KNOWN-RESIDUAL  | stripped-Referer stale tab characterization (see STATUS.md)                                                                    |
| HISTORY / CANON | back/forward without loops, `?tab=` canonicalization (PERSIST-32)                                                              |
| REVOKE          | revocation on the next action and next load (PERSIST-24)                                                                       |
| SWITCHFAIL      | failed switch message, no cookie, retry                                                                                        |

Added in Local: `context-cookie.test.ts` and `context-persistence.test.ts` cover a spoofed `X-Forwarded-Host` (PERSIST-12). PERSIST-16 (browser restart) is covered by PERSIST-1 above.
