# Product Requirements Document

> Approved MVP scope: three operational modules—Schedule Roster, Table Allocation, and Tip Split—on one shared passcode/roles/hours foundation.

## Product

**Working name:** ServiceFlow Roster  
**Audience:** Independent and small-chain restaurants  
**Primary surfaces:** Manager desktop, host-stand tablet, server mobile

## Problem

Restaurant managers often build schedules, server table rotations, and tip calculations in separate spreadsheets or on paper. Staffing changes during service make those artifacts inaccurate. ServiceFlow keeps the three daily workflows together while preserving manager control and employee privacy.

ServiceFlow combines labor scheduling with a live floor roster. A manager publishes the staff plan; at service time, the host activates the servers actually present, generates a balanced table assignment for that count, and seats parties through a transparent rotation that can be overridden with a reason.

## Goals

- Create and publish weekly and monthly schedules using Morning, Evening, and Full Day labels.
- Maintain a flexible live table-allocation rotation as the floor team changes.
- Calculate tip estimates fairly across time intervals and active participants.
- Give employees one passcode entry point for their schedule, own allocations, and own tip estimate.
- Give managers an auditable history with undo/redo for live-board writing.
- Work well on a busy host-stand tablet and a server's phone.

## Personas and permissions

| Persona | Main job                                          | Default permissions                            |
| ------- | ------------------------------------------------- | ---------------------------------------------- |
| Owner   | Configure the restaurant and review operations    | All restaurant data and role management        |
| Manager | Plan schedules, operate the floor, calculate tips | Assigned locations                             |
| Server  | Work service and review personal information      | Published schedule, own table column, own tips |

One person can hold multiple roles. Authorization is derived from membership rows, never from editable profile metadata.

## MVP requirements

### Shared access and restaurant hours

- Create one organization with one or more restaurant locations.
- Open a restaurant-specific URL/QR and sign in with one PIN field—no username field.
- Register with a name, contact, and a chosen 4-digit passcode; the account is provisioned and signed in immediately as a server, with no manager approval step (Feature 005). Promotion beyond server remains owner/manager-only.
- Configure location time zone, opening/closing hours, dining areas, and tables.
- Show restaurant-local date/time and a countdown to closing on every authenticated screen.
- Deactivate staff and tables without deleting history.

### Staff roster

- View schedules by week and month.
- Use exactly three shift labels: Morning, Evening, and Full Day.
- Require a work date and assignee; custom from/to time is optional and falls back to the configured label defaults.
- Optionally supply a from-date/to-date range to generate repeated daily assignments.
- Record recurring availability and time-off requests.
- Warn on overlaps, unavailable assignments, excessive daily/weekly hours, and missing coverage.
- Keep schedules as drafts; managers explicitly publish a version.
- Employees see their own detailed schedule and the published team roster; drafts and private notes remain hidden.
- Preserve local wall-clock intent through daylight-saving changes by storing instants plus location time zone.

### Live table-allocation roster

- Display one flexible ordered column for each server currently on the floor.
- Managers add/remove/pause/reorder columns; a server writes only under their own column.
- Support combined-table entries.
- Add the next rotation row automatically after every active column in the current row is filled.
- Support undo/redo plus manager-only clear row, clear column, and clear board.
- Persist changes as events and update open boards through Realtime.

### Tip split

- Manager/owner enters tips by time interval and confirms the people active during it.
- Suggest participants from the live floor, with manager correction and confirmed schedule fallback.
- Calculate and store amounts in integer cents with deterministic remainder handling.
- Employees see only their own estimate/final amount; managers see and finalize the complete pool.

### Reporting

- Summarize published shifts, table turns, and per-person tip allocations.
- Export/print remains a later feature.

## Fairness policy

The visible allocation board is the operational order. The next round does not start until each active, non-paused column is filled. Managers may correct mistakes, but clears and undo/redo remain auditable. Tip cents are split equally inside each confirmed interval; deterministic remainder assignment prevents lost cents.

## Non-functional requirements

- Tenant isolation must be enforced in Postgres RLS, not only in the UI.
- Live board and tip mutations must be transactional and idempotent under two devices.
- Core host actions should respond in under 500 ms at the 95th percentile under normal regional conditions.
- The live view must remain usable at 768 px tablet width and in landscape mode.
- Touch targets are at least 44 by 44 CSS pixels; all core actions have keyboard equivalents.
- Color is never the only indicator of a server or table state.
- Audit events are append-only to application roles.
- No service-role or secret key is shipped to the browser.
- Production errors must be observable without logging sensitive guest notes.

## Out of scope for MVP

- Payroll, clock-in/out, POS settlement, reservations, and waitlist marketplace integrations
- AI-generated schedules without manager approval
- Native iOS/Android apps
- Offline conflict resolution across multiple host devices
- Complex union rules or jurisdiction-specific labor compliance claims
- Automatic SMS/email delivery

## Success measures

- Manager publishes a week with fewer than five minutes of correction after templates are configured.
- Floor staff can start a live allocation board in under two minutes.
- Tip totals reconcile exactly to every interval’s entered cents.
- No cross-tenant access appears in automated RLS tests or production audit review.

## MVP acceptance

The MVP is ready for a controlled pilot when one restaurant can approve passcode access, publish a week, maintain a live allocation board as servers join/pause/leave, calculate interval tips, let each employee see only their permitted views, and review the resulting audit trail.
