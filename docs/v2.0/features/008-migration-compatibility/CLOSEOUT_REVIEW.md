# V2-008 — Final DEV Closeout Review (2026-11-13)

> **Owner decisions received (2026-11-13):** §7 items A–E were approved as A1, B1, C1, D1, E1 and are recorded in [DEV_ACCEPTANCE_RECORD.md](DEV_ACCEPTANCE_RECORD.md). This review is the historical analysis; "CONDITIONALLY READY" below is superseded by *DEV compatibility accepted; Production not approved*.

**Result: CONDITIONALLY READY.** Only named owner decisions and scoped exceptions remain. **None of the
recommendations below is an owner approval.** Issue #256 and its seven checkboxes are untouched.

Scope of this review: documentation and previously recorded evidence only. No Hosted DEV, Production or
Neon contact in this session; no write of any kind; no push, PR or merge. Evidence labels: **[recorded]** =
verified read-only in an earlier session and documented; **[code]** = read in the worktree today.

Worktree `.tmp/v2-008-backfill-executor`, branch `feature/v2-008-backfill-executor`, start HEAD
`490e5c54d44756679030c048a9f597b22895fd1b` (clean). Hosted DEV `opmujepkemwcdxxorhfd`.

## 1. What the requirement actually says

Issue #256 contains **only** the seven checkbox titles (it carries no acceptance text). The
sub-feature wording lives in `README.md` §2, and the README itself states that where it conflicts with
the Batch A plans and owner decisions, **those prevail**. Two README lines are therefore no longer
literally satisfiable and need an explicit, recorded amendment rather than a quiet reinterpretation:

| README text                                                         | Why it cannot be met literally                                                                                                                                  | Amendment needed                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| .004 "Seed default module enablement for **all** existing locations" | A blanket enable was rejected (D-5: no blanket enable). Monks has 9 explicit rows; Manual Preview has none; 42 harness locations are fixtures                   | **Yes — D-5/5b below**                              |
| .005 "Backfill default `EXTERNAL` mode for Monks"                    | Both real locations are `NULL`; `NULL` is the documented legacy-compatible state that already renders the Neon report as "External (not configured)" [code]   | **Yes — D-6 below**                                 |
| .002 "Map Monks pilot to **Webster** location"                      | Webster/Production was never inspected (D-1). On DEV the Monks organization is fully mapped                                                                     | **Yes — scope boundary (DEV closeout vs. V2-009)** |

The README's "default EXTERNAL" and "seed defaults" lines predate D-5/D-6 and were already flagged as
superseded by the README's own status note, but **the owner has not yet approved the replacement
behaviour.** That is the whole remaining gap.

## 2. Seven-subfeature reconciliation

| #   | Original requirement                                         | Verified implementation (DEV)                                                                                                                                                                            | Evidence                                                                               | Owner decision relevant to closure                                  | State                                | Remaining work                                                    | More DB writes? |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | :-------------: |
| 001 | Audit orgs, profiles, locations, operational rows            | DEV inventory complete and re-verified read-only several times; Production never inspected                                                                                                               | `001-existing-data-inventory/INVENTORY.md`; Track 2 snapshots [recorded]               | D-1 (Production preflight) — scope                                  | **Complete on DEV**; Production deferred | None for DEV                                                      |       No        |
| 002 | Map Monks to its location; backfill missing location bindings | `the-monks` 5/5 members mapped; Manual Preview 2/2 assigned via the supported workflow (GM→`manager`, server→`staff`); 44 active locations unchanged                                                       | HANDOFF 00000000.2; D3 procedure; planner NOOP for both orgs [recorded]                | D-3 Option A (**approved and executed**); D-1 scope                  | **Complete on DEV**; Production "Webster" deferred | None for DEV                                                      |       No        |
| 003 | Translate legacy roles into baseline + location assignments  | Ladder (D-2) applied to real people only for Manual Preview, with owner-named roles; Monks already mapped; role planner `NOOP`, 0 exceptions on both orgs                                                  | HANDOFF 00000000.2; `MINIMAL_COMPLETION_PLAN.md` §2 [recorded]                         | D-2 satisfied for the two named roles                                | **Complete on DEV**                  | None                                                              |       No        |
| 004 | Seed default module enablement for all existing locations    | Monks: 9 explicit rows (`bar_inventory` on, eight off — origin never investigated). Manual Preview: **0 rows**. 42 harness locations: fixtures. Planner: Monks `REPORT_ONLY`. Enforcement `staged`      | `D7C_OWNER_DECISION_TABLE.md` #5; `ROLLOUT_READINESS.md` (DB guard) [recorded, code]   | **D-5/5b — outstanding**                                            | **Conditional**                      | Owner accepts the exception (§3). No implementation               |       No        |
| 005 | Backfill default `EXTERNAL` for Monks                        | Both real locations `attendance_mode = NULL`; 0 native sessions, 0 Neon links; native RPCs refuse `NULL` (`42501`, fails closed); legacy report shows "External (not configured)"; Finance OFF           | `attendance-mode.ts` doc, V2-006 README mode table [code]; HANDOFF [recorded]          | **D-6 — outstanding**                                               | **Conditional**                      | Owner accepts `NULL` (§4). No implementation                      |       No        |
| 006 | Forward migration rehearsals on hosted DEV                   | Migrations 89–91 rehearsed on a restore-validated real-data copy (354/354 pgTAP), applied to DEV (ledger 88→91), 91 tables identical before/after, rollback-only probes 105/105, 69/69, 105/105; backfill validation = read-only reconciliation (no backfill migration exists) | `batch-c/BATCH_C_ROLLOUT_RECEIPT.md` [recorded]                                         | D-7A/D-7B/G-1 (**approved and used**)                                | **Complete on DEV**                  | None (a full-feature rerun was deliberately not repeated)         |       No        |
| 007 | Rollback and forward-fix runbooks                            | Rollout/recovery plan, post-apply verifier and rollback-only probe; recovery proven by an actual restore of the encrypted backup (121 tables identical); forward-fix-only policy; assignment rollback = deactivate via the same screen, never delete | `batch-c/ROLLOUT_AND_RECOVERY_PLAN.md`; receipt §3; D3 procedure [recorded]            | none                                                                | **Complete**                         | None                                                              |       No        |

