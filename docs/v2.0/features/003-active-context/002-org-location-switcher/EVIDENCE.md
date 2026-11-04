# V2-003.002 — Evidence

> Cloud evidence uses an in-memory Supabase double that emulates the real RLS
> read rules. It is **not** hosted DEV verification.

## Cloud (2026-11-04)

See the PR for exact-head CI. Local gates run before push:
`vitest` (context + components), Playwright `desktop` + `server-mobile`
(`context-switcher-demo`, `default-landing`: 24/24), `npm run lint`,
`npm run typecheck`. Final full-gate results are recorded in the PR.

## Hosted DEV (`opmujepkemwcdxxorhfd`) — NOT DONE

Smallest local handoff (real JWTs, synthetic fixtures only; never Production
`ftadewtkjlaotfdvtjcv`):

1. User with two locations in one org: `/r/<slug>?location=<L2>` resolves L2;
   `?location=<L-other-org>`, `<inactive>`, `<archived>`, `<unassigned>`,
   `not-a-uuid` all render the recovery screen with no operational data.
2. Multi-org user with a stale cookie for org A on `/r/<orgB>?location=<B-loc>`
   resolves B; without `?location=` the same cookie yields `invalid_context`.
3. Switcher list for a scoped user shows only assigned active locations;
   revoke an assignment → list/URL deny.
4. Visual: header at 390 / 768 / 1366 and WebKit/iPad; keyboard + touch.

Known open: V2-005 location RLS gap (a Location-B manager can read some
Location-A rows via PostgREST) is pre-existing and **not** fixed here.
