# Current Task Handoff

## Current cycle

Vendor Order Drafts V1

## Current phase

VOD-1 — database/domain foundation

## Git and tracking

- Branch: `feature/bar-order-drafts-v1-foundation`
- HEAD: `fe69c1391902ef7dee1a62f7f0931846af341e28`
- Base `development` HEAD: `fe69c1391902ef7dee1a62f7f0931846af341e28`
- Base verification: `origin/development` is an ancestor of the feature branch; merge base is `fe69c13`
- Issue: #190
- PR: none yet
- Project: #4
- Milestone: Future Product Backlog (confirm before PR/tracking update)

## Completed

- [x] Read the continuation request and repository `AGENTS.md`.
- [x] Read the VOD-0 `PLAN.md`, `ACCEPTANCE_CRITERIA.md`, and `TEST_MATRIX.md`.
- [x] Read `docs/STATUS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/DATA_MODEL.md`.
- [x] Read the restaurant feature, Supabase, and Supabase Postgres best-practice skills and relevant schema/RLS/concurrency references.
- [x] Checked current Git state on the parked Tasks branch: clean at `03d5d45519b66e546141cb72473cbde268ef2125`.
- [x] Fetched all remotes with prune.
- [x] Confirmed `origin/development` contains the handoff merge and is exactly `fe69c1391902ef7dee1a62f7f0931846af341e28`.
- [x] Created `feature/bar-order-drafts-v1-foundation` directly from fresh `origin/development`.
- [x] Confirmed the parked Tasks local and remote refs still point to `03d5d45519b66e546141cb72473cbde268ef2125`.

## In progress

- [x] Inspect targeted Bar Inventory migration, authorization, RPC, RLS, pgTAP, and pure-domain conventions.
- [x] Finalize the smallest VOD-1 schema/RPC/domain contract that exactly implements the approved VOD-0 plan.
- [x] Replay the new migration locally and make the focused pgTAP contract green.
- [x] Implement and test the pure TypeScript domain core.
- [x] Run targeted format, lint, typecheck, unit, and focused database checks.
- [x] Run the full database and unit-test gates.
- [x] Run full `npm run check` and `npm run build`.

## Not started

- [x] Author meaningful VOD-1 pgTAP contracts first.
- [x] Create the additive VOD-1 migration.
- [x] Implement the pure `order-draft.ts` domain core and unit vectors.
- [x] Regenerate Supabase database types from the fully replayed local schema.
- [x] Run targeted and required repository validation.
- [x] Complete the independent security/tenant-isolation review; all ten findings are resolved and covered by the focused contract.
- [x] Complete the final accidental-file and scope audit; `AGENTS.md`, package files, environment files, and the parked Tasks refs are unchanged.
- [ ] Commit, push, open PR to `development`, update issue/project/milestone tracking, and monitor exact-head CI.
- [ ] Merge with a merge commit only after exact-head application and database CI are green.
- [ ] Synchronize development, local docs, GitHub tracking, and this handoff; stop before VOD-2.

## Locked product decisions

- Suggested quantity is a read-only snapshot and is never overwritten by `order_qty`.
- `order_qty` is manager-entered `numeric(12,2)`; blank is undecided and zero is valid but omitted from vendor-facing output.
- Drafts support item notes, a vendor note, and included/excluded lines.
- At most one `DRAFT` exists per organization + location + vendor, enforced by a partial unique index.
- V1 statuses are only `draft` and `sent`.
- The stable system `Unassigned` vendor cannot have a draft.
- Owner, Manager, and Assistant Manager are allowed; Staff is denied at the database boundary.
- Mark Sent records an external send, freezes history, and never mutates stock or the adjustment ledger.
- SENT drafts and items are immutable except tenant-teardown cascades.
- No UI, export, clipboard, messaging, hosted-DEV product-data mutation, or VOD-2 work belongs in this phase.

## Architecture decisions

