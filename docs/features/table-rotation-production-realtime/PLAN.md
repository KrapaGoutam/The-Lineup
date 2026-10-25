# #134 — Production-build Table Rotation Realtime

Bug fix (P1, release blocker for `development → main`). Issue #134, milestone "Platform / CI Reliability", Project #4. Branch `fix/table-rotation-production-realtime` from `development` @ `93338b2`.

## Outcome

A manager's already-open Table Allocation page learns of another device's change (owner assigns a table) through Realtime and re-renders the authoritative board **without** reload, navigation, view switch, focus change or refresh — identically under `next dev` and `next build` + `next start`.

## Non-goals

No Grid/Floor/Picker UX (#109), no Tasks/Realtime for Tasks, no schema/RLS change, no Part 2/3, no PR #135 content, no `main`/PROD work, no timeout/sleep changes.

## Realtime contract (unchanged)

session → `realtime.setAuth(JWT)` → channel → event = **invalidation only** → `router.refresh()` (authoritative server read) → canonical board read model → every view. Every `SUBSCRIBED` (first join and each rejoin) also invalidates, so missed events converge.

## Root cause (R2)

**Observed:** in the production bundle the hook's destructured default `createClient = createBrowserSupabaseClient` is compiled into an inline arrow, i.e. a **new function identity on every render**. `createClient` was a dependency of the effect that owns the subscription (`useBoardRealtime` in `use-board-realtime.ts`). Instrumented production run (manager page): `effect-run changed idx: 4` (= `createClient`) on every render, with no hook remount.

**Expected:** the subscription is rebuilt only when `enabled`, person, organization or board session change.

**Mismatch / which operations race:** every `SUBSCRIBED` → `onInvalidate()` → `router.refresh()` → new `initialContext` → re-render → new `createClient` identity → effect cleanup (`removeChannel`, an async leave) + immediate `startBoardRealtime` → `supabase.channel(sameTopic)`. supabase-js (`@supabase/realtime-js` 2.115.0, `RealtimeClient.channel`) returns the **already-registered channel instance for an identical topic**, which is still leaving; the leave's `phx_close` / `teardown()` then lands on the instance that was just re-joined. Result: a perpetual refetch/resubscribe loop (manager page: 15 `phx_join` frames, owner 22, in one ~20 s scenario) and windows in which the live channel is closed or rejoining when another device's INSERT arrives; if the churn ends on a closed channel, nothing refetches. A second, smaller instance of the same race: on load the auth listener's `SIGNED_IN` and the initial `getSession()` both called `subscribe()`, tearing down and re-creating the same topic (three `phx_join` for one topic on one page load).

**Why `next dev` masked it:** the dev bundle does not inline the default parameter, so `createClient` keeps one identity, the effect never re-runs spuriously and there is no loop. React StrictMode is _not_ the factor — the original hypothesis was wrong; StrictMode only double-mounts once at load.

**Why `next start` exposed it:** the production bundle inlines the default → identity changes per render → loop.

**Caveat on reproduction:** the failing S07 assertion reproduced on the first production run of this session (identical to the issue). Six later unfixed production runs (instrumented and clean) passed. The defect is timing-dependent (another device's INSERT must arrive while the churning channel is closed or rejoining), but the cause is deterministic and is pinned by a failing-before / passing-after unit test (`createClient` new every render → 4 channel creations instead of 1) and by the join-frame counts above.

## Fix (R3) — client lifecycle only

`src/features/allocation/hooks/use-board-realtime.ts`

1. `createClient` is held in a ref and removed from the effect dependency list (deps: `enabled, userId, organizationId, serviceSessionId`). Not a `NODE_ENV` special case; dev and prod share one lifecycle.
2. `startBoardRealtime` creates **one** channel per lifecycle: a second subscribe request (SIGNED_IN + initial `getSession`, TOKEN_REFRESHED) only refreshes the JWT.
3. A channel is never created while a previous channel for the same client is still being removed (per-client pending-removal promise); a sign-out while waiting cancels the join.

Unchanged: auth-before-subscribe, no anon join, invalidation-only payload, refetch on every `SUBSCRIBED`, JWT refresh, teardown on sign-out / unmount / identity / session change. No migration, no schema, no Tasks change.

## Risks

A deferred join after a same-topic removal adds at most one leave round-trip. The pending-removal map is a `WeakMap` per client (no leak). A sign-in as a different person on the same mounted page now refreshes the JWT on the existing channel and the `userId` prop change rebuilds it (previously rebuilt immediately).

## Tests

Unit: `use-board-realtime.test.ts` (+3: one channel for SIGNED_IN + getSession, no same-topic re-create during removal, no join after sign-out while waiting; 1 adjusted) and new `use-board-realtime.hook.test.tsx` (React binding: stable under a new `createClient` every render, rebuild on person/org/session change, disabled in demo). Real-mode: `npm run test:real:ui` against `next build` + `next start` and `next dev` on DEV Supabase. See `TEST_MATRIX.md`.

## CI note

The hosted real-mode suites need DEV secrets and are not in ordinary CI; they remain documented release evidence. CI covers the unit regression tests, lint, typecheck, build and browser smoke.

## Codex build prompt

Not applicable — implemented directly at the owner's request in this session; scope is limited to the three listed changes.
