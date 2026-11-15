# V2-003.003 — Single-Context Auto Resolution — Plan

Decision: V2-D008. Parent feature #251, program #248, milestone #8. Target: `development`.
Base: `development` `3c83535db19aa38907d4d7fd76c97f5cff17b668`. Migration: none.

## Audit (what .001/.002 already satisfy — preserved, not rebuilt)

| D008 requirement                                      | State before .003                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Unique eligible location resolves without a picker    | Done in .001 (`sole_eligible_location`, never creation order)                                                                |
| Eligibility (membership, assignment, lifecycle, TZ)   | Done in .001 via canonical `resolveUserAccess` + `location:access`                                                           |
| Explicit `?location=` wins; unauthorized fails closed | Done in .002                                                                                                                 |
| Malformed/stale cookie rejected, not ignored          | Done in .001                                                                                                                 |
| Single-location indicator (no dropdown)               | Done in .002                                                                                                                 |
| Operational loaders share one verified location       | Done in .001                                                                                                                 |
| `/` for a user outside the default tenant             | **Gap**: `/` is pinned to `NEXT_PUBLIC_RESTAURANT_SLUG ?? "the-monks"`; a user of another org got `no_access` (login screen) |
| Follow-up actions with no `Referer`                   | **Gap**: `getPrimaryLocation` fell back to the OLDEST assigned/active location                                               |

## Changes (genuine additions only)

1. **Global entry redirect** (`src/lib/page-data.ts`, `restaurant-entry.tsx`, `app/page.tsx`).
   Only on `/` (`globalEntry`), only when the default-tenant resolution is `no_access`, re-run the canonical
   resolver with no route scope. Only a `resolved` result (unique eligible context, or a valid stored preference)
   yields `redirectTo = /r/<verified-slug>?location=<verified-id>`, built by the existing `contextSwitchHref`
   from verified data (never from input → no open redirect). Ambiguous, invalid, stale, errored, unauthenticated
   and demo cases keep today's presentation. `/r/*` never redirects → no loops.
2. **No-`Referer` follow-ups** (`primary-location.ts`). Replaced the oldest-location fallback with the caller's
   single canonical eligible location in the organization (`listCurrentEligibleContexts`); zero or several → `null`
   (fail closed). A verified `Referer` `?location=` selection still takes precedence (.002).

## Routing contract

- `/r/<slug>[?location=]`: unchanged (.001/.002 precedence).
- `/` default tenant accessible → renders in place exactly as the pilot does today (no redirect).
- `/` default tenant not accessible, exactly one verified context elsewhere → redirect to its canonical route.
- `/` anything ambiguous → unchanged presentation; no tenant is chosen.

## Non-goals

Context cookie writes/clears (.004), BroadcastChannel (.005), module settings (V2-004), location-scoped RLS/actions
(V2-005), backfill (V2-008). The direct-PostgREST location isolation weakness remains a V2-005 release blocker.
