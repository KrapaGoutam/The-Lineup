# Security Model

## Trust boundaries

- Browser input, cookies, URL state, and client-computed rotation recommendations are untrusted.
- Server Actions validate payload shape and identity but are not the final authorization layer.
- Postgres grants, constraints, RLS, and transactional functions enforce data access and invariants.
- Vercel and GitHub secrets are deployment credentials and never enter the repository.

## Authentication

- Login asks only for a restaurant-scoped 4-digit passcode; there is no username field.
- The restaurant URL/slug supplies the first lookup scope. A keyed HMAC locator identifies the credential without storing the raw passcode.
- The same passcode is verified by Supabase Auth against a synthetic internal email account. Synthetic emails are never shown to users.
- New users self-register with a name, contact, and a chosen passcode, and are provisioned and signed in immediately as a server — no manager approval step. The restaurant URL/slug is the access boundary. New accounts always get `roles: ['server']`, enforced in the registration route, not by a DB constraint; only an owner or general manager can promote a member further, matching the existing `memberships_update_manager` RLS policy. Self-served registrations are still recorded append-only in `registrations` (renamed and repurposed from `access_requests`) for audit history.
- Use Supabase Auth with the current `@supabase/ssr` pattern.
- Refresh sessions in `proxy.ts` and verify protected server access with `getClaims()`.
- Do not use the user object from an unverified client session as authorization evidence.
- Keep sensitive access tokens short-lived and revoke sessions before destructive user removal when strict invalidation is required.

### Passcode uniqueness within a restaurant

Two people in the same organization can never hold the same passcode: the credential locator is `HMAC(APP_PIN_PEPPER, organization_id + ":" + passcode)`, and `passcode_credentials` carries a `unique (organization_id, locator)` constraint — two people choosing the same 4-digit code in the same organization collide on that constraint at the database level, not through an application-side check that could race or be bypassed. The same passcode is allowed across two different organizations, since the locator is namespaced by `organization_id`.

### Rate limiting — what it compensates for, and why it degrades instead of denies

A 4-digit passcode is a 10,000-combination space, materially weaker than the 6–8 digit codes this app used before. Two layers compensate for that reduced entropy, both keyed by a request fingerprint (`clientFingerprint()` in `passcode/route.ts`, derived from the connecting IP — do not store the raw address, only its keyed hash):

