# V2-008 — D-7C Owner Decision Packet (actual data/configuration backfill)

> **Resolved 2026-11-13:** no bulk backfill is needed on DEV; migration 92 is SHELVED (D1); remaining items are dispositioned in [DEV_ACCEPTANCE_RECORD.md](DEV_ACCEPTANCE_RECORD.md). Historical proposal below.

Prepared 2026-11-13 after PR #325 merged into `development`. **Proposal only: nothing here is approved, implemented or executed.** The security track (migrations 89–91) is finished; this packet covers the whole remaining V2-008 scope (Track 2) as **one** work package, not a new series of phases. It reuses the existing decision register ([OWNER_DECISIONS_REQUIRED.md](OWNER_DECISIONS_REQUIRED.md)) and the read-only planners in `scripts/migration-compat` ([planning kit](B2_B4_PLANNING_KIT.md)).

## 0. Current facts (verified, not assumed)

| Fact                            | State                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted DEV ledger / guards      | **91**; enforcement `staged`; Finance OFF; 0 Overall roles; 6 revoked kiosk fixtures; 14 module-config rows                              |
| DEV organizations/locations     | 33 organizations, 49 locations (44 active; 42 active are `V2 Harness` fixtures); DEV org slug `the-monks` / location "DEV Location"      |
| Attendance modes on DEV         | 44 unconfigured (`NULL`), 1 `external`, 4 `internal_the_lineup`                                                                          |
| Production                      | **Never inspected** (D-1). "Monks / Webster" is the documented Production pilot, **not verified** by any read-only check                 |
| Executor                        | **Does not exist.** Planners are dry-run only                                                                                            |
| Fallback cliff                  | The first `location_memberships` row (even inactive) switches the organization's legacy fallback off; partial backfill locks members out |
| GitHub `production` environment | No required reviewers: a merge to `main` touching migrations auto-runs `supabase db push`                                                |

## A. Organization / location mapping

Needed from the owner (each is an explicit list; nothing is inferred by name):

1. **Monks (Production):** authorize the read-only Production preflight (D-1) **or** supply the organization id, slug, the Webster location id and the member list manually (D-1 option c). Until then no Production manifest can be written.
2. **Manual Preview organization** `the-lineup-manual-preview` (2 members, 0 location rows): keep and assign (D-3a), keep unassigned (b), or retire (c). Recommendation: (a) if still used for QA, else (c).
3. **Unassigned existing users:** per organization, every active member must be _mapped_, _already present_ or **owner-signed unassigned** (the plan prints the loss of access). Owners/general managers with no location row currently see "No restaurant location assigned".
4. **Multi-location organizations:** an explicit person × location × role list (D-2c). No "all locations", no primary location.
5. **Real vs harness locations:** D-4 — archive the 42 `V2 Harness` locations through the reversible lifecycle path (recommended; never delete) as a **separate** approval.
6. **Missing/conflicting relationships:** the planner reports them; any unresolved item makes the organization **ineligible** for execution.

## B. Role backfill

- Ladder pending final owner sign-off (D-2): `owner → manager`, `general_manager → manager`, `shift_manager → assistant_manager`, `host → staff`, `server → staff`; organization roles unchanged. Measured: no capability change at one location (pgTAP `0081`, DEV re-proved 18/18 on real data).
- D-2b: multi-role arrays — owner picks **one** role per person; never the first element. D-2c as above.
- **No inferred privilege expansion:** a mapping that raises capability or reduces it must be explicitly acknowledged in the manifest; reductions stay visible warnings.
- **Organization-atomic:** all members of an organization or none (see C).
- Decision on E-1 interplay: after migration 91, location roles in an organization with 2+ active locations cannot write shared catalogs; N≥2 organizations need this understood before backfill.

## C. Fallback-cliff safeguards (mandatory rules for any executor)

One transaction **per organization**, which must:

1. Validate the complete, state-hash-bound, owner-approved manifest (refuse if the snapshot drifted).
2. Verify every affected member (active, in that organization) and every location (belongs to that organization, active).
3. **Refuse incomplete mappings** — every active member mapped, present, or owner-signed unassigned.
4. Insert only; **never reactivate** an inactive row and never overwrite an existing row.
5. Reconcile the complete after-state (counts per person × location × role) inside the same transaction and **abort the whole organization** on any mismatch or error.
6. Never use `apply_location_assignment_changes` (per-person, needs a real actor, reactivates rows) as a bulk writer.
7. Never run two organizations in one transaction; never partially migrate an organization.

