# V2-008 Migration & Compatibility — Agent Handoff (after PR #325 merged into `development`)

## 00000000.4 FINAL DEV CLOSEOUT — owner decisions A1/B1/C1/D1/E1 applied (2026-11-13), DOCS ONLY

Record: [DEV_ACCEPTANCE_RECORD.md](DEV_ACCEPTANCE_RECORD.md). **DEV compatibility accepted; Production release NOT approved.** Amendments: .004 (A1, Manual Preview
stays unconfigured, Monks' 9 rows preserved) and .005 (B1, `attendance_mode` NULL accepted). Migration 92 SHELVED (executor branch kept local,
never merged). PR #325 merged `207d088d`. Delivered by a documentation-only PR from `docs/v2-008-dev-closeout` into `development`.
**Production carry-forward (V2-009):** D-1 preflight, org/location mapping, role compatibility, module readiness, Attendance compatibility,
backup/restore + rollback, D-11 session review, cross-org/location security, role-matrix + Kiosk E2E (physical device), module regressions,
GitHub `production` environment reviewers, owner-approved release. Harness cleanup (42 locations) and enforcement activation are separate owner decisions.
**Remaining owner approvals:** merge of the docs PR; #256 checklist update/closure; future temporary-credential rotation; harness disposition; enforcement activation.
**No-repeat:** logins, assignments, credential recovery, 89-91 rehearsal, probes, pgTAP campaign, planner. Do not deploy migration 92.

---

## 00000000.3 Final DEV closeout review (2026-11-13) — CONDITIONALLY READY, OWNER ACCEPTANCE REQUIRED

Docs only; start HEAD `490e5c5`; no Hosted DEV/Production/Neon contact, no write, no push/PR/merge. Full record:
[CLOSEOUT_REVIEW.md](CLOSEOUT_REVIEW.md). **D-3 completed and verified** (00000000.2). **Migration 92: SHELVED — NOT APPROVED FOR
DEPLOYMENT OR MERGE.** Latest validated DEV state (recorded): ledger 91; Manual Preview GM=manager, server=staff; Monks 5/5; both
planners NOOP; 0 Manual Preview module rows; attendance NULL; enforcement staged; Finance OFF.
Matrix: 001/002/003/006/007 complete on DEV; 004 conditional on D-5/5b; 005 conditional on D-6. Recommendations (not approvals):
accept Manual Preview unconfigured as a scoped DEV exception (no rows, no blanket enable, Monks matrix preserved); accept NULL
attendance; DEV-scope boundary (Production D-1 → V2-009, amend the 009 dependency line). Evidence limits (session id not bound to
the manager profile; Preview→DEV target reused) judged non-blocking (authority rule + read-back of rows).
Docs-only delivery = fresh branch from `origin/development`, copy named doc files only (CLOSEOUT_REVIEW §8); never cherry-pick
commits containing migration 92; exclude executor, 0082, tests/local, the 0062 change; the 0076 flake fix is a separate PR.
**Next:** owner answers CLOSEOUT_REVIEW §7 (A–E); then an owner-authorized docs-only PR and the owner's #256 update.
No-repeat: logins, assignments, recovery, 89–91 rehearsal, probes, pgTAP campaign. Production prerequisites: CLOSEOUT_REVIEW §9.

---

## 00000000.2 D-3 Option A EXECUTED and verified (2026-11-13) — Manual Preview mapped, planner NOOP

Start `26e8e29`. **Credential recovery (owner-approved, DEV only):** one administrative `rotatePasscodeCredential` for the existing
`DEV Preview Manager` (`9e915b25`), audit row `passcode_reset` (null actor, reason `D-3 Option A DEV manager access`); no other
credential, membership or user touched (before/after equal). Reason: no in-app reset path (Manual Preview has no owner; a manager cannot
reset a manager; self-change needs the old passcode). The temporary passcode is NOT recorded anywhere in the repo or docs.

**Assignments (owner-authorized agent-driven UI, normal app login, Hosted DEV Preview `the-lineup-lobouk5g5`):** signed in as the manager;
identity shown by app data (org "The Lineup — Manual Preview", staff rows testid `9e915b25…`/`5cd66c8e…`; sign-in "Monk's" banner is hard-coded).

1. Settings → Locations → Staff Assignments → manager → "Assign to DEV Bar & Lounge as Manager" → Save. Read-only check: exactly one active `manager` row for `9e915b`; server still unassigned; everything else identical.
2. Same flow → server → "Assign ... as Staff" → Save. Final: `9e915b` manager active, `5cd66c` staff active; both org memberships unchanged (`general_manager`, `server`, active).
   **Final reconciliation:** role planner (read-only, snapshot built via Management API because the CLI snapshot reader refuses non-loopback) → **NOOP** for Manual Preview and the-monks, 0 exceptions. Monks location memberships, module rows (9), locations, org membership rows unchanged; enforcement staged; Finance off; overall roles 0; 44 active locations; ledger **91** (latest `20261113100000`); migration 92 absent. Manual Preview: 0 module rows, attendance_mode NULL (unchanged). Smoke: manager lands in workspace (location `22fe5e05…`), "No restaurant location assigned" gone, Settings/Locations/Kiosks/Account recovery visible, Staff Assignments shows "Currently assigned / Manager"; Settings notes "No operational modules are enabled for this location" (expected: 0 module rows). Signed out. Expected side effects only: Auth sessions, login attempts, last_sign_in, one audit row, two location_memberships rows.

**Completion assessment vs issue #256 subfeatures (001-007):** 001 inventory, 002 org/location, 003 role migration (Monks 5/5, Manual Preview 2/2, planner NOOP): DEV-complete. 004 module configuration: Monks explicit; Manual Preview has **0 rows → no modules enabled** (this is the safe default; owner decision D-5/5b whether to configure or accept). 005 attendance: legacy-compatible NULL, documented; D-6. 006 Hosted DEV validation: ledger 91 + security migrations validated; full-feature rerun not repeated. 007 recovery/forward-fix strategy: documented. **Not auto-closed;** #256 checkboxes still all unchecked on GitHub. Remaining gates: D-5/5b (Manual Preview modules — decide, not assume enabled), D-6, then V2-008 closeout review; D-1/D-8/D-11, harness cleanup (D-4), Production reviewers and V2-009 release gates are deferred and not V2-008 DEV blockers. Migration 92 stays shelved.

## 00000000.1 D-3 Option A + D-7C shelve approved (2026-11-13) — HUMAN ASSIGNMENTS PENDING

