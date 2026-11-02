# Tasks → History

Status: implemented on `feature/tasks-history` (target `development`).

## User outcome

A permanent **History** tab in the Tasks module. A manager (or staff member,
within what they can already see) reviews completed work in one place: what was
done, who it was assigned to, who actually completed it, when, and what type.

Non-goals: no row actions (complete / reopen / reassign / edit / delete), no
task-detail click-through (the detail dialog has actions), no schema change, no
change to Today / My Tasks / Opening / Closing / Assigned / Manage.

## Data (no database change)

Everything History needs is already persisted:

| Shown            | Source                                                      |
| ---------------- | ----------------------------------------------------------- |
| Task             | `tasks.title`                                               |
| Assigned To      | `task_assignments.profile_id` (or "Whole team" / "Anyone")  |
| Completed By     | `tasks.completed_by` (separate from assignees, never faked) |
| Assigned (time)  | earliest `task_assignments.assigned_at`; "—" if none        |
| Completed (time) | `tasks.completed_at`                                        |
| Type             | `tasks.kind`: task → Regular, opening, closing              |
| Display names    | `profiles.display_name`                                     |

Not surfaced: **Assigned By** (`task_assignments.assigned_by` exists but the
filter was optional and the view is kept compact).

Known limits:

- The existing snapshot only keeps finished tasks for 14 days, so History reads
  its own bounded query: the 1000 most recent completed tasks (all kinds),
  newest first. When more exist, the view says it is showing the most recent.
- For tasks with several assignees, "Assigned" is the earliest stored time.
- Tasks assigned to "Whole team" / "Anyone" have no assignee rows, so they show
  that label and no assigned time.
- Demo mode has no per-assignee timestamp; it uses the task's last
  created/assigned/reassigned event.

## Authorization

The query runs on the caller's own Supabase session, so the existing RLS on
`tasks` / `task_assignments` / `profiles` decides what comes back (staff see
only tasks they could already see; managers see all). No policy or role change.

## Behaviour

- Completed tasks only, newest completion → oldest (Oldest first optional).
- Grouped by the restaurant-local month of completion, newest month first;
  newest month expanded, older months collapsed (all expanded while searching /
  filtering); counts per month. Native disclosure buttons, no new dependency.
- Search: task title (plus assignee / completer names).
- Filter: Assigned to, Completed by, Task type, Completed (Today, Yesterday,
  Last 7 / 30 days, This month, Custom range), Month; "Clear filters".
- Desktop (`lg`): six-column list; below `lg`: stacked records, no horizontal
  scroll. Uses existing tokens, so Light/Dark follow the app theme.
- States: loading, error with "Try again", "No completed tasks yet.", "No task
  history matches these filters.", "No completed tasks match your search."

## Code map

- `domain/task-history.ts` — pure filtering / ordering / month grouping / labels
- `data/task-history-mapper.ts`, `data/task-history-data.ts` — read query
- `actions/tasks-actions.ts` — `getTaskHistoryAction` (read-only)
- `hooks/use-tasks-controller.ts` — `loadHistory` (real + demo)
- `components/history-view.tsx`, `components/tasks-workspace.tsx` — UI + tab

## Tests

- Unit: `domain/task-history.test.ts`, `data/task-history-mapper.test.ts`
- Component: `components/history-view.test.tsx`
- Playwright (demo): `tests/e2e/tasks-history.spec.ts`

## Future (only if wanted)

- Page older than 1000 completions with a cursor on `completed_at`.
- An "Assigned by" filter from `task_assignments.assigned_by`.
