# V2-008 Track 2 — Hosted DEV Approval Package (PROPOSAL — NOTHING HERE IS APPROVED)

> **2026-11-13 update:** D-3 Option A and D-7C (shelve migration 92) APPROVED by the owner. Manual Preview's two human-operated Staff Assignments are **PENDING** (none performed). See HANDOFF 00000000.1 and track2/D3_OPTION_A_OPERATOR_PROCEDURE.md. Migration 92 is shelved / not for deployment.


Prepared 2026-11-13 from a fresh **read-only** Hosted DEV snapshot (SELECT-only inside
`begin read only`; no RPC, no write, no fixture). This is a proposal for the owner. It authorizes
nothing: every "approval" below is separate, and approving one does not approve another.

## 0. Headline

**The first candidate organization, `the-monks`, needs NO role backfill.** Its planner verdict on
live data is `NOOP`: 5 active members, 5 active `location_memberships` rows, 0 to insert, 0
exceptions, 0 permission changes. Its module matrix is already fully explicit (9 rows, 0 to insert)
and its Attendance mode is unset (nothing to migrate). Therefore:

| Approval | Needed for `the-monks`? |
| --- | --- |
| D-7C-1 deploy migration 92 (privileged maintenance functions) to Hosted DEV | **NOT REQUIRED** — nothing to execute |
| D-7C-2 execute one organization backfill manifest | **NOT REQUIRED** — verified no-op; an executor run would only exercise the tool |
| D-7C-3 real module-configuration changes | **NOT REQUIRED** — unless the owner wants to *change* the existing matrix (decision D-5) |
| D-7C-4 Attendance-mode change | **NOT REQUIRED** — recommendation is to leave unset (decision D-6) |
| G-2 push / PR / integrate the Track 2 code | Optional, independent; owner's call (section 8) |

The executor is only ever needed for an organization that has real unmapped members. On Hosted DEV
that is **only** `the-lineup-manual-preview` (decision D-3), which is *not* a pilot by instruction.

## 1. Target and verified facts (Hosted DEV `opmujepkemwcdxxorhfd`, read at 2026-11-13)

| Fact | Value |
| --- | --- |
| Migration ledger | **91**, max `20261113100000`; the three Batch C versions present; **no Track 2 version** |
| Function fingerprint / 8 schema categories | equal to expected ledger-91 state (`hosted_dev_readonly_check.mjs --expect 91`: all `ok`) |
| Track 2 functions present on Hosted DEV | **0** (`migration_compat_execute_*` do not exist) |
| V2-004 enforcement | `staged` (unchanged) |
| Finance (`attendance_financial_activation`) | **off** |
| Overall roles | 0 |
| Module configs | 14 rows: 9 for `the-monks` + 5 for inactive `ZZ V2007*` fixtures |
| Attendance modes (49 locations) | 44 `NULL`, 4 `internal_the_lineup`, 1 `external` — both real locations are `NULL`; the other 5 belong to inactive V2007 fixture organizations |
| Active locations | **44**: 42 in `V2 Harness`/`V2 Harness Other` organizations (slugs `v2h-*`, `v2ho-*`; fixtures) + **2 real** |
| Real organizations | `the-monks` and `the-lineup-manual-preview` only (+ 3 inactive `ZZ V2007*` fixtures) |
| Active profiles in more than one organization | 0 |
| Neon identity links | 0 for both real organizations (Neon not contacted) |

The old "44 active locations" inventory is still accurate in total, but note that harness *location
names* no longer start with `V2 Harness`; classify by organization slug.

### 1.1 Pilot assessment: `the-monks` ("The Monk's DEV")

| Item | Verified value |
| --- | --- |
| Organization id | `c5e8ad9c-39be-4344-bbdb-ae84306f0134` (slug `the-monks`) |
| Location | `a5d46f61-cf64-4b96-8d9f-41d6812d561c` ("DEV Location", America/Chicago, active, not archived) — the only location |
| Members | 5 active, 0 inactive |
| Legacy → location mapping (already present) | `07e5ec04…` general_manager → manager; `b3add6a2…` owner → manager; `aa875ec1…`, `f38ad7ef…`, `fd9d323b…` server → staff |
| Multi-role / multi-location conflicts | none (each member has exactly one legacy role and one location) |
| Unassigned active members | 0; fallback cliff already crossed (rows of any status exist) |
| Planner verdicts | role `NOOP`; modules `REPORT_ONLY` (9 existing, 0 insert, 0 override); attendance `REPORT_ONLY` (mode unset, 0 native sessions, 0 links) |
| Role-plan state fingerprint | `9e143db40fd2e437f22e29c7c7af42696a836c35c2249159b81502a3c08c2f33` (sha256 over the read snapshot; only meaningful for this exact state) |
| Capability model | no member gains or loses anything; the owner's existing row maps to location `manager` (pre-existing, not created by a migration) |
| Existing module matrix | `bar_inventory` enabled; `table_allocation`, `tasks`, `schedule`, `tips`, `team`, `attendance`, `payroll`, `recipes` disabled. Origin of these rows was not investigated; whether they are *intended* is an owner question (D-5) |

