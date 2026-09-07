# Feature 016 — Passcode change and reset

**Name:** Passcode change and reset
**Owner:** Krapa Goutam
**Status:** discovery (spec only — no code written yet)
**Issue/PR:**

## Numbering note

Next free number after `015-hosted-supabase-persistence.md` — no collisions with any existing `docs/features/*.md`.

## What already exists — read before assuming this is greenfield

Confirmed by reading the schema and the current auth code, not assumed:

- `passcode_credentials` already has everything this feature needs as columns: `locator` (the HMAC), `synthetic_email`, `active`, `updated_at`. **No new migration, table, or column is expected.** The whole feature is new Server Actions/API routes plus UI, reusing exactly the tables and grants that already exist.
- `passcode_credentials` has **zero grants to `anon`/`authenticated`** — only `service_role` can touch it (confirmed: `revoke all on table ... passcode_credentials ... from anon, authenticated`, then `grant all ... to service_role`). Every operation this feature needs — reading a credential row, updating a locator, changing the Supabase Auth password — has to go through the admin (service-role) client, inside a server-only route or Server Action. This is the same trust boundary `/api/auth/passcode` and `/api/auth/register` already use; this feature doesn't relax it.
- `createPasscodeLocator(organizationId, passcode)` (`src/lib/passcode-security.ts`) is the one function that computes the HMAC locator. It already exists and is reused, not reimplemented.
- The login flow (`/api/auth/passcode/route.ts`) is the reference for how locator + Supabase Auth password work together today: compute the locator from `(organizationId, passcode)`, look up `passcode_credentials` by `(organization_id, locator)` to get `synthetic_email`, then verify by calling `supabase.auth.signInWithPassword({ email: synthetic_email, password: passcode })`. Two independent systems (a Postgres row and a Supabase Auth account) both have to agree with the raw passcode for sign-in to succeed — this is exactly the sync problem this feature has to solve when a passcode _changes_.
- `admin.auth.admin.updateUserById(userId, { password: newPasscode })` is a real, existing Supabase Admin API method (confirmed against the installed `@supabase/auth-js` type definitions) — this is how a synthetic account's password gets changed after creation. `profiles.id` is the same UUID as the Supabase Auth user id, so no separate lookup is needed to get from a membership to an Auth user.
- The existing self-serve registration route already solves an adjacent problem the same way this feature needs to: it creates the Auth user, then does Postgres writes, and rolls the Auth user back (deletes it) if a later write fails, rather than leaving an orphaned account. This feature's rollback direction is different (explained below) but the _shape_ — one system's change compensated if the other's fails — is the same pattern.
- `rate-limit.ts` / `passcode_login_attempts` (Feature 006) already implement exactly the throttling this feature's self-change path needs for "confirm your current passcode" — reused directly, not reimplemented.
- `audit_events` is generic (`action`, `entity_type`, `entity_id`, `reason`, `before_state`/`after_state` — all nullable except `action`/`entity_type`) and already used for finalize/reopen-tips and lockout resets. It fits a passcode reset/change record with no schema change.

## User outcome

Today, the only way to get a passcode into the system is the self-serve registration form or the one-time bootstrap script — there is no way to change a passcode afterward short of editing the database by hand. This feature adds two paths:

- **Anyone signed in** can change their own passcode, after confirming they know the current one.
- **An owner or manager** (exact role boundary is an open question below — needs your decision) can reset any other member's passcode without knowing their old one, for the "forgot it" and "no longer trust the old code is private" cases.

Neither path is full offboarding. See "Out of scope" below for why a reset is not the same as deactivating someone.

## How the HMAC locator and the Supabase Auth password stay in sync

They're two independent systems (a Postgres row, a Supabase Auth account) with no shared transaction, so this needs an explicit sequence and a real compensating step, not just "update both."

