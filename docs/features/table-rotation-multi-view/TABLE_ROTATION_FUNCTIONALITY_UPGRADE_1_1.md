# Table Rotation Multi-View — Functionality Upgrade 1.1

Status: implemented, tested, locally validated. No prior copy of this
spec existed in the repo — this document formalizes the requirements as
given, then reconciles them against the actual current architecture (not
the originally frozen contract, which this feature already deviated from
once — see `IMPLEMENTATION_LOG.md`). Section 7 records a follow-up
refinement to the original spec: Transfer and End Table are Floor-only
UI controls, not exposed from Grid or Picker. Section 8 records a second
follow-up: a server may hold zero, one, or many active tables at once,
Floor's assign flow must never guess which one an operator meant when
one already exists, and the Picker's TableMap must open as a popup
rather than render inline. Section 9 records a third follow-up: "End
existing table(s)" is a multi-select — the operator may end exactly one,
several, or every one of a server's active tables in the same step, not
just one at a time. Section 10 records a fourth follow-up, with Floor's
decision flow now treated as approved and unchanged: Picker's popup
opens directly from a cell click (no intermediate "Choose table" step,
Skip Turn moved inside the popup), and Server Board's `+ Table` gained
the exact same zero/one-or-more decision flow Floor uses, via a shared
`useTableAssignmentDecision` hook, plus per-table Transfer/End/Unassign
scoped to one tapped assigned table. Section 11 records a fifth
follow-up: Floor's own available-table "pick a server" step also became
a popup (matching Picker/Server Board), and every assigned tile
(Floor/Picker/Servers, via the shared `TableMap`) now shows the current
server's initials and accent color instead of a color-only indicator,
with a new compact server legend on Floor.

## 1. Scope

Upgrades the already-shipped Table Rotation Multi-View (Grid, Floor,
Picker, Servers, Dashboard, Master Rotation, occupancy, permissions,
auto-row, Undo/Redo) with five distinct assignment-lifecycle actions.
This is additive to that system, not a rebuild.

## 2. Domain semantics (frozen for this upgrade)

- **Assign** — create a new ACTIVE assignment into a genuinely empty
  cell. Physical table becomes occupied. A `table_rotation_entries` row
  is created.
- **Transfer** — move the _same_ active assignment to another server.
  The physical table stays occupied throughout (ownership changes, not
  availability). The record relocates to the destination server's
  earliest genuinely empty cell — never overwriting a Skipped or Ended
  cell, never leaving an artificial gap at the source.
- **End Table** — complete active service at that table. Physical table
  becomes available. The historical entry is preserved, marked
  ended/finalized — it is not deleted.
- **Unassign** — remove the current active assignment as a correction.
  Physical table becomes available. The entry is deleted, not preserved
  as history, and does _not_ become a Skip.
- **Skip Turn** — explicitly record that a server's turn produced no
  table. Rendered as `0`. Represented semantically (a real skipped
  state), never as the literal table label `"0"`. Occupies no physical
  table. Counts as a used cell for the auto-row rule.

Empty / Skipped / Ended / Active are four distinct states. Only genuinely
empty cells (no row at all) are treated as available slots for Assign,
Transfer-compaction, or Picker's "choose table."

## 3. Reconciliation against the current architecture

Read directly from `supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql`
and `src/features/allocation/**` before writing anything new:

- `table_rotation_entries` today has no lifecycle concept — a row's mere
  existence means "active"; `board_clear_cell` deletes it outright
  (matches Unassign exactly already). There is no way to mark a row
  Ended or Skipped without a schema change.
- Occupancy (`section_assignments`) is derived automatically by the
  `private.sync_table_occupancy` trigger on `table_rotation_entries`
  INSERT/UPDATE/DELETE — it only ever looks at `NEW.table_label`. Adding
  a lifecycle `status` column means the trigger must also check status,
  not just label presence, before claiming occupancy.
- `board_assign`'s upsert key is `(rotation_round_id, rotation_member_id)`
  — a "transfer" implemented as a second `board_assign` call into a
  _different_ member's row for the _same_ round (what the original Floor
  transfer flow did) leaves the source cell's stale text behind. That is
  **not** real transfer semantics and is corrected by this upgrade (see
  section 5).
