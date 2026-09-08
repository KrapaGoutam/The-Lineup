# Feature 025 — Attendance Reporting & Filters

**Name:** Attendance Reporting & Filters  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies `src/features/attendance/` components (from Features 018 and 019) to add month/year navigation, calendar day computation, print stylesheets, multi-select export, CSV import, and single-user summary cards.
- **Contradiction Flags:** The mockup displays "Name (Designation)" (e.g. "Anil (Server)" and "Anil (Host)"). This is strictly for visual presentation and disambiguation. **All records and filters key strictly on the manual `attendance_identity_links` UUID pairings from Feature 019 — never on name strings.**
- **Session Scope:** Own-session build.

## User Outcome

Managers and servers get an enhanced view of raw clock-in attendance records. Users can navigate across months (e.g. "September / 2026") with a dedicated month/year picker, view calendar-computed weekdays (Mon, Tue, etc.) alongside dates, review single-user summary metrics (`Days Worked`, `Total Hours`, `Avg per Day`), print records for one, selected, or all employees with clean print formatting, and bulk-import attendance records via CSV.

## Scope

- **In:**
  - Month and year navigation header styled per reference Section 2e ("September / 2026 / Print").
  - Dynamically computed Day column (e.g. "Wed", "Sun") calculated from the shift date using the restaurant's local timezone (`America/Chicago`).
  - Single-user summary dashboard view:
    - 3 top stat cards: `Days Worked` (count), `Total Hours` (sum in hours with 1 decimal place), and `Avg per Day` (mean hours per worked day).
    - Daily shift detail table with start/end times, auto-closed status (amber), and open shift warning (red).
  - Multi-select print support:
    - Print trigger offering "Print current employee", "Print selected employees", or "Print all employees".
    - Dedicated print CSS (`@media print`) rendering clean tabular reports without navigation bars or buttons.
  - CSV bulk import for raw attendance logs:
    - Upload CSV file with employee attendance identifier, date, clock-in, and clock-out.
    - Validation on dates, times, and identity resolution against `attendance_identity_links`.
  - Mobile representation (Section 2f): touch-friendly employee dropdown, month pager, compact stat cards, and scrollable card ledger.
- **Out:**
  - Modifying raw clock-in timestamps automatically (all edits are manual audit records).
  - Deriving or modifying payroll amounts inside the attendance tab.

## Acceptance Criteria

- [ ] Given the attendance screen, the user can select any month and year (Jan–Dec, 2024–present), and the ledger updates to show shifts within that month.
- [ ] Given any shift record in the table, a Day column displays the accurate calendar weekday ("Mon", "Tue", etc.) matching the date in the restaurant's timezone.
- [ ] Given a selected employee, the summary stat cards accurately display:
  - `Days Worked`: number of unique calendar days with completed shifts.
  - `Total Hours`: sum of worked duration in hours (`0.1h` resolution).
  - `Avg per Day`: total hours divided by days worked (`0.1h` resolution).
- [ ] Given a manager clicking "Print", they can choose between printing the active person, a checked subset, or all rostered employees, resulting in clean formatted print pages.
- [ ] Given an attendance CSV file, a manager can upload it, preview parsed rows, resolve any unlinked employee IDs, and commit records to `attendance_records`.
- [ ] Given an unlinked server, they cannot view other employees' records or summary cards.

## UX Contract

- **Entry point:** Desktop top/secondary nav "Attendance", mobile "More" sheet > "Attendance".
- **Desktop:** Split view or wide layout per Section 2e: Person selector + Month/Year bar on top, 3 stat tiles, followed by the daily log table.
- **Mobile:** Vertical stack per Section 2f: Large employee selector, month navigation with print icon, 3 horizontal stat cards, followed by vertical shift items.

## Data & Authorization

- **Tables/columns:** Queries `attendance_records` filtered by `restaurant_id`, `work_date >= month_start AND work_date <= month_end`, and linked `profile_id`.
- **Grants/RLS:**
  - Managers/owners can view all records for their organization and import CSVs.
  - Servers can only query records linked to their own authenticated profile ID via `attendance_identity_links`.
- **Identity Rule:** Strict foreign key to `attendance_identity_links.external_identity_id`. Zero string-based name matching.

## Implementation Map

- `src/features/attendance/components/attendance-report.tsx`: Main reporting interface, month/year selector, stat tiles.
- `src/features/attendance/components/attendance-print-dialog.tsx`: Multi-select print modal & print CSS.
- `src/features/attendance/components/attendance-csv-import.tsx`: CSV parser and validator.
- `src/features/attendance/domain/attendance-metrics.ts`: Pure functions for `Days Worked`, `Total Hours`, and `Avg per Day`.

## Test Plan

- Unit: Accurate calendar weekday calculation across month boundaries and leap years; metrics computation tests.
- E2E: Month switching, CSV upload preview and commit, print dialog interactions.
