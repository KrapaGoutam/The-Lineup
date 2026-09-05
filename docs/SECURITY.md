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

### Allocation-board open editing (Feature 011) — a deliberate, scoped exception

The self-or-manager write restriction on `table_rotation_entries` is dropped. Any active member of the organization — server, host, shift manager, general manager, or owner — may now write a table entry against **any** column on the live board, not only their own. This is an intentional, narrow exception to the app's normal role-gating, confined to this one table; every other role gate in this document (schedule drafts, tip inputs, team/registration, passcode credentials) is unchanged.

**What was asked and answered before this shipped**: table allocation data feeds tip splitting, so an unrestricted board could in principle let one person shift who gets credited for which tables and, downstream, the tip math. Three things hold that risk down, not one:

1. **Attribution is never relaxed.** `table_rotation_entries.assigned_by` is still always the caller's own `auth.uid()`, enforced in the `with check` clause of the replacement policy — a user can act on any column, but can never claim someone else made the edit. Every write remains fully traceable to a real, verified identity.
2. **A cross-column write requires a reason.** Writing to a column that is not the actor's own additionally requires a short, non-empty reason, surfaced in the UI and shown to the whole team (not hidden in an audit log a manager has to think to open) — this is a _new_ requirement not previously needed, since editing your own column carries no such friction. Same-column writes remain exactly as frictionless as before this feature.
3. **Tip participant selection is a standing invariant, not a technical accident.** As of this writing, `tip-workspace.tsx` has zero dependency on allocation-board data — participants are a separate, manager-entered and manager-confirmed list, verified by reading the code before this feature was designed, not assumed. This feature commits to that separation staying true: allocation-board activity may inform a future "suggest participants from the live floor" feature (`docs/PRD.md`), but must never be treated as ground truth that bypasses manager confirmation. Anyone building that suggestion feature later must preserve this invariant explicitly.

**The finalized-day lock**: once a `tip_pools` row for a service date is `finalized`, `table_rotation_entries` writes for that date's session are denied to every role, owner included, via a `not exists (...)` clause in the RLS policy that joins `rotation_rounds` → `service_sessions` → `tip_pools`. This closes the window during which "who worked which table" could still change after the money tied to it has been counted.

**The lock needs an unlock, or it's a worse failure than the problem it solves.** A finalized-early manager who needs to correct that day's allocation reopens tips — manager/owner only, requires a reason — which is the same action that lifts the board lock, since the lock is derived from tip-pool status rather than a second, independently-settable flag that could drift out of sync with it. This uncovered a real, pre-existing gap: the original `tip_pools_update_draft_manager` policy's `using` clause required the row to _already_ be `draft`, so no policy permitted the finalized → draft transition in either direction before this feature. The new `tip_pools_reopen_manager` policy adds exactly that missing transition, and requires `finalized_at`/`finalized_by` to be cleared in the same update, matching the table's existing check constraint. Every finalize and every reopen is recorded (an `audit_events` row in real mode; a visible in-app log in demo mode) with actor and reason.

**Residual risk, named rather than hidden**: a manager who doesn't think to check the cross-edit log could still be misled by the board's appearance alone when manually picking tip participants. The reason requirement makes cross-edits visible in the normal flow of using the board, not just in a log a manager has to remember exists — but this is a real, accepted trade-off, not a claim that the risk is eliminated.

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
- a server can write a table-allocation entry against **any** active column, not only their own (Feature 011), and `assigned_by` cannot be spoofed to another identity;
- pause/remove/reorder/clear on the allocation board remain manager/owner-only;
- all table-allocation writes are denied for every role, owner included, once that service date's tip pool is finalized, and the finalized → draft reopen transition is manager/owner-only;
- tip allocation visibility limited to the authenticated person;
- exact reconciliation of interval cents, including remainder cents;
- passcode uniqueness enforced within one organization and allowed reuse across organizations;
- passcode lockout resets insertable only by manager/owner roles, denied to `anon` and plain `authenticated`.

Run Supabase database advisors after schema changes and before production release.

## Incident basics

1. Disable the affected operation or revoke the compromised key.
2. Preserve Vercel, Supabase, and audit evidence.
3. Identify tenant and row scope without copying unnecessary personal data.
4. Patch with a regression test.
5. Rotate credentials and invalidate sessions when exposure is plausible.
6. Record the decision and prevention change in an ADR or postmortem.
