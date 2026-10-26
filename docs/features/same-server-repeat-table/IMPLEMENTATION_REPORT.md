# Implementation report — Same-server repeat table (#166)

Branch `fix/table-allocation-same-server-repeat` → `development` (merge commit). `main` and PROD untouched.

## Root cause

`public.board_assign` refused **any** second active entry of a table for the same server (`PT409 same_server`, even with `p_confirm_transfer`), and the client mirrored the rule (`classifyTableClaim`, `applyBoardAction`). It never asked _which turn_ the new entry was for, so a server legitimately reaching a later rotation turn that is given the same physical table hit a dead end; the only way out was ending the old assignment by hand first.

## Turn identity model

A turn is one board **cell** `(rotation_round_id, rotation_member_id)`; a server's turns are ordered by `rotation_rounds.sequence`. The database compares the target cell with the cell(s) where the same server already holds the table (full audit table in `PLAN.md`):

| Case                            | Result                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| same cell, same canonical label | idempotent no-op (no write, no event, no Undo step)                            |
| held only in earlier turns      | `PT409 same_server_repeat` → dialog; confirm = `board_end_previous_and_assign` |
| held in the same-or-later turn  | `PT409 same_server` (blocked, even if confirmed)                               |
| held by another server          | unchanged `held` conflict (Transfer / End + Assign / Cancel)                   |

No client timer, row index or client-supplied turn number; the round id is validated against the session and its sequence read in the database.

## What changed

- **Migration** `20261026150000_table_allocation_same_server_repeat.sql` (forward-only, no table/column/enum change): `private.end_own_previous_entries`, `private.assign_table(…, p_end_previous)` (former `board_assign` body + turn comparison + idempotent return), `public.board_assign` (same 8-arg signature and grants, thin wrapper), `public.board_end_previous_and_assign` (8 args). Atomic under the session lock; ended entries are kept as history; the `assign` event carries `repeat: true` and lists the ended entries in `displaced`, so **`board_undo` / `board_redo` are unchanged** and replay it.
- **Client:** `classifyTableClaim` → `same-server-repeat`; `useTableClaim` repeat dialog (End Previous + Assign / Cancel, no Transfer; combined assignments named and the extra released tables listed); `BoardAction.assign.endPrevious` → `board_end_previous_and_assign`; demo reducer mirror; `same_server_repeat` conflict mapping (stale client path); Recent Activity copy; `database.generated.ts` entry.
- **Not changed:** Realtime, RLS, grants, cross-server flows, `board_end_and_assign`, undo/redo functions.

## Existing-contract changes (deliberate)

1. A re-submit of the same cell with the identical stored label no longer rewrites `assigned_at`/`assigned_by` or emits an event.
2. "A server never holds the same table twice" is relaxed to "…twice **at the same time**": the same server may hold an ENDED and an ACTIVE entry for one table. The domain-matrix invariant that forbade this was removed (see `TEST_MATRIX.md`).
3. Tests that asserted `same_server` for a later turn now assert `same_server_repeat` (listed in `TEST_MATRIX.md`).

## Security review

| Check                 | Result                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_path`         | `''` on all new/replaced functions; schema-qualified                                                                                                                          |
| Execution             | `private.*` revoked from public/anon/authenticated (pgTAP 0032); `board_end_previous_and_assign` `authenticated` only                                                         |
| AuthN/Z / tenancy     | unchanged `private.begin_board_write`: `auth.uid()`, active floor-team membership, session/tenant validation, historical-date lock; outsider/no-JWT → `42501` (pgTAP, hosted) |
| Forged previous state | previous entries are read from locked rows in the same transaction; the client sends only the target round and label                                                          |
| Atomicity             | mixed repeat + another server's table: refused with `held`, whole call rolls back, previous entry stays active (pgTAP, hosted)                                                |
| One active claim      | partial unique index + occupancy trigger; ended first, then inserted; concurrent confirmed repeats serialize (hosted)                                                         |

## Validation evidence (actual totals)

| Layer                                                                                                                          | Result                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`, `eslint --max-warnings=0`, `tsc --noEmit`                                                              | clean                                                                                                                                 |
| Vitest (all)                                                                                                                   | **746 / 746** (74 files)                                                                                                              |
| pgTAP new file `0032` (local Postgres 17, repo migrations + new one)                                                           | **75 / 75**; existing 0019, 0021, 0022, 0025, 0030, 0031 unchanged and passing (16 + 31 + 40 + 46 + 35 + 58)                          |
| Demo Playwright, full suite, 3 projects (desktop, host-tablet, server-mobile)                                                  | **549 / 549** (includes the new XM-070…074 and reworked XM-016/020 scenarios)                                                         |
| Hosted DEV DB suites (real JWTs through PostgREST): same-server-repeat (14), conflicts, canonical, Table Rotation V2, Tasks V1 | **92 / 92** (5 files)                                                                                                                 |
| Hosted DEV UI on a **production build** pinned to DEV (PROD ref in `.next`: 0 files)                                           | cross-view-integrity **13/13** (new SS-002 and SS-008 incl. reload + blocked-Realtime stale browser); cross-view + extended **15/15** |
| CI (exact head)                                                                                                                | see PR                                                                                                                                |

Notes: the first hosted UI draft of SS-008 failed only because the live client's Floor assign and the stale client's Grid entry targeted the **same** cell (correctly an idempotent retry); the test now waits for settled state and types into the exact freed cell. The local pgTAP run used a scratch local Postgres container (no PROD/DEV data).

## Safety statement

```
DEV touched: YES (migration 20261026150000 applied via the Management API + schema_migrations row; hosted suites create/delete their own synthetic org)
PROD touched: NO
PROD migrations: NO
main merged: NO
```

## Rollback

App: promote the previous deployment (new schema is compatible: `board_assign` only gains the `same_server_repeat` kind, which an old client shows through its generic error path with no mutation). Database: forward corrective migration restoring the 20261026120000 `board_assign` body; never a destructive revert. PROD receives the migration only through the normal migrations-first release.
