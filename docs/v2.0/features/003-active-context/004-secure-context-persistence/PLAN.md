# V2-003.004 — Secure Active Context Persistence

Issue #290 · Parent #251 · Program #248 · Milestone #8 · Branch `feature/v2.0-003.004-secure-context-persistence` (from `development` `398393bfa4f0a8edb5b99f33b78574960d74666a`). No migration. `main` and Production untouched.

## 1. Outcome

A user selects an authorized organization/location, keeps it across navigation and browser restarts, and every later operation runs in the same **server-verified** context. The browser `Referer` is no longer the source of operational context. The persisted value is a _preference_, never an authorization grant.

## 2. Cookie contract (reused — no second context system)

| Item    | Value                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name    | `lineup_active_context` (`ACTIVE_CONTEXT_COOKIE_NAME`)                                                                                                                                                                                                           |
| Format  | `{"v":1,"o":"<org uuid>","l":"<location uuid>"}` — `serializeActiveContextCookie` / `parse…` (unchanged)                                                                                                                                                         |
| Content | Two ids only. No tokens, roles, permission flags, personal data or cached authorization.                                                                                                                                                                         |
| Attrs   | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (7 days), **no `Domain`** (host-only), `Secure` in production                                                                                                                                             |
| Secure  | Always for production traffic. Exempt only for a loopback host (`localhost`, `127.0.0.1`, `[::1]`) that is not explicitly HTTPS (local `next start`, CI; WebKit refuses `Secure` there) and in non-production builds. Derived from the request, not from a flag. |
| Central | `domain/context-cookie.ts`: `activeContextWriteOptions`, `activeContextClearOptions`, `shouldUseSecureCookie`. Write, renew and clear share one scope/attribute set.                                                                                             |
| Writer  | `data/context-cookie-writer.ts` is the **only** writer (static guard in `entry-boundary.test.ts`). It throws during a render, so no cookie write can happen in an ordinary GET.                                                                                  |
| Storage | No `localStorage`/`sessionStorage`/`document.cookie`. Client JS can neither read nor write the cookie.                                                                                                                                                           |

**Lifetime / renewal policy.** 7 days, **fixed** from the last verified selection or verified deep-link reconciliation. It is deliberately not sliding: renewing from unrelated requests (e.g. the proxy) would race with a concurrent selection and could resurrect a superseded preference. Expiry costs a multi-context user one re-selection (a single-context user nothing). Cookie expiry never replaces authentication, and a live cookie never operates a location without a valid Supabase session (every request re-resolves through `auth.getUser()`).

## 3. Server actions (`features/context/actions/context-actions.ts`)

