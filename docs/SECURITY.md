# Security Model

## Trust boundaries

- Browser input, cookies, URL state, and client-computed rotation recommendations are untrusted.
- Server Actions validate payload shape and identity but are not the final authorization layer.
- Postgres grants, constraints, RLS, and transactional functions enforce data access and invariants.
- Vercel and GitHub secrets are deployment credentials and never enter the repository.

## Authentication

- Login asks only for a restaurant-scoped 6–8 digit passcode; there is no username field.
- The restaurant URL/slug supplies the first lookup scope. A keyed HMAC locator identifies the credential without storing the raw passcode.
- The same passcode is verified by Supabase Auth against a synthetic internal email account. Synthetic emails are never shown to users.
- Rate-limit failed attempts by restaurant and a keyed hash of the request address; do not store the raw address. Use a generic error so account existence is not leaked.
- New users submit an access request. A manager must approve and provision the account; public self-registration does not grant membership.
- Use Supabase Auth with the current `@supabase/ssr` pattern.
- Refresh sessions in `proxy.ts` and verify protected server access with `getClaims()`.
- Do not use the user object from an unverified client session as authorization evidence.
- Keep sensitive access tokens short-lived and revoke sessions before destructive user removal when strict invalidation is required.

## Authorization

- Authorization derives from `memberships` and location capability assignments.
- Never authorize with `raw_user_meta_data` or `user_metadata`.
- Every exposed table has RLS enabled.
- Every update policy has `using` and `with check`.
- RLS policy functions wrap stable identity calls with `select` and use indexed columns.
- Views exposed to browser roles use `security_invoker = true`.
- `SECURITY DEFINER` is prohibited by default. An exception requires a private schema, explicit identity checks, fixed empty search path, revoked public execute, and security review.

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
- server writes limited to their active table-allocation column;
- tip allocation visibility limited to the authenticated person;
- exact reconciliation of interval cents, including remainder cents.

Run Supabase database advisors after schema changes and before production release.

## Incident basics

1. Disable the affected operation or revoke the compromised key.
2. Preserve Vercel, Supabase, and audit evidence.
3. Identify tenant and row scope without copying unnecessary personal data.
4. Patch with a regression test.
5. Rotate credentials and invalidate sessions when exposure is plausible.
6. Record the decision and prevention change in an ADR or postmortem.
