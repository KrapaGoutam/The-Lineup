# V2-009 B3 Local Handoff: Personal PIN, Multi-Org Login & Gateway Authority Preservation

## Boundary and baseline

- **Branch:** `feature/v2-009-b3-personal-pin-gateway`
- **Worktree:** `.tmp/v2-009-b3-f6`
- **Base `development` SHA:** `7865e0cb24a7ae605cbece91cd929957497edd2c` (PR #328 merged)
- **Local Supabase Database:** Started at ledger 95 (`20261114162724`), now at ledger 96 (`20261114173000`).
- **Hosted DEV State:** UNVERIFIED. In accordance with strict owner authorization boundaries, no remote or hosted databases were accessed, queried, or mutated during this task.
- **Target:** `development`
- **Authorization boundaries:** Local implementation and validation only. No remote push, no PR creation, no PR merge, no hosted database migrations, no deployments, no production changes, issue #257 remains open.

---

## Architecture & Implementation Overview

### 1. Root Cause Resolution for F-6 Multi-Org PIN Defect

In Supabase Auth (`auth.users`), exactly one password exists per identity. Previously, passwords were synthesized using organization-scoped hashing (`authpw:${orgId}:${pin}`). When a user belonged to multiple organizations, resetting or rotating credentials in Org A corrupted login in Org B. Furthermore, the database enforced a table-wide `UNIQUE (synthetic_email)` constraint on `public.passcode_credentials`, making it impossible for a user with the same canonical Auth identity (using a random UUID-derived alias such as `${randomUUID()}@passcode.internal`) to hold active credentials across multiple organizations.

### 2. Forward Migration (Ledger 95 → 96) & Local Environment Evidence

- **Forward migration file:** `supabase/migrations/20261114173000_v2_009_b3_passcode_credentials_multi_org.sql`
- **Dropped constraint:** `passcode_credentials_synthetic_email_key` from `public.passcode_credentials`.
- **Preserved constraints:** `(organization_id, profile_id)` UNIQUE and `(organization_id, locator)` UNIQUE remain strictly enforced per organization.
- **Added indexes:**
  - `passcode_credentials_synthetic_email_idx` on `public.passcode_credentials (synthetic_email)`.
  - `passcode_credentials_profile_id_idx` on `public.passcode_credentials (profile_id)`.
- **Local Migration & Ledger Evidence:**
  - Local Docker database ledger reached 96.
  - Local ledger entry 96 was inserted manually into `supabase_migrations.schema_migrations`.
  - Its migration-history `statements` value is `NULL`.
  - Independent review confirmed the expected local end-state schema (constraint dropped, indexes created, composite unique constraints intact).
  - The historical `npx supabase db push` outcome could not be conclusively verified from migration history.
  - Hosted DEV migration state remains **UNVERIFIED**.
- **Mandatory Read-Only Hosted DEV Preflight (Owner Authorization Required Before Hosted Rollout):**
  Before any hosted migration rollout, the owner must authorize a narrowly scoped, read-only Hosted DEV preflight that checks:
  1. The actual migration ledger head on Hosted DEV (previously expected to be 91).
  2. Whether `passcode_credentials_synthetic_email_key` still exists in Hosted DEV.
  3. Whether the hosted schema differs in any way from the expected pre-B3 state.
     _(Note: Hosted DEV must not be assumed unchanged merely because a project link was absent in local tooling; no hosted database was contacted during this local task)._

### 3. Canonical Person-Level Auth Password & Identity Binding (F-5 & F-2)

- Exported `createPersonAuthPassword(profileId: string, passcode: string)` in `src/lib/passcode-security.ts`.
- Uses domain separation `authpw:person:${profileId}:${passcode}` HMAC-SHA256 hashed with the server-side pepper `APP_PIN_PEPPER`. Binding `profileId` into HMAC input guarantees distinct Auth passwords for any two individuals sharing the same 4-digit PIN (F-5).
- Credential verification in `verifyPasscode` (`src/features/auth/data/passcode-verify.ts`):
  1. Tries canonical person-level password first (`createPersonAuthPassword(profileId, passcode)`).
  2. Falls back to legacy organization-derived password (`createAuthPassword(orgId, passcode)`).
  3. Falls back to legacy raw 4-digit passcode (`passcode`).
  4. Returns `{ ok, verifiedVia: "person" | "derived" | "legacy", session, user }`.
- Fail-closed identity binding (F-2): Every password verification verifies that the authenticated user (`data.user.id` / `session.user.id`) matches `credential.profile_id`. A mismatch immediately signs out the session and fails closed.
- Opportunistic upgrade: When a user authenticates via `"derived"` or `"legacy"`, `migrateLegacyAuthPassword` automatically updates the Supabase Auth user password to `createPersonAuthPassword(profileId, passcode)`.
- Registration: `src/app/api/auth/register/route.ts` creates Auth user and sets `createPersonAuthPassword(userId, passcode)` on newly registered users.
- Kiosk actions: `src/features/kiosk/actions/kiosk-clock-actions.ts` leverages `verifyPasscode` with person-level precedence, opportunistic migration, and fail-closed identity verification.

### 4. Multi-Org Credential Synchronization on Login

- In `src/app/api/auth/passcode/route.ts`:
  - Fixed stale error message on line 52 to `"Enter a valid 4-digit passcode."` (was "6–8 digits").
  - On successful passcode login, finds all active memberships for the user across organizations.
  - For any active organization where `passcode_credentials` do not exist yet, atomically creates the credential row using `createPasscodeLocator(orgId, passcode)`. Catches duplicate locator (Postgres 23505) gracefully without disrupting authentication.

### 5. Multi-Org Locator Rotation, Rollback Recovery & Probe Reconciliation (F-1 & F-3)

- In `src/features/auth/data/passcode-rotation.ts`:
  - `rotatePasscodeCredential` discovers all `passcode_credentials` for the `profileId` across all organizations.
  - Validates potential locator collisions across all member organizations prior to mutation.
  - Updates each credential locator sequentially; if any locator update fails, immediately rolls back previously updated locators via compensating reverts.
  - Failed Locator Rollback (F-1): Tracks updated credentials and checks each compensating revert result. Only returns `recoverable` when consistent rollback is verified. If any revert fails, returns `locked_out`.
  - Optimistic Concurrency (F-1): Compensating reverts match on `.eq("id", id).eq("locator", expectedLocator)` to prevent clobbering concurrent rotations.
  - Ambiguous Auth Update Reconciliation (F-3): On Auth password update error (e.g. GoTrue network drop/timeout), probes the new password with an isolated client. If confirmed applied, reconciles successfully `{ ok: true }`. If confirmed not applied, safely reverts locators and returns `recoverable`. If indeterminate, returns `locked_out` without blind locator reverts.

### 6. Authority Preservation on PIN Reset

- In `src/app/api/auth/passcode/reset/route.ts`:
  - Inspects whether the target user has active memberships in other organizations or an Overall administrative role (`overall_roles`).
  - If target user is multi-org or holds an Overall role, the caller must have `overall_roles.role = 'owner'`.
  - Single-organization managers attempting to reset a multi-org member receive HTTP 403 (`"This team member belongs to multiple organizations. Only an Overall administrator can reset their passcode."`).
  - Authorized resets rotate credentials across all member organizations and write audit events to each affected organization.
  - Collision retry loop: Automatically retries random passcode generation up to 3 times if a generated passcode encounters a recoverable locator collision.

### 7. Post-Login Gateway

- Integrates with existing V2-003 context resolution and organization/location switcher (`use-context-switch`, `org-location-switcher`).

### 8. Migration, Rollback & Deployment Contract (F-4 / R-1A)

#### Mandatory Owner Acceptance Item Before Hosted Rollout: One-Way Authentication Transition

- **One-Way Password Transition:** B3 migrates existing Supabase Auth passwords to profile-specific personal PIN-derived passwords (`authpw:person:${profileId}:${passcode}`).
- **Pre-B3 Application Incompatibility:** Once a user has authenticated and migrated to the person-level password scheme, pre-B3 application code (which attempts authentication via org-derived `authpw:${orgId}:${pin}` or legacy raw passcodes) may no longer authenticate that user.
- **Redeployment Lockout Risk:** Redeploying pre-B3 application code after users have migrated could lock out migrated users from signing in.
- **Irreversibility in Auth:** Database rollback cannot reverse Supabase Auth (`auth.users`) password updates. GoTrue passwords exist in an independent auth service store and are not transactional with PostgreSQL schema rollbacks.
- **Database Rollback Boundary:** Re-imposing the earlier database constraint `passcode_credentials_synthetic_email_key` is **not** a safe general rollback once multi-org credential rows exist, as doing so would violate uniqueness and fail if any user belongs to multiple organizations.
- **Supported Recovery Strategy:** The supported recovery strategy is a forward fix or a verified compatible-fallback application release that preserves person-level authentication fallback. No automatic credential downgrade, password rewrite, or destructive rollback is authorized.

#### Deployment Ordering

1. **Apply Database Migration First:** Execute `20261114173000_v2_009_b3_passcode_credentials_multi_org.sql` (Ledger 96: drop table-wide `synthetic_email` uniqueness, create composite/performance indexes). Applying the migration first is strictly backward-compatible because existing pre-B3 application code only writes single-org credentials and respects `(organization_id, locator)` uniqueness.
2. **Deploy Application Code Second:** Deploy V2-009 B3 runtime code supporting personal PINs, fallback verification, and multi-org synchronization. Deploying the application before the migration would risk runtime 23505 errors if multi-org synchronization triggers while the table-wide constraint remains active.

#### Legacy Transition & Opportunistic Upgrade

Existing users continue authenticating via pre-B3 org-derived passwords or raw passcodes without interruption. On successful authentication, `migrateLegacyAuthPassword` opportunistically upgrades the Auth user password to the canonical person-level password (`createPersonAuthPassword(profileId, passcode)`).

#### Failure Recovery & Concurrency

- Optimistic row matching (`.eq("id", id).eq("locator", expectedLocator)`) ensures compensating reverts do not overwrite newer concurrent rotations.
- Auth update failures are probed using an isolated client: if the password change was applied before the network dropped, the rotation reconciles successfully; if confirmed unapplied, locators safely revert; if indeterminate, rotation reports `locked_out` to prevent split-brain state.

### 9. Non-Blocking Security Follow-ups (Carried Forward for Release Gate)

The following items were identified during independent security review, classified as non-blocking (no confirmed account takeover or unauthorized-action path), and carried forward for prioritization during the later release gate:

- **N-1 (Auth Probe Error Classification):** Refine Auth probe error handling in `passcode-rotation.ts` to distinguish `invalid_credentials` from other HTTP 400 Auth errors.
- **N-2 (Forward Locator Reconciliation):** Ambiguous forward locator update network errors may benefit from probe-style reconciliation prior to initiating rollback.
- **N-3 (Extended GoTrue Negative Binding Tests):** Add additional real-GoTrue negative integration tests explicitly targeting cross-profile spoofing scenarios.
- **N-4 (Concurrent Rotation Lockout Mitigation):** Refine concurrency handling for edge-case near-simultaneous rotations across multiple sessions to minimize recoverable vs locked_out friction.
- **N-5 (Random PIN Collision Error Differentiation):** Enhance reset route random PIN retry loop to explicitly distinguish 23505 collision codes from other database errors with targeted unit coverage.
- **Existing Operational Follow-ups:** Address background membership-sync race edge cases and minor error message information-disclosure hygiene.

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

- `tests/local/v2-009-b3-personal-pin.local.test.ts`: 7/7 PASS against real Docker PostgreSQL and GoTrue:
  - Multi-org creation with shared synthetic email across Org A and Org B.
  - Login to Org A with personal PIN.
  - Login to Org B with the same personal PIN.
  - Backward compatibility: legacy derived and raw passcodes log in and opportunistically migrate.
  - Passcode rotation across Org A and Org B simultaneously.
  - Reset authority preservation: single-org manager denied HTTP 403; Overall Owner authorized HTTP 200.
  - F-5 & F-2: Two users with the same PIN produce distinct Auth passwords and bind strictly to their own identity.
- `tests/local/team-set-member-active.local.test.ts`: 5/5 PASS
- `tests/local/kiosk-authority.local.test.ts`: 7/7 PASS

### 3. Focused Unit Tests

- `src/features/auth/data/passcode-verify.test.ts`: 8/8 PASS (including F-5 person-specific derivation and F-2 identity binding)
- `src/features/auth/data/passcode-rotation.test.ts`: 10/10 PASS (including F-1 rollback & locked_out, F-3 probe reconciliation & indeterminate recovery)
- `src/features/kiosk/actions/kiosk-clock-actions.test.ts`: 14/14 PASS (including F-2 identity binding failure)
- `src/app/api/auth/passcode/route.test.ts`: 3/3 PASS (including F-2 identity mismatch failure)
- `src/app/api/auth/passcode/reset/route.test.ts`: 3/3 PASS (including collision retry handling)

### 4. Quality Gates

- `npm run check` (Prettier, ESLint 0 warnings/errors, TypeScript `next typegen && tsc --noEmit`): Verified.
- `git diff --check`: Verified clean.
- Local DB ledger: 96, zero synthetic test orgs or users lingering in database.

---

## Independent Security Review Request

Please review the V2-009 B3 implementation read-only from base `7865e0cb24a7ae605cbece91cd929957497edd2c`.

Focus areas:

1. **Domain separation & profile binding (F-5):** Verify that `createPersonAuthPassword(profileId, passcode)` uses domain prefix (`authpw:person:${profileId}:`), guaranteeing distinct passwords even when PINs collide.
2. **Identity binding (F-2):** Confirm that `verifyPasscode`, `route.ts`, `change/route.ts`, and `kioskAuthenticatePinAction` strictly verify that the authenticated Auth identity matches `credential.profile_id` and sign out immediately upon mismatch.
3. **Rollback recovery & concurrency (F-1):** Review `rotatePasscodeCredential` for optimistic row matching (`.eq("id", id).eq("locator", expectedLocator)`) and fail-closed `locked_out` reporting if compensating reverts fail.
4. **Ambiguous Auth update reconciliation (F-3):** Review probe verification for GoTrue network failures to reconcile successfully if applied or revert safely if unapplied.
5. **Authority preservation:** Confirm that single-organization managers cannot reset the personal PIN of a team member who belongs to multiple organizations or holds an Overall role.
6. **Constraint safety & deployment contract (F-4 / R-1A / R-1B):** Verify migration ordering, one-way transition acceptance, and boundary guarantees.
