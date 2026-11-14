# V2-009 F-5 final PR gate — BLOCKED (2026-11-13)

- [x] Recovered clean `fix/v2-009-f5-multi-org-deactivation` at `e1c8fd968966c44607d13ff99ea1ef3d50ad680f`; base `5b32b75c5574a6914b1246e3ec841e6d9005f7e5`; cumulative source `110ae9c7676efa48165b9e72988c5430c9d60be6` untouched.
- [x] Verified local restaurant database ledger 92 and reproduced authenticated Organization Owner membership DELETE/INSERT lifecycle bypass in one rolled-back synthetic transaction; target regained `private.has_org_role`, credential was cascaded away, and no lifecycle audit was written. Unauthorized nonmember INSERT denied. See F-5 HANDOFF.
- [x] Corrected confirmed UTF-8 mojibake in this task file, F-5 HANDOFF, and F-5 isolation checkpoint; no code, SQL, types or tests changed.
- [ ] Owner lifecycle decision and separate authorization for a narrow remediation. F-5 PR description, push and PR creation remain withheld until the security gate is resolved.

## Current State & Next Step

The independent review approval predates the confirmed membership lifecycle bypass. Keep the reviewed implementation intact. Next action: owner decides whether to authorize a narrow membership INSERT/DELETE security change or explicitly narrows the F-5 contract; then implement and reverify that changed boundary before PR preparation. No hosted rollout or remote operation is authorized.

---

# THE LINEUP V2.0 — V2-008 MIGRATION & COMPATIBILITY (Batch C Hosted DEV rollout + PR)

## Batch C — controlled Hosted DEV rollout (2026-11-13, D-7A/D-7B/G-1 granted)

- [x] Recover state: HEAD `46fe3d97`, clean, no upstream, `development` `790fd2db` / `main` `5e5b7747` unchanged, no remote V2-008 branch or PR; checksums of 89/90/91 verified.
- [x] Fresh DPAPI-encrypted Hosted DEV backup (`dev-20261113T040959Z`), 121 tables, restore-validated (0 digest mismatches, 198 policies equal).
- [x] Real-data rehearsal on the restored copy as role `postgres` (ledger 88 → 91): 354/354 pgTAP, all 91 tables unchanged. Harness trap recorded (`supabase_admin` apply breaks ownership).
- [x] Hosted DEV apply of exactly migrations 89–91 via `supabase db push` (dry run listed exactly three): **ledger 88 → 91**, 04:13:21Z.
- [x] Postflight: function/schema fingerprints `ledger91`, all 91 tables identical, guard rows identical, PostgREST sees both new RPCs.
- [x] Rollback-only Hosted probes: 0078 105/105 (F-1+D7), 0079 69/69 (U-1), 0080 105/105 (E-1); nothing persisted.
- [x] `database.yml` and GitHub `production` environment inspected read-only: NO required reviewers (owner action before any Production release).
- [x] Receipt: `docs/v2.0/features/008-migration-compatibility/batch-c/BATCH_C_ROLLOUT_RECEIPT.md`.
- [ ] Push branch (explicit refspec), ONE PR to `development`, exact-head CI + Preview evidence, merge-readiness report. **No merge.**
- [ ] Owner: merge decision; D-7C backfill approval package (separate); production-environment reviewers.

## Current State & Next Step

Hosted DEV is at ledger 91 with enforcement staged and Finance OFF. Next exact action after the PR is green: owner decides whether to merge the security migrations and planning tooling into `development` (actual backfills stay outstanding), or prepares the separate D-7C approval package. Do not start V2-009 or any backfill.

---

# (previous) V2-008 MIGRATION & COMPATIBILITY (Batch B1 + Security Gate S1)

Issue [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256) · parent #248 · branch `feature/v2-008-migration-compatibility` (base `development` `790fd2db560c41cb27affe98a70faeb7bd3f07cd`; Batch A checkpoint `874091eb`). Local commits only: not pushed, no PR, upstream deliberately unset.

