# Table Rotation Multi-View — Architecture

Companion to `IMPLEMENTATION_CONTRACT.md` (authoritative for exact
decisions). This is the component/data-flow reference.

## View architecture

```
allocation-workspace.tsx (or a new thin router component above it)
  ├─ view switcher (local UI state, not synced — Undo/Redo excludes it)
  ├─ Grid          — existing rotation-board.ts reducer + table, extended
  │                   with the "allocation:operate" capability gate and
  │                   the new Delete row control
  ├─ Floor         — new: <TableMap mode="floor">
  ├─ Picker        — new: Grid half + <TableMap mode="picker">
  ├─ Servers       — new: per-member cards, + Table opens
  │                   <TableMap mode="server-picker"> in a Dialog
  └─ Dashboard     — new: summary widgets + read-only Master Rotation
                      (Grid component, readOnly=true, reused as-is)
```

## Shared data flow (all 5 views)

```
allocation-date-filter.tsx  (reused, unchanged)
        │ selects service date
        ▼
getAllocationContext(...) [allocation-data.ts, extended]
        │ returns RotationBoard + occupancy-resolved dining_tables
        ▼
one AllocationContext feeds all 5 views — no per-view data fetching
        │
        ▼
user action (any view) → allocation-actions.ts server action
        → one of the board_* RPCs (Supabase, SECURITY INVOKER)
        → writes table_rotation_entries / table_occupancy / rotation_members
          + one board_events row, all in one transaction
        ▼
Realtime: board_events INSERT on channel allocation-board-${sessionId}
        → router.refresh() on every open client, any view
```

No view maintains its own copy of rotation/occupancy state — all 5 read
from the same `AllocationContext`, refreshed by the same Realtime signal.

## Shared Floor/Picker renderer

```
<TableMap tables={resolved} mode="floor|picker|server-picker"
          onSelectTable={...} selection={...} />
        │
        ├─ SVG viewBox, one node per dining_tables row
        │  positioned via position_x/position_y (existing columns)
        │  colored via availability + --server-one..seven tokens
        │
        └─ used by: Floor (full), Picker (embedded), Server Board's
           "+ Table" (inside a Dialog/Popover)
```

One implementation, three modes via props — see `IMPLEMENTATION_CONTRACT.md`
section 11. No duplicated map component.

## Occupancy integrity (why a second table, not a bigger constraint)

```
table_rotation_entries          table_occupancy
(historical log — a table     (current-holder truth —
 can recur across many          at most one active row
 rounds over a shift,            per table per session,
 that's expected)                enforced transactionally)
        │                              │
        └────────── both written in the same
                     board_assign transaction ──────────┘
```

See `IMPLEMENTATION_CONTRACT.md` section 6 for the full reasoning (why a
plain unique index on `table_label` would break legitimate history reuse,
and why a client-side "already shown occupied" check is insufficient for
concurrent devices).

## Theme

```
src/app/globals.css  →  :root (dark tokens), :root[data-theme="light"] (override)
        │
src/hooks/use-theme.ts  →  useTheme() (useSyncExternalStore, localStorage
                            key "serviceflow-theme", sets
                            document.documentElement[data-theme])
        │
all 5 views style only via the CSS variables / their @theme inline mapping
— no new palette, no dark: variant strategy
```

## Upgrade 1.1: cell lifecycle

```
table_rotation_entries.status: 'active' | 'ended' | 'skipped'
  (absent row = Empty; four states total, see
  TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md section 2)

board_assign   → creates/edits an active row (guards against
                 overwriting an ended/skipped row)
board_transfer → deletes the source row, inserts an active row at the
                 destination's earliest EMPTY round (no row at all for
                 that member) -- never the destination's ended/skipped
                 rows, which stay untouched
board_end_table→ updates status='ended' in place -- row survives, the
                 occupancy trigger releases the physical table as a
                 side effect of status no longer being 'active'
board_clear_cell (Unassign) → still a hard delete, for any status
board_skip_turn→ inserts status='skipped', table_label=null into a
                 genuinely empty round -- never claims occupancy
                 (label is null, so the trigger's own "no label, no
                 claim" branch already covers it)
```

