# Recipes V1 — Production preflight and future execution

Date: 2026-10-29 (America/Chicago). Tracking: [#238](https://github.com/KrapaGoutam/The-Lineup/issues/238), #220; #234 remains open and shelved; milestone #7 remains open.

**NO-GO — PREFLIGHT BLOCKERS REMAIN.** Technical fixes and release tooling are prepared; PR and exact-head CI are tracked in #238. Production execution remains locked: a usable recovery point is unverified, the canonical Recipe artifact/approvals are absent, and empty Inventory requires an owner-approved initialization source or explicit empty-launch decision. The historical [audit](RELEASE_READINESS_AUDIT.md) remains **GO to Production preflight**, a separate decision. This document supersedes that audit's estimated migration count and proposed execution ordering with live evidence and the owner's checkpoint instructions. The safe preflight PR remains open until these gates are closed; it is not merged under the owner's conditional merge rule.

## Approved contract

Owner-approved execution profile: Recipes V1 Release Candidate Validation + Production Preflight Preparation. This is the bounded feature handoff for the forward SQL validator fix, importer guards and release tooling/documentation. No application/UI changes, new dependencies, package upgrades, real data import or Production mutation. No Part 2/3 or shelved QA work.

Data: preserve all existing table definitions; replace only `bar_recipe_category_reorder` in a new migration. Authorization: preserve active membership/manager checks, organization lock, pinned search path, explicit grants and `22023` validation convention. Import uses the existing service-role-only, manager-actor-verified RPC; explicit target organization is read back before RPC invocation. UI/loading/empty/responsive states are unchanged; CLI validation and permission failures exit nonzero without importing. Time behavior is unchanged; warning approval dates are explicit ISO dates. Concurrency/idempotency remain the existing organization advisory lock and create/skip-existing behavior; Production overwrite is forbidden.

Acceptance: unknown/foreign/duplicate/null IDs rejected, valid reorder retains tenant scope; local/dev imports retained; Production defaults to rollback-only dry run; create requires explicit acknowledgements, exact origin/ref and matching prior report; unresolved warnings block create; no destructive cleanup. Verified by importer unit tests and pgTAP. No generated database type change: function signature and schema shape are unchanged.

## Git and environments

- PR #237 already merged at `dd792f359a77b60ea05115ce8c682b38a5a6d5d8`; expected audit head `9d671f45d7198f04ae4dd6d32c81d54974303406`, CI #238 success verified. This merge is the starting development baseline.
- Main verified by fetch: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`.
- Branch `release/recipes-v1-production-preflight`; isolated worktree `.tmp/recipes-prod-preflight`. Parent-worktree documentation changes, untracked references and other worktrees preserved.

| Environment | Name           | Ref                    | Region         | Verification                                                          |
| ----------- | -------------- | ---------------------- | -------------- | --------------------------------------------------------------------- |
| DEV         | the-lineup-dev | `opmujepkemwcdxxorhfd` | East US (Ohio) | Live CLI project list, explicit link, migration list and API readback |
| PROD        | the-lineup     | `ftadewtkjlaotfdvtjcv` | East US (Ohio) | Live project list, read-only history and SQL metadata/counts          |

CLI stays **2.76.8** (available update **2.122.0** deliberately not installed). Session-only `SUPABASE_ACCESS_TOKEN` is assigned from `LINEUP_SUPABASE_ACCESS_TOKEN`, never printed or stored. Before each remote operation identify environment/name/ref. The isolated worktree was temporarily linked to PROD for history inspection and restored to DEV in `finally`; final operations target DEV explicitly.

## Migration parity

DEV started **61/61**, head `20261029014613`. After local regression tests, SQL lint, diff review and DEV-only `db push --linked --dry-run`, only the new migration was applied to DEV. DEV now **62/62**, head **`20261029194855`**, no missing/remote-only/duplicate versions or name mismatches. Readback confirms `c.id=ordered.id`, `SECURITY DEFINER`, empty search path, authenticated execute, no anon execute. No history repair performed.

PROD has **54** migrations, head **`20261028100100`**; **eight** pending below. No missing older versions or remote-only versions. Seven historical PROD history names (`20260919120000` through `20260923100000`) include their timestamp prefix, unlike DEV/filenames; PROD stores each as one SQL block whereas DEV stores split statements. Read-only comparison confirms matching SQL tokens after omitting comments/whitespace/statement delimiters for all seven. This is history serialization/name variance, not a reason to repair or reapply. No repair history is inferred from present metadata; no repair was performed. Version/name inspection does not constitute a byte-for-byte remote schema diff.

Full local/DEV/PROD version matrix: [MIGRATION_PARITY.md](MIGRATION_PARITY.md).

### Exact future Production order and review

All eight are pending on PROD. Execute only after P0–P2. Each migration and its history entry must commit atomically; use the repository CLI workflow, one transaction per migration, with a bounded lock/statement timeout. Stop on any failure; do not repair history or skip statements. Keep application promotion/imports paused until the whole batch verifies. No data backfill, truncation, table drop or existing operational-row transform occurs during this batch. DML inside function definitions is runtime behavior, not migration-time data mutation.

| #   | Migration                                                     | Feature               | Risk                | Reviewed effects                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `20261028140623_bar_recipes_foundation.sql`                   | Recipes V1            | ADDITIVE / LOW RISK | Six new org-scoped tables, composite tenant FKs, checks/unique constraints and FK indexes; RLS and member/manager policies; SELECT-only authenticated grants; pinned-path helpers and service-role-only import RPC. No existing-table backfill, trigger or Storage change.                                                                       |
| 2   | `20261028193159_bar_recipes_management_and_images.sql`        | Recipes V1            | ADDITIVE / REVIEW   | Management/version-checked RPCs, tenant/image helpers and image-scope constraint; creates/configures private bucket and SELECT/INSERT/DELETE object policies. No UPDATE policy or object upload. Existing bucket settings would be updated if it appeared before execution: recheck first. Requires migration role permission on Storage schema. |
| 3   | `20261029005940_bar_inventory_freshness.sql`                  | Inventory V1.1        | ADDITIVE / REVIEW   | New date-lot/freshness-rule tables with scope/actor FKs and indexes, RLS, SELECT-only grants, manager RPCs and audit calls; Realtime publication additions. Expands `inventory_change_log` entity-type CHECK (drop/add may take an exclusive lock and validate existing rows). No stock depletion, data backfill or new trigger.                 |
| 4   | `20261029010431_bar_inventory_bulk_count.sql`                 | Inventory V1.1        | ADDITIVE / LOW RISK | One authenticated-only manager RPC. Validates all rows and versions; acquires product/stock locks in UUID order; calls existing audited adjustments in one runtime transaction. No migration-time row writes, tables, indexes, triggers or Storage changes.                                                                                      |
| 5   | `20261029010756_bar_inventory_saved_views.sql`                | Inventory V1.1        | ADDITIVE / LOW RISK | New personal-view table, tenant/location/member FKs, unique name and one-default indexes, RLS scoped to caller and location; SELECT-only grants; manager save/delete RPCs with per-person lock and version checks. No backfill/trigger/Storage change. Runtime delete affects only caller's selected saved view.                                 |
| 6   | `20261029012324_bar_inventory_v1_1_deferred_tenant_fks.sql`   | Inventory V1.1        | ADDITIVE / REVIEW   | Alters only location/member FK timing on the three new V1.1 tables to DEFERRABLE INITIALLY DEFERRED. Checks still run at commit. DDL locks on new tables; no row rewrite/backfill, grants or RLS changes.                                                                                                                                        |
| 7   | `20261029014613_bar_inventory_calendar_year_range.sql`        | Inventory V1.1        | ADDITIVE / REVIEW   | Drops/re-adds two date-lot CHECKs to widen accepted years to 1000–9999; new table in this batch, validation/exclusive DDL lock. No data conversion, grant/RLS/Storage change.                                                                                                                                                                    |
| 8   | `20261029194855_bar_recipe_category_reorder_validate_ids.sql` | Recipes preflight fix | ADDITIVE / LOW RISK | CREATE OR REPLACE same function/signature, qualifying supplied IDs; preserves manager gate, org lock, tenant-scoped updates, existing ACL and `22023`. No table/index/policy/trigger/Storage change or migration-time row write.                                                                                                                 |

Operational rollback: keep additive schema and restore previous compatible application if necessary. Do not drop tables/bucket or delete imported data as an automatic rollback. Fix schema forward; mistaken Recipes are archived via authorized operations. A database restore affects the whole project and requires a separately verified recovery point/operator plan.

## Reorder evidence

Baseline new pgTAP tests failed unknown-ID, foreign-ID and unchanged-after-rejection assertions (3 failures/12), proving the bug independently. Migration qualifies `unnest` as `ordered(id)` and compares `c.id=ordered.id`. All 12 then pass: valid/inactive reorder, unknown, foreign, duplicate, null element/array, Staff, inactive manager, foreign manager, unchanged rejected writes and unchanged foreign/fallback rows. Combined local suite: **49 files / 1,550 assertions**. DEV applied successfully and function/ACL readback passes; PROD has no Recipe function yet and remains unchanged.

## Production importer

Previously local/dev only. Now `--target prod` maps exclusively to `https://ftadewtkjlaotfdvtjcv.supabase.co`; it never reads CLI linkage. URL origin/path/credentials/query/hash and optional `SUPABASE_PROJECT_ID`/`VERCEL_ENV` are checked before constructing the client. `--org` and `--actor` are mandatory; organization ID/name/slug are read back and printed to stderr before the RPC.

Default `--mode dry-run` calls the existing rollback-only `dry_run` RPC. It validates using temporary transactional writes and rolls them back, including category/child rows; it requires the schema to exist. **No PROD importer invocation, including a dry run, was performed in this checkpoint.** Offline/mock tests construct the execution path without a Production client or network write.

Create requires **all** of `--mode create --execute --confirm-prod --dry-run-report <report.json>`. Production `--overwrite` is rejected. The prior report must match project ref, exact payload file SHA-256, organization slug and resolved ID, actor, empty overwrite list, dry-run mode and recipe count. Any payload correction requires a fresh report. Reports are review artifacts, not cryptographic authorization; operator must review and obtain the separate import approval in P10. Never hand-edit a report to bypass a failed validation.

These are future commands only; populate environment secrets outside logs/files and replace file/actor placeholders after explicit approval:

```powershell
# P8: schema must already be present; saves stdout only, leaving organization readback on stderr.
node scripts/recipes/import-recipes.mjs --file <reviewed.json> --org the-monks --actor <approved-manager-uuid> --target prod --mode dry-run | Out-File -Encoding utf8 <reviewed-dry-run.json>
if ($LASTEXITCODE -ne 0) { throw 'Recipe dry run failed; stop' }

# P11: only after owner approves this exact file/hash/report/organization.
node scripts/recipes/import-recipes.mjs --file <reviewed.json> --org the-monks --actor <approved-manager-uuid> --target prod --mode create --execute --confirm-prod --dry-run-report <reviewed-dry-run.json>
if ($LASTEXITCODE -ne 0) { throw 'Recipe import failed; stop and investigate' }
```

Warning metadata is per-recipe `import_warnings`: `{id,message,status,resolution,approved_by,approved_on}`. Status `unresolved` blocks PROD create. `resolved` or `approved` requires a nonempty resolution, approving person and ISO approval date. Metadata stays in reports and is stripped before the existing RPC; recipe content is preserved. Known recipe names require explicit records with IDs below even if warning metadata was accidentally omitted. Notes marked import warning/unresolved/ambiguous require structured approval. Other source ambiguities still require human payload review; this is not a general semantic ambiguity detector.

| Recipe                       | Required warning ID          | Owner decision                                                                             |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Virgin Coco Margarita Splash | `virgin-coco-quantity`       | Resolve or explicitly accept `0.75 oz or 2 oz`; never automatically choose                 |
| Smoked Vanilla Old Fashioned | `smoked-vanilla-alternative` | Resolve or explicitly accept Absolut Vanilia / Vanilla syrup; never collapse automatically |

Neither decision was made here. New mocked unit coverage: local/dev/prod dry-run, missing flags, overwrite denial, wrong origins/project/environment, absent org, changed report/file/actor/org identity, unresolved/unattributed approvals, known warnings, approved-content preservation and injected execution path. Tests do not require PROD credentials or writes.

## Canonical data and Storage

**Canonical Recipe payload remains an external release artifact and must be supplied for the Recipe dry-run phase.** `monks_cocktail_recipes_db_ready.md` was not found in tracked repository files, repo root/docs/import areas, retained project-local work or the immediate project directory. No whole-computer crawl and no reconstruction. The importer accepts reviewed JSON, not Markdown: owner must supply source and approved normalized JSON with provenance/hash. Expected validation target: Signature Cocktails 20, Margaritas 4, Martinis 6, Mocktails 7, Shots 1 = **38 Recipes / 76 variants**; actual content/count/numbering unverified. Review fallback Others, Lemonade/Green Tea numbering and source corrections; no pricing field is added.

PROD organization readback: **The Monk's**, slug `the-monks`, ID `284f0170-05a0-4d60-b171-1b5cb13ae076`. Before any future import, re-read this identity and an active authorized actor. No first-organization fallback.

Inventory schema exists and all ten exposed Inventory tables have RLS enabled. Exact safe read-only counts: `inventory_products`, `inventory_categories`, `inventory_stock`, `inventory_adjustments`, `inventory_order_drafts`, `inventory_order_draft_items` each **0**. No operational Inventory data found. **Bar Inventory Production data injection source not established.** Repository import specs/scripts and synthetic fixtures are not an owner-approved operational source. Injection cannot be called NOT REQUIRED based on existing data; the owner must either approve an empty Inventory launch or provide/review an initialization source and explicitly authorize it. Never overwrite data that appears after this snapshot.

PROD `recipe-images` bucket query returns **no row**. Migration #2 creates/configures it: private, 2,097,152-byte maximum, WebP/JPEG only; policies `recipe_images_select`, `recipe_images_insert`, `recipe_images_delete`, no UPDATE. No separate manual bucket step expected if migration-role privileges match DEV; fail/stop if they do not. After applying, verify bucket configuration, exact policy set and same-tenant/role behavior; no bucket/object mutation performed here. Images remain optional and owner-supplied.

Recipes have no Inventory ID dependency. The Inventory-before-Recipes sequence below is operational order only.

## Application / Vercel

Live local CLI verified **onepiece11/the-lineup**, project `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`, team `team_i8igGalPA54kRnKVsTRPVErz`, repository `KrapaGoutam/The-Lineup`, Production branch **main**, Next.js, Node **24.x**. Connected Vercel tools lacked team access; local existing credentials supplied read-only evidence. No environment values decrypted/displayed, no config change/deploy. Live variable metadata shows:

| Variable/config                                          | Required                          | Present/unknown                     | Future release action                                                         |
| -------------------------------------------------------- | --------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                               | Yes                               | PROD name present; value unverified | Verify exact PROD origin before build; no DEV ref                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                   | Yes                               | PROD present                        | Verify PROD key pairing without logging value                                 |
| `SUPABASE_SECRET_KEY`                                    | Server auth and controlled import | PROD present, sensitive             | Keep server/operator only; verify environment pairing                         |
| `APP_PIN_PEPPER`                                         | Yes                               | PROD present, sensitive             | Retain existing value; never rotate during release                            |
| `NEXT_PUBLIC_RESTAURANT_SLUG`                            | Yes                               | PROD present                        | Verify `the-monks`                                                            |
| `NEXT_PUBLIC_DEMO_MODE`                                  | Yes, disabled in real PROD        | PROD present                        | Verify false / real-mode behavior                                             |
| `NEON_DATABASE_URL`                                      | Existing attendance/payroll       | PROD present, sensitive             | Preserve existing server-only configuration                                   |
| `NEXT_PUBLIC_APP_URL`                                    | Optional current app setting      | Not in returned metadata            | Verify canonical URL if any consumer needs it; no new Recipes requirement     |
| `SUPABASE_PROJECT_ID`                                    | Local/CI operator guard           | Vercel runtime not required         | Set explicit target for migration/import operation; do not infer from linkage |
| `LINEUP_SUPABASE_ACCESS_TOKEN` / `SUPABASE_ACCESS_TOKEN` | Local management only             | Present in session                  | Never persist, print, commit or add to browser/Vercel public env              |
| Production branch / framework / Node                     | Yes                               | main / Next.js / 24.x verified      | No change                                                                     |

Existing `deploy-migrations` workflow on main is not a release ordering guarantee (#111/#113); apply/verify schema before the main merge, then confirm it has no pending migration. Do not repair unrelated CI credentials here. Runtime app source remains unchanged. Local build passes with locked dependencies installed in this isolated worktree.

## Backup / recovery gate

PROD backup metadata GET returned **403: Missing required permission(s): backups_read**. Token access to project SQL does not establish backup access. Current plan, backup point and PITR availability **not verified**. No backup or restore initiated, no credential creation/rotation. The historical release's owner-approved recovery statement is not current backup evidence.

Before P3 the owner/operator must verify an actual usable recovery point, retention and restore procedure through existing authorized access. A pre-release logical backup to an owner-controlled private destination is recommended if a suitable recovery point cannot be verified; Storage objects need separate recovery consideration. Never commit a dump. Additive migration compatibility makes application rollback feasible but does not replace data recovery.

## Future execution — P0–P14 (none performed)

- [ ] **P0** Owner explicit Production GO for exact candidate, migration batch and sequencing; this checkpoint does not supply GO on the owner's behalf.
- [ ] **P1** Verify `the-lineup` / `ftadewtkjlaotfdvtjcv`, organization identity and actor; re-query live heads/counts; stop if state changed. Confirm release PR candidate checks and intended branch before writes.
- [ ] **P2** Verify usable backup/PITR or approved private logical backup and recovery plan. Stop if unverified. Preserve secrets and record only safe recovery metadata.
- [ ] **P3** Explicitly link PROD; confirm ref; run `supabase db push --linked --dry-run` and compare exactly the eight filenames above. Apply approved batch with bounded lock/statement timeouts using the repository workflow; stop on error. Restore DEV link in `finally` even if any later gate fails. No migration repair.
- [ ] **P4** Verify PROD migration history is 62 versions through `20261029194855` (or re-approved newer exact batch), no pending/remote-only versions; verify changed RPC/grants/RLS. Record results safely.
- [ ] **P5** Verify private Recipe bucket, MIME/size, three object policies and role/tenant permissions. No separate manual Storage change without explicit scope/approval if migration failed.
- [ ] **P6** Recheck Inventory counts. If still empty, require owner decision: launch empty OR approved canonical Inventory payload, reviewed dry run and explicit injection approval. Use existing manager CSV/XLSX workflow; do not invent a script or use fixtures. Never replace operational data automatically.
- [ ] **P7** Inventory readback: org/location categories/products/stock/ledger and draft state as applicable; retain safe counts and no unrelated changes. If launch empty was approved, verify empty state.
- [ ] **P8** Supply canonical Recipe source and normalized JSON, validate provenance/hash, **38/76** and category split, explicit org/actor; run PROD rollback-only Recipe dry run and review mapping/report. No real content currently available.
- [ ] **P9** Owner resolves/explicitly approves known warning records and all remaining import warnings; record correction decisions. Changed payload means repeat P8 and review new hash/report.
- [ ] **P10** Separate explicit owner Recipe import approval for exact file SHA, dry-run report, organization ID and actor. This is not implied by access credentials or a prior generic release GO.
- [ ] **P11** Execute guarded create-only Recipe import with all acknowledgements and matching report. No truncate/reset/deletes/Production overwrite. Stop on any error.
- [ ] **P12** Read back categories/38 Recipes/76 variants, numbers/slugs, full Perfect/House children, warning resolutions, active/archive state and private image behavior. Confirm no Inventory coupling or unintended stock mutation.
- [ ] **P13** Prepare `development → main` release PR and require exact-head application, browser-smoke, Database and Vercel checks; merge with a merge commit only under owner approval. Stop if head changes; no main merge in this checkpoint.
- [ ] **P14** Verify Production deploy uses approved main SHA/PROD configuration with no DEV ref; authenticated owner/Staff smoke Recipes/List/Picture Book/search/detail/management/archive/images and Inventory as applicable. Keep #220/#234/milestone #7 open until owner accepts release/deferred status. Record final DEV linkage.

## Validation and remaining evidence

- CLI project listing, explicit DEV/PROD links, migration lists before/after; read-only Management API history/function ACL, organization, Inventory schema/counts and Storage bucket queries; backup permission failure recorded.
- Local baseline and fixed `0049` pgTAP via `psql`; combined **49 files / 1,550 assertions** through a local psql runner failing on SQL errors or `not ok` TAP lines (`pg_prove` absent). Existing local DB was not reset. Database CI must independently replay all migrations.
- `supabase db lint --local --schema public,private --level error --fail-on error` pass.
- Focused importer **32/32** with network explicitly forbidden; `npm run check` pass; `npm run test` **156 files / 2,064 tests**; `npm run build` pass. Initial build could not resolve parent worktree dependencies; isolated `npm ci --prefer-offline --no-audit --no-fund` fixed environment setup with unchanged lockfile.
- Browser suites not rerun locally: no UI/runtime app change; required broad exact-head CI remains the release-PR gate.
- Precommit review: no credentials, env files, dumps, generated types/build/test artifacts or unrelated source in intended diff. Final exact-head CI/PR/merge recorded in GitHub tracking after push.

Preparation gaps are explicitly gated for execution: canonical Recipe artifact/approvals, Inventory initialization or empty-launch decision, verified recovery point, and value-level Production configuration verification. Safe changes can be reviewed for development; **no unconditional Production execution recommendation is made while these gates remain open**.