No checkbox is proposed as ticked by this document. 004 and 005 depend on named owner decisions; 001/002
are complete only under the DEV-scope boundary (§7, item C).

## 3. D-5/5b — Module configuration (Manual Preview unconfigured)

**Facts.** Monks: nine explicit rows. Manual Preview: zero rows. Zero rows means **unconfigured**, not
explicitly disabled; the two are distinct states in the product and must stay distinct in records.
Enforcement is `staged`, so the database allows every module everywhere today.

**Does Option A legitimately satisfy amended .004?** Yes, **but only as a scoped DEV acceptance
exception, and only if the owner approves the amendment.** .004 is then "audited and reconciled with
an explicit decision" — *not* "backfilled". The record must never say Manual Preview has module rows or
that modules were backfilled. Option B (require rows) adds a write with no consumer; Option C (keep open)
has no further work attached to it, so it would only wait for a decision, which Option A is.

**Must .004 stay open instead?** Only if the owner rejects the amendment and wants the literal README
behaviour. Nothing in the data or code forces that.

**Is Manual Preview safe as an intentionally unconfigured QA workspace?** Safe, with a stated limit.
- Safe: login, active-context resolution, Settings, Staff Assignments, location administration — all
  verified in the post-assignment smoke [recorded].
- Limit: the UI treats "no rows" as "no operational modules" (Settings says *"No operational modules are
  enabled for this location"*), so operational-module screens cannot be QA'd there. Tasks UI is hidden for
  every DEV location without rows (V2-005.002 recorded). Use `the-monks` (where only `bar_inventory` is
  enabled) or a harness location for module UI QA; do not configure Manual Preview just to get screens.
- The UI says "none enabled" while the database (staged) allows everything. That asymmetry is documented
  existing behaviour, not introduced here.

**What blocks future enforcement activation?** The database itself: the `BEFORE UPDATE` trigger raises
`55000` until **every active location** has an explicit row for every module [code, `ROLLOUT_READINESS.md`].
Today that is 44 active locations, of which 42 are harness fixtures (D-4) and Manual Preview's
`DEV Bar & Lounge` is one more; readiness was 1/44. So Manual Preview must be **configured or archived
before activation**, but that is a V2-004.004 / V2-009 gate, not a V2-008 one. A later provisioned
location also starts with no rows (Q1, provisioning defaults), which is unrelated to this closeout.

**Is there a genuine immediate need for new rows?** No. No code path, test or acceptance criterion needs
them on DEV today. Do not blanket-enable; preserve Monks' matrix exactly as it stands. (Whether the Monks
matrix itself — eight disabled modules of unknown origin — is *intended* is the one factual confirmation
the owner should give, because activation would hide those eight at that location.)

**Recommendation: A**, as the explicit statement in §7.

## 4. D-6 — Attendance compatibility

