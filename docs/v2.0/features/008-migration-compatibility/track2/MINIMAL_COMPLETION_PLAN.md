# V2-008 Track 2 — Minimal-Completion Plan (2026-11-13, continuation 3)

> **2026-11-13 (later):** D-3 Option A EXECUTED: Manual Preview GM→manager and server→staff both saved via the app and verified; role planner NOOP (Manual Preview and the-monks); ledger 91, migration 92 absent, enforcement staged, Finance off. Manual Preview still has 0 module rows (D-5/5b) and NULL attendance (D-6). See HANDOFF 00000000.2. Supersedes the 'pending' note above.


> **2026-11-13 update:** D-3 Option A and D-7C (shelve migration 92) APPROVED by the owner. Manual Preview's two human-operated Staff Assignments are **PENDING** (none performed). See HANDOFF 00000000.1 and track2/D3_OPTION_A_OPERATOR_PROCEDURE.md. Migration 92 is shelved / not for deployment.


**Proposal only. Nothing here is approved, executed or deployed.** Worktree
`.tmp/v2-008-backfill-executor`, branch `feature/v2-008-backfill-executor`, started and verified at
`5056dec` (clean, base `development` = `207d088d`, no remote Track 2 branch, no PR). Evidence
labels: **[fresh]** = read-only Hosted DEV on 2026-11-13 during this session; **[code]** = read in
the worktree this session; **[carried]** = earlier documentation, not re-verified. Production and
Neon were not contacted. Profile ids are truncated (public repository).

## 1. Verdict in one paragraph

