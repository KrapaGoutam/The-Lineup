# THE LINEUP — V2-006 FINAL CONSOLIDATED CLOSEOUT

Date: 2026-11-10. Reviewer: Codex, independently reviewing the prior R2 author’s
implementation. This is the consolidated closeout, with no new audit phase.

## Current owner-authorized rollout

2026-11-10 Q8 update: Owner approved DEV rollout and staged closeout. DEV backup/recovery and populated rehearsal passed; exact four migrations applied, ledger 82 → 86. Authenticated DEV acceptance 26/26 across API and desktop/WebKit tablet/mobile passed. Native financial activation OFF; backend enforcement STAGED; no real payments. Deferred UI and activation tracked in #319/#320. Single PR/CI/Preview/merge gate remains pending; #254 closes only after accepted merge into development. Production/main untouched. [Current rollout evidence](Q8_DEV_ROLLOUT.md).

The report below preserves the completed independent local review and its pre-approval state; its missing-Q8 gates are superseded by the current rollout evidence.

## A. Historical local decision — PARTIAL

Independent source review, local financial repairs and consolidated verification
are complete. Hosted DEV and integration remain gated by owner
approval. Native Payroll infrastructure remains inactive and has no Payroll UI.

## B. Git provenance

Existing worktree `.tmp/v2-006-attendance`, branch
`feature/v2-006-attendance-v2`, starting HEAD `54d968b` (clean, 17 commits ahead).
Preserved R2 commits `b1fa651`, `29ed814`, `54d968b` and R1-F1 `b4d056e`.
Remote refs independently checked: development
`e796eee3fb616a3b3b0b5f525452f9b3958e8196`, main
`5e5b7747693b6e81014eafdf299b87e56c3f033d`. Feature remote absent; no PR.
Other worktrees and the primary worktree’s unrelated modifications were preserved.
The final local closeout is the commit containing this report; its exact SHA is
also recorded in the private handoff and delivered final response. It is unpushed.

## C. Independent R2 findings and narrow repairs

| Finding                                     | Severity | Actual reproduction                                                                                                                                                                             | Repair and evidence                                                                                                                                                                                                                                     |
| ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmation races an attendance correction | P1       | A real local manager JWT starts a correction and holds its transaction open; another real organization-manager JWT locks the draft successfully against the previous committed session version. | Native confirmation now tries the same employee advisory lock used by generation/clock/correction operations, then re-proves finality. It refuses a busy employee with `PERIOD_NOT_FINAL`. Regression failed before the fix and passes afterward.       |
| Confirmed native snapshot can be reopened   | P1       | An authenticated organization manager changes a locked native period to draft through the legacy direct update, making the confirmed consumption eligible for regeneration.                     | Native locked-to-draft transitions now fail with `PERIOD_FROZEN`, for clients and privileged writers. Native corrections use the existing audited review/adjustment boundary. Neon unlock remains unchanged and is covered by an actual-JWT regression. |

Both repairs are in `20261110160147_attendance_native_confirmation_guards.sql`.
The original R2 migration remains byte-identical. No rows are rewritten, no
privilege is added and no new authorization path is introduced. This replaces
one existing private trigger helper; it is a bounded integrity repair rather
than a privileged architecture redesign. Review the two repairs in the final PR;
another full audit phase is unnecessary. No unresolved P0/P1 found in this scope.

Blocking on the employee lock inside a period-row trigger would invert
generation’s employee-lock → period-row order. The nonblocking try-lock avoids
that deadlock and gives callers a safe retry. The lock remains held to commit,
so a later correction follows confirmation and becomes a stale-consumption review.

## D. R1-F1 second review

Read `b4d056e`, both actions, their UI callers, expected-location helper and
canonical actor/location resolution. The browser assertion only compares with
the verified location; it never selects a location or authorizes a read.
Malformed/foreign/mismatched expectations fail before the read. Normal and
Overall-role access retains canonical permissions. Unit regressions pass.
Real two-tab browser acceptance passes on desktop/tablet/mobile (3/3): a distinct
employee/session at the second location proves the old tab cannot display its
attendance under the original location. Focus/route/action boundaries refuse
the stale read; explicit matching location selection restores normal reporting.

## E. Financial identity and consumption integrity

