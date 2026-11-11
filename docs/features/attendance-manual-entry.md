# Attendance manual entry and correction follow-up

**Owner:** The Lineup owner  
**Status:** approved for local implementation by the 2026-11-10 enhancement request  
**Base:** V2-006 merged to `development` at `d09b6c4`  
**Issue/PR:** No dedicated open issue found by GitHub search; one Attendance PR to development.

**Independent review, 2026-11-11:** Source and focused local test fixes are committed on the existing branch; actual local JWT and browser acceptance remains open. Hosted DEV remains at 86 migrations with this RPC absent; no new owner rollout authorization was found. See the private handoff for exact review and gate receipts.

## User outcome and scope

An authorized manager can record a missed, explicitly timed native shift for an assigned employee, review it before submission, and correct an existing native record on the Attendance page. A reviewed multi-row grid permits independent entries with stable retry identities. Existing correction, audit and financial contracts remain authoritative.

Out: Kiosk missed-punch requests (V2-007), external/disabled native creation, fabricated clock-in, automatic financial adjustment, native financial activation, Neon, Production and main.

## Source-backed capability inventory

| Capability                         | UI                                             | Server/DB                                                                              | Tests                      | Actual gap                                           | Action                                                                                                 |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Completed manual shift             | `native-attendance-report.tsx` has report only | `attendance_clock_in/out` use server time in `20261110000000`; no explicit-time create | `0073` clocks live         | Missing                                              | New audited create RPC, action, reviewed form                                                          |
| Clock-in-only shift                | No form                                        | `attendance_sessions` supports one `active` session per employee/org                   | `0073` open-session tests  | Historical open entry could strand live clock flow   | Permit only current local date and no existing open shift; explicit warning                            |
| Missing clock-in on existing row   | Correction UI edits an existing start          | `attendance_sessions.clock_in_at NOT NULL`; no unresolved lone-end model               | `0074` correction tests    | A clock-out-only row cannot exist in native contract | Explain unsupported; no invented start                                                                 |
| Missing clock-out                  | Correction dialog labels missing end           | `attendance_correct_session` closes selected versioned session                         | `0074`                     | Already supported                                    | Reuse dialog, clarify selected open record                                                             |
| Lone clock-out                     | No native UI                                   | `attendance_clock_out` needs matching open session                                     | `0073`                     | Unsupported                                          | Explain unresolved, no payable row                                                                     |
| Correct in/out/breaks/void         | `attendance-correction-dialog.tsx`             | `attendance_correct_session` with reason, version, immutable event, before/after       | `0074`, component tests    | DST input silently picks an occurrence               | Reject ambiguous/nonexistent local time in form                                                        |
| Multiple shifts, same date         | Report lists sessions                          | No uniqueness by date; correction rejects overlap                                      | `0074` overlap             | Creation missing                                     | Create nonoverlapping rows                                                                             |
| Multiple employees/date            | Report filter only                             | No batch RPC                                                                           | None                       | Missing                                              | Reviewed grid; bounded independent row RPC calls                                                       |
| Void and history                   | Dialog and history list                        | Immutable `attendance_events`, version lineage                                         | `0074`                     | Present                                              | Reuse                                                                                                  |
| Source modes                       | `attendance-workspace.tsx`                     | `attendance_begin` refuses non-internal modes                                          | `0073`, mode tests         | Present                                              | Gate creation to internal                                                                              |
| Consumed, draft, confirmed Payroll | Readiness preview                              | `payroll_attendance_consumptions`, `payroll_periods`, confirmed guard                  | `0075`, `0076`             | New historical insertion has no create guard         | Reject insertion when employee/month has a period or consumption; conservative across month boundaries |
| Roles/location                     | Report resolves verified context               | `private.attendance_begin`, RLS and `attendance_can_manage`                            | `0073`, actual JWT receipt | New creation would inherit self-clock authority      | Require manager authority at RPC and server action; do not add Shift Manager authority                 |

Paths above are under `src/features/attendance/` and `supabase/migrations/`. Historical tests are evidence of existing behavior, not validation of this feature.

