# V2-008 Batch C — Hosted DEV Security Rollout Receipt

Date: 2026-11-13 (UTC) · Issue #256 · parent #248 · Hosted DEV `opmujepkemwcdxxorhfd` only

> **Status: SECURITY ROLLOUT PASSED.** Migrations 89–91 are applied to Hosted DEV (ledger **88 → 91**), verified, and nothing else changed. **V2-008 is not complete:** Track 2 (actual organization/role/module/attendance backfills, D-7C) is untouched, no executor exists, and V2-004 enforcement is still `staged`.

## 1. Approvals exercised (and not exercised)

| Approval | State    | Scope actually used                                                                                                                                                                       |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-7A     | GRANTED  | Exactly migrations 89, 90, 91 to Hosted DEV, after preflight, checksums, fresh encrypted backup, restore rehearsal                                                                        |
| D-7B     | GRANTED  | Read-only inspection + rollback-only SQL (path 1). No persistent identities, fixtures, Auth sessions or user mutations. **No** real-GoTrue/browser acceptance was claimed from SQL probes |
| G-1      | GRANTED  | Explicit-refspec push of the feature branch, ONE PR to `development`, CI/Preview reading, in-scope fixes. **No merge, no auto-merge**                                                     |
| D-7C     | NOT USED | No backfill, no module-config/attendance-mode/role/organization/location write, no Production, no Neon, no `main`, no merge                                                               |

## 2. Identity and preflight

| Item                           | Value                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting HEAD                  | `46fe3d97cef4fbc3c974c7ad29dd0d9ad52a9eb5` (clean tree, no upstream, branch `feature/v2-008-migration-compatibility`)                                                         |
| Remote at start                | `development` `790fd2db560c41cb27affe98a70faeb7bd3f07cd` (unchanged), `main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`; no remote V2-008 branch; no V2-008 PR                |
| Migration set vs `development` | exactly three added files (`git diff --name-status origin/development HEAD -- supabase/migrations`); first 88 byte-identical                                                  |
| sha256 (all re-verified)       | 89 `4faa2707…3c2c` · 90 `48036911…ac488` · 91 `9375ae54…a8ad` (full values in [the readiness receipt](BATCH_C_READINESS_RECEIPT.md) §2); bundle copies re-hashed before apply |
| Hosted ledger before           | 88, max `20261111120000`, none of the three versions present; function fingerprint `ledger88`; all eight schema categories matched                                            |
| Guard rows before              | enforcement `staged`, Finance `false`, 0 Overall roles, kiosk devices `{revoked: 6}`, 14 module-config rows, attendance modes `{null:44, external:1, internal_the_lineup:4}`  |
| Baselines                      | two full snapshots (91 tables, 3,699 rows, hashes only): before the backup and immediately before apply — **identical** (no drift during the backup window)                   |

## 3. Backup and recovery proof (D-7A prerequisite)