**Revised after the first build attempt hit a real wall**: `admin.auth.admin.updateUserById` enforces the hosted project's Auth minimum-password-length policy (6 characters, and the dashboard has no lower setting) and flatly rejects a raw 4-digit passcode with `AuthWeakPasswordError` — confirmed by calling it directly against the real project, not assumed. `admin.auth.admin.createUser` and `signInWithPassword` do not enforce that same minimum on this project, which is the only reason login and registration ever worked with a 4-digit password. This spec originally called for sending the raw passcode straight through as the Auth password; that's no longer what happens.

**The Auth password is now a derived value, not the raw passcode.** `createAuthPassword(organizationId, passcode)` — a second HMAC, keyed by the same `APP_PIN_PEPPER`, with its own domain-separated input (`"authpw:" + organizationId + ":" + passcode`, versus the locator's `organizationId + ":" + passcode`) — produces a 64-character hex digest, which clears any password-length policy a hosted project could reasonably set. Two designs were on the table for this:

- **Reuse the locator itself** as the Auth password. Rejected: the locator is a lookup key that legitimately appears in `passcode_credentials` rows, login-attempt logs, and database backups. Making it _also_ a working Auth password means anyone who ever sees a locator value — through any of those ordinary, non-adversarial channels — has a live credential, not just an opaque index key.
- **A second, domain-separated HMAC** (what shipped). The two outputs can never collide for the same input, even though both derive from the same pepper, organization, and passcode — a leaked locator is not a leaked password, and vice versa. Chosen for exactly that reason.

**Order: locator first, then Auth password.** Not the reverse, and not simultaneous:

1. Read the target's current `passcode_credentials` row (by `organization_id` + `profile_id`) — capture `id`, the **current locator value** (not the passcode — that's never stored), and `synthetic_email`.
2. Compute `newLocator = createPasscodeLocator(organizationId, newPasscode)`.
3. `UPDATE passcode_credentials SET locator = newLocator, updated_at = now() WHERE id = ...`. The existing `unique (organization_id, locator)` constraint is the collision guard — if the new passcode is already in use by someone else in the same org, this fails with `23505`, exactly like registration's existing collision handling. **Nothing else has been touched yet**, so this failure needs no rollback — it's a plain, expected, user-facing "That passcode is already in use — choose a different one," the same message registration already uses.
4. Only if step 3 succeeds: `admin.auth.admin.updateUserById(targetUserId, { password: createAuthPassword(organizationId, newPasscode) })`.
5. If step 4 fails (a real infrastructure failure, not a foreseeable validation case — the derived password can no longer fail on length): **compensate by reverting the locator column back to the value captured in step 1** — a plain `UPDATE ... SET locator = oldLocator`, which needs no knowledge of any plaintext passcode, old or new, to perform. Return a generic error ("Unable to update the passcode right now. Please try again.").
6. If step 4 succeeds, the row and the Auth account now agree on the new passcode — a subsequent sign-in with the new passcode's locator will find this row, and `verifyPasscode` (below) will succeed against it via the derived path.

**Why this order and not the reverse**: if the Auth password were updated first and the locator update then failed on a collision, the only way to "roll back" the Auth password would be to know the _old_ plaintext passcode — which is never stored, and which a manager resetting someone else's forgotten passcode never had in the first place. Doing the DB write first means the one truly common failure (passcode already taken) is caught before anything externally-visible changes, and the one rollback this design ever needs (locator reverted to its old value) requires nothing but a value already in hand.

**What "in sync" means operationally**: at every moment before this sequence starts and after it finishes (success or the one compensated failure), the locator and the Auth password correspond to the _same_ passcode. The only window where they could theoretically disagree is between steps 3 and 4 completing — sub-second, server-side, no user-visible state change occurs until the whole sequence resolves one way or the other.

## Migration: every credential that predates this function