- Two tables: `inventory_order_drafts` and `inventory_order_draft_items`.
- RPC-authoritative writes; authenticated clients receive SELECT only under RLS.
- Six planned RPCs: `inventory_order_draft_open`, `inventory_order_draft_save`, `inventory_order_draft_fill`, `inventory_order_draft_clear`, `inventory_order_draft_sync`, `inventory_order_draft_mark_sent`.
- Every mutation uses draft-level optimistic concurrency and `PT409` stale details; a true no-op does not bump the version.
- `open` is retry-safe and race-safe through the database uniqueness invariant.
- Privileged functions use an empty `search_path`, schema-qualified objects, verified session identity, and existing membership/location authorization helpers.
- Pure TypeScript owns deterministic fill/clear/totals/editability rules; SQL and TypeScript share vectors where appropriate.

## Schema

Created in the VOD-1 migration: `inventory_order_drafts` and `inventory_order_draft_items`, with composite tenant/location foreign keys, partial active-draft uniqueness, snapshot fields, draft-level versioning, Sent consistency, and immutable Sent history triggers.

## Migrations

Created and replayed successfully from a clean local database: `supabase/migrations/20261027195142_bar_inventory_order_drafts.sql`.

The migration was created with `supabase migration new bar_inventory_order_drafts`, not by inventing a timestamp. It has not been applied to hosted DEV or PROD.

## RPCs

Implemented and focused-pgTAP verified: `inventory_order_draft_open`, `inventory_order_draft_save`, `inventory_order_draft_fill`, `inventory_order_draft_clear`, `inventory_order_draft_sync`, and `inventory_order_draft_mark_sent`. All six use the existing `private.inventory_begin` authorization seam, lock the exact organization/location draft, derive actors from `auth.uid()`, and pin an empty `search_path`.

## RLS/security

- Implemented: RLS enabled on both public tables; revoke all from `public`, `anon`, and `authenticated`; grant SELECT to `authenticated`; explicit tenant/location management policies; no direct client writes.
- Authorization source: authenticated identity plus live membership/location rows only. No user-editable metadata.
- Current Supabase guidance reviewed on 2026-10-27: explicit grants are required for newly created tables; `SECURITY DEFINER` functions must pin an empty `search_path` and narrow EXECUTE privileges.

## Concurrency

Implemented draft-level `version` starting at 1. Every mutation takes `p_expected_version`; stale writes raise `PT409` with the existing repository detail shape and apply nothing. The partial active-draft unique index and retry-safe open RPC enforce one open draft per organization/location/vendor. The focused pgTAP contract dispatches simultaneous opens through two independent password-authenticated Postgres backends and proves both callers receive the same non-null draft while exactly one active row persists.

## DEV migration/schema state

- DEV touched in VOD-1: NO.
- VOD-1 migration applied to the disposable local test database only. It has not been applied to hosted DEV or PROD.
- Hosted DEV product data has not been changed.

## Tests

- pgTAP: `0039_bar_inventory_order_drafts.test.sql` written first. Pre-migration run RED as required. Full local migration replay PASS three times (including after security-review hardening). Focused VOD pgTAP PASS, 88/88. Full database suite PASS, 39 files / 1121 assertions.
- Unit: focused `order-draft.test.ts` PASS, 18/18. Full Vitest PASS, 105 files / 1424 tests.
- Lint: affected TypeScript files PASS.
- Format: affected formatted files PASS. SQL is validated by migration replay/pgTAP; this repository has no SQL Prettier parser.
- Typecheck: full `next typegen && tsc --noEmit` PASS.
- Repository check: full `npm run check` PASS (format, ESLint, Next type generation, TypeScript).
- Build: full `npm run build` PASS (Next.js 16.4.3; all 13 pages generated).
- Database lint: `supabase db lint --local --level error --fail-on error` PASS.
- Migration history: local and remote-history columns both contain `20261027195142` in the disposable local stack.
- Playwright: not run because VOD-1 has no UI, Route Handler, or Server Action changes.
- CI: no VOD-1 PR yet.
- Last inherited green evidence: dependency PR #188 — Vitest 1406/1406; Playwright desktop 241, host-tablet 241, server-mobile 239 + 2 intentional skips.