- Auto-row's "empty round" check (`exists(select 1 from
table_rotation_entries where rotation_round_id = …)`) already counts
  _any_ row regardless of a future `status` value as "not empty" — no
  change needed there. Skip/End naturally count as used cells for free.
- Undo/redo is a `case event_type` dispatch against `board_events.payload`
  / `inverse_payload` — new event types (`transfer`, `end`, `skip`) need
  their own branches, following the exact existing pattern.

## 4. Chosen schema change (additive)

`table_rotation_entries` gains:

```sql
add column status text not null default 'active'
  check (status in ('active','ended','skipped')),
add column ended_at timestamptz,
alter column table_label drop not null,
add constraint table_rotation_entries_label_status_check check (
  (status = 'skipped' and table_label is null)
  or (status <> 'skipped' and table_label is not null)
)
```

No new tables. This is the smallest change that lets one row represent
all four states: absent row = Empty; `status='active'` = Active;
`status='ended'` = Ended (history preserved, table free); `status='skipped'`,
`table_label=null` = Skip (renders as `0`, never a real label).

`private.sync_table_occupancy` gains one guard: only attempt an
occupancy claim when `NEW.status = 'active'` and `NEW.table_label is not
null`; otherwise (ended, skipped, or an UPDATE moving _away_ from active)
release any existing claim for that entry and stop — exactly the same
"release" branch already used for DELETE.

New RPCs (all `SECURITY INVOKER`, all gated by the existing
`private.assert_is_active_board_member`, all writing one `board_events`
row, following the established one-RPC-per-action convention):

- `board_transfer` — validates the source is `active`, finds the
  destination member's earliest round with _no row at all_ for that
  member, deletes the source row (releases occupancy), inserts the
  destination row with the same label (claims occupancy) — one
  transaction.
- `board_end_table` — `update … set status='ended', ended_at=now()` on
  the target entry. The trigger releases occupancy as a side effect;
  history stays because the row is never deleted.
- `board_skip_turn` — inserts a `status='skipped', table_label=null` row
  into a genuinely empty target cell, guarded against overwriting an
  existing active/ended/skipped row the same way `board_assign` now is.

`board_assign` gains a guard: reject (don't silently overwrite) if the
target `(round, member)` already holds a non-active row (ended or
skipped) — assigning into an occupied historical slot is never correct;
the UI routes new assignments to a genuinely empty cell instead (which is
exactly what Transfer-compaction and re-assign-after-End already do).

`board_event_type` gains `transfer`, `end`, `skip`. `board_undo`/
`board_redo` gain matching branches (see `IMPLEMENTATION_LOG.md` for the
exact inverse-payload shape chosen for each).

## 5. Frontend surfaces touched

- `rotation-board.ts` (demo-mode pure reducer): `RotationCell` gains a
  `status` field; new `BoardAction` variants `transfer`, `end-table`,
  `skip-turn`; `applyBoardAction` gains matching cases with the same
  compaction/guard rules as the RPCs, so demo mode and real mode behave
  identically.
- `allocation-data.ts` / `allocation-actions.ts`: read/write the new
  `status`/`ended_at` columns and call the three new RPCs.
- `floor-layout.ts` (`resolveFloorTables`): only `status === "active"`
  cells with a resolvable label count as occupying a physical table —
  Ended and Skipped never do.
- Grid (`allocation-workspace.tsx`): per-cell action set now depends on
  state — Empty → Assign/Skip Turn; Active → Edit/Unassign (Transfer/End
  are intentionally not rendered here — see section 7); Ended/Skipped →
  view + Unassign-as-correction (existing `clear_cell`, unrestricted per
  existing audit model). Skip renders as `0` with an accessible label,
  never a literal editable "0".
- Floor (`floor-view.tsx`): occupied-table panel exposes **Transfer**,
  **End table**, and **Unassign** — the one surface for all three.
- Picker: Empty selected cell gains **Skip Turn** alongside "choose
  table"; reuses the same shared `TableMap`, no new occupancy state.
  Picker renders the same shared Grid table underneath its map card, so
  it inherits Grid's Transfer/End-hidden rule automatically — no
  separate change needed there.
- Servers/Dashboard: workload and Active/Available-table metrics already
  derive from `resolveFloorTables`, so they inherit the Ended/Skipped
  distinction automatically once that function is corrected — no
  separate fix needed there beyond Master Rotation's own cell rendering
  (must show `0` for Skip, keep showing the label for Ended).

## 6. Explicit non-goals for this upgrade

No new tables, no client-side undo stack, no change to the permission
model beyond making the three new actions available wherever Active
Floor Operations already applies, no change to combined-table syntax,
no change to retention scope.

## 7. Follow-up UI refinement: Transfer and End Table are Floor-only

After the initial implementation (sections 1–6) shipped with Transfer and
End Table also exposed from Grid (an inline destination-list submenu and
an End icon on every active cell), a follow-up instruction simplified the
UI: **Grid and Picker should stay simple** for this release, surfacing
only Assign/Edit, Unassign, and Skip Turn. Floor remains the one primary
surface for the full occupied-table action set (Transfer, End, Unassign).

This is a UI-only change:

- `allocation-workspace.tsx`'s `TableEntry` component (shared by both
  Grid and Picker, since Picker renders the same table underneath its
  map card) no longer renders a Transfer button, an End button, or the
  inline "Transfer to…" destination-list submenu for an active cell —
  only Edit and Unassign remain there. The `onTransfer`/`onEndTable`
  props and the `transferTargets` prop were removed from `TableEntry`
  entirely, since nothing calls them there anymore.
- Nothing changed in the domain layer, the RPCs, or the migration:
  `board_transfer`, `board_end_table`, the `"transfer"`/`"end-table"`
  `BoardAction` variants, and `rotation-board.ts`'s `applyBoardAction`
  cases for them are all still fully implemented and tested — they are
  simply not wired to a Grid/Picker control anymore. `floor-view.tsx`
  is unaffected and still calls both.
- If a future release wants to re-expose Transfer/End from Grid or
  Picker, the domain/RPC layer needs no changes — only a UI decision to
  re-add the calling controls.

## 8. Second follow-up: multi-table per server, Floor's decision dialog, Picker's popup

### 8.1 Root cause of the reported "auto-transfer" bug

Floor's assign flow (and Servers' `+ Table`) always wrote a new
assignment into one shared "current round" pointer
(`getWorkingRound(board)`, the same round every column's next turn was
computed against). Since `board_assign` upserts on `(round, member)`, a
second Floor assignment for a server who already had an active entry in
that shared round collided with it — the trigger released the old table
and claimed the new one in the same row, which _looked_ exactly like a
transfer but was really just an unintended overwrite caused by bad round
selection, not real transfer semantics.

### 8.2 The domain model already supports multiple active tables — no schema change

`table_rotation_entries` was never limited to one active row per member:
a member can hold as many rounds' worth of active rows as exist. "Mia's
active tables" is simply every `status = 'active'` row for her, across
_all_ her rounds. The fix is entirely about **which round a new
assignment targets**, not the schema:

```
findEarliestEmptyRoundForColumn(board, columnId)
```

a pure function (`rotation-board.ts`) that returns a column's own
earliest round with no cell entry at all for that column — the same
search `board_transfer` already used for its destination, now factored
out and reused by every "create a new assignment" path (Floor's direct
assign, Floor's "Assign Also", Servers' `+ Table`, and the new
`board_end_and_assign` RPC's destination search). Grid and Picker were
never affected by this bug — they always target an explicit,
already-selected empty cell, never a shared pointer.

### 8.3 Floor's decision dialog

Tapping an available table and choosing a server now branches on
`getActiveTablesForColumn(board, columnId)`:

- **Zero active tables** — assign directly into the server's own
  earliest empty round. No dialog.
- **One or more active tables** — a dialog (`components/ui/dialog.tsx`,
  a native `<dialog>` element; see 8.5) asks:
  - **"+ Assign `<table>` also"** — a plain `board_assign` into the
    server's own earliest empty round. Never touches any existing
    table. This is the multi-table case: the server simply now serves
    more than one table.
  - **"Transfer an existing table"** — **same server, same ongoing
    turn**: this relabels one existing active row _in place_ via
    `board_assign`'s own upsert-in-place onto that row's _own_ round
    (not a fresh round) — the physical table changes, the round/entry
    doesn't. This reuses `board_assign` directly, **not**
    `board_transfer` (which moves a table between two _different_
    servers, keeping the same label — Floor's pre-existing
    occupied-table-tap flow, unchanged and still using
    `board_transfer`). If the server has exactly one active table, this
    acts immediately; with more than one, a sub-step asks "Which table
    should be replaced by `<table>`?" and lists each by label — the
    operator picks, never an assumed oldest/newest/first/last.
  - **"End existing table(s) & assign `<table>`"** — the new
    `board_end_and_assign` RPC (8.4): ends one or more chosen rows in
    place (history preserved, each as its own separate, distinct entry)
    and creates one brand new active row for the same server. With more
    than one active table, a sub-step is a **multi-select** (see
    section 9) — the operator may end exactly one, several, or every
    one of them in the same step, not just one at a time.
  - **"Cancel"** — closes the dialog with zero state changes.

Only the one specifically selected table is ever affected by Transfer,
End, or Unassign — a server's _other_ active tables are always left
alone, whether reached through this dialog or through the pre-existing
occupied-table-tap flow.

### 8.4 New RPC: `board_end_and_assign`

`supabase/migrations/20260921100000_table_rotation_multi_table_per_server.sql`
(original, single-round version), superseded by
`supabase/migrations/20260922100000_table_rotation_end_multiple_and_assign.sql`
(section 9 — expands it to end any non-empty selection of rounds, not
just one). One atomic RPC (ends the selected round(s)' entries, creates
one new one, writes one `board_events` row) rather than sequential
client calls — a transactional RPC was chosen specifically to avoid a
partial-failure window where some old tables are ended but the new
assignment never lands. Destination round search happens server-side
(same logic as `board_transfer`'s), so it can't race against a stale
client-side read. New `board_event_type` value `end_and_assign`;
`board_undo`/`board_redo` gained a matching case branch each. Undoing it
reactivates the ended row(s) via the exact same
`update ... set status = 'active'` path `board_end_table`'s undo already
uses, so it gets the identical typed occupancy-conflict protection
(proven in `0021_table_rotation_upgrade_1_1.test.sql`) for free — no new
"don't steal a table back" logic was needed.

### 8.5 Picker's TableMap is a popup, not inline

`components/ui/dialog.tsx` is new: this repo has no
Dialog/Sheet/Popover primitive anywhere (every existing
`components/ui/*` file wraps a plain native element — see `select.tsx`).
Consistent with that, it wraps the native `<dialog>` element rather than
adding a headless-UI dependency — `showModal()`/`close()` give a focus
trap, ESC-to-close, top-layer rendering, and default focus restoration
for free. It is responsive by construction (near-full-width on small
viewports) rather than a separate mobile "Sheet" variant, since there
was no existing sheet component to stay consistent with.

Picker's flow: selecting an empty cell shows two buttons, "Choose
table" and "Skip turn instead" (unchanged). "Choose table" opens the
`Dialog` with the shared `TableMap` inside; selecting a table assigns it
and closes the popup. The map is never rendered inline below the
rotation grid. Picker still never renders Transfer/End (8.1) and never
opens Floor's decision dialog — selecting a table for a server who
already has one always just creates an additional active row (the
"Assign Also" behavior), since Picker's target cell is always already
an explicit, specific, empty cell — there is never any ambiguity for it
to ask about.

### 8.6 Explicit non-goals for this follow-up

No schema changes. No change to `board_transfer`, `board_end_table`,
`board_assign`, or `board_skip_turn`'s own signatures or guards (only
`board_undo`/`board_redo` gained a case branch for the one new event
type). No change to the Grid/Picker Transfer/End-hidden decision from
section 7. No change to combined-table syntax or occupancy semantics —
a combined label's component tables are still claimed/released
together by the same trigger, regardless of which of the paths above
touches the entry.

## 9. Third follow-up: "End existing table(s)" is a multi-select

The original 8.3/8.4 design ended exactly one existing table per
`board_end_and_assign` call. This follow-up expands it: a server may
have zero, one, or many active tables, and the operator must be able to
end **any non-empty subset** of them — one, several, or all — in the
same atomic step as assigning the newly selected table.

### 9.1 `board_end_and_assign` now takes an array

`p_end_round_id bigint` became `p_end_round_ids bigint[]`
(`supabase/migrations/20260922100000_table_rotation_end_multiple_and_assign.sql`,
which drops and recreates the function — Postgres has no in-place
parameter-type change). All-or-nothing validation, checked before
ending anything: every id in the array must currently be an active row
for that exact member, or the whole call raises
`'One or more selected tables are no longer active for this server --
refresh and try again.'` and nothing is touched. An empty array raises
`'Select at least one table to end.'` before that check even runs.
Ending is one `update ... where rotation_round_id = any(p_end_round_ids)`
— since `private.sync_table_occupancy` is a row-level trigger, it still
fires once per ended row, and if releasing any single one of them
somehow conflicts, the whole statement (and so the whole transaction)
rolls back rather than partially ending some tables and not others.

`board_events.payload`/`inverse_payload` now carry `end_round_ids` (a
JSON array) instead of `end_round_id`. `board_undo`/`board_redo`'s
`end_and_assign` branches restore/re-apply every id in the array in one
`update ... where rotation_round_id in (...)` each — same all-or-nothing
guarantee on the way back: if reactivating any one of the ended rows on
undo would steal a table from a newer valid claim, the trigger raises
and the whole undo rolls back, rather than partially restoring.

### 9.2 Floor's UI: a checkbox multi-select, not a list of buttons

`floor-view.tsx`'s "which table" sub-step for End (the analogous
Transfer sub-step is unchanged — Transfer never ends more than one row,
since it relabels a single existing row in place) is now a checklist:
every active table as a `<label><input type="checkbox">…</label>` row,
a "Select all"/"Clear all" toggle showing "N of M selected", and a
primary button reading "End N Table(s) & Assign `<table>`" — disabled
whenever the selection is empty, so the operator can never submit a
no-op. Selecting exactly one and confirming still works the same as
before; the multi-select is simply also capable of two or every one of
them. A single active table still skips this sub-step entirely and acts
immediately, exactly as it already did for one active table.

### 9.3 Explicit non-goals for this follow-up

No new event type (`end_and_assign` already existed). No change to
Assign Also, Transfer, Cancel, or the zero/one/many branch that decides
whether the decision dialog appears at all. No change to Grid, Picker,
Servers, or Dashboard — they already rendered per-table state correctly
regardless of how many tables were ended in one action. No change to
combined-table handling — each combined label is still one
`table_rotation_entries` row with multiple physical resources claimed
together, so ending it (selected or not) is unaffected by the
single-row-per-selection vs. multi-row-per-selection distinction this
follow-up is about.

## 10. Fourth follow-up: Picker direct popup, Server Board gains Floor's decision flow

Floor's multi-table decision flow (section 8) is treated as approved and
unchanged. This follow-up touches two other surfaces only: Picker's
entry path into the shared `TableMap` popup, and Server Board's `+
Table`, which previously always did a plain additive assign with no
decision dialog at all.

### 10.1 Picker: no inline Table Picker section, no intermediate click

Before this follow-up, selecting a Picker cell revealed a small
always-visible "Table picker" card below the rotation grid, with its own
"Choose table" button that opened the `TableMap` popup, plus a separate
"Skip turn instead" button next to it. That intermediate card is gone.
Selecting an eligible empty cell now opens the popup immediately
(`allocation-workspace.tsx`'s cell `onClick` sets `pickerTarget` and
`pickerMapOpen` together, instead of `pickerTarget` alone). Skip Turn
moved inside the popup itself, alongside the table layout, titled
"Choose a table for `<server>`" with "Turn `<n>`" as the description —
so the operator never leaves the popup to decide there's no table this
turn. Cancel (a plain button, plus ESC/backdrop/the dialog's own close
icon) clears both `pickerMapOpen` and `pickerTarget`, fully returning to
an unselected Picker with zero state changes. This is a UI entry-path
change only — the underlying `board_assign`/`board_skip_turn` calls, and
Picker's "never triggers Floor's decision dialog" rule (section 8, since
Picker's target cell is always an explicit already-selected empty cell),
are unchanged.

### 10.2 Server Board: `+ Table` now runs the same decision flow as Floor

`useTableAssignmentDecision` (`components/table-assignment-decision.tsx`,
new) extracts Floor's zero/one-or-more branching and its three-step
dialog (choice / transfer-pick / end-pick) out of `floor-view.tsx` into a
shared hook, parameterized by `board`, `disabled`, `onAssign`, and
`onEndAndAssign`. Floor now calls it instead of owning that state
itself; behavior is identical to before this follow-up (see section 8),
just relocated so Server Board can call the exact same hook rather than
re-implementing the same semantics a second time and risking drift.

Server Board's `+ Table` now opens the shared `TableMap` as a popup
(`<Dialog>`, titled "Choose a table for `<server>`") instead of
rendering it inline below the card — matching `ARCHITECTURE.md`'s
original "opens `<TableMap mode="server-picker">` in a Dialog"
description, which the pre-follow-up implementation had not actually
matched. Selecting an available table calls
`decision.beginAssign(label, columnId, columnName)`: zero active tables
for that server assigns immediately (unchanged outcome from before this
follow-up); one or more opens the identical Assign Also / Transfer / End
existing table(s) & Assign / Cancel dialog Floor uses. The server is
never re-asked for — the card the operator tapped `+ Table` on already
identifies it, unlike Floor, which always picks the table before the
server.

### 10.3 Server Board: per-table actions scoped to one tapped table

Each already-assigned table on a Server card is now itself a button
(`aria-label="Table <label>, assigned to <server> -- open table
actions"`), not a static badge. Tapping one opens a small dialog scoped
to that one `roundId` only: Transfer (cross-server, `board_transfer` —
the same RPC as Floor's occupied-table-tap Transfer, not the same-server
relabel from the decision dialog), End table (`board_end_table`), or
Unassign (`board_clear_cell`). A server holding T1/T3/T8 and tapping
T3's badge only ever affects T3 — T1 and T8 are untouched, matching
Floor's existing "acts on the one selected table only" guarantee.

### 10.4 Explicit non-goals for this follow-up

No RPC or migration changes — every action Server Board now performs
(`board_assign`, `board_transfer`, `board_end_table`, `board_clear_cell`,
`board_end_and_assign`) already existed and was already exercised from
Floor; Server Board simply gained UI call sites for the same
`allocation-actions.ts` dispatches `floor-view.tsx` already used. No
change to Grid — it still has no Transfer/End controls and never will
(section 7). No change to Picker's assignment semantics, only its entry
path (section 10.1) — it still never shows Transfer/End, and an
additional table for an already-busy server via Picker is still always
additive with no decision dialog, since Picker's cell is always already
explicit.

## 11. Fifth follow-up: Floor's available-table popup, ownership initials/accent, server legend

Every decision-flow semantic from sections 8-10 is unchanged. This
follow-up touches only two things: how Floor's AVAILABLE-table "pick a
server" step is presented, and how an ASSIGNED table communicates whose
it is.

### 11.1 Available-table assignment is a popup, not a side-panel section

Before this follow-up, tapping an available table on Floor revealed a
"pick a server" list inside the same always-visible side `Card` used for
occupied tables (`selected.occupiedBy` branching between the two
states). That available-table branch is now a `<Dialog>` ("Assign
`<table>`" / "Available. Select a server to assign this table to." /
one button per active server / Cancel). The occupied-table side panel
(Transfer/End table/Unassign) is untouched — this only affects the
available-table case, which the side `Card` now never renders; it falls
back to the plain "Tap a table…" placeholder whenever nothing occupied
is selected. Selecting a server always closes this popup first
(`closePanel()`), then calls the same `useTableAssignmentDecision`
hook's `beginAssign` used since section 10 — zero active tables assigns
immediately; one or more opens the decision dialog on top, exactly the
same choreography Server Board's popup already used, so a native
`<dialog>` is never left open behind another one.

### 11.2 Ownership initials + accent replace a color-only indicator

`getInitials(name)` (`floor-layout.ts`, new, pure): two-letter initials
from an existing display name — first + last name's first letters
("Mia Chen" → "MC"), or a single word's own first two letters ("Mia" →
"MI"). No new manual-entry field; always derived from the same `name`
already carried on `FloorOccupant`/`RotationColumn`.

`TableMap` (shared by Floor, Picker's popup, and Server Board's popup —
one implementation, so this applies everywhere a table tile renders)
now shows, for an occupied tile, the table label **and**
`getInitials(occupiedBy.name)` stacked in two lines, on the same
per-server accent background/border color the map already computed
(`color-mix(...occupiedBy.color...)`) — color remains supporting
information, never the sole identifier; the accessible name (`"Table
<n>, assigned to <full name>"`) already carried the full identity and is
unchanged. An available tile shows only its label, in the same neutral
`--ok` styling as before — no stale initials or color ever survive past
End/Unassign, because the tile has nothing else to render from once
`occupiedBy` is `null` (see 11.4). The "selected" (tapped) ring
(`ring-primary ring-offset-2`) was strengthened and is layered on top of
whichever background color, if any, already applies — selection is a
separate, temporary UI state, never confusable with ownership.

### 11.3 Compact server legend

`FloorLegend` (`floor-view.tsx`, new, private to that file): one row per
currently active-on-floor column (the same set Floor already computes
as `assignableColumns` for "pick a server" — paused/removed servers
excluded), each showing a color dot, initials, display name, and a live
active-table count — including columns with zero active tables right
now, so the legend reads as "the floor team," not just "who currently
has a table" (the documented choice for section 18 of the follow-up
spec: crowding was judged acceptable at up to a handful of servers,
matching the existing Floor Team model where every active column is
always visible regardless of whether it currently holds anything).
Count is a fresh `tables.filter(t => t.occupiedBy?.columnId ===
column.id).length` every render — not a separate running tally — so
Ended/Unassigned rows are automatically excluded and a Transfer's count
moves from the old server to the new one for free, with no dedicated
transfer-count logic. Rendered as a single `role="list"` /
`role="listitem"` row with `overflow-x-auto` + `shrink-0` chips — the
same working horizontal-scroll pattern already proven for the view-
switcher tabs (see `allocation-workspace.tsx`'s own comment on why that
pattern, not `flex-wrap`, is what reliably avoids page-level horizontal
overflow on mobile) — rather than wrapping to multiple rows on
tablet-width viewports. `TeamMember[]` (color source) is threaded into
`FloorView` as a new `team` prop for this — `RotationColumn` itself
carries a name but not a color.

### 11.4 End/Unassign/Transfer are visually free — no separate ownership state

Ownership visuals (tile initials/accent, legend entries/counts) are
never stored or computed independently of the same `resolveFloorTables`
occupancy read every other view already shares. Ending or unassigning a
table removes its `table_rotation_entries` active row (or marks it
`ended`) exactly as before this follow-up (sections 2/8); the next
render's `resolveFloorTables` call simply no longer attributes that
table label to anyone, so `occupiedBy` becomes `null` and the tile and
legend update with it — there is no extra "clear the ownership label"
step to forget. The same is true for Transfer: the destination server's
`occupiedBy` appears, the source's disappears, both purely as a
consequence of `resolveFloorTables` re-scanning current state, matching
section 21's requirement that Floor's ownership display can never drift
from Grid/Picker/Servers/Dashboard's own reads of the same data.

### 11.5 Explicit non-goals for this follow-up

No RPC or schema changes — this is presentation-only, reading data that
was already being returned. No change to the decision-dialog semantics
themselves (Assign Also/Transfer/End existing table(s)/Cancel, sections
8-9) or to Picker/Server Board's own popups beyond inheriting the
shared `TableMap`'s new tile rendering for free. No change to Grid or
Dashboard, which have never used `TableMap` and keep their own existing
`TableEntry`/summary rendering untouched.

## 12. Production parity fix: floor layout backfill + deployment gap

**Root cause, both confirmed directly against the live production
database (read-only queries), not assumed:**

- **Blank Floor/Picker/Servers**: `dining_tables`/`dining_areas` exist in
  production since `20260905065702_initial_schema.sql` (already
  applied) — RLS and the frontend query are both correct — but zero rows
  were ever inserted for this restaurant's only location. No migration
  ever seeded them, and there is no admin "configure your floor plan"
  UI yet, so the table simply stayed empty since the location was
  created.
- **`board_skip_turn` missing, plus more**: production had never
  received any of the five Table Rotation Multi-View / Upgrade 1.1
  migrations (`20260919120000` through `20260922100000`). This wasn't
  limited to `board_skip_turn` — `board_transfer`, `board_end_table`,
  `board_delete_row`, and `board_end_and_assign` were entirely absent,
  and the deployed `board_assign` was missing the `p_confirm_transfer`
  parameter the current frontend sends, so it also failed via
  PostgREST's exact-signature matching (every RPC call is matched by
  its full set of named parameters — an extra or missing name is
  "function not found," identical in kind to the reported
  `board_skip_turn` error). Root cause: the `deploy-migrations` GitHub
  Actions job (`.github/workflows/database.yml`) has been silently
  failing on every push to `main` since before PR #39
  (`docs/STATUS.md` already tracked one occurrence; this was its
  third), due to a `SUPABASE_ACCESS_TOKEN` privilege problem requiring
  a repo-owner action (rotate/re-scope the token) — outside any code
  fix's reach. No migration reached production in that entire window,
  including six real ones (one payroll migration plus all five Table
  Rotation Multi-View migrations).

### 12.1 The fix: one new migration, deployed alongside the five already-pending ones

`20260923090000_table_rotation_floor_layout_backfill.sql` (new,
section 11 already covers its content in the ownership-visuals
context; documented here for the production-fix angle) backfills the
canonical `DEMO_FLOOR_LAYOUT` (T1-T19 + B1-B8, identical label/position)
for this restaurant's location — scoped by organization slug, never a
hardcoded UUID, idempotent, and a no-op in every local/CI database. This
migration, plus the five already-correct-but-undeployed Table Rotation
Multi-View migrations, were applied directly to the production database
via the Supabase MCP connector's migration-apply mechanism (Supabase's
own tracked DDL path, not a manual ad hoc SQL paste) — the normal CI
path (`deploy-migrations`) remains blocked pending the token rotation
above.

### 12.2 Known follow-up: migration history bookkeeping

The MCP apply mechanism recorded each migration's `name` correctly
(matching the local filename) but stamped its `version` with the
apply-time timestamp rather than the version embedded in that filename.
Until corrected, a future `supabase db push` (once the CI token is
fixed) would not recognize these six migrations as already applied by
version number and would attempt to reapply them, which would fail
(several of the underlying `CREATE FUNCTION`/`CREATE TRIGGER`
statements are not `OR REPLACE`, and `ALTER TABLE ... ADD COLUMN` isn't
idempotent). The schema and data themselves are fully correct and
verified; only `supabase_migrations.schema_migrations.version` for
these six rows needs a metadata-only correction to match the local
filenames' timestamps before the normal CI deployment path is used
again. This requires either direct SQL access with elevated permission
(blocked for this agent by its own safety classifier, correctly) or the
repo owner's own action once they have direct database access.

### 12.3 Free-tier / extension verification

`pg_cron` (used by the already-pending retention migration,
`20260919130000_board_events_retention.sql`) was confirmed available
(`default_version` present in `pg_available_extensions`) on this exact
production project before deployment — no free-tier blocker, no
fallback needed; it installed and scheduled successfully.

### 12.4 Explicit non-goals for this fix

No RLS or grant changes were needed — both were already correct for
`dining_tables`/`dining_areas` and for every RPC (confirmed by direct
inspection before and after deployment). No changes to any already-
deployed, already-correct RPC signature. No new dummy users created;
production validation uses only the existing test/staff accounts
already known to the user, never persisted anywhere in this repo.

## 13. Production stability hotfix: concurrency, login, assignment, sync, bar seats

Full root-cause detail: `IMPLEMENTATION_LOG.md`'s "Production
stability hotfix" section. Summary of what changed:

- **`rotation_members.position` race**: `board_add_column` computed
  position client-side (`board.columns.length`); two devices adding a
  server around the same moment could compute and insert the same
  value. Now computed server-side, inside the RPC, under a row lock on
  the owning `service_sessions` row — concurrent calls for the same
  session serialize instead of colliding. New migration
  (`20260923100000`), 10 new pgTAP assertions, and a genuine two-
  connection concurrency test against local Postgres.
- **Stale first render after login**: `onSignIn` only updated local
  client state; `initial*Context` props stayed frozen at their pre-
  login snapshot. Fixed with one `router.refresh()` call right after
  sign-in.
- **Multi-device sync gap**: the existing realtime subscription was
  already architecturally correct and shared by all 5 views; added a
  secondary, debounced revalidation on tab-visible/network-reconnect
  as a fallback for events missed while disconnected.
- **Floor/Server assignment silently no-opping** (zero-active-table
  direct assign, and "Assign Also"): `findEarliestEmptyRoundForColumn`
  only matched an explicit `status: "empty"` cell, but real-mode board
  data never materializes one — a round with no
  `table_rotation_entries` row for a column simply has no cell object
  at all. One-line fallback (`cell?.status ?? "empty"`), matching the
  Grid's own already-correct convention. Shared by Floor and Server
  Board (both call the same domain function), so one fix covers both.
  Transfer and End existing table(s) & Assign were traced separately
  and confirmed unaffected (neither uses this function for its
  destination search).
- **Bar seats (B1-B8) rendering square, not round**: `row.dining_areas
?.[0]?.name` assumed an array; PostgREST returns a many-to-one embed
  as a single object. Extracted `diningAreaName()`, reads the real
  shape, still tolerates an array defensively.
- **Query failure vs. empty floor plan**: a failed `dining_tables`
  query and a genuinely unconfigured location both used to show "No
  tables are configured for this location." Added
  `physicalTablesQueryFailed` so the UI can tell them apart without
  exposing raw PostgREST/SQL error text.
