# V2.0.13 — Tasks, Checklists and Chore Wheel · Batch A (Existing Tasks and Checklists) + Batch B (Chore Wheel)

Branch `feature/v2-013-tasks-chores`, worktree `.tmp/v2-013-tasks-chores`, base `origin/development` `5aa3a81f` (PR #360 merged). One major feature branch for Batch A → B → C, **draft PR #363**. **Not merged to `development`. `main` and Production untouched. Hosted DEV untouched (all three migrations are local-only).**

| Batch | Status                              | Commits                                                                                                                    | Migrations                                      |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A     | implemented, reviewed, CI-gated     | `a3a26ea` (DB), `1b9eaf9` (app/tests/handoff)                                                                              | `20261120090000`, `20261120090100`              |
| B     | implemented locally (see "Batch B") | `57e7560` (Tips test clock fix), `fbe7d0f` (DB layer), then the Batch B application commit (`git log --oneline` on branch) | `20261121090000_chore_wheel_v2_013_batch_b.sql` |
| C     | NOT started (seam documented below) | —                                                                                                                          | —                                               |

Implementation head: the commit that carries this file (`git log -1 -- docs/features/v2-0-13-tasks-chores/HANDOFF.md`). The exact SHA, PR URL and CI run are in the final report and the PR.

**Batch A is described first (unchanged); Batch B starts at "# Batch B — Chore Wheel".**

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

## Batch B / C seam as planned in Batch A (superseded: see "# Batch B" below for what was built)

Chore Board Template / Cycle / Completion should be new tables keyed to `(organization_id, location_id)` with their own RPCs and `task_events`-style append-only history; do **not** reuse `tasks.status` for cycles. Reusable here: `tasks_is_manager`/`tasks_can_work` seams, `private.tasks_emit` attribution snapshot, the `tasks_location_people` roster, `private.task_scope_module_allows` (module policy), the `AllTasksView` filter/summary pattern, and `ChecklistEditor` for row/column editors. History month grouping (Batch C) can read `tasks.completed_at`/`archived_at` and the new event types.

# Batch B — Chore Wheel, customizable boards and Tasks-local settings

## Batch A review gate (done at the start of Batch B)

- **PR #363 CI on `1b9eaf9`**: `application` pass, `browser-smoke` pass, Vercel pass, **`migrations-and-policies` FAIL**. The only failing assertion in the whole database job was pgTAP `0066_tips_location_scoping` test 32 (1 of 3,941): `caught 22023 "The interval must start on the service date." wanted 42501`.
- **Classification: baseline defect, not caused by this branch.** The `0066` fixture location has the default time zone `'UTC'` and the test compared `current_date` with `now() + interval '3 hours'`; the V2.0.8 service-date rule (migration `20261119120000`) rejects the interval from 21:00 UTC to midnight. Evidence: development's own `Database` run passed at 19:03Z, this branch failed at 22:53Z; reproduced and then cleared with a fake clock against the local DB (12:00Z pass, 22:57Z fail identical to CI, 22:57Z and 23:59Z pass after the fix). Neither Batch A migration references Tips. Fixed narrowly in its own commit `57e7560` (test-only, two lines) because it turns this PR red for three hours every day; it can be dropped or cherry-picked independently.
- **`LayoutProps` TypeScript error**: reproduces only when Next's generated route types (`.next/types`, `.next/dev/types`) are absent (`src/app/layout.tsx(37,50) TS2304`); `npm run typecheck` (`next typegen && tsc`) and CI are clean. `layout.tsx` is untouched by this branch: baseline/generated-types artifact, nothing to fix.
- **Batch A contract compatibility**: the Batch A migrations and RPCs are unchanged; Batch B adds one file and touches no existing table, function or policy. The full pgTAP suite (96 files, 4,070 tests) and the Batch A local suites (24) pass on top of it.
- **Material risks found in Batch A**: none that block Batch B.

## Outcome (Batch B)

Inside the existing Tasks module (no second app):

- **Chore Wheel** tab (all roles with Tasks access): board header (name, organization · branch, cycle number), summary (required checks, completed, remaining, percent, optional chores shown separately), and the matrix. Cells are real checkboxes (`role=checkbox`, `aria-checked`, 44 px target) with six honest states: required open / required done / optional open / optional done / **not applicable** (a dash, not interactive) / **covered** (an any-one chore already done by someone else). A cell the viewer may not change is `aria-disabled` with the reason as its description. Desktop and tablet: matrix with a sticky chore column and horizontal scroll for many people. Phone: one person at a time (their own column first) over the same data.
- **Tasks → Manage** now has a section bar: **Task setup** (the existing series / templates / handoff panels, unchanged and still the default), **Boards**, **People / Columns**, **Chores / Rows**, **Completion Rules**, **Access / Permissions**. "Manage board" on the Chore Wheel jumps straight there.
- Boards: create, rename, describe, duplicate (configuration only), turn on/off, archive, reorder. People: add (employee or unassigned position), edit label, reassign (history kept), turn off, remove, reorder. Chores: add, "add several" (one per line), edit instructions, required/optional, rule per chore, selected people, turn off, remove, reorder.
- Rules: **all columns required**, **selected people required**, **any one person** are all implemented and counted correctly (see below). Recurrence and reset are persisted on the board but the controls are labelled **"Reserved — not active yet"**; nothing repeats or resets.
- Access: who may check items (own column vs shared tablet) and an explicit **manager-correction** switch (off by default).
- Demo mode has a seeded "Daily Refill & Prep" board built through the same engine (real mode starts empty; nothing is seeded in any database).

## Data model (migration `20261121090000_chore_wheel_v2_013_batch_b.sql`, local only)

Template and execution are separate tables; every child references stable ids, never names or positions.

| Table                      | Role                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chore_boards`             | TEMPLATE + settings: `(organization_id, location_id)` composite FK to `locations`, name (unique per live location), `is_active`/`archived_at`, `sort_order`, `staff_access`, `manager_override`, `default_requirement_mode`, **reserved** `recurrence_intent`/`reset_intent`, `version` |
| `chore_cycles`             | EXECUTION identity: `(board_id, sequence)` unique, `status open/completed/closed`, partial unique index = **one open cycle per board**. Batch B only ever creates cycle 1                                                                                                               |
| `chore_columns`            | people / positions: `label` (what the board shows) vs `profile_id` (the employee, nullable = unassigned position), `is_active`, `archived_at`; one live column per person per board                                                                                                     |
| `chore_column_assignments` | who held a column over time (open row has `ended_at null`)                                                                                                                                                                                                                              |
| `chore_rows`               | chores: `is_required`, `requirement_mode`, `is_active`, `archived_at`                                                                                                                                                                                                                   |
| `chore_row_columns`        | selected-people applicability                                                                                                                                                                                                                                                           |
| `chore_completions`        | currently completed cells of a cycle, `unique (cycle_id, row_id, column_id)`; `completed_by` (the real actor) + `completed_by_name` snapshot + `entered_as` (`self`, `position`, `shared`, `manager_correction`)                                                                        |
| `chore_events`             | append-only audit (trigger like `task_events`); row/column/cycle ids are plain identifiers so the record outlives any structure change                                                                                                                                                  |

Composite foreign keys make "same board" a database fact (a completion cannot point at a row or column of another board). `chore_boards.organization_id` cascades from `organizations` so tenant teardown keeps working.

**RLS / grants**: clients have `SELECT` only on all eight tables, no `anon` privilege at all. Boards are visible to a caller with location access and the Tasks module on; staff see live boards only, managers also turned-off and archived ones. Assignment history and the audit trail are manager-only reads. (Direct RLS reads of a visible board's children include archived rows/columns; the app never shows them to staff. Decision recorded below.)

**Eleven `SECURITY DEFINER` RPCs** (`set search_path = ''`, executable by `authenticated` only): `chore_board_save`, `chore_board_set_state`, `chore_board_duplicate`, `chore_board_reorder`, `chore_column_save`, `chore_column_set_state`, `chore_columns_reorder`, `chore_row_save`, `chore_row_set_state`, `chore_rows_reorder`, `chore_cell_set`. Rules every one follows:

- **Authorize first, validate after** (the security sweep caught the opposite order: validation feedback before authority).
- The board's own location decides authority (`tasks_can_access_location` + `tasks_is_manager`, module gate), never a client-supplied location. "No such board" and "not yours" return the same 42501 message (no existence oracle).
- `chore_cell_set` has **no actor argument**: the actor is `auth.uid()`, so a completion can never be attributed to someone else (PostgREST rejects an extra `p_actor` argument; tested).
- Idempotent writes: a repeat tick is `unchanged` and never overwrites the first completer; ticks of one chore serialize on the chore row, ticks share-lock the board while structure edits lock it exclusively (no deadlock cycle: board first, always).
- Soft removal only (`is_active` / `archived_at`): nothing a completion references is ever deleted; archiving a board keeps every completed record.

**Who may tick a cell** (`chore_cell_set`, mirrored for UI hints in `chore-rules.ts → canTickCell`): the column's own employee (`self`); anyone on the workforce for an unassigned position column (`position`); anyone on the workforce when the board is `any_workforce` (`shared`); a manager only when the board's `manager_override` is on (`manager_correction`). The completion is always recorded under the real caller's name.

**Counting** (`boardProgress`): all-columns = live chores × live columns; selected = only the selected live columns; any-one = **one** check per chore, done when any live column completed it; not-applicable cells and optional chores never count. Turning a column or chore off or removing it changes the total but never rewrites a completion.

## Authorization boundary (application)

`runChoreCommandAction` follows the Tasks order: live session → verified actor/scope → stale-tab expectation → module gate → the named boards must belong to the **verified** location → RPC. `getChoreSnapshotAction` reads through the caller's own session (RLS decides). Commands carry no actor, location or timestamp.

## Application map

`domain/chore-types|rules|commands|engine|demo-chores.ts` (pure model, progress, commands, demo twin of the RPCs), `data/chore-mapper|chore-data.ts` (paged loader of the OPEN cycle), `actions/chore-actions.ts`, `hooks/use-chore-controller.ts` (real/demo seam; lazy first load; optimistic tick that **reverts on any failure**; in-flight guard against rapid taps), `components/chore-wheel-view|matrix|person-list|cell.tsx` and `chore-settings*|boards|people|rows|rules-section.tsx`. `TasksState.chores` (optional) carries the demo boards so they survive tab switches. `TasksWorkspace` gained an optional `chores` prop (absent = no Chore Wheel tab).

## Tests and evidence (all local; nothing hosted)

| Layer                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP `0093_chore_wheel_v2_013_batch_b`                             | 129 assertions: grants/RLS, cross-location and cross-organization, board/column/row CRUD, reserved intent persisted not enforced, stale-version conflict, eligibility, one-column-per-person, reassign history, label ≠ account, all three rule modes, no impersonation, override flag, shared tablet, inactive/archived boards, duplicate (configuration only), audit append-only                                |
| pgTAP re-pin `0088`                                                 | SW-R2 126 → 137 functions; SW-R10 40 → 41 management RPCs (`chore_board_reorder`; `chore_cell_set` is worker-level). The sweep also forced authorize-before-validate in four RPCs                                                                                                                                                                                                                                 |
| Full pgTAP on a clean `db reset` (ledger 103)                       | **96 files / 4,070 tests PASS** (includes the clock-fixed `0066`)                                                                                                                                                                                                                                                                                                                                                 |
| Real-JWT local suite `tests/local/chore-wheel-v2-013.local.test.ts` | 10/10 with real GoTrue sessions through the real actions, loader and RPCs: end-to-end build, persistence across reloads, impersonation and spoof refused, override, selected/any-one rules, **race: exactly one winner**, **4 rapid taps write once**, cross-location/org (action and RPC, no oracle), reassign history, turned-off/archived direct requests, duplicate. Batch A local suites still pass (7 + 17) |
| Vitest                                                              | full suite 358 files / 4,854 passed, 7 skipped (new: engine 23, mapper 3, controller 7 incl. revert-on-error, in-flight guard, demo stale-state regression verified by mutation)                                                                                                                                                                                                                                  |
| Playwright (demo, production build)                                 | `chore-wheel-v2-013.spec.ts` 13 passed + 2 skipped by design on desktop, iPad landscape and Pixel 7; with the existing Tasks specs 64 passed (no regression)                                                                                                                                                                                                                                                      |
| Static                                                              | `npm run check` (Prettier, ESLint 0 warnings, `next typegen` + `tsc`) clean; `next build --webpack` passes                                                                                                                                                                                                                                                                                                        |
| Browser/visual                                                      | desktop and phone screenshots of the Chore Wheel, People and Completion Rules inspected                                                                                                                                                                                                                                                                                                                           |

Not run: `tests/real/*` and `tests/real/ui/*` (hosted DEV — needs approval), Safari/WebKit, a screen reader, hosted DEV acceptance, a real-mode (cookie-session) browser run of the Chore Wheel, CI on the Batch B head until it is pushed.

## Decisions taken (flag any you want changed)

1. **Location is fixed at creation** (the board belongs to the branch it was created in; no "move board" action) — moving a board would break the tenant/location contract of its completions. Duplicate is per location.
2. **Manager correction is off by default** and is an explicit board setting (brief: "only where explicitly permitted"). The demo board turns it on.
3. **Unassigned position columns** can be ticked by any workforce member (a prep position has no single owner).
4. **Optional chores** are supported at row level (counted separately, never in the total).
5. **Recurrence/reset** are stored and clearly labelled reserved; no scheduler, no reset, no archival engine exists.
6. **Direct RLS reads** of a visible board include its archived rows/columns (the app does not show them to staff). Tighten only if the owner wants staff not to be able to read removed structure through the API.
7. Each tick returns a refetch of the whole Chore Wheel snapshot (same pattern as Tasks). Fine at this scale; Batch C may return only the changed board.

## Rollout, migration and rollback

- Order (migrations first, application second), same rehearsed route as Batch A: backup + isolated rehearsal + Management API one-transaction apply + verifier. **Three** migrations are now local-only: `20261120090000`, `20261120090100`, `20261121090000`. Hosted DEV ledger is still 100.
- Old app on the new schema works (the new tables are unused by it). **New app on an unmigrated database**: the Chore Wheel tab shows a load error ("Chore boards could not be loaded"); the rest of Tasks is unaffected (it uses its own actions).
- Additive: no existing table, function, policy or row is touched. Rollback: redeploy the previous app. Dropping the schema is manual (drop the eight chore tables and eleven RPCs, plus `private.chore_*` helpers); no existing object depends on them. Prefer rolling forward.

# Batch C seam (implement against THIS schema)

Nothing below is built. Batch B left these hooks on purpose.

**Cycle completion + restart (exactly once, atomic).** One `SECURITY DEFINER` RPC, e.g. `chore_cycle_close_and_restart(p_board_id, p_expected_cycle_id, p_reason)`:

1. `private.chore_board_authorize(p_board_id, <manager or worker as decided>, 'update', true)` — it already takes the board row `FOR UPDATE`, which serializes against ticks (`FOR SHARE`) and against any second closer.
2. Compare `private.chore_open_cycle(board)` with `p_expected_cycle_id`; a mismatch means someone else already closed it → return the current cycle (idempotent, exactly-once for retries and for a scheduler running twice).
3. Take the **immutable snapshot** from the template as it stands now (see below), then `update chore_cycles set status = 'completed' | 'closed', closed_at, closed_by`, then `insert` the next cycle with `sequence = max + 1`. The partial unique index `chore_cycles_one_open_idx` and `unique (board_id, sequence)` make a double restart a unique violation, never two open cycles.
4. Completions of the closed cycle stay where they are (they are keyed by `cycle_id`; the loader reads only the open cycle). Add a trigger that refuses insert/delete on `chore_completions` whose cycle is not `open`.

**Immutable cycle snapshots.** Unticking deletes the completion row (the audit event keeps the history), so the snapshot MUST be written at close: new additive tables, e.g. `chore_cycle_snapshots` (cycle id, board name and settings, totals via the same rules as `boardProgress`, trigger = manual / automatic) and `chore_cycle_snapshot_cells` (row id + **title copied**, column id + **label copied**, assignee at the time, state, `completed_by`, `completed_by_name`, `completed_at`, `entered_as`). Copy titles and labels: later renames must not rewrite history. `chore_boards.version` only moves on board settings, not structure, so do not rely on it as a structure version. The SQL port of the counting rules must be tested against `chore-rules.ts` fixtures (all / selected / any-one, optional, inactive).

**History.** Read `chore_cycles where status <> 'open'` grouped by month of `closed_at` in the **location's** time zone (`locations.time_zone`), then by status; cells from the snapshot tables; corrections and audit from `chore_events` (it already has `cycle_id`). Do not mix with `tasks`/`task_events` History (Batch A kept those separate).

**Corrections of a past cycle.** Append-only (new event types or a `chore_cycle_corrections` table); never mutate a snapshot.

**Automatic cycles.** `recurrence_intent` / `reset_intent` are already on the board. A scheduler must call the same RPC with the expected cycle id (idempotent by construction), compute the boundary in the location's time zone, and needs a decision for the **actor** (`chore_cycles.opened_by` / `closed_by` are `NOT NULL` profile ids): a system profile, or the manager who enabled it. No application-side cycle creation.

**Schema concerns to settle first.** (1) Changing a chore's rule or selected people mid-cycle leaves existing completions in place (ignored by counts as not-applicable): decide whether a rule change must wait for the next cycle or snapshot the rule. (2) Any-one chores that were completed by several people before the mode changed count once. (3) The per-tick full refetch should become a per-board delta once History adds more reads. (4) Hosted DEV must have all three Tasks migrations applied before any Batch C work is tested there.

# Continuation

- Read first: this file, `tasks/current-task.md`, `supabase/migrations/20261121090000_chore_wheel_v2_013_batch_b.sql`, `src/features/tasks/domain/chore-rules.ts` and `chore-engine.ts` (the executable specification of the rules), `src/features/tasks/components/chore-wheel-view.tsx`, `chore-settings.tsx`.
- Next recommended action: owner reviews PR #363 (Batch A + B), decides the seven items above, authorizes the rehearsed hosted-DEV apply of the three migrations; **then** Batch C (cycles/reset/History) on this branch.
- Reusable evidence: everything in the Batch B table is valid for this head; do not re-run the full suites for unchanged code. Re-run only what a change touches: `SUPABASE_PROJECT_ID=restaurant-roster npx supabase db reset --local && … supabase test db --local` (the CLI otherwise reads a foreign project id from `.env.development.local`), `npx vitest run src/features/tasks`, the local suites with `supabase status -o env` keys, and Playwright against a production build (`next build --webpack` with `NEXT_PUBLIC_DEMO_MODE=true`, `next start -p 3100`, `PLAYWRIGHT_BASE_URL=http://localhost:3100`).
- Prohibited without a new approval: hosted DEV/Production writes, applying migrations beyond local, merging to `development`/`main`, migration 92, starting Batch C.

## Codex build prompt (for Batch C, when approved)

Read `docs/features/v2-0-13-tasks-chores/HANDOFF.md` (Batch B and "Batch C seam"). Implement only Batch C (atomic cycle completion and restart, immutable cycle snapshots, automatic-cycle scheduling, redesigned month/status-grouped History, historical corrections) on `feature/v2-013-tasks-chores` against the Batch B schema, without changing Batch A or Batch B behavior. No scope expansion, no hosted/Production changes, no merge. Keep `tasks/current-task.md` current and run the repository gate (`npm run check`, `npm run test`, `npm run build`, relevant pgTAP, real-JWT and Playwright) before reporting.
