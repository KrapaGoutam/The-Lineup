# V2-008 Batch C — Hosted DEV Rollout and Recovery Plan (migrations 89–91)

> **EXECUTED 2026-11-13 under owner approvals D-7A/D-7B/G-1 — see [BATCH_C_ROLLOUT_RECEIPT.md](BATCH_C_ROLLOUT_RECEIPT.md).** The plan below held without change (Hosted DEV ledger 88 → 91). Execution addendum for any future rollout using this route: (1) rehearse and apply as role **`postgres`**, never `supabase_admin` (ownership of new `SECURITY DEFINER` helpers drives `42501` between functions); (2) the restored copy differs from Hosted only in six `CHECK` parenthesizations and the raw policy fingerprint, so compare canonical (`search_path=''`) policies and expect only the `constraints` schema category to differ there; (3) the rollback-only Hosted probe is [hosted_rollback_probe.mjs](hosted_rollback_probe.mjs) (final statement always raises; prove nothing persisted by a full-table `--compare`); (4) recovery path remains forward-fix; the retained encrypted backup is `dev-20261113T040959Z.zip.dpapi` (local owner profile only).

**Original status line: not executed; nothing was authorized until the owner answered D-7A** ([packet](D7_APPROVAL_PACKET.md)). Prepared 2026-11-13 from read-only preflight and a populated local rehearsal ([receipt](BATCH_C_READINESS_RECEIPT.md)).

Tools (all read-only): [hosted_dev_readonly_check.mjs](hosted_dev_readonly_check.mjs) · [function_fingerprint.sql](function_fingerprint.sql) · [schema_fingerprint.sql](schema_fingerprint.sql) · [expected-fingerprints.json](expected-fingerprints.json).

## 1. Stop conditions (any one halts the rollout; do not "fix forward" blindly)

1. Hosted DEV ledger is not exactly **88 / max `20261111120000` / none of the three versions present**. A moved ledger means another migration landed: reconcile first (re-run the divergence comparison; a new write plan is needed).
2. The project ref is not `opmujepkemwcdxxorhfd`, or any tool resolves to the Production ref `ftadewtkjlaotfdvtjcv`.
3. A migration file's sha256 differs from the receipt table.
4. The pre-apply function or schema fingerprint is not `ledger88` (`hosted_dev_readonly_check.mjs --target hosted --expect 88` exits non-zero).
5. Enforcement is not `staged`, or Finance is not OFF.
6. A restore-validated backup of the ledger-88 database does not exist (§3).
7. The CLI dry run lists anything other than exactly the three pending migrations.

## 2. Pre-deployment checklist (in order)

1. D-7A approved in writing for exactly the three files, project and sequence.
2. `git rev-parse HEAD` equals the approved commit; `sha256sum` of the three files equals the receipt; working tree clean.
3. `node hosted_dev_readonly_check.mjs --target hosted --expect 88` → exit 0.
4. Take the **immediate pre-apply data baseline**: `… --target hosted --snapshot before.json` (counts and md5 only; no row content leaves the database). Store under the scratch area, not in git.
5. Backup + restore proof (§3) complete and recorded.
6. Rehearse on the restored real-data copy (§3); post-apply verifier passes there with `--target local` semantics against that container.
7. Confirm no in-flight deploy: PRs and merges to `development` never apply migrations (only a push to `main` runs `deploy-migrations`, see §7), so nothing races the manual push.

## 3. Backup / recovery prerequisites (requires the D-7A backup sub-approval)

- Proven tooling: `.tmp/v2-integration-handoff/backup-dev.ps1`, `verify-backup.ps1`, `restore-backup.ps1`, `validate-restore.ps1`. They hard-code ledger 73/79–81 receipt names; use **adapted copies for ledger 88** (as done for earlier rollouts). Output is an owner-only DPAPI-encrypted zip under `%LOCALAPPDATA%\TheLineup-DEV-Backups` (same Windows profile only). The newest retained backups are older ledgers and are **not** acceptable recovery points.
- Restore into `public.ecr.aws/supabase/postgres:17.11.0.003` with `--network none`, a tmpfs data directory and a throwaway password; validate the restore (ledger 88, row counts, fingerprints equal Hosted DEV), then apply the three migrations there as the **real-data rehearsal** and run the verifier with `--expect 91`.
- Retain the backup until the owner releases it (earlier rollouts kept them ≥ 7 days). Never auto-delete.
- No secrets, plaintext passcodes, service-role keys, session tokens or refresh tokens are written to any file or to git.

## 4. Apply route (proven in earlier DEV rollouts)

1. Build a bundle directory: `config.toml` + all 88 applied migrations + the three pending files; verify the first-88 hashes and the md5 of the version list against the live ledger digest.
2. `supabase --workdir <bundle> link --project-ref opmujepkemwcdxxorhfd` with the access token from the environment (never echoed).
3. `supabase migration list --linked` → exactly three local-only rows.
4. `supabase db push --linked --dry-run` → exactly the three, in order. **Stop** if not.
5. `supabase db push --linked` (each migration is applied in its own statement batch and recorded in the ledger as it succeeds; ~seconds). **Stop immediately on the first error** and go to §6.
6. Do not push anything newer, do not reset, do not run any backfill tooling, do not touch module configuration, Attendance modes, enforcement or Finance.

## 5. Post-application verification (read-only; run immediately)

