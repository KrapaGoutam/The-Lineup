# Feature 006 — Four-digit passcodes and tightened rate limiting

Status: shipped

**Implementation note**: same division-of-labor change as Feature 005 — Claude implemented this batch directly, Codex is not in this loop. See 005 for the full note.

## User outcome

Passcodes shrink to 4 digits everywhere (faster entry on a phone mid-shift), while login stays resistant to brute-force guessing through tightened, two-layer rate limiting, and two people in the same restaurant can never end up holding the same passcode.

## Scope

**In**: passcode-format regex, demo account codes, login field (`maxLength`, help copy, `type="tel"` for a reliable numeric keypad — folds in the mobile keypad requirement from Feature 007 for this one field), two-layer rate-limit tightening, one new supporting index, cross-referencing the collision guard already specified in Feature 005 (not re-implemented here).

**Out**: passcode reset/rotation flow, MFA, changing the HMAC locator derivation itself (unaffected by passcode length — it hashes whatever string it's given).

## Acceptance criteria

- [x] `isValidPasscode` accepts exactly 4 digits; rejects 3, 5, 6, 8-digit, and non-digit input.
- [x] The login field accepts at most 4 digits and opens a numeric keypad on a real mobile browser (`type="tel"`).
- [x] A fingerprint that fails 5 times within 15 minutes is locked out for that window (down from 8).
- [x] An organization that accumulates 30 failed attempts, across _any_ fingerprints, within a rolling 15 minutes, blocks passcode logins for that organization — **except** for a fingerprint with a successful login there in the last 24 hours, which is unaffected.
- [x] While an org-wide lockout is active, any already-signed-in manager/owner in that organization sees a "Clear login lockout" control and can lift it immediately by supplying a reason, recorded as an audit event.
- [x] Two different people in the same organization cannot both hold the same 4-digit passcode (proven via Feature 005's registration collision test and the existing `passcode_credentials` unique constraint).
- [x] The same 4-digit passcode is allowed across two different organizations (the locator is HMAC'd with `organization_id`, already namespaced).

## Rate limiting — revised design: degrade, don't deny

A 4-digit space is 10,000 combinations. A hard organization-wide cap is dangerous on its own: a fingerprint is derived from public IP (`clientFingerprint()` in `passcode/route.ts`), and a phone's public IP resets for free every time it reconnects to WiFi or cellular — no spoofing required (confirmed against Vercel's own docs: Vercel's edge overwrites `x-forwarded-for` with the real connecting IP and does not forward a client-supplied value, so this isn't a header-spoofing bug — it's just that a phone's _real_ IP is cheap to change). That means one person on one phone can trivially present as many different fingerprints, burn a handful of failures from each, and trip a hard organization-wide cap during dinner service — a worse outcome than the brute-force risk the cap exists to prevent.

**Options evaluated**:

- _Progressive delay per fingerprint instead of a hard cap_ — rejected as the sole mechanism. Since a fingerprint resets for free on reconnect, a delay attached to one fingerprint costs a motivated (or even just clumsy) person nothing, and it does nothing at all for the distributed-across-fingerprints case the organization-wide layer exists for.
- _Org cap that triggers a CAPTCHA or cooldown screen_ — rejected. A CAPTCHA is a new third-party dependency this hobby-tier, passcode-only app doesn't otherwise need (AGENTS.md's dependency discipline), and it adds friction to every legitimate sign-in during the trigger window. A cooldown screen without CAPTCHA is the existing hard block with better copy — it still denies everyone.
- _Org cap that exempts fingerprints with a recent successful login on that device_ — **adopted**. A restaurant's shared host-stand device/network succeeds at signing someone in multiple times over a normal shift, so it stays continuously exempt; a device that has never succeeded — the realistic shape of an outside attacker — is what the cap actually catches.
- _Manager override path_ — **adopted alongside it**, as the escape hatch for the exemption's edge cases: a new hire's first login of the day, the restaurant's public IP just changed, or someone signing in from personal cellular data rather than restaurant WiFi.

These two are combined, not chosen alone, because exemption handles the overwhelmingly common case silently and override handles the rare remaining case explicitly — together they satisfy "degrades instead of denies," which neither one alone does.

**Design**:

- Per-fingerprint cap: unchanged from above — 5 failed attempts / 15 min, still a hard 429 for that one device. Its blast radius (one device) is proportionate to the mistake, so it keeps denying, same as today just tighter.
- Organization-wide cap: still triggers at 30 failed attempts / 15 min across all fingerprints, but a fingerprint with a `succeeded = true` row for that organization within the last 24 hours is exempt from it — its own requests are evaluated only against the unchanged per-fingerprint cap.
- A non-exempt fingerprint hitting a tripped organization-wide cap gets a distinguishable response (`429` with `code: "org_lockout"` in the body, plus `Retry-After`) so the client can render specific copy rather than the generic wrong-passcode error.
- **What a server standing at the terminal at 7pm actually sees and does**: in the common case (their device/network has signed someone in recently) — nothing different at all; login just works, the cap is invisible to them. In the rare case (their device hasn't succeeded there recently, and the cap is currently tripped) — the login screen shows: _"Too many failed attempts across this restaurant right now. Ask a manager who's already signed in to clear the lockout, or try again shortly."_ Any manager/owner already signed in to that organization sees a "Clear login lockout" banner/control the moment they open the app during an active lock; tapping it asks for a short reason and lifts the lockout immediately for everyone, recorded as an audit event. If no manager is reachable, the fallback is the unchanged wait-out-the-window behavior.
- A reset doesn't delete any `passcode_login_attempts` history (audit rows stay append-only, per `docs/SECURITY.md`) — it inserts a `passcode_lockout_resets` row, and the organization-wide count query only counts failures after `greatest(window_start, last_reset_at)`.

## UX contract

- Passcode field: 4-digit max length, `type="tel"`, updated help text ("Enter your 4-digit restaurant passcode").
- Org lockout, non-exempt device: inline `aria-live` message as quoted above, replacing the generic error state for this specific case.
- Org lockout, signed-in manager/owner: a persistent, dismissible-only-by-clearing banner ("Sign-in is temporarily limited for this restaurant") with a "Clear login lockout" button opening a short reason field, matching the existing override-reason pattern used elsewhere in the app.
- Success (reset applied): banner disappears for all subsequently loaded sessions; no page reload required for the manager who cleared it.

## Data and authorization

- Tables/columns: new `passcode_lockout_resets (organization_id, cleared_by, reason, cleared_at)`, append-only.
- Constraints/indexes: new `passcode_attempts_org_limit_idx on passcode_login_attempts (organization_id, attempted_at desc) where not succeeded` (organization-wide failure count); new `passcode_attempts_recent_success_idx on passcode_login_attempts (organization_id, fingerprint, attempted_at desc) where succeeded` (the 24-hour exemption check).
- Grants/RLS: `passcode_lockout_resets` — insert restricted to `owner`/`general_manager`/`shift_manager` via the existing `private.has_org_role` helper (same pattern as `board_events_insert_member`); select open to `authenticated` members of the org (so the client can tell whether a lock is currently active without needing the service-role route). `passcode_login_attempts` itself stays service-role-only, unchanged.
- Audit events: a lockout reset writes one `passcode_lockout_resets` row (itself append-only, immutable) and one `audit_events` row (actor, org, reason), per AGENTS.md's "manual overrides require a reason and audit event."
- Idempotency/concurrency: two simultaneous requests from the same fingerprint could both pass the pre-check before either's insert lands — acceptable for a soft rate limit; not correctness-critical enough to warrant a lock.
- Time-zone behavior: n/a.

## Implementation map

- Routes: `src/app/api/auth/passcode/route.ts` (call the new pure thresholds; add the exemption + organization-wide queries); new `src/app/api/auth/clear-lockout/route.ts` (or a Server Action) for the manager override, using `getClaims()` to verify the caller is an authenticated manager/owner of that organization.
- Feature modules: `src/features/auth/domain/passcode.ts` (regex); new `src/features/auth/domain/rate-limit.ts` (pure threshold + exemption predicates, unit-testable without the DB).
- Migration: one new migration adding the two indexes and the `passcode_lockout_resets` table/RLS above.
- Generated types: deferred, same as Feature 005 (real hosted linkage out of scope this batch).

## Test plan

- Unit: `passcode.test.ts` updated for the 4-digit boundary; new `rate-limit.test.ts` covering the per-fingerprint threshold, the organization-wide threshold, the 24-hour exemption boundary, and the reset-shifts-the-counting-window logic.
- Component: login field `maxLength`/`type` assertions; org-lockout banner rendering for manager vs. non-manager, exempt vs. non-exempt device.
- Database/RLS: pgTAP — both new indexes exist; `passcode_lockout_resets` insert restricted to manager roles and denied to `anon`/plain `authenticated`; same-org duplicate-locator insert fails, cross-org duplicate passcode succeeds (shared proof with Feature 005).
- Playwright: `dashboard.spec.ts` sign-in calls updated to the new 4-digit demo codes; a wrong-passcode error case; a demo-mode simulation of the org-lockout banner and clear action (demo mode has no real backend, so this exercises the in-memory equivalent, consistent with how demo mode already works elsewhere).
- Manual viewports: covered by Feature 007 for the shared input.

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: additive index only — fully backward compatible.
- Backfill: none.
- Rollback limit: dropping the index is safe and instant, no data implications.

## Decisions and risks

- **Decision**: exact thresholds — 5/15min per fingerprint (hard block, unchanged blast radius), 30/15min per organization (soft — exempts recently-successful devices, manager-clearable rather than a blanket deny).
- **Decision**: 24-hour recency window for the exemption — long enough to cover a shift-to-shift gap, short enough that a credential deactivated yesterday doesn't leave a permanent hole.
- **Risk**: a restaurant whose public IP legitimately changes mid-day (ISP reassignment, switching from WiFi to a mobile hotspot) loses its exemption and could get capped despite being entirely legitimate staff. Mitigation: this is exactly what the manager-override path is for — flagging it so it's understood as "handled by the escape hatch," not eliminated.
- **Risk**: the manager-override control is itself a target — anyone who compromises or socially engineers a manager's already-signed-in session could clear a lockout they shouldn't. Mitigation: unchanged from the app's existing trust model (a compromised manager session is already a larger problem than this one control), and every use is reason-required and audit-logged.
- Open questions: none remaining.
