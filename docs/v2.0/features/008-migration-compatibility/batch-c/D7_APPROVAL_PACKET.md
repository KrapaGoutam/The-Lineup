# V2-008 Batch C — Owner Approval Packet (D-7A / D-7B / D-7C / Git)

**Nothing below is approved.** Sending the Batch C prompt was not D-7 authorization. Each item is a separate yes/no. Evidence: [receipt](BATCH_C_READINESS_RECEIPT.md) · procedure: [rollout and recovery plan](ROLLOUT_AND_RECOVERY_PLAN.md).

## Recommendation in one line

Approve **D-7A** (with its backup sub-approval) and **D-7B path 1**, then the **remote Git** step. Keep **D-7C** closed; it is not ready to be asked.

---

## D-7A — apply exactly three migrations to Hosted DEV `opmujepkemwcdxxorhfd`

**Scope (exact, nothing more):**

1. `20261112200000_kiosk_manager_authority_hardening.sql` (sha256 `4faa2707319910fb773c82c391875436ec78ab30a279b9054e024cf8123e3c2c`)
2. `20261112220000_kiosk_reassign_revoked_device_guard.sql` (sha256 `48036911dd416d4d09bc18baf4eb5a7afd6c47690f8959471bd256227f6ac488`)
3. `20261113100000_e1_shared_catalog_authority.sql` (sha256 `9375ae54540f3c49d5f7d3a3a7ce845b30a54c7e6b0d180a4ef7ec3f8ad5a8ad`)

in that order, by the proven route (bundle → `link` → `migration list` → `db push --linked --dry-run` → `db push --linked`), ledger **88 → 91**.

**What it changes:** five new and sixteen replaced database functions plus their grants. No table, column, constraint, index, policy, trigger or data row. Rehearsal on populated data changed **0 rows** in 91 tables and left every Auth session intact.

**What users will notice on DEV (intended, owner-approved D-10 Option A):** in an organization with two or more active locations, location managers/assistants can no longer write the shared Recipes book or the shared Inventory catalog (including import commits that create or update catalog rows); one-location organizations are unchanged; organization owners/GMs and the Overall tier keep their authority. Kiosk management becomes location-scoped and requires a live session and an active organization membership; a revoked tablet can never be reactivated by reassignment (re-pair instead).

**Included sub-approval (needed for recovery readiness):** one encrypted backup of Hosted DEV at ledger 88 using the existing DPAPI tooling (an export of DEV records into an owner-only encrypted file on this Windows profile, never committed), restore-validated in an offline container, then the three migrations rehearsed on that real-data copy first. If you decline the backup, the rollout should not proceed: the recovery plan requires it.

**Also included:** an immediate pre-apply data baseline (per-table row counts and md5 only, no row content), the read-only post-apply verification (`hosted_dev_readonly_check.mjs --expect 91 --compare`), and recording the result.

**Stops automatically if:** the ledger is not exactly 88, the project ref is wrong, a checksum differs, enforcement is not `staged`, Finance is not OFF, the dry run lists anything but the three files, or any step errors. It will never apply anything newer, reset the database, run backfill tooling, change module configuration or Attendance modes, activate enforcement, enable Finance, touch Production or Neon, or change any real account or session.

**Expected result:** ledger 91; `functions` 327 / `function_acl` 327, every other schema category identical; every table identical to the baseline.

**Reply:** `D-7A: approved as written` / `approved without the backup (rollout will not start)` / `not approved`.

---

## D-7B — authenticated verification after D-7A

**Path 1 — recommended, creates no persistent identity or data:** run the existing self-rolling-back SQL probes (derived from pgTAP 0078/0079/0080) once through the Management API inside a transaction that always ends in `ROLLBACK`, using in-transaction synthetic users under role `authenticated` with a live `session_id` claim. It does write statements inside a transaction that is rolled back (sequences may advance); that is why it needs your yes. No retired V2-007 identity is used, no Overall Owner is created, no global sign-out, no existing session changes, and the six revoked V2-007 kiosk devices are never targeted.

**Path 2 — only if Path 1 is insufficient:** real Supabase Auth identities and devices on Hosted DEV. **Not requested.** If needed I will return a bounded fixture manifest and cleanup plan first.

**Reply:** `D-7B path 1: approved` / `not approved`.

---

## D-7C — actual legacy data / configuration backfill

**Not requested; not ready.** Applying D-7A completes none of V2-008.002–.005. Before this can even be asked we need: D-1 (Production read-only preflight), D-2/2b/2c confirmed for real manifests, D-3/D-4 (real vs harness locations; 42 of 44 DEV locations are harness fixtures — never delete or blanket-assign), D-5/D-5b (module matrix; preserve Monks DEV's explicitly disabled modules), D-6 (Attendance modes; no automatic conversion, no Neon writes), the owner/GM-without-location-row decision, and an **atomic per-organization executor** (one transaction per organization; never `apply_location_assignment_changes`; no partial backfill because the first `location_memberships` row, even inactive, switches an organization's legacy fallback off). Needed before: V2-004 enforcement activation (module matrix, harness disposition), and V2-009 release readiness (all of Track 2).

---

## Remote Git authorization (separate from D-7)

Request: (1) secret scan and diff review, (2) `git push origin feature/v2-008-migration-compatibility:refs/heads/feature/v2-008-migration-compatibility` (explicit refspec, never a bare push, never to `development`), (3) **one** PR targeting `development`, (4) record exact-head CI and fix verified failures within approved scope. **No merge is implied.**

Facts that matter: PRs and merges to `development` apply **no** migration to any hosted database (`database.yml` deploys only on a push to `main`, in the `production` environment). The PR's Database check runs only against an ephemeral local stack. Suggested sequence: D-7A first (so a Preview of this branch finds the new RPCs), then push/PR.

**Reply:** `Git push + one PR: approved` / `not approved`.

---

## Final merge authorization (later, separate)

Only after: approved Hosted DEV work verified, exact-head CI, independent review closed, PR reviewed, handoff/status updated. Do not merge V2-008 merely because the three security migrations succeeded; Track 2 is still open. A later merge of `development` into `main` will run `supabase db push` against the project in the `SUPABASE_PROJECT_ID` secret (Production per history); that release needs its own Production gate (D-1), Production migrations applied ahead of the merge, and **your confirmation that the GitHub `production` environment has a required reviewer** (not visible from here).

## Other open decisions (none block D-7A)

D-1 Production read-only preflight · D-3 Manual Preview organization · D-4 harness fixtures · D-5/D-5b module matrix · D-6 Attendance modes · D-8 enforcement activation (recommended: V2-009 gate, stay `staged`) · D-10b is resolved conservatively (Overall assistant manager keeps authority) · D-11 shared `session_id` helper hardening (no block).
