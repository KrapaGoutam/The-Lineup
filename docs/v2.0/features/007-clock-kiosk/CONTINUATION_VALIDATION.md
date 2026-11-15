# V2-007 continuation validation

Status: **IMPLEMENTATION VALIDATED ? FINAL REVIEW/CI RECEIPTS IN PR #324**. This receipt supersedes earlier blanket approval and final-build claims. The [verbatim independent first-round review](INDEPENDENT_REVIEW.md) records the exact reviewed SHA and qualifications; the final-head follow-up verdict and CI links are maintained in the existing PR.

## Recovery and scope

- Existing worktree: `.tmp/v2-007-clock-kiosk`, branch `feature/v2-007-clock-kiosk`.
- Starting local, fetched remote feature, and PR #324 head: `32809ecbb404f44e1f5a01ea990329e1bb2b162a`.
- Fetched development: `c821487cf0344c516cb174a0c77abdde3792a92a`. No divergence or recovery conflict.
- All seven interrupted modifications were preserved in ignored `.tmp/continuation-recovery/antigravity.patch`. No reset, replacement worktree, or unrelated worktree edits.
- The recovered SQL already revoked authenticated consumption. Codex retained that correction and completed the source boundary, concurrency protection, tests, and accurate review status.

## Final security corrections

1. `kiosk_consume_pairing_code(text,text,text)` and `kiosk_record_pairing_failure(text,text)` deny PUBLIC, anon, and authenticated execution. Only the trusted service-role backend can invoke them. Obsolete consumption overloads are absent. Both run with a fixed empty search path; service credentials remain in server-only modules.
2. The action accepts a pairing code only. Its server-only identity helper requires `VERCEL=1` and a single valid IP from `x-vercel-forwarded-for`. It ignores payload identifiers, `x-real-ip`, and `x-forwarded-for`. Missing/malformed identity or a non-Vercel runtime denies pairing before any RPC. The helper lives outside the `use server` action exports.
3. The dedicated `KIOSK_SESSION_SECRET` keys a domain-separated HMAC of the canonical source IP. Attempt rows receive the digest, never a raw IP. There is no shared unknown-client fallback in either the request path or data layer. The data-layer identifier is required; absent or blank runtime values deny pairing without any RPC. [Vercel documents its edge forwarding-header contract](https://vercel.com/docs/headers/request-headers).
4. A transaction advisory lock serializes each source's failure count and write. A partial `(client_identifier, attempted_at)` index supports the 10-failure/15-minute window. A separate code row lock protects one-time consumption across different sources. Unknown, expired, reused, and throttled codes return structured failures so accounting commits.
5. PIN attempt-write errors now return `rate_limit_unavailable` on failed and otherwise valid authentication. No employee session is created if the success-attempt ledger write fails. Existing rate-query errors remain fail closed.
6. Generated consumption types were reconciled with isolated database introspection, removing the obsolete two-argument overload. No unrelated generated-schema changes were imported.
7. Two observed test defects were repaired: the Attendance future-punch fixture now derives its service date from that punch (midnight-safe), and the ciphertext-tampering test flips a bit instead of occasionally replacing a byte with its existing value.

The existing 15-minute one-time pairing code, four-digit PIN, native Clock In/Out and break RPCs, employee-only monthly report, device management/revocation/reassignment, opaque employee cookies, encrypted server JWTs, three-minute server TTL, and organization/location binding are retained. Location authorization continues to derive from stored device and membership records.

Residual deployment assumptions: ingress must be the Vercel edge; another hosting platform needs a separately reviewed trusted-source adapter. Clients behind one NAT share an allowance. Distributed real source addresses require infrastructure-level abuse controls; spoofed headers or payload identifiers cannot create new buckets. Secret rotation changes source buckets and invalidates employee sessions.

## Newly executed evidence

| Gate                        | Result and scope                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused kiosk Vitest        | 11 files, 96 tests PASS after independent M1 correction                                                                                                                                                                                                                        |
| Full Vitest                 | 294 files PASS; 3,979 tests PASS, 7 skipped before the three M1 negative tests; final-head CI runs the full suite                                                                                                                                                              |
| Kiosk pgTAP                 | 57/57 PASS, including actual anon/authenticated denial, service-role success, all privileged signatures/default PUBLIC grants, unknown/expired/reused codes, retained failures, source isolation, RLS, session uniqueness and revocation                                       |
| Canonical Attendance pgTAP  | 0073: 108/108, 0074: 66/66, 0075: 55/55, 0076: 53/53 PASS; authenticated subjects and cross-location/employee rules                                                                                                                                                            |
| Real PostgreSQL concurrency | PASS: one code creates one device/audit event across sources; concurrent unknown attempts at the tenth-failure boundary produce NOT_FOUND then RATE_LIMITED with 11 committed failures; concurrent session upserts leave one replacement token; synthetic fixture cleanup PASS |
| Playwright kiosk smoke      | 6/6 PASS across desktop Chromium, iPad WebKit, Pixel 7; demo pairing surface/keypad and manager navigation only                                                                                                                                                                |
| Production build            | `npx next build --webpack` PASS, 13 routes; `/kiosk` dynamic                                                                                                                                                                                                                   |
| Environment/source scans    | Tracked local-path check and non-production `.next` scan PASS                                                                                                                                                                                                                  |

Code quality and diff review passed. At source cf4d1a9, exact-head CI passed application, browser (346 desktop tests), clean Database (80 files / 3,189 assertions), and Vercel Preview. The follow-up source correction reuses unchanged SQL/browser evidence; final-head CI is recorded in the PR. The PR body is the external receipt for the resulting SHA and check URLs; no prior-head CI is treated as final-source validation.

The interrupted build had no recoverable success log or BUILD_ID. It was treated as unknown, not as a failed application build, and a fresh webpack build was executed. Older implementation-phase counts remain historical records only.

## Local database rehearsal qualifications

Docker target: `supabase_db_restaurant-roster`, PostgreSQL 17.6. A separate database, `lineup_kiosk_continuation_20261111`, was created from schema-only auth/public/private/storage/extensions definitions. No user or restaurant data was copied. The existing local restaurant and JobQuest databases were not reset or migrated.

Platform-owned object owners/default-privilege restoration required qualifications: ownership was omitted, and platform-role default privileges were not imported. Schema objects and explicit grants were restored before applying the final kiosk migration. The kiosk migration and role tests passed in that isolated database. This is a schema rehearsal, not proof of a clean replay of all repository migrations; the Database PR workflow supplies that separate clean-stack gate.

Run `node scripts/kiosk/test-local-concurrency.mjs` against the retained isolated database. The harness has a fixed local Docker/database target, creates synthetic fixtures, uses independent transactions, asserts lock contention and committed outcomes, and cleans its fixtures. Raw command logs, schema snapshot, generated-type comparison, and original recovery diff remain ignored under `.tmp/continuation-recovery/`.

## Hosted DEV acceptance package

- Project: `opmujepkemwcdxxorhfd` (`the-lineup-dev`, OP1.0 connection).
- Read-only migration ledger: 87 entries, latest `20261110203355_attendance_manual_entry`; kiosk migration absent.
- Migration: `supabase/migrations/20261111120000_kiosk_device_registration.sql`.
- SHA-256: `a83150c1abd5f2b143e5f29da33549dc7ef255727be2384b56ac5b1ddd531f82` (LF bytes).
- No Hosted DEV writes, Production access/writes, external Neon changes, main edits, financial activation, or enforcement changes occurred.

After confirming the final-head independent review receipt in PR #324, obtain explicit owner approval for this kiosk migration separately from prior Attendance approval. Recheck the DEV ledger and hash, review only this migration's application plan, and verify that the Vercel DEV deployment has the dedicated session secret and DEV binding without exposing secret values. Do not use unrestricted db push or migration-history repair.

After the approved DEV application, acceptance must exercise a new physical tablet pairing; direct anon/authenticated RPC denial; unknown/reused/expired codes; real deployed edge identity despite spoofed forwarding headers; four-digit PIN failure/success; Clock In/Out and breaks through V2-006; employee-only reporting/printing; timeout/Finish privacy; and revoke/reassign across locations. Check audit attribution and synthetic cleanup. Hosted acceptance has not been run because no kiosk deployment approval was given.

PR #324 must remain open. Development merge and any later main promotion require their separate owner approvals.