Both real active DEV locations are `NULL`; no native sessions; no legacy identity links; Finance OFF.
`NULL` is the documented *unconfigured / legacy-compatible* state: native Attendance functions refuse it
(fails closed, never assumed internal) and the existing Neon-backed report is shown unchanged, labelled
"External (not configured)". So the *behaviour* the original .005 intended — "preserve the Neon workflow
for Monks" — is already what `NULL` does; setting `external` would add an explicit label, not new
behaviour.

**Does this satisfy .005 under approved policy?** Yes, under the already-approved V2-006 mode policy
(`NULL` is a first-class state, never silently converted). **Exact discrepancy to present to the owner:**
the README literally says "default `EXTERNAL`"; the delivered state is `NULL`. That wording difference is
the only gap, and it is an owner-approvable amendment.

**Recommendation:** accept `NULL`; do not change `attendance_mode`. Setting `external` later is one
audited call (`set_location_attendance_mode`, real operator session) and belongs with the Production/Webster
decision (D-1) or an enforcement/activation step, not here. No payroll or financial activation is implied.

## 5. Migration 92 disposition

**SHELVED — NOT APPROVED FOR DEPLOYMENT OR MERGE.**

`supabase/migrations/20261113120000_v2008_track2_backfill_executor.sql` and
`scripts/migration-compat-executor/executor.mjs` are historical engineering work only. They must not be
deployed, merged, pushed, or promoted to `main` (a `main` push touching migrations auto-runs
`supabase db push` against Production, and the `production` GitHub environment has no required
reviewers). Migrations 89–91 (applied) are not modified.

## 6. Hosted DEV final acceptance — confirmations and limits

Confirmed from recorded evidence (no new contact this session): the two Manual Preview assignments exist
and the final-state snapshot showed `9e915b` = `manager`, `5cd66c` = `staff`, org memberships unchanged;
both planners returned `NOOP` with 0 exceptions; Monks role/location rows, nine module rows and `NULL`
attendance modes unchanged; ledger 91 (latest `20261113100000`), migration 92 absent; Finance OFF;
enforcement `staged`; Overall roles 0; 44 active locations.

Limits, assessed:

1. **Playwright report did not bind the authenticated session id to the manager's profile.** *Not
   blocking.* The assignment is not proven by the session record but by the authority rule: the
   `apply_location_assignment_changes` RPC accepts only an Overall owner/manager (0 exist on DEV) or an
   active owner/general_manager *of Manual Preview itself* (one person: the GM). Monks' owner has no
   authority there. The post-state rows are the evidence; the system records no actor for these rows
   regardless (no audit trigger on `location_memberships`), so session-binding would not have added an
   actor of record. The credential-recovery step is separately audited (`passcode_reset`).
2. **Preview→DEV target verification was reused.** *Not blocking.* The changes were read back from the DEV
   project by hard-coded project ref after the run, so the rows' presence on `opmujepkemwcdxxorhfd` is
   directly observed rather than inferred from the app target.

Neither warrants new verification. If the owner wants a tamper-evident closeout anyway, the narrowest
read-only check is a single re-run of `track2/dev_org_readonly_snapshot.mjs --org the-lineup-manual-preview`
plus `hosted_dev_readonly_check.mjs --expect 91` (both SELECT-only, no login). It is optional and is not
proposed as a requirement.

## 7. Owner acceptance statement (approve or reject each line; nothing is assumed approved)

> I accept V2-008 as a **DEV compatibility closeout**, with these recorded exceptions:
>
> **A. Modules (D-5/5b).** `the-lineup-manual-preview` remains with **zero** module-configuration rows
> (unconfigured, not disabled). No rows are written and nothing is blanket-enabled. V2-008.004 is closed
> as "audited and reconciled by decision", **not** as "backfilled". The Monks matrix (`bar_inventory`
> enabled; `table_allocation`, `tasks`, `schedule`, `tips`, `team`, `attendance`, `payroll`, `recipes`
> disabled) is confirmed as intended and left unchanged *(or: the owner names the corrections)*.
> Configuring or archiving Manual Preview is a prerequisite of enforcement activation and is tracked there.
>
> **B. Attendance (D-6).** `attendance_mode = NULL` (legacy-compatible) is accepted for both real DEV
> locations in place of the README's literal "default EXTERNAL". No mode is changed.
>
> **C. Scope.** This closeout is limited to Hosted DEV. The Production preflight and the Monks→Webster
> Production mapping (D-1) move to V2-009, and V2-009's dependency line "V2-008 Track 2 must be complete
> before V2-009 starts" is amended to: *V2-008 DEV closeout accepted; Production mapping verified in V2-009.*
>
> **D. Migration 92 (D-7C).** Migration 92 and the Track 2 executor are shelved and will not be deployed
> or merged (already approved on 2026-11-13; restated for the record).
>
> **E. Out of V2-008.** Harness cleanup (D-4), enforcement activation (D-8), session hardening, Production
> `production`-environment reviewers (D-9/governance) and V2-009 security/release acceptance are not
> V2-008 closure items.

