# Feature 002 — Weekly and monthly schedule roster

Status: implemented (interactive reference UI and production schema)

## User outcome

Managers create and publish shifts for the team; employees see their own detail and the published team roster in weekly or monthly form.

## Rules

- Shift labels are exactly `morning`, `evening`, and `full_day`.
- A work date and assignee are required.
- Custom from/to times are optional. When omitted, the location default for the selected shift label applies.
- Optional from-date/to-date input bulk-creates one shift per operating day in the inclusive range.
- A manager may override one generated day without altering the template or sibling shifts.
- Overnight shifts are valid when the resolved end is on the next local day.
- Managers edit drafts and explicitly publish. Employees never see drafts.
- Employees see their own exact shifts plus the published team roster; private notes are manager-only.

## UI

- Manager week grid: staff rows, seven day columns, compact shift blocks, add-shift panel, draft/published indicator, and publish action.
- Month view: calendar cells summarize shift count and the signed-in employee’s shift.
- Mobile/tablet: horizontally scrollable week grid and a seven-column month summary.
- Empty, validation, conflict, permission-denied, and published states are designed.

## Data and authorization

- Bulk date ranges are an input convenience; each stored shift represents one service date and carries a series id.
- Effective times are resolved at creation and stored as instants with the location time zone and `uses_default_time` marker.
- Manager/owner write; active members read published schedules; a server can always read their own published assignments.
- Publishing is idempotent, records actor/time/version, and appends an audit event.

## Tests

- Inclusive date expansion, default/custom time resolution, overnight shifts, and overlap warnings.
- RLS draft visibility and manager write tests.
- Playwright week/month switch, add shift, and employee read-only behavior.

## Codex build prompt

Implement the approved roster without adding more shift categories. Keep range expansion deterministic, keep draft data private, and run all relevant unit, database, and browser checks.