`setActiveContextAction({ organizationId, locationId, tab? })` — POST Server Action (Next's built-in origin protection applies; no custom CSRF; no GET side effects).

1. Strict schema: exactly two UUIDs (+ optional `[a-z0-9_-]{1,32}` tab token); anything else → `invalid_request`, no DB access.
2. `supabase.auth.getUser()` via the request-scoped RLS client (no service role). No session → `unauthenticated`; auth/db outage → `unavailable`.
3. The pair must appear in `listCurrentEligibleContexts()` — the same RLS facts and the same canonical `resolveUserAccess` + `location:access` the entry path uses: location exists, belongs to the organization, `active`, not archived, valid time zone, active membership **and** active assignment (or Overall role without synthetic rows). Unknown/foreign/inactive/archived/revoked/mismatched → one coarse `not_available` (no tenant enumeration).
4. Only then the cookie is written. A failed selection **never** touches the previous cookie (no overwrite, no clear).
5. Returns a server-built destination (`contextSwitchHref` of the verified summary) — no open redirect, no user-controlled path/domain/cookie attribute.

`clearActiveContextAction()` — requires a verified session; expires the cookie with identical attributes. Clearing grants nothing: the next request resolves from verified facts (sole eligible → resolves; several → selection required; none → denied). It never selects "the first available location".

## 4. Sign-in / sign-out

- `POST /api/auth/signout`: `auth.signOut()` then **always** expires the context cookie, even if sign-out throws/errors (reports `500 {ok:false}`, no token/credential in logs or body; `Cache-Control: no-store`).
- `POST /api/auth/passcode` and `/api/auth/register`: a successful sign-in expires the cookie. A fresh sign-in therefore never inherits a previous user's workspace (shared device), even when both employees are authorized for the same location: the documented fresh-sign-in rules apply (single-context auto-resolution, or explicit selection).
- Ordering race: `lib/client-sign-out.ts` tracks the in-flight sign-out (including forced sign-outs after a revoked session); the login screen awaits `settleSignOut()` before posting a passcode, so a delayed sign-out can never land after the next sign-in.
- After sign-out the workspace is replaced by the login screen and its state is discarded (`ContextScopeBoundary` keyed by verified profile + organization + location + epoch). A revived back/forward page has no session: every action re-authenticates and fails.

## 5. Operational context — replacing the `Referer`

`getPrimaryLocation(organizationId)` (central; used by schedule/tips/allocation/tasks/inventory actions and follow-up reads):

1. Cookie present & well-formed → it must name **this** organization and resolve **now** through the canonical resolver (`resolveCurrentActiveContext`). Other organization, stale, revoked, archived, malformed, unsupported version, query/auth failure → `null` (safe denial, never a substitute location).
2. No cookie → the caller's single canonical eligible location in the organization (V2-003.003); zero or several → `null`.
3. Time zone always comes from the verified location row.

`Referer` is **not** a source. It is parsed (`domain/request-consistency.ts`) as a **reject-only consistency signal**: if a same-origin workspace URL carries an explicit `?location=` that differs from the verified context (different slug or location, malformed, repeated, undecodable), the request fails closed. A missing/cross-origin/non-workspace `Referer` changes nothing; it can never select, widen or substitute a location (guarded statically and by tests). `Origin`, `Host`, query parameters and client-supplied ids are never authorization.

## 6. Precedence and deep-link reconciliation

Unchanged for the page render (V2-003.002): the route slug fixes the organization; an explicit `?location=` (validated) supersedes the cookie **for that render only**; invalid explicit input fails closed; without it the cookie is validated.

New contract — _an explicit URL selection and the persisted selection can never disagree while operations are enabled_:

1. `loadPageData` flags `contextReconcile` when the page resolved via explicit selection and module actions would otherwise resolve differently: cookie names another pair/organization, is malformed, or is absent while the organization has several eligible locations. (No flag for a valid cookie preference, for a sole eligible location, or for demo.) The GET render writes nothing.
2. `ContextReconcileGate` keeps the workspace **unmounted** ("Confirming your location…") and calls `setActiveContextAction` with the verified ids. Only after the server re-verified and persisted the pair does the workspace open. On refusal/network failure it stays closed with _Try again_ / _Choose a location_ (clears the saved preference and returns to the organization route). Nothing is ever shown as active before the server confirmed it.
3. Once open, the gate canonicalizes `/r/<slug>` to include `?location=<verified id>` (`history.replaceState`), so every later Server Action carries the location on screen. Combined with §5, a stale tab, a browser back/forward entry or a second tab that switched workspace is **refused** instead of silently operating on the other location.
4. Authorized deep links keep working (one brief confirmation); unauthorized ones fail closed exactly as before; a revoked deep-linked location never persists.

## 7. Switcher

`useContextSwitch` (header switcher and the recovery notice share it): switching state → `setActiveContextAction` → only on success navigate to the returned destination → server re-resolves and re-loads → shell re-keyed. On failure nothing navigates, the old cookie/workspace is untouched, an alert is shown. Concurrent selections are ignored (`inFlight` guard + disabled controls). Design, keyboard/touch behavior, countdown pill and weighted navigation are untouched. `ContextUnavailableNotice` gains an explicit **Clear saved location** for `invalid_context` (a malformed/stale cookie with no other eligible context would otherwise be a dead end).

## 8. Stale / revoked / failing contexts

| Situation                                                            | Result                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Membership/assignment revoked, location deactivated/archived/removed | next request `invalid_context`/denied; actions `null`; picker offered |
| Malformed / unsupported-version / expired cookie                     | malformed → `invalid_context`; expired = absent → selection rules     |
| Expired/revoked session                                              | `unauthenticated`; cookie ignored                                     |
| Auth outage / query failure                                          | `error`/`unavailable` — never an empty success                        |

An invalid cookie is never auto-repaired with a different location; only an explicit authorized selection replaces it.

## 9. Compatibility

Single-context users still enter without a picker and need no cookie; the `/` → `/r/<slug>?location=` redirect is unchanged; multi-organization users (Monks/NASA ↔ Liquor Tap/Downtown) switch through the verified action; role differences between locations never merge (tests PERSIST-10/36). Demo mode never reads or writes the cookie and never calls hosted Supabase.

## 10. Out of scope / still open (not fixed here)

- **V2-003.005** — full cross-tab/stale-context broadcasting. Baseline wrong-location protection (§5/§6.3) is in.
- **V2-005** — direct-PostgREST cross-location RLS, server-authoritative binding of module-specific `locationId` parameters, module-by-module scoping. **This PR does not fix the known direct-PostgREST cross-location RLS gap; it remains a Production release blocker.** Actions that take a `locationId` argument are not audited/hardened here.
- **V2-008** — legacy assignment/membership backfill (no implicit assignment rows created; Org Owner/GM without an assignment still cannot operate a location).
- Back/forward restored from the router cache (no refetch) shows a stale view; its actions fail closed (no wrong-location write) but without a dedicated message — improved by .005.