Previous feature **V2-007 is COMPLETE** (PR #324 → `790fd2db`, #255 closed); its evidence lives under `docs/v2.0/features/007-clock-kiosk/`.

## Batch A — read-only discovery (done, `874091eb`)

- [x] A0–A6: inventory, mapping, role plan, dependencies, D7 plan, decision register, handoff. See [HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md).

## Batch B1 — D7 location-scoped Kiosks + F-1 hardening (owner-authorized, LOCAL ONLY)

- [x] B1.0 Recovery: worktree/branch/HEAD `874091eb`, clean tree, no upstream, `development` unchanged.
- [x] B1-A Authorization matrix (13 actor classes) and session-check mechanism: repo-standard `*_live_session` pattern adopted.
- [x] Proof of defect: predicate section of pgTAP `0078` vs the unfixed 88-migration DB → exactly the 11 F-1 assertions fail.
- [x] B1-B Migration `20261112200000_kiosk_manager_authority_hardening.sql` (live-session gate + org-membership join + listing RPC); local ledger 88 → 89.
- [x] pgTAP `0078` 105/105, `0077` 57/57, full suite 81 files / 3294 PASS.
- [x] Real GoTrue suite `tests/local/kiosk-authority.local.test.ts` 7/7 (+ negative control: 4/7 fail on the old predicate).
- [x] B1-C Action + data + domain + hook + `KioskManagementPage` + Settings Kiosks card; focused Vitest 430/430.
- [x] Browser (real cookies, local stack) 6/6 × desktop, WebKit tablet, mobile; demo specs `kiosk` + `location-administration` 18/18.
- [x] `npm run check` (Prettier, ESLint 0 warnings, tsc) clean.
- [x] B1-E independent security review: non-blocking findings only; comment corrected; U-1 recorded (see HANDOFF §3).
- [x] Docs: HANDOFF, STATUS, D7 plan §8, decision register D-9 note, B2–B4 package, CURRENT_STATE entry.
- [x] One local B1 implementation commit.

Result: **V2-008 B1 PASSED — LOCAL IMPLEMENTATION COMPLETE, HOSTED DEV APPROVAL PENDING.**

## Security Gate S1 — U-1 fix, E-1 plan, D-2 packet (owner-authorized, LOCAL ONLY)

- [x] S1.0 Recovery: worktree/branch/HEAD `6457c1ae`, clean tree, no upstream; B1 migration checksum re-verified; local ledger 89.
- [x] S1-A U-1 analysis: unintended (no contract requires reactivation; re-pair creates a new row).
- [x] S1-B Regression first: pgTAP `0079` fails 21/69 on the unfixed schema; migration `20261112220000_kiosk_reassign_revoked_device_guard.sql`; local ledger 89 → 90; 69/69.
- [x] S1-C Real GoTrue `kiosk-revoked-device-lifecycle` 8/8 (+ negative control), browser stale-tab scenario 21/21, Vitest kiosk 136/136, clean 90-migration replay, full pgTAP 82 files / 3363 PASS.
- [x] S1-D E-1: reproduced with real RPCs (306-row matrix), classified, plan written — **not implemented** ([plan](../docs/v2.0/features/008-migration-compatibility/E1_RECIPES_INVENTORY_SECURITY_PLAN.md)).
- [x] S1-E D-2/2b/2c packet with measured equivalence evidence; B2 rule 8 corrected; completeness proof specified.
- [x] S1-F shared `session_id` review: no bypass; H-S1 tracked; minor UI findings decided.
- [x] Independent read-only review: no P0/P1; P3 notes recorded.
- [x] `npm run check` clean; diff and secret scan; one local S1 checkpoint commit.

Result: see the final line of the S1 chat report and [SECURITY_GATE_S1.md](../docs/v2.0/features/008-migration-compatibility/SECURITY_GATE_S1.md).

## Batch B continuation — E-1, B2 validator, B3 module planner, B4 Attendance planner (owner-authorized, LOCAL ONLY, one cumulative package)

Owner policies adopted by the prompt: D-10 Option A, D-2 ladder, D-2b conservative multi-role, D-2c conservative multi-location, B2–B4 local tooling only.

- [x] BB.0 Recovery: HEAD `eb8adf2176e9631873e6fed771d34d9d2f1fe119`, clean tree, no upstream; remote `development` re-verified by `git ls-remote` = `790fd2db` (unchanged); local ledger 90.
- [x] E-1 migration `20261113100000_e1_shared_catalog_authority.sql` (sha256 `9375ae54540f3c49d5f7d3a3a7ce845b30a54c7e6b0d180a4ef7ec3f8ad5a8ad`): predicate `private.catalog_can_manage_org`, `private.inventory_catalog_begin`, redefined `recipes_begin` / `recipes_can_write_image`, 12 catalog RPCs, `public.catalog_authorized`. Local ledger 90 → 91.
- [x] pgTAP `0080_e1_shared_catalog_authority` 103/103 (negative control on ledger 90: 78 fail); `0069`/`0070` re-derived; full suite after a clean 91-migration replay: 83 files, 3468 assertions PASS.
- [x] App layer: `RecipesActor.canManageCatalog`, `RecipeIndex.canManage`, `CatalogSnapshot.canManageCatalog`, Manage view + Recipes module read-only states; Vitest recipes 298 + bar-inventory 944 pass; real-DB local `inventory-recipes-location` 17/17, `module-enforcement` 15/15; browser `inventory-recipes-location` 8/8 × desktop, host-tablet, server-mobile.
- [x] B2 organization-atomic backfill validator (dry-run only) — `scripts/migration-compat/role-backfill.mjs`; pgTAP `0081` 18/18 pins the capability model
- [x] B3 module configuration planner (read-only)
- [x] B4 Attendance compatibility planner (read-only)
- [x] Planning kit: Vitest 124/124; real-DB `tests/local/migration-compat.local.test.ts` 6/6 (digest proves no write; GET/HEAD only)
- [x] Consolidated independent security/migration review: no P0/P1; 3 P2 + 8 P3 fixed or mitigated (HANDOFF)
- [x] Final evidence: full pgTAP 84 files / 3,488 PASS; local suites 38/38; browser 8/8 × 3; full Vitest 304 files / 4,167; `npm run check` exit 0
- [x] Docs (HANDOFF, STATUS, CURRENT_STATE, decision register, E-1 plan §13, B2–B4 package + kit)
- [x] One local commit (see `git log`)

## Current State & Next Step

- Resume from [V2-008 HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md) (section 0 first). Hosted DEV is still ledger 88; the B1, U-1 and E-1 migrations are local only (local ledger 91).
- Batch B is **locally complete**: E-1 implemented, B2–B4 dry-run planners with no executor, independent review clean of P0/P1.
- Next exact action: **owner decisions, not engineering** — D-7 (Hosted DEV write authorization, per step; push B1 → U-1 → E-1 in order and run the real-JWT probes), then D-1/D-3/D-4/D-5/D-5b/D-6/D-8 for real manifests. A separately authorized executor (one transaction per organization) is the only missing piece.
- Do not: write to Hosted DEV / Production / Neon, apply local migrations anywhere hosted, execute any backfill, archive fixtures, activate enforcement or finance, change Attendance modes or module configs, push, open a PR, merge, or set an upstream on this branch.
- Hard invariants: Hosted DEV ledger 88 · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747`.

## Batch C — migration rehearsal and Hosted DEV readiness (owner prompt 2026-11-13; LOCAL + read-only metadata)

- [x] C0 Recovery: worktree/branch/HEAD `f2798c6`, clean tree, no upstream, no remote branch/PR; live `ls-remote`: `development` `790fd2db`, `main` `5e5b7747`.
- [x] C1 Migration integrity: 3 checksums equal handoff values; 91 files, diff vs `origin/development` = 3 added; function/grant-only (statement inventory); Hosted DEV ledger 88 == first 88 local files.
- [x] C2 Read-only Hosted DEV preflight: 16 replaced functions identical (body/secdef/config/ACL/owner); 8 schema categories hash-identical; guard rows (enforcement staged, Finance off, 0 Overall roles).
- [x] C3 Staged 88→89→90→91 fingerprints in a rolled-back transaction (partial-rollout detector) + `expected-fingerprints.json`.
- [x] C4 Populated rehearsal `tests/local/v2-008-batch-c-migration-rehearsal.local.test.ts` 9/9 (0 of 91 tables changed; sessions kept; defects reproduced before; idempotent; upgrade == clean replay); pgTAP 0077–0080 pass on the populated DB.
- [x] C5 Rollout/recovery plan, read-only verifier `hosted_dev_readonly_check.mjs`, automatic-deployment review (`main` push only).
- [x] C6 One independent review: no P0/P1; R-1…R-4 handled.
- [x] C7 Track 1 / Track 2 split and D-7A/B/C + Git packet; HANDOFF, STATUS, CURRENT_STATE, decision register updated.
- [ ] D-7A owner decision → backup + real-data rehearsal → apply 89–91 → verify (NOT started: no approval).
- [ ] Remote Git (explicit refspec push, one PR to `development`) — not requested yet.

## Current State & Next Step

Batch C readiness is complete and committed locally only (no push). **Next exact action: owner answers [batch-c/D7_APPROVAL_PACKET.md](../docs/v2.0/features/008-migration-compatibility/batch-c/D7_APPROVAL_PACKET.md).** Do not write to Hosted DEV, push, open a PR or start D-7C before that.

# V2-009 F-5 isolation — BLOCKED on ban provenance (2026-11-13)

- [x] Recovered clean Stage B source `feature/v2-009-final-gate` at `110ae9c7676efa48165b9e72988c5430c9d60be6`; verified GitHub `development` and local `origin/development` both at `5b32b75c5574a6914b1246e3ec841e6d9005f7e5`.
- [x] Created `.tmp/v2-009-f5` on `fix/v2-009-f5-multi-org-deactivation` from that baseline; transferred only `member-deactivation.ts` and its test from `5f036ae`.
- [x] Reviewed caller authority and the exact Stage B diff. Added focused failing regressions for independent Auth bans: multi-organization reactivation clears a ban, and single-organization deactivation replaces its duration (8 pass, 2 fail).
- [x] Verified local Docker Postgres `supabase_db_restaurant-roster` has 91 migrations, latest `20261113100000`; no hosted target used.
- [x] `npm.cmd run check` passed (format, lint, typecheck); webpack production build passed. Default Turbopack build could not resolve Next through the worktree's external `node_modules` junction, matching the Stage B worktree limitation. The focused test remains red by design.
- [ ] Account-wide ban provenance/ownership decision: without it, reactivation cannot distinguish a ban placed by this organization's prior deactivation from an unrelated administrative or other-organization ban. Do not change the global Auth policy or add a migration without separate approval.
- [ ] Once the policy is approved, correct the focused regression, cover single-org and multi-org cases, run the focused local HTTP/auth gate, quality checks, review, and commit a clean candidate. Do not push or create a PR before V9-F5 approval.

Checkpoint: `docs/v2.0/features/009-final-gate-release/F5_ISOLATION_CHECKPOINT.md`. The cumulative Stage B branch remains unchanged; this isolated branch is intentionally uncommitted and not PR-ready while the security regression fails.

---

# V2-009 Stage B1 — approved contract and local investigation (2026-11-13)

- [x] Recovered the F-5 branch without resetting or discarding the three dirty files and checkpoint; source Stage B branch stayed clean at `110ae9c7676efa48165b9e72988c5430c9d60be6`.
- [x] Recorded owner decisions: personal PIN, all canonical role layers, separate organization/global ban authority, and B3 gateway/role alignment. No migration authorization.
- [x] Inspected current local schema and code for ban origin, authority, reason, timing, expiration and concurrent restrictions: no reliable provenance exists. Audit is written after the current operation; Auth metadata has no marker.
- [x] Added a focused partial-reactivation regression. F-5 unit result: 8 pass, 3 fail (independent ban overwritten, independent ban cleared, membership reactivated after credential failure).
- [x] Confirmed F-6 with two disposable local organizations and users using four-digit PINs: globally unique synthetic email and one Auth password break multi-org sign-in/rotation. All synthetic rows removed.
- [x] Designed a narrowly scoped transactional RPC migration, RLS/grants, legacy-ban handling, concurrency, tests and rollback in `F5_ISOLATION_CHECKPOINT.md`; **did not create or apply it**.
- [x] `npm.cmd run check` passed after the third test; the focused security test remains intentionally red. No new application code was implemented under the unapproved migration design.
- [ ] Owner: approve the exact F-5 forward migration and the loss of GoTrue-level session invalidation for organization deactivation, or require a broader account-wide restriction architecture. Until then the three red tests stay red; no F-5 PR candidate or commit.
- [ ] After approval: implement the one F-5 vertical slice, run focused pgTAP/HTTP/Auth and required quality gates, review and commit locally. Push/open PR only after separate V9-F5 delivery authorization.

## F-5 independent review (2026-11-13) — SAFE WITH SPECIFIC AMENDMENTS

- [x] Verified worktree `.tmp/v2-009-f5`, branch `fix/v2-009-f5-multi-org-deactivation`, HEAD `5b32b75c5574a6914b1246e3ec841e6d9005f7e5`, dirty files unchanged; source `110ae9c7…` clean.
- [x] Reviewed code, RLS/grants, session helpers and local catalog; wrote `F5_MIGRATION_CONTRACT.md` (amended design, migration spec, tests, owner Q1–Q4, Codex prompt). No SQL, app or test change.
- [ ] Owner: approve Q1–Q3, name Q4's owner, then separately authorize Codex to write migration `20261113110000_team_set_member_active.sql` + pgTAP `0083`.

## Current State & Next Step

Resume from `docs/v2.0/features/009-final-gate-release/F5_MIGRATION_CONTRACT.md`. Do not write SQL, edit the F-5 code/tests, push or touch hosted systems before owner approval. The three red tests stay red.

Next exact action (earlier B1 text): owner reviews the B1 migration decision in `docs/v2.0/features/009-final-gate-release/F5_ISOLATION_CHECKPOINT.md`. B2 may proceed independently in a separate worktree; B3 takes the confirmed F-6 and role-alignment requirements. No Hosted DEV, Production, Neon, migration 92, Finance, enforcement or GitHub release changes.

---

# V2-009 B1 F-5 — approved transactional implementation (2026-11-13)

- [x] Recovery: isolated worktree/branch and base HEAD `5b32b75c5574a6914b1246e3ec841e6d9005f7e5`; cumulative Stage B source `110ae9c7676efa48165b9e72988c5430c9d60be6` unchanged.
- [x] Local safety: Docker `supabase_db_restaurant-roster`, local volume and loopback port 54322, database `postgres`, no foreign servers, synthetic fixture state; baseline ledger 91, shelved executor absent.
- [x] Data, authorization, UI, risks and tests recorded in approved `F5_MIGRATION_CONTRACT.md` and latest owner brief; latest S2 omits `auth_restricted`.
- [x] Migration `20261113110000_team_set_member_active.sql`: strict session helper, narrow authenticated RPC, deterministic membership locks, atomic membership/credential/audit, direct active update denied; local ledger 92 only.
- [x] Team routes use the caller's authenticated client and RPC error mapping; account-wide Auth writes and best-effort audit removed; generated RPC type updated.
- [x] Focused F-5 pgTAP 51/51, local GoTrue/HTTP 4/4, two-connection concurrency 3/3, route/data Vitest 15/15.
- [x] S1 Payroll direct test: advisory function true under a stale active location row, protected manager predicate false and existing Payroll settings row hidden. Separate remediation review required; no confirmed protected write/read bypass.
- [x] Required quality: `npm run check` pass, `npm run test` 305 files/4,178 pass (7 skip), `next build --webpack` pass. Full pgTAP 85 files/3,539 assertions pass after correcting a legacy test-only direct-active fixture; focused 0010 54/54 pass.
- [x] Diff/security/scope reviewed; `git diff --check` pass. No hosted or remote mutation.
- [x] Created one coherent local commit with explicit F-5 paths; final SHA and clean worktree are recorded in the owner report.

## Current State & Next Step

F-5 is locally green and committed. The draft PR description is in `docs/v2.0/features/009-final-gate-release/HANDOFF.md`. Independent implementation review and owner approval are needed before pushing or creating a PR; Hosted DEV requires a separate exact-head preflight and migration authorization. No Hosted DEV, Production, Neon, shelved executor, Finance/enforcement activation, or B2/B3/B4 implementation.
