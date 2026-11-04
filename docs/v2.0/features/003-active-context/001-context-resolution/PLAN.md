# V2-003.001 — Active Organization / Location Context Resolution — Plan

Parent Feature: [V2-003](../README.md) · Program #248 · Feature #251 · Issue #283 · Milestone #8
Branch: `feature/v2.0-003.001-context-resolution` (from `origin/development` `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`) · target: `development`

## 1. Outcome

One canonical, server-authoritative answer to: **which organization and location is this authenticated user currently allowed to operate?**

The answer is built from verified database facts. A cookie, route slug, browser value or "last used" preference is never proof of authorization. This subfeature is the server foundation for later context switching (V2-003.002–.005).

## 2. Scope

Implemented:

- Typed `ResolvedActiveContext` + discriminated `ContextResolutionResult` (`resolved | selection_required | unauthenticated | no_access | invalid_context | error`).
- Pure domain resolver on top of the canonical authorization resolver (`resolveUserAccess`) — **no parallel permission engine**.
- Server loader using the request-scoped RLS client and `supabase.auth.getUser()`; every query error is an `error`, never an empty success.
- Read-only active-context cookie contract (`lineup_active_context`, JSON v1).
- Route-slug / cookie precedence contract (below).
- `loadPageData` integration: the three initial loaders (schedule, tips, allocation) receive the **same** verified `(organizationId, locationId, timeZone)`.
- Entry-user hydration that works for Overall roles with no organization membership (`getEntryUser`).
- Minimal non-interactive context-unavailable state.

Not implemented (deferred): switcher UI (.002), auto-selection workflow (.003), cookie persistence/writes (.004), cross-tab sync (.005), module flags (V2-004), full module scoping of actions/follow-up reads (V2-005), attendance/kiosk, role management.

## 3. Resolved context contract

```ts
interface ResolvedActiveContext {
  organizationId;
  organizationSlug;
  organizationName;
  locationId;
  locationName;
  timeZone; // validated IANA zone
  profileId; // server-verified, never client supplied
  access: AccessResolution; // canonical resolver output for exactly this pair
  selectedBy: "cookie_preference" | "sole_eligible_location";
}
```

Files: `src/features/context/domain/active-context.ts` (pure), `…/context-cookie.ts` (pure), `src/features/context/data/active-context.ts` (loader), `…/context-cookie-reader.ts` (read-only cookie access). `AvailableContextSummary` is the display-safe shape reusable by V2-003.002.

## 4. Eligibility (a pair is eligible only if ALL hold)

location exists · `location.organization_id` = organization · `active = true` · `archived_at IS NULL` · valid IANA time zone · canonical `resolveUserAccess({org, location, overallRole, orgMembership, locationAssignment})` is `allowed` with `location:access`.

An Overall role holder needs no membership/assignment rows (no synthetic rows are invented). A scoped user needs an **active** organization membership **and** an **active** location assignment. Unrecognised stored role strings (Overall or location) grant nothing (the legacy mapper coerced an unknown location role to `staff`; this loader drops the row instead).

## 5. Precedence contract (route vs cookie)

1. The **route slug** (`/` uses `NEXT_PUBLIC_RESTAURANT_SLUG ?? "the-monks"`) fixes the organization scope. It is resolved through RLS-visible organization data; an unresolvable slug → `no_access` (no tenant enumeration).
2. The **cookie** is only a location preference _inside_ the scope the route fixed. A cookie naming a different organization than the route → `invalid_context` (`cookie_route_organization_mismatch`) **even if the user is authorized in both**. Cross-tenant data is never loaded under another tenant's route.
3. A **malformed** cookie → `invalid_context` (`cookie_malformed`), rejected before any tenant query. It is not silently ignored.
4. A well-formed cookie whose pair is not (or no longer) eligible is **stale** → `invalid_context` (`cookie_location_unavailable` / `cookie_organization_unavailable`). No fallback to an unrelated location.
5. **No cookie:** exactly one eligible location in scope → `resolved` (`sole_eligible_location`, a bounded legacy-compatibility rule — see §7); more than one → `selection_required` (deterministic order by organization/location name then id); none → `no_access`.
6. Creation order is **never** used to choose a context.

Without a route slug (not used by the current routes, supported for V2-003.002+): the cookie's organization must itself be a verified visible candidate; with neither, all eligible contexts across the user's organizations are offered (`selection_required`, or `resolved` if exactly one).

## 6. Role authority consistency audit (Org Owner/GM, Overall)

| Source                                                        | Org Owner/GM with **no** location assignment                                                          | Overall roles                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `resolveUserAccess` / `resolveCurrentUserAccess` (V2-001.006) | **Denied** for a location target (`NO_LOCATION_ASSIGNMENT`); `org:admin` only when no location target | Allowed everywhere, tiered capabilities |
| `getCurrentUserAccessibleLocations` (V2-002.002)              | **Lists every active org location**                                                                   | Lists every active org location         |

