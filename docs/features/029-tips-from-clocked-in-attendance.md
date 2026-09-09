# Feature 029 — Tips from Clocked-In Attendance Roster

**Name:** Tips from Clocked-In Attendance Roster  
**Owner:** Krapa Goutam  
**Status:** complete  
**Issue/PR:**

## Classification & Session Scope

- **Category:** NEW FEATURE
- **Modifies vs Adds:** Modifies `src/features/tips/` (Feature 004) to add a one-click action that presets the tip interval participant list from currently active attendance clock-ins; adds read-only adapter query against `attendance_records`.
- **Reconciliation 2 & Architectural Hard Boundary:**
  - **Zero shared tables, zero shared ledgers, zero derived calculations.**
  - Attendance data is read solely as an initial suggestion / input preset at the moment a split is created.
  - **Strict Snapshotting:** The participant list is snapshotted and frozen directly into `tip_interval_participants` at split creation/finalization. Subsequent attendance adjustments (e.g. manual manager clock corrections or Neon sync updates) **MUST NEVER** alter or move a completed or in-progress tip split.
  - Tips and Payroll remain completely disconnected: no tip dollar ever derives from payroll, and no payroll figure ever derives from tips.
- **Session Scope:** Own-session build.

## User Outcome

When creating a tip split at shift change or closing, a manager can click "Pull clocked-in team" to automatically populate the participant roster with staff members who are currently clocked in per the attendance system. The manager retains full control to check or uncheck individuals before calculating. Once saved or finalized, the participant snapshot is permanently frozen and immune to subsequent attendance changes.

## Scope

- **In:**
  - "Pull clocked-in team" button in `tip-workspace.tsx`.
  - Read-only query fetching active clock-ins (open shifts where `clock_out IS NULL` and `work_date = current_date`, or shifts overlapping the tip interval) resolved to profile IDs via `attendance_identity_links`.
  - Manager review step: participants are presented with checkboxes so the manager can manually add or exclude team members before confirming.
  - Snapshot persistence: Selected participants are written directly into `tip_interval_participants` rows.
  - Immutability: Once finalized, the split is immutable; background attendance modifications have zero effect on past tip pools.
- **Out:**
  - Automatic background synchronization between attendance clock-outs and finalized tip amounts.
  - Combining tip earnings into payroll paychecks or sharing payroll ledgers.

## Acceptance Criteria

- [x] Given a manager creating a tip split, clicking "Pull clocked-in team" loads the list of employees who currently have active clock-in records for today's date. (New `getActiveClockedInRows` in `attendance-data.ts` — `clock_in is not null and clock_out is null and auto_clocked_out = false` for the caller's own already-computed service date — resolved to profile ids via `attendance_identity_links` in the new `fetch-clocked-in-roster.ts`, exposed through `getClockedInRosterAction`. Live-verified: linking two people to the two Neon users with an open shift and clicking "Pull clocked-in team" checked exactly those two, replacing the prior default.)
- [x] Given the populated list, the manager can check or uncheck any individual employee before running the calculation. (The participant checkboxes are now controlled state — check/uncheck works identically whether the current selection came from the original default or from a pull.)
- [x] Given a saved or finalized tip split, editing or deleting an attendance clock-in record in the attendance module does NOT change the tip split participants or calculated dollar amounts. (**Already true before this feature touched anything** — confirmed reading the migration directly: `tip_allocations`/`tip_intervals`/`tip_interval_participants`'s own insert/update/delete RLS policies, and `recalculate_tip_pool()` itself, all key on the parent `tip_pools.status = 'draft'`; a finalized pool's rows are already unreachable to any write. Live-verified by fully unlinking a participant's attendance record after finalizing and confirming the split stayed exactly $50/$50/$100, both from the manager's view and from that person's own signed-in estimate.)
- [x] Given a database inspection, `tip_pools`, `tip_intervals`, and `tip_allocations` have zero foreign keys to `attendance_records` or payroll tables. (**Already true** — `20260905125418_operational_modules.sql`'s own header comment already states this invariant explicitly; no `attendance_records` table exists anywhere in this codebase in the first place, see Investigation #6.)
- [x] Given a server viewing their own tip estimate, their share displays accurately based purely on the snapshotted split. (Unchanged, pre-existing behavior — live-verified as part of the same frozen-snapshot check above: Mia Chen's own "My tip estimate" showed $50.00, identical to the manager's view.)

## UX Contract

- **Entry point:** Primary nav tab `Tip Split` > Manager split workspace.
- **Desktop:** Button above participant checkboxes: "Pull clocked-in team" with tooltip "Populates active clock-ins from attendance as a starting point".
- **Mobile:** Full-width button in the tip configuration card.

## Data & Authorization

- **Tables/columns:** Writes exclusively to `tip_interval_participants` and `tip_allocations`. Reads from `attendance_records` joined with `attendance_identity_links`.
- **Grants/RLS:** Manager/owner write access to tip pools; standard RLS prevents non-managers from initiating or modifying splits.
- **Snapshot Guarantee:** The tip split engine remains pure and deterministic (`calculateTipSplits()`), consuming only explicitly passed in-memory arrays and persisting immutable records.

## Implementation Map

- `src/features/tips/components/tip-workspace.tsx`: Added "Pull clocked-in team" preset button; participant checkboxes became controlled state.
- `src/features/tips/data/fetch-clocked-in-roster.ts`: Isolated query fetching current clock-ins via `attendance_identity_links`.
- `src/features/tips/actions/tips-actions.ts`: New `getClockedInRosterAction` (not in the original map — the entry point a client component actually calls into).
- `src/features/attendance/data/attendance-data.ts`: New `getActiveClockedInRows` (not in the original map — the actual Neon query; no `attendance_records` table exists, see Investigation #6).
- `src/features/tips/domain/calculate-tip-splits.ts`: Unchanged (pure calculation engine) — a new regression test added instead, proving it stays unaffected by mutating its input after returning.

## Test Plan

- Unit: Snapshot isolation test — verify that mutating mock attendance data after tip calculation has zero effect on persisted tip interval participants.
- E2E: Manager clicks "Pull clocked-in team", verifies participants, finalizes split, alters an attendance entry, and asserts tip amounts remain unchanged.