| Step                            | Result                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup                          | `dev-20261113T040959Z.zip.dpapi`, 527,238 bytes, encrypted sha256 `5cf7fa586fa1cf4ecd935215fe33e60f289b7e3d480a050e8aa479f303be0b92`, captured 04:08:18Z–04:09:59Z in memory (no plaintext file), Windows DPAPI CurrentUser, owner-only protected directory `%LOCALAPPDATA%\TheLineup-DEV-Backups\V2-008-BATCHC-20261113\`                                                  |
| Component integrity             | 6 of 6 components checksum-verified; 121 of 123 tables captured (the two excluded are the platform-managed `auth.schema_migrations` / `storage.migrations`, excluded in every earlier backup)                                                                                                                                                                               |
| Restore                         | `public.ecr.aws/supabase/postgres` 17.11 image `sha256:7374d196…c7e4`, `--network none`, tmpfs data, no published ports; throwaway password                                                                                                                                                                                                                                 |
| Restore parity                  | **121 tables: row count + content digest identical, 0 mismatches**; foreign-key anti-joins pass; function bodies, function ACLs, relation ACLs and RLS flags equal Hosted DEV; **198/198 canonical policies equal** (the raw policy fingerprint differs only because of `search_path` qualification, as in earlier rollouts)                                                |
| Restore qualification           | six `CHECK` constraints differ from Hosted DEV **only in parenthesization** (`((a AND b) AND c)` vs `(a AND b AND c)`; same predicate, normalized when the dump is re-parsed). The constraint count (746) is equal. Hosted DEV itself matches the clean replay on all eight categories after the apply                                                                      |
| Real-data rehearsal             | the three migrations applied in order to the restored copy **as role `postgres`** (≈0.3 s each); ledger 88 → 91; function fingerprint `ledger91` (owner included); **all 91 tables identical to the pre-apply snapshot**; `functions` 327 and `function_acl` 327; guard rows unchanged                                                                                      |
| pgTAP on the restored real data | `0077` 57/57, `0078` 105/105, `0079` 69/69, `0080` 105/105, `0081` 18/18 = **354/354**. `0081` passes here because real DEV holds 0 Overall roles — confirming the earlier synthetic-rehearsal failure (LAD-16 expects an empty `overall_roles`) was a fixture assumption, not an authorization defect. That earlier result is preserved unchanged in the readiness receipt |
| Recovery plan                   | unchanged and practical ([plan §6](ROLLOUT_AND_RECOVERY_PLAN.md)): forward-fix migration, never a down migration or restore-over-DEV as a first response                                                                                                                                                                                                                    |
| Container                       | removed after the rehearsal (RAM-backed, no data retained)                                                                                                                                                                                                                                                                                                                  |
| Retention                       | keep the backup until the owner releases it (≥ 7 days after acceptance). Older V2-007 / V2-006 / pre-V2-007 backups untouched                                                                                                                                                                                                                                               |

**Harness lesson (cost one rehearsal run, found before any Hosted write).** The first rehearsal applied the migrations as `supabase_admin`, which made `private.kiosk_live_session` owned by `supabase_admin`; the `postgres`-owned `kiosk_can_manage_location` then failed with `42501` (pgTAP `0077`). The Supabase CLI and Hosted DEV apply migrations as `postgres` (as did the clean replay that passed 84/84), and the function fingerprint includes the owner precisely to catch this. **Always rehearse as `postgres`.** Not a migration defect.

## 4. Hosted DEV application

| Item           | Value                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route          | bundle directory (`config.toml` + all 91 files) → `supabase link --project-ref opmujepkemwcdxxorhfd` → `migration list --linked` (exactly three local-only rows) → `db push --linked --dry-run` (**exactly the three, in order**) → `db push --linked`                     |
| Executed       | 2026-11-13 04:13:21Z–04:13:23Z, CLI 2.76.8, exit 0; `Applying migration …` three lines, in order                                                                                                                                                                           |
| Ledger         | **88 → 91**, max `20261113100000`, the three versions present                                                                                                                                                                                                              |
| Function state | 21 fingerprinted functions md5 `c121af57c2f71f1418f99d1aeff357cf` = `ledger91`; `functions` 327 and `function_acl` 327; the other six schema categories and all of columns/constraints/indexes/policies/triggers/table ACL+RLS **unchanged** (function/grant-only, proven) |
| Data           | **all 91 tables (public, private, `auth.users/sessions/identities/refresh_tokens`) identical to the pre-apply snapshot** — existing sessions provably intact; ledger table gained exactly three rows                                                                       |
| Guard rows     | identical before and after: enforcement `staged`, Finance `false`, 0 Overall roles, kiosk devices `{revoked: 6}`, 14 module-config rows, attendance modes unchanged                                                                                                        |
| PostgREST      | `kiosk_list_manageable_locations` and `catalog_authorized` are visible to the schema cache (anon → `42501`, not `PGRST202`)                                                                                                                                                |

## 5. Hosted DEV security verification (D-7B path 1: rollback-only)

Tool: [hosted_rollback_probe.mjs](hosted_rollback_probe.mjs). It runs one reviewed pgTAP file inside a transaction whose **final statement always raises** (the transaction can therefore never commit; persistence was additionally disproved afterwards by a full table-snapshot diff, below), with a 5 s lock timeout and 120 s statement timeout, and reads back only counts. Preconditions checked read-only: no `pg_net` and no webhook schemas, no non-internal triggers on `auth` tables, so the in-transaction synthetic users and sessions cannot reach any external service. The files contain no `commit`, and every update/delete targets only synthetic fixture ids.

| Probe | Covers                                                                                                                                                                                                                                          | Result on Hosted DEV    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0078  | **F-1 + D7**: live-session and active-org-membership gates, listing RPC, 13 actor classes incl. inactive/cross-org/cross-location, direct RPC `42501` denials                                                                                   | **105 / 105, 0 failed** |
| 0079  | **U-1**: revoked devices stay revoked, credential version and revocation history preserved, active devices still reassign, no unexpected sessions                                                                                               | **69 / 69, 0 failed**   |
| 0080  | **E-1**: org owner/GM/Overall roles manage shared Recipes/Inventory; location roles denied only in multi-location orgs; single-location unchanged; cross-tenant denied; import-commit gating; location-scoped stock operations; reads unchanged | **105 / 105, 0 failed** |

After the probes the full verifier re-ran: **all 91 tables still identical** to the pre-apply snapshot, function and schema fingerprints still `ledger91`, guard rows identical. Sequences may have advanced (not rolled back by PostgreSQL); no row, identity or Auth session persisted.

**Limit:** these are SQL-level JWT contexts. They prove the database authorization contracts; they are **not** real-GoTrue sessions, tablet pairing or browser acceptance (a real-identity acceptance would need a separately approved fixture manifest, D-7B path 2).

## 6. Automation and environment protection (read-only, current files)

- `.github/workflows/database.yml`: triggers `workflow_dispatch`, `pull_request` (supabase paths), `push` to `main` (migration paths). `migrations-and-policies` runs for non-push events on an ephemeral local stack. **`deploy-migrations` runs only when `github.event_name == 'push' && ref == refs/heads/main`**, in GitHub environment `production`, using the `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_ID` secrets, `npx supabase db push`. Pushing the feature branch, opening a PR, `workflow_dispatch`, and merging into `development` apply **no** migration anywhere.
- **GitHub `production` environment (read-only API, `gh api repos/KrapaGoutam/The-Lineup/environments/production`): CONFIRMED — it exists but `protection_rules` is `[]`: NO required reviewers, no wait timer, `deployment_branch_policy: null` (no branch restriction), `can_admins_bypass: true`.** Consequence: **a merge to `main` that touches `supabase/migrations/**`runs`supabase db push`against whatever project`SUPABASE_PROJECT_ID`names (Production per repository history) with no human approval.** Not modified (no protection rule was changed). **Production-release blocker for the owner:** GitHub → Settings → Environments →`production`→ add Required reviewers (and consider "Prevent self-review" and restricting deployment branches to`main`) before any release merge.

## 7. Untouched by design

Production database, Neon, `main`, `development`; organizations/locations; Staff-role assignments and Overall roles; module configuration; Attendance modes; harness-fixture dispositions; Finance activation; backend module enforcement; Auth identities and sessions; credentials. No secret was printed, written to a script/log, or committed. Evidence files (backup, snapshots, harness scripts) live outside git under the owner-only evidence directory.

## 8. Known errata and follow-ups

- Migration 91's header comment says imports are untouched; they are gated (location roles in a multi-location org cannot commit an import that creates/updates shared catalog rows; stock-only imports still work). **File not edited** — checksum `9375ae54…a8ad` preserved.
- Hosted DEV ledger is 91; **the app/Preview must be exercised only after this point** (done: the PR's Preview is created after the apply).
- Outstanding unchanged: D-1, D-3, D-4, D-5/5b, D-6, D-7C, D-8, D-11 (see [owner decisions §6–7](../OWNER_DECISIONS_REQUIRED.md)).

## 9. Integration closeout (after owner merge authorization)

- **PR #325 merged** into `development` by merge commit `207d088d5bca5d989030870433cf4daa3ecb4c78` at 2026-11-13T04:58:03Z (source `9058a3aadecc245b995295f0e237ab0127a111a2`, `--match-head-commit`); merge tree identical to the source tree; `main` unchanged `5e5b7747`. No merge-triggered workflow exists (push triggers are `main` only); no migration deployed.
- **Development Preview** deployment `7757555340` (success, Preview, `production_environment: false`, sha `207d088d`): bundle DEV ref ×1, Production ref ×0, no Neon host; unauthenticated GETs of the main, Settings, Recipes, Inventory, Attendance, `/kiosk` and an unknown-slug route return a client shell with no tenant data or error strings. Authenticated role-aware checks were **not** performed; the Kiosks UI is a Settings subview with no URL.
- **Compatibility (read-only):** 100/100 RPC names called by the merged source exist on Hosted DEV; verifier `--expect 91 --compare` clean (all 91 tables identical to the pre-apply snapshot); Finance OFF, enforcement `staged`, guard rows identical.
- **Not changed:** the GitHub `production` environment (no required reviewers — see section 6). Next owner decision: [D7C_OWNER_DECISION_PACKET.md](../D7C_OWNER_DECISION_PACKET.md).
