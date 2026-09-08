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

- [ ] Given any signed-in server, they can click into an already-assigned table cell in any column on the live board and update the table number.
- [ ] Given an edit made by a server to another server's table, the update succeeds and the attribution log records the true actor's profile ID.
- [ ] Given a finalized tip pool for the service date, all inputs on the allocation board are disabled for all users (including managers).
- [ ] Given the date/month filter, selecting a prior date loads that date's historical table allocations in read-only state.
- [ ] Given the Schedule, Team, Attendance, or Payroll modules, role permissions remain completely unchanged.

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

- `src/features/allocation/components/allocation-board.tsx`: Cell editing controls, removal of server-disable flags on occupied cells.
- `src/features/allocation/components/allocation-date-filter.tsx`: Month/date picker for session history.
- `src/features/allocation/actions/rotation-actions.ts`: Update table entry action.

## Test Plan

- Unit: Domain tests verifying any member can trigger table updates while finalized dates reject writes.
- E2E: Server signs in, navigates to allocation board, edits a previously assigned table in a teammate's column, and verifies attribution.
