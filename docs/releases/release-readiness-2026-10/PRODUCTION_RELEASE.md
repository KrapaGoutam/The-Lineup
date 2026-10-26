# Production Release — Final Handoff (2026-10-26)

**Release decision: PRODUCTION RELEASE PASS** (with three UI checks deliberately deferred, tracked in #164)

Follows `GO_NO_GO.md` (NO-GO, conditions C1–C8). Tracking: #160 (closed), #161 (closed), #164 (open follow-up).

## Refs

| Item                       | Value                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| Release PR                 | #163 `development` → `main`, **merge commit** (no squash/rebase)          |
| Release PR head            | `68ef944` (unchanged from audit through merge); exact-head CI green       |
| `main` previous            | `3403058`                                                                 |
| `main` merge commit        | `d08eb4e` (parents `3403058`, `68ef944`), merged 2026-10-26 14:57:55 CDT  |
| Vercel Production          | `dpl_6M5n…` = `main@d08eb4e`, READY; Production scope → PROD Supabase ref |
| Rollback target (app only) | previous Production deployment `dpl_eTbp…` = `main@3403058` (still READY) |

## Order of operations (migrations first)

1. Frozen SHAs; exact-head CI on PR #163 green.
2. Service window verified from the database (no active entries for the local service day, 15+ min without board activity, no active ambiguous numeric labels), re-checked right before the dry run, the first migration and the merge. A first attempt stopped correctly when service started; the owner cleared two test entries and the release resumed.
3. Recovery (C4): native PITR/backups could **not** be verified (the Management API token lacks `backups_read`). Met via a fresh logical backup (38 public tables, 2,473 rows incl. migration history, plus function/policy/trigger/constraint/index/grant definitions) restored into a disposable local Postgres: 38/38 table md5 fingerprints identical, every schema category identical (two function bodies differ from the repo only by comments). The disposable stack was destroyed afterwards. **The owner should still confirm daily backups/PITR in the Supabase dashboard.** The backup itself is stored outside the repository on the owner's machine (it contains real payroll and PIN-hash data; never commit it).
4. Rehearsal: all nine migrations applied in order to the restored copy → PASS, resulting schema identical to DEV.
5. Dry run on PROD: all nine in one transaction ended by an intentional `RAISE` (rolled back) → PASS; PROD history unchanged afterwards.
6. Apply: nine migrations, one transaction each with its `schema_migrations` row in the same transaction, guard block first, `lock_timeout` 10 s.
7. Parity + old-app/new-schema smoke, then merge, deploy, final smoke.

## Migrations applied to PROD (`ftadewtkjlaotfdvtjcv`)

| #   | Migration                                             | Result |
| --- | ----------------------------------------------------- | ------ |
| 1   | `20260911130000_payroll_payment_unconfirm`            | PASS   |
| 2   | `20261023100000_table_rotation_v2_session_integrity`  | PASS   |
| 3   | `20261023110000_table_rotation_v2_trusted_mutations`  | PASS   |
| 4   | `20261025090000_tasks_v1_foundation`                  | PASS   |
| 5   | `20261025100000_tasks_v1_checklists`                  | PASS   |
| 6   | `20261025110000_tasks_v1_recurrence`                  | PASS   |
| 7   | `20261025120000_tasks_v1_notifications`               | PASS   |
| 8   | `20261026090000_table_allocation_conflict_resolution` | PASS   |
| 9   | `20261026120000_table_input_canonical_resolution`     | PASS   |

Each took 1–3 s. The route was the Management API `POST /v1/projects/<ref>/database/query` with the PROD ref hard-coded (not `…/database/migrations`, which assigns its own version). History rows use the CLI convention (plain name, one statements array).

## Parity

Repository 41 = DEV 41 = PROD 41 (identical version lists). Full definition diff PROD vs DEV: columns 447, constraints 379, indexes 201, policies 106, triggers 13, functions 91, function ACLs 91, table ACLs 83, enums 20 — all identical. Data: `table_rotation_entries` (1,107) and `section_assignments` (19) backfilled in place with equal row counts; no other table changed.

## Numeric-label preflight (C5)

Historical ambiguous rows 968 across 32 past service dates (left untouched by design); current-service-day active ambiguous rows 0 (after the owner ended two test entries). `private.resolve_table_input` on PROD data: `1→T1`, `2→T2`, `19→T19`, `T1` unchanged, `99` off-map free text.

## Smoke

| Check                                                  | Old app / new schema                       | New build           |
| ------------------------------------------------------ | ------------------------------------------ | ------------------- |
| Login / shell                                          | PASS                                       | PASS                |
| Grid, Floor, Picker, Servers, Dashboard (today, prev)  | PASS (identical to pre-migration baseline) | PASS                |
| Tasks Today / My Tasks / Opening / Closing             | n/a (old app)                              | PASS                |
| Schedule, Team                                         | PASS                                       | PASS                |
| Attendance (real backend, no "unavailable")            | PASS                                       | PASS                |
| Payroll (balances unchanged), Tip Split                | PASS                                       | PASS                |
| Console errors / runtime error logs / non-200 requests | 0 / none / none                            | 0 / none / none     |
| `1 → T1`, conflict + Cancel, two-device Realtime (UI)  | —                                          | **DEFERRED** (#164) |

Deferred because they need Production board writes and the only available "add server" roster is placeholder names (no fake employees). They passed in the owner's DEV acceptance.

## Deploy-migrations behaviour

On the merge push, `deploy-migrations` failed at `supabase link` (authorization — #111) and skipped `supabase db push`; nothing was reapplied. #111 and #113 remain open: this release used a manual, ordered route and did not fix the automated path.

## Open items

- #164: run the deferred UI checks once with real staff.
- #111 (automated migration auth), #113 (migration/app ordering), #106, #154, #155 unchanged.
- Confirm Supabase native backups/PITR in the dashboard.
- Two PROD function bodies lacked comments present in the repo (logic identical); they were not touched by the release except where later migrations replaced them.

## Safety

development merged: YES · main merged: YES · DEV touched: probe tables (created/dropped) · PROD touched: YES (nine migrations, one login-attempt row from the owner's sign-ins; no board/payroll/tips writes by this release work) · PROD migrations: YES · Production deployed: YES.
