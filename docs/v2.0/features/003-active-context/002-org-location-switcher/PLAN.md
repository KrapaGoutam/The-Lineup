# V2-003.002 — Organization / Location Switcher — Plan

Parent feature: #251 · Program: #248 · Milestone: #8 · Base: `development` `5333a526`
Depends on: V2-003.001 (resolver, read-only cookie contract). No migration.

## Outcome

A signed-in user sees their active organization and location in the header and
can switch to another context they may legitimately operate. Selection is
verified server-side before any operational data loads.

## Non-goals

V2-003.003 auto-resolution workflow · V2-003.004 cookie persistence (no cookie
writes, no cookie-writing Server Action) · V2-003.005 cross-tab sync · V2-004 ·
V2-005 location-scoped RLS/permissions · V2-008 backfill.

## URL selection contract (temporary, no persistence)

`/r/<org-slug>?location=<location-uuid>`

The parameter is a **preference, not an authorization token**. Only `/r/[slug]`
reads it (`/` stays statically prerenderable and never accepts it).

Precedence (documented in `domain/active-context.ts`):

1. The route slug fixes the organization scope.
2. An explicit location is validated **inside that organization** against the
   canonical eligible set (`listEligibleContexts` → `resolveUserAccess`).
3. A valid explicit selection supersedes any cookie for **that request only**,
   including a cookie that names another organization or is malformed.
4. No explicit selection → V2-003.001 behavior unchanged (an unrelated
   cookie/route mismatch still returns `invalid_context`).
5. Malformed (non-UUID, empty, repeated), unknown, other-tenant, inactive,
   archived or revoked selections → `invalid_context` (fail closed). An invalid
   explicit selection is **not** rescued by the cookie; no arbitrary eligible
   location is ever substituted.
6. An explicit selection without a route organization → `invalid_context`.
7. An unknown/unauthorized route slug → `no_access` (no tenant enumeration).

## Switcher candidates

`listCurrentEligibleContexts()` (data layer) gathers the same authenticated,
RLS-bound facts as the resolver and runs the pure `listEligibleContexts`.
Overall roles see eligible tenants without synthetic memberships; scoped users
only assigned locations; inactive/archived/revoked/unknown-role grant nothing;
a query failure returns `error` (the page flags `availableContextsFailed`; the
switcher degrades to a read-only indicator rather than an empty list). It does
**not** use `getCurrentUserAccessibleLocations()`. The client model is
display-safe (ids, names, slug, time zone only).

## UI

- Header (real mode only): org name over location name + chevron. Desktop: in
  the left cell next to the brand; countdown pill untouched. Mobile/tablet: in
  the first row (brand text becomes `sr-only` only when the switcher shows);
  menu is a bottom sheet (`max-h-70dvh`) below `lg`, a popover at `lg`+.
- One eligible location → plain indicator, no menu. Demo mode → nothing.
- Menu: `role=menu`, groups per organization, `menuitemradio` with
  `aria-checked`, check mark **and** "Current" text, Arrow/Home/End, Escape
  (focus returns), outside-pointer dismissal, ≥44px targets, visible focus.
- Selection navigates to `/r/<slug>?location=<id>` carrying only `?tab=`;
  `recipe`/`mode` detail ids are dropped. Tab clicks keep `?location=` via
  `tabHref` (back/forward restore it from the URL).
- While the transition is pending the previous workspace is `hidden`/`inert`
  and a "Switching to …" status is shown.
- `ContextUnavailableNotice`: `selection_required` and `invalid_context` list
  the user's verified contexts (grouped) and navigate with the explicit
  location; `invalid_context`/failure also offer "Try again" (revalidates);
  `error` is retry-only; `no_access` unchanged (login screen).

## Client-state isolation

`ContextScopeBoundary` keys the shell by verified `profileId + organizationId

- locationId` (+ the existing sign-in epoch). Any change discards all
  location-specific state and in-flight continuations and re-seeds from the new
  server props. The URL is never the authority; appearance preference lives
  outside this state.

## Known limitations / dependencies (recorded, not fixed here)

- **V2-005 (release dependency):** several operational tables enforce
  organization-based RLS, not location-assignment RLS (hosted DEV showed a
  Location-B-only manager reading Location-A tip-pool rows via PostgREST). The
  switcher only governs what is _offered and initially hydrated_; it does not
  provide database-level isolation and the UI makes no such claim.
- **Write path:** existing Server Actions/loaders outside the three initial
  loaders still resolve their location through the legacy primary-location
  path, not the explicit selection. Making module actions follow the active
  location belongs with V2-003.004/V2-005; until then, the selected location
  governs the hydrated Schedule/Tips/Allocation data and display.
- **V2-008:** location-assignment backfill for legacy staff.
- Selection is not persisted: a reload keeps it (URL) but a fresh visit to
  `/r/<slug>` re-resolves (V2-003.004/.003).

## Verification

Vitest (resolver/loader boundary on an RLS-emulating double, navigation,
component a11y, state isolation) · Playwright demo regression · hosted DEV
real-JWT check of `?location=` (**pending — local handoff**). See TEST_MATRIX.md
and EVIDENCE.md.
