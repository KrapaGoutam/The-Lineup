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
just one at a time.

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
