# V2-003.005 — Multi-Tab / Stale Context Safety

Issue #295 · Parent #251 · Program #248 · Milestone #8 · Branch `feature/v2.0-003.005-multi-tab-context-safety` (from `development` `fc9c6680c34a68cf627939dce9fb8ad1b991295e`). No migration. `main` (`5e5b7747…`) and Production untouched.

## 1. Outcome

A tab never silently operates against a different restaurant location (or a different employee) from the one its interface displays. When another tab changes the shared context, this tab learns quickly (UX), blocks its workspace, and offers safe recovery — and independently of whether it ever learned, the **server refuses** a protected mutation whose visible context disagrees with the server-authorized one.

> A browser notification is a UX signal. It is never an authorization mechanism.

## 2. Existing failure mode (reproduced in V2-003.004)

1. Tab A shows Location A; Tab B switches the shared HttpOnly cookie to Location B.
2. Tab A submits a Tasks mutation. Server Actions POST from the page URL, so `Referer` _would_ name `?location=A` and `getPrimaryLocation()` would refuse — but a stripped/absent `Referer` (privacy extension, `Referrer-Policy: no-referrer`, proxy) is "neutral" in `request-consistency.ts`.
3. `getPrimaryLocation()` resolves the verified cookie → B and `task_create` runs at **B** while Tab A displays **A**.

Shared-cookie implications: the cookie jar is shared by all tabs of one browser profile, and `Set-Cookie` from any tab's Server Action is visible to every tab's **next** request. Each request carries the cookie as of the moment it was sent. Separate browser profiles/devices have independent sessions and cookies; there is no organization-wide "current location" anywhere server-side, and none is introduced.

## 3. Server-side consistency contract (primary defense)

`WorkspaceExpectation = { profileId, organizationId, locationId }` — three UUIDs, strict schema (no extra keys). It is the **workspace the rendered UI was built for**, taken from the server-verified page props (`ResolvedActiveContext` → `activeContext` + `initialUser.profileId`).

Rules:

1. The expectation is an **untrusted consistency assertion, never authority**. It cannot select, widen or substitute a location, role or identity.
2. For a protected action the server independently resolves: the authenticated session (`getCurrentUser` → verified `profileId`/`organizationId`) and the operational location (`getPrimaryLocation`: verified persisted cookie, or the sole eligible location; canonical resolver; revoked/inactive/archived/cross-org ⇒ `null`).
3. The action proceeds **only if** `expected.profileId === session profile`, `expected.organizationId === caller organization` **and** `expected.locationId === the verified operational location`. The _verified_ location (never the asserted one) is what is passed to the database.
4. Missing/malformed expectation ⇒ `That request is invalid.` (fail closed, no mutation, no DB access beyond auth). Mismatch or unresolvable context ⇒ `contextStale: true` + the stale-context message, **before** the RPC. Nothing is substituted.
5. `Referer` remains a reject-only extra signal inside `getPrimaryLocation`; it is no longer the only protection.

Implementation: `features/context/domain/workspace-expectation.ts` (pure schema + drift classification), `features/context/data/workspace-expectation.ts` (`assertWorkspaceExpectation` for actions, `verifyWorkspaceContext` for the guard), `verifyWorkspaceContextAction` (read-only Server Action, writes nothing).

