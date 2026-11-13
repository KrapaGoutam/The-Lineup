# V2-008 Migration & Compatibility — Agent Handoff (after Batch C readiness)

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