Reviewed the complete R2 migration, 0076 assertions, native action/data/domain
boundaries and Neon reader filters. Exactly-one-identity CHECKs, membership FKs,
partial uniqueness, bidirectional cross-key triggers and link mutation guards
protect native-only, Neon-only and dual-identity employees. Actual JWT attempts
to double-pay in both identity directions and unlink protected identities fail.

Generation takes organization identity and employee attendance locks, re-proves
completed/classified/non-month-crossing eligibility and writes the snapshot,
versioned ledger and audit atomically. Unique active consumption prevents double
counting. Retry is unchanged; draft regeneration supersedes history. Locked or
paid periods reject generation. Injected transaction failure leaves no partial
period, ledger or audit. Historical snapshots and existing rate/rounding rules
remain unchanged. Pending reviews create no money; adjustment links use existing
audited records and cannot be reused. Unclassified payable time remains NULL.

Source transitions retain first-local-calendar-day enforcement in each location’s
timezone, open/unclassified/unconsumed/current-month/pending-review/identity
checks and historical Neon preservation. Tips remain **warning-only** through
`tip_pools_not_finalized`; manual reconciliation is an operational dependency.
No new Tips rule was added. The first-day interpretation and classifier authority
still require owner acceptance before activation.

## F. Security and authorization

Actual local Auth-issued JWTs and direct PostgREST requests prove default-OFF
generation, anonymous/staff/assigned-manager/foreign-tenant denial, native self-read
only when locked, coworker isolation, Overall-manager access, no direct ledger
writes, cross-key protection and foreign readiness denial. The original fabricated
99-hour native snapshot bypass remains closed under a real authenticated JWT.

Catalog evidence: RLS on all three new tables; authenticated SELECT only for
ledger/reviews, no activation-table access; no anon/PUBLIC RPC execution; empty
search paths for privileged helpers/RPCs. The native client-write guard remains
SECURITY INVOKER, so `current_user` is the caller. Business authority comes from
membership/Overall rows and verified identity, never user-editable metadata.
No browser service-role secret or tenant/location selector was added.

## G. Consolidated local verification

| Check                                                     | Newly executed result                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Complete local migration replay                           | PASS, 86 migrations including the corrective migration                           |
| Full pgTAP, pristine stack, no concurrent writers         | PASS, 78 files / 3,079 assertions; 0076 now 149                                  |
| Real Auth JWT + direct PostgREST native suite             | PASS, 12/12                                                                      |
| Existing overlapping-connection concurrency harness       | PASS, 25/25                                                                      |
| Full Vitest including module-enforcement coverage         | PASS, 279 files / 3,837 tests, 7 existing skips                                  |
| `npm run check` (format, ESLint, Next typegen/TypeScript) | PASS                                                                             |
| Production `npm run build -- --webpack`, CI=1             | PASS                                                                             |
| Local Supabase-backed Attendance browser suite            | PASS, 39 existing cases plus 3 new two-tab cases                                 |
| Local Supabase-backed legacy Payroll browser suite        | PASS, 15/15 across desktop/tablet/mobile                                         |
| Regenerated local types                                   | MATCH committed definitions after encoding/format normalization                  |
| Final synthetic-fixture cleanup                           | PASS, replay 86; activation OFF; enforcement STAGED; zero users/periods/sessions |

The initial pgTAP attempt was contaminated by mistakenly overlapping the
fixture-writing JWT suite. It is not valid evidence. The full suite was rerun
alone after reset and passed. Two intentional red regression failures are saved
separately. No full suites are required again for documentation-only changes.
Raw local receipts remain in `.tmp/v2-006-attendance-handoff/final-*.log`.

Browser harness corrections preserved the tested behavior: the two-tab case now
uses an assigned/authorized actor, a distinct second-location session, visible
responsive content, and all observed canonical stale-refusal messages (including
no-location refusal). Earlier locator/fixture attempts are retained in the raw
logs. The Payroll tablet lifecycle test now reopens a ledger remounted by server
navigation and asserts the persisted unconfirmed payment status; no Payroll
application code or financial rule was changed to accommodate the test.
Native financial SQL is proven by real Auth-issued JWTs/direct PostgREST; the
browser covers native reporting/readiness and existing Neon-oriented Payroll.
There is no native Payroll generation UI to claim as tested or activated.

## H. Owner approval register

