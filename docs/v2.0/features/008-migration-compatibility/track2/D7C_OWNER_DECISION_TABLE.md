# V2-008 Track 2 — Consolidated Owner Decision Table (refreshed 2026-11-13, continuation 2)

> **2026-11-13 update:** D-3 Option A and D-7C (shelve migration 92) APPROVED by the owner. Manual Preview's two human-operated Staff Assignments are **PENDING** (none performed). See HANDOFF 00000000.1 and track2/D3_OPTION_A_OPERATOR_PROCEDURE.md. Migration 92 is shelved / not for deployment.

The same nine decisions, in the same grouping, as
[`D7C_OWNER_DECISION_PACKET.md`](../D7C_OWNER_DECISION_PACKET.md) and
[`D7C_DECISION_MATRIX.md`](D7C_DECISION_MATRIX.md). **Nothing here is approved; a recommendation is
not an approval.** Data marked **[fresh]** was read from Hosted DEV (read-only) on 2026-11-13;
**[carried]** is from earlier documentation and was not re-verified (Production and Neon were not
contacted).

> **Continuation 3 (2026-11-13) supersedes the D-7C row below.** See [MINIMAL_COMPLETION_PLAN.md](MINIMAL_COMPLETION_PLAN.md):
> the real data needs **no bulk executor**. `the-monks` is re-verified unchanged (91 Hosted DEV tables hash-identical to the
> morning snapshot); Manual Preview's two missing rows can be created through the existing supported workflow
> (`apply_location_assignment_changes` via Settings → Staff Assignments). Revised D-7C recommendation: **no bulk backfill; shelve the
> executor (migration 92 stays local, unmerged, not an approved capability)**. The only decision needed before further work is **D-3**.
> All other options and recommendations in this table are unchanged. Nothing is approved.

## Headline for the first pilot

The structural pilot `the-monks` was re-verified live **[fresh]**: role `NOOP` (5/5 members already
mapped), modules `REPORT_ONLY` (all 9 keys explicit), attendance `REPORT_ONLY` (unset). **It needs
no write of any kind.** So the minimum owner decisions for "the first backfill" are: **none to
modify real data.** The only decision that is useful now is **D-3/D-2** if the owner wants Manual
Preview to be the first _real_ backfill; everything else can wait.

## Summary matrix

| ID                        | Topic                                                                               | Recommended                                                        | When it is needed                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1. D-1                    | Production preflight / identifiers                                                  | (c) defer                                                          | **Production-only**                                                                     |
| 2. D-2/2b/2c              | Role ladder for real people                                                         | Approve, manifest per org                                          | **Before first actual write** (not for `the-monks`)                                     |
| 3. D-3                    | Manual Preview disposition                                                          | (a) keep + assign if still used for QA, else (c) retire            | **Before first actual write** to that org; can be deferred                              |
| 4. D-4                    | Archive 42 harness locations                                                        | Archive, separately                                                | **Can be deferred** (nothing in Track 2 depends on it)                                  |
| 5. D-5/5b                 | Per-module matrix per real location                                                 | Confirm the existing `the-monks` matrix; owner-supplied for others | **Before first module write**; can be deferred (nothing to insert)                      |
| 6. D-6                    | Attendance mode for real locations                                                  | Leave `NULL` now                                                   | **Can be deferred**                                                                     |
| 7. Executor design / D-7C | Approve the hardened local executor as the basis for a rehearsal; apply is separate | Approve as basis; apply later                                      | **Before first actual write** (and its live authorization contract must be built first) |
| 8. D-8/D-11               | Keep enforcement staged                                                             | Yes                                                                | **Can be deferred**; gates V2-004.004 activation / V2-009                               |
| 9. Production governance  | Required reviewers on GitHub `production` env                                       | Yes (owner action)                                                 | **Production-only**; gates any `development → main` promotion                           |

"Required now": none. The package is decision-ready; no owner answer is needed for the first pilot.

## The nine decisions

