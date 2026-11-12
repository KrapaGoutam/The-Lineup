# V2-008 Migration & Compatibility — Agent Handoff (after Security Gate S1)

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
