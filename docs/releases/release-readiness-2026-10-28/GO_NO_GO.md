# Release-readiness decision — `development` → `main` (2026-10-28)

Audit date: 2026-10-28 · Environment: Local Windows · Auditor: Claude Code (Sonnet 5.5, high) · Scope: **audit only** — nothing merged, deployed or applied.

| Ref                        | SHA                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `origin/main` (Production) | `d08eb4e0b7331859b0f80d4ad89c2a15c9db71be`                                                                |
| `origin/development`       | `efd7d4cbcd06a32956ca5d0411687fb2d7f96e12` (audited code state; see "Release candidate" for the docs SHA) |
| merge-base                 | `68ef9447b37a5cc65432ca9aa9e01a2ec817c36c`                                                                |
| ahead / behind             | development is **105 ahead (58 non-merge commits)**, **1 behind** (`d08eb4e`)                             |

## Decision

# CONDITIONAL GO

No product, security, data or migration blocker was found. The release delta is fully understood, the 13 pending migrations are additive and forward-safe, PROD's migration history was read (read-only) and matches `main` exactly, and every feature in the delta has its own recorded final gate (Tasks V1.1 T-6 was run on exactly this code). The remaining items are **operator / owner preflight actions**, listed below, each quickly verifiable before the release PR is merged.

## Why the 105-ahead / 1-behind graph is safe

- The one `main`-only commit is `d08eb4e` (merge of PR #163, parents `3403058` + `68ef944`). Its **tree is byte-identical to `68ef944`** (`ccd26ae…`), the merge-base, which is an ancestor of `development`. `git diff 68ef944 origin/main` is empty.
- Therefore **`main` holds no file content that `development` lacks**: `main` = merge-base, `development` = merge-base + the release delta. A `development → main` merge cannot conflict and produces exactly the `development` tree. Do **not** merge `main` back into `development`.

## What was verified (read-only)

| Check                              | Result                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree delta main → development      | 264 files, +62,197 / −532 (src 161, tests 57, docs/tasks 28, supabase/migrations 13, config/deps 5)                                                                                                                                   |
| Pending migrations                 | **13**, all _added_; none of the 41 on `main` is edited; no `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE`, data `UPDATE` or type rewrite (only `drop function if exists private.tasks_notify(old signature)`, recreated in the same file) |
| PROD migration history (read-only) | **41, head `20261026120000`, identical to `main`; no PROD-only versions; development contains all of them.** Exactly the 13 pending versions are missing                                                                              |
| DEV / local parity                 | repo 54 = local 54 = DEV 54, identical version lists (T-6, 2026-10-28); no `supabase/**`, `src/**`, `tests/**`, `package*.json` or workflow change after T-6's tested head `75c964b` (docs only)                                      |
| Application evidence               | T-6: desktop 289/289, real WebKit host-tablet 289/289, server-mobile 287 + 2 intentional skips, Vitest 1689, pgTAP 42 files / 1297, hosted DEV Tasks 19/19, TS-050 PASS, real-mode popup 3/3, check + both builds green               |
| Dependencies                       | `next` 16.3.4 → 16.4.3, `eslint-config-next` 16.3.4 → 16.4.3, `zod` 4.5.4 → 4.6.7 (security PR #188), + exact-pinned `fflate`, `read-excel-file`, `write-excel-file` (Bar Inventory XLSX, BI-8d). Nothing unvalidated                 |
| Environment safety                 | no `opmujepkemwcdxxorhfd` / `ftadewtkjlaotfdvtjcv` reference in `src/`, `next.config.ts`, `proxy.ts`, `.github`; only `.env.example` tracked; no secret-shaped additions; local-path guard OK; DEV-pinned builds scanned clean (T-6)  |
| Unexpected content                 | none: no Recipes, no Part 2 / multi-org / kiosk code; no temp, debug or local files added; `AGENTS.md` not in the delta                                                                                                               |
| Open PRs                           | none is part of the release (see `RELEASE_INVENTORY.md`); the release source is `development` only                                                                                                                                    |

## Conditions to clear before the release PR is merged (CONDITIONAL GO)

| #   | Condition                                                                                                                                                                                                                                                                                         | Owner          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| C1  | **Owner decisions left open by BI-11** are recorded: (a) export audit log AC-EXP-4 — accept shipping without it (waiver, build later) or build it first (needs a new migration, which would re-open this audit); (b) light-theme contrast tokens — accept current values or approve darker tokens | Owner          |
| C2  | **Backup / restore point confirmed** in the Supabase dashboard for the PROD project, with its timestamp noted (the available token lacks `backups_read`, so native PITR is not verifiable from here)                                                                                              | Owner/operator |
| C3  | **Vercel Production state confirmed**: Production currently serves `main@d08eb4e` READY; Production env vars point at PROD only; Preview/Development at DEV. (Not verifiable in this audit: the Vercel connector required interactive team authorization)                                         | Operator       |
| C4  | **Same-day PROD preflight** re-read: `schema_migrations` still 41 / head `20261026120000`, and a quiet window (no live service, no staff session) — the first attempt of the 2026-10-26 release was paused for exactly this                                                                       | Operator       |
| C5  | **Release PR exact-head checks green** (`application`, `browser-smoke`, `Database / migrations-and-policies`, Vercel Preview) _and_ the 13 migrations applied and verified on PROD **before** the merge (`main` has no branch protection, so nothing else enforces this order)                    | Operator       |
| C6  | Owner **accepts the known open items**: #111 / #113 (automation not repaired — the post-merge `deploy-migrations` run is expected to fail at `supabase link` and apply nothing), #106 (pre-existing creator bypass), #164 (deferred Table Allocation UI checks, folded into the smoke plan)       | Owner          |

None of C1–C6 is a product defect. C1 and C6 are owner decisions; C2–C5 are mechanical checks.

## Residual risks (non-blocking)

- **Migrate-then-merge window:** the old app runs fine on the new schema (additive; `board_assign` keeps its 8-argument signature; the new "same-server repeat" result shows through the old client's generic error path with no mutation; Tasks notification narrowing only _reduces_ rows). The new app on the old schema **fails** (no Bar Inventory tables, no reminder RPC), so the order is fixed: migrations first.
- **Release skew guard (#113) not built:** protection is procedural only (see `CI_CD_AUDIT.md`).
- **`serverActions.bodySizeLimit: 8mb`** (Bar Inventory import) applies app-wide; actions authenticate before heavy work, and Next 16.4.3 carries the Server Actions DoS fix. Accepted in BI-11; keep an eye on the Vercel runtime logs after release.
- Realtime DELETE events are not RLS-filtered (BI-11 note): deletes happen only through service-role teardown, only keys are exposed.

## Release candidate

Audited code state: `development` @ `efd7d4cbcd06a32956ca5d0411687fb2d7f96e12`. The audit docs PR changes documentation only; its merge produces the SHA the owner approves (recorded in `tasks/current-task.md` after merge). T-6 application evidence stays valid because no code changed.

## Next

If approved: a **new session** runs the controlled Production release per `RELEASE_PLAN.md`: preflight → migrations-first → release PR checks → merge commit → Production verification. **`development → main` has NOT been performed.**