Q1/Q4/Q6/Q9 Option A plus ledger/Q9b decisions are recorded in the prior R2
README §15, architecture §8, approval package and private owner register, and
acknowledged by the current closeout request. GitHub #254 has no comments; no
public approval record was invented. Application activation approvals deliberately
remain `not_approved`; those constants are an activation gate, not a denial of
the separately recorded design decisions.

Still missing: Q8; native financial activation; Production deployment; backend
enforcement activation; Q5/Q7; acceptance of manual first-local-day switching;
acceptance of organization/assigned-location-manager break classification without
expanding Shift Manager authority; and acceptance of staged closure with activation
OFF. Q2/Q3 remain as previously implemented defaults, with no automatic clock-out
or new business-day cutoff authorized.

Rechecked GitHub after all local verification: zero owner comments, no feature PR,
remote development/main refs unchanged. No new Q8 or staged-closeout grant exists.

## I. Hosted DEV migration and acceptance

Not executed: Q8 is explicitly unapproved. Hosted DEV was not contacted during
this closeout; 82 is the prior reported ledger, not a newly verified value.
After Q8, verify DEV `opmujepkemwcdxxorhfd`, backup/checksums, isolated recovery
and populated-data rehearsal, schema/RLS/grants, then the complete four-migration
set and actual-JWT acceptance. Expected transition is now **82 → 86**, subject to
the actual ledger. Never reset hosted DEV. Production is outside this gate.

| Migration                                                  | SHA256                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `20261110000000_attendance_v2_foundation.sql`              | `40bb802beb7ff13a70820d274794d15da2107c3bfdaa78a2439fe0dbd024c63e` |
| `20261110010000_attendance_corrections.sql`                | `a7556ae715e2d34ff712eee7940e38e90e7e6c3a7a1ec8c49f1032f5ca8bdb15` |
| `20261110145124_attendance_native_payroll_identity.sql`    | `fb0fe460b803fab6459a101bc63ce990786755871631ac5bd36eda40fb610381` |
| `20261110160147_attendance_native_confirmation_guards.sql` | `8519df2bd5f325890150bd1a682a630f896d095848673463498bc76821686192` |

## J. GitHub / exact-head CI / merge

No push, Preview, PR, remote CI, merge or issue change. Once DEV is compatible
and all required approvals are recorded, use this existing branch for one PR to
development, verify Preview targets DEV and require all protected checks on the
final commit. No merge to main.

## K. Native financial activation

OFF operationally. Tests temporarily enable only the disposable local synthetic
stack and restore OFF. Application approvals stay closed. Native actions are
implemented and gated; the Payroll UI remains Neon-oriented. This report makes
no claim that native Payroll is activated or payable through the UI.

## L. Historical Payroll, Tips and Neon

0075 verifies populated confirmed Payroll/Tips rows remain byte-identical across
attendance corrections, and 0076 verifies Neon history with a one-cent mutation
control. Existing payment and adjustment suites pass. Corrective migration only
replaces a trigger helper and changes no financial rows. No Neon database was
contacted: browser runtime has no Neon credential and external reads show the
existing unavailable/unconfigured state. Hosted historical preservation remains
an acceptance step after Q8.

## M. Issue #254 and deferred scope

Issue #254 remains OPEN. Attendance modes, sessions/breaks, manager corrections,
reporting, native identity/consumption infrastructure and gated actions exist
locally. Native Payroll UI and operational activation remain deferred, along with
owner decisions above. Staged completion has not been accepted or integrated.
Do not create follow-up issues or close #254 until scope is accepted; then record
specific activation/UI follow-ups without duplicating V2-007/008/009.

Retained R1 operational notes: migrations-first deployment; staff roster ordering
under self-only RLS; manager-only readiness payload; module-off recovery policy;
and repeated DST-hour input ambiguity. These are not new P0/P1 findings and do
not justify another whole-feature audit.

## N. Production/main safety

No Production connection, write, migration, deployment or financial activation.
No main/development ref mutation, reset, rebase, force push or discarded work.
All database writes were synthetic and local to `supabase_db_restaurant-roster`.

## O. Exact next gate

Local review and verification are complete; receipts and local commit are preserved.
Stop at Q8: owner must explicitly authorize the DEV-only backup/recovery,
populated rehearsal, four-migration deployment and authenticated acceptance gate,
with an authorized private backup destination/operator/retention scope. Staged
closure acceptance is separately required before PR/merge/issue closure. Reuse
this completed review unless code changes; do not start another audit phase.
