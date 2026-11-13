# V2-008 — DEV Compatibility Acceptance Record (2026-11-13)

**Result: DEV COMPATIBILITY ACCEPTED (under two owner-approved amendments). PRODUCTION RELEASE NOT YET APPROVED.**

This record closes V2-008 against its approved **Hosted DEV compatibility scope only**. It is documentation. It
records owner decisions A–E, reconciles the seven sub-features of issue #256, and carries every Production
obligation forward to V2-009 (#257). It establishes **nothing** about Production readiness.

Evidence base: previously recorded, verified evidence ([CLOSEOUT_REVIEW.md](CLOSEOUT_REVIEW.md), [HANDOFF.md](HANDOFF.md)
sections 00000000.2–.3, [batch-c/BATCH_C_ROLLOUT_RECEIPT.md](batch-c/BATCH_C_ROLLOUT_RECEIPT.md),
[track2/MINIMAL_COMPLETION_PLAN.md](track2/MINIMAL_COMPLETION_PLAN.md)). **No new database contact was made to
produce this record, and no write of any kind occurred.** Issue #256 is **not** closed and its checkboxes are **not**
ticked by this change.

## 1. Owner decisions A–E (final for the V2-008 DEV scope)

| ID  | Decision                     | Approved option | Effect                                                                                                                                                                                                                                                               |
| --- | ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | D-5/5b Module configuration  | **A1**          | Preserve The Monk's DEV's nine explicit module rows. Manual Preview stays with **zero** rows = **unconfigured** (not enabled, not explicitly disabled). No backfill executed, no rows created, enforcement not activated. **DEV acceptance amendment #1.**           |
| B   | D-6 Attendance compatibility | **B1**          | `attendance_mode = NULL` is accepted for the existing real DEV locations as the legacy-compatible, unconfigured state. Not changed to `EXTERNAL`; no database update occurred. **DEV acceptance amendment #2.**                                                      |
| C   | DEV-only closeout            | **C1**          | V2-008 closes against Hosted DEV compatibility. Production inspection and migration work move to V2-009. This is **not** a statement that Production is ready.                                                                                                       |
| D   | Migration 92                 | **D1**          | **SHELVED.** `20261113120000_v2008_track2_backfill_executor.sql` is not deployed, merged, cherry-picked or included in any PR; applied migrations 89–91 are unaltered. A future bulk-migration need would require new independent engineering and security approval. |
| E   | Deferred work                | **E1**          | Harness cleanup, enforcement activation, D-11 session hardening, Production governance and V2-009 checks stay **outside V2-008** (see section 5).                                                                                                                    |

### Terms that must not be conflated

- **Module configuration:** zero rows = _unconfigured_. Never "enabled", never "disabled".
- **`attendance_mode`:** `NULL` = legacy-compatible, unconfigured (native Attendance functions refuse it; the existing Neon-backed report shows "External (not configured)"). `EXTERNAL` = an explicitly configured external mode. _Native Attendance_ = a separate operational mode. These are three different states.

## 2. Seven-subfeature DEV acceptance

| #   | Original requirement (README §2)                              | Current DEV implementation and data                                                                                                                                                                                                     | Verification evidence                                                                                                                                                  | Approved amendment                                                                                                                                                         | Remaining Production obligation                                                                                    | Final DEV result                                   |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 001 | Audit orgs, profiles, locations, operational rows             | DEV inventory complete; 44 active locations (42 harness fixtures)                                                                                                                                                                       | `001-existing-data-inventory/INVENTORY.md`; read-only snapshots                                                                                                        | DEV-scope boundary (C1)                                                                                                                                                    | Production schema/data inventory (D-1)                                                                             | **Complete**                                       |
| 002 | Map Monks to its location; backfill missing location bindings | The Monk's DEV: 1 active real location, 5 members, 5 correct location memberships (2 manager, 3 staff). Manual Preview: 1 active real location, 2 members mapped through the normal Staff Assignments UI (GM `manager`, server `staff`) | HANDOFF 00000000.2; role planner NOOP on both orgs                                                                                                                     | DEV-scope boundary (C1). The README's "Webster" mapping was never a DEV fact                                                                                               | Production organization/location mapping                                                                           | **Complete**                                       |
| 003 | Translate legacy roles to baseline + location assignments     | Both real organizations reconciled; role planner returned NOOP with 0 exceptions for each                                                                                                                                               | HANDOFF 00000000.2; MINIMAL_COMPLETION_PLAN §2                                                                                                                         | none                                                                                                                                                                       | Production role compatibility                                                                                      | **Complete**                                       |
| 004 | Seed default module enablement for all existing locations     | Monks: nine explicit rows preserved untouched. Manual Preview: 0 rows (unconfigured). 42 harness locations: fixtures. Enforcement STAGED                                                                                                | CLOSEOUT_REVIEW §3; ROLLOUT_READINESS DB guard                                                                                                                         | **Amendment #1 (A1):** satisfied by owner-approved audit, reconciliation and acceptance of the existing configuration. **Not literally implemented** — no seeding occurred | Production module-configuration readiness; enforcement activation needs its own configuration-readiness validation | **Accepted by owner-approved DEV scope amendment** |
| 005 | Backfill default `EXTERNAL` for Monks                         | Both real locations `attendance_mode = NULL`; 0 native sessions; 0 Neon identity links; Finance OFF                                                                                                                                     | CLOSEOUT_REVIEW §4; V2-006 mode policy                                                                                                                                 | **Amendment #2 (B1):** `NULL` accepted as the legacy-compatible state. **Not literally implemented** — no default-`EXTERNAL` backfill occurred                             | Production Attendance compatibility                                                                                | **Accepted by owner-approved DEV scope amendment** |
| 006 | Forward migration rehearsals on Hosted DEV                    | Migrations 89–91 rehearsed on a restore-validated copy (354/354 pgTAP), applied to DEV `opmujepkemwcdxxorhfd` (ledger 88 → 91); migration 92 absent                                                                                     | BATCH_C_ROLLOUT_RECEIPT (91 tables identical before/after; rollback-only probes 105/105, 69/69, 105/105); PR #325 merged as `207d088d5bca5d989030870433cf4daa3ecb4c78` | none                                                                                                                                                                       | Controlled Production migration rehearsal where required                                                           | **Complete**                                       |
| 007 | Rollback and forward-fix runbooks                             | Rollout/recovery plan, post-apply verifier, rollback-only probe; recovery proven by restoring the encrypted backup (121 tables identical); forward-fix-only policy                                                                      | `batch-c/ROLLOUT_AND_RECOVERY_PLAN.md`; receipt §3                                                                                                                     | none                                                                                                                                                                       | Production backup/restore readiness; rollback/forward-fix review for the release sequence                          | **Complete**                                       |

**Overall:** DEV compatibility accepted. Not all seven original requirements were implemented literally; 004 and 005
are accepted by the explicit amendments above and must be cited as such. **Production release not yet approved.**

## 3. Verified DEV state this acceptance rests on (recorded, not re-run)

| Item              | State                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted DEV ledger | 91 (migrations 89–91 applied and validated); migration 92 absent                                                                         |
| The Monk's DEV    | 1 active real location; 5 active members; 5 correct location memberships; 2 managers, 3 staff; 9 explicit module rows; role planner NOOP |
| Manual Preview    | 1 active real location; 2 active members (GM `manager`, server `staff`); role planner NOOP; 0 module rows; `attendance_mode` NULL        |
| Environment       | 44 active locations (42 harness); no Overall roles; backend module enforcement STAGED; Finance OFF                                       |

PR #325 is **merged** into `development` (`207d088d5bca5d989030870433cf4daa3ecb4c78`); any earlier text describing it as open is superseded.
Manual Preview's two assignments used the application's normal Staff Assignments workflow. No additional DEV migration
or backfill is required.

## 4. Migration 92 (shelved)

Excluded from this change and from `development`: the migration SQL, the privileged executor script, their pgTAP and
local integration tests, and the dependent 0062 test change. The executor is not needed for the verified DEV state. The
branch `feature/v2-008-backfill-executor` is retained locally as historical work. If Production evidence ever
establishes a bulk-migration need, it needs a new, independent engineering and security approval.

## 5. Deferred and carried-forward work (not V2-008 closure items)

| Item                                          | Disposition                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness cleanup (42 active harness locations) | Unchanged. Disposition needs separate owner approval; **not** archived. Tracked separately — not an unconditional Production release requirement unless evidence establishes that dependency. Unresolved active-location configuration can block _enforcement-activation readiness_ (the database guard requires every active location to be configured). |
| Backend module enforcement                    | **STAGED.** Activation is a separate owner-authorized operation with its own readiness requirements.                                                                                                                                                                                                                                                      |
| D-11 session-contract hardening               | Unresolved; carried into the security / V2-009 gate. **Not** marked resolved.                                                                                                                                                                                                                                                                             |
| GitHub `production` environment               | Has no required reviewers; a push to `main` touching migrations auto-runs `supabase db push`. **Explicit Production release blocker.**                                                                                                                                                                                                                    |
| Credential housekeeping                       | A future, separately authorized rotation of the temporary Manual Preview manager credential is recommended. No credential change is authorized or made here, and no credential is recorded.                                                                                                                                                               |

## 6. V2-009 prerequisite (amended narrowly)

V2-008's approved DEV compatibility acceptance must be complete before V2-009 proceeds, while Production-specific
compatibility verification remains a mandatory V2-009 pre-release responsibility. V2-009 must carry forward:
D-1 Production migration preflight (schema/migration inventory, pending versions); Production organization/location
mapping; Production role compatibility; module-configuration readiness; Attendance compatibility; data-protection and
rollback readiness (backup + restore-validated rehearsal); D-11 session review; cross-organization and cross-location
security tests; role-matrix E2E; Kiosk E2E including physical-device acceptance; existing-module regressions; GitHub
`production` environment required reviewers; formal owner-approved release.

## 7. Proposed #256 checklist update (for the owner, after this PR is reviewed and merged — NOT applied)

Suggested wording once the owner authorizes an issue update (an unticked box never means "unverified"):

- [x] V2-008.001 Existing Data Inventory — complete on DEV.
- [x] V2-008.002 Organization / Location Backfill — complete on DEV.
- [x] V2-008.003 Existing Role Migration — complete on DEV (planner NOOP both orgs).
- [x] V2-008.004 Module Configuration Backfill — **accepted by owner-approved DEV scope amendment A1** (audit/reconcile; no rows seeded).
- [x] V2-008.005 Attendance Compatibility — **accepted by owner-approved DEV scope amendment B1** (`NULL` legacy-compatible).
- [x] V2-008.006 Hosted DEV Migration Validation — complete (ledger 91).
- [x] V2-008.007 Recovery / Forward-Fix Strategy — complete.

Add a comment linking this record and stating that Production readiness is deferred to #257.

## 8. No-repeat list

Do not re-run: logins, the Manual Preview assignments, credential recovery, the 89–91 rehearsal, the D7/F-1/U-1/E-1
probes, the full pgTAP campaign, or the role planner solely for documentation. Do not deploy migration 92. Do not write
module rows or attendance modes. Do not use or record the previously disclosed temporary credential.
