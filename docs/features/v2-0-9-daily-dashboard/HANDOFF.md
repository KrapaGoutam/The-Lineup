# V2.0.9 — Daily Operations Dashboard

Branch `feature/v2-009-daily-dashboard`, base `development` `94f05eb9` (V2.0.8 merged). One PR to `development`. **No migration. No database, Production or `main` change.**

## Outcome

A read-only Dashboard tab (`?tab=dashboard`) showing four operational cards and role-based shortcuts for the active organization and branch. It owns no data and no money rules: every figure is a reduction of a read the owning module already trusts. The Table Allocation dashboard, the default landing (Tasks) and all module screens are unchanged.

Non-goals: no Unfinalized Tips metric, no Finalize/Unlock, no Table Allocation lock, no new report engine, no polling, no write of any kind.

## Cards (exact definitions)

| Card               | Primary                                                                                                                                                                                                    | Source (reused)                                                                                                                                                                                                | Visible to                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Today's Attendance | Currently clocked in = distinct employees with an open native session (`active` or `on_break`) at the branch; secondary: on a break                                                                        | `attendance_session_summaries` (the same read Tips' "pull clocked-in team" uses), source chosen by `decideReportSource`                                                                                        | Branch management, module on                                                                                                              |
| Pending Payroll    | Draft payroll periods of the branch-local current accounting month; secondary: outstanding balance = `computeOverallBalanceOwedCents` (sum of `max(0, balance)`; an overpaid period never offsets another) | `listPayrollPeriods` (branch), `summarizePeriodLedger` (the one balance rule, shared with `getPayrollBalance`), `derivePeriodStatus`                                                                           | Whoever `derivePayrollAuthority` + `payroll_location_authorized` allow (the Payroll actor's rule), module on                              |
| Today's Tips       | Recorded tips today = saved non-void intervals; secondary: interval count, cash, card, **Not split** (legacy unclassified money stays identifiable), last update                                           | V2.0.8 `tips_get_range` + `buildTipsRange` / `liveIntervals`                                                                                                                                                   | Managers: location totals. Staff: **only their own allocated share** (the database returns nothing else; a foreign share is also dropped) |
| Low Stock          | Items needing ordering = critical + low; secondary: critical / low                                                                                                                                         | Bar Inventory `buildInventoryRows`, `buildKpis`, `needsOrdering`, `evaluateStock` (configured cutoff/warning, existing fallback); active products only; read-only (not `getCatalogSnapshot`, which bootstraps) | Management with `inventory_location_authorized`, module on                                                                                |

Honesty: a source that cannot answer is `Unavailable` with a reason, never `0` / `$0.00`; a valid empty answer is a real zero; a module that is off is shown as "Turned off" (managers only) and is not linked; a card a viewer may not see is **absent from the payload**.

### Unsupported / limited cases (documented, not invented)

- **External attendance**: the external (Neon) clock identifies people, not branches, so a branch headcount from it cannot be proven. Branches in `external` or unconfigured mode show **Unavailable** with that reason. Only `internal_the_lineup` branches show a count. `disabled` shows Unavailable ("Attendance tracking is off").
- "Today's recorded attendance" and "open clock-ins needing attention" are not shown: the native model does not distinguish a forgotten clock-out from an active shift reliably.
- **Internal-attendance branches**: native payroll periods carry no branch column and have no list reader yet, so the Pending Payroll card is **Unavailable** for them (with a reason) instead of an unproven zero.
- Payroll covers the `external_neon` periods the Payroll screen itself lists, for **this branch only**. Legacy periods with no branch (`location_id` null) are not pulled in. The outstanding balance covers all months of the branch (labelled "Across N periods at this branch"); the draft count is the current month only. Native (internal-attendance) payroll periods have no list reader yet, so they are not included.
- "Today" is the branch-local calendar date, the same date the Tips module opens on. Tips after midnight that belong to the previous night's service date are entered on that earlier date (the existing service-date rule, unchanged), so they appear under that date in Tips, not in the new date's card.
- Reads at or above the PostgREST 1,000-row cap (payroll periods, payments/adjustments per chunk, open sessions) report Unavailable rather than a possibly truncated number.
- Bar Inventory's Order Soon is part of its Dashboard view; the card link opens the module (the destination has no URL parameter for a stock filter, so none is claimed).

## Authorization (server, per request)

`getDashboardAction` order: live session → canonical active context for the slug (organization, branch, profile, capabilities, all server-verified) → stale-tab expectation → **one** module-verdict read (`checkModulesAccess`, added to the module-enforcement entry: one mode read + one configuration read for the verified branch) → each card's own authority RPC (`tips_` / `payroll_` / `inventory_location_authorized`) → only authorized, enabled cards are read. Organization, branch, time zone and profile never come from the request. Staff trigger no payroll, inventory or attendance read (tested). The action is registered as an exemption in `enforcement-coverage.test.ts` with that reasoning.

## Navigation

- New `AppTab` `dashboard` / `?tab=dashboard`, registered as a **system-required module** (no database key, cannot be disabled; `SystemModuleKey = settings | dashboard`).
- Dashboard is a navigation member only when the module configuration is readable and the branch is active (or demo): it fails closed with the rest of navigation, and a forged `?tab=dashboard` falls back. It is **never the default landing**: `fallback` skips it (Tasks → Allocation → … → Settings unchanged). Settings' "no operational modules" state treats it as non-operational.
- Desktop: first secondary tab; mobile: in the More sheet.
- Cards and shortcuts are real links (`<a href>`) built with `tabHref`, so the branch (`?location=`) and every other parameter are preserved; a plain click navigates in-app, a modified click keeps the browser's behavior. Back/Forward and reload use the existing history mirror. Disabled modules cannot be opened through links (existing navigation policy).
- Cards and shortcuts are linked only when the shell's navigation policy will open that module for the viewer (`availableTabs`); otherwise a card shows "Turned off" and a shortcut is dropped. This also covers staged enforcement environments, where the server verdict allows every module but navigation hides unconfigured ones.
- A stale workspace shows "Reload workspace" (not a retry that would re-send the same stale expectation). A parent re-render never restarts the read (callbacks are held in refs).
- Date/month filters: no destination module reads one from the URL, so none is passed and none is claimed.
- Reporting Center is a real route (`/reporting`), offered to management when Attendance or an authorized Payroll is on.

## Quick actions

Built by `buildQuickActions` from module verdicts + each module's own authority; no role label. Management: Attendance, Payroll (only with payroll authority), Tip Split, Bar Inventory (inventory authority), Tasks (Management Today), Table Allocation, Reporting. Staff: My Attendance, My Tips, My Tasks, Table Allocation. Never payroll, branch tips totals, management tasks, inventory or reporting.

## Reads and cost

One read when the Dashboard opens; afterwards only the Refresh button (disabled while a read is in flight). No polling. Payroll balances are batched (two reads per 50 periods, not two per period). Low stock is two paged reads. Out-of-order responses are discarded (request sequencing; the view is keyed by branch).

## Demo workspace

Demo has no database, so it renders a deterministic, clearly labelled "Sample data" payload of the same shape (no Payroll: its tab is real-mode only).

## Changes outside the new feature (small, behavior-preserving)

- `payroll-data.ts`: `summarizePeriodLedger` extracted from `getPayrollBalance` (same arithmetic); `getPayrollBalancesForPeriods` added.
- `payroll-actor.ts`: the authority rule extracted as `derivePayrollAuthority` (same rule; the actor calls it).
- `module-enforcement.ts`: `checkModulesAccess`.
- `settings-page.tsx`: Dashboard does not count as an operational module.

## Evidence

- Focused Vitest: dashboard model (25), dashboard action authorization/privacy (13), readers (19, incl. the 1000-row guards and source selection), component (18), payroll balances/authority (8), `checkModulesAccess` (4), registry/navigation/shell navigation (updated, plus 5 new Dashboard cases), enforcement-coverage and module-isolation guards.
- Demo Playwright `tests/e2e/daily-dashboard.spec.ts`: 9/9 on desktop, host-tablet and server-mobile (cards, shortcuts, deep links, Back/Forward, direct URL, staff privacy, no horizontal overflow).
- `tsc`, ESLint (`--max-warnings=0`), Prettier and a cold webpack production build are green.
- **Not run here** (belongs to Group 2 Phase C, the single integrated acceptance): hosted DEV real-database reconciliation of each figure against its module screen, and a production-build real-mode browser pass.

## Migration impact

None. Production still needs migration 99 (`20261117140000`) then 100 (`20261119120000`) before the Group 2 application rollout; that is Group 2 closeout, not this PR.