Real profile ids are deliberately truncated here (the repository is public). Full snapshot and a
hash-only Hosted DEV table fingerprint were saved **outside git** in
`%LOCALAPPDATA%\TheLineup-DEV-Backups\V2-008-TRACK2-20261113\` (`monks-role-snapshot.json`,
`hosted-dev-ledger91-before.json`) so a later session can `--compare` against them.

### 1.2 Contrast: what an `APPLY` would look like (`the-lineup-manual-preview`, NOT proposed)

Live planner verdict for Manual Preview: `APPLY` (2 members, 0 location rows, single location →
the N=1 ladder default would insert 2 rows). It is **not** approved or proposed: D-3 is undecided
and the verdict was reached with *no manifest at all* — the exact situation the executor's
manifest requirement exists for. It is recorded only so nobody mistakes `APPLY` for approval.

## 2. Migration state

| Item | Value |
| --- | --- |
| Hosted DEV ledger | 91 |
| Local ledger | 92 (clean `supabase db reset` replay passed after this session's change) |
| Migration 92 file | `supabase/migrations/20261113120000_v2008_track2_backfill_executor.sql` |
| Migration 92 sha256 (**this session**) | `56ed695581cdc0a6f3f17c823212ddcfe82ca6b1bb3a8f4afdbc91af8fae234d` |
| Previous sha256 (commit `4c55de1`, superseded) | `89ce376472fef11bc4286c96f785596602fcf7770c40b759be397e36fdd2e60b` |
| Deployed anywhere hosted? | **No** (Hosted DEV, Production: not applied) |
| Correction made this session | the role-backfill function now takes `SHARE ROW EXCLUSIVE` on `memberships` and `location_memberships` (replacing row locks) so concurrent *new* rows cannot slip in before commit — see `TRACK2_EXECUTOR.md` section -2 |
| Expected deployment effect | creates two `SECURITY DEFINER` functions, revokes `public/anon/authenticated`, grants `service_role`; **no table, enum, policy, trigger or index touched; no data read or written by the DDL**. Function-only, like Batch C |
| Trap | `database.yml` runs `supabase db push` on any push to `main` touching `supabase/migrations/**`. Merging this to `development` applies nothing, but **promoting it to `main` auto-deploys it to Production** and the `production` environment has no required reviewers (V2-009 blocker). Do not promote until a deliberate release decision |

## 3. Why approval is still needed even though the first pilot is a no-op

Nothing in this document is needed for `the-monks`. If the owner nevertheless wants to proceed to
a real backfill for some other organization later, sections 4-7 are the contract.

## 4. Authorization and target-identity contract for any live execution (SPECIFIED, NOT IMPLEMENTED)

Findings that make the current wrapper unsuitable for Hosted DEV:

1. `requireApprovedManifest` accepts `status: "approved"` and a non-empty `approvedBy`: plain JSON
   anything able to write a file can set. It catches mistakes (wrong org, stale hash, no manifest)
   but is **not** proof that the owner approved.
2. `assertLoopback` is hostname-only; `localhost:54321` can be a tunnel to Hosted DEV. A
   credential tripwire (`assertNotHostedCredential`) was added this session; it is partial (opaque
   `sb_secret_` keys are not inspectable) and is not an identity proof.
3. The SQL function records `actor` and `appliedAt` in its **return value only**; there is no
   persisted audit row, so evidence of what ran lives in whatever the operator saves.

A live run must therefore satisfy ALL of the following before the loopback guard is replaced by a
dedicated, separately reviewed live path (which must **not** be a relaxation of `assertLoopback`):

| Requirement | Mechanism |
| --- | --- |
| The real owner decided | An **owner-signed approval artifact**: the owner signs (ed25519, private key never on an agent-accessible machine path; public key pinned in the repo) a canonical JSON payload `{environment:"hosted-dev", projectRef, organizationId, manifestSha256, planStateHash, scope, executorMigrationSha256, issuedAt, expiresAt}`. The executor verifies the signature with the pinned key. An agent that can write files still cannot forge it. |
| Exact organization / delta / scope | All of the above are inside the signed payload; the executor recomputes `manifestSha256` and the plan hash and refuses on any difference, and refuses any row whose location is not in the signed organization |
| Exact environment | The target is identified **independently of the URL**: project ref taken from the service key's JWT `ref` claim and cross-checked against the Management API project lookup, plus a read-only fingerprint check (`hosted_dev_readonly_check.mjs --expect <n>`) immediately before; Production ref hard-refused |
| Source-state freshness | Re-snapshot immediately before; the plan state hash must equal the signed one; approval expires (recommended ≤ 24 h) and is invalid after any ledger change, any manifest edit, or any change to migration 92's sha256 |
| Who may invoke | Only a human operator session holding the DEV service key and the Management API token; never CI. Approval of a manifest is not approval of the invoker |
| Audit of what actually ran | Operator saves, outside git: signed approval, the receipt returned by the function (`insertedCount`, `alreadyPresentCount`, `actor`, `appliedAt`), and before/after verifier fingerprints; recommended hardening for D-7C-1: persist an append-only receipt row inside the same transaction |

Until this exists, **live execution is blocked** (this is the one open engineering item before a
first real write, independent of any owner decision). It is not required for the `the-monks` no-op.

## 5. Approved-manifest requirements (when a real `APPLY` exists)

- An owner-approved per-person × per-location × role mapping for exactly one organization
  (profile ids, never names/emails), against a fresh snapshot whose fingerprint is recorded.
- Expected after-state: rows inserted/updated, zero-op rows, permission gained/lost per person (the
  planner's `capability` block), remaining exceptions (must be 0), intentionally-unassigned list
  (owner-signed).
- No reactivation of inactive rows, no overwrite, no mutation outside the named organization.
- Approval fields and evidence: signed artifact per section 4.

## 6. Deployment controls (reuse the proven Batch C route)

1. Fresh read-only preflight (verifier `--expect 91`, hash snapshot).
2. Encrypted DPAPI backup of the target Hosted DEV project; restore-validated container rehearsal.
3. Rehearse as role `postgres` (never `supabase_admin`): apply migration 92, run `0082` (37/37)
   and the executor/concurrency Vitest files against the restored copy.
4. Rollback-only Hosted probe if wanted (`hosted_rollback_probe.mjs`).
5. Apply (function-only; verifier `--expect 92` must report only the two new functions changed).
6. Run the executor once for the one approved organization (own approval, section 7).
7. Postflight: re-plan → `NOOP`; compare fingerprints; enforcement still `staged`, Finance off.

Transaction boundaries: one transaction per organization (advisory lock, then
`SHARE ROW EXCLUSIVE` on both tables, 5 s `lock_timeout`). Concurrent-write protection: section -2
of `TRACK2_EXECUTOR.md`. **Rehearse the table lock on the restored copy while a writer is active**
and confirm registration is not left failing — it queues, it must not error.
Rollback / forward fix: a failed call writes nothing; a committed call is reversed only by an
explicit owner-approved forward correction (deactivating a row), never by deletion.

## 7. Distinct approvals (none granted)

| ID | Scope | Needed for first pilot (`the-monks`)? | Status |
| --- | --- | --- | --- |
| D-7C-1 | Deploy migration 92 to Hosted DEV | No | Not requested |
| D-7C-2 | Execute ONE exact approved organization manifest | No (NOOP) | Not requested; also blocked by section 4 |
| D-7C-3 | Real module-config changes | No | Not requested |
| D-7C-4 | Attendance-mode changes via the existing audited RPC under a real operator session | No | Not requested |
| G-2 | Push / PR / merge of Track 2 code into `development` | No | Not requested |

## 8. Production isolation and stop conditions

- Production, Neon, GitHub `production` environment protection: untouched. **No required
  reviewers on `production` remains a V2-009 release blocker.**
- Stop before any real write if: a required owner decision is missing; mapping is incomplete or
  ambiguous; the manifest fingerprint differs from live; approval or target cannot be independently
  verified (section 4); the ledger differs unexpectedly; a P0/P1 is open; backup/restore cannot be
  met; or any mutation would extend beyond the approved organization.
