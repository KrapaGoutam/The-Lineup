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