Every passcode created before this revision — the real owner account included — has the **raw passcode** as its Supabase Auth password, because that was the only design that existed at the time. There is no bulk migration available: the raw passcode is never stored anywhere (that's the entire point of the locator/synthetic-email design), so nothing server-side can retroactively compute `createAuthPassword` for an account that hasn't typed its passcode in since this shipped.

**The migration is lazy, per-account, and triggered by the account's own next successful sign-in** — `verifyPasscode` (`src/features/auth/data/passcode-verify.ts`) tries the derived password first (the steady-state, already-migrated case) and falls back to the raw passcode (the legacy case) rather than assuming either. Every caller that verifies a passcode goes through this one function:

- **Login** (`/api/auth/passcode`): if verification succeeds via the legacy (raw) path, the route immediately calls `migrateLegacyAuthPassword` — a best-effort `updateUserById` that overwrites the account's Auth password with the derived value for that same passcode. Awaited, but never allowed to turn a successful sign-in into a failure: a failed migration is logged and swallowed, leaving the account exactly as usable as before (still legacy, tried again next time). **This is the actual answer to "how does everyone get migrated without losing access"**: nothing needs to happen except people signing in the way they already do every shift. The owner's own account migrates the next time they sign in with `0967`.
- **Self-change** (`/api/auth/passcode/change`): also calls `verifyPasscode` to check the _current_ passcode, but does **not** call the migration helper — `rotatePasscodeCredential` is about to write a brand new derived password for the _new_ passcode a moment later regardless of how the old one verified, so migrating the old one first would just be an extra write immediately overwritten.
- **Reset** (`/api/auth/passcode/reset`): no verification of the old passcode happens at all (the manager doesn't know it) — but `rotatePasscodeCredential` always writes the derived scheme for the new passcode, so a reset unconditionally leaves that account migrated, regardless of what scheme it was on before.
- **Registration** (`/api/auth/register`) and **bootstrap** (`scripts/bootstrap-owner.mjs`): both now create new accounts pre-migrated — `createAuthPassword` is used at `createUser` time directly, since a brand new account has no legacy state to carry. Bootstrap has one added wrinkle: `createAuthPassword` needs the organization's id, which doesn't exist until _after_ the organization row is inserted, which itself needs a real user id for `created_by` first. Bootstrap breaks that ordering with a throwaway random password at `createUser` time, then overwrites it with the real derived password the moment the organization row exists (rolling the whole account back via the script's existing `rollbackUser()` if that overwrite fails) — the raw passcode is never the account's live password at any point the script can hand off successfully.

**Residual risk, named**: an account that is never signed into again after this ships — someone who left and simply stopped coming in, whose membership hasn't been deactivated (Feature 017, not yet built) — stays on the legacy raw-passcode scheme indefinitely, since nothing ever triggers its migration. This is not a new exposure this feature introduces: it is exactly today's status quo for that account, continuing unchanged for as long as no one signs into it and no manager resets it. It closes automatically for any account with regular activity, and immediately for any account that goes through a reset.

## Scope

**In**

- Self-service passcode change: a signed-in user of any role changes their own passcode after confirming the current one.
- Manager/owner-initiated reset: resets another member's passcode without needing the old one, optionally auto-generating a new one (same UX as `bootstrap-owner.mjs`'s `--yes`-without-passcode path).
- Demo-mode equivalents for both (re-keying `demoAccounts`, consistent with how every other real/demo pair in this app works).
- An audit trail: every change or reset recorded in `audit_events`, actor and target always real, no passcode value ever recorded.
- Self-change re-verification reuses the existing per-fingerprint/per-organization rate limiting (Feature 006) — a wrong "current passcode" attempt counts exactly like a failed login attempt.

**Out**

- Full member deactivation/offboarding (`memberships.active = false`, revoking someone's ability to appear in the roster at all). You raised "someone leaves" as a motivating case, but a reset only replaces their credential — they still show up as an active member and could still be given a _new_ working passcode by anyone else who could reset it. If offboarding is actually the need, that's a different, narrower feature (deactivate a membership) worth speccing separately — flagging this distinction now rather than quietly conflating the two.
- Forcibly terminating an already-open session when a reset happens. Consistent with how a designation change already works today (Feature 014): the target keeps working under their current session until they sign out; only their _next_ sign-in needs the new passcode. If you want a reset to immediately force sign-out everywhere, that's an additional, separable capability (Supabase Admin API supports revoking sessions) — named here as something this spec deliberately does not include, not something forgotten.
- Passcode recovery via email/SMS. There is no real inbox behind a synthetic email (unchanged since Feature 005) — recovery is always mediated by another human (yourself, if you know your own code and are just changing it; a manager, if you don't).
- Changing anything about the passcode _format_ (still exactly 4 digits, `isValidPasscode`, unchanged since Feature 006).

## Open questions — need your decision before this is built

1. **Who exactly can reset someone else's passcode?** You said "a manager or owner." Two readings, and they're genuinely different:
   - **(Recommended) Mirror `memberships_update_manager`'s exact existing hierarchy** — the same actor rules Feature 014 already uses for designation changes: owner unrestricted; a Manager (`general_manager`) can reset anyone whose _current_ designation isn't Owner or Manager; an Assistant Manager (`shift_manager`) can reset no one, same as they can't change any designation today. Reasoning: resetting someone's login credential is at least as sensitive as changing their designation label — arguably more, since it's a path to acting _as_ them — so it shouldn't be _more_ permissive than designation changes are today.
   - **Wider**: also let Assistant Manager (`shift_manager`) reset non-manager passcodes, since it's a more urgent, time-pressured operational need mid-service (a locked-out server) than a designation change usually is, and assistant managers already have full operational access everywhere else.

   I'd default to the first option unless you tell me otherwise, but this is your call, not mine to assume.

2. **Does self-change require re-entering the current passcode?** Recommending **yes** — this app's login is the _only_ authentication factor, and an already-open session on a shared host-stand device is a named risk elsewhere in this codebase (`docs/SECURITY.md`'s rate-limiting section). Requiring the current passcode before accepting a new one means someone can't walk up to an unattended, still-signed-in session and lock the real owner of that session out. Say if you'd rather trust the session alone.

3. **Does a manager-initiated reset require a reason?** Recommending **yes**, required (not optional) — matching the existing convention for other manager-initiated overrides (reopening finalized tips, clearing an organization-wide lockout), both of which already require a reason and log it. A self-change doesn't get a reason field; there's no one to explain yourself to.

4. **Auto-generate vs. manager-chosen new passcode for a reset — one, or both?** Recommending **both**, matching `bootstrap-owner.mjs`'s existing pattern exactly: a manager can either type a specific new passcode or leave it blank and get a random 4-digit one generated and shown once. Say if you'd rather have only one path.

Nothing else in this spec is blocked on these answers, but the exact RLS-equivalent role check (#1), the API request shape (#2, whether `currentPasscode` is a required field), and the reset dialog's fields (#3, #4) all depend on them, so I'd rather get them confirmed than guess and rebuild.

## Acceptance criteria

Written assuming the recommended answers above; will be corrected if you choose differently.

- [ ] Given a signed-in user of any role, when they submit their correct current passcode and a new valid 4-digit passcode not already used by anyone else in the organization, then their passcode changes: a subsequent sign-out and sign-in with the new passcode succeeds, and the old passcode no longer works.
- [ ] Given a signed-in user, when they submit an incorrect current passcode, then the change is rejected with a generic error, and the attempt counts toward the same per-fingerprint/per-organization rate limits a failed login does.
- [ ] Given a signed-in user, when they submit a new passcode already used by someone else in the same organization, then the change is rejected with "That passcode is already in use — choose a different one," and neither their locator nor their Auth password changes.
- [ ] Given an owner, when they reset any other member's passcode (including another manager's), then it succeeds, a new passcode is shown exactly once, and the old one no longer works.
- [ ] Given a general manager, when they attempt to reset an owner's or another general manager's passcode, then the action is refused before any write happens (mirrors `memberships_update_manager`'s existing `using` clause).
- [ ] Given a shift_manager (Assistant Manager) or a server, when they attempt to reset anyone else's passcode, then the action is refused entirely (no option is even shown in the UI, matching how `assignableDesignations` already hides options the actor can't use).
- [ ] Given a manager resetting someone's passcode, when they submit without a reason, then the action is blocked client-side and server-side (mirrors the existing reopen-tips/clear-lockout reason validation).
- [ ] Given any successful change or reset, then exactly one `audit_events` row is recorded (actor, target, action, reason if present) and no row anywhere ever contains the raw passcode value, old or new.
- [ ] Given a passcode reset for someone with an already-open session elsewhere, then that session is not interrupted; only their next sign-in requires the new passcode.
- [ ] Given demo mode, when a person changes their own passcode or a manager resets someone else's, then the `demoAccounts` map is re-keyed for the rest of the session, consistent with how registration and designation changes already behave in demo mode.

## UX contract

- **Entry point (self-change)**: a new icon button in the header, next to the existing sign-out control, available to every signed-in role — this is the first account-level action in the app that isn't manager-gated, so it needs its own visible entry point rather than living inside the manager-only Team tab.
- **Entry point (reset)**: a new "Reset passcode" action per row in the existing Team tab, rendered only for rows the signed-in actor is allowed to reset (same pattern `assignableDesignations` already uses to hide disallowed buttons entirely, not just disable them).
- **Desktop / host tablet / server mobile**: both dialogs are a small centered modal (same visual pattern as the existing Hours-settings dialog), not a full page — this is a short, occasional action, not a workspace.
- **Loading**: submit buttons show a pending label ("Changing…" / "Resetting…"), matching the existing `pending` pattern in `login-screen.tsx`.
- **Empty**: n/a — both dialogs always have their fields visible immediately.
- **Error**: inline `aria-live` text, same treatment as every existing form in this app — wrong current passcode, passcode-already-in-use, rate-limited, missing/short reason (reset only), passcode format invalid.
- **Success**: self-change closes with a brief confirmation, no passcode is re-displayed (they just typed it, they know it). Reset shows the new passcode **once**, in a dismissible panel with explicit "write this down — it will not be shown again" language, matching `bootstrap-owner.mjs`'s existing wording exactly, and a copy affordance not a download (no auto-download link, consistent with this app's existing artifact-handling constraints).
- **Permission denied**: the reset action is not rendered at all for a target the actor isn't allowed to reset (never shown-then-disabled).
- **Keyboard/screen reader**: both dialogs follow the existing `HoursDialog`/`LoginScreen` pattern — labeled inputs, `aria-live` errors, a named close control, focus trapped inside the dialog.

## Data and authorization

- **Tables/columns**: no new ones. Reads and writes `passcode_credentials` (`locator`, `synthetic_email`, `updated_at`) exactly as it exists today. Writes one `audit_events` row per change/reset.
- **Constraints/indexes**: no new ones. `unique (organization_id, locator)` is the existing collision guard, reused as-is.
- **Grants/RLS**: no policy changes expected. `passcode_credentials` already has zero browser-role access — every operation goes through the admin client inside a Server Action, the same trust boundary `/api/auth/register` already uses. Authorization for _who may reset whom_ is therefore an **application-layer check** (read the caller's membership via `getCurrentUser()`/session, compare roles, same logic `memberships_update_manager`'s RLS expresses, just evaluated in TypeScript before ever touching the admin client) — not something RLS can enforce here, since the browser role has no policy on this table to begin with. This mirrors how `roles: ['server']` is already enforced only in application code at registration, not by a DB constraint.
- **Roles/capabilities**: self-change requires only an authenticated session (any role). Reset requires the role check named in open question #1.
- **Audit events**: one row per successful change/reset — `entity_type: "passcode_credential"`, `entity_id`: the target's profile id, `action`: `"passcode_changed"` (self) or `"passcode_reset"` (manager), `actor_profile_id`: whoever performed it, `reason`: present (required) for a reset, absent for a self-change. Never `before_state`/`after_state` containing a passcode value in any form.
- **Idempotency/concurrency**: the locator's own `unique (organization_id, locator)` constraint is the concurrency guard — two simultaneous attempts to claim the same new passcode in one organization can't both succeed, the database decides. No idempotency key needed beyond that; this isn't a retriable, resumable operation.
- **Time-zone behavior**: n/a.

## Implementation map

- **Routes**: new `src/app/api/auth/passcode/change/route.ts` (self-service) and `src/app/api/auth/passcode/reset/route.ts` (manager-initiated) — kept as routes rather than Server Actions to match the existing sign-in/registration pattern exactly (both of those are routes, not actions, because they need to call `supabase.auth.signInWithPassword`/`admin.auth.admin.createUser` outside the Server Action/RSC request lifecycle in the same way).
- **Feature modules**: `src/features/auth/domain/` gains a small pure helper for generating a random 4-digit passcode (extracted from `bootstrap-owner.mjs`'s existing inline logic, shared rather than duplicated a third time); `src/lib/passcode-security.ts` is reused unmodified.
- **Server actions/RPCs**: none — both operations go through the two new routes above, using the admin client directly, same as registration.
- **Realtime**: none.
- **Migration**: none expected — confirmed by reading the existing schema/grants before writing this spec, not assumed. Flagged as a **risk**, not a certainty, until Phase A verification (see Test plan) actually exercises `admin.auth.admin.updateUserById` against the real hosted project.
- **Generated types**: unaffected — no schema change.

## Test plan

- **Unit**: the new random-passcode generator (format, always 4 digits); the locator-then-Auth-password sequencing logic with a mocked Supabase client covering all four outcomes (collision on locator update; Auth update fails after locator succeeds, confirming the compensating revert; both succeed; self-change wrong-current-passcode path).
- **Component**: the two new dialogs' validation states (mismatched confirm-new field if one exists, missing reason on reset, disabled/hidden reset button for a target the actor can't reset).
- **Database/RLS**: pgTAP confirming `passcode_credentials` still has zero `anon`/`authenticated` grants after this feature (a regression here would be a real, serious authorization gap) — a "this didn't change" assertion, matching this app's convention of asserting invariants explicitly rather than only testing new behavior.
- **Playwright**: self-change with correct current passcode, sign out, sign back in with the new one; self-change with wrong current passcode, rejected; owner resets a server's passcode, new one shown once, old one rejected on next sign-in attempt; a manager attempting to reset another manager's passcode sees no reset option at all.
- **Manual/live verification** (this app's established practice for every real-mode Supabase feature this session): exercise both routes against the actual hosted project with a throwaway test account created and deleted for the purpose, confirming via a direct database query that the locator, `synthetic_email`, and `updated_at` are exactly what's expected — not just that the UI reports success.

## Rollout and rollback

- **Feature flag**: none.
- **Expand/migrate/contract**: n/a — no schema change.
- **Backfill**: none.
- **Rollback limit**: plain code revert. No data migration to undo; the one behavior change with any persistence footprint is new `audit_events` rows, which are additive and harmless to leave in place even if the feature is reverted.

## Decisions and risks

- **Decision**: locator update before Auth password update, not the reverse — see "How the HMAC locator and the Supabase Auth password stay in sync" above for the full reasoning.
- **Decision**: self-change reuses the existing login rate-limiter rather than a new one — a wrong "current passcode" guess is functionally the same risk a wrong login guess is, and this app already has working, tested infrastructure for exactly that.
- **Risk**: `admin.auth.admin.updateUserById`'s exact behavior under concurrent calls, and whether it invalidates other active sessions for that user automatically or leaves them valid, is asserted from the SDK's type definitions and documentation comments here, not yet verified against the real hosted project — first real test happens in Phase A of the build, not asserted as fact in this spec.
- **Risk**: the "no forced sign-out on reset" decision means a person who reset someone else's passcode because that person's device/session was compromised has _not_ actually cut off the compromised session — only blocked future sign-ins with the old code. Named as a real, accepted gap for this spec's scope, not a claim that resetting a passcode is equivalent to revoking access.
- Open questions: the four numbered above — all need your decision before implementation starts.

## Build notes — what actually happened versus what was specced

Built as specced, with one real blocker this spec's own "Risk" section correctly anticipated but couldn't confirm in advance.

**What matched the spec exactly**: `rotatePasscodeCredential`'s locator-then-Auth-password sequencing, the compensating revert with one retry, `canChangeDesignation` reused directly (not reimplemented) for reset authorization, the reason requirement on reset, both auto-generate and manager-typed new passcodes, one `audit_events` row per change/reset (reset carrying the reason, self-change not), and the pgTAP grant-regression assertion. Commits: `3cd1064` (this spec), `b599fc4` (routes + rotation logic), `b98ea9b` (unit tests + pgTAP), `a0031d6` (UI, both real and demo mode).

**The two things you asked to have confirmed as this was built**:

1. **Worst case when the locator update succeeds, the Auth update fails, and the revert also fails**: the row is left pointing at the new locator while Supabase Auth's password is still the old passcode. Neither the old passcode (no longer matches any locator) nor the new one (Auth was never actually updated) signs that person in — a human has to run the reset again. This is reported as `severity: "locked_out"`, distinct from every other failure case (`"recoverable"`), specifically so the two routes never tell someone "try again" when trying again with either code fails identically. Covered by a unit test (`passcode-rotation.test.ts`) that forces both the Auth update and both revert attempts to fail and asserts on the severity value, not just on `ok: false`.
2. **`audit_events` for both flows**: yes — `passcode_changed` (self, no `reason`) and `passcode_reset` (manager, `reason` always present), each written after `rotatePasscodeCredential` reports success, in both `change/route.ts` and `reset/route.ts`.

**The blocker this spec's own risk note anticipated, now confirmed real**: live-verifying against the hosted project (throwaway owner + staff accounts, created and later fully deleted) found that `admin.auth.admin.updateUserById` rejects a 4-digit password with `AuthWeakPasswordError` ("Password should be at least 6 characters") — the hosted project's configured Auth minimum password length is 6. Confirmed directly, not inferred: a raw `updateUserById` call against the real project reproduced the exact error. Critically, `admin.auth.admin.createUser` and `signInWithPassword` do **not** enforce that same minimum on this project — both already work fine with 4-digit passwords, which is how every passcode in production today (including the owner's own) was created and is still being used to sign in. Rotation is the first code path that calls `updateUserById`, so it's the first to ever hit this asymmetry; nothing about the code built for this feature is wrong, and nothing about `createUser`/`signInWithPassword`-based flows (login, registration, bootstrap) is affected.

**First attempted fix, ruled out**: lowering the hosted project's Auth minimum password length to 4 — no code change, would have kept the raw passcode as the Auth password everywhere. **Not available**: Supabase enforces a hard floor of 6 characters on hosted projects; the dashboard rejects 4. This was checked directly, not assumed from documentation.

**What shipped instead**: the Auth password is now a derived value (`createAuthPassword`, a second domain-separated HMAC), never the raw passcode — see "How the HMAC locator and the Supabase Auth password stay in sync" above for the full design and the "reuse the locator" alternative that was considered and rejected. Every credential that predates this change is migrated lazily, on its own next successful sign-in, via `verifyPasscode`'s derived-then-legacy fallback — see "Migration" above. `bootstrap-owner.mjs` was also updated (it independently mirrors `createAuthPassword`, the same pattern it already used for the locator, since it can't import the `"server-only"`-marked `src/lib/passcode-security.ts`) so a freshly bootstrapped owner starts pre-migrated rather than needing to be.

**Live verification status**: `npm run check`, `npm test`, and `npm run build` all pass against the revised code (derived password, migration path, updated/added unit tests). The live Playwright round trip against the hosted project — including a simulated legacy account, to prove the migration-on-login path actually works and not just the already-migrated path — runs next, before this is considered fully done.

**Smaller, unspecced additions made while building the UI**: the reset dialog includes a copy-to-clipboard affordance for the newly issued passcode (the spec asked for "a copy affordance not a download," this is the direct implementation of that line) and a radio toggle between "Generate randomly" and "Choose one" rather than always showing a passcode input (keeps the common case — most resets don't need a specific number — to one click). Demo mode's `resetMemberPasscode` also issues a first login credential for a roster member who has never had one (most of the static demo roster), rather than requiring a `demoAccounts` entry to already exist — not explicitly specced, but a natural reading of "reset" that avoids a dead-end UI state for that roster's majority.
