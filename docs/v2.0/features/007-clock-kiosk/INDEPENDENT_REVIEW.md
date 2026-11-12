# Independent security review receipts

This is the verbatim first-round report from a separate authenticated Claude Code process (`--model sonnet --effort high`, actual model `claude-sonnet-5`). Only the committed public source snapshot at the stated SHA was supplied; local-file tools were disabled. The public snapshot was assembled with `git show` from the pushed commit. Reviewer-reported test results are implementer evidence, not tests executed by the reviewer.

Implementer resolution: M1 is addressed by the following commit: `clientIdentifier` is required, missing/blank identifiers return `PAIRING_UNAVAILABLE` before any RPC, and three negative tests cover empty, whitespace, and absent runtime values. L1?L4 are recorded as low-severity residual observations, not concealed as resolved. Final-head follow-up review and exact-head CI receipts are maintained in [PR #324](https://github.com/KrapaGoutam/The-Lineup/pull/324), avoiding a self-referential reviewed-SHA claim in the commit that stores this receipt.

---

## Independent Security Review — V2-007 Clock Kiosk

**Reviewer:** Claude Sonnet 5 (model ID `claude-sonnet-5`), reasoning effort: high (this review)
**Reviewed SHA:** `cf4d1a9f266c7c72684c7ba8eca764d837c087a6` (as stated; I did not fetch it myself — I reviewed exactly the file contents pasted into this conversation, nothing else)
**Scope limitation:** I have no tools in this task and reviewed only the text supplied above. I did not execute any test, did not fetch the repo, and did not verify the stated SHA against GitHub myself. All "Newly executed evidence" in `CONTINUATION_VALIDATION.md` was run by the implementer, not me — I only checked that the pasted source is _consistent_ with those claims.

Not reviewed (not supplied, so these claims are unverified by me): `attendance_clock_in/out/break_start/break_end` SQL, `attendance_sessions` RLS policies, `domain/kiosk-device.ts`, `kiosk-pairing-identity.test.ts` contents beyond what's referenced, migrations 0073–0076 pgTAP files.

### Critical findings

None identified in the supplied source.

### High findings

None identified in the supplied source.

### Medium findings

**M1 — Shared fallback client identifier in the data-layer pairing consumer.**
`src/features/kiosk/data/kiosk-device-data.ts:150`:

```ts
const clientIdentifier = params.clientIdentifier ?? "tablet-pairing-client";
```

This contradicts the receipt's claim ("There is no shared unknown-client fallback in the request path") at the data-layer, even though it's true for the _current_ request path. The only production caller (`pairKioskDeviceAction`) always supplies a real hashed identifier and short-circuits to `PAIRING_UNAVAILABLE` before this function is reached if `getTrustedClientIdentifier` returns `null`, so **this is not exploitable today**. But the literal is live code, exercised directly by `kiosk-lifecycle-security.test.ts:702-714`, which asserts the RPC is called with `p_client_identifier: "tablet-pairing-client"`. If any future caller (admin tool, retry path, test harness reused in prod) invokes `consumeKioskPairingCode` without an identifier, all such callers would share one failure bucket — one attacker tripping 10 failures would lock out every legitimate caller using that default, which is a cross-tenant DoS vector of exactly the kind this migration was built to eliminate. Recommend making `clientIdentifier` a required (non-optional) parameter so a missing trusted identity is a compile-time error, not a silent shared bucket.

### Low findings

**L1 — Reassigning a revoked device silently reactivates it without a status-change audit entry.**
`supabase/migrations/20261111120000_kiosk_device_registration.sql:591-643` (`kiosk_reassign_device`). The function never checks `v_device.status`; it unconditionally sets `status = 'active'` and only logs `before/after` on `location_id` (lines 634-639), not the revoked→active transition. Real-world impact is limited because `device_token_hash` is nulled in the same statement, so the device cannot authenticate until re-paired through a brand-new pairing code (which creates a _new_ device row) — but the audit trail for this transition is incomplete.

**L2 — Cookie `secure` flag gated on `NODE_ENV`.**
`src/features/kiosk/data/kiosk-cookie.ts:51,107`. Standard Next.js idiom; confirm non-production/preview deployments that are still network-reachable set `NODE_ENV=production` (true by default for `next build`), otherwise cookies could traverse plain HTTP there.

**L3 — Unhandled fire-and-forget promise.**
`src/features/kiosk/data/kiosk-device-data.ts:296-300`, the `last_seen_at` update has no `.catch`. Telemetry-only, no security impact, but will log unhandled-rejection noise on failure.

**L4 — Single root secret, multiple cryptographic roles.**
`KIOSK_SESSION_SECRET` is reused for cookie HMAC signing, AES-256-GCM key derivation (`SHA-256(secret)`, not a formal KDF), and the pairing-source HMAC. Each use has a distinct domain-separation string, which mitigates the obvious reuse risks, but a formal per-purpose HKDF subkey derivation would be stronger hygiene than hashing the raw secret.

### Verified-sound areas (direct code evidence, not just the receipt's narrative)

- `kiosk_consume_pairing_code`/`kiosk_record_pairing_failure`: `revoke ... from public, anon, authenticated; grant ... to service_role` only, confirmed in SQL (lines 486-487, 302-303); obsolete 2-arg overload explicitly dropped (line 306) before recreation; pgTAP (lines 456-469) independently checks `aclexplode` for PUBLIC/anon/authenticated grants on these two functions specifically.
- Advisory lock (`pg_advisory_xact_lock` on `'kiosk-pairing:' || p_client_identifier`) is acquired **before** the rate-limit count query, closing the TOCTOU race; a separate `for update` row lock on the pairing code guarantees one-time consumption independent of the per-source lock — these are two different serialization mechanisms, correctly layered.
- All failure branches in `kiosk_consume_pairing_code` return structured `jsonb`, never `raise exception`, so attempt-ledger inserts commit even on denial (verified by reading every branch, lines 325-497).
- `getTrustedClientIdentifier` fails closed on non-Vercel runtime, missing/malformed/multi-value headers, hashes the normalized source IP with a domain-separated HMAC, and never touches `x-forwarded-for`/`x-real-ip`/payload identifiers (`kiosk-pairing-identity.ts:12-24`).
- `kioskAuthenticatePinAction`: every rate-limit query error returns `rate_limit_unavailable` (fail closed) before any auth decision; the success-attempt insert happens **before** `setKioskSessionCookie`, so a failed ledger write on success throws `KioskAttemptAccountingError` and no session cookie/DB row is created (`kiosk-clock-actions.ts:430-460`) — matches receipt claim 5 exactly.
- Employee JWT is never serialized to the browser: stored as AES-256-GCM ciphertext in `kiosk_sessions.encrypted_access_token`, browser only holds an HMAC-signed opaque token (`kiosk-crypto.ts`, `kiosk-cookie.ts`). `timingSafeEqual` used for signature verification.
- `kiosk_devices`/`kiosk_pairing_codes`/`kiosk_pairing_attempts`/`kiosk_sessions`: RLS forced, grants revoked from `public/anon/authenticated` except narrow manager `SELECT` on the first two tables; all mutation paths go through `SECURITY DEFINER`, `set search_path = ''` functions with fully schema-qualified references (no search_path hijack surface).
- Cross-tenant isolation in `kioskAuthenticatePinAction` is enforced by scoping every query to `device.organizationId` derived from the already-verified bearer-token lookup, never from client-supplied parameters.
- `kiosk-cookie.test.ts:104-114` bit-flip tamper test matches the receipt's claimed fix (flips a bit rather than occasionally no-op replacing a byte with itself).

### Residual deployment assumptions (as stated by the implementer, assessed as reasonable but not independently verifiable by me)

- Vercel edge is the sole trusted ingress; `x-vercel-forwarded-for` is assumed non-spoofable because it's edge-injected and the code additionally gates on `process.env.VERCEL === "1"` (a server-side env var, not a header, so not client-settable). I cannot independently confirm Vercel's edge guarantee from source alone — this is a platform trust assumption, not a code defect.
- Clients sharing one NAT/egress IP share one rate-limit bucket (acknowledged, consistent with the identity design).
- Distributed real-source-address brute force needs infrastructure-level controls (WAF/upstream rate limiting); this migration only isolates _tenants_ from each other, not a determined distributed attacker from the service as a whole.
- Secret rotation invalidates all sessions and rate-limit buckets — consistent with a single root secret design (see L4).

### Decision

**APPROVE IMPLEMENTATION FOR OWNER REVIEW**, with one recommended pre-merge hardening item (M1) and four low-severity cleanups (L1–L4) noted above. I found no Critical or High severity, no actual exploitable path in the supplied source as deployed, and the stated fail-closed/rate-limiting/boundary properties check out against the code, not just the narrative. This is not a merge authorization and does not substitute for owner approval of the DEV migration application, exact-head CI, or a hosted acceptance pass with physical hardware, all of which remain pending per the document's own gating.
