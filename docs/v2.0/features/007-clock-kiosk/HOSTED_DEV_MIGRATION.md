# V2-007 owner-authorized Hosted DEV migration

November 12, 2026: **HOSTED DEV MIGRATION PASSED — READY FOR SYNTHETIC ACCEPTANCE APPROVAL**.

## Exact scope and target

Owner authorization in this Codex session covers only the approved kiosk migration, conditional on all preflights, followed by focused read-only schema/security and data reconciliation. No synthetic fixtures, hosted acceptance campaign, Attendance-mode activation, Vercel configuration, merge or V2-008 work is authorized.

- Hosted DEV: `opmujepkemwcdxxorhfd`, `the-lineup-dev`, organization `bacmegsdpcxrnfdpglub`, us-east-2, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003.
- Source/PR: `3c314682e1b211df3470eab290ac21acb1d3e7b3`, PR #324, `feature/v2-007-clock-kiosk`; source HEAD is unchanged by this deployment.
- Applied: `20261111120000_kiosk_device_registration.sql`.
- Verified file SHA-256: `a83150c1abd5f2b143e5f29da33549dc7ef255727be2384b56ac5b1ddd531f82`.
- Preview `dpl_4EQ5sPkUtEyeRK5azsaPNZLVhZEo` remained READY at that exact source, in the expected Vercel project and feature branch. No configuration/deployment change was made in this migration session.

## Recovery and drift preflight

Existing owner-private backup `dev-20261112T124845Z.zip.dpapi` is 500,694 bytes; ciphertext SHA-256 `97834208ee0585a20bb4fcb20bb110bc491c39dd9bb5c0d1be132831dcc567dc`. Existing ciphertext and all six component checksums were verified again in memory, without exporting a new backup or writing decrypted contents. Owner-only file ACLs were verified. The existing successful isolated 17.11 restoration and exact kiosk rehearsal remain applicable: 117 restored tables, canonical policies/grants/RLS, foreign keys, 339 relevant assertions and concurrency PASS. The two excluded managed migration-history datasets, Storage bytes, external secrets/platform settings and lack of a complete Auth/Storage service clone remain the original recovery qualifications; DPAPI recovery requires the owner's Windows profile/machine. Preserve the backup for at least seven days after successful DEV acceptance.

All 119 captured source table inventories were compared. All business data and application function, policy, relation-ACL, function-ACL and RLS fingerprints matched the backup. Three Auth table fingerprints differed. A further 58 column-level hashed comparisons established that only `users.updated_at`, `sessions.updated_at/refreshed_at`, and existing refresh-token `revoked/updated_at` fields changed. One new refresh token was created after capture, linked to its revoked parent and the same pre-existing user/session. Identity, credential and authorization fields were unchanged. This is routine existing-session token rotation, not material application/schema/identity drift; no backup refresh was needed or performed.

Immediately before application, DEV remained 87 migrations, latest `20261110203355`, with no kiosk tables. All 87 local/remote versions matched, and the only pending version was the approved kiosk migration. Finance remained OFF and enforcement STAGED. The pinned Supabase CLI 2.76.8 dry-run, in a task-owned runner with an explicit verified DEV link and 88 byte-identical source migrations, listed exactly that one file. No seed/role/include-all/history-repair options were used.

## Application and focused postflight

The same guarded CLI runner applied its verified plan successfully at approximately **2026-11-12 13:59 UTC**. The CLI managed the migration ledger normally; no manual history edit, retry, rollback or hosted restore was performed. Full CLI diagnostics are DPAPI-encrypted under the feature worktree's ignored `.tmp/`; the safe machine-readable receipt is `.tmp/hosted-kiosk-migration-receipt.json`.

| Check                           | Verified result                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger                          | **87 → 88**, latest `20261111120000`, exactly one entry named `kiosk_device_registration`; original 87 ledger rows unchanged                                                                                                                                        |
| New tables                      | `kiosk_devices`, `kiosk_pairing_codes`, `kiosk_pairing_attempts`, `kiosk_sessions`; all four empty                                                                                                                                                                  |
| RLS                             | Enabled and forced on all four tables                                                                                                                                                                                                                               |
| Policies                        | Exactly two authenticated manager/location-scoped SELECT policies on devices/codes; no public session/attempt policy                                                                                                                                                |
| Table privileges                | PUBLIC/anon have none; authenticated SELECT only on devices/codes, no direct writes on any kiosk table; service-role CRUD present                                                                                                                                   |
| Indexes                         | All **16** valid/ready: eight explicit indexes plus eight PK/unique indexes, including source-window throttling                                                                                                                                                     |
| Constraints                     | All **24** validated: four primary keys, four unique constraints, twelve foreign keys and four checks; required non-null fields present                                                                                                                             |
| Session/device/pairing contract | Unique device/code/session hashes; unique session per device; device status/name/reason checks; required tenant/location/person references; 15-minute code expiry, attempts default 0/max 5, device credential version default 1                                    |
| RPC security                    | Seven expected functions, all SECURITY DEFINER with empty search path; PUBLIC/anon execution denied; consume/failure RPCs deny authenticated and allow service_role; management/helper authenticated grants retained; obsolete two-argument consume overload absent |
| Existing data                   | All **118 pre-existing non-ledger tables** have identical counts/content fingerprints before/after application, including Auth, Attendance, Payroll, Tips, audit, memberships, locations and settings                                                               |
| Existing schema/security        | Function/policy/relation-ACL/function-ACL/RLS fingerprints unchanged after excluding the approved new kiosk objects                                                                                                                                                 |
| Activation                      | Finance **OFF**, enforcement **STAGED**; all existing active location Attendance modes still unconfigured                                                                                                                                                           |

Hosted Attendance sessions/breaks/events, Payroll periods/payments, and Tips pools/allocations were zero before and after; this is not a claim of populated hosted historical-finance acceptance. The prior isolated rehearsal supplies the separately recorded populated compatibility/security evidence. This session ran only read-only catalog, privilege, constraint/default and content reconciliation checks after deployment; no unrelated full suite or hosted fixture test was repeated.

## Acceptance gate

No issues require recovery action. Synthetic fixture provisioning and the 18-scenario hosted acceptance campaign need separate owner authorization before execution. No existing location mode was enabled, and no synthetic organization, employee, location, device, session or pairing attempt was created. Financial activation remains OFF, backend enforcement STAGED. Production and Neon were untouched; no Vercel change, PR merge, main merge or V2-008 work occurred. PR #324 remains open at the authorized source head.

These local execution receipts are intentionally not committed/pushed in this migration-only session; the expected source/Preview SHA remains unchanged. The older separate readiness branch and all prior backup/rehearsal/handoff artifacts remain preserved. Its earlier "migration unapplied" statements and the Preview receipt's pre-migration gate are historical and superseded by this exact migration receipt.
