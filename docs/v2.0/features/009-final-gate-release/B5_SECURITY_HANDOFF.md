# B5 source security and migration handoff

Base: B4 `5e142e82b3f0048a1a998deb6be99a36c2174e20`.
Branch: `feature/v2-009-b5-universal-pin-login`; target: `development`.
This is source implementation, not a deployed feature or Production approval.

## Changed trust boundaries

Root submits PIN only. HMAC-SHA256 uses APP_PIN_PEPPER and `global-pin:v1:` domain
separation. Lookup material and account names never reach the browser before Auth.
Universal verification uses only B3's person-bound password, checks both Auth user
and session IDs, then rechecks registry revision/pending state after verification.
V2-003 resolves authorization separately. Fresh document navigation removes the
pending-profile hydration dependency; picker controls wait for hydration.

Four new tables have RLS and service-only grants; three RPCs are invoker functions
with public execution revoked. Auth email comes from server `getUserById`, without
granting database access to auth.users. Profile-row locking serializes changes;
locator PK arbitrates competing claims. Both old and candidate PINs stay reserved
until confirmed settlement. Uncertain Auth or incomplete compensation retains the
operation and blocks both personal entry paths. Kiosk still verifies all supported
schemes but no longer writes opportunistic upgrades that could race personal changes.

Registration, bootstrap, self-change, manager reset and legacy enrollment reserve
global ownership. Team membership creation and Overall role provisioning assign no
PIN. Future personal provisioning must use this lifecycle. Reset privilege and
cross-org tenant audits retain B3's boundaries; global events record actor, profile,
operation and outcome without credential material. Multi-org synchronization adds
compatibility rows after enrollment, never another Auth identity.

## Legacy contract and owner-facing limits

No bulk backfill, PIN search/recovery, duplicate identity or real-user reset.
Unenrolled users must use an existing `/r/<slug>` link once. After successful proof,
their PIN is claimed and upgraded under the durable operation. A collision sends
the verified session to `/auth/enroll`, requiring current-PIN proof and a different
PIN. All compatibility locators and the person-bound Auth password are updated.
Membership and location assignments are unchanged.

Root cannot identify an unenrolled person from an organization HMAC. Its generic
failure and static compatibility instructions do not falsely assert account absence.
Existing users are **not all immediately universal-login-ready**. Owners must
approve the transition and communicate existing links before rollout. Unenrolled
legacy PINs can collide until enrollment; global uniqueness covers enrolled
personal credentials. Inactive identities retain ownership; release/reuse policy
and the hard ceiling of 10,000 PINs require owner review before broader onboarding.

## Interrupted-operation recovery

Do not expire claims, clear operation IDs or blindly retry an uncertain Auth write.
There is no public recovery bypass, including manager reset of an unsettled record.

1. Quiesce credential writers for the affected identity; ensure the original worker
   stopped. Obtain an approved private recovery point and inspect the account,
   operation, claims and all compatibility rows using privileged tooling.
2. Obtain an old or candidate PIN privately and process it only in server memory.
   Probe using an isolated, non-persisting Auth client with exact profile binding.
   Try the person scheme first; genuine pre-enrollment state may need an existing
   supported organization/raw scheme. Never search the PIN space or log inputs.
3. Match its global HMAC to canonical or pending ownership. If neither matches or
   Auth is uncertain, keep it blocked and escalate for an owner-authorized recovery.
4. In one DB transaction, lock the profile, check the exact operation ID and restore
   **every** compatibility locator to that derived from the verified PIN and its
   organization. Require expected-row matches and uniqueness. Call
   `finish_personal_pin_change` with `p_apply=true` for verified pending PIN, or
   `false` for verified canonical PIN. Any failure rolls back. Enrollment with no
   canonical locator may roll back only after old legacy Auth/locators are verified;
   it stays unenrolled. Do not send plaintext PINs/passwords to SQL or logs.
5. Reverify exact Auth identity, ownership and compatibility before resuming writers.
   Keep the lifecycle events and a private incident record.

## Abuse controls and Production blockers

Database admission happens before lookup/Auth and counts concurrent in-flight
requests. Per hashed ingress IP: eight failures/in-flight requests per 15 minutes;
registration three/hour. Authenticated enrollment/self-change share eight/15 minutes
and require current-PIN proof. At 100 platform failures/in-flight requests in five
minutes, unknown-client budgets drop to two (registration one); recently successful
clients retain normal budgets. No blanket platform lockout or public reset exists.
Normal quota expiry permits recovery. Define private retention/monitoring before
hosted rollout; do not clear attempts to bypass throttling.

**Production NO-GO:** many ingress IPs can still search this tiny namespace. Verify
trusted header overwrite/attribution and add rehearsed edge challenge/admission
controls before Production. Shared NATs share quotas; trusted device proof needs
review. Four-digit PINs are not strong secrets or MFA. Sensitive Overall Owner
actions require a separately approved step-up implementation before Production.

## Migration, rollback and review

One forward migration `20261114210116_v2_009_b5_global_pin_registry.sql` expands
local ledger 96 to 97. No old migration, Auth user, membership or assignment is
rewritten. Only locally generated B5 types are added, preserving baseline GraphQL
and reviewed nullability declarations.

Hosted DEV is reported at ledger 91, five prior migrations pending. This session
performs no hosted operation. Source ahead of schema fails closed; a B5 preview
against that ledger cannot validate universal login. Do not apply migration 92 or
any hosted migration in this task. Enrollment approval, DEV backup/rehearsal,
explicit DEV migration authorization and manual existing-QA login acceptance are
separate gates. Main/Production remain outside this implementation.

Prefer forward fixes: B3 code ignores pending ownership and is unsafe as a rollback
target after operations exist. Retain registry/claims/audits; do not drop them to
restore an earlier app. Independent review should cover changed B5 lookup/claim
races, binding, compensation/interruption, enrollment proof, quota bypass/DoS,
kiosk write removal, step-up and rollout limits. Reuse the supplied B4 evidence:
67/67 tenant sweep, 64/64 role matrix, 4/4 auth seam; these were not repeated.
Local browser checks cover PIN → cookie → picker → persisted context → workspace.
Neon/hosted operational data, deployed ingress and owner step-up remain unverified.

## Post-review corrections and retained observations

Finding A: universal Auth success now requires either a recognized current Overall
role (using V2-003's canonical normalizer), or an active credential and active
membership for the same profile and organization. Query failures clear the new
session and return 503; ordinary deactivation returns generic 401. No location
assignment is invented and the context resolver remains unchanged.

Finding B: typed global_collision / organization_collision codes drive enrollment
routing and 409 responses independently of UI text. Unexpected database errors and
reconciliation_required remain distinct. Organization collisions release only the
current operation's candidate reservation after verified rollback; uncertain
operations retain their existing recovery restrictions.

**Deployment order hazard: B5 application code before its migration breaks BOTH
universal and legacy login: the global admission RPC runs first.** Use separately
approved migrations-first compatibility, backup and recovery planning. No rollout
is authorized by this correction. The five previously pending migrations plus B5
make six pending migrations against the reported Hosted DEV ledger 91.

Independent review nonblocking observations, retained without scope expansion:
C1 successful enrollment attempts still count toward failure pressure;
C2 actor deletion cascades audit rows; C3 kiosk ignores global pending operations
while retaining its credential/Auth proof boundary; C4 late Auth writes can require
availability recovery; C5 global attempts need retention planning; C6 failed
registration rollback can leave an orphaned claim requiring privileged recovery.
