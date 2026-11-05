# V2-003.005 — Test Matrix

Legend: **Unit** = `npm test` (Vitest + jsdom; server pieces run with seams, no network). **Hosted** = real Supabase Auth JWTs against real RLS on `the-lineup-dev` (`tests/real/multi-tab-context.db.real.test.ts`, `LIVE-MT-*`). **Browser** = real Chromium / WebKit iPad against a production build pinned to DEV, real passcode sign-in, real HttpOnly cookie shared by real tabs (`tests/real/ui/multi-tab-context.real.spec.ts`). A mutation test passes only on the **exact database effect** at both candidate locations — never on an error message alone.

Unit files: `workspace-expectation.test.ts` (domain, WE), `data/workspace-expectation.test.ts` (WD), `context-sync.test.ts` (CS), `context-sync-channel.test.ts` (CH), `history-traversal.test.ts` (HT), `context-sync-guard.test.tsx` (GUARD), `context-reconcile-gate.test.tsx` (GATE), `use-context-switch.test.tsx` (SW), `tasks-actions.test.ts` (TA), `client-sign-out.test.ts` (SO), `context-navigation.test.ts` (NAV), `entry-boundary.test.ts` (STATIC).

## Multi-tab scenarios

| ID    | Scenario                                          | Unit                       | Hosted               | Browser                |
| ----- | ------------------------------------------------- | -------------------------- | -------------------- | ---------------------- |
| MT-01 | Two tabs start at A, one switches to B            | GUARD, CH, SW              | LIVE-MT-A, LIVE-MT-G | MT-01/02/03/21        |
| MT-02 | Stale tab is warned and blocked                   | GUARD, WE                  | LIVE-MT-A            | MT-01/02/03/21, UX    |
| MT-03 | Refresh reconciles with the verified context      | GUARD, NAV                 | —                    | MT-01/02/03/21        |
| MT-04 | User deliberately chooses A again                 | GUARD                      | LIVE-MT-D            | MT-04                  |
| MT-05 | Switch fails; no success signal                   | SW, GATE, GUARD            | —                    | MT-05                  |
| MT-06 | Rapid switches remain coherent                    | SW, GUARD (coalescing)     | —                    | MT-06                  |
| MT-07 | BroadcastChannel unavailable                      | CH                         | —                    | MT-07/08               |
| MT-08 | Background tab resumes after suspension           | GUARD (focus/visibility/pageshow, throttle) | — | MT-07/08          |
| MT-09 | Back/forward (and reload) to the old location     | GATE, HT, GUARD            | —                    | MT-09                  |
| MT-10 | Tab closes while the switch is pending            | CH, GUARD (cleanup)        | —                    | MT-10                  |

## Security scenarios

| ID    | Scenario                                              | Unit              | Hosted                | Browser |
| ----- | ----------------------------------------------------- | ----------------- | --------------------- | ------- |
| MT-11 | Stale Task mutation, normal `Referer`                 | TA                | LIVE-MT-A (0/0 rows)  | MT-11/12 |
| MT-12 | Stale Task mutation, stripped `Referer`               | TA, WD            | LIVE-MT-A (0/0 rows)  | MT-11/12 |
| MT-13 | Forged expected context does not grant access         | WE, WD, TA        | LIVE-MT-C             | MT-13   |
| MT-14 | Revoked assignment denies                             | WE, TA            | LIVE-MT-D             | MT-14   |
| MT-15 | Cross-organization mismatch denies                    | WE, WD, TA, GUARD | LIVE-MT-E             | MT-15   |
| MT-16 | In-flight mutation during a switch                    | TA                | LIVE-MT-B (exact rows)| — (timing is not controllable in a browser; asserted at the DB layer) |
| MT-17 | Sign-out invalidates stale tabs                       | SO, WE, GUARD     | LIVE-MT-F             | MT-17   |
| MT-18 | Another employee signs in on the same browser         | WE, WD, TA        | LIVE-MT-F             | MT-18   |

## Compatibility scenarios

| ID    | Scenario                                      | Unit   | Hosted         | Browser |
| ----- | --------------------------------------------- | ------ | -------------- | ------- |
| MT-19 | Single-location staff automatic entry         | TA     | LIVE-MT-G      | MT-19/20 |
| MT-20 | Multi-location switcher behavior              | SW     | LIVE-MT-G      | MT-04, MT-20 |
| MT-21 | `?tab=` preservation                          | NAV    | —              | MT-01/02/03/21 |
| MT-22 | No-access login UX from PR #294               | —      | —              | MT-22   |
| MT-23 | Independent devices keep independent prefs    | —      | LIVE-MT-G      | MT-23   |
| MT-24 | Demo mode works without Supabase              | —      | —              | existing demo Playwright suite (`npm run test:e2e`) |

## Cross-cutting

| Concern                                         | Where |
| ----------------------------------------------- | ----- |
| Expectation is an assertion, never authority    | WE (strict schema), WD, TA, STATIC (helper has no query/cookie/privileged client) |
| A received event writes nothing                 | STATIC (guard imports no selection action), LIVE-MT-G (verify never sets a cookie), GUARD |
| No ids / secrets in the channel                 | CS, CH, STATIC |
| No web storage / `document.cookie`              | STATIC |
| Light/dark, narrow viewport, 44 px, overflow, keyboard | Browser `UX stale panel (light|dark, narrow viewport)` |
| Fixture cleanup returns DEV to the baseline     | LIVE-MT-H, Browser `CLEANUP` |
| WebKit iPad                                     | Browser spec re-run on the `host-tablet` project |
