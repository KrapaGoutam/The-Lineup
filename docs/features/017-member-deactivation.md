# Feature 017 — Member deactivation and session kill

**Name:** Member deactivation and session kill
**Owner:** Krapa Goutam
**Status:** built and live-verified against the hosted project — see "Build notes" below
**Issue/PR:** (opened after this commit — see the PR description for the URL)

## Numbering note

Next free number after `016-passcode-management.md` — no collisions with any existing `docs/features/*.md`.

## What already exists — read before assuming this is greenfield

Confirmed by reading the schema and, for the two claims that couldn't be settled by reading alone, by testing directly against the real hosted project (throwaway accounts, deleted after) rather than assuming from Supabase's documentation:

- `memberships.active boolean not null default true` already exists. It is not just a display flag — `private.has_org_role(org_id, roles[])`, the function nearly every RLS policy in this schema calls to authorize a request, requires `memberships.active` to be true (`supabase/migrations/20260905065702_initial_schema.sql:395`). **This means flipping `active` to `false` on a membership already, today, with zero new RLS policy, blocks that person from every RLS-gated read and write across the entire schema** — schedules, allocation, tips, team, everything gated through `has_org_role`. This is the foundation the whole feature builds on, not something 017 has to create.
- `passcode_credentials.active` also already exists and is already checked at the locator-lookup step of login (`/api/auth/passcode/route.ts`, `.eq("active", true)` on the credential select) — flipping it to `false` independently blocks that passcode from ever resolving to a credential at the very first step of sign-in, before `verifyPasscode` is even reached.
- `memberships_update_manager`'s RLS policy is a whole-row policy with no column restriction — an owner/general_manager already has the raw RLS permission to update `active` the same way they update `roles`. This feature doesn't need a new RLS policy for that column. It uses the admin client anyway (below) because two of the three writes this feature needs to make together require it regardless.
- **Live-tested against the hosted project, not assumed**: `admin.auth.admin.updateUserById(userId, { ban_duration: "24h" })` immediately invalidates an already-issued, unexpired access token at the **GoTrue layer** — a `supabase.auth.getUser()` call using that exact same still-valid token, made right after the ban, returns `"User is banned"` instead of succeeding. `getCurrentUser()` (`src/lib/current-user.ts`) calls exactly this method, so **any Server Component render, Server Action, or Route Handler that runs after a ban is applied will treat that person as signed out on its very next call, with no dependency on the token's own expiry.**
- **Also live-tested, and this is the part that changes the design**: that same still-valid, banned token was then used to make a **direct PostgREST/RLS read** (`supabase.from("memberships").select(...)`), and it **succeeded** — ban status is not checked at the RLS/data layer at all, only at GoTrue's own `/user` and `/token` endpoints. A ban alone does **not** stop an in-flight, already-authenticated data request from a client library that never calls `getUser()` in between. This is exactly why `memberships.active` (which RLS _does_ check, on every single query) is the layer doing the real protective work, and the ban is what closes the _identity_ gap (this app's own `getCurrentUser()` calls, and any future login attempt), not the _data-access_ gap (RLS already owns that, unconditionally).
- `audit_events` is generic and already used for finalize/reopen-tips, lockout resets, and passcode change/reset — fits a deactivation/reactivation record with no schema change.
- `canChangeDesignation` (`src/features/team/domain/designations.ts`, Feature 014, reused again for passcode reset in Feature 016) is the established, twice-reused authorization predicate for "how sensitive is this personnel action" in this app.

## User outcome

Today, deactivating someone (a passcode reset, Feature 016) blocks their _next_ sign-in but does nothing about a session they're already in — the exact gap named when 016 shipped. This feature adds the actual offboarding action: **an owner or manager deactivates a member**, which:

- Blocks all future sign-in attempts for that person, immediately.
- Blocks every RLS-gated data operation for that person, immediately, even from an already-open, already-signed-in browser tab — no new access is possible into any table `has_org_role` protects, whether or not their session token has expired yet.
- Is reversible — a deactivated member can be reactivated by an owner or manager, restoring exactly the membership and passcode they had, without creating a new profile or losing their history (past shifts, tip records, audit trail).

## Scope