Started at `b732547` (verified: correct worktree/branch, no upstream, no remote Track 2 branch, PR #325 MERGED, #256 OPEN).
**Owner approvals:** D-3 **Option A** (keep Manual Preview; exactly two Staff Assignments by its own GM, signed in as
themselves: GM -> `manager`, then server -> `staff`, in that order, GM verified first) and D-7C **shelve migration 92**
(`20261113120000_v2008_track2_backfill_executor.sql`: NOT FOR DEPLOYMENT, no PR, branch kept local, no history rewrite).
The agent must not impersonate the GM, use SQL/RPC/service role, or click Save.

**Pre-assignment read-only snapshot [fresh]** (`track2/dev_org_readonly_snapshot.mjs`, `read_only:true` SELECT, ids truncated):
Manual Preview = 1 active location (`22fe5e`, attendance_mode NULL), 2 active members: GM `9e915b` (`general_manager`),
server `5cd66c` (`server`), **0 location_memberships, 0 module rows**. Monks (`the-monks`) = 5 members, 5 location rows
(`manager`x2, `staff`x3), 9 module rows, unchanged. Overall roles 0, enforcement `staged`, Finance `[false]`, 44 active locations.
Baseline kept outside the repo (scratchpad `pre-snapshot.json`). Migration 92 never applied to Hosted DEV.

**Workflow verified in code:** `apply_location_assignment_changes` (final definition `20261103030000`) authenticates via
`auth.uid()`, authorizes an active owner/general_manager of the location's own organization, requires the target to hold an
active organization membership, has **no self-assignment restriction**; UI: `no_access` screen -> ContextSettings -> Settings ->
Locations -> Staff Assignments (`staff-assignment-actions.ts`, `location-administration.tsx`).

**Status: NO assignment performed.** Operator procedure: [track2/D3_OPTION_A_OPERATOR_PROCEDURE.md](track2/D3_OPTION_A_OPERATOR_PROCEDURE.md).
Expected final planner verdict for Manual Preview: NOOP. #256 stays OPEN. Migration 92: SHELVED / NOT FOR DEPLOYMENT
(Monks needs no backfill; Manual Preview uses the supported workflow; privileged maintenance functions and table-level
locking are disproportionate; unresolved live-approval/target-identity requirements; Production promotion adds risk).

## 00000000. Track 2 continuation 3 — minimal-completion resolution (2026-11-13) — NO BULK EXECUTOR NEEDED; OWNER DECISIONS REQUIRED

Same worktree/branch, started and verified at `5056dec` (clean; base `development` `207d088d`; no remote Track 2
branch; no PR). **No Hosted DEV write, no migration 92, no Production/Neon contact, no push/PR/merge.** Full
analysis: [`track2/MINIMAL_COMPLETION_PLAN.md`](track2/MINIMAL_COMPLETION_PLAN.md).

- **Read-only refresh [fresh]:** verifier `--expect 91 --compare` earlier-today snapshot: ledger 91, function and
  8-category schema fingerprints equal, **all 91 tables hash-identical** (so `the-monks` cannot have changed). Focused
  query: Monks 5/5 mapped, 9 explicit module rows, Attendance NULL → role migration **satisfied**. Manual Preview: GM +
  server, 1 active location, 0 location rows, 0 module rows. Enforcement staged, Finance off, 0 Overall roles, 44 active
  locations. New reusable read-only tool: `track2/dev_org_readonly_snapshot.mjs` (DEV ref hard-coded, `read_only`, ids truncated).
- **Supported workflow exists [code]:** `apply_location_assignment_changes` via Settings → Locations → Staff Assignments;
  reachable from the `no_access` screen; DB authority = Overall owner/manager or active owner/general_manager **of that
  organization** (only Manual Preview's own GM qualifies on DEV); atomic per person; **no actor audit** (timestamps only,
  parity with the executor's return-value-only receipt). Not driven live (needs the GM's real credential = a write).
- **Migration 92 disposition: Option A + B** — no bulk executor; branch shelved, local, unmerged, "not an approved
  capability". Option C only if a Production inspection (D-1) finds a multi-person organization needing one atomic write
  and the HOSTED_DEV_APPROVAL_PACKAGE §4 mechanism is built first.
- **Lock assessment:** SHARE ROW EXCLUSIVE on two global tables is disproportionate for 2 rows; it queues registration and
  other writers (FIFO convoy up to the 5 s `lock_timeout`). **Correction:** the earlier "no deadlock possible" sentence was
  too strong — FK `ON DELETE CASCADE` from `profiles`/`organizations` writes both tables in one transaction (re-scan of
  all migrations found no _function_ that does). Fixed in `TRACK2_EXECUTOR.md` §-2.
- **Owner decisions:** the nine decisions are in the MINIMAL_COMPLETION_PLAN §5 table with the required columns; only
  **D-3** (A keep+assign via supported workflow / B retire via lifecycle process / C defer) is needed before further work. D-7C
  revised to "no bulk backfill; shelve executor" (options preserved). NULL Attendance = valid unconfigured/legacy-compatible state.
- **V2-008 is NOT complete;** #256/#248/#257 stay open. DEV can close after D-3 is resolved and the owner accepts the evidence;
  Production scope (D-1) inside #256 vs V2-009 is an owner call.
- **Next exact action:** owner answers D-3. If A: owner-run procedure in the plan §7 (GM signs in as themself; GM→manager first,
  then server→staff; pre/post snapshots saved outside git). If B/C: nothing to write. No new engineering is required.
  Do not deploy migration 92; do not promote it to `main` (auto-deploys to Production); do not start V2-009.
- **Not re-run (unchanged code):** 3,522 pgTAP, 0082, executor/concurrency tests, planner suite, F-1/U-1/E-1, V2-007.

---

## 0000000. Track 2 continuation 2 — live read-only reconciliation + concurrency closure (2026-11-13) — OWNER DECISION PACKAGE READY, LIVE BACKFILL NOT AUTHORIZED

Same worktree `.tmp/v2-008-backfill-executor`, branch `feature/v2-008-backfill-executor`, started
at `4c55de1` (verified clean, no remote Track 2 branch, no PR). The branch had `origin/development`
set as its upstream by `git worktree add`; **unset** (local config only) so a bare `git push` can
never target `development`. Final commit SHA: see `git log -1` (a commit cannot contain its own SHA).
**No Hosted DEV write, no Production/Neon contact, no push, no PR.**

- **Hosted DEV read-only (SELECT inside `begin read only`, DEV ref hard-coded):** ledger **91**
  (verifier `--expect 91` all `ok`), Track 2 functions absent, enforcement `staged`, Finance off,
  0 Overall roles, 44 active locations (42 in harness orgs `v2h-*`/`v2ho-*`, 2 real), attendance
  modes only on 5 inactive V2007 fixtures. Evidence outside git:
  `%LOCALAPPDATA%\TheLineup-DEV-Backups\V2-008-TRACK2-20261113\`.
- **First pilot `the-monks` = Outcome A, verified no-op.** Org `c5e8ad9c-39be-4344-bbdb-ae84306f0134`,
  location `a5d46f61-cf64-4b96-8d9f-41d6812d561c`, 5/5 active members already mapped (GM, owner →
  manager; 3 servers → staff). Planners on live data: role `NOOP` (state hash
  `9e143db40fd2e437f22e29c7c7af42696a836c35c2249159b81502a3c08c2f33`), modules `REPORT_ONLY`
  (9 explicit rows; `bar_inventory` on, eight off), attendance `REPORT_ONLY` (mode unset, 0
  sessions, 0 links). **Nothing to execute; no executor run is needed or proposed.** Manual Preview
  would plan `APPLY` (2 rows) with no manifest — recorded as the readiness-is-not-approval example,
  not proposed (D-3 undecided).
- **Concurrency: a real race was reproduced and closed.** With two real sessions, a new active
  `memberships` row (the public `/api/auth/register` route takes no lock) or new
  `location_memberships` row was NOT blocked by the previous row-lock-only executor (8–75 ms) and the
  committed state held an active member with no location row. READ COMMITTED re-reads and SERIALIZABLE
  cannot catch this (the outcome is serializable). Fix in the **not-yet-deployed** migration 92:
  `LOCK TABLE memberships, location_memberships IN SHARE ROW EXCLUSIVE MODE` after the advisory lock,
  5 s `lock_timeout` restored on success; reasoning, deadlock analysis and operational bounds in
  `track2/TRACK2_EXECUTOR.md` §-2. Tests: pgTAP `0082` 37/37 (new L1–L3, mutation-verified);
  new `tests/local/v2-008-executor-concurrency.local.test.ts` 4/4 (fails 2/4 on the old function);
  clean `supabase db reset` replay of 92 migrations; `0062` guard still passes. Migration 92 sha256
  now `56ed6955…e234d` (was `89ce3764…e60b`).
- **Approval/target boundary: finding recorded, NOT closed.** `requireApprovedManifest` validates
  plain JSON fields (`status`, `approvedBy`) — a consistency guard, not proof the owner approved;
  `assertLoopback` is hostname-only (a tunnel passes). Added a partial tripwire
  (`assertNotHostedCredential`, refuses a hosted-project service JWT even on loopback; +1 test).
  The real contract (owner-signed ed25519 approval bound to env/project ref/org/manifest hash/plan
  hash/migration hash/expiry; independent target identity; persisted receipt) is **specified** in
  `track2/HOSTED_DEV_APPROVAL_PACKAGE.md` §4 and **not built**. It blocks any real write; it does not
  affect the `the-monks` no-op.
- **Product fact for the owner (D-2):** once the fallback cliff is crossed, a self-registrant
  (auto-approved) or a reactivated member has an active membership and no location row; nothing in
  the app creates that row.
- **Documents:** `track2/D7C_OWNER_DECISION_TABLE.md` (nine decisions, refreshed, classification),
  `track2/HOSTED_DEV_APPROVAL_PACKAGE.md` (real proposal; D-7C-1..4 and G-2 all NOT REQUIRED for the
  first pilot), `track2/TRACK2_EXECUTOR.md` §-2.
- **Validated this session (do not repeat unless source changes):** pgTAP `0082` 37/37 + `0062` (129
  assertions together); local Vitest 22/22 (`v2-008-executor-concurrency`, `v2-008-backfill-executor`,
  `migration-compat`); planners 124/124; ESLint/typecheck clean. **Carried, not re-run (source
  unchanged):** full pgTAP 3522 (pre-change; the only added test file content is `0082`), PR #325 CI,
  Batch C Hosted evidence. Prettier reports 2 pre-existing style warnings at HEAD (not in the gate).
- **Explicit prohibitions still in force:** no migration 92 on Hosted DEV, no backfill, no
  Hosted users/memberships/locations/module/attendance changes, no enforcement or Finance change, no
  Production/Neon, no push/PR/merge, no V2-009, #256/#248 stay open, GitHub `production` environment
  unchanged (no required reviewers = V2-009 blocker). **Do not promote migration 92 to `main`: it
  would auto-deploy to Production.**
- **Next exact action:** owner reviews `track2/D7C_OWNER_DECISION_TABLE.md`. No answer is required
  for `the-monks`. If the owner wants a real first write (Manual Preview): answer D-3 + D-2, a fresh
  snapshot → approved manifest, build the §4 authorization mechanism (local-only task), then separate
  D-7C-1/D-7C-2 approvals with backup → restore-validated rehearsal that also exercises the table lock
  under a concurrent writer.

---

## 000000. Track 2 continuation — executor safety verification (2026-11-13, same day) — READY FOR OWNER DECISIONS

Continuation of the same local session, same worktree/branch, starting checkpoint `1917e8f`.
Scope: verify the executor's approval-enforcement and concurrency guarantees, fix confirmed
narrowly-scoped defects, classify the `0076` flake, consolidate the nine D-7C decisions into one
owner-facing table. **No Hosted DEV/Production contact, no push, no PR.**

- **Confirmed and fixed: readiness was being treated as approval.** `executor.mjs` previously
  executed any plan with verdict `APPLY`/`READY_FOR_OWNER_APPROVAL` — but
  `planOrganizationBackfill` can reach `APPLY` from the single-location ladder default with **no
  manifest at all** (proven by this project's own prior "happy path" test). Both `execute*`
  functions now require the actual approved manifest as a separate, independently-verified
  argument, plus (for role backfill) a caller-stated `organizationId` cross-check. 6 new refusal
  tests added.
- **Confirmed and fixed: `location_memberships` was unlocked during a role-backfill transaction.**
  Measured with genuinely concurrent `docker exec psql` sessions (not pgTAP): a concurrent `UPDATE`
  to a locked `memberships` row correctly blocked ~8s; a concurrent `INSERT` into
  `location_memberships` for the same organization was **not blocked at all** (~3ms). Fixed by
  extending the `FOR UPDATE` lock to the organization's existing `location_memberships` rows.
  Documented, not fixed (out of this session's scope — would require changing an existing
  application writer): a concurrent **new** row from a different writer still isn't blocked, but
  is bounded safely by the unique constraint and by reconciliation re-reading live state.
- **`0076_attendance_manual_entry.test.sql` classified and fixed:** a test-fixture day-boundary
  bug (service_date derived from an independent `now()` instead of the actual punch timestamp),
  not a product defect, not a Track 2 regression. Two one-line fixes; full pgTAP suite now passes
  deterministically (3522/3522, confirmed twice), no product code touched.
- **D-7C decisions reorganized into one owner-facing table:**
  [`track2/D7C_OWNER_DECISION_TABLE.md`](track2/D7C_OWNER_DECISION_TABLE.md) — business question,
  verified data, options, recommendation, impact, blocks, per decision. First-organization pilot
  recommendation: `the-monks` ("DEV Location", single real active location) is the structural
  candidate, but this is **not re-verified live this session** — the next session should take a
  fresh read-only snapshot before treating it as an actual target. `the-lineup-manual-preview` and
  every other real organization are explicitly NOT recommended (no approved manifest, D-3
  undecided).
- **Full verification re-run after the fixes:** pgTAP 3522/3522 (×2); Vitest unit 124/124; Vitest
  local 17/17 (11 for the new executor test file, 6 unchanged for the existing one); typecheck and
  eslint clean.
- **Next exact implementation step:** owner answers `track2/D7C_OWNER_DECISION_TABLE.md`. Once one
  real organization has an approved manifest, a new session takes a fresh read-only Hosted DEV
  snapshot, fills in `track2/HOSTED_DEV_APPROVAL_PACKAGE.md`, and runs the backup →
  restore-validated rehearsal → apply sequence under a separate D-7C write authorization.

---

## 00000. Track 2 local-only executor (2026-11-13) — LOCAL IMPLEMENTATION COMPLETE, OWNER DECISIONS OUTSTANDING

**Status: the organization-atomic backfill executor is built and tested LOCALLY ONLY; V2-008 is
still NOT complete; issue #256 stays OPEN; parent #248 and V2-009 #257 stay open.** New worktree
`.tmp/v2-008-backfill-executor`, branch `feature/v2-008-backfill-executor`, based on
`origin/development` `207d088d` (the exact PR #325 merge commit — verified before starting). This
section and its linked documents are **local commits only on this new branch: not pushed, no PR,
no merge, no Hosted DEV or Production write.** The old worktree
`.tmp/v2-008-migration-compatibility` and its uncommitted evidence were left untouched; its
closeout documentation (this file's section below, `D7C_OWNER_DECISION_PACKET.md`, etc.) was
carried forward here by a clean patch apply, not recreated from memory.

- **What was built:** `supabase/migrations/20261113120000_v2008_track2_backfill_executor.sql` —
  two `security definer`, `service_role`-only Postgres functions
  (`migration_compat_execute_role_backfill`, `migration_compat_execute_module_config`) that are the
  missing writer behind the existing PURE planners (`scripts/migration-compat/{role-backfill,module-config}.mjs`,
  unchanged). A JS wrapper lives in its own new directory, `scripts/migration-compat-executor/executor.mjs`,
  specifically so `scripts/migration-compat/`'s reviewed "zero write capability" static guarantee
  (enforced by its own test) stays literally unchanged. Full architecture, the reasoning for a SQL
  function over a client-side bulk insert, and the explicit decision NOT to build an Attendance
  writer (the existing `set_location_attendance_mode` RPC requires a real authenticated session —
  bypassing that would be a regression, not a feature) are in
  [`track2/TRACK2_EXECUTOR.md`](track2/TRACK2_EXECUTOR.md).
- **Test evidence (local disposable stack only):** `supabase db reset` applies cleanly (92
  migrations); pgTAP `0082` 34/34 (tenant-boundary, drift, atomic-rollback, reconciliation,
  idempotency and grant-only-to-service_role assertions); the pre-existing `0062` MC-014c guard
  extended with the one new legitimate module-config reader; two new Vitest files
  (`tests/local/v2-008-backfill-executor.local.test.ts` 5/5; the existing
  `migration-compat.local.test.ts` re-run unchanged, 6/6); `npm run typecheck` and
  `eslint --max-warnings=0` clean. One **pre-existing, unrelated** calendar-dependent pgTAP flake
  was observed in `0076_attendance_manual_entry.test.sql` ("future clock-out is rejected") — not
  touched by this work, not caused by it, not fixed (out of scope; recorded for visibility).
- **D-7C decisions:** reorganized into one table,
  [`track2/D7C_DECISION_MATRIX.md`](track2/D7C_DECISION_MATRIX.md), with the local-tooling-policy
  vs. real-data-write line drawn explicitly per row. **No decision was newly approved in this
  session.**
- **Owner-ready template for a FUTURE real backfill:** [`track2/HOSTED_DEV_APPROVAL_PACKAGE.md`](track2/HOSTED_DEV_APPROVAL_PACKAGE.md) —
  every field is either a known local-tooling fact or an explicit "NOT FILLED" placeholder. **Not
  executable; nothing in it is approved.**
- **Not built, by design:** no Attendance writer; no enforcement activation (D-8 stays `staged`);
  no Overall-role creation path; no harness-location archiving (D-4, explicitly out of scope this
  session); no real organization, location or user was read, written or targeted — every test
  fixture is a `harness.invalid` row created and deleted by its own test.
- **Next exact implementation step:** the owner answers `D7C_DECISION_MATRIX.md` (at minimum D-1 or
  its option c, and signs off D-2 for real-data use). Once one real organization has an
  owner-approved manifest, a new session fills in `HOSTED_DEV_APPROVAL_PACKAGE.md` and runs the
  backup → restore-validated rehearsal → apply sequence against Hosted DEV, under a **separate**
  D-7C write authorization for that specific migration and manifest. Do not start V2-009. Do not
  activate backend enforcement.

---

## 0000. Final integration (2026-11-13) — security work MERGED, backfill PENDING

**Status: BATCH C INTEGRATION COMPLETE — SECURITY WORK MERGED, BACKFILL PENDING. V2-008 is NOT complete; issue #256 stays OPEN; parent #248 and V2-009 #257 stay open.** (This section and the other edits below are **local, uncommitted documentation** on the merged feature branch; they are **not** in `development`.)

- **Merge:** PR [#325](https://github.com/KrapaGoutam/The-Lineup/pull/325) merged by merge commit **`207d088d5bca5d989030870433cf4daa3ecb4c78`** at 2026-11-13T04:58:03Z (parents `790fd2db` and the reviewed source `9058a3aadecc245b995295f0e237ab0127a111a2`, matched with `--match-head-commit`). The merge tree is identical to the reviewed source tree. `main` unchanged at `5e5b7747693b6e81014eafdf299b87e56c3f033d`. No branch protection exists on `development`; no auto-merge.
- **CI:** exact-head evidence reused (application, browser-smoke, migrations-and-policies pass; `deploy-migrations` skipped). Neither workflow triggers on a push to `development` (`ci.yml` and `database.yml` push triggers are `main` only), so **no merge-triggered CI exists** and no migration deployed.
- **Development Preview:** GitHub deployment `7757555340`, environment Preview (`production_environment: false`), ref/sha `207d088d`, state success, URL `https://the-lineup-lobouk5g5-onepiece11.vercel.app`. Client bundle: DEV ref `opmujepkemwcdxxorhfd` ×1, Production ref ×0, no Neon host. Unauthenticated GETs of `/`, `/r/the-monks` (+ `?tab=settings|recipes|inventory|attendance`), `/kiosk` and an unknown slug all return 200 with a client shell, no tenant data in the HTML, no error strings. **Not performed:** authenticated role-aware checks (no already-available authorized test session was used; no credentials were created or used), kiosk pairing, any write. The Kiosks page is a client-side Settings subview, so it has no URL of its own.
- **App ↔ DB compatibility (read-only):** all 100 distinct `.rpc("…")` names called by the merged source exist in Hosted DEV `public`; verifier `--expect 91 --compare` still shows ledger 91, function and schema fingerprints `ledger91`, **all 91 tables identical to the pre-apply snapshot**; guards unchanged (enforcement `staged`, Finance OFF, 0 Overall roles, kiosk devices `{revoked: 6}`, 14 module-config rows, attendance modes `{null:44, external:1, internal_the_lineup:4}`).
- **Release-governance blocker (owner action, not changed):** GitHub `production` environment has `protection_rules: []` — no required reviewers, no deployment-branch restriction, admins can bypass; `database.yml` `deploy-migrations` runs `supabase db push` on any push to `main` touching migrations. Recommend Required reviewers, Prevent self-review, branch restriction to `main`, and an explicit release approval **before** any `development → main` promotion. Verification of these protections is a prerequisite for the Production release (recorded in V2-009 STATUS). It did not block this development-only merge.
- **Next owner decision:** [D7C_OWNER_DECISION_PACKET.md](D7C_OWNER_DECISION_PACKET.md) — one consolidated package for the remaining V2-008 scope (mapping, role ladder, fallback-cliff rules, module matrix, attendance, executor proposal). Nothing in it is approved or built.
- **Next exact implementation step (after the owner answers the packet):** build the backfill executor plus a restored-copy rehearsal inside V2-008 for one organization, in a **new** session (Claude Code Local, Sonnet 5.x, High) in worktree `.tmp/v2-008-backfill-executor` on `feature/v2-008-backfill-executor` from `development`. Do not start it automatically; do not begin V2-009.
- **Local-only housekeeping:** the worktree is back on `feature/v2-008-migration-compatibility`; the encrypted backup stays in the evidence directory (≥ 7 days after acceptance).

---

# (previous) V2-008 Migration & Compatibility — Agent Handoff (after the Batch C Hosted DEV rollout)

## 000. Batch C rollout (2026-11-13) — migrations 89–91 are LIVE on Hosted DEV

**Status: SECURITY ROLLOUT PASSED; PR into `development` open for owner review (not merged). V2-008 is NOT complete.** Full evidence: [batch-c/BATCH_C_ROLLOUT_RECEIPT.md](batch-c/BATCH_C_ROLLOUT_RECEIPT.md). Starting HEAD `46fe3d97cef4fbc3c974c7ad29dd0d9ad52a9eb5`; the rollout checkpoint is the next commit(s) on `feature/v2-008-migration-compatibility` (`git log`; PR number on GitHub and in the chat report — a document cannot embed its own SHA).

- **Hosted DEV `opmujepkemwcdxxorhfd`: ledger 88 → 91** (04:13:21Z). Applied exactly `20261112200000` (D7+F-1), `20261112220000` (U-1), `20261113100000` (E-1) with `supabase db push` after a dry run that listed exactly those three. Function/grant-only; **all 91 tables identical** before/after, `auth.sessions`/`refresh_tokens` intact; enforcement `staged`, Finance OFF, 0 Overall roles, 6 revoked kiosk fixtures, 14 module-config rows, attendance modes `{null:44, external:1, internal_the_lineup:4}` unchanged.
- **Backup/recovery:** fresh DPAPI-encrypted backup `dev-20261113T040959Z.zip.dpapi` (sha256 `5cf7fa58…be0b92`, local owner profile only, keep ≥ 7 days after acceptance), restore-validated (121 tables identical, 198 policies equal) and rehearsed on the restored real data (354/354 pgTAP; `0081` passes with real 0 Overall roles, confirming the earlier LAD-16 failure was a fixture assumption).
- **Hosted probes (rollback-only, D-7B path 1):** F-1+D7 `0078` 105/105, U-1 `0079` 69/69, E-1 `0080` 105/105; nothing persisted (full-table diff). **SQL-level only — not real-GoTrue/browser/tablet acceptance.**
- **Do the app/Preview only after this point** (satisfied: the PR Preview is built after the apply). Both new RPCs are visible to PostgREST (anon → `42501`).
- **Automation facts (current YAML):** `database.yml` `deploy-migrations` runs only on `push` to `main` in environment `production`. **GitHub `production` has NO required reviewers** (`protection_rules: []`, no branch restriction, `can_admins_bypass: true`): a merge to `main` touching migrations auto-runs `supabase db push`. Owner must add Required reviewers before any release; not modified here.
- **Still NOT done / not authorized:** D-7C backfills (no executor exists), organization/location/role/module/attendance changes, V2-004 enforcement activation, Production/Neon, merge, V2-009. Outstanding: D-1, D-3, D-4, D-5/5b, D-6, D-7C, D-8, D-11. The fallback cliff (a complete validated mapping per organization before any location-membership backfill) remains a hard constraint.
- **Exact next action:** owner reviews the PR; if CI is green, decides whether to merge the security migrations and dry-run tooling into `development` (do not close #256; do not begin V2-009), then separately the D-7C approval package; and adds Required reviewers to the GitHub `production` environment before any release.
- **Do not repeat:** the backup, restore, rehearsal, Hosted apply and probes above; re-run only the read-only verifier (`node batch-c/hosted_dev_readonly_check.mjs --target hosted --expect 91`) to confirm state.
- **Traps learned:** rehearse/apply as `postgres`, not `supabase_admin`; the restored copy differs from Hosted only in six CHECK parenthesizations + raw policy `search_path`; the Management API returns only the last statement's rows and error bodies escape quotes; Node on Windows prints a harmless `UV_HANDLE_CLOSING` assertion after `process.exit`.

---

# (previous) V2-008 Migration & Compatibility — Agent Handoff (after Batch C readiness)

A handoff cannot embed its own commit SHA: Batch A `874091eb`, B1 `6457c1ae`, S1 `eb8adf2`, Batch B `f2798c6`; the **Batch C readiness checkpoint is the next commit** on `feature/v2-008-migration-compatibility` (`git log`, and the chat report). Nothing is pushed.

## 00. Batch C (2026-11-13) — readiness for the controlled Hosted DEV rollout

**Status: READINESS PASSED — HOSTED DEV APPROVAL (D-7A) REQUIRED.** V2-008 is **not** complete: Track 2 (actual backfills) is untouched.

- **Local state:** HEAD `f2798c6` at start, clean, no upstream, no remote V2-008 branch, no PR. Live `git ls-remote`: `development` still `790fd2db`, `main` `5e5b7747`.
- **Hosted DEV (read-only only):** ledger **88** (max `20261111120000`, none of the three pending versions). The 16 functions the migrations replace are identical (body, security-definer, config, ACL, owner) to local ledger 88; the whole public+private schema (8 categories) is hash-identical. Enforcement `staged`, Finance OFF, 0 Overall roles, 6 kiosk devices (all revoked V2-007 fixtures). **No Hosted write occurred.**
- **Track 1 (ready, needs D-7A):** migrations 89/90/91 (function/grant-only; checksums unchanged: `4faa2707…3c2c`, `48036911…ac488`, `9375ae54…a8ad`).
- **Track 2 (not started; applying Track 1 completes none of it):** org/location backfill, role backfill (atomic per organization; fallback cliff), module configuration, Attendance modes — blocked on D-1/D-2…/D-3/D-4/D-5/D-5b/D-6 and an executor that does not exist.
- **Rehearsal:** `tests/local/v2-008-batch-c-migration-rehearsal.local.test.ts` **9/9**: seeds a populated ledger-88 database, reproduces the three defects (negative control), applies the three migrations with the Supabase CLI, **0 of 91 tables changed**, same pre-migration tokens keep working, intended behaviour for 89/90/91 (incl. import commit and a revoked Auth session), idempotent re-apply, upgrade == clean-replay schema. pgTAP 0077–0080 pass on the populated upgraded DB.
- **Review:** one independent reviewer, **no P0/P1**; R-1…R-4 dispositions in [batch-c/BATCH_C_READINESS_RECEIPT.md](batch-c/BATCH_C_READINESS_RECEIPT.md) §5. Erratum: the E-1 migration header says imports are untouched; they are gated (file intentionally not edited).
- **Automatic deployment verified:** PRs/merges to `development` apply no migration; `database.yml` `deploy-migrations` runs `supabase db push` only on a push to `main` (environment `production`).
- **Deliverables (all under `batch-c/`):** [receipt](batch-c/BATCH_C_READINESS_RECEIPT.md) · [rollout + recovery plan](batch-c/ROLLOUT_AND_RECOVERY_PLAN.md) · [D-7 approval packet](batch-c/D7_APPROVAL_PACKET.md) · read-only verifier `hosted_dev_readonly_check.mjs` with `expected-fingerprints.json`, `function_fingerprint.sql`, `schema_fingerprint.sql`.
- **Exact next action:** owner answers the D-7A packet (and, separately, remote Git; D-7B path 1). Then: backup + restore-validated rehearsal → apply → `--expect 91 --compare` → rolled-back probes → receipt. **Do not** begin D-7C.
- **No-repeat list:** do not re-run the Batch B suites on unchanged source; do not re-inventory DEV; do not re-run V2-007 acceptance or the F-1/U-1 reproductions locally; the staged fingerprints, schema equality and populated rehearsal above are final unless source changes. Re-check the Hosted ledger (`hosted_dev_readonly_check.mjs --target hosted --expect 88`) immediately before any apply.
- **Resume locally:** `npx supabase db reset --local --version 20261111120000`, export `LOCAL_SUPABASE_*` from `npx supabase status -o env`, `npx vitest run --config vitest.local.config.ts tests/local/v2-008-batch-c-migration-rehearsal.local.test.ts` (needs Docker; refuses to run unless the ledger is exactly 88).

---

# Previous handoff (after Batch B continuation: E-1 + B2–B4 tooling) — preserved

Feature-specific; other V2.0 features keep their own handoffs. A handoff cannot embed its own commit SHA: Batch A is `874091eb3982b7e1791488643a957342a22ec2a4`, B1 is `6457c1ae9f6307d1d9d43045ed87365eee9407af`, S1 is `eb8adf2176e9631873e6fed771d34d9d2f1fe119`, and the **Batch B continuation checkpoint is the next commit** on `feature/v2-008-migration-compatibility` (`git log`, and the chat report).

## 0. Batch B continuation (2026-11-13) — what changed since S1

One cumulative local package; **nothing pushed, no upstream, no PR, Hosted DEV / Production / Neon / `main` / `development` untouched.** Remote `development` was re-checked with `git ls-remote` at the start: still `790fd2db560c41cb27affe98a70faeb7bd3f07cd` (fresh, not just the local ref).

- **E-1 implemented (D-10 Option A).** Migration `20261113100000_e1_shared_catalog_authority.sql` (sha256 `9375ae54540f3c49d5f7d3a3a7ce845b30a54c7e6b0d180a4ef7ec3f8ad5a8ad`); **local ledger 90 → 91, Hosted DEV still 88** (it now lacks THREE local migrations: B1, U-1, E-1 — push them in that order under D-7). In an organization with two or more active locations, location roles can no longer write the shared recipe book or the shared Inventory catalog; one-location organizations see no change. Details and evidence: [E-1 plan §13](E1_RECIPES_INVENTORY_SECURITY_PLAN.md).
- **B2/B3/B4 built as read-only dry-run planners** (no executor exists): [B2_B4_PLANNING_KIT.md](B2_B4_PLANNING_KIT.md), code in `scripts/migration-compat/`.
- **Capability ladder measured** (pgTAP `0081`): the D-2 ladder changes no capability at one location (only the owner's Schedule/Tasks/Tips 4 → 3, same band); a **partial** backfill locks out even the general manager's Tasks/Tips — the measured proof for the atomic-organization rule.
- **Decisions adopted for LOCAL implementation only:** D-10, D-2, D-2b, D-2c, B2–B4 local tooling ([register §6](OWNER_DECISIONS_REQUIRED.md)). **D-10b resolved conservatively:** the Overall assistant manager keeps organization-wide catalog authority (the adopted policy requires existing Overall authority to stay intact).
- **Observation:** an organization owner with no location assignment lands on "No restaurant location assigned" in the V2 UI (existing behaviour). Real owners/GMs need their location rows before the V2 app reaches their organization.

### Validation evidence (disposable local stack, ledger 91)

| Area                                                                                                         | Result                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean replay of all 91 migrations + full pgTAP                                                               | **84 files, 3,488 assertions PASS** (0080: 105, 0081: 18, 0069/0070 re-derived)                                                                           |
| Negative control (0080 on the unfixed ledger-90 schema, before the review hardening)                         | 78 of 103 failed, including every spill row and all three location-count transition rows                                                                  |
| Real-database Vitest (`tests/local`): `inventory-recipes-location`, `module-enforcement`, `migration-compat` | 17 + 15 + 6 = **38/38**                                                                                                                                   |
| Planning kit Vitest (`scripts/migration-compat`)                                                             | **124/124**                                                                                                                                               |
| Vitest recipes + bar-inventory                                                                               | 298 + 948 pass; full suite **304 files, 4,167 tests**                                                                                                     |
| Browser `inventory-recipes-location`                                                                         | **8/8** on desktop, WebKit tablet and mobile                                                                                                              |
| `npm run check` (Prettier, ESLint 0 warnings, tsc)                                                           | exit 0                                                                                                                                                    |
| Not run                                                                                                      | hosted-only `tests/real/*` (Hosted DEV is out of scope; static review says unaffected), Hosted DEV acceptance, the V2-007 campaign, S1's unchanged suites |

### Independent consolidated review (one read-only reviewer): **no P0, no P1**

The reviewer re-ran the matrix and bypass enumeration (every schema, ACLs, triggers, storage policies, dynamic SQL), diffed the 12 regenerated bodies against migration history (byte-identical apart from the one call swap), analysed the 1 → 2 location race (serializable-consistent, one RPC statement wide: acceptable, no lock), and attacked the tooling. Findings and disposition (all fixed in this package unless noted):

| Id   | Sev | Finding                                                                                                                | Disposition                                                                                                                                                                                                             |
| ---- | --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | P2  | Snapshot reader followed redirects and would send the custom `apikey` header cross-origin, breaking "loopback only"    | **Fixed:** `redirect: "error"` forced last in `guardedFetch`; responses from another origin refused; tests                                                                                                              |
| P2-2 | P2  | B2 let a multi-role member be explicitly downgraded without the reduction check                                        | **Fixed:** the check now applies to every role count; an acknowledged reduction is applied but stays a visible warning                                                                                                  |
| P2-3 | P2  | A profile in both `assignments` and `intentionallyUnassigned` silently resolved to "unassigned"                        | **Fixed:** `manifest_conflicting_entries` → SKIP                                                                                                                                                                        |
| P3-1 | P3  | Import tab offers a preview whose catalog rows the commit would refuse                                                 | **Mitigated:** the Import tab states the limit up front; the commit already fails all-or-nothing with a clear message (0 rows written, per the reviewer's probe). Gating individual preview rows left as a UX follow-up |
| P3-2 | P3  | Stale tab keeps edit controls after a refused catalog write                                                            | **Fixed:** the controller re-reads the snapshot on that refusal; tests                                                                                                                                                  |
| P3-3 | P3  | Manifest validation gaps (unassigned entries, `acknowledgeExpansions` type, `acknowledgeReduction` ineffective at N=1) | **Fixed**                                                                                                                                                                                                               |
| P3-4 | P3  | No warning for inactive members                                                                                        | **Fixed:** `inactive_members_not_mapped`                                                                                                                                                                                |
| P3-5 | P3  | B4: unconfigured → internal with Neon links not flagged                                                                | **Fixed:** same acknowledged transition as external → internal                                                                                                                                                          |
| P3-6 | P3  | B3: unknown location in manifest ignored; `touches.existingRows` always false                                          | **Fixed**                                                                                                                                                                                                               |
| P3-7 | P3  | Execution flags matched case-sensitively                                                                               | **Fixed:** case-insensitive, single-dash too (cosmetic: no execute path exists)                                                                                                                                         |
| P3-8 | P3  | 0080 completeness regex brittle                                                                                        | **Fixed:** `public.` prefix optional, `merge` covered, plus a reviewed allow-list (E1-70b) and a dynamic-SQL check (E1-70c)                                                                                             |

**Could not be verified (by design):** the Hosted DEV pre-state of the 18 function bodies (history says identical; a read-only `pg_get_functiondef` comparison needs D-7), and the race under two real concurrent sessions (analysed, not reproduced).

### Exact next action

Owner decisions, not engineering: **D-7** (Hosted DEV write authorization, per step) for pushing the three local migrations in order (B1, U-1, E-1) with real-JWT probes (reuse `0078`/`0079`/`0080` and the local suites with synthetic users); then **D-1** (Production read-only preflight), **D-3/D-4/D-5/D-5b/D-6/D-8** for real manifests. With owner-approved manifests the planners can produce the reviewable changesets; a separately authorized executor (one transaction per organization, never `apply_location_assignment_changes`) is the only missing piece and is **not** built.

### How to resume locally

Local stack up; from the worktree: `npx supabase db reset --local` → `npx supabase test db --local`; `npx vitest run scripts/migration-compat`; with `LOCAL_SUPABASE_URL/ANON_KEY/SERVICE_KEY` from `npx supabase status -o env`: `npx vitest run --config vitest.local.config.ts tests/local/migration-compat.local.test.ts tests/local/inventory-recipes-location.local.test.ts tests/local/module-enforcement.local.test.ts` and `npx playwright test --config playwright.inventory-recipes-local.config.ts --project=desktop|host-tablet|server-mobile`. Probes: `b2_capability_ladder_probe.sql` and the S1 probes in `security-s1/` (self-rolling-back).

---

## Previous handoff (after Security Gate S1) — preserved

Feature-specific; other V2.0 features keep their own handoffs. A handoff cannot embed its own commit SHA: Batch A is `874091eb3982b7e1791488643a957342a22ec2a4`, B1 is `6457c1ae9f6307d1d9d43045ed87365eee9407af`, and the **S1 checkpoint is the next commit** on `feature/v2-008-migration-compatibility` (`git log`, and the chat report).

## 0. Security Gate S1 (2026-11-12) — what changed since B1

- **U-1 FIXED locally.** `kiosk_reassign_device` can no longer move a revoked device back to `active`. Forward-only migration `20261112220000_kiosk_reassign_revoked_device_guard.sql` (sha256 `48036911dd416d4d09bc18baf4eb5a7afd6c47690f8959471bd256227f6ac488`); **local ledger 89 → 90, Hosted DEV still 88.** Details: [U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md).
- **E-1 reproduced, bounded, plan written, NOT implemented.** Intra-organization escalation, no tenant-scoped actor crosses tenants (Overall roles are cross-tenant by design). Two distinct problems: Recipes writes (documented V2-005 contract, broader than the access model) and Inventory shared-catalog writes (an undocumented design gap). [E1_RECIPES_INVENTORY_SECURITY_PLAN.md](E1_RECIPES_INVENTORY_SECURITY_PLAN.md); decision **D-10**.
- **D-2 / D-2b / D-2c packaged for decision** with measured evidence: zero capability change at one location; the only N≥2 delta is `shift_manager → assistant_manager`. Includes the fallback-cliff completeness proof and a **correction to B2 rule 8** (`apply_location_assignment_changes` is per-person, needs a real actor and reactivates rows). [OWNER_DECISIONS_REQUIRED.md §4–5](OWNER_DECISIONS_REQUIRED.md).
- **Shared `session_id` review:** no bypass; five helpers keep the ban-only fallback, Tasks/Tips are already strict; tracked as H-S1 / **D-11**. Minor UI findings decided (none needed for B2/V2-009). [SECURITY_GATE_S1.md](SECURITY_GATE_S1.md).
- Hosted DEV, Production, Neon, `main`, `development`: **untouched**. Nothing pushed; no upstream; no PR.

### S1 validation evidence (local disposable stack, ledger 90)

U-1 reproduced on the unfixed schema (21 of 69 `0079` assertions failed) → 69/69 fixed · full pgTAP after a clean replay of all 90 migrations: **82 files, 3363 assertions PASS** · real GoTrue `kiosk-revoked-device-lifecycle` 8/8 (negative control: 3 fail on the old body) and `kiosk-authority` 7/7 · browser `kiosk-location-manager` 21/21 (7 × desktop, WebKit tablet, mobile) · Vitest kiosk 136/136 · independent read-only review: **no P0/P1**, four P3 notes recorded. Scratch evidence is ignored under the scratchpad; durable evidence is under `security-s1/`.

### Exact next action (nothing started)

Owner decisions, not engineering: **D-10** (E-1 authority model) together with **D-2/D-2b/D-2c** (packet §4). Then, in this order: (1) B2 parameterized manifest validator/dry-run for N=1 organizations only; (2) the E-1 correction as its own approved work package **before** any N≥2 backfill; (3) a separately authorized Batch C for Hosted DEV (D-7), now carrying **two** local migrations (B1 + U-1) in order, plus the real-JWT probes (reuse `0078`/`0079` and both local suites with synthetic users).

### How to resume S1 evidence locally

`docker` local stack up; from the worktree: `npx supabase db reset --local` → `npx supabase test db --local` → `npx vitest run --config vitest.local.config.ts tests/local/kiosk-authority.local.test.ts tests/local/kiosk-revoked-device-lifecycle.local.test.ts` → `npx playwright test --config playwright.kiosk-local.config.ts --project=desktop|tablet|mobile` (one project per run) → `npm run check`. Probes: `docker exec -i <db container> psql -U postgres -X -q -At < docs/v2.0/features/008-migration-compatibility/security-s1/e1_authorization_probe.sql` (and the D-2 probe); both self-roll-back.

---

## Original B1 handoff (preserved; sections below describe the state at the end of B1)

### 1. State at the end of B1

- Issue #256 OPEN (V2-008), #257 OPEN (V2-009), #248 OPEN, #255 CLOSED. PR #324 MERGED as `790fd2db560c41cb27affe98a70faeb7bd3f07cd`; `origin/development` unchanged at that SHA (S1: the GitHub fetch failed on network, so the local `origin/development` ref was only confirmed unchanged, not re-fetched).
- Branch `feature/v2-008-migration-compatibility`, worktree `.tmp/v2-008-migration-compatibility`. **Not pushed, no PR, not merged, upstream deliberately unset** (a bare `git push` would hit `origin/development`; push only with an explicit refspec to a feature branch when the owner asks).
- Finance OFF, enforcement STAGED, 0 Overall Owners, `main` `5e5b7747`.

### 2. What B1 delivered (details: [D7 plan §8](D7_LOCATION_SCOPED_KIOSK_PLAN.md))

- **F-1 fixed:** `private.kiosk_can_manage_location` requires a live session on every branch and an ACTIVE membership in the location's own organization for the location-manager branch. New `private.kiosk_live_session()`.
- **D7:** `public.kiosk_list_manageable_locations()`, `listManageableKioskLocationsAction`, `KioskManagementPage`, Settings → **Kiosks** card.
- Migration `20261112200000_kiosk_manager_authority_hardening.sql` (sha256 `4faa2707319910fb773c82c391875436ec78ab30a279b9054e024cf8123e3c2c`, re-verified in S1).
- Tests: pgTAP `0078` (105) + `0077` (57); real-GoTrue `tests/local/kiosk-authority.local.test.ts` 7/7; browser `tests/local/ui/kiosk-location-manager.local.spec.ts`; Vitest focused.

### 3. B1 independent security review — findings and their S1 disposition

| Id   | Sev | Finding                                                                 | S1 disposition                                                                                                                                       |
| ---- | --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | P2  | JWT with no `session_id` skips the revocation check (ban still checked) | **Re-reviewed:** no bypass; the claim "identical across six modules" was wrong — five helpers have it, Tasks/Tips are strict. Tracked as H-S1 / D-11 |
| P3-1 | P3  | Kiosks UI flattens `sessionInvalid` into a retryable error              | Deferred (fails closed); V2-009 candidate                                                                                                            |
| P3-2 | P3  | Device list on screen persists until the next action                    | Accepted; stale-reassign path now reloads real state                                                                                                 |
| P3-3 | P3  | Listing capped at 200 rows                                              | Deferred; add a `truncated` flag if locations approach the cap                                                                                       |
| U-1  | P3  | `kiosk_reassign_device` revoked → active                                | **FIXED locally in S1**                                                                                                                              |

### 4. Decisions pending (after S1)

**D-7** (any Hosted DEV write, incl. pushing the B1 and U-1 migrations) · **D-2/D-2b/D-2c** · **D-10** (E-1) · D-11 (H-S1) · D-1 · D-3 · D-4 · D-5/5b · D-6 · D-8. D-9 is discharged for B1 only; B2–B4 tooling scope is still unapproved.

### 5. Protected boundaries (unchanged)

No writes to Hosted DEV, Production, Neon, `main` or `development`. No backfill SQL/migration, fixture archive/delete, enforcement/finance activation, attendance-mode/module-config/real-user role change, Overall Owner, new Auth identities on hosted, or kiosk secrets. Never delete/reuse/unban V2-007 fixtures. Never `git add -A` (public repo; `.tmp/`, `docs/testing/` stay untracked). The `.tmp/v2-007-clock-kiosk` worktree stays intact. Do not restore an upstream on this branch.

### 6. Work not to repeat

Do not re-inventory DEV unless 24 h+ have passed or a migration landed; do not redo V2-007 acceptance; do not re-derive authorization semantics (ROLE_MAPPING §2, now measured in `security-s1/`); do not rebuild the D7 UI or re-test F-1/U-1 locally — only re-run them against Hosted DEV when D-7 allows.