1. `node hosted_dev_readonly_check.mjs --target hosted --expect 91 --compare before.json` → must print `ok` for: ledger count 91, max `20261113100000`, the three versions present, function fingerprint == ledger 91, schema fingerprint (8 categories) matches, **all tables identical to the pre-apply snapshot** (including `auth.sessions`/`refresh_tokens`, so pre-existing sessions are provably intact). Expect exactly two schema categories to differ from ledger 88: `functions` 327 and `function_acl` 327.
2. Guard rows unchanged: enforcement `staged`, Finance `false`, Overall roles 0, kiosk devices 6 all `revoked`, module-config rows 14, attendance modes unchanged.
3. Authorization behaviour — **D-7B path 1 (preferred, no persistent writes):** the self-rolling-back probe pattern (`security-s1/e1_authorization_probe.sql`, pgTAP 0078/0079/0080 derived) executed once through the Management API inside a transaction that always ends in `ROLLBACK`, using in-transaction synthetic `auth.users` rows under role `authenticated` with a live `session_id` claim. No new identity, device or row survives; sequences may advance. **Path 2** (real GoTrue identities and devices on hosted) only if the owner approves a separate fixture manifest and cleanup plan (D-7B).
4. Do **not** probe by calling `kiosk_reassign_device` on the six existing revoked V2-007 devices with a real session: if migration 90 were somehow absent the call would reactivate a retired fixture. Use the rolled-back probe.
5. Record: commands, exit codes, fingerprints, timestamps in the Batch C receipt; update `HANDOFF.md`/`STATUS.md`.

## 6. Failure points, partial-rollout detection and recovery

**Identify the state, then decide.** `hosted_dev_readonly_check.mjs --target hosted` prints the matched state (`ledger88/89/90/91` or `UNKNOWN/PARTIAL`) from the function fingerprint:

| Observed state                                   | Meaning                                                                              | Action                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger88`, ledger 88                            | Nothing applied (failed before 89 or a connection error)                             | Safe to retry the same push after diagnosis                                                                                                                                |
| `ledger89`, ledger 89                            | 89 applied, 90 failed                                                                | Diagnose 90 (it replaces only `kiosk_reassign_device`), fix **forward**, re-run `db push` (applies only 90 and 91). The kiosk fleet is already protected by 89's predicate |
| `ledger90`, ledger 90                            | 91 failed                                                                            | Diagnose 91, fix forward, re-push. Hosted DEV is then at "kiosks hardened, catalog unchanged" = the pre-E-1 behaviour, which is safe                                       |
| `UNKNOWN/PARTIAL` or ledger/fingerprint disagree | A function was changed outside the migration path, or a half-applied statement batch | **Stop.** Compare function by function against `staged-states` md5s; do not apply anything until explained                                                                 |
| `ledger91`, but a probe/verifier check fails     | Applied, behaviour or preservation wrong                                             | Decision criteria below                                                                                                                                                    |

Failure points considered (none seen in rehearsal): a missing `service_role`/`authenticated` grant target (none: roles are platform-defined); `create or replace` changing a return type (none: signatures preserved; verified by the fingerprint and the upgrade-vs-replay equality); lock waits on `pg_proc` entries held by running requests (catalog-level, brief; retry); a concurrent deploy (excluded, §2.7); a ledger insert conflict (excluded by stop condition 1).

**Decision criteria after a `ledger91` verification failure**

- _Data changed_ (any table differs from the snapshot, any session lost) → treat as P0: stop all further work, restore-validate from the backup into a container to establish what changed, do **not** restore over Hosted DEV without owner approval. The migrations contain no DML, so this indicates an outside actor or an unknown trigger.
- _Authorization wrong_ (a probe denies a legitimate actor or admits an illegitimate one) → author a **forward fix migration** (new timestamp, `create or replace` only), rehearse it locally on the restored copy, get a focused review, then apply under a new, explicit approval.
- _Emergency neutralization of one migration's behaviour_ → a forward migration that re-creates the previous function bodies from preserved history (all 16 prior bodies are byte-identical to the migrations that introduced them and to Hosted DEV's current bodies). It is a new forward migration, never a down migration or a ledger edit.
- **Never** run a destructive down migration, `db reset`, `repair`/ledger edits, or a restore over Hosted DEV as a first response.

## 7. Deploy order and automatic deployment — verified

**Order is one-directional: migrations first, then the app.** New app code on the old schema fails closed but loses function for everyone (owners included): `catalog_authorized` missing hides every Inventory/Recipes management control; `kiosk_list_manageable_locations` missing makes Settings → Kiosks report "Failed to load your kiosk locations". Old app on the new schema behaves as intended (location roles in multi-location organizations get `42501` on shared-catalog writes; a revoked-device reassign returns `55000`). Preview and `development` builds point at DEV, so apply D-7A **before** any Preview of this branch is smoked, and after the push confirm through PostgREST that the schema cache sees `catalog_authorized` and `kiosk_list_manageable_locations` (watch for `PGRST202`/`PGRST103`; a cache reload is a read-only notification the owner can approve if needed).

Known behaviour to expect on DEV: an Inventory **import commit** that creates or updates catalog rows (new vendor/category/subcategory/product, or a product edit) is refused with `42501` for a location role in a multi-location organization, all-or-nothing; stock-only imports still work. The migration's header comment saying imports are untouched is inaccurate (erratum; file not edited to keep the reviewed checksum).

- `.github/workflows/database.yml`: pull requests run only the local ephemeral stack (`migrations-and-policies`). `deploy-migrations` (`npx supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}` → `npx supabase db push`) runs **only on `push` to `main`**, in the GitHub environment `production`. Pushing the feature branch, opening a PR into `development` and merging into `development` therefore apply **no** migration to any hosted database. Hosted DEV changes only by an explicit manual push.
- Consequence to plan for: the later release merge to `main` will run `db push` against whatever project the `SUPABASE_PROJECT_ID` secret names (Production per repository history). That release needs its own Production gate (D-1 read-only preflight, backup, owner approval). Do not merge V2-008 to `main` as a side effect of any other work.
- A Vercel Preview/Dev build does not run migrations (no migration step in the build configuration).
