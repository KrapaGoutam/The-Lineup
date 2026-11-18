# Release Group 1 — Reporting Foundation (V2.0.5 / V2.0.6 / V2.0.7)

Single authoritative handoff for this release group (repository convention: `docs/features/<slug>/HANDOFF.md`).
Order is strict: **A (V2.0.5) → B (V2.0.6) → C (V2.0.7)**. B starts only after A is merged; C only after B is verified.

## Identity

| Item                      | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Repository                | `KrapaGoutam/The-Lineup`                                                                           |
| Integration branch        | `development` @ `fbf44a1` (PR #354 merged; V2.0.5 timezone fix)                                    |
| Production                | `main` — untouched, no changes authorized                                                          |
| Environment               | Local worktree only. Neon (external Monks) read **only**, aggregates only. No Supabase DEV writes. |
| Current batch             | **B — V2.0.6** (implemented, ready for review/PR)                                                 |
| Batch A branch / commit   | `fix/v2-005-monks-neon-timezone` / PR #354 merged at `fbf44a1a2cc5158bf372e43967562b88a70bd68f`    |
| Batch B branch / worktree | `feature/v2-006-monthly-attendance-reports` / `.tmp/v2-006-monthly-attendance-reports`            |

## Batch A — V2.0.5 Monks Neon timezone

Merged to `development` via PR #354 (`fbf44a1a2cc5158bf372e43967562b88a70bd68f`) after passing independent review and CI gate.

## Batch B — V2.0.6 Monthly Attendance Reports, Statements & Dynamic Branding

### Architecture & Deliverables

#### B1. Monthly Attendance Filters & Selection
- **Monthly Navigation**: Reused `AttendanceMonthNav` in `NativeAttendanceReport` with Month/Year dropdowns and previous/next steppers, clamped to valid boundaries (2024 to present).
- **Date Presets**: Added "This month", "Last month", "This week", "Last week", and "Today" presets using pure arithmetic via `resolvePeriodRange`.
- **Multi-Employee Filtering**: Added multi-employee selection checklist to `NativeAttendanceReport` with "Select all" and "Clear" controls. Supports querying specific multiple employee IDs via `profileIds: string[]` in `getNativeAttendanceReportAction` and `listNativeAttendance`.
- **Full Location Roster Loading**: Calls `listLocationEmployeesAction` on mount for managers to see all staff members active at the verified location.

#### B2. Unified Attendance Reporting Domain (`src/features/attendance/domain/unified-attendance-report.ts`)
- **Canonical Model**: Standardized `UnifiedAttendanceReport`, `UnifiedEmployeeSection`, and `UnifiedAttendanceRow` to represent attendance uniformly across both TheLineup Internal and External Neon sources.
- **Normalizers**:
  - `normalizeNativeAttendanceToUnified`: Ingests native sessions, preserves audited correction indicators (`hasAuditCorrection`, `correctionCount`, `lastCorrectedAt`), evaluates break classifications and net payable vs gross elapsed hours, and groups/sorts chronologically.
  - `normalizeNeonAttendanceToUnified`: Ingests Neon external rows with V2.0.5 CST/CDT wall-time to instant conversions, flags missing clock-in or clock-out punches, calculates worked hours display, and formats calendar weekdays.
- **Totals**: Computes grand total hours, total shifts, total employees, total missing punches, and total corrected shifts.

#### B3. Professional Print & Preview Component (`src/features/attendance/components/unified-attendance-print-dialog.tsx`)
- **Print Preview Dialog**: Full-screen backdrop dialog displaying high-fidelity preview matching `CombinedStatementDialog` aesthetics.
- **Interactive Scoping**: Users can toggle between "All (N)", "Single employee", or "Selected employees" with checkboxes.
- **Print-Specific Styling**:
  - In `src/app/globals.css`: Added `@media print` rules ensuring `.print-timesheet-table thead { display: table-header-group !important; }` and `.print-timesheet-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }`.
  - Zero UI bleed: Screen-only toolbar controls and filters hidden via `print:hidden`.
  - Signature and certification block for employee and management verification on every statement.

#### B4. Dynamic Organization Branding (`src/components/print/report-branding.ts` & `src/components/print/report-letterhead.tsx`)
- **Deterministic Brand Resolver**: `resolveReportBrand` identifies organization and location:
  - **Monks Webster**: Verified SVG crest markup (`THE_MONKS_LOGO_MARKUP`), Webster branch title, website `monkswebster.com`, fallback mark `TM`.
  - **Liquor Tap**: Distinct branch handling for **League City** (`League City, Texas`) and **NASA** (`Houston, Texas`). Uses clean organization-name text fallback with `LT` initials mark (zero unverified or synthetic logos).
  - **The Lineup / Fallback**: Default platform identity or generic tenant name fallback.
- **Synchronous Rendering**: Vector markup inlined as raw SVG paths without external network dependencies, ensuring 100% reliable printing in offline or sandboxed environments.
- **Backward Compatible**: Existing consumers of `ReportLetterhead` continue to render seamlessly.

#### B5. Security, Permissions & Financial Safeguards
- **Tenant & Location Scoping**: Tenant-isolated by `organization_id` and verified `location_id`.
- **Role Scoping**: Non-managers can only see their own attendance records (`profile_id = auth.uid()`), while managers can browse the location roster.
- **Zero Historical Mutation**: Purely read-only aggregation. No historical financial records or payroll source entries are modified.

#### B6. Verification & Test Suite
- **Full Suite Passing**:
  - `npm run check` (Prettier, ESLint max-warnings=0, next typegen && tsc --noEmit) passes with 0 errors.
  - 35 test files and 403 tests pass in `src/features/attendance` and `src/components/print`.
  - 326 test files and 4,375 tests pass across the entire repository test suite.

### Files Modified & Created

- `src/components/print/report-branding.ts` (New)
- `src/components/print/report-branding.test.ts` (New)
- `src/components/print/report-letterhead.tsx` (Modified)
- `src/components/print/report-letterhead.test.tsx` (Modified)
- `src/features/attendance/domain/unified-attendance-report.ts` (New)
- `src/features/attendance/domain/unified-attendance-report.test.ts` (New)
- `src/features/attendance/components/unified-attendance-print-dialog.tsx` (New)
- `src/features/attendance/components/unified-attendance-print-dialog.test.tsx` (New)
- `src/features/attendance/data/native-report-data.ts` (Modified)
- `src/features/attendance/actions/native-report-actions.ts` (Modified)
- `src/features/attendance/actions/native-report-actions.test.ts` (Modified)
- `src/features/attendance/components/native-attendance-report.tsx` (Modified)
- `src/features/attendance/components/native-attendance-report.test.tsx` (New)
- `src/features/attendance/components/attendance-workspace.test.tsx` (Modified)
- `src/app/globals.css` (Modified)
- `tasks/current-task.md` (Modified)

## Batch C — V2.0.7 Readiness & Handoff

Batch C (Enhanced Payroll Integration & Organization Consumables) can begin once PR for Batch B is reviewed and merged into `development`:
1. Consume `resolveReportBrand` and `ReportLetterhead` across payroll statement generation.
2. Ingest `UnifiedAttendanceReport` aggregates into payroll compensation draft previews.
