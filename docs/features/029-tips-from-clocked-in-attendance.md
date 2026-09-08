# Feature 029 — Tips from Clocked-In Attendance Roster

**Name:** Tips from Clocked-In Attendance Roster  
**Owner:** Krapa Goutam  
**Status:** approved  
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

- [ ] Given a manager creating a tip split, clicking "Pull clocked-in team" loads the list of employees who currently have active clock-in records for today's date.
- [ ] Given the populated list, the manager can check or uncheck any individual employee before running the calculation.
- [ ] Given a saved or finalized tip split, editing or deleting an attendance clock-in record in the attendance module does NOT change the tip split participants or calculated dollar amounts.
- [ ] Given a database inspection, `tip_pools`, `tip_intervals`, and `tip_allocations` have zero foreign keys to `attendance_records` or payroll tables.
- [ ] Given a server viewing their own tip estimate, their share displays accurately based purely on the snapshotted split.

## UX Contract

- **Entry point:** Primary nav tab `Tip Split` > Manager split workspace.
- **Desktop:** Button above participant checkboxes: "Pull clocked-in team" with tooltip "Populates active clock-ins from attendance as a starting point".
- **Mobile:** Full-width button in the tip configuration card.

## Data & Authorization

- **Tables/columns:** Writes exclusively to `tip_interval_participants` and `tip_allocations`. Reads from `attendance_records` joined with `attendance_identity_links`.
- **Grants/RLS:** Manager/owner write access to tip pools; standard RLS prevents non-managers from initiating or modifying splits.
- **Snapshot Guarantee:** The tip split engine remains pure and deterministic (`calculateTipSplits()`), consuming only explicitly passed in-memory arrays and persisting immutable records.

## Implementation Map

- `src/features/tips/components/tip-workspace.tsx`: Add "Pull clocked-in team" preset button.
- `src/features/tips/data/fetch-clocked-in-roster.ts`: Isolated query fetching current clock-ins via `attendance_identity_links`.
- `src/features/tips/domain/calculate-tip-splits.ts`: Unchanged (pure calculation engine).

## Test Plan

- Unit: Snapshot isolation test — verify that mutating mock attendance data after tip calculation has zero effect on persisted tip interval participants.
- E2E: Manager clicks "Pull clocked-in team", verifies participants, finalizes split, alters an attendance entry, and asserts tip amounts remain unchanged.