## Acceptance and UX

- [ ] Managers select an active employee, local service date, explicit clock-in date/time, optional clock-out date/time and a 3–500 character reason. Before saving, show employee, location, time zone and exact interval. Date must equal clock-in's local date.
- [ ] A completed manual entry permits multiple nonoverlapping sessions on one date. An open manual entry is allowed only on the current local date and only when it cannot conflict with the one-open-session rule. A clock-out without a start is explained as unsupported.
- [ ] The bulk grid shares location/date and optional time defaults, but retains employee, time, reason and stable operation ID per row. Review precedes submission. Results remain per row; only failed/unknown rows retry with the same key and payload. A changed payload under the key is refused in the database.
- [ ] Existing correction shows originals/proposals, requires reason, handles stale version with refresh, preserves audit and supports break/void. Ambiguous and nonexistent DST wall times are rejected in entry and correction.
- [ ] Loading, empty, error, success, denied and narrow-screen states have clear text. Controls are keyboard and touch usable.

## Data, authorization and integrity

New forward-only migration adds one `SECURITY DEFINER` RPC with `search_path=''`, live JWT/session check, verified location and assigned employee, manager permission, per-employee advisory lock, overlap check, immutable manual events and exact-payload idempotency. No new exposed table. Direct table writes remain revoked. It refuses a covered payroll month when a matching native or linked external period or consumption exists. Creation does not touch stock, Tips, Payroll money, or rates. Existing `attendance_correct_session` remains the correction authority.

Use the location IANA zone for UI conversion and date matching; database verifies the resulting service date and both timestamps against server time. Overnight ends require their own date. Open historical rows and clock-out-only input remain unsupported under the current model.

## Implementation and verification

Routes: existing Attendance management page. Actions: new manager entry action and employee-list action. RPC: new manual-entry function. Generate local types after migration. Unit/component tests for DST and reviewed grid; pgTAP for manager scope, overlap, idempotency, audit and frozen-month guards; real local-stack browser at desktop, WebKit tablet and mobile. Then `npm run check`, `npm run test`, `npm run build`, relevant Playwright and database tests. Review exact diff for tenant isolation, audit, accessibility and financial integrity.

## Rollout and rollback

Native financial activation remains OFF; backend enforcement stays STAGED. Migration is additive and must reach verified DEV before a Preview using the new RPC. Prepare exact checksum, backup, isolated recovery and compatibility evidence; obtain specific owner authorization before a hosted write. No down migration that discards recorded attendance.

The independent review moved exact-payload replay ahead of time-dependent validation so a successful open entry can be retried after local midnight. The bulk form now accepts an explicit end date for overnight work, and the bulk action validates rows independently so one malformed row cannot cancel valid rows. The RPC type permits a nullable clock-out. Targeted local database and application tests pass. Actual local JWT and browser acceptance remains pending because the local Supabase CLI is blocked by Device Guard and no approved local-only test credential path is available. Do not claim these gates from pgTAP or component tests. The one pending DEV migration is `20261110203355_attendance_manual_entry.sql`, SHA-256 `99C8BCB14A12D46745B2B80F5CBB44183A10C5A340290EC483B4E02D76977854`; verify this hash again before any rehearsal or push.

## Decision and risk

The existing `attendance_sessions` model cannot represent a lone clock-out. It remains unsupported and never creates payable time. Historical incomplete entries are excluded because one open session per employee across the organization can block a current clock flow. This limitation is visible in the UI. Existing correction behavior is preserved except that ambiguous/nonexistent wall time is refused instead of silently resolved.

## Local acceptance checkpoint — 2026-11-11

Normal Auth and real local browser checks passed for the manager/denial, saved shift, correction, bulk partial success, DST and responsive flows. The client future rule was aligned with SQL; bulk headers now match input order. Dedicated keyboard/touch tap remained unproved after an intermittent local JWT issued-at-future error. The private `LOCAL_ACCEPTANCE_2026-11-11.md` has exact evidence. Hosted migration, Preview and PR await new owner approval; activation remains OFF and enforcement STAGED.
