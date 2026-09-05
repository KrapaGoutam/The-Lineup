# Feature 001 — Passcode app shell and restaurant hours

Status: implemented (interactive reference UI and production schema)

## User outcome

A worker opens a restaurant-specific URL or QR code, enters one passcode, and lands in a role-appropriate workspace. A person without an account can submit a manager-reviewed access request. Every workspace page shows restaurant-local time and a countdown to closing.

## In scope

- One-field passcode sign-in; the restaurant slug in the URL supplies tenant context.
- Employee, manager, and owner capability sets.
- Manager-reviewed request-access fallback.
- Configurable IANA time zone, weekly operating hours, and closing countdown.
- Demo mode with deterministic sample identities when Supabase is not configured.
- Server-only passcode lookup, salted/peppered locator, generic errors, attempt tracking, and lockout.

## Non-goals

- Public self-registration, shared master passcodes, email/SMS OTP, or a universal backdoor.
- Payroll identity verification or advanced MFA.

## Data and authorization

- `passcode_credentials` is browser-inaccessible and maps a restaurant-scoped locator to a Supabase Auth identity.
- PINs are unique inside one organization. The PIN itself is never stored in application tables.
- Access requests are validated inserts through a server route and manager-only reads/updates.
- Owner is an individual membership role. Manager privileges come from membership rows, never client metadata.

## UI states

- Sign-in, invalid PIN, temporarily locked, request access, request sent, offline/server error, and authenticated.
- Restaurant name remains visible so the worker knows which location they are entering.
- All primary controls meet a 44 px touch target; validation is announced with `aria-live`.

## Risks

- Numeric PINs are low entropy. Mitigate with restaurant scope, 6-digit employee and 8-digit manager guidance, attempt throttling, lockout, generic responses, HTTPS, and secure cookies.
- Hosted authentication cannot be exercised until Supabase environment values and seed identities exist.

## Tests

- Passcode format and role capability unit tests.
- Schema/RLS checks for credentials, requests, invites, and operating hours.
- Playwright manager and employee login flows in demo mode.

## Codex build prompt

Implement only this approved shell contract. Preserve tenant isolation, keep secret keys server-only, support a no-environment demo, run the repository quality gate, and record remaining hosted-service setup separately.
