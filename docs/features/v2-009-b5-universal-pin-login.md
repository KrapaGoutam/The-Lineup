# V2-009 B5 — Universal personal PIN login

Status: approved for local implementation by the owner's self-contained B5 handoff.
Program #248; gate #257; base development `5e142e82b3f0048a1a998deb6be99a36c2174e20`.

## Outcome and scope

At `/`, enter only a masked four-digit personal PIN. Authenticate the canonical
person, then reuse V2-003 to auto-open one eligible context, offer grouped choices
for several, or show explicit no-access/retry states. Restaurant links remain
the transition path. Kiosk and authorization semantics remain unchanged.
No hosted migration, account alteration, deployment, merge, or B1–B4 campaign.

## Decisions: data, authorization, and recovery

- Lookup: server-only HMAC-SHA256 `global-pin:v1:<PIN>` with APP_PIN_PEPPER.
  Verify B3's person-bound Auth password and exact returned profile/session ID.
- Uniqueness: service-only ownership claims with a unique locator, plus one
  canonical account row per profile. Database functions reserve new ownership
  and serialize each person's lifecycle. Old ownership stays reserved until
  completion. RLS enabled; no anon/authenticated table or RPC access.
- Lifecycle: reserve, block personal login, run B3's checked compensation/Auth
  probe, finalize atomically. Recoverable rollback restores ownership; uncertain
  outcomes retain the durable operation and both claims, failing closed.
  No expiration steals a reservation. Interrupted operations require quiesced,
  privileged reconciliation; never guess passwords or enable a weaker fallback.
- Enrollment: verify an existing restaurant credential first, then claim/rotate
  that PIN to canonical B3 state. Collision requires authenticated current-PIN
  proof plus a different PIN. No locator copying, PIN search, duplicate identity,
  bulk reset, or automatic organization membership.
- Routing: root resolves without a default organization. Fresh document navigation
  after session cookies settle replaces the refresh/profile hydration dependency.
- Abuse: serialized database reservations count in-flight requests; per-client
  budgets cover universal/legacy login, registration and enrollment. Platform
  failure pressure reduces new-client budgets without locking all restaurants.
  Generic login failures; collision disclosure only during lifecycle operations.
- Audit: durable lifecycle events contain profile, actor, operation and outcome,
  never PINs, passwords or locators. Existing reset/change tenant audits remain.
- Provisioning: registration and bootstrap reserve global ownership. Staff
  membership creation assigns no PIN. Future provisioning must use this contract.

## Acceptance and UX

- [x] Root: The Lineup / Enter your 4-digit PIN; existing keypad/masking,
      auto-submit/error clearing; no tenant/username selector or public registration.
- [x] Success reaches a fresh workspace/picker/no-access/error boundary;
      operational loaders run only after canonical context authorization.
- [x] Multi-org and Overall users see eligible contexts and retain switching.
- [x] Legacy links enroll after proof; collisions offer controlled PIN change.
- [x] Concurrent claims have one winner; every assigning path reserves ownership.
- [x] Failed/ambiguous Auth updates cannot expose a mismatched global mapping.
- [x] Kiosk, tenant isolation, cookies and stale-context protections pass.

Existing semantic controls/tokens, mobile/tablet touch targets, labels, error
announcements and keyboard access. No new animation/dependency/timezone behavior.

## Validation and rollout

Focused unit/component, real local Auth/Postgres concurrency and failure tests,
pgTAP grants/RLS, browser authentication/context tests; check, test and one build.
Reuse B1–B4 evidence for unchanged surfaces. Add one CLI-generated forward
migration after local ledger 96; preserve old migrations. No backfill. Forward
fix rather than dropping ownership after use; old apps ignoring blocked operations
are unsafe rollback targets. Hosted ledger 91 stays outside this implementation.
Enrollment approval, backup and rehearsal precede owner-authorized DEV migration.

Four-digit PINs have only 10,000 values and a hard global population ceiling.
Production remains blocked on trusted edge/client attribution, distributed abuse
challenge/rate controls, and step-up for sensitive Overall Owner actions. Passing
source tests is not Production readiness. Independent narrow security review is
required before release.