If the owner rejects A, B or C, the corresponding sub-feature stays open and the exact remaining work is:
A rejected → owner supplies a Manual Preview matrix and a supported, audited configuration path is used (no
bulk writer); B rejected → one audited `set_location_attendance_mode` call per location; C rejected →
a read-only Production preflight (D-1) becomes a V2-008 task.

## 8. Documentation-only delivery proposal (not executed)

**Rule:** never cherry-pick or merge `feature/v2-008-backfill-executor` commits; build a fresh branch from
`origin/development` and copy only named files from this branch's tip:

```bash
git fetch origin
git switch -c docs/v2-008-dev-closeout origin/development      # no upstream tracking surprises
git checkout feature/v2-008-backfill-executor -- <INCLUDE paths below>
git diff --cached --name-only | grep -E '^(supabase|scripts|tests)/' && echo "STOP: non-doc path"
```

**Include (docs only)**
- `docs/STATUS.md`, `docs/v2.0/CURRENT_STATE.md`, `docs/v2.0/features/009-final-gate-release/STATUS.md`
- under `docs/v2.0/features/008-migration-compatibility/`: `STATUS.md`, `HANDOFF.md`, `OWNER_DECISIONS_REQUIRED.md`,
  `D7C_OWNER_DECISION_PACKET.md`, `CLOSEOUT_REVIEW.md`, `batch-c/BATCH_C_ROLLOUT_RECEIPT.md`, and from `track2/`:
  `D3_OPTION_A_OPERATOR_PROCEDURE.md`, `D7C_DECISION_MATRIX.md`, `D7C_OWNER_DECISION_TABLE.md`,
  `HOSTED_DEV_APPROVAL_PACKAGE.md`, `MINIMAL_COMPLETION_PLAN.md`, `TRACK2_EXECUTOR.md` (kept as a historical
  record; its banner must read SHELVED — its links to the executor files will dangle on `development`, so
  convert them to plain text in the delivery branch)
- `tasks/current-task.md` — optional; it conflicts easily, take it only if `development` has not touched it

**Optional, owner's call:** `track2/dev_org_readonly_snapshot.mjs` (SELECT-only, DEV ref hard-coded). It is a
script, so it falls outside a strictly docs-only change.

**Exclude (never to `development`)**
- `supabase/migrations/20261113120000_v2008_track2_backfill_executor.sql` (migration 92)
- `scripts/migration-compat-executor/executor.mjs`
- `supabase/tests/database/0082_v2008_backfill_executor.test.sql`
- `tests/local/v2-008-backfill-executor.local.test.ts`, `tests/local/v2-008-executor-concurrency.local.test.ts`
- `supabase/tests/database/0062_location_module_configs.test.sql` — its change whitelists the migration-92
  function, so it is meaningless (and would be misleading) without migration 92
- `supabase/tests/database/0076_attendance_manual_entry.test.sql` — a genuine, independent test-flake fix
  (calendar day-boundary); not docs and not V2-008. Deliver separately as a one-file test-only PR if wanted.

**Post-copy checks:** `git diff --stat origin/development` shows only `docs/**` (+ optional `tasks/`); no file
under `supabase/`, `scripts/` or `tests/`; `grep -rn "executor.mjs\|20261113120000" docs` shows only
shelved/historical wording; link scan of changed docs; `npm run check` unnecessary for docs-only but run the
repo's markdown/prettier check if CI has one. Push/PR/merge remain owner-authorized steps.

## 9. Production release prerequisites (kept separate from V2-008 DEV closeout)

D-1 Production read-only preflight; `production` environment Required reviewers + Prevent self-review +
branch restriction (a `main` push that touches migrations auto-runs `supabase db push`); Production ledger
vs `development` reconciliation; enforcement readiness (every active location configured — harness archive
D-4 and Manual Preview configure-or-archive) before V2-004.004 activation; session-hardening release gate;
V2-009 security and release acceptance.

## 10. No-repeat instructions

Do not re-run the login, the two assignments, credential recovery, the 89–91 rehearsal, the D7/F-1/U-1/E-1
probes, the 3,522-assertion pgTAP campaign or the planner suite — all passed on unchanged code. Do not
deploy migration 92. Do not write module rows or attendance modes. Do not confuse unconfigured modules with
explicitly disabled modules. Do not tick #256 boxes until the owner has answered §7.