## D. Module configuration

- Owner supplies explicit Enabled/Disabled per location per module (D-5b, nine canonical keys) — **no blanket enable**.
- Preserve explicit existing settings (the 14 DEV rows, incl. the eight `disabled` Monk's DEV modules, D-5) unless the owner changes them.
- No archiving of the 42 harness locations without the separate D-4 approval.
- Backend enforcement activation (D-8) stays `staged`; the DB guard refuses activation until every active location is configured. Recommended: activation belongs to the V2-009 release gate.

## E. Attendance compatibility

- Supported modes only: `external`, `internal_the_lineup`, `disabled`; `NULL` stays "unconfigured" and is never guessed.
- D-6 recommendation: leave everything `NULL` until D-1 evidence exists, then `external` for the Webster pilot only, via the audited RPC.
- No automatic source conversion, **no Neon writes**, no native financial activation (Finance stays OFF).

## F. Executor — minimum proposal (design only, **not built**)

| Aspect       | Proposal                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form         | One reviewed SQL function per concern (`location_memberships`, then module rows, then attendance mode), `security definer`, `postgres`-owned, executable by `service_role` only; **or** a reviewed script run by an operator — owner to choose. No new tables if avoidable |
| Permission   | Not callable by `authenticated`/`anon`; the operator identity recorded in an audit row; no real-user session required                                                                                                                                                      |
| Dry-run      | The existing planner output **is** the manifest input; the executor accepts only a manifest whose `stateHash` equals the live state hash; dry-run mode returns the plan and writes nothing                                                                                 |
| Atomicity    | One transaction per organization; `lock` the organization's membership rows; all-or-nothing; no partial state is ever visible                                                                                                                                              |
| Idempotency  | Re-running an applied manifest is a refused no-op (rows already present), never a duplicate or reactivation                                                                                                                                                                |
| Recovery     | Pre-change encrypted backup + organization-scoped restore proof; a failed transaction leaves nothing; reversal is a reviewed forward manifest (deactivate only rows the manifest created), never a delete script                                                           |
| Auditability | One audit row per organization run (manifest hash, counts, actor, before/after hashes); no PII in the audit text                                                                                                                                                           |
| Testing      | pgTAP (atomic abort, refusal paths, no-reactivation, wrong-organization, drift, idempotency), real-database Vitest on a populated copy, the Batch C backup → restore → rehearsal → apply route, rollback-only probes                                                       |
| Approval     | Separate D-7C approval **per environment and per organization manifest** (Hosted DEV first, Production later under its own gate); the executor itself is a new migration needing its own Hosted DEV approval                                                               |

## G. Decisions requested (one consolidated list)

| #   | Decision                                                                         | Recommended                                  |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | D-1: authorize the read-only Production preflight (counts/ids only)              | Yes, `begin read only`                       |
| 2   | D-2/2b/2c: approve the role ladder and multi-role/multi-location rules           | Yes                                          |
| 3   | D-3: disposition of the manual Preview organization                              | Keep and assign if still used, else retire   |
| 4   | D-4: archive the 42 harness locations (separate, reversible)                     | Yes, never delete                            |
| 5   | D-5/5b: explicit module matrix for each real location                            | Owner supplies                               |
| 6   | D-6: attendance mode for real locations                                          | `NULL` now; `external` for Webster after D-1 |
| 7   | Executor design (F): form, permission model, per-organization approval           | Approve design only; build separately        |
| 8   | D-8/D-11: keep enforcement `staged`; defer shared session-contract hardening     | Yes                                          |
| 9   | Add Required reviewers to the GitHub `production` environment before any release | Yes (owner action, not an agent action)      |

## H. Next exact implementation step (after decisions 1–7)

Build, inside V2-008, the **executor + Hosted DEV rehearsal on a restored copy** for one organization (the DEV Monks organization or the manual Preview organization), with no Production contact. Agent: Claude Code Local, Sonnet 5.x, High effort; **new session**; worktree `.tmp/v2-008-backfill-executor` from the current `development`, branch `feature/v2-008-backfill-executor`; approval required: the decisions above plus a separate Hosted DEV write approval for the executor migration and any manifest.
