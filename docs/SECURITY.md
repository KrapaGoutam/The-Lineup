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

### Team designations (Feature 014) — a label over existing roles, not a new permission tier

The Team tab presents four designations — Owner, Manager, Assistant Manager, Staff — that map onto the existing five-value `app_role` enum: `owner`→Owner, `general_manager`→Manager, `shift_manager`→Assistant Manager, `host`/`server`→Staff. No new column, enum value, or RLS policy was added. This mapping was chosen deliberately over renaming or collapsing the existing roles: `general_manager` and `shift_manager` already receive identical operational RLS grants across nearly every policy in the schema (schedule, allocation, tips), so "Assistant Manager gets full permissions, same as Manager" is already true of `shift_manager` today, with zero policy change required. See `docs/features/014-team-designations.md` for the full reasoning.

**Who may change whose designation is exactly who may already change whose `roles` row** — the existing `memberships_insert_manager`/`memberships_update_manager` policies, unmodified:

- **Owner**: unrestricted (the policies' owner branch has no target condition). This includes reassigning the owner designation to someone else — existing, unchanged behavior, not something this feature adds or was asked to tighten.
- **Manager** (`general_manager`): may toggle a target between Assistant Manager and Staff only when the target's _current_ roles don't already include `owner` or `general_manager` (the `using` clause) and may never write `owner` or `general_manager` into anyone's roles (the `with check` clause) — so a manager can never grant Manager or Owner to anyone, and can never touch an owner's or a fellow manager's designation, including their own.
- **Assistant Manager** (`shift_manager`): no membership-write grant at all, in either policy's actor list — despite full operational access elsewhere, an assistant manager cannot change any designation, including their own or a fellow staff member's. Personnel/HR capability is deliberately a separate grant from operational capability in this schema.
- **Staff**: no membership-write grant (unchanged).

This directly answers the concern that prompted the design review: an assistant manager cannot demote (or otherwise touch) the owner, because an assistant manager cannot change _any_ designation — a stronger guarantee than a target-specific carve-out would have been, and one that required no new code to enforce.

**Gap flagged, not fixed by this feature**: no pgTAP test in `supabase/tests/database/` currently exercises `memberships_insert_manager`/`memberships_update_manager` directly (confirmed by searching the test suite before writing this section) — the manager-cannot-touch-a-fellow-manager boundary this feature leans on is enforced by the schema today but has no automated regression coverage. This predates Feature 014 and applies regardless of designation; it becomes more load-bearing now that a UI feature depends on it. Real-mode Team tab wiring is still out of scope (demo-only, matching Feature 005's existing boundary) — worth closing before that wiring happens, not before this doc sweep.

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
- **not yet covered (flagged, Feature 014)**: `memberships_insert_manager`/`memberships_update_manager` — an owner can grant/revoke any role including owner/general_manager; a general_manager can toggle shift_manager/host/server roles but cannot grant owner/general_manager and cannot modify a row that currently holds one; a shift_manager/host/server has no membership-write access at all.

Run Supabase database advisors after schema changes and before production release.

## Incident basics

1. Disable the affected operation or revoke the compromised key.
2. Preserve Vercel, Supabase, and audit evidence.
3. Identify tenant and row scope without copying unnecessary personal data.
4. Patch with a regression test.
5. Rotate credentials and invalidate sessions when exposure is plausible.
6. Record the decision and prevention change in an ADR or postmortem.