The real data does not need a bulk executor. `the-monks` is already fully mapped. The only real
gap is **two** location rows in `the-lineup-manual-preview`, and the application already has a
supported, authorized, atomic-per-person workflow for exactly that (`apply_location_assignment_changes`,
reachable from Settings → Locations → Staff Assignments, even from the "No restaurant location
assigned" screen). **Recommendation: Option A for the data, Option B for the code** — do not
deploy migration 92; keep the executor branch local and explicitly labelled _not an approved
capability_. Revisit Option C only if a future Production inspection (D-1) shows a multi-person
organization that genuinely needs one atomic bulk write.

## 2. What actually remains (verified)

### 2.1 `the-monks` — already satisfied, no change [fresh]

All 91 Hosted DEV tables are **hash-identical** to the snapshot taken earlier today
(`hosted_dev_readonly_check.mjs --compare`, ledger 91, 8 schema categories and function
fingerprint equal), so nothing changed. A focused read-only query agrees: 5 active members (owner,
general_manager, 3 servers) ↔ 5 active `location_memberships` (owner/GM → `manager`, 3 servers →
`staff`), 1 active location, 9 explicit module rows (`bar_inventory` on, eight off), Attendance
`NULL`. **Role migration is satisfied; do not manufacture a requirement.**

### 2.2 `the-lineup-manual-preview` — the one real gap [fresh]

2 active members (`general_manager` `9e915b…`, `server` `5cd66c…`), **1** active location
(`DEV Bar & Lounge`, `22fe5e…`), **0** `location_memberships`, 0 module rows, Attendance `NULL`.
Today both members see "No restaurant location assigned" in the app (the TypeScript resolver has no
legacy fallback [carried, Batch A]; only some database-side policies still honour it while the
organization has zero location rows [code: `20261106150000_…:88-120`]).

### 2.3 Harness, guards [fresh]

42 of 44 active locations are harness fixtures — left unchanged. Enforcement `staged`, Finance
`off`, Overall roles 0.

### 2.4 Is there a supported workflow for the two assignments? **Yes** [code]

| Property                              | Finding                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry point                           | Settings → Locations → select organization → **Staff Assignments** (`OrganizationStaffAssignments` / `LocationStaffManagement`) → server action `applyStaffLocationChangesAction` → RPC `public.apply_location_assignment_changes(p_target_profile_id, p_changes)`                                                                   |
| Reachable with zero location rows     | Yes. `ContextUnavailableNotice` shows a **Settings** button on `no_access`; `ContextSettings` offers location administration to anyone `canAdministerLocations`, which is decided by **Overall** role or **active org `owner`/`general_manager`**, not by a location row. (The no_access screen QA was passed in PR #294 [carried].) |
| Authority (DB is the final authority) | `auth.uid()` required; caller must be an Overall `owner`/`manager` **or** an active `owner`/`general_manager` of the **location's own organization** (`private.has_org_role`). The Monks owner cannot act on Manual Preview. Overall roles on DEV: **0**, so the only possible actor is Manual Preview's own GM                      |
| Target prerequisites                  | Target must hold an **active** membership in that organization; location must exist, be `active`, not archived (trigger `location_memberships_location_lifecycle_guard`); role ∈ `manager`/`assistant_manager`/`staff`; duplicate location in one batch rejected                                                                     |
| Atomicity                             | One transaction per **call** (per person, any number of that person's locations). Not atomic across two people                                                                                                                                                                                                                       |
| Idempotence                           | Existing row → update (including _reactivation_); no row → insert                                                                                                                                                                                                                                                                    |
| Audit                                 | **None beyond `created_at`/`updated_at`.** No actor, no event row; no audit trigger exists on `location_memberships`. (Parity: the executor's receipt is also a return value only — `HOSTED_DEV_APPROVAL_PACKAGE.md` §4 item 3.) Evidence therefore = owner-saved before/after read-only snapshots (§4)                              |
| Existing coverage                     | pgTAP `0054`, `0055`, `0058`, `0059`; `staff-assignment-actions.test.ts`                                                                                                                                                                                                                                                             |
| Not exercised live                    | This session did **not** drive the UI against Hosted DEV (no real GM credential, and it would be a write)                                                                                                                                                                                                                            |

**Fallback-cliff impact of Option A for Manual Preview:** zero incremental app-visible
interruption. Both members already see `no_access`. Assign the GM first (so the person holding the
authority is never the unassigned one), then the server. Between the two calls the server's
_database-side_ fallback is off for the seconds the owner takes to click again; the server is
already unable to open the app. This reasoning applies to a **2-person, single-location QA
organization only**. For a Production organization with many unmapped members the per-person window
is a real risk and must be reassessed under D-1 (§3, trigger to revisit).

## 3. Migration 92: three options compared

|                          | **A — No bulk executor**                                                        | **B — Executor retained, shelved**             | **C — Deploy corrected executor later**                                                    |
| ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What happens             | Owner-authorized GM uses the existing workflow for 2 rows (or nothing, per D-3) | Branch kept as unmerged, unapproved experiment | Fix §4 items, then migration 92 + manifest approval                                        |
| Code change              | None                                                                            | None (docs only)                               | Large: signed approval, target identity, persisted receipt, bounded locks                  |
| Migration                | None                                                                            | None                                           | Migration 92 on DEV (and eventually Production)                                            |
| DB writes                | 2 rows, by the owner's own session                                              | 0                                              | Migration + rows                                                                           |
| Privileged surface added | None                                                                            | None                                           | Two `SECURITY DEFINER` maintenance RPCs persisting on every database the migration reaches |
| Audit                    | Weak (timestamps only); mitigated by snapshots                                  | n/a                                            | Needs new work                                                                             |
| Atomic across people     | No (not needed for N=2 already-locked-out members)                              | n/a                                            | Yes                                                                                        |
| Risk                     | Low                                                                             | None                                           | Highest (table locks, approval spoofing, `main` auto-deploy)                               |

**Recommended: A + B.** **Why not C now:** (1) it is built to solve a problem the data does not
have — one 2-row write; (2) the open §4 findings (spoofable `status`/`approvedBy`, hostname-only
loopback, no persisted receipt) are exactly the work Option C would still have to do, plus a new
migration approval, for 2 rows; (3) promoting migration 92 to `main` auto-runs `supabase db push`
on Production with no required reviewers (V2-009 blocker). **Why not A-only without B:** the branch
is already committed and tested; deleting it forfeits reusable work for a possible multi-person
Production organization at no benefit. B costs nothing as long as it is labelled and never merged.

**Trigger to revisit Option C** (all must hold): a Production inspection (D-1) finds an
organization with several unmapped _active_ members where the per-person window would lock people
out; the owner wants a single atomic write; and the §4 mechanism is built and reviewed first.

## 4. Table-lock assessment (migration 92) [code + reasoning; nothing deployed]

Migration 92 takes `SHARE ROW EXCLUSIVE` on `memberships` and `location_memberships` — **global**
tables, so it blocks writes for **every** organization, not just the target.

| Question                                            | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the lock justified for the expected size?        | No. The expected operation is **2 rows in 1 organization**; a cross-tenant write lock on two core tables is disproportionate. It is defensible only for a one-off bulk operation that must be gap-free                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Could it block registration / membership admin?     | Yes by design: `/api/auth/register` (`memberships` insert), member (de)activation, and `apply_location_assignment_changes` queue behind it. Reads, RLS, FK checks and `FOR UPDATE` do not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Could app transactions time out?                    | A pending `SHARE ROW EXCLUSIVE` request also queues **later** writers behind it (FIFO lock queue). If a long writer is in flight, other writers can stall up to the 5 s `lock_timeout` before the executor itself gives up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Can deadlocks still occur?                          | **Yes — correction to the earlier claim.** `TRACK2_EXECUTOR.md` §-2 said no existing function or route writes both tables in one transaction. No _function_ or route does (re-scanned all migrations this session) — but **FK `ON DELETE CASCADE` does**: deleting a profile (e.g. an Auth user hard-delete) or an organization cascades into `memberships` _and_ `location_memberships` inside one statement/transaction, in an order the executor does not control. Executor holds the memberships lock and waits for `location_memberships` while that cascade holds `location_memberships` and needs `memberships` → a cycle. Postgres resolves it after `deadlock_timeout` (1 s) by aborting one side — possibly the application's delete. Hosted-suite/harness teardown deletes Auth users on DEV, so the trigger is realistic. The absence of an observed deadlock is not proof |
| Does the 5 s `lock_timeout` suffice as a fail-safe? | Partly. It bounds **lock-acquisition waiting** and leaves nothing written (safe to retry). It does **not** bound the queue convoy it creates for others during those 5 s and does **not** prevent a deadlock (a separate mechanism; victim may be the application)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Does a simpler workflow avoid the risk?             | Yes. `apply_location_assignment_changes` takes only row-level locks on the affected rows; no table lock, no cross-tenant effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

No new concurrency test is needed: the conclusion (do not deploy 92 for a 2-row write) does not
depend on one, and the verified FK-cascade fact is evidence by code reading. `TRACK2_EXECUTOR.md`
§-2 is corrected accordingly.

## 5. Owner decision table (the same nine decisions; options and recommendations preserved)

"First write" = the first actual change to real data. Only D-3 and D-2 can lead to one (Manual
Preview), and only if D-3 = A.

| #                         | Actual question                                                                                                                                                                                                           | Recommendation (preserved; revision flagged)                                                                                                                                                                             | Required to complete V2-008?                                                                                                 | Required for first write?           | Defer?           | Owner action                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| 1 · D-1                   | May an agent read Production identifiers (read-only), or does the owner supply them, or defer?                                                                                                                            | (c) defer until a Production release; (a) then                                                                                                                                                                           | No for DEV; **Yes for the Production Monks/Webster scope of #256** (owner to confirm whether that belongs to #256 or V2-009) | No                                  | Yes              | Say "defer" or authorize a read-only preflight when a release is scheduled   |
| 2 · D-2/2b/2c             | Is the role ladder (one role per person, no "all locations") approved for **real** people?                                                                                                                                | Approve, one explicit manifest/list per organization. **Engineering approval of the ladder is already given; approval to change real memberships is not**                                                                | Only the ladder; no organization needs it except Manual Preview                                                              | Yes (Manual Preview)                | Yes (if D-3 ≠ A) | If D-3 = A, name the exact roles: GM → `manager`, server → `staff`           |
| 3 · D-3                   | What happens to Manual Preview? **A** keep as QA org and assign its two members via the supported workflow; **B** retire via a separately approved lifecycle process after dependency check; **C** defer, leave unchanged | (a) if still used for QA, else retire. **Not inferred — owner chooses**                                                                                                                                                  | Yes (the only real mapping gap)                                                                                              | Yes (only A writes)                 | Yes (C)          | Choose A, B or C                                                             |
| 4 · D-4                   | Archive the 42 harness locations?                                                                                                                                                                                         | Archive, as a separate, tested, reversible plan                                                                                                                                                                          | No (doesn't block V2-008 data requirements; it is what lets enforcement readiness ever pass)                                 | No                                  | Yes              | Do nothing now; approve a plan only when enforcement activation is scheduled |
| 5 · D-5/5b                | Which module matrix per real location?                                                                                                                                                                                    | Confirm the existing Monks matrix; owner-supplied for others                                                                                                                                                             | Only if the owner wants the Monks matrix changed or Manual Preview configured                                                | No                                  | Yes              | Shown in §6; confirm or correct. No blanket enable                           |
| 6 · D-6                   | Attendance mode for real locations?                                                                                                                                                                                       | Leave `NULL`                                                                                                                                                                                                             | No                                                                                                                           | No                                  | Yes              | None now                                                                     |
| 7 · D-7C                  | Is any actual backfill / executor needed?                                                                                                                                                                                 | **Revised by verified evidence:** from "approve executor as rehearsal basis; apply later" to **no bulk backfill; shelve the executor (Option B)** — keep D-7C-1/-2 _not requested_. The options themselves are unchanged | **No** (Monks no-op; Manual Preview = 2 rows via supported workflow)                                                         | No (migration 92 not on the A path) | Yes              | Accept A+B, or say you want C (then §4 items come first)                     |
| 8 · D-8/D-11              | Keep backend enforcement STAGED; session hardening tracked separately?                                                                                                                                                    | Yes                                                                                                                                                                                                                      | No                                                                                                                           | No                                  | Yes              | None. Gates V2-004.004 activation and V2-009                                 |
| 9 · Production governance | Add Required reviewers + Prevent self-review + branch restriction to the GitHub `production` environment?                                                                                                                 | Yes, before any `development → main` promotion                                                                                                                                                                           | No                                                                                                                           | No                                  | Until a release  | Owner action in GitHub settings (not changed by me)                          |

**Minimum decisions before further work: exactly one — D-3 (A, B or C).** Everything else can stay
as is. D-7C collapses to "accept A+B" (a no-op acceptance).

## 6. Module settings and Attendance meaning (D-5, D-6) [fresh]

`the-monks` (`a5d46f…`): `bar_inventory` **enabled**; `table_allocation`, `tasks`, `schedule`,
`tips`, `team`, `attendance`, `payroll`, `recipes` **disabled**. Their origin was never
investigated; with enforcement `staged` every module is allowed today. When enforcement is later
activated, those eight modules would be hidden at the Monks DEV location — the owner should confirm
that is intended _before_ activation, not now. Manual Preview: no rows, "not configured" (D-5 only
if it is retained and its modules matter).

**NULL Attendance mode is a valid state, not a missing decision.** The application treats `NULL` as
_unconfigured / legacy-compatible_ (`attendance-mode.ts`: existing Neon-backed report, labelled
legacy). Both real locations are `NULL` with 0 native sessions and 0 Neon links, so there is nothing
to preserve or convert. NULL becomes a required decision only when the owner wants a location's
Attendance to be `external`, `internal_the_lineup` or `disabled` (via the audited RPC
`set_location_attendance_mode` under a real operator session — the one path that exists). Never
silently converted.

## 7. Owner-authorized procedure for D-3 = A (**documented, NOT executed**)

1. **Pre-snapshot (read-only).** `node track2/dev_org_readonly_snapshot.mjs --org the-lineup-manual-preview`
   (counts, roles, truncated ids). Expect 2 active members, 1 active location, **0** location rows.
   Also `hosted_dev_readonly_check.mjs --target hosted --snapshot <file>` outside git.
2. **Actor:** the Manual Preview GM signs in **as themself** (an agent must never use or request
   their credential). Overall roles are 0; no one else has authority over that organization.
3. From the "No restaurant location assigned" screen: **Settings → Locations → Manual Preview →
   Staff Assignments**. First assign the **GM → Manager** at `DEV Bar & Lounge`, then the
   **server → Staff** (ladder D-2). Save after each person.
4. **Post-snapshot.** Re-run the focused snapshot: expect exactly 2 active `location_memberships`
   (`manager`, `staff`), nothing else changed. A full `--compare` will also show Auth session/token
   tables differing because of the sign-in; the _business_ tables expected to differ are
   `location_memberships` only.
5. Both people sign in; each must resolve to the location. Planner re-run on a local copy is not
   possible (loopback-only); the post-snapshot is the evidence.
6. **Rollback / forward fix:** never delete. Deactivate through the same screen. Note: any row of
   any status keeps the legacy fallback off.
7. **Evidence to save outside git:** both snapshots plus a one-line note of date, actor and roles
   (the system itself records no actor).

Stop conditions: the GM cannot authenticate, the Settings → Staff Assignments screen is not
reachable, the post-snapshot shows anything other than the two expected rows, or the ledger is no
longer 91.

## 8. Consolidated completion matrix

| Item                                         | Current actual state                    | Required end state                    | Minimum permitted change            | Owner decision             | Code change? | DB write?            | Validation needed                           | Completion evidence   |
| -------------------------------------------- | --------------------------------------- | ------------------------------------- | ----------------------------------- | -------------------------- | ------------ | -------------------- | ------------------------------------------- | --------------------- |
| **Already complete**                         |                                         |                                       |                                     |                            |              |                      |                                             |                       |
| Security migrations 89–91                    | Live on Hosted DEV (ledger 91)          | Same                                  | none                                | done (D-7A/B, G-1)         | No           | No                   | Verifier `--expect 91` ok [fresh]           | Batch C receipt       |
| D7 / F-1 / U-1 / E-1 authorization           | Merged in `development` (`207d088d`)    | Same                                  | none                                | done                       | No           | No                   | Rollback-only probes (Batch C)              | PR #325               |
| `the-monks` role mapping                     | 5/5 mapped, planner `NOOP`              | Same                                  | none                                | none                       | No           | No                   | Focused query + 91-table hash equal [fresh] | This document §2.1    |
| **Pending decision**                         |                                         |                                       |                                     |                            |              |                      |                                             |                       |
| Manual Preview                               | 2 members, 0 rows, `no_access` for both | A: 2 rows · B: retired · C: unchanged | A: two UI assignments by its own GM | **D-3** (+ D-2 roles if A) | No           | A: 2 rows; B/C: none | Pre/post snapshot (§7)                      | Owner-saved snapshots |
| Harness 42 locations                         | Active fixtures                         | Unchanged now                         | none                                | D-4 deferred               | No           | No                   | n/a                                         | n/a                   |
| Module configuration                         | Monks 9 explicit; Manual Preview none   | As the owner confirms                 | none unless the owner changes it    | D-5/5b                     | No           | Only if changed      | Module planner `--report`                   | Matrix confirmation   |
| Attendance mode                              | both `NULL` (valid)                     | `NULL` unless owner chooses           | none                                | D-6 (defer)                | No           | No                   | n/a                                         | n/a                   |
| D-7C scope                                   | none needed                             | Accept A+B                            | none                                | D-7C                       | No           | No                   | n/a                                         | Owner acceptance      |
| **Deferred release concerns**                |                                         |                                       |                                     |                            |              |                      |                                             |                       |
| Production preflight / Monks-Webster mapping | Never inspected                         | Verified before release               | read-only, owner-authorized         | D-1                        | No           | No                   | Production read-only                        | V2-009 inputs         |
| GitHub `production` protection               | no reviewers, admin bypass [carried]    | Required reviewers                    | owner setting                       | D-9                        | No           | No                   | `gh api` read                               | Settings screenshot   |
| Backend enforcement activation               | `staged`                                | Activated in V2-009                   | none now                            | D-8                        | No           | No                   | readiness 44/44 first                       | V2-009                |
| Final V2-009 checks                          | Not started                             | Per V2-009                            | none                                | n/a                        | n/a          | n/a                  | n/a                                         | n/a                   |

### V2-008 acceptance (README §2, seven subfeatures) — not marked complete

| Subfeature                    | DEV state                                                                     | Open                                                 |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| .001 Inventory                | DEV read-only done                                                            | Production unverified (D-1)                          |
| .002 Org/location backfill    | Monks done                                                                    | Manual Preview (D-3); Production Monks→Webster (D-1) |
| .003 Role migration           | Monks done; ladder adopted                                                    | Manual Preview (D-3/D-2)                             |
| .004 Module config            | Monks explicit; "seed defaults for all" overridden by D-5 (no blanket enable) | Owner matrix confirmation                            |
| .005 Attendance compatibility | Nothing to migrate; NULL valid                                                | Webster `external` only after D-1                    |
| .006 Hosted DEV validation    | Security migrations validated; no backfill needing validation                 | Post-snapshot evidence if D-3 = A                    |
| .007 Recovery / forward-fix   | Plan + verifier done                                                          | none                                                 |

**V2-008 is not complete.** On DEV it can be closed after D-3 is resolved and the owner accepts the
evidence; whether the Production scope (D-1) is inside #256 or moves to V2-009 is an owner call.
Issue #256 stays open.

## 9. Disposition of this branch

`feature/v2-008-backfill-executor` (migration 92, `executor.mjs`, pgTAP `0082`, two Vitest files)
is **shelved, local, unmerged, not an approved capability**. It must not be pushed, merged or
promoted to `main`; no commit is rewritten or deleted.
