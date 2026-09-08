# Feature 028 — Table Allocation Unrestricted Editing & Date Navigation

**Name:** Table Allocation Unrestricted Editing & Date Navigation  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies `src/features/allocation/` (Features 003, 009, 010, 011) to eliminate remaining role gates on editing assigned tables and cell updates on the live board; adds month/date filtering for historical service sessions.
- **Reconciliation 1 Confirmation:** This is a clean, intentional extension of Feature 011 (which opened cross-column entry writes). It opens editing of already-assigned tables and cell update operations to all active members **on the table allocation board only**. It does NOT weaken, undo, or affect role guards in Schedule, Tips, Payroll, or Team.
- **Session Scope:** One-session build.

## User Outcome

During fast-paced live service, any team member (server, host, busser, manager, owner) can immediately correct, edit, or update an already-assigned table on the allocation board without waiting for a manager. Changes are unconditionally attributed so everyone knows who made the edit. Staff and managers can also navigate backward to view allocation boards from prior service dates or months.

## Scope

- **In:**
  - Reconciliation 1: All active members of the organization can edit, clear, or update any table cell on the live allocation board, including cells that already have assigned tables.
  - Unconditional Attribution: Every table assignment or update records the server-verified `assigned_by = auth.uid()` and logs the actor identity.
  - Temporal Lock Invariant: The board for a service date remains strictly frozen and read-only for everyone (including managers) once tips for that date are finalized.
  - Date & Month Filter:
    - Add date selector and month browser to the allocation board header to view historical allocation sessions.
    - Historical dates where service has concluded display as read-only.
- **Out:**
  - Changing role restrictions in any other operational module (Schedule, Tips, Attendance, Payroll, Team stay role-protected).
  - Loosening administrative board-level commands (e.g. `Clear board` and `Reorder servers` remain manager/owner-only).

## Acceptance Criteria

- [x] Given any signed-in server, they can click into an already-assigned table cell in any column on the live board and update the table number. (New: `TableEntry`'s Edit/Clear controls in `allocation-workspace.tsx` — the backend upsert already supported this via `board_assign`'s own `on conflict ... do update`; the UI had never exposed it. Gated by the same `canWrite` every empty-cell input already used, now also incorporating `readOnly`/`isHistoricalView`.)
- [x] Given an edit made by a server to another server's table, the update succeeds and the attribution log records the true actor's profile ID. (Pre-existing — `board_assign`'s `assigned_by = (select auth.uid())`, both on insert and on the upsert path, plus a `board_events` row stamped with the real `actor_profile_id`. Reconfirmed live via `tests/e2e/allocation-open-editing.spec.ts` and the cross-column edit log's actor name.)
- [x] Given a finalized tip pool for the service date, all inputs on the allocation board are disabled for all users (including managers). (Was **silently broken** for every role except owner, general manager, and shift manager — two independent real bugs, both found live-testing and fixed this feature. First, the RLS policies' own finalized-check subquery on `table_rotation_entries` could not read `tip_pools` under a server's own role. Fixed by `private.is_service_date_tip_finalized`, migration `20260908180000`. Second, `private.assert_board_not_locked` — the RPC-level check every board RPC calls — was declared `security invoker`, not `security definer`, hitting the identical class of bug at the RPC layer for every mutation, including `board_assign`. Fixed by migration `20260908200000`. See the Step 2 and Step 3 investigation notes in `tasks/current-task.md` for the live-tested evidence.)
- [x] Given the date/month filter, selecting a prior date loads that date's historical table allocations in read-only state. (New: `allocation-date-filter.tsx` + `getAllocationContextForDateAction`; `getAllocationContext`'s `service_sessions` lookup no longer filters on `status = 'active'`, so a concluded historical session resolves the same way today's does. Read-only is enforced at both the UI layer — `readOnly = boardLocked || isHistoricalView` — and, after a third real gap found the same way as the two above, at the RPC layer too: `private.assert_board_not_locked` now also blocks a session dated before today, migration `20260908210000`, closing the path a manipulated client could otherwise have used to write to a historical session id the date navigator legitimately hands out.)
- [x] Given the Schedule, Team, Attendance, or Payroll modules, role permissions remain completely unchanged. (Nothing in this feature touches those modules' files, RLS policies, or RPCs — confirmed by `git diff` scope for every commit on this branch.)

## UX Contract

- **Entry point:** Primary nav tab `Table Allocation`.
- **Desktop:** Live grid with date/month picker in sub-header.
- **Mobile:** Horizontal column swiper with touch-accessible table input pills.

## Data & Authorization

- **Tables/columns:** Queries and updates `table_rotation_entries` and `board_events`.
- **Grants/RLS:**
  - RLS policy `table_rotation_entries_update`: allows any authenticated, active member of the restaurant organization to update an entry, provided `tip_pools.status != 'finalized'`.
  - Non-negotiable check: `assigned_by = auth.uid()`.

## Implementation Map

- `src/features/allocation/components/allocation-workspace.tsx` (actual file name; the spec's `allocation-board.tsx` doesn't exist in this codebase — Features 003/009/010/011 already named it `allocation-workspace.tsx`): `TableEntry`'s Edit/Clear controls, `readOnly` flag.
- `src/features/allocation/components/allocation-date-filter.tsx`: Date picker + prev/next-day steppers + Back to today for session history.
- `src/features/allocation/actions/allocation-actions.ts` (actual file name; the spec's `rotation-actions.ts` doesn't exist): `clear-cell` case in `executeBoardActionRemote`, new `getAllocationContextForDateAction`.
- `src/features/allocation/data/allocation-data.ts`: `getAllocationContext`'s optional service date, `serviceDate`/`isHistorical`.
- `supabase/migrations/`: `table_rotation_entries` RLS fix, `board_clear_cell` RPC, `assert_board_not_locked` fixed to `security definer` + extended with the historical-date check.

## Test Plan

- Unit: `rotation-board.test.ts` — any member can overwrite an already-occupied cell (cross-column included) and clear a cell via the pure domain reducer; finalized/historical rejection is enforced server-side (RLS + RPC), not in the pure domain layer, and is covered by pgTAP instead (see below).
- pgTAP (`supabase/tests/database/0013`-`0016`, 27 assertions total across the four new files): the finalized-tips RLS fix, `board_clear_cell`'s own lock and attribution, `assert_board_not_locked`'s `security definer` fix (regression-proofed via `board_assign` itself, not just the new RPC), and the historical-date RPC guard.
- E2E (`tests/e2e/allocation-open-editing.spec.ts`, run across all three Playwright projects): a server edits and clears a teammate's already-assigned table with correct attribution while admin actions stay absent for her; a manager browsing to a previous day sees the board go read-only and Back to today restores it.
