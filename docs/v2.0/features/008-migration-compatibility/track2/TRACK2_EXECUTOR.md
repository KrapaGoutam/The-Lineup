# V2-008 Track 2 — Local-Only Backfill Executor

> **SHELVED — NOT APPROVED FOR DEPLOYMENT OR MERGE (owner decision D1, 2026-11-13).** Historical record. The migration, executor script and tests it describes are **not** part of `development`; they exist only on the local branch `feature/v2-008-backfill-executor`. See [../DEV_ACCEPTANCE_RECORD.md](../DEV_ACCEPTANCE_RECORD.md).

Prepared 2026-11-13 in worktree `.tmp/v2-008-backfill-executor`, branch
`feature/v2-008-backfill-executor`, based on `origin/development` at `207d088d` (PR #325 merged).
**Local-only. Nothing here was applied to Hosted DEV or Production.** No real organization,
location or user was touched; every row in this document's tests is a `harness.invalid` fixture
created and deleted by the test itself.

## -2. Continuation 2 (2026-11-13): the new-row concurrency boundary is CLOSED; target identity hardened

Starting point `4c55de1`. Scope: re-examine the "documented residual" below (a brand-new row from
a concurrent writer is not blocked) rather than accept it, and check the executor's target and
approval boundaries. **No Hosted DEV write, no push, no PR.** Hosted DEV was read only (see
`HOSTED_DEV_APPROVAL_PACKAGE.md`).

**Finding (reproduced with two real sessions).** The row locks of §-1.2 cannot stop a *new* row.
The real writers that create one take no lock at all: the public self-registration route
(`src/app/api/auth/register/route.ts`) inserts an active `memberships` row with the admin client
and no `location_memberships` row, and `apply_location_assignment_changes` inserts
`location_memberships` rows. Session A ran the executor and held its transaction open; session B:

| Concurrent writer (session B) | Before (row locks only) | After (table locks) |
| --- | --- | --- |
| new active `memberships` row (registration) | **not blocked (~8 ms); the committed state held an active member with no active location row** | blocks until A commits |
| new `location_memberships` row, another profile | **not blocked (~75 ms)** | blocks until A commits |
| activation of an existing inactive membership | blocked ~3.4 s (row lock) | blocks until A commits |
| same (location, profile) row the executor plans | blocked, then `23505` (safe) | blocks, then `23505` (safe) |

**Reasoning, not just measurement.** Re-reading before commit does not help: under READ COMMITTED
each statement takes a fresh snapshot, so a row committing *between the last reconciliation read
and the commit* is invisible to the function and nothing aborts. SERIALIZABLE would not help
either: the outcome is serializable (as "registration after the backfill"), so SSI has no
dangerous structure to flag. The only reliable fix is to keep the competing writers out until the
call has committed.

**Fix (migration `20261113120000`, not yet applied anywhere hosted).** After the per-organization
advisory lock the function takes `LOCK TABLE public.memberships, public.location_memberships IN
SHARE ROW EXCLUSIVE MODE` (that order). It conflicts with every INSERT/UPDATE/DELETE and with
itself, but not with reads, RLS evaluation, foreign-key checks or `FOR UPDATE` - login/session
reads are unaffected; writers queue for the few milliseconds the call runs. The earlier row locks
became redundant (a table-level write lock subsumes them) and were removed. Bounds: the locks are
requested first, holding nothing but an advisory lock no other writer takes, in a fixed order, and
no existing *function or route* writes both tables inside one transaction; **CORRECTION (continuation 3): this does not make a deadlock impossible** - FK `ON DELETE CASCADE` from `profiles` (Auth-user hard delete) or `organizations` writes both tables in one transaction in an order this function does not control, so a cycle with such a delete is possible (Postgres aborts one side after `deadlock_timeout`, possibly the application's delete; see `MINIMAL_COMPLETION_PLAN.md` §4); a transaction-local `lock_timeout = '5s'` makes the call fail
fast (`55P03`, nothing written, safe to retry) instead of stalling the queue behind a long writer,
and the caller's previous value is restored on success. This is a deliberate table-level lock; it
is acceptable only because the call is a one-off, owner-approved maintenance operation on two small
tables. **It must still be rehearsed on the restored Hosted DEV copy** (package section 7).

**What a writer that is ordered AFTER the backfill still produces:** a new self-registrant (or a
reactivated member) in an organization whose fallback has already been removed has an active
membership and no location row - i.e. no location access until a manager assigns them. That is
the steady state of the V2 model (nothing creates a location row at registration), not an executor
defect, but it is a product fact the owner should know (decision D-2, impact column).

**Tests.** pgTAP `0082` 37/37 (`L1-L3`: locks actually held after a successful call, exactly on
the two tables, caller's `lock_timeout` restored). New
`tests/local/v2-008-executor-concurrency.local.test.ts` (4/4): two real `docker exec psql`
sessions, one case per row above; it **fails 2 of 4 against the previous function** (verified by
re-applying the old definition), so it is a real regression guard. Clean `supabase db reset`
replay of all 92 migrations passed afterwards.

**Target identity (new, partial).** `assertLoopback` is hostname-only, so `localhost:54321` can be
an SSH tunnel to Hosted DEV. The wrapper now also refuses a service-role key that is a hosted
project's JWT (`ref` claim / `iss: "supabase"`) even on a loopback URL
(`assertNotHostedCredential`, 1 new test). This is a tripwire, **not an identity proof**: an
opaque `sb_secret_` key cannot be inspected. The real contract for any live run is specified in
`HOSTED_DEV_APPROVAL_PACKAGE.md` section 4 and is **not implemented**.

**Approval boundary (finding, not fixed).** `requireApprovedManifest` checks `status`,
`approvedBy`, `organizationId` and `stateHash` - all plain JSON fields that anything able to write
a file can set. It is a consistency guard that stops mistakes (wrong org, stale state, no manifest
at all), **not** proof that the owner approved. Because the wrapper is loopback-only this is
sufficient today; it is not sufficient for any Hosted DEV write. Specified in the package, not
built: building it is a prerequisite of the first real write, not of this session.

## -1. Continuation (2026-11-13, same day): two confirmed defects found and fixed

A follow-up safety review of the checkpoint below (`1917e8f`) found and fixed two real gaps before
any owner decision is sought. Both are now covered by pgTAP, a real-database Vitest round trip,
and (for the concurrency finding) genuinely parallel `psql` sessions outside any test framework.

1. **Readiness was being treated as approval.** `planOrganizationBackfill(snapshot)` can reach
   verdict `APPLY` for a single-location organization from the N=1 ladder default **with no
   manifest at all** — proven by this project's own prior "happy path" test, which called the
   planner with no second argument and the executor still executed it. `executor.mjs` now requires
   the actual approved manifest as a separate argument to both `executeRoleBackfillPlan` and
   `executeModuleConfigPlan`, independently re-verifies `status === "approved"`, a non-empty
   `approvedBy`, and that the manifest's `organizationId`/`stateHash` match the plan — and, for
   role backfill, additionally requires the caller to state the `organizationId` it intends to
   affect, so a copy-paste mistake pairing one organization's plan with another's manifest is
   refused rather than silently executed. See `requireApprovedManifest` in `executor.mjs` and the
   eight new refusal tests in `tests/local/v2-008-backfill-executor.local.test.ts`.
2. **`location_memberships` was not locked.** `migration_compat_execute_role_backfill` locked
   `memberships` (`FOR UPDATE`) and serialized itself with `pg_advisory_xact_lock`, but took no
   lock at all on the organization's EXISTING `location_memberships` rows. Measured with two
   genuinely concurrent `docker exec psql` sessions (not mocked, not pgTAP) against the disposable
   stack: while session A held both locks for a 10-second window, a concurrent raw `UPDATE` to a
   locked `memberships` row correctly blocked for the full remaining window (~7.9s, released
   within 0.3ms of A's commit); a concurrent raw `INSERT` into `location_memberships` for the same
   organization, same window, was **not blocked at all** (returned in ~2.7ms). Fixed by adding a
   `FOR UPDATE OF lm` lock on the organization's existing `location_memberships` rows alongside the
   `memberships` lock. **SUPERSEDED by section -2 (the new-row residual below is now closed with
   table-level locks; the row-lock design described here was replaced).** Original text: this closes the gap for a concurrent
   UPDATE/deactivation of an EXISTING row, but cannot and does not block a concurrent **new** row
   from a different writer (e.g. `apply_location_assignment_changes`) — Postgres cannot lock a row
   that does not exist yet. That residual case stays safe by construction: a same-key race aborts
   on the table's `unique (location_id, profile_id)` constraint, and a different-key race only
   improves the reconciliation check's view of who is mapped, never weakens it.

Both fixes, their tests, and the `0076` fixture classification below are in commit(s) after
`1917e8f` on this same branch (see `HANDOFF.md` for the exact SHA).

## 0. What already existed vs. what Track 2 adds

`scripts/migration-compat/{role-backfill,module-config,attendance}.mjs` (Batch B2-B4, reviewed
and merged in PR #325) are **pure, read-only planners**. Given a snapshot and an optional
owner-approved manifest they return a verdict and, for role/module, a changeset — but they have no
writer, and `cli-and-snapshot.test.ts` statically asserts the whole `scripts/migration-compat/`
directory contains zero write-shaped calls (`.insert/.update/.upsert/.delete/.rpc`, no
`@supabase/supabase-js`, no `pg`/`postgres` import). That invariant is a deliberate, previously
reviewed security boundary and **Track 2 does not touch it**.

Track 2 adds the missing writer in a new, sibling location so the old package's contract stays
literally unchanged:

| Layer | File | Purpose |
| --- | --- | --- |
| SQL (local only) | `supabase/migrations/20261113120000_v2008_track2_backfill_executor.sql` | Two `security definer`, `service_role`-only Postgres functions: `migration_compat_execute_role_backfill` and `migration_compat_execute_module_config`. |
| JS wrapper | `scripts/migration-compat-executor/executor.mjs` | `executeRoleBackfillPlan` / `executeModuleConfigPlan`. Loopback-only (reuses `assertLoopback` from `snapshot.mjs`); accepts **only** a plan object with the verdict that means "an owner-approved manifest produced this changeset" (`APPLY` / `READY_FOR_OWNER_APPROVAL`); never a hand-built row list. |
| pgTAP | `supabase/tests/database/0082_v2008_backfill_executor.test.sql` | 33 assertions against the real functions on the disposable local stack. |
| Vitest (real DB) | `tests/local/v2-008-backfill-executor.local.test.ts` | 5 assertions: the JS wrapper's own refusals, and a full plan → execute → re-plan round trip for both functions against the disposable stack. |

This migration is **not** applied to Hosted DEV (ledger stays 91) or Production under this
authorization. It exists only so the executor core is testable against a real, disposable
Postgres rather than mocked.

## 1. Why a SQL function, not a client-side bulk insert

`tests/local/migration-compat.local.test.ts` (existing, unchanged) proves the planners are
read-only by having the **test itself** apply a changeset with one multi-row
`supabase.from(...).insert([...])` call. That is one PostgREST request = one transaction, which is
enough to prove the planners' math, but it is not a reusable executor: it does not re-verify
tenant ownership, active status or drift against the *current* row at execution time, it cannot
lock an organization against a second concurrent attempt, and it has no reconciliation step that
aborts on an incomplete result.

The new functions do all of that **inside the one transaction a single RPC call already is**:

- `pg_advisory_xact_lock('v2008-role-backfill:' || organization_id)` serializes every backfill
  attempt for one organization (a second concurrent call blocks, never interleaves).
- `lock table memberships, location_memberships in share row exclusive mode` (section -2; this
  replaced the original per-organization `for update` row locks) keeps every other writer - new
  rows included - out of both tables until the transaction ends, so nothing can change
  `active`/`roles` or add a member while the reconciliation check below runs *or between it and
  the commit*.
- Every row is re-checked against the **live** `locations` / `memberships` / `location_memberships`
  tables, not against a client-supplied hash: location belongs to this organization and is active;
  profile is an active member of this organization; no existing row, or an existing row that is
  identical (idempotent no-op), or an existing row that differs (abort — never reactivated, never
  overwritten).
- After every row is classified, reconciliation asserts every active member either got a row or is
  on the owner-signed `p_unassigned_profile_ids` list, and that the organization's membership count
  did not change during the call. Either failing aborts the **whole** call — including any rows
  already inserted earlier in the same loop, because it is all one transaction.

This is deliberately **stronger** than comparing the JS planner's `sha256(canonicalJson(...))`
`stateHash`: it catches exactly the drift that would make the write wrong (a row appeared, a role
changed, a member was deactivated) and cannot be fooled by a hash collision or a stale client. The
JS planner's `stateHash` is still passed through and returned in the receipt as an audit-trail
value, but the executor's own correctness never depends on it matching.

## 2. What was deliberately NOT built

- **No bypass of `set_location_attendance_mode`.** That RPC (migration
  `20261110000000_attendance_v2_foundation.sql`) requires `auth.uid()` and
  `private.attendance_live_session()` — a real, live authenticated manager session. D-7C's executor
  design note ("no real-user session required") was written for the role/module writers; it was
  never a request to remove authentication from an existing, intentionally session-gated RPC, and
  doing so would be a security regression. **Attendance compatibility stays planning-only** in
  Track 2: `planAttendanceCompatibility` (unchanged) is the complete deliverable; any actual mode
  change still goes through the existing audited RPC, called by a real operator session, once D-6
  is decided. No new SQL was added for Attendance.
- **No enforcement activation.** `location_module_allows` / `module_enforcement_readiness` (V2-004.004)
  are untouched; the module executor does not read or write the backend-enforcement flag. D-8
  stays `staged`.
- **No Overall-role creation, no multi-location inference, no harness-location archiving.** The
  executor has no code path that could do any of these — `migration_compat_execute_role_backfill`
  only ever inserts into `location_memberships`, and only for rows the (unmodified) JS planner
  already validated into an `APPLY` changeset.

## 3. Module configuration executor

`migration_compat_execute_module_config(p_insert_rows, p_override_rows, p_actor)`:

- Locks every distinct location touched (insert + override) in **sorted order** before doing any
  work, so two concurrent calls over overlapping location sets can never deadlock.
- `insert_rows`: a row is inserted only if no row exists yet; an existing row with a different
  value is drift (`MC004`, abort) — this preserves "explicit existing settings are never silently
  changed" exactly as the planner's `existing_setting_would_change` blocker already required.
- `override_rows`: changes an existing row **only** when it is explicitly named here; overriding a
  row that does not exist yet is refused (`MC005` — use `insert_rows` instead).
- `settings` is refused everywhere (system-required, never configurable).
- Does not touch the backend-enforcement flag (D-8 stays `staged`).

No module manifest is owner-approved today (`decisionsRequired` on every active location per
`planModuleConfiguration`'s `REPORT_ONLY` report), so this executor has nothing to execute against
real data; it is proven only against the local harness fixtures created by the tests themselves.

## 4. Local test evidence (2026-11-13, disposable stack only)

- `npx supabase db reset` — applied all 92 migrations including
  `20261113120000_v2008_track2_backfill_executor.sql` with zero errors.
- `npx supabase test db` — **all pgTAP files pass, including `0082` (34/34 after the continuation's
  fixes).** `All tests successful. Files=85, Tests=3522. Result: PASS.`, confirmed twice to rule
  out nondeterminism.
- **`0076_attendance_manual_entry.test.sql` ("future clock-out is rejected") classified and fixed
  as a test-fixture day-boundary bug, not a product defect, not a Track 2 regression.** Root
  cause: the assertion derived `service_date` from an independent `now()` while `clock_in` was
  `now() - 1 hour`; near Chicago-local midnight these can fall on different calendar dates, so the
  product's (correct) service-date cross-check fired before the future-punch check the test exists
  to prove. The `today_date`/`today_in` pair in the same file's fixture CTE had the identical latent
  bug on a currently-passing assertion ("open session today succeeds"). Fixed by deriving each
  date from the timestamp actually used, not from a second, independent `now()` call — two
  one-line changes, no product code touched. Verified deterministic by running the full pgTAP
  suite twice.
- Extending `0062_location_module_configs.test.sql`'s `MC-014c` guard: that test is a tripwire
  asserting only a named allow-list of functions may read `location_module_configs`. The new
  `migration_compat_execute_module_config` was added to the allow-list (it is the deliberate,
  reviewed Track 2 writer) — this is the same pattern V2-004.004 already used to add its own two
  readers.
- `npx vitest run scripts/migration-compat` — 124/124 (unchanged planners + the existing static
  no-write-capability guard, which now passes because the executor lives in the sibling
  `scripts/migration-compat-executor/` directory, not inside the guarded one).
- `npx vitest run --config vitest.local.config.ts tests/local/v2-008-backfill-executor.local.test.ts`
  — 11/11 after the continuation's fixes (the original 5 plus 6 new refusal tests proving the
  manifest-required contract: no manifest, unapproved manifest, wrong-organization manifest,
  stale-stateHash manifest, caller/plan organization mismatch, and the module-config equivalent).
- `npx vitest run --config vitest.local.config.ts tests/local/migration-compat.local.test.ts` —
  6/6, unchanged (proves the planners are still read-only against the real schema).
- `npm run typecheck` — clean. `npx eslint scripts/migration-compat-executor/executor.mjs
  tests/local/v2-008-backfill-executor.local.test.ts --max-warnings=0` — clean.

## 4a. Real-concurrency test methodology (continuation, not pgTAP)

pgTAP runs inside one session's transaction, which cannot exercise genuine cross-session locking.
The concurrency claims above were measured with two to three independent `docker exec -i
supabase_db_restaurant-roster psql` processes, backgrounded and `wait`-ed on within one shell so
they actually overlap (a naive sequence of separate tool calls was tried first and was unreliable
for this purpose - each `docker exec` has multi-second startup variance, so a short, separately
re-issued `sleep` between launches is not a safe way to guarantee overlap; backgrounding all
sessions in one shell invocation and widening the hold window to 10s was). Fixture rows were
plain SQL inserts (prefix `00000000-0000-4000-8000-000000090…`), explicitly deleted afterward - not
pgTAP, so not auto-rolled-back.

Continuation 2 replaced the shell-script method with `v2-008-executor-concurrency.local.test.ts`,
which starts session A (executor + `pg_sleep` hold), waits 1.5 s so A is demonstrably inside its
transaction, then runs session B and asserts B's completion timestamp is after A's pre-commit
timestamp. It needs the local database container (`REHEARSAL_DB_CONTAINER`, default
`supabase_db_restaurant-roster`) and deletes its own fixtures.

(Counts in section 4 above predate continuation 2: pgTAP `0082` is now 37/37 and the executor
Vitest file 12/12; the full-suite 3522 figure is carried forward for unchanged source and was not
re-run.)

## 5. Failure-mode coverage (owner prompt §5)

| Required local failure test | Where proved |
| --- | --- |
| Fully mapped single-location organization | pgTAP T1-T4; Vitest round trip |
| Partially mapped organization | Existing `role-backfill.test.ts` (planner returns `APPLY` for the complete subset, `SKIP` for incomplete — unchanged, reused) |
| Multi-role ambiguity | Existing `role-backfill.test.ts` (`multi_role_requires_explicit_mapping`) — unchanged, reused |
| Multi-location ambiguity | Existing `role-backfill.test.ts` / `migration-compat.local.test.ts` (`multi_location_requires_complete_manifest`) — unchanged, reused |
| Inactive memberships | pgTAP T12-T13 (inactive member refused even if explicitly named) |
| Existing conflicting assignments | pgTAP T5-T6 (drift on a differing role aborts, row unchanged) |
| Owner/GM missing location assignment | Existing `role-backfill.test.ts` (`unmapped_member`) — unchanged, reused |
| Transaction rollback on late failure | pgTAP T14-T15 (one bad row in a multi-row call rolls back the whole call) |
| Concurrent assignment mutation (update, activation, **new rows**) | Section -2: `tests/local/v2-008-executor-concurrency.local.test.ts` (two real sessions, 4 cases, fails 2/4 against the previous version) + pgTAP `0082` L1-L3 |
| Repeated execution / idempotency | pgTAP T1-T4; Vitest "re-executing the stale plan is idempotent" |
| Source fingerprint mismatch | pgTAP T5-T6 / T9 (the executor's row-existence and tenant checks catch exactly the drift that matters; see §1 for why this is stronger than hash comparison) |
| Unauthorized role escalation | pgTAP T8 (invalid role string refused); ladder/expansion logic itself is unchanged in the JS planner |
| Partial-fallback cliff | pgTAP T16-T19 (an unmapped, unsigned member blocks the whole organization; signing it unblocks) |
| Cross-tenant access prevention | pgTAP T9-T10, T14-T15 |

## 6. Recovery strategy (unchanged from the D-7C proposal)

Nothing here changes the Batch C recovery pattern already proven on Hosted DEV (encrypted backup →
restore-validated rehearsal → rollback-only probes → apply). A future Hosted DEV rehearsal of this
executor would follow the same sequence: backup, restore to a scratch project, apply the migration,
run `0082` and the Vitest round trip against the restored copy, only then consider a real Hosted
DEV apply under a separate D-7C approval. **No such rehearsal was run against Hosted DEV under
this authorization** — only the always-local `supabase db reset` / `supabase test db` cycle above.
