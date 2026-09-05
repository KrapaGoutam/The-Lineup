# Feature 001 — Passcode app shell and restaurant hours

Status: implemented (interactive reference UI and production schema)

## User outcome

A worker opens a restaurant-specific URL or QR code, enters one passcode, and lands in a role-appropriate workspace. A person without an account can self-register and is signed in immediately as a server (Feature 005 — superseded the original manager-reviewed access-request flow). Every workspace page shows restaurant-local time and a countdown to closing.

## In scope

- One-field passcode sign-in; the restaurant slug in the URL supplies tenant context.
- Employee, manager, and owner capability sets.
- Configurable IANA time zone, weekly operating hours, and closing countdown.
- Demo mode with deterministic sample identities when Supabase is not configured.
- Server-only passcode lookup, salted/peppered locator, generic errors, attempt tracking, and lockout.

**Superseded by Feature 005** (2026-09-05): self-registration is no longer out of scope — it replaced the manager-reviewed request-access fallback originally described here. See `docs/features/005-self-serve-registration.md` for the current contract; this was a deliberate, explicit reversal of the decision below, not an oversight.

## Non-goals

- ~~Public self-registration~~ — superseded by Feature 005; self-registration now grants an active server membership immediately. Shared master passcodes, email/SMS OTP, and a universal backdoor remain non-goals.
- Payroll identity verification or advanced MFA.

## Data and authorization

- `passcode_credentials` is browser-inaccessible and maps a restaurant-scoped locator to a Supabase Auth identity.
- PINs are unique inside one organization. The PIN itself is never stored in application tables.
- Registrations (renamed from access requests, Feature 005) are validated inserts through a server route; managers have read-only access to the history, there is no more approve/decline step.
- Owner is an individual membership role. Manager privileges come from membership rows, never client metadata.

## UI states

- Sign-in, invalid PIN, temporarily locked, organization-wide lockout (Feature 006), register, offline/server error, and authenticated.
- Restaurant name remains visible so the worker knows which location they are entering.
- All primary controls meet a 44 px touch target; validation is announced with `aria-live`.

## Risks

- Numeric PINs are low entropy — now 4 digits everywhere (Feature 006), which is materially weaker than the original 6–8 digit guidance. Mitigated by restaurant scope, per-fingerprint and organization-wide rate limiting that degrades instead of denying (see `docs/features/006-four-digit-passcodes.md` and `docs/SECURITY.md`), generic responses, HTTPS, and secure cookies.
- Hosted authentication cannot be exercised until Supabase environment values and seed identities exist.

## Tests

- Passcode format and role capability unit tests.
- Schema/RLS checks for credentials, requests, invites, and operating hours.
- Playwright manager and employee login flows in demo mode.

## Codex build prompt

Implement only this approved shell contract. Preserve tenant isolation, keep secret keys server-only, support a no-environment demo, run the repository quality gate, and record remaining hosted-service setup separately.