Locked docs side with the resolver: ACCESS_MODEL §4.2/§5 rules 4–5 ("no assignment and no Overall role ⇒ DENIED"; "belonging to Liquor Tap does NOT grant other locations"), V2-D019, resolver tests ORG-005/LOC-006. **Decision:** the canonical resolver is the single authority for context eligibility; the context loader does **not** use the reader's Org Owner/GM shortcut. No resolver, reader or schema change was needed, no implicit membership rows are created, and ordinary staff are not elevated. `getCurrentUserAccessibleLocations` has no production callers; a characterization test (CTX-11) pins the divergence so the V2-003.002 switcher consumes `listEligibleContexts`/the resolver result rather than that reader.

**Release dependency / owner decision flag:** an Org Owner/GM who has not been assigned to a location therefore cannot _operate_ a location (they can still administer organizations/locations/assignments through Location Administration, which is RLS/RPC-authorized separately). The V2-008 location-assignment backfill must run before promotion so existing pilot members keep access. If the owner prefers "Org Owner/GM operate every org location", that is a **Decision change** (DECISIONS.md) touching the resolver and its locked tests, not a context-resolution detail.

## 7. Legacy `getPrimaryLocation()` mitigation

`getPrimaryLocation(organizationId)` (oldest location, `limit 1`) guarantees none of: active, un-archived, assigned, selected, route-matching. It is **eliminated from the application-entry path**: `loadPageData` never imports it and passes the verified scope to every loader via `locationForLoader` (fails safe with `null` if the scope's organization differs). Direct callers (module server actions, week/date follow-up reads, tasks, bar-inventory, tips and allocation actions) are intentionally unchanged and **isolated** behind a doc-commented legacy helper until V2-005. Remaining legacy call sites (audited): `schedule-data.getWeekScheduleData`, `tasks-actions`, `tasks-data`, `task-history-data`, `opening-reminder-prompt-data`, `tips-actions`, `inventory-actions` (×2), `order-draft-actions`, `import-actions`, `catalog-data`, `history-data`, `allocation-actions`.

Bounded legacy compatibility (needed so today's single-location pilot keeps working without a switcher): unique eligibility only, explicit, tested (`CTX-02`, `CTX-18`). V2-003.003 generalizes/replaces it.

## 8. Entry integration

`loadPageData(slug)`: demo mode short-circuits first (no hosted call, no cookie read) → `resolveCurrentActiveContext({ routeSlug })` → only `resolved` hydrates the user (`getEntryUser`) and runs the three loaders with one scope. `selection_required | invalid_context | error` render `ContextUnavailableNotice` (non-interactive, no data). `unauthenticated | no_access` keep the existing signed-out/login presentation. `PageData` also exposes `contextStatus`, `activeContext`, `availableContexts`, `contextReason` for V2-003.002.

`getCurrentUser(slug)` is unchanged (still used by passcode and module actions); `getEntryUser` only reads display facts for an already verified context and applies the same role/designation mapping (`entryDesignation` = legacy membership designation, raised to the Overall tier when present).

## 9. Data / authorization / migration

Reuses existing tables, RLS and the canonical resolver. **No migration**, no new table, no applied migration edited, no service-role client. RLS dependency verified from migrations: `organizations`/`locations` are readable by Overall holders and active org members; own `memberships` (active) and own `location_memberships`/`overall_roles` rows are readable. Hosted-DEV verification of these read paths with real JWTs is **not** claimed here (see EVIDENCE.md).

## 10. Risks and known limitations

- Follow-up reads/actions (week navigation, writes, tasks, inventory, …) still choose a location via the legacy helper. For a user whose single eligible location is _not_ the organization's oldest location, entry data and follow-up reads can disagree until V2-005. Production orgs have one location today.
- `no_access` and `unauthenticated` both show the login screen (pre-existing presentation); better messaging belongs to V2-003.002/.003.
- No cookie writer exists yet, so a malformed/stale cookie (which is rejected) can only come from manual tampering until V2-003.004 adds write/clear.
- Overall users without membership are hydrated at entry, but `getCurrentUser`-based module actions still return signed-out for them (V2-005).
- The roster (`getOrganizationRoster`) is organization-wide; location scoping is V2-005.

## 11. Tests

Vitest only (no schema change): domain cookie contract; data-boundary matrix CTX-01…22 against an RLS-emulating in-memory client (real loader + real canonical resolver); `loadPageData` integration; real loaders honoring the scope; static guards; entry component states. See TEST_MATRIX.md.

## Codex build prompt

Not applicable — implemented by Claude Code Cloud on explicit instruction (division of responsibility changed by the owner for this subfeature).