- **Per-fingerprint**: 5 failed attempts / rolling 15 minutes blocks that one fingerprint (`429`, `Retry-After: 900`). Proportionate blast radius — it only affects the one device that's failing.
- **Per-organization**: 30 failed attempts across _any_ fingerprints / rolling 15 minutes is a signal, not a blanket block. A fingerprint that has succeeded for that organization within the last 24 hours is exempt from it — in practice, a restaurant's shared host-stand device/network stays continuously exempt because staff sign in there repeatedly through a normal shift, so the cap falls almost exclusively on genuinely unrecognized traffic. **This is deliberately not a hard block**: a hard organization-wide cap is itself a cheap denial-of-service vector, since a fingerprint is tied to public IP and a phone's IP resets for free on reconnect (confirmed against Vercel's own documented behavior — Vercel overwrites `X-Forwarded-For` with the real connecting IP and does not forward a client-supplied value, so this is about IP churn, not header spoofing) — meaning one person on one phone could otherwise lock out an entire restaurant mid-service for the cost of reconnecting between guesses.
- Any manager/owner already signed in to the organization can clear an active organization-wide lockout immediately from within the app (a required reason, recorded as an audit event in `audit_events` and as an append-only row in `passcode_lockout_resets` — the reset moves the failure-counting window forward, it never deletes `passcode_login_attempts` history).
- Use a generic error for a rejected passcode so account existence is not leaked; the organization-wide lockout response is intentionally distinct from that generic error (it tells the truth about what's happening and what to do), since hiding it would leave a legitimate server with no path forward at the terminal.

See `docs/features/006-four-digit-passcodes.md` for the full design and the alternatives considered and rejected (progressive delay alone, CAPTCHA/cooldown).

### Passcode rotation (Feature 016) — keeping the locator and the Auth password in sync

A passcode is two things that must always agree: the `passcode_credentials.locator` row (an HMAC used to look someone up at login) and the matching Supabase Auth account's password. Both derive from the same 4-digit value, and there is no shared database transaction across Postgres and Supabase Auth to change them atomically. `rotatePasscodeCredential` (`src/features/auth/data/passcode-rotation.ts`) is the one place either is ever written, for both self-service change (`POST /api/auth/passcode/change`, requires the current passcode) and manager/owner reset (`POST /api/auth/passcode/reset`, requires a reason).

**The Auth password is a derived value, never the raw passcode.** `createAuthPassword` (`src/lib/passcode-security.ts`) is a second HMAC, keyed by `APP_PIN_PEPPER` like the locator, but with its own domain-separated input (`"authpw:" + organizationId + ":" + passcode`) so its output can never equal the locator's for the same input. Two things forced this away from the raw passcode this feature originally shipped with: Supabase's hosted Auth enforces a hard 6-character password minimum with no lower dashboard setting — a raw 4-digit passcode is flatly rejected by `updateUserById` (confirmed directly against the project, `AuthWeakPasswordError`) — and reusing the locator itself as the password was rejected too, since the locator legitimately appears in places (credential rows, login-attempt logs, backups) that should never also hand out a working credential. A 64-hex-character HMAC digest clears any reasonable length policy and shares nothing with the locator despite deriving from the same inputs.

**Migration is lazy and per-account, triggered by that account's own next successful sign-in — there is no bulk operation.** Every credential that predates this derivation has the raw passcode as its Auth password, and the raw passcode is never stored anywhere, so nothing can retroactively compute the derived value for an account that hasn't signed in since. `verifyPasscode` (`src/features/auth/data/passcode-verify.ts`) tries the derived password first, falls back to the raw passcode, and the login route (`/api/auth/passcode`) opportunistically upgrades an account that verified via the fallback — a best-effort `updateUserById` that's logged and swallowed on failure, never allowed to turn a successful sign-in into an error. Self-change and reset don't need this: both always write a fresh derived password for the passcode being set, regardless of what scheme the account was on before, so they migrate unconditionally as a side effect of doing their own job. New accounts (registration, bootstrap) are created pre-migrated. **Named, accepted residual risk**: an account nobody signs into again, and whose membership a manager never deactivates (Feature 017), stays on the raw-passcode scheme indefinitely; this is unchanged from today's status quo for that account, not a new exposure. A deactivated account's ban makes this moot regardless — see Feature 017's subsection below.

**Order matters, and it's chosen deliberately**: the locator updates first. A collision there — someone else in the organization already holds the new passcode — is caught by the existing `unique (organization_id, locator)` constraint with nothing external yet touched, so failure needs no rollback at all. Only after that succeeds does `admin.auth.admin.updateUserById` change the Auth password (the derived value, per above). If the Auth update fails, the locator is reverted to its old value, retried once. This ordering means the one rollback path this design ever needs depends only on a value already in hand (the old locator string) — never on the plaintext passcode, which a manager performing someone else's reset may not even know.

**The worst case, named rather than hidden**: if the Auth update fails AND both revert attempts also fail, the row is left pointing at the new locator while the Auth account's password is still the old passcode. Neither the old passcode (the locator no longer matches it) nor the new one (the Auth password was never actually changed) signs that person in until a human runs the reset again. This is reported as its own result, `severity: "locked_out"`, distinct from every other failure (`"recoverable"`) specifically so the caller never tells someone "try again" when trying again with either code will fail identically — and it's logged loudly (`console.error`, full identifiers) since nothing in the UI can auto-recover from it.

**Authorization for reset is not re-derived — it's the same predicate as a designation change.** `canChangeDesignation` (`src/features/team/domain/designations.ts`, Feature 014) is imported directly rather than reimplemented: owner unrestricted; a Manager can reset anyone whose current designation isn't Owner or Manager; an Assistant Manager has zero reset capability, same as zero designation-change capability. This was an explicit design decision, not an oversight — a credential reset is at least as sensitive as a designation change, so a weaker check here would have been a regression relative to the bar Feature 014 already set. As with `passcode_credentials` generally, this authorization is application-layer (there is no browser-role RLS policy on this table to enforce it — see below), evaluated before the admin client is ever touched.

**Audit**: every successful change or reset writes one `audit_events` row (`entity_type: "passcode_credential"`, `action: "passcode_changed"` or `"passcode_reset"`) — a reset's row always carries the manager's `reason`; a self-change's never does, since there's no one to explain the change to. No row anywhere — `audit_events` included — ever contains a raw passcode value, old or new.

**Grants are unchanged, and a regression here is pinned by a test, not just a comment**: `passcode_credentials` already had zero `anon`/`authenticated` grants before this feature (rotation goes through the same service-role admin client as login and registration); `supabase/tests/database/0002_operational_modules.test.sql` now asserts that explicitly across SELECT/INSERT/UPDATE/DELETE for both roles, not only the SELECT check that predates this feature.

## Authorization

- Authorization derives from `memberships` and location capability assignments.
- Never authorize with `raw_user_meta_data` or `user_metadata`.
- Every exposed table has RLS enabled.
- Every update policy has `using` and `with check`.
- RLS policy functions wrap stable identity calls with `select` and use indexed columns.
- Views exposed to browser roles use `security_invoker = true`.
- `SECURITY DEFINER` is prohibited by default. An exception requires a private schema, explicit identity checks, fixed empty search path, revoked public execute, and security review.

### Allocation-board open editing (Feature 011, revised twice) — a deliberate, scoped exception

The self-or-manager write restriction on `table_rotation_entries` is dropped. Any active member of the organization — server, host, shift manager, general manager, or owner — may now write a table entry against **any** column on the live board, not only their own. This is an intentional, narrow exception to the app's normal role-gating, confined to this one table; every other role gate in this document (schedule drafts, tip inputs, team/registration, passcode credentials) is unchanged.

**What was asked and answered before this shipped**: table allocation data feeds tip splitting, so an unrestricted board could in principle let one person shift who gets credited for which tables and, downstream, the tip math. Three things hold that risk down, not one:

1. **Attribution is never relaxed.** `table_rotation_entries.assigned_by` is still always the caller's own `auth.uid()`, enforced in the `with check` clause of the replacement policy — a user can act on any column, but can never claim someone else made the edit. Every write remains fully traceable to a real, verified identity.
2. **A cross-column write is always recorded and shown to the whole team — there is no reason mechanism left at all.** This shipped requiring a short, non-empty reason before the write was even accepted. That requirement was dropped after real usage showed it was friction mid-service that produced dishonest or perfunctory text under pressure (revision 1: reason made optional), and the field itself was then removed from the UI entirely after testing showed it still rendered as an unwanted second input under every cross-column cell even once nothing required filling it in (revision 2: field removed). **What actually does the safeguard work, and always did**: a cross-column edit is unconditionally logged with who/what column/when, visible to the whole team in the normal flow of using the board (not hidden in an audit log a manager has to think to open). That log entry exists on _every_ cross-column write with no reason data involved at all, which is a strictly _wider_ guarantee than the original design (a write without a reason was originally refused outright, not logged without one). Same-column writes remain exactly as frictionless as before this feature.
3. **Tip participant selection is a standing invariant, not a technical accident.** As of this writing, `tip-workspace.tsx` has zero dependency on allocation-board data — participants are a separate, manager-entered and manager-confirmed list, verified by reading the code before this feature was designed, not assumed. This feature commits to that separation staying true: allocation-board activity may inform a future "suggest participants from the live floor" feature (`docs/PRD.md`), but must never be treated as ground truth that bypasses manager confirmation. Anyone building that suggestion feature later must preserve this invariant explicitly.

**The finalized-day lock**: once a `tip_pools` row for a service date is `finalized`, `table_rotation_entries` writes for that date's session are denied to every role, owner included, via a `not exists (...)` clause in the RLS policy that joins `rotation_rounds` → `service_sessions` → `tip_pools`. This closes the window during which "who worked which table" could still change after the money tied to it has been counted.

**The lock needs an unlock, or it's a worse failure than the problem it solves.** A finalized-early manager who needs to correct that day's allocation reopens tips — manager/owner only, requires a reason — which is the same action that lifts the board lock, since the lock is derived from tip-pool status rather than a second, independently-settable flag that could drift out of sync with it. This uncovered a real, pre-existing gap: the original `tip_pools_update_draft_manager` policy's `using` clause required the row to _already_ be `draft`, so no policy permitted the finalized → draft transition in either direction before this feature. The new `tip_pools_reopen_manager` policy adds exactly that missing transition, and requires `finalized_at`/`finalized_by` to be cleared in the same update, matching the table's existing check constraint. Every finalize and every reopen is recorded (an `audit_events` row in real mode; a visible in-app log in demo mode) with actor and reason.

**Residual risk, named rather than hidden**: a manager who doesn't think to check the cross-edit log could still be misled by the board's appearance alone when manually picking tip participants. The unconditional attribution log keeps cross-edits visible in the normal flow of using the board, not just in a log a manager has to remember exists — but this is a real, accepted trade-off, not a claim that the risk is eliminated.

### Feature 015 Phase C — real persistence surfaced four gaps this design never got to exercise

Feature 011 above shipped demo-only; its policies were written against a specification, never against a live RLS session. Wiring the board to ten new SECURITY INVOKER RPCs (Phase C) exercised every one of those policies for the first time, and found four real gaps — three by actually running the RPCs as real signed-in accounts (a throwaway manager and a throwaway server, both deleted after), one by cross-checking DATA_MODEL.md's RLS matrix against what the migration actually granted:

1. **The three private helper functions the ten public RPCs call internally had execute revoked from `authenticated`.** SECURITY INVOKER functions don't change the calling role partway through a chain — the role checked for every function in the chain is whoever the original caller was, the same as `private.has_org_role` already gets right (granted to `authenticated`, revoked from `public`/`anon`). The three new helpers should have followed that exact precedent; instead the very first "Add column" click failed outright with `permission denied for function get_or_create_active_session`.
2. **`table_rotation_entries_write_any_member` (Feature 011's own policy, above) allows any active member to write any column, but only ever lets someone modify or delete a row _they themselves_ created.** That's invisible for a fresh assign (a new row is always attributed to the caller, so it always passes), but it silently blocked `board_undo` from reversing anyone else's action — the RPC correctly found and marked the event undone, then the underlying `DELETE` matched zero rows, because the row's `assigned_by` belonged to a different person. The same restriction would have blocked `board_clear_row`/`column`/`board` from removing any entry not created by whoever clicked Clear. Split into separate insert/update/delete policies; update and delete now carry no ownership condition on the row as it already exists.
3. **`rotation_rounds_write_manager` (a pre-existing, untouched policy) was manager-only "for all."** The standing empty next round opens as a side effect of any active member's ordinary assign (`ensure_trailing_round`), so a server's routine table entry would fail with a permission error the instant it happened to be the one that opened a new round — an entirely UI-invisible reason to fail. Replaced with an any-active-member policy carrying the same finalized-day freeze `table_rotation_entries` already uses.
4. **Fixing gap 2 and 3 made `table_rotation_entries`/`rotation_rounds` writable by any active member, which is correct for assign and for undo/redo but wrong for clear-row/column/board and add-row** — DATA_MODEL.md's RLS matrix has always described those as owner/general_manager/shift_manager/host only, same as `rotation_members` (add-column, pause/resume/remove, reorder) already enforces via its own pre-existing, untouched policy. Those four actions had no equivalent guard, since they touch tables that had to become permissive for unrelated reasons. Fixed by adding an explicit role check inside each of those four RPCs — `private.assert_is_board_manager` — so the restriction holds even if a member calls the RPC directly, bypassing the UI's own `isManager` gate.

Undo/redo deliberately keep no such guard: they're a single shared "fix a recent mistake" mechanism open to any active member regardless of who could have performed the original action, matching the demo UI's Undo/Redo buttons, which have never been `isManager`-gated the way Add row/Clear board are.

All four fixes are migrations in their own right (`20260906144345`, `20260906144901`, `20260906145748`), each with the reasoning above repeated in the migration's own comments, and covered by `supabase/tests/database/0007_allocation_board_rpcs.test.sql`.

### Team designations (Feature 014) — a label over existing roles, not a new permission tier

The Team tab presents four designations — Owner, Manager, Assistant Manager, Staff — that map onto the existing five-value `app_role` enum: `owner`→Owner, `general_manager`→Manager, `shift_manager`→Assistant Manager, `host`/`server`→Staff. No new column, enum value, or RLS policy was added. This mapping was chosen deliberately over renaming or collapsing the existing roles: `general_manager` and `shift_manager` already receive identical operational RLS grants across nearly every policy in the schema (schedule, allocation, tips), so "Assistant Manager gets full permissions, same as Manager" is already true of `shift_manager` today, with zero policy change required. See `docs/features/014-team-designations.md` for the full reasoning.

**Who may change whose designation is exactly who may already change whose `roles` row** — the existing `memberships_insert_manager`/`memberships_update_manager` policies, unmodified:

- **Owner**: unrestricted (the policies' owner branch has no target condition). This includes reassigning the owner designation to someone else — existing, unchanged behavior, not something this feature adds or was asked to tighten.
- **Manager** (`general_manager`): may toggle a target between Assistant Manager and Staff only when the target's _current_ roles don't already include `owner` or `general_manager` (the `using` clause) and may never write `owner` or `general_manager` into anyone's roles (the `with check` clause) — so a manager can never grant Manager or Owner to anyone, and can never touch an owner's or a fellow manager's designation, including their own.
- **Assistant Manager** (`shift_manager`): no membership-write grant at all, in either policy's actor list — despite full operational access elsewhere, an assistant manager cannot change any designation, including their own or a fellow staff member's. Personnel/HR capability is deliberately a separate grant from operational capability in this schema.
- **Staff**: no membership-write grant (unchanged).

This directly answers the concern that prompted the design review: an assistant manager cannot demote (or otherwise touch) the owner, because an assistant manager cannot change _any_ designation — a stronger guarantee than a target-specific carve-out would have been, and one that required no new code to enforce.

**Gap flagged, not fixed by this feature**: no pgTAP test in `supabase/tests/database/` currently exercises `memberships_insert_manager`/`memberships_update_manager` directly (confirmed by searching the test suite before writing this section) — the manager-cannot-touch-a-fellow-manager boundary this feature leans on is enforced by the schema today but has no automated regression coverage. This predates Feature 014 and applies regardless of designation; it becomes more load-bearing now that a UI feature depends on it. Real-mode Team tab wiring is still out of scope (demo-only, matching Feature 005's existing boundary) — worth closing before that wiring happens, not before this doc sweep.

### First-owner bootstrap (Feature 015, Phase A) — a script, not a route, with a database-state guard

The very first owner has no one to sign in as to promote them — self-serve registration always creates a `server`-role membership, and there is no other in-app path to `owner`. `scripts/bootstrap-owner.mjs` fills exactly that one gap, once.

**Why a local script and not an HTTP setup route**: a route is permanently deployed, reachable-by-URL attack surface, no matter how it's gated. Even "refuse if an owner already exists" as a route-level check is still shippable code sitting in production forever, relying entirely on that one guard holding under every future refactor. A script that only runs when someone with the real `SUPABASE_SECRET_KEY` deliberately invokes it on their own machine is never live attack surface at all — there's no URL to find. Manual SQL was also rejected: it would mean re-deriving the passcode locator's HMAC by hand outside the one function that already computes it correctly, with no compiler or test to catch a mismatch.

**The guard is a query, not a policy of restraint**: before creating anything, the script runs `select count(*) from memberships where 'owner' = any(roles)` against the real database. If that's non-zero, it exits without writing a single row. This means a second invocation — run on purpose, by accident, or by someone who finds the script later — is structurally inert: the condition it checks for is exactly what a successful first run produces, so there is no state the script can be in where running it again does anything. This was verified by actually running it a second time against the real project (not just asserted), including a second time after a bug fix that changed its exit path — the refusal held both times.

**Credential handling matches everywhere else in this document**: the script reuses the identical HMAC-locator computation `createPasscodeLocator` already uses (inlined rather than imported, since `src/lib/passcode-security.ts` is marked `"server-only"`, a Next.js build-time guard with no real package to resolve outside Next's own bundler — confirmed, not assumed, while writing the script). The generated passcode is written to a local, gitignored file, never to stdout, a log line, or a second environment variable — the same "never a second copy of the real passcode anywhere" rule the registration and passcode-reset flows already follow.

**Residual risk, named**: the script's compensating rollback (deleting the just-created Auth user on a later step's failure) mirrors `/api/auth/register`'s pattern but has not been exercised by an actual injected failure, only by reading the code — worth a real fault-injection test before this becomes a repeated operational procedure rather than a one-time bootstrap.

### Schedule and tips real-mode writes (Feature 015, Phases B/D) — no new authorization surface

`addShiftAction`, `publishScheduleAction`, `saveScheduleConfigAction`, `addTipIntervalAction`, `finalizeTipsAction`, and `reopenTipsAction` all call `createClient()` — the cookie/session-based, RLS-respecting server client already used by every other real-mode code path in this app — never `createAdminClient()`. This was a deliberate check, not an assumption: none of these six actions had a reason to bypass RLS, since every table they touch (`shifts`, `shift_assignments`, `operating_hours`, `shift_kind_defaults`, `schedule_periods`, `tip_pools`, `tip_intervals`, `tip_interval_participants`, `audit_events`) already has a manager/owner-scoped write policy from the original schema (confirmed in the RLS matrix above). No new policy was added by either phase; a signed-in server attempting to call one of these actions directly (bypassing the UI's own manager-only gating) is still rejected by the same RLS policy that would reject a raw Data API call.

### Member deactivation and session kill (Feature 017)

`setMemberActive` (`src/features/auth/data/member-deactivation.ts`) is the one place a member's `memberships.active`, `passcode_credentials.active`, and Supabase Auth ban status are ever changed together — for deactivation (`POST /api/team/deactivate`) and its exact symmetric reverse, reactivation (`POST /api/team/reactivate`). Authorization reuses `canDeactivateMember` — `canChangeDesignation` (Feature 014, already reused once for passcode reset in Feature 016) plus an unconditional self-target refusal no earlier feature needed: no role, including owner, may deactivate their own account.

**What actually blocks access, confirmed by testing each layer directly rather than assumed from one mental model of "RLS + Auth":**

- **`memberships.active` is the real, unconditional kill switch.** `private.has_org_role` — the function nearly every RLS policy in this schema calls — requires it. The moment this flips to `false`, every RLS-gated read and write for that person fails, including from a browser tab that was already open and already signed in with a token that hasn't expired yet. Confirmed live: a direct PostgREST read using a still-valid, pre-deactivation token returned zero rows once `active` was set to `false`.
- **The Auth ban (`admin.auth.admin.updateUserById(id, { ban_duration })`) closes a different gap — identity checks, not data access.** Confirmed live: banning a user makes `supabase.auth.getUser()` fail immediately on an already-issued, unexpired token (`"User is banned"`), which is exactly what `getCurrentUser()` calls — so every Server Action and Route Handler that checks the caller's identity (see below) starts treating that person as signed out on its very next call. **Also confirmed live, and this is the reason banning alone would not have been sufficient**: that same banned-but-unexpired token, used for a _direct_ RLS-respecting data request with no identity check in between, still succeeded — Supabase's ban status is enforced at the GoTrue (`/user`, `/token`) layer, not at PostgREST. `memberships.active` is what actually has to do the data-access job.
- **`passcode_credentials.active` blocks re-authentication at the very first step** — the locator lookup in `/api/auth/passcode` already filters on it, so a deactivated person's passcode never even resolves to a credential row, before `verifyPasscode` is reached.

**A real, load-bearing gap this feature's own pgTAP test discovered, not one assumed away**: `private.has_org_role` has a second clause — `or exists (... organizations.created_by = auth.uid() ...)` — that grants an organization's literal creator full access regardless of their own `memberships.active` value, or even whether a membership row exists for them at all. `supabase/tests/database/0008_member_deactivation.test.sql` found this the hard way (an earlier draft used one throwaway account for both the org's creator and the deactivation subject, and the "deactivated but still passes `has_org_role`" assertion failed) and now asserts it explicitly as a known, confirmed fact rather than leaving it to be rediscovered. **Practical exposure today is narrow but real**: self-deactivation is refused for everyone, so the creator can never trigger this against themselves; it would only matter if a _second_ owner ever deactivated the org's original creator specifically — a scenario this single-owner app doesn't currently have, but a real, out-of-scope-for-this-feature RLS fix `has_org_role` itself would need if that ever changes. Not patched here: `has_org_role` backs nearly every policy in the schema, and widening this feature's scope to touch it was a decision left to the person reviewing this PR, not assumed.

**Closing the "already-signed-in-elsewhere" application gap**: `requireLiveSession` (`src/lib/supabase/require-live-session.ts`) — the same `supabase.auth.getUser()` check `finalizeTipsAction` already used before this feature existed, now shared — runs first in every real-mode Server Action across schedule, tips, allocation, and team, and in every passcode/team Route Handler. A dead session (banned, most commonly by deactivation) is reported as a distinct, recognizable result (`sessionInvalid: true`) rather than an ordinary error string; the client's single reaction point (`forceSignOut` in `restaurant-operations-app.tsx`) signs out cleanly and returns to the passcode screen instead of showing a raw error banner. **Named, accepted residual gap**: a genuinely idle tab making no server-reaching request at all keeps showing whatever was already loaded into client-side state until its next interaction — bounded to stale _display_, since no actual read or write can succeed regardless (see `memberships.active` above). The approved spec considered and declined a proactive Realtime-based kick for this in v1.

## Keys and secrets

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is browser-safe only when RLS and grants are correct.
- `SUPABASE_SECRET_KEY`, access tokens, Vercel tokens, and GitHub tokens are server/CI only.
- `APP_PIN_PEPPER` is server-only, at least 32 random characters, and rotated through an explicit credential migration.
- Raw passcodes must not appear in database rows, audit events, request logs, analytics, or client storage.
- CI logs compare environment-variable names, never values.
- Secret scanning and dependency review run before merge.

## Operational actions

- Seating and publish requests carry idempotency keys.
- Live seating locks one service-session decision at a time and rechecks eligibility inside the transaction.
- Manual overrides record actor, timestamp, before/after state, and reason.
- Audit records cannot be updated or deleted by application roles.
- Guest notes are optional, length-limited, and excluded from routine analytics logs.

## RLS verification

Database tests must cover:

- member versus non-member access;
- same organization but wrong location;
- server own-row restrictions;
- host access only to active assigned service;
- manager write permissions;
- cross-tenant inserts and updates;
- attempts to change `organization_id` during update;
- audit mutation denial.
- published schedule visibility versus draft denial;
- a server can write a table-allocation entry against **any** active column, not only their own (Feature 011), and `assigned_by` cannot be spoofed to another identity — there is no reason field involved at all, on any column;
- pause/remove/reorder/clear on the allocation board remain manager/owner-only;
- all table-allocation writes are denied for every role, owner included, once that service date's tip pool is finalized, and the finalized → draft reopen transition is manager/owner-only;
- tip allocation visibility limited to the authenticated person;
- exact reconciliation of interval cents, including remainder cents;
- passcode uniqueness enforced within one organization and allowed reuse across organizations;
- passcode lockout resets insertable only by manager/owner roles, denied to `anon` and plain `authenticated`;
- `passcode_credentials` remains at zero `anon`/`authenticated` grants across SELECT/INSERT/UPDATE/DELETE (Feature 016 — a "this didn't change" regression assertion, since rotation still goes through the service-role admin client, never a browser-authenticated session);
- a deactivated membership (`active = false`) fails `private.has_org_role` for that organization even with identical, otherwise-sufficient roles (Feature 017, behaviorally proven with a real seeded row and a simulated `auth.uid()`, not just read from the function's SQL) — **except** for that organization's literal creator, a confirmed, named, currently-accepted gap in `has_org_role` itself (see `docs/SECURITY.md`'s Feature 017 subsection above and `supabase/tests/database/0008_member_deactivation.test.sql`);
- **not yet covered (flagged, Feature 014)**: `memberships_insert_manager`/`memberships_update_manager` — an owner can grant/revoke any role including owner/general_manager; a general_manager can toggle shift_manager/host/server roles but cannot grant owner/general_manager and cannot modify a row that currently holds one; a shift_manager/host/server has no membership-write access at all.

Run Supabase database advisors after schema changes and before production release.

## Incident basics

1. Disable the affected operation or revoke the compromised key.
2. Preserve Vercel, Supabase, and audit evidence.
3. Identify tenant and row scope without copying unnecessary personal data.
4. Patch with a regression test.
5. Rotate credentials and invalidate sessions when exposure is plausible.
6. Record the decision and prevention change in an ADR or postmortem.