## GitHub checks

No VOD-1 PR or checks yet. Database and normal application CI must both be green on the exact VOD-1 head before merge.

## Known issues

- `docs/STATUS.md` and the old handoff contain stale historical status prose; update only the VOD-1 sections in this phase.
- The local sandbox cannot write `.git` without command approval; `git fetch` required the approved elevated command path.
- The Supabase changelog notes that new public tables stop being automatically exposed to Data/GraphQL APIs on 2026-10-30; VOD-1 will use explicit grants regardless.

## Uncommitted files

- `tasks/current-task.md`
- `supabase/tests/database/0039_bar_inventory_order_drafts.test.sql`
- `supabase/migrations/20261027195142_bar_inventory_order_drafts.sql`
- `src/features/bar-inventory/domain/order-draft.ts`
- `src/features/bar-inventory/domain/order-draft.test.ts`
- `src/types/database.generated.ts` — regenerated from the local full migration replay; includes previously missing Bar Inventory types as well as VOD-1.
- `supabase/tests/database/0033_bar_inventory_catalog.test.sql` — preserves that legacy test's original catalog-RPC scope now that VOD adds six separate RPCs.
- `docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md`
- `docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md`
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `tasks/backlog.md`

## Running processes/background jobs

Local Docker Desktop and the repository Supabase stack were started for pgTAP. No app/dev/Playwright process was started.

## Docs updated

- `tasks/current-task.md` updated at VOD-1 start and branch creation.
- `docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md` records VOD-1 implemented and VOD-2 next.
- `docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md` records the VOD-1 schema, RPC, security, domain, inventory-isolation, evidence, and deferrals.
- `docs/STATUS.md`, `docs/ROADMAP.md`, and `tasks/backlog.md` are synchronized to VOD-1 implemented / VOD-2 next without starting VOD-2.

## Roadmap status

- VOD-0 COMPLETE.
- VOD-1 IMPLEMENTED LOCALLY; PR/CI/MERGE IN PROGRESS.
- VOD-2, VOD-3, VOD-4 NOT STARTED.
- Tasks T-1 PARKED; T-2 through T-6 NOT STARTED.

## Backlog status

No new VOD-1 deferrals identified yet. Existing future procurement items remain out of scope.

## Tasks T-1 PARKED

Branch:
`feature/tasks-v1-1-default-landing`

Commit:
`03d5d45`

PR:
none

Merged:
NO

Do not resume until Vendor Order Drafts V1 reaches VOD-4 completion.

## Safety ledger

```text
development merged: NO (VOD-1)
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## Exact next command

```powershell
git add docs/ROADMAP.md docs/STATUS.md docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md docs/features/bar-inventory-vendor-order-drafts-v1/IMPLEMENTATION_REPORT.md src/features/bar-inventory/domain/order-draft.ts src/features/bar-inventory/domain/order-draft.test.ts src/types/database.generated.ts supabase/migrations/20261027195142_bar_inventory_order_drafts.sql supabase/tests/database/0033_bar_inventory_catalog.test.sql supabase/tests/database/0039_bar_inventory_order_drafts.test.sql tasks/backlog.md tasks/current-task.md
```

## Exact next action

Stage only the audited VOD-1 file set, inspect the staged diff summary, and commit the green foundation.

## Read first

1. `tasks/current-task.md`
2. `docs/features/bar-inventory-vendor-order-drafts-v1/PLAN.md`
3. `docs/features/bar-inventory-vendor-order-drafts-v1/ACCEPTANCE_CRITERIA.md`
4. `docs/features/bar-inventory-vendor-order-drafts-v1/TEST_MATRIX.md`

## DO NOT

- Do not touch `main`, PROD, or the parked Tasks branch.
- Do not start VOD-2, create a VOD-2 branch, or implement UI/export/sharing.
- Do not delete or modify hosted DEV product data, including V2 Harness organizations.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- Do not include an unrelated `AGENTS.md` heading change.