### 1. D-1 — Production schema preflight or documented deferral

- **Question:** May an agent read Production's real organization/location/member identifiers for the Monks/Webster pilot, or does the owner supply them, or is Production deferred?
- **Verified data:** [carried] Production has never been inspected by an agent session; "Monks/Webster" is documented, not confirmed. Not re-verified (Production is out of this session's authority).
- **Options:** (a) authorize a read-only Production preflight; (b) owner supplies ids; (c) defer.
- **Recommended:** (c) while no Production release is scheduled; (a) when one is.
- **Consequence:** none by itself (read-only); blocks any Production manifest.
- **First backfill?** No. **Deferrable?** Yes. **Class:** Production-only.

### 2. D-2 / D-2b / D-2c — Role ladder and "one role per person, no all-locations"

- **Question:** Is the ladder (and the one-role/no-all-locations rule) approved for REAL people's rows, not just as local-tooling logic?
- **Verified data:** [fresh] On Hosted DEV the only unmapped real organization is Manual Preview (planner `APPLY`, 2 rows, reached with **no manifest** — readiness is not approval). The ladder is implemented and tested (pgTAP 0081, 0082). **New product fact:** after the fallback cliff is crossed, a new self-registrant (`/api/auth/register`, auto-approved) or a reactivated member has an active membership and **no location row** — no location access until a manager assigns them; nothing in the app creates that row.
- **Options:** approve the ladder for real data (still one named manifest per organization); decline / revise.
- **Recommended:** approve, always with an explicit per-organization manifest.
- **Consequence:** changes location-level capability for every mapped person (see `D7C_OWNER_DECISION_PACKET.md` §B/C).
- **First backfill?** Only for a non-NOOP organization (Manual Preview). **Deferrable?** Yes for `the-monks`. **Class:** required before first actual write.

### 3. D-3 — `the-lineup-manual-preview` (2 members, 0 location rows)

- **Question:** What happens to this organization?
- **Verified data:** [fresh] 1 active location (`DEV Bar & Lounge`), 2 active members (`general_manager`, `server`), 0 `location_memberships`, 0 module configs, attendance `NULL`; planner `APPLY` (not approved). Excluded as a pilot by instruction.
- **Options:** (a) keep and assign; (b) keep unassigned; (c) retire.
- **Recommended:** (a) if still used for QA, otherwise (c).
- **Consequence:** (a)/(b) none yet; (a) later gives its 2 members location rows (first row removes their legacy fallback); (c) removes the org's operational use.
- **First backfill?** Only if the owner picks it as the first _real_ write. **Deferrable?** Yes. **Class:** required before first actual write to that org.

### 4. D-4 — Archive the `V2 Harness` DEV locations

- **Question:** Archive the fixture locations?
- **Verified data:** [fresh] 42 active locations in 28 harness organizations (14 `v2h-*` orgs × 2 locations + 14 `v2ho-*` orgs × 1); plus 3 inactive `ZZ V2007*` fixture organizations (5 inactive locations, which hold every non-NULL attendance mode and 5 module-config rows). The old "44 active" total is still right (42 harness + 2 real).
- **Options:** archive (reversible) / leave.
- **Recommended:** archive, as a separate approval (it is what lets `module_enforcement_readiness` ever pass).
- **Consequence:** none to real data.
- **First backfill?** No. **Deferrable?** Yes. **Class:** can be deferred.

### 5. D-5 / D-5b — Explicit per-module Enabled/Disabled matrix

- **Question:** What matrix for each real location?
- **Verified data:** [fresh] `the-monks` already has all 9 keys explicit: `bar_inventory` enabled, the other eight (`table_allocation`, `tasks`, `schedule`, `tips`, `team`, `attendance`, `payroll`, `recipes`) disabled. Module planner: `REPORT_ONLY`, 0 to insert. Manual Preview has 0 rows. The origin of the Monks rows was not investigated.
- **Options:** confirm the existing Monks matrix; supply a different one (executor changes an explicit row only through a named override); supply Manual Preview's.
- **Recommended:** confirm or correct the Monks matrix (note: with Tasks/Schedule/etc. disabled their UI is hidden for that location once enforcement is on); supply others only when needed.
- **Consequence:** per module per location; no blanket enable; D-8 unaffected.
- **First backfill?** No. **Deferrable?** Yes. **Class:** before first module write.

### 6. D-6 — Attendance mode for real locations

- **Question:** Which mode, if any?
- **Verified data:** [fresh] both real locations `NULL`; 0 native sessions, 0 Neon links (Neon not contacted); Finance off. `set_location_attendance_mode` requires a real authenticated session; no executor path exists, by design.
- **Options:** `NULL` now; `external` for Webster only after D-1, via the existing audited RPC and a real operator session.
- **Recommended:** leave `NULL`.
- **Consequence:** none.
- **First backfill?** No. **Deferrable?** Yes. **Class:** can be deferred.

### 7. Executor design / approval — D-7C (real-data backfill authorization)

- **Question:** Is the hardened local executor the basis for a Hosted DEV rehearsal? (The apply itself is a separate approval: D-7C-1 migration 92, D-7C-2 one manifest, D-7C-3 module config, D-7C-4 attendance mode, G-2 push/PR.)
- **Verified data:** [fresh] Migration 92 is not on Hosted DEV (ledger 91). Local hardening: manifest-required + caller org cross-check (previous session); this session: **new-row concurrency closed** with table-level locks (reproduced with two real sessions, regression test fails 2/4 against the old version), hosted-credential tripwire. **Open finding:** the manifest's `status`/`approvedBy` are spoofable JSON and `localhost` is not proof of a disposable target — a live run needs the owner-signed approval and independent target identity specified in `HOSTED_DEV_APPROVAL_PACKAGE.md` §4 (not built).
- **Options:** approve as the basis for a rehearsal, still requiring the §4 mechanism before any real write / request further hardening first.
- **Recommended (revised in continuation 3):** do **not** approve migration 92; shelve the executor (Option B) and use the existing supported workflow for any approved Manual Preview rows (Option A). The previous recommendation (approve as the basis, build §4 only if a real write is intended) is retained only as Option C, with a verified table-lock/FK-cascade deadlock caveat (`MINIMAL_COMPLETION_PLAN.md` §4).
- **Consequence:** none yet (local only).
- **First backfill?** Not for `the-monks`. **Deferrable?** Yes. **Class:** required before first actual write.

### 8. D-8 / D-11 — Enforcement stays staged; session-contract hardening deferred

- **Verified data:** [fresh] enforcement `staged`, Finance off, 0 Overall roles; the DB guard already refuses activation until every active location is configured (44 active, 42 harness).
- **Options / Recommended:** no change — yes.
- **Consequence:** none. **First backfill?** No. **Deferrable?** Yes. **Class:** gates V2-004.004 activation and V2-009.

### 9. Production governance — Required reviewers on the GitHub `production` environment

- **Verified data:** [carried] `protection_rules: []`, no branch policy, admins bypass (observed by a prior session; not changed or re-checked). Any `main` push touching `supabase/migrations/**` auto-runs `supabase db push` — including migration 92 if promoted.
- **Options:** add Required reviewers + Prevent self-review + branch restriction (owner action) / leave.
- **Recommended:** add them before any `development → main` promotion.
- **Consequence:** governs future `main` pushes only.
- **First backfill?** No. **Deferrable?** Until a release. **Class:** Production-only.

## Pilot recommendation (replaces the previous "structural candidate" caveat)

`the-monks` was verified live and needs **no changes** (Outcome A: verified no-op). Do not
manufacture changes to exercise the executor. The next safe organization for a _real_ write is
`the-lineup-manual-preview` — but only after D-3 is answered, D-2 is approved, a manifest is
approved against a fresh snapshot, and the §4 authorization mechanism exists. Harness
organizations must not be mutated.
