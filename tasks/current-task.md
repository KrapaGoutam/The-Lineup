# Current Task: Feature 028 — Table Allocation Unrestricted Editing & Date Navigation

**Active Spec:** `docs/features/028-table-allocation-unrestricted-editing.md`
**Branch:** `feature/028-table-allocation-unrestricted-editing` (stacked on `feature/024-team-management-enhancements`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Reconciliation 1 (any active member may edit/clear/update any table cell on
the live board, cross-column, unconditionally attributed) is a **clean
extension of Feature 011** — confirmed below, not a weakening of any role
guard elsewhere. Investigation before coding found most of the backend
already built this way; the real remaining work is: (1) the UI never
exposed an edit control for an _already-assigned_ cell at all, (2) date/
month navigation to historical boards doesn't exist, and (3) one real,
previously-untested RLS gap in the temporal lock. Schedule, Tip Split,
Attendance, Payroll, and Team are untouched by this feature.

## 📖 Investigation findings (what's already built vs. what's real work)

**Already fully implemented (verified by reading the actual migrations,
not assumed from the spec text):**

1. **Cross-column, any-active-member writes to empty cells** — Feature 011. `mayWriteColumn()` (`rotation-board.ts`) always returns `true`;
   `table_rotation_entries_insert_any_member` RLS allows any active
   member.
2. **Unconditional attribution** — `board_assign`'s RPC always writes
   `assigned_by = (select auth.uid())`, both on INSERT and on the
   `on conflict ... do update` path. Every `board_*` RPC also inserts an
   `actor_profile_id`-stamped row into the existing `board_events` table.
3. **`board_assign` is already an upsert** (`on conflict (rotation_round_id,
rotation_member_id) do update set table_label = excluded.table_label,
assigned_by = excluded.assigned_by`) — the backend already fully
   supports editing an occupied cell. Nothing to add server-side for
   "update an assigned table."
4. **Every `board_*` RPC calls `private.assert_board_not_locked()`
   before writing anything** — the RIGHT idea (one shared check, called
   from every mutation path), but see gap 3 below: that function's own
   implementation was broken until this feature fixed it.
5. **Admin-only actions** (`Clear board`/`Clear row`/`Clear column`/
   `Add row`, "reorder" = `move-column`) — already gated by
   `private.assert_is_board_manager()` (owner/general_manager/
   shift_manager/host) at the RPC level, in addition to the UI's
   `isManager` gate. Confirmed **unchanged** by this feature.
6. **Designation hierarchy tests** (`0007_allocation_board_rpcs.test.sql`,
   28 assertions) already cover the manager-only split. No changes
   needed there.

**Real gaps — the actual work of this feature:**

1. **`TableEntry` (`allocation-workspace.tsx`) has no edit control for an
   occupied cell at all.** Once a cell has a value it renders a static
   "Table X — Recorded" badge with no input, for anyone, manager
   included. The backend already supports the write (#3 above); only the
   UI needs a click-to-edit affordance. This is acceptance criterion 1's
   actual gap.
2. **No per-cell "clear" exists.** Only bulk `clear-row`/`clear-column`/
   `clear-board` (manager-only) exist. The spec's scope explicitly says
   "edit, **clear**, or update any table cell" — adds one new
   `clear-cell` `BoardAction` + `board_clear_cell` RPC, gated by
   `assert_board_not_locked` only (no manager check — matches
   Reconciliation 1, unlike the four bulk actions in gap 5 above which
   stay manager-only on purpose).
3. **Real, more serious bug than initially scoped, found live-testing
   against the local database as a plain server (not assumed from
   reading SQL text alone).** The insert, update, and delete policies on
   `table_rotation_entries` from migration `20260906144901` each try to
   lock the row once tips are finalized by checking, in a subquery, that
   no matching `tip_pools` row has `status = finalized`. That check is
   just a SELECT, so it is itself subject to RLS on the `tip_pools`
   table. The `tip_pools` SELECT policy only allows the owner, general
   manager, or shift manager roles to read it.

   The consequence: for a plain server or host, that subquery's join to
   `tip_pools` returns zero rows no matter the pool's real status, so
   the "not finalized" check always passes. The finalized-lock is
   silently inert for exactly the roles it matters most for, and this
   was true for insert and update as well, not only delete.

   Confirmed directly in a live psql session against the local Supabase
   instance: signed in as a seeded server profile, a delete, an update,
   and an insert against a finalized day's `table_rotation_entries` all
   succeeded, bypassing every RPC.

   Fixed with one new security-definer helper function (same pattern
   already used elsewhere in this schema for "a policy needs to see
   into a table the caller can't directly read") that all three
   policies now call instead of the broken inline subquery. The new
   per-cell clear action (gap 2 above) depends on the delete policy
   directly, which makes this fix load-bearing for this feature, not
   just a pre-existing bug fixed in passing.

   **This was step 2's understanding. Step 3 found the fix above was
   necessary but not sufficient**: `private.assert_board_not_locked`,
   the function every `board_*` RPC calls as its own independent lock
   check, turned out to have the identical bug — declared `security
invoker`, so its own SELECT against `tip_pools` was equally subject
   to `tip_pools_select_manager`, silently defeating the RPC-level
   guard for a plain server or host too, for every `board_*` RPC at
   once (`board_assign` included, the single most-used one). In
   practice, the temporal lock has only ever worked for
   owner/general_manager/shift_manager. See step 3's own notes below
   for the second fix.

4. **Date/month navigation doesn't exist at all.**
   `getAllocationContext` hardcodes `service_date = today` and
   `status = 'active'` — there is no way to view any other date's board,
   historical or otherwise.

## 🔒 Non-negotiable constraints

- Schedule, Tips, Attendance, Payroll, Team stay exactly as role-gated as
  they already are — nothing in this feature touches those modules.
- `Clear board`/`Clear row`/`Clear column`/`Add row`/reorder
  (`move-column`) stay manager/owner/host-only, at both the RPC level
  (unchanged) and the UI level (unchanged) — only the NEW `clear-cell`
  action is open to any active member, matching Reconciliation 1's
  explicit "cell" scope, not the bulk actions' scope.
- No reason field/mechanism anywhere on the allocation board (unchanged;
  the codebase already made this call for Feature 011, twice — see
  `TableEntry`'s own comment).
- Occupied-table edits and the new clear-cell action are refused
  identically whether tips are finalized for that date OR the viewed
  date is historical (not today) — both are read-only locks, for
  everyone, no role exception.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app code.
- [x] **Step 2: Fix the RLS finalized-lock gap (all three policies) + pgTAP test**
  - [x] New migration
        (`20260908180000_table_rotation_entries_finalized_lock_rls_fix.sql`):
        new `private.is_service_date_tip_finalized(organization_id,
rotation_round_id)` `SECURITY DEFINER` function; replaces the
        raw `not exists(...)` clause in `table_rotation_entries_insert_
any_member`, `_update_any_member`, and `_delete_any_member`
        (originally only planned to touch DELETE — investigation while
        writing the test found the bug was real for all three, not just
        DELETE; see the finding above).
  - [x] `supabase/tests/database/0013_table_rotation_entries_finalized_lock_rls_fix.test.sql`
        (8 assertions): confirms a server genuinely cannot SELECT
        `tip_pools` directly (the precondition); insert/update/delete
        all succeed while draft; all three are blocked once finalized,
        as a server specifically (not owner/manager); the entry is
        provably untouched after the blocked attempts.
  - [x] `npm run db:reset && npm run db:test` — 13/13 pgTAP files,
        187 assertions, run for real against the local Supabase
        instance. `npm run db:types` regenerated with zero net diff
        (the new function is `private`, never exposed to PostgREST).
  - [x] `npm run check`, `npm test`, `npm run build`.
- [x] **Step 3: `clear-cell` action — domain, RPC, wiring**
  - [x] `rotation-board.ts`: new `{ type: "clear-cell"; roundId: string;
columnId: string }` `BoardAction` variant + `applyBoardAction`
        case (finds the round+column cell and nulls its `tableLabel`,
        matching `clear-row`'s own convention). 4 new unit tests in
        `rotation-board.test.ts`, including one proving the pure domain
        layer already supports overwriting an occupied cell (the shape
        the click-to-edit UI in Step 4 relies on) and one for
        clear-cell-on-an-already-empty-cell as a safe no-op.
  - [x] New migration `20260908190000_board_clear_cell.sql`:
        `board_clear_cell(p_organization_id, p_service_session_id,
p_round_id, p_member_id)` RPC — calls `assert_board_not_locked`
        only (deliberately no `assert_is_board_manager`), deletes the
        one `table_rotation_entries` row, logs a `board_events` row
        with an `inverse_payload` for undo, matching the shape of
        `board_clear_row`/etc. Adds the `clear_cell` value to the
        `board_event_type` enum.
  - [x] **Second real bug, found live-testing this exact RPC, more
        serious than Step 2 alone fixed**:
        `private.assert_board_not_locked` — the function every single
        `board_*` RPC calls to enforce the finalized-tips lock — is
        declared `security invoker`, not `security definer`, despite
        its own comment claiming independent enforcement. Being
        invoker, its own SELECT against `tip_pools` is itself subject
        to `tip_pools_select_manager`, the exact same class of bug
        fixed in Step 2, except this one silently defeats the lock for
        _every_ `board_*` RPC at once (`board_assign` included — the
        single most-used one), not just raw `table_rotation_entries`
        writes. Confirmed live: as a plain server, calling
        `assert_board_not_locked` directly against a finalized session
        raised nothing; the identical call as postgres correctly
        raised. In practice, the "temporal lock invariant" has only
        ever been enforced for owner/general*manager/shift_manager —
        the one role class Feature 028's own criterion says must
        \_also* be locked out, "including managers," has worked, while
        the roles that actually needed the RPC-level check most were
        silently exempt. New migration
        `20260908200000_assert_board_not_locked_security_definer.sql`
        makes it `security definer`, matching every other cross-table
        RLS-aware helper in this schema.
  - [x] `supabase/tests/database/0014_board_clear_cell.test.sql` (6
        assertions): `board_clear_cell` exists, is `SECURITY INVOKER`;
        one active server clears a cell in a _different_ server's
        column (not a manager, not the column owner — Reconciliation
        1); the clear is attributed to the true actor; a finalized
        board blocks it.
  - [x] `supabase/tests/database/0015_assert_board_not_locked_security_definer.test.sql`
        (4 assertions): confirms the function is now `security
definer`; a plain server's `board_assign` call — the real-world
        regression proof, not just the new RPC — is now correctly
        blocked on a finalized day, and leaves nothing written.
  - [x] `allocation-actions.ts`: `clear-cell` case in
        `executeBoardActionRemote`. No changes needed in
        `allocation-workspace.tsx`'s `execute()` — it already dispatches
        every `BoardAction` variant generically.
  - [x] `npm run db:reset && npm run db:test`: 15/15 pgTAP files, 197
        assertions. `npm run db:types`: zero net diff against the
        committed, `--linked` (remote-tracked) convention — confirmed
        harmless: this app's Supabase client isn't constructed with a
        `Database` generic at all, so `.rpc()` calls (including the new
        `board_clear_cell`) aren't type-checked against generated
        types either way.
  - [x] `npm run check`, `npm test` (195/195), `npm run build`.
- [ ] **Step 4: Click-to-edit for occupied cells (the actual UI gap)**
  - [ ] `TableEntry`: an occupied cell becomes clickable (not just a
        static badge) — click reveals the same input, pre-filled with
        the current value, editable by anyone `canWrite` already allows
        (no new role logic — reuses the exact `canWrite`/`disabled`
        computation already gating empty-cell entry). Adds a small Clear
        control alongside it, wired to the new `clear-cell` action.
  - [ ] Live Playwright smoke test: a server edits an already-assigned
        cell in a teammate's column; roster/board reflects the new value
        and the existing cross-edit log entry appears (unchanged
        mechanism, `isCrossColumnEdit`).
  - [ ] Full gate.
- [ ] **Step 5: Date & month navigation**
  - [ ] `allocation-data.ts`: `getAllocationContext` takes an optional
        `serviceDate` (defaults to today); the `service_sessions` lookup
        drops the `status = 'active'` filter (already scoped uniquely
        enough by `location_id + service_date + meal_period`, ordered
        defensively) so a historical **closed** session is found the
        same way today's active one is. Adds `serviceDate` and
        `isHistorical` to `AllocationContext`.
  - [ ] `allocation-actions.ts`: new client-triggered
        `getAllocationContextForDateAction({ restaurantSlug,
serviceDate })` (mirrors Attendance's own client-triggered read
        pattern) — rejects a future date with a clear error rather than
        silently returning an empty board.
  - [ ] `src/features/allocation/components/allocation-date-filter.tsx`
        (new, matches the spec's own Implementation Map name): a date
        input + previous/next-day steppers + "Back to today", max-date
        clamped to today.
  - [ ] `allocation-workspace.tsx`: wires the filter in; any date other
        than today forces the same read-only rendering `boardLocked`
        already produces (`canWrite` becomes `... && !isHistorical`),
        regardless of role — no admin action, no cell edit, no
        clear-cell.
  - [ ] **Demo mode scoping decision**: demo mode has no multi-day
        historical data model (the board is pure client-side, in-memory,
        undated) — matches the established precedent (Payroll is simply
        absent in demo mode) rather than fabricating fake historical
        data. Selecting a non-today date in demo mode shows a clear
        "Demo mode only shows today's board" state instead of an empty
        board that looks like a real (if uneventful) historical day.
  - [ ] `restaurant-operations-app.tsx`: thread the new action through
        as a prop, same shape as the other allocation handlers.
  - [ ] Live Playwright smoke test: selecting a prior date renders the
        board read-only.
  - [ ] Full gate.
- [ ] **Step 6: E2E flow** (`tests/e2e/allocation-open-editing.spec.ts`)
  - [ ] A server signs in, edits an already-assigned table in a
        teammate's column, and the change is visible (attribution is
        server-side/audit-log only, not asserted in the UI beyond the
        existing cross-edit note already shown).
  - [ ] Administrative actions (`Clear board`, move/reorder) remain
        absent/inert for a server — regression guard, unchanged
        behavior.
  - [ ] Selecting a historical date renders the board read-only (no
        input controls).
  - [ ] Run across all three Playwright projects.
- [ ] **Step 7: Docs**
  - [ ] Check off acceptance criteria in
        `docs/features/028-table-allocation-unrestricted-editing.md`,
        each noting already-implemented vs. newly-built.
  - [ ] Update `docs/STATUS.md` Feature Matrix.
- [ ] **Step 8: Push branch, open PR (base:
      `feature/024-team-management-enhancements`), paste gate output +
      PR link here.**

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `supabase/migrations/20260908180000_table_rotation_entries_finalized_lock_rls_fix.sql` (new)
- `supabase/tests/database/0013_table_rotation_entries_finalized_lock_rls_fix.test.sql` (new)
- `supabase/migrations/<ts>_board_clear_cell.sql` (new)
- `supabase/tests/database/0014_board_clear_cell.test.sql` (new)
- `src/features/allocation/domain/rotation-board.ts` (`clear-cell` action)
- `src/features/allocation/domain/rotation-board.test.ts` (new tests)
- `src/features/allocation/actions/allocation-actions.ts` (`clear-cell`, date-fetch action)
- `src/features/allocation/data/allocation-data.ts` (`serviceDate`/`isHistorical`)
- `src/features/allocation/components/allocation-date-filter.tsx` (new)
- `src/features/allocation/components/allocation-workspace.tsx` (click-to-edit, date wiring)
- `src/components/restaurant-operations-app.tsx` (prop wiring)
- `tests/e2e/allocation-open-editing.spec.ts` (new)
- `docs/features/028-table-allocation-unrestricted-editing.md` (checkboxes)
- `docs/STATUS.md` (milestone update)

## Current State & Next Step

Branch created, this file committed. Next: Step 2 (DELETE RLS gap fix +
pgTAP test).
