# V2-009 B3 Local Handoff: Personal PIN, Multi-Org Login & Gateway Authority Preservation

## Boundary and baseline

- **Branch:** `feature/v2-009-b3-personal-pin-gateway`
- **Worktree:** `.tmp/v2-009-b3-f6`
- **Base `development` SHA:** `7865e0c804f4460f9ddc27fd53b3f86eb49d0124` (PR #328 merged)
- **Local Supabase Database:** Started at ledger 95 (`20261114162724`), now at ledger 96 (`20261114173000`).
- **Target:** `development`
- **Authorization boundaries:** Local implementation and validation only. No remote push, no PR creation, no PR merge, no hosted database migrations, no deployments, no production changes, issue #257 remains open.

---

## Architecture & Implementation Overview

### 1. Root Cause Resolution for F-6 Multi-Org PIN Defect
In Supabase Auth (`auth.users`), exactly one password exists per identity. Previously, passwords were synthesized using organization-scoped hashing (`authpw:${orgId}:${pin}`). When a user belonged to multiple organizations, resetting or rotating credentials in Org A corrupted login in Org B. Furthermore, the database enforced a table-wide `UNIQUE (synthetic_email)` constraint on `public.passcode_credentials`, making it impossible for a user with the same canonical Auth identity (`synthetic_email = ${profile_id}@passcode.internal`) to hold active credentials across multiple organizations.

### 2. Forward Migration (Ledger 95 → 96)
- File: `supabase/migrations/20261114173000_v2_009_b3_passcode_credentials_multi_org.sql`
- **Dropped constraint:** `passcode_credentials_synthetic_email_key` from `public.passcode_credentials`.
- **Preserved constraints:** `(organization_id, profile_id)` UNIQUE and `(organization_id, locator)` UNIQUE remain strictly enforced per organization.
- **Added indexes:**
  - `passcode_credentials_synthetic_email_idx` on `public.passcode_credentials (synthetic_email)`.
  - `passcode_credentials_profile_id_idx` on `public.passcode_credentials (profile_id)`.

### 3. Canonical Person-Level Auth Password
- Exported `createPersonAuthPassword(passcode: string)` in `src/lib/passcode-security.ts`.
- Uses domain separation `authpw:person:${passcode}` HMAC-SHA256 hashed with the server-side pepper `APP_PIN_PEPPER`.
- Credential verification in `verifyPasscode` (`src/features/auth/data/passcode-verify.ts`):
  1. Tries canonical person-level password first (`createPersonAuthPassword(passcode)`).
  2. Falls back to legacy organization-derived password (`createAuthPassword(orgId, passcode)`).
  3. Falls back to legacy raw 4-digit passcode (`passcode`).
  4. Returns `{ ok, verifiedVia: "person" | "derived" | "legacy", session }`.
- Opportunistic upgrade: When a user authenticates via `"derived"` or `"legacy"`, `migrateLegacyAuthPassword` automatically updates the Supabase Auth user password to `createPersonAuthPassword(passcode)`.
- Registration: `src/app/api/auth/register/route.ts` sets `createPersonAuthPassword(passcode)` on newly registered users.
- Kiosk actions: `src/features/kiosk/actions/kiosk-clock-actions.ts` leverages `verifyPasscode` with person-level precedence and opportunistic migration.

### 4. Multi-Org Credential Synchronization on Login
- In `src/app/api/auth/passcode/route.ts`:
  - Fixed stale error message on line 52 to `"Enter a valid 4-digit passcode."` (was "6–8 digits").
  - On successful passcode login, finds all active memberships for the user across organizations.
  - For any active organization where `passcode_credentials` do not exist yet, atomically creates the credential row using `createPasscodeLocator(orgId, passcode)`. Catches duplicate locator (Postgres 23505) gracefully without disrupting authentication.

### 5. Multi-Org Locator Rotation with Compensating Reverts
- In `src/features/auth/data/passcode-rotation.ts`:
  - `rotatePasscodeCredential` discovers all `passcode_credentials` for the `profileId` across all organizations.
  - Validates potential locator collisions across all member organizations prior to mutation.
  - Updates each credential locator sequentially; if any locator update fails, immediately rolls back previously updated locators via compensating reverts.
  - Updates the Supabase Auth user password to `createPersonAuthPassword(newPasscode)`. If the Auth password update fails, executes compensating reverts across all locators. Surfaces severity: `"recoverable"` vs `"locked_out"`.

### 6. Authority Preservation on PIN Reset
- In `src/app/api/auth/passcode/reset/route.ts`:
  - Inspects whether the target user has active memberships in other organizations or an Overall administrative role (`overall_roles`).
  - If target user is multi-org or holds an Overall role, the caller must have `overall_roles.role = 'owner'`.
  - Single-organization managers attempting to reset a multi-org member receive HTTP 403 (`"This team member belongs to multiple organizations. Only an Overall administrator can reset their passcode."`).
  - Authorized resets rotate credentials across all member organizations and write audit events to each affected organization.

### 7. Post-Login Gateway
- Integrates with existing V2-003 context resolution and organization/location switcher (`use-context-switch`, `org-location-switcher`).

---

## Evidence

### 1. Database pgTAP Tests
- `supabase/tests/database/0087_b2_b3_multi_org_credentials.test.sql`: 13/13 assertions PASS.
  - Negative control: On ledger 95 (prior to migration), 6 of 13 assertions failed with 23505 unique constraint violation.
  - Post-migration: All 13 assertions pass.
- Existing pgTAP suites:
  - `0086_b2_direct_location_rls.test.sql`: 56/56 PASS
  - `0085_b2_anon_privileges.test.sql`: 22/22 PASS
  - `0084_team_membership_lifecycle_boundary.test.sql`: 30/30 PASS

### 2. Local Database & GoTrue End-to-End Suite
- `tests/local/v2-009-b3-personal-pin.local.test.ts`: 6/6 PASS against real Docker PostgreSQL and GoTrue:
  - Multi-org creation with shared synthetic email across Org A and Org B.
  - Login to Org A with personal PIN.
  - Login to Org B with the same personal PIN.
  - Backward compatibility: legacy derived and raw passcodes log in and opportunistically migrate.
  - Passcode rotation across Org A and Org B simultaneously.
  - Reset authority preservation: single-org manager denied HTTP 403; Overall Owner authorized HTTP 200.
- `tests/local/team-set-member-active.local.test.ts`: 5/5 PASS
- `tests/local/kiosk-authority.local.test.ts`: 7/7 PASS

### 3. Focused Unit Tests
- `src/features/auth/data/passcode-verify.test.ts`: 6/6 PASS
- `src/features/auth/data/passcode-rotation.test.ts`: 7/7 PASS
- `src/features/kiosk/actions/kiosk-clock-actions.test.ts`: 13/13 PASS
- `src/app/api/auth/passcode/route.test.ts`: 2/2 PASS
- `src/app/api/auth/passcode/reset/route.test.ts`: 3/3 PASS

### 4. Quality Gates
- `npm run check` (Prettier, ESLint 0 warnings/errors, TypeScript `next typegen && tsc --noEmit`): PASS (exit code 0).
- `npm run test` (full Vitest suite): 307 files passed, 4,186 passed, 7 skipped, 0 failed.
- `npx next build --webpack`: PASS (exit code 0).
- `git diff --check`: PASS (clean).
- Local DB ledger: 96, zero synthetic test orgs or users lingering in database.

---

## Independent Security Review Request

Please review the V2-009 B3 implementation read-only from base `7865e0c804f4460f9ddc27fd53b3f86eb49d0124`.

Focus areas:
1. **Domain separation:** Verify that `createPersonAuthPassword(passcode)` uses a distinct domain prefix (`authpw:person:`) from legacy organization-scoped hashing (`authpw:${orgId}:`), preventing cross-scheme ambiguity.
2. **Authority preservation:** Confirm that single-organization managers cannot reset the personal PIN of a team member who belongs to multiple organizations or holds an Overall role, preventing unauthorized cross-tenant lockout or privilege alteration.
3. **Multi-org rotation atomicity & reverts:** Review `rotatePasscodeCredential` in `src/features/auth/data/passcode-rotation.ts` for pre-check collision detection, sequential updates, and compensating reverts in case of partial failures.
4. **Constraint safety:** Verify that dropping `passcode_credentials_synthetic_email_key` does not introduce tenant leakage or bypass `(organization_id, locator)` and `(organization_id, profile_id)` uniqueness.
5. **Multi-org credential sync:** Verify that opportunistic credential creation in `src/app/api/auth/passcode/route.ts` safely checks active memberships and handles potential 23505 collisions without breaking the user login session.