- **In**: a "Deactivate" action in the Team tab (owner/manager only, per the authorization boundary below), requiring a reason; a matching "Reactivate" action for an already-deactivated member; the three coordinated writes this needs (`memberships.active`, `passcode_credentials.active`, the Supabase Auth ban); an `audit_events` row for each direction; closing the "an open tab's next server interaction should cleanly sign them out" gap (see UX contract); demo-mode equivalents for both actions.
- **Out**: automatically reassigning or cancelling a deactivated member's future scheduled shifts — a manager does this manually, same as today, when someone's availability changes for any other reason. Proactively forcing an _idle_ open tab to react within seconds of deactivation, without the person doing anything at all (see "Decisions and risks" — this would need a standing Realtime subscription on every signed-in session, not just the allocation board's; named as a real, bounded residual gap, not silently accepted). Deleting the underlying Supabase Auth user or profile — deactivation is reversible by design, and `profiles.id references auth.users(id) on delete cascade` means deleting the Auth user would cascade-delete the profile and, transitively, orphan or null out historical shifts/tips/audit rows attributed to it. Changing anything about how an _already-inactive_ member's historical data (past shifts, past tip splits, past audit rows) is displayed — it stays exactly as visible/invisible as it already is today.

## Acceptance criteria

Written to the approved decisions above (best-effort/no-revert write handling, no Realtime kick for v1, reactivation in scope).

- [ ] Given an owner, when they deactivate any other member (including another manager) with a reason, then that member's membership and passcode credential both go inactive, their Supabase Auth account is banned, and they cannot sign in again with their old passcode.
- [ ] Given a general manager, when they attempt to deactivate an owner or another general manager, then the action is refused before any write happens (mirrors `memberships_update_manager`'s existing `using` clause, same predicate Feature 016 already reuses for reset).
- [ ] Given a shift_manager (Assistant Manager) or a server, when they attempt to deactivate anyone, then the action is refused entirely — no option is shown in the UI at all (matches `assignableDesignations`/the reset button's existing hide-not-disable pattern).
- [ ] Given any actor, when they attempt to deactivate themselves, then the action is refused, client-side and server-side, regardless of role.
- [ ] Given a deactivation submitted without a reason, then the action is blocked client-side and server-side (matches reset's existing convention).
- [ ] Given a member who is already signed in on a device when they're deactivated, when they next take any action that reaches the server (a Server Action, a Route Handler, a fresh page load), then they are cleanly signed out and returned to the passcode screen — not shown a raw error banner.
- [ ] Given a deactivated member, when anyone (including that member, using their old credentials) attempts to sign in, then it fails with the same generic "Passcode not recognized" message a wrong passcode gets — deactivation is not distinguishable from a wrong guess by the response.
- [ ] Given a deactivated member, when an owner or manager reactivates them (with a reason) without changing their passcode, then they can immediately sign in again with the exact passcode they had before deactivation, and their prior shift/tip/audit history still shows them correctly.
- [ ] Given any successful deactivation or reactivation, then exactly one `audit_events` row is recorded (actor, target, action, reason).
- [ ] Given demo mode, when a manager deactivates or reactivates someone, then the `demoAccounts` map and the roster reflect it for the rest of the session, consistent with how designation changes and passcode reset already behave in demo mode.

## UX contract

- **Entry point**: a new "Deactivate" action per row in the Team tab, next to the existing "Reset passcode" action, rendered only for rows the signed-in actor is allowed to deactivate (same `canChangeDesignation`-gated hide pattern reset already uses) — and never rendered on the actor's own row, regardless of role. An already-inactive member's row shows "Reactivate" instead, with no other actions (a deactivated member can't be reset, promoted, or demoted while inactive — reactivate first).
- **Desktop / host tablet / server mobile**: same small centered modal pattern as the reset dialog — a reason field, a clear "this immediately blocks their access" statement, confirm/cancel.
- **Loading**: pending label on submit ("Deactivating…" / "Reactivating…"), matching every other dialog in this app.
- **Empty**: n/a.
- **Error**: inline `aria-live` text — missing/short reason, self-target attempted, target not found or already in the requested state.
- **Success**: dialog closes with a brief confirmation; the row updates in place to reflect the new state and its now-available action.
- **Permission denied**: the action is not rendered at all for a target the actor isn't allowed to touch, or for the actor's own row — never shown-then-disabled, matching every other personnel action in this app.
- **The "already signed in elsewhere" gap, closed at the application layer**: every Server Action and Route Handler that calls `getCurrentUser()` and gets `null` back for a request the client believed was authenticated returns a distinct, recognizable signal (not just a generic error string) that the client-side code already checks for and reacts to by clearing local session state and returning to the passcode screen — the same clean flow as clicking "Sign out," not an error banner someone has to dismiss and figure out on their own.
- **Keyboard/screen reader**: same as every existing dialog — labeled inputs, `aria-live` errors, a named close control, focus trapped inside the dialog.

## Data and authorization

- **Tables/columns**: no new ones. Writes `memberships.active`, `passcode_credentials.active` (both already exist), and one `audit_events` row. The Supabase Auth ban lives entirely inside `auth.users` (Supabase-managed, not a table this app owns or migrates).
- **Constraints/indexes**: no new ones.
- **Grants/RLS**: no policy changes expected — `memberships_update_manager` already permits this column's update by an owner/manager via RLS, but the route uses the service-role admin client for all three writes together anyway, since the Auth ban and the `passcode_credentials` write both require it regardless (that table has zero browser-role grants, same as it's always had). Authorization for _who may deactivate whom_ is therefore an application-layer check, exactly like Feature 016's reset — `canChangeDesignation`, imported directly, not reimplemented, plus an explicit self-target check the designation/reset predicate doesn't need (deactivating yourself isn't gated by role at all — it's refused outright, for anyone).
- **Roles/capabilities**: same bar as passcode reset — owner unrestricted; a Manager can deactivate anyone whose current designation isn't Owner or Manager; an Assistant Manager has zero deactivation capability.
- **Audit events**: one row per successful deactivation/reactivation — `entity_type: "membership"`, `entity_id`: the target's profile id, `action`: `"member_deactivated"` or `"member_reactivated"`, `actor_profile_id`: whoever performed it, `reason`: always required for both directions.
- **Idempotency/concurrency**: deactivating an already-inactive member (or reactivating an already-active one) is refused with a clear "already in that state" error rather than silently succeeding or double-writing — checked by reading the current row before writing, same shape as every other read-then-write action in this codebase.
- **Time-zone behavior**: n/a.

## Implementation map

- **Routes**: new `src/app/api/team/deactivate/route.ts` and `src/app/api/team/reactivate/route.ts` — routes rather than Server Actions, matching the exact reasoning Feature 016 already established (the Supabase Auth Admin API call has to happen outside the Server Action/RSC request lifecycle, and every other passcode-adjacent operation in this app already lives in `src/app/api/auth/...`/`src/app/api/team/...` for that reason). Deactivation is arguably closer to a "team" action than an "auth" action from the actor's point of view (it's initiated from the Team tab, about someone else's membership, not the caller's own credential) — grouped under `src/app/api/team/` rather than `src/app/api/auth/passcode/` to reflect that, unlike Feature 016's two routes which really are about _your own or someone's passcode specifically_.
- **Feature modules**: no new domain logic needed beyond reusing `canChangeDesignation` — deactivation's authorization rule is identical to reset's, just with the self-target case added on top.
- **Server actions/RPCs**: none — both new routes use the admin client directly, same trust boundary as reset.
- **Realtime**: none in the base scope (see "Decisions and risks" for the option this deliberately leaves out).
- **Migration**: none expected — every column this feature writes already exists.
- **Generated types**: unaffected.

## Test plan

- **Unit**: a small pure function (or an extension of the existing self-target check pattern) asserting deactivation authorization: owner unrestricted (except self), manager blocked from owner/manager targets and from self, assistant manager blocked from everyone including self. Mocked-admin-client tests for the coordinated three-write sequence (membership + credential + ban, in that order), covering the case where the 2nd or 3rd write fails after an earlier one succeeded — asserting the result reports exactly which writes landed, with no attempted revert (see "Decisions and risks").
- **Component**: the deactivate/reactivate dialogs' validation states (missing reason, self-target never rendered, hidden-not-disabled for a target the actor can't touch).
- **Database/RLS**: pgTAP confirming a deactivated membership (`active = false`) is rejected by every policy gated through `has_org_role` for that org — reusing the existing test fixtures rather than writing new ones, since this is exercising `has_org_role`'s existing, already-tested behavior with a membership row in the inactive state, not new policy surface.
- **Playwright**: owner deactivates a server, server's next sign-in attempt fails with the generic message; owner deactivates a server who is already signed in in a second browser context, that context's next action returns them to the passcode screen; owner reactivates the same server, they sign in successfully with their original passcode; a manager attempting to deactivate another manager sees no deactivate option at all; no one sees a deactivate option on their own row.
- **Manual/live verification** (this app's established practice for every real-mode Supabase feature this session — and the two ban/RLS-layer findings above were already confirmed exactly this way, ahead of this spec, specifically so the design wouldn't be built on an untested assumption the way Feature 016's first draft briefly was): exercise both routes against the actual hosted project with throwaway accounts, confirming via direct database and Auth Admin API queries that all three writes landed, that a still-open session for the deactivated account is rejected by `getCurrentUser()` on its next call, and that a direct RLS-layer read for that account returns zero rows post-deactivation (not just an error — genuinely zero rows, matching what a real signed-in client would see).

## Rollout and rollback

- **Feature flag**: none.
- **Expand/migrate/contract**: n/a — no schema change.
- **Backfill**: none.
- **Rollback limit**: plain code revert. The one thing a revert doesn't automatically undo is a Supabase Auth ban already applied to a real account before the revert — a manual `admin.auth.admin.updateUserById(id, { ban_duration: "none" })` (or using this feature's own Reactivate action one more time, if the revert is only removing the _route_, not the underlying data state) clears it. Named explicitly so a rollback isn't assumed to be purely a code operation.

## Decisions and risks

- **Decision**: the ban duration is `"876000h"` (~100 years) — GoTrue's `ban_duration` field is a plain Go-style duration string with no literal "forever" value; this is the practical community convention for an effectively permanent ban, reversed explicitly by Reactivate (`ban_duration: "none"`) rather than by waiting it out.
- **Decision**: all three writes (membership, credential, ban) go through the admin client together, in one route, rather than splitting the RLS-permitted membership write from the two admin-only writes — keeps the whole operation in one place to reason about and order deliberately, rather than a partial RLS write plus a separate admin-client follow-up that could drift out of sync.
- **Decision**: self-deactivation is refused unconditionally, for every role including owner — unlike passcode reset, which explicitly allows an owner to target themselves. Deactivating yourself has no legitimate use this spec can identify (an owner who wants to stop using the app can just stop signing in) and a real lockout risk if triggered by mistake or by a compromised session trying to cover its tracks.
- **Decision**: write ordering and partial-failure handling — **best-effort, in order, no revert.** Order: `memberships.active = false` first (the RLS kill switch — most important to land, and the one write every other layer of defense depends on), then `passcode_credentials.active = false`, then the Auth ban last. If a later write fails after an earlier one succeeded, this feature does **not** attempt to revert the earlier writes — it reports exactly which of the three landed and which didn't, so a manager can see e.g. "membership deactivated, credential deactivated, Auth ban failed" and retry just the remainder, rather than the whole action. Mirrors `rotatePasscodeCredential` naming its own worst case rather than pretending failure can't happen — the difference here is there's no single clean revert target, so the honest answer is "tell the truth about partial state," not "pretend a revert covers every case."
- **Decision**: no proactive Realtime kick for a genuinely idle tab in this version. RLS already blocks every actual read or write the instant `memberships.active` is false (confirmed live) — an idle tab can only show stale, already-loaded numbers on screen, it cannot do anything with them. Closing that display lag would need a standing Realtime subscription on _every_ signed-in session, not just the allocation board's, for a gap that's already bounded to zero real access. Left as a named, accepted residual risk, addressable later without touching anything this spec covers.
- **Decision**: reactivation is in scope for this feature, not deferred — the natural, symmetric reverse of the same three writes (`active = true`, `active = true`, `ban_duration: "none"`), so a rehired person picks back up under their existing profile and history instead of needing an entirely new registration.

## Build notes — what actually happened versus what was specced

Built as specced, plus one real, load-bearing finding this spec's own live-tested claims couldn't have surfaced without actually writing the pgTAP test.

**What matched the spec exactly**: the three-write order and best-effort/no-revert handling, `canDeactivateMember` (reusing `canChangeDesignation` plus the unconditional self-target refusal), the "no Realtime kick" decision, reactivation built in the same PR, the `MemberStatusDialog` UX (one component for both directions, hidden-not-disabled, "Inactive" badge). Commits: `a231277` (spec), `d6a60a1`/`ce9b62a` (core implementation, amended once to fix a shell-mangled commit message), `ad7d2c8` (tests).

**Confirmed live, exactly as the spec's "What already exists" section claimed, before any code was written**: banning a Supabase Auth account invalidates an already-issued token's `getUser()` calls immediately (proven with a real throwaway account: sign in, capture the token, ban, retry the same token — fails). That same token still passes a direct RLS read (proven the same way) — confirming `memberships.active`, not the ban, is what actually has to block data access, which is exactly how the code was built.

**A real gap this feature's own pgTAP test found, not something assumed correct**: `private.has_org_role` — the function nearly every RLS policy in this schema calls — has a second clause granting an organization's `created_by` full access regardless of `memberships.active`. Discovered while writing `supabase/tests/database/0008_member_deactivation.test.sql`: an early draft used one throwaway account as both the org's creator and the deactivation subject, and the "deactivated but still passes `has_org_role`" assertion failed. Fixed the test (two separate throwaway accounts — the realistic shape, since almost every real deactivation targets someone who didn't create the organization) and added a fifth assertion confirming the bypass explicitly, so it's documented rather than silently working around it. **Not patched in this feature**: `has_org_role` backs nearly every policy in the schema, and changing it is a bigger, separate decision than this feature's approved scope — flagged in both `docs/SECURITY.md` and `docs/DATA_MODEL.md` for whoever reviews this PR to decide whether and when to address it. Practical exposure today: none, since self-deactivation is refused for everyone and there's currently only ever one owner per organization who could be the creator.

**Live verification — completed against the hosted project**: a throwaway owner and staff account were created, and, using the real running app:

1. Signed in as staff (a live, valid session). Directly applied the three deactivation writes (bypassing the UI, to isolate the "already-open session" claim from the route/UI layer, which was verified separately below). Attempted "Change your passcode" from the still-open staff tab — it was cleanly signed out and returned to the passcode screen, with no raw error banner. This is the exact call that previously would have shown "Not signed in." as static dialog text before this feature's `sessionInvalid` wiring existed.
2. Confirmed the deactivated passcode is rejected on a fresh sign-in attempt (generic "Passcode not recognized," matching the acceptance criterion that deactivation isn't distinguishable from a wrong guess).
3. Reactivated (directly), confirmed sign-in succeeds again with the exact original passcode — the credential row's locator was never touched, only `active` and the ban.
4. Ran the full flow through the real UI this time: owner signs in, Team tab, Deactivate with a reason (dialog confirms, row flips to show only "Reactivate" plus an "Inactive" badge, no other actions), Reactivate with a reason (dialog confirms, row returns to its full normal action set).
5. Confirmed via direct database query: both `audit_events` rows present with the correct actor, target, action, and reason; final `memberships.active`/`passcode_credentials.active` both `true`.
6. Confirmed server-side self-deactivation refusal independent of the UI hiding the button: a raw authenticated `fetch` to `/api/team/deactivate` with the owner's own profile id as the target returned `403` with the expected message.

All throwaway accounts, the organization, and every scratch script used were deleted afterward.

**CI migration job**: confirmed by reading `.github/workflows/database.yml`, not assumed. This feature has zero new migration files. The PR-triggered `migrations-and-policies` job runs on any `supabase/**` path change — the new pgTAP file (`0008_member_deactivation.test.sql`) qualifies, so this PR does exercise it, and it passes locally (87 assertions). The push-triggered `deploy-migrations` job (`supabase db push`, main only) will find nothing new to apply once this merges — a safe no-op, not a risk of drift.