**Applied in this phase:** `runTaskCommandAction` (every command; expectation **required**), plus `getTasksSnapshotAction` and `getTaskHistoryAction` (so a stale tab never renders another location's tasks under its own label).

**Not applied (explicit — classified in the security report):** every other module action (`schedule`, `tips`, `allocation`, `bar-inventory`, `recipes`, `team`, reminder prompt, notifications mark-read). They still resolve from the session + persisted cookie via `getPrimaryLocation`, so a stale tab with a stripped `Referer` can still operate at the persisted location. The reusable helper makes V2-005 a mechanical change; it is **not** claimed fixed here.

## 4. Browser coordination (UX, never authority)

`features/context/domain/context-sync.ts` + `components/context-sync-channel.ts`:

- BroadcastChannel `lineup:active-context:v1`. Message `{ v:1, type, source, at }`, `type ∈ context_changed | context_cleared | session_changed | signed_out`, `source` = per-tab random id (ignore own). **No** organization/location ids, no tokens, no cookie contents. Unknown/malformed messages are ignored.
- Published only **after** the server confirmed: successful `setActiveContextAction` (switcher, deep-link reconcile, "Choose a location"), successful `clearActiveContextAction`, finished sign-out POST, successful passcode sign-in. A failed switch publishes nothing.
- Receivers never copy anything from a message and never publish in response (no loops); a message only schedules a **server** verification (§5).
- One lazily created channel per document; subscribers add/remove listeners; unsupported/blocked `BroadcastChannel` ⇒ silently no-op (focus/visibility/pageshow/online reconciliation and the server guard remain). No `localStorage` fallback is implemented (nothing to store; no auth material in web storage).

## 5. Stale detection and invalidation (`ContextSyncGuard`)

Mounted only around the **signed-in** real-mode workspace (login screen, demo mode, selection/no-access screens never mount it). Triggers → `verifyWorkspaceContextAction(expected)`:

| Trigger                                                    | Throttle                   |
| ---------------------------------------------------------- | -------------------------- |
| Broadcast message from another tab                         | none (coalesced in-flight) |
| `focus`, `visibilitychange→visible`, `online`              | ≥ 5 s since last check     |
| `pageshow` with `persisted` (bfcache) / recent history nav | none                       |
| A Tasks action returns `contextStale`                      | none                       |
| Mount after a history traversal                            | once                       |

No timers/polling. One in-flight verification; a trigger arriving mid-flight queues exactly one follow-up. Result `consistent | stale(reason) | signed_out | unavailable`; `unavailable` (auth/db outage) never marks a tab stale and never clears an existing stale state (server still guards writes).

When stale the whole workspace is **unmounted** and replaced by one panel (`role="alert"`, focus moved to the primary action): no operational content, no mutation controls. Reasons: `location_changed`, `access_changed`, `different_user`, `signed_out`. Never "No location is set up yet."

Recovery:

- **Refresh workspace** — `router.replace(currentPath [+ ?tab=…])` **without `?location=`** then `router.refresh()`, then a fresh state epoch. Dropping `?location=` is essential: the app canonicalizes the address bar to `?location=<shown>`, and refreshing that URL would be read as a deliberate explicit selection and **overwrite the cookie back to the stale location**. The server re-authenticates, re-checks eligibility, resolves the persisted context and re-loads every location dataset; `ContextScopeBoundary` re-keys on the verified ids.
- **Choose a location** — inline list of the user's eligible contexts → the existing `setActiveContextAction` (`useContextSwitch`). Offered only for `location_changed`/`access_changed` and only if the list loaded. The server decides; nothing unauthorized opens.
- `signed_out` / `different_user` offer only the reload action and show no names/ids.

## 6. History / reload / back-forward

The deep-link reconcile gate (V2-003.004) persists an explicit `?location=` automatically, which is right for a **fresh navigation** (typed/bookmarked/shared link) but wrong for a **reload or back/forward**: the URL there was planted by the app's own canonicalization or is an old history entry, so persisting it would silently reinstate a previous context and make the other tab stale (cookie ping-pong).

New rule (`history-traversal.ts`): if the reconcile mount follows a `popstate` (SPA back/forward) or the document load is `reload`/`back_forward`, the gate does **not** write. It shows "This page is for _X_" with **Switch to X** (deliberate, server-verified, publishes) and **Stay on current location** (navigates to the URL without `?location=`). Fresh navigations are unchanged. A traversal that lands on a cached workspace (no reconcile flag) is caught by the guard's mount-time verification. `history.replaceState(null, …)` in the gate is kept: Next 16 patches it to carry router history state (verified in `app-router.js`); `?tab=` handling is untouched and no extra history entries are created.

## 7. Race handling

| Race                               | Handling                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A rapid selections                 | existing `inFlight` ref in `useContextSwitch` (unchanged, tested)                                                                                                                                                  |
| B two tabs switch at once          | last cookie write wins; every tab re-verifies against the server instead of trusting the last broadcast; the loser is stale until recovery                                                                         |
| C mutation in flight during switch | a request carries the cookie at send time: sent before the switch ⇒ executes at A (what the user saw); sent after ⇒ expectation A ≠ cookie B ⇒ refused before the RPC. Verified by DB row counts at both locations |
| D switch fails                     | publish is in the success branch only; cookie untouched (V2-003.004)                                                                                                                                               |
| E sign-out during switch           | `requestSignOut`/`settleSignOut` ordering untouched; an in-flight select after sign-out is `unauthenticated` (no write/no publish)                                                                                 |
| F different employee signs in      | expectation carries `profileId`; verify ⇒ `different_user`; Tasks writes/reads refuse; old workspace is unmounted                                                                                                  |
| G revoked assignment               | next verify/protected request resolves through the canonical resolver ⇒ `access_changed` / refused; a broadcast cannot restore access                                                                              |
| H tab closed mid-switch            | no timers/pending listeners (effect cleanup); persisted state is whatever the server committed; peers re-verify on focus                                                                                           |

## 8. Scope boundaries versus V2-005

Achieved here: cross-tab synchronization + stale-workspace UX, history-safe reconciliation, and a server-verified pre-mutation consistency check on the Tasks mutation/read path with a reusable helper.
**Not** achieved (V2-005): comprehensive location binding of every module action, location-scoped RLS (direct PostgREST cross-location access remains a known gap), and any claim that other modules are protected against a stripped-`Referer` stale tab. Production must not be released on V2-003 alone.

## 9. Security acceptance criteria

1. Expected A + persisted B ⇒ Tasks mutation refused with **zero** rows at A and B (with and without `Referer`).
2. A forged/mismatched expectation never grants access; missing/malformed ⇒ refused.
3. Revoked/cross-organization/different-employee ⇒ refused.
4. Correct single-location user and deliberately selected B continue to work and write only at the verified location.
5. No broadcast message is read as an id; no cookie write is caused by a received event or by Refresh.
6. Failed switch publishes nothing; sign-out publishes only after the POST settles.
7. Fixture cleanup returns DEV table counts to the recorded baseline.

## 10. Implementation notes — what validation changed (deviations from the first draft)

1. **Stale verdict carries the verified organization slug.** After another tab moves to a _different organization_, refreshing from `/r/<old-slug>` would land on an invalid-context screen. `WorkspaceVerdict.stale` now carries `organizationSlug` (from the resolved context the server verified — never from the assertion) and "Refresh workspace" navigates to that organization's route. Browser MT-15.
2. **"Choose a location" must also lift the block when the user picks the location the tab already shows** (the other tab moved away and the user moved it back). The workspace key is then unchanged, nothing remounts, and the first draft left the panel stuck forever. After the verified selection finishes navigating the guard re-checks and re-seeds (`onRecovered`). Found by browser MT-04; unit-tested.
3. **Tasks reads are guarded too** (snapshot, history), not only the write — otherwise a stale tab's own focus refresh would render the other location's tasks under its label. Because the Tasks controller re-reads on mount/focus and whenever `refresh`'s identity changes, a stale Tasks tab typically learns from a refused read within seconds, even with no broadcast; the write guard remains the backstop for anything that does not. (Pre-existing effect: `refresh` is re-created whenever the shell re-renders because `onSessionInvalid` is an inline function. Left unchanged — outside this phase.)
4. **Next.js runs Server Actions through a serial queue.** A pending action blocks every later action in that tab, so test doubles must reject (not hold) an action they want to suppress.
5. **Adjacent pre-existing defect fixed:** below the `lg` breakpoint the header switcher's bottom sheet lives inside the sticky header's stacking context and the fixed mobile navigation (`z-40`, later in the DOM) painted over its lower part, so location items could not be tapped on a phone. Fixed inside the switcher with bottom padding that clears the nav (`pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-2`). Covered by the narrow-viewport browser tests.
6. **Recovery consistency check uses the on-screen expectation.** After Refresh the guard re-asks the server; `consistent` re-seeds all client state (`onRecovered` = a fresh state epoch), anything else keeps the workspace closed with an explanation — never a loop.