`resolveFloorTables` (`floor-layout.ts`) only counts `status==='active'`
cells as occupying a table, so Floor/Picker/Servers/Dashboard's metrics
all inherit the Ended/Skipped distinction from one place. The Grid
(`allocation-workspace.tsx`'s `TableEntry`) renders each status
differently: Empty → Assign/Skip Turn; Active → Edit/Unassign; Ended → a
struck-through history badge + Unassign-as-correction; Skipped → `0` (a
`role="status"` element, not an editable input) + Unassign-as-correction.

**Transfer and End Table are Floor-only** (a follow-up UI refinement,
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 7): `TableEntry` —
shared by Grid and Picker, since Picker renders the same underlying
rotation table Grid does — never renders a Transfer or End control.
`floor-view.tsx` is the one surface calling
`board_transfer`/`board_end_table` from the UI. The RPCs, `BoardAction`
variants, and `applyBoardAction` cases are unaffected — only
`TableEntry`'s own buttons were removed.

## Upgrade 1.1 follow-up: multi-table per server, Floor decision dialog, Picker popup

```
findEarliestEmptyRoundForColumn(board, columnId)  -- rotation-board.ts
  the one definition of "this column's next free slot," shared by
  board_transfer's destination search, the new board_end_and_assign
  RPC's destination search, and every client-side "create a new
  assignment" call site (Floor direct assign, Floor's Assign Also,
  Servers' + Table). Replaces each of those having its own (or, before
  this fix, sharing one global "current round") notion of where a new
  assignment belongs -- that shared-pointer collision was the entire
  root cause of the original "assigning a second table auto-transfers
  the first" bug.

getActiveTablesForColumn(board, columnId)  -- rotation-board.ts
  every status==='active' row for one column, across all its rounds.
  Floor's decision-dialog trigger (zero vs. one-or-more) and its
  "which existing table" sub-pickers both read from this.

FloorView's decision dialog (Dialog primitive, see below)
  zero active tables -> assign directly (findEarliestEmptyRoundForColumn)
  one or more         -> Assign Also | Transfer | End existing table(s) & Assign | Cancel
    Assign Also       -> board_assign at the column's own earliest empty round
    Transfer          -> board_assign relabeling the CHOSEN existing round
                          in place (same server, same round -- NOT
                          board_transfer, which is cross-server)
    End existing        -> board_end_and_assign RPC, p_end_round_ids
      table(s) & Assign     bigint[] -- one, several, or every one of the
                             column's active rounds; all-or-nothing
                             validation; one transaction, one
                             board_events row regardless of selection size
```

Floor's End sub-step is a checkbox multi-select (`selectedEndRoundIds`,
a `Set<string>`), not a single-choice list -- "Select all"/"Clear all",
a running "N of M selected" count, and a primary action disabled until
at least one is checked. Exactly one active table still skips the
sub-step and acts immediately, same as before this follow-up.

`components/ui/dialog.tsx` is new: a native `<dialog>`-based component
(no headless-UI dependency added — consistent with every other
`components/ui/*` file wrapping a plain native element). Used for both
the Floor decision dialog and Picker's TableMap popup (Picker no longer
renders `<TableMap>` inline below the rotation grid — selecting an empty
cell shows "Choose table"/"Skip turn instead," and "Choose table" opens
the map inside this `Dialog`). Picker never opens the Floor decision
dialog: its target cell is always an explicit, already-selected empty
cell, so a second table for an already-busy server is always
unambiguous (an additional active row), never something to ask about.

## Retention (v1 scope)

```
board_events (created_at)  →  scheduled job, service-role only,
                               delete rows older than 7 days
                               (safe: no incoming FKs)

table_rotation_entries / rotation_rounds  →  NOT deleted by this feature
                               (Feature 028's historical date navigation
                                depends on this data remaining queryable;
                                deferred pending product sign-off)
```
