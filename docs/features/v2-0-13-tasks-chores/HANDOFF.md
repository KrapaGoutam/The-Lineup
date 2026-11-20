# V2.0.13 — Tasks, Checklists and Chore Wheel · Batch A (Existing Tasks and Checklists)

Branch `feature/v2-013-tasks-chores`, worktree `.tmp/v2-013-tasks-chores`, base `origin/development` `5aa3a81f` (PR #360 merged). One major feature branch for Batch A → B → C. **Not merged to `development`. `main` and Production untouched. Hosted DEV untouched (the migrations are local-only).**

Implementation head: the commit that carries this file (`git log -1 -- docs/features/v2-0-13-tasks-chores/HANDOFF.md`). The exact SHA, PR URL and CI run are in the final report and the PR.

## Outcome (Batch A)

The existing Tasks module (V1/V1.1, location-scoped by V2-005.002) gained, without replacing anything:

- **All Tasks** tab (all roles; contents limited by RLS): search (title, instructions, category, people, checklist steps), status chips with counts (All / Not Started / In Progress / Blocked / Completed / Cancelled, the last two only when present), summary line, active organization · branch label, row status picker, quick complete (existing checkbox), Edit, Reassign, Delete, open checklist. Cards on phone, compact rows on desktop/tablet, 44px targets.
- **Checklists** tab: ordinary tasks that carry checklist steps, with progress ("3 of 5 completed"), per-step checkboxes, search, filter (All / Not finished / All steps checked), Open task, Edit steps and **New checklist** (managers).
- **Task checklists**: ordered steps on an ordinary task (create, edit, rename, reorder, remove, tick, untick, progress). Ticking never completes the parent task.
- **Status**: Not Started (`open`) / In Progress / Completed with every transition of the brief, including In Progress → Not Started and Completed → In Progress / Not Started. Blocked and Cancelled are preserved as additional states (labels map, nothing collapsed). `STATUS_LABELS.open` is now "Not Started" (it was "Open").
- **Delete / archive**: `task_delete` permanently deletes a history-free task, otherwise archives it (soft). Explicit confirmation dialog.
- **Edit conflicts**: `task_update` takes the `updated_at` the editor loaded and the checklist revision; a mismatch is refused with a clear message, never silently overwritten.
- Detail dialog: status segmented control, checklist panel, Delete, new audit labels.

Non-goals / not started: Chore Wheel, Task Settings editor, cycles, month-grouped History (Batches B/C). No placeholder controls for them were added (the nav simply does not list them).

## What was reused vs added

| Area                   | Reused                                                                                                        | Added                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority              | `tasks_is_manager`, `tasks_can_work`, `tasks_can_view`, `tasks_begin` (live session + location + module gate) | none                                                                                                                                                                                           |
| Create / edit / assign | `task_create`, `task_update`, `task_assign` (+ workforce-eligibility validation of assignees)                 | optional `p_checklist`, `p_expected_updated_at`, `p_expected_checklist_rev` (defaults keep old callers valid)                                                                                  |
| Status                 | `task_set_status`, `task_complete`, `task_reopen`                                                             | In Progress → Not Started; Completed → Not Started / In Progress (completer or manager); archived guard                                                                                        |
| Remove                 | `task_cancel` kept as is ("Cancel task…")                                                                     | `task_delete`, private `tasks_archive`                                                                                                                                                         |
| Audit                  | `task_events` (append-only), `tasks_emit` (live actor snapshot)                                               | event types `status_changed`, `checklist_edited`, `checklist_step_checked`, `checklist_step_unchecked`, `archived`                                                                             |
| Steps                  | —                                                                                                             | table `task_checklist_items`, `task_checklist_step_set`, private `tasks_checklist_replace`                                                                                                     |
| UI                     | `TaskRow`, `TaskList`, `TaskFormDialog`, `TaskDetailDialog`, `AssigneePicker`, `Dialog`, `Select`, `Badge`    | `AllTasksView`, `ChecklistsView`, `ChecklistEditor`, `ChecklistPanel`, `ReassignDialog`, `DeleteTaskDialog`, `use-step-toggle`; `TaskRow` gained `footer`/`showPreview` slots and a step badge |

The existing **Assigned** tab (manager filters + per-person progress) and **Opening / Closing** daily checklists are unchanged. All Tasks overlaps Assigned for managers; consolidating them is deferred (removing Assigned would drop shipped filters).

## Data model and migrations

Two forward-only, additive migrations (local only; NOT applied to hosted DEV or Production):

1. `20261120090000_tasks_v2_013_event_types.sql` — 5 enum values (separate file: an enum value cannot be used in the transaction that adds it).
2. `20261120090100_tasks_v2_013_batch_a.sql` —
   - `tasks`: `archived_at`, `archived_by` (profile FK, pair check), `checklist_rev integer not null default 0`.
   - `task_checklist_items` (id, task_id + organization_id composite FK `on delete cascade`, title 1–160, sort_order, completed_by/at, archived_by/at, created_by, timestamps; pair checks; FK indexes). RLS on; clients get **SELECT only**; select policy `tasks_can_view(task_id)`; restrictive module-enforcement policy `task_scope_module_allows(task_id, null)`.
   - Functions: `task_create` (14 args) and `task_update` (12 args) re-created (old signatures dropped, new ones have defaults so **old callers keep working**); `task_set_status` and `task_reopen` replaced in place; new `task_delete(uuid) returns text`, `task_checklist_step_set(uuid, uuid, boolean)`; private `tasks_checklist_replace`, `tasks_archive`. Public RPCs: `revoke … from public, anon; grant execute … to authenticated`; all `security definer set search_path = ''`.

Why a new table: ordinary tasks cannot nest (a `tasks` row is either a standalone task or an Opening/Closing item), and the brief asks for steps attached to an ordinary task with their own state. It is the smallest model that keeps one owner/scope/audit trail.

### Rules worth knowing

- **Archive**: `archived_at` on the task. Active work that is archived becomes `cancelled` too, so the existing due-soon/overdue/reminder sweeps (which only read active statuses) never see it again — no sweep change was needed. A completed task stays `completed`. An archived task cannot be edited, reassigned, reopened or have its steps changed. The snapshot excludes archived tasks; **History keeps archived completed tasks** (record of completion; documented choice, not hidden).
- **Hard delete only when pristine**: status `open`, never started, not a recurrence occurrence (the `(rule, occurrence_date)` unique key would let the generator recreate it), no `task_events` row other than `created`, no step ever ticked or removed. Deleting cascades the task's own `created` event, assignments, notifications and steps; there is no tombstone event (a null-task event would be invisible to RLS anyway). Anything else → archive.
- **Steps**: removed steps are archived, never deleted; retained steps keep identity and completion through rename/reorder. At most 50 live steps; title 1–160. Steps are frozen while the task is Completed/Cancelled/archived ("Reopen the task to change its checklist").
- **Who**: managers (`tasks_is_manager` at the task's own location) create/edit/restructure/delete/reassign; anyone who may _work_ the task (assignee, shared/all-team, manager) may tick a step and change status; reopening a completed task is the completer or a manager. A staff member of another location, another organization, or a non-assignee on an individual task is refused by the RPC (pgTAP + real-JWT tests), regardless of what the UI shows.
- **Conflict token**: `updated_at` is sent back to the database exactly as received (string, microsecond precision preserved). Step ticks do not bump `tasks.updated_at`; structure edits bump `checklist_rev`. Conflict errors use SQLSTATE `P0001`.
- **PostgREST trap found and fixed**: raising SQLSTATE `40001` (serialization_failure) from an RPC makes PostgREST **hang** (apparent retry loop), 15 s+ and the request never returns. Conflict errors must not use `40001`. Server actions must also send every RPC argument explicitly (`p_checklist: null`, etc.).
- `tasks.updated_at`-based detection and `checklist_rev` are _edit_ tokens; status changes do not carry one (they are idempotent single-field moves).

### Assignment

Reassign dialog uses the existing `task_assign` and the server-provided eligible roster (`tasks_location_people`); `task_assign` validates every assignee with `tasks_workforce_eligible` at the task's location. "Unassigned" = `all_team` / `anyone` modes (existing vocabulary). A person whose location membership went inactive cannot be newly assigned; an existing assignment of such a person is left as is (not silently removed) and is visible in the detail view. No identity is duplicated: one profile, location-scoped.

## Authorization boundary

Server action `runTaskCommandAction` (unchanged ordering): live session → verified actor/scope → stale-tab expectation → module gate → per-command pre-check that the target task belongs to the verified location → RPC. The new commands (`delete`, `stepSet`, extended `update`/`create`) pass through the same path. Client-provided locations are never trusted.

## Tests and evidence (all local; nothing hosted)

| Layer                                                         | Result                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP `0092_tasks_v2_013_batch_a`                             | 64 assertions: grants, RLS, create-with-steps, visibility, tick/no-op/foreign-step, restructure (rename/reorder/remove/add), conflicts, null-checklist untouched, every transition, audit retention, cross-location, cross-org, delete vs archive vs completed-archive |
| pgTAP re-pin `0088`                                           | SW-R2 124 → 126 functions, SW-R10 39 → 40 management RPCs (`task_delete`; `task_checklist_step_set` is worker-level so staff hold it)                                                                                                                                  |
| Full pgTAP                                                    | 95 files / 3,941 tests. All pass except `0066_tips_location_scoping` test 32 (Tips, **not caused by this change**: it uses `now() + interval '3 hours'` against the V2.0.8 service-date rule and fails late in the local day; not re-verified on a clean baseline)     |
| Real-JWT local suite `tests/local/tasks-v2-013.local.test.ts` | 7/7 with real GoTrue sessions through the real actions, snapshot loader (PostgREST embed of steps) and RPCs; existing `tasks-location.local.test.ts` 17/17 (old 13-arg `task_create` still works)                                                                      |
| Vitest                                                        | full suite 355 files / 4,821 passed, 7 skipped (new: engine 20, register 8, components 11); tsc clean except the pre-existing `layout.tsx` `LayoutProps` (needs `.next/types`); eslint and Prettier clean                                                              |
| Playwright (demo)                                             | existing Tasks specs 15/15 desktop; **51/51** (existing + new `tasks-v2-013.spec.ts`) on desktop, iPad landscape and Pixel 7 against a **production build** (`next build --webpack` + `next start`)                                                                    |
| Browser/visual                                                | desktop light and phone dark screenshots of All Tasks, Checklists and the form inspected                                                                                                                                                                               |

Not run: `tests/real/*` and `tests/real/ui/*` (hosted DEV — requires approval), Safari/WebKit, a screen reader, hosted DEV acceptance, CI on the head.

Harness notes: the Next **dev** server's "Insight" badge overlays the phone dock and intercepts a click in `tasks.spec.ts › TASK-084` on `server-mobile`; this is dev-overlay only and the test passes against a production build. `npm run dev` also prints a security-advisory nudge on alternate starts (tool output, not acted on; rerun works). `supabase db reset --local` + `test db --local` from the worktree (no `.env.development.local` in the cwd for any `supabase` command).

## Rollout, migration and rollback

- Order (migrations first, application second): apply the two migrations to hosted DEV through the established rehearsed route (backup + isolated rehearsal + Management API one-transaction apply + verifier), then deploy the app. Old app on new schema works (defaults); **new app on an unmigrated database fails** (missing `p_checklist` argument/table).
- Additive: no existing row is rewritten; `archived_at` is null and `checklist_rev` 0 for everything.
- Rollback: redeploy the previous app (compatible with the new schema). Dropping the schema change is manual and destructive for steps/archives — drop the new table, columns and functions and recreate the previous `task_create` (13 args), `task_update` (9 args), `task_set_status`, `task_reopen` from `20261107160548_tasks_location_scoping.sql`; enum values cannot be removed. Prefer rolling forward.
- No `supabase/seed`, no Production, no `main`, no migration 92.

## Known limitations / deferred

- Per-step responsible employee: not implemented (brief: only if clean) — steps inherit the task's assignment.
- No "restore from archive" action; archived tasks are visible only in History (completed) and the audit trail.
- A repeating **series** has no checklist (occurrences are generated rows); the editor hides steps when a repeat is selected.
- Blocked cannot be chosen from the row dropdown (it needs a reason): use the detail dialog.
- All Tasks vs Assigned overlap (see above); the full-screen detail "page" remains the existing dialog.
- Opening/Closing checklist items remain separate (whole tasks); the new Checklists tab is for ordinary-task steps only.

## Batch B / C seam (nothing speculative built)

Chore Board Template / Cycle / Completion should be new tables keyed to `(organization_id, location_id)` with their own RPCs and `task_events`-style append-only history; do **not** reuse `tasks.status` for cycles. Reusable here: `tasks_is_manager`/`tasks_can_work` seams, `private.tasks_emit` attribution snapshot, the `tasks_location_people` roster, `private.task_scope_module_allows` (module policy), the `AllTasksView` filter/summary pattern, and `ChecklistEditor` for row/column editors. History month grouping (Batch C) can read `tasks.completed_at`/`archived_at` and the new event types.

## Continuation

- Read first: this file, `tasks/current-task.md`, `supabase/migrations/20261120090100_tasks_v2_013_batch_a.sql`, `src/features/tasks/domain/task-engine.ts` (`applyCommand`: update/setStatus/delete/stepSet), `src/features/tasks/components/all-tasks-view.tsx`.
- Next recommended action: owner reviews Batch A (draft PR) → approve hosted-DEV rehearsal/apply of the two migrations through the established gate → begin Batch B (Chore Wheel + Task Settings) on this branch.
- Reusable evidence: everything in the table above is valid for this head; do not re-run the full suites for unchanged code. Re-run only what a Batch B change touches (`npx supabase db reset --local && npx supabase test db --local`, `npx vitest run src/features/tasks`, `npx vitest run --config vitest.local.config.ts tests/local/tasks-*.local.test.ts` with `supabase status -o env` keys).
- Prohibited without a new approval: hosted DEV/Production writes, applying migrations beyond local, merging to `development`/`main`, migration 92, starting Batch B/C.

## Codex build prompt (for Batch B, when approved)

Read `docs/features/v2-0-13-tasks-chores/HANDOFF.md` and the Batch B section of the V2.0.13 brief. Implement only Batch B (Chore Wheel boards, person columns, chore rows, per-cell completion, configurable rules, Task Settings editor) on `feature/v2-013-tasks-chores` without changing Batch A behavior. No scope expansion, no hosted/Production changes, no merge. Keep `tasks/current-task.md` current and run the repository gate (`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, relevant pgTAP and Playwright) before reporting.
