# Table Rotation Multi-View — Implementation Contract (FROZEN)

Status: FROZEN — Codex implements this contract; Codex does not redesign it
unless a section below explicitly marks a decision as open.

Planner: Claude Code. Implementer: Codex (see `CLAUDE.md`/`AGENTS.md` — this
division of labor is unchanged by this feature).

Design reference: `docs/design/table-rotation/` (primary HTML:
`approved-design-export/Table Rotation Multi-View v2.dc.html`).

Baseline before this feature (reproduced live 2026-09-19): Vitest 359/359,
Playwright 153/153 (per `docs/STATUS.md`, not independently re-run),
pgTAP 228 assertions (per `docs/STATUS.md`, not independently re-run).

---

## 1. Existing architecture summary

- Next.js 16 App Router + Supabase (Postgres/Auth/RLS/Realtime), modular
  monolith (ADR 0001). Multi-tenant via `organization_id` (+ `location_id`
  on physical/scheduling data).
- Table rotation today = **Grid only**. Data model: `service_sessions` →
  `rotation_rounds` (a "row"/turn) → `table_rotation_entries` (a "cell":
  one round × one member, holding a free-text `table_label`, e.g. `"12"`
  or the existing combined-table syntax `"12 + 13"` per
  `docs/features/003-table-allocation.md`) → `rotation_members` (a
  "column": one server/host on the floor, ordered by `position`).
- Every mutation goes through one SECURITY INVOKER RPC per action
  (`board_assign`, `board_add_column`, `board_set_column_status`,
  `board_clear_row`, `board_clear_column`, `board_clear_board`,
  `board_move_column`, `board_add_row`, `board_clear_cell`, `board_undo`,
  `board_redo` — all in `supabase/migrations/20260906140000_allocation_board_rpcs.sql`
  plus the two later fixups), each writing exactly one `board_events` row
  in the same transaction (audit + Realtime signal).
- Realtime: one `postgres_changes` INSERT subscription on `board_events`
  (`allocation-board-${sessionId}` channel) triggers `router.refresh()` on
  every open client — no client merges partial state itself.
- Undo/redo (real mode) is **server-authoritative event replay** against
  `board_events.payload`/`inverse_payload`, not a client snapshot stack.
  (A *separate*, purely client-side snapshot-stack undo/redo exists in
  `rotation-board.ts` for demo mode only — do not confuse the two or let
  new code merge them.)
- Roles: DB `app_role` enum (`owner, general_manager, shift_manager, host,
  server`) → app `AppRole` (`owner, manager, server`) → UI `Designation`
  (`owner, manager, assistant_manager, staff`). Exact mapping in
  `PERMISSIONS.md`.
- A `dining_tables` table (physical table registry: label, seat count,
  area, `position_x`/`position_y`, `combinable_group`) already exists in
  the schema but is **fully disconnected** from the rotation feature —
  `table_label` is free text with no FK to it, and no code path reads or
  writes `dining_tables` against real data (its one live import,
  `generate-section-assignments.ts`, only ever runs against a hardcoded
  in-memory demo array in `dashboard-overview.tsx`).
- **No uniqueness constraint exists anywhere that prevents two different
  rotation members from holding the same `table_label` at the same time.**
  This is the data-integrity gap this contract closes (section 6).

## 2. Reuse / Extend / Modify / New

| Capability | Disposition | Notes |
|---|---|---|
| Grid rendering, `rotation-board.ts` pure reducer | REUSE | Demo-mode shape/reducer unchanged |
| `service_sessions` / `rotation_rounds` / `table_rotation_entries` / `rotation_members` schema | EXTEND | Add `dining_table_id` link + occupancy table (section 6); no breaking column changes |
| `board_assign` | MODIFY | Add authoritative occupancy check/claim (section 6) |
| `board_clear_row` / `column` / `board` / `add_row` | MODIFY | Remove manager-only gate, open to any active member (section 12) |
| `board_move_column` (reorder), `board_set_column_status` (pause/resume/remove) | MODIFY | RLS role-array change only (section 12) — RPC bodies unchanged |
| `board_undo` / `board_redo` | REUSE | Already open to any active member; must keep working for every new mutation type this feature adds |
| `board_clear_cell` | REUSE | Already open to any active member |
| `dining_tables` | EXTEND | Becomes the live physical-table registry (seeded per location); still no RLS/behavior change needed beyond enabling reads for this feature |
| `allocation-workspace.tsx` (Grid) | MODIFY | Auto-row rule reconciliation, permission-gate removal, view-switcher chrome |
| `allocation-date-filter.tsx` | REUSE | All 5 views share the same date-scoped session |
| `allocation-actions.ts`, `allocation-data.ts` | EXTEND | New actions/queries for occupancy, Quick Add clocked-in source, row delete |
| Theme system (`globals.css` tokens + `use-theme.ts`) | REUSE | No new palette; all 5 views must support both `data-theme` values |
| lucide-react icon set already used in `allocation-workspace.tsx` | REUSE | Same icons for the same actions in new views (section 21) |
| `fetchClockedInRoster` (Tips feature) | REUSE | Exact existing pattern for Quick Add's clocked-in source (section 13) |
| Floor Map, Picker, Server Board, Dashboard views | NEW | Sections 10–19 |
| Shared Floor/Picker table-map renderer | NEW | Section 11 |
| `table_occupancy` table | NEW | Section 6 |
| `board_delete_row` RPC | NEW | Section 12 |
| Retention job | NEW | Section 21 |

## 3. Database changes

All as new, additive migrations under `supabase/migrations/` (never edit a
merged migration). Exact SQL is Codex's to write; this section fixes the
shape and constraints Codex must implement.

1. **`dining_tables` becomes live.** Add a seed migration (or a documented
   manual seed step per location, if per-restaurant floor plans genuinely
   vary — Codex must check whether `dining_tables` already has seed data
   or an existing seeding convention before deciding) populating the
   canonical layout from `reference/floor-layout-reference.png` (section 16
   below) for at least one real `location_id`. `position_x`/`position_y`
   already exist as columns — use them for the SVG layout (section 16).
2. **`table_rotation_entries.dining_table_id bigint references
   dining_tables(id)`, nullable.** Nullable because free-text labels that
   don't resolve to a registered table (e.g. typos, non-standard labels,
   a table not yet in the registry) must remain possible — the Grid's
   free-text input is not removed. Populate it by resolving `table_label`
   against `dining_tables.label` for the entry's `location_id` at write
   time (inside `board_assign`); leave it null when no match. Floor/Picker
   availability is only computed for tables that *do* resolve (i.e., are
   in the registry) — see section 6.
3. **New `table_occupancy` table** — the single authoritative "who holds
   this physical table right now" source, decoupled from the historical
   per-round grid log (see section 6 for why):
   ```
   table_occupancy(
     id bigint identity primary key,
     organization_id uuid not null references organizations(id) on delete cascade,
     service_session_id bigint not null,
     dining_table_id bigint not null references dining_tables(id),
     rotation_member_id bigint not null,
     table_rotation_entry_id bigint not null references table_rotation_entries(id) on delete cascade,
     claimed_at timestamptz not null default now(),
     released_at timestamptz,
     foreign key (service_session_id, organization_id) references service_sessions(id, organization_id) on delete cascade,
     foreign key (rotation_member_id, organization_id) references rotation_members(id, organization_id) on delete cascade
   )
   -- Partial unique index: at most one *active* claim per table per session.
   create unique index table_occupancy_active_uq
     on table_occupancy (service_session_id, dining_table_id)
     where released_at is null;
   ```
4. **Combined-table membership.** A single occupancy claim can span more
   than one physical table (`"12 + 13"`). Add a junction table rather than
   trying to encode multiple tables in one row:
   ```
   table_occupancy_members(
     table_occupancy_id bigint not null references table_occupancy(id) on delete cascade,
     dining_table_id bigint not null references dining_tables(id),
     primary key (table_occupancy_id, dining_table_id)
   )
   ```
   The uniqueness guarantee still has to hold per physical table, not per
   occupancy row — Codex must enforce that no `dining_table_id` appears in
   more than one *active* (non-released) occupancy's membership at a time.
   A partial unique index can't express this across a junction table
   directly; use a constraint trigger or an `EXCLUDE`-style check inside
   the claiming RPC under a transaction with `FOR UPDATE` row locking on
   the relevant `dining_tables` rows (or an advisory lock keyed on
   `(service_session_id, dining_table_id)`) so two simultaneous claims on
   an overlapping table set can't both succeed. This is the concurrency-
   critical piece — do not implement it as an app-level check-then-write
   without a DB-level lock or constraint backing it.
5. **`board_event_type` enum**: add `delete_row` (for the new
   `board_delete_row` RPC, section 12).
6. **RLS**: `table_occupancy` and `table_occupancy_members` get the same
   RLS shape as `table_rotation_entries` (select: any active member of the
   org; write: any active member, per section 12's opened-up permissions —
   these tables are written only from inside `SECURITY INVOKER` RPCs
   anyway, so RLS here mirrors the RPC-level checks, not a separate
   policy).

## 4. RLS / permissions

Covered fully in `PERMISSIONS.md`. Summary: `private.assert_is_board_manager`
stops being called from `board_clear_row`/`clear_column`/`clear_board`/
`add_row`; those four (plus the new `board_delete_row`) instead call a new
`private.assert_is_active_board_member` (any of the 5 DB roles, active
membership — i.e. the same population `board_assign` already implicitly
allows). `rotation_members_operate_service` RLS policy's role array gets
`server` added (for reorder / remove-from-rotation). No change to any
RLS/permission outside `src/features/allocation/**` and its RPCs —
authentication, employee-account management, payroll, and unrelated
manager/owner functions are untouched, per the user's explicit boundary.

## 5. Exact role mapping

See `PERMISSIONS.md` for the full literal table and every current gating
site. One line: after this feature, `Designation: staff` (DB roles `host`,
`server`) gains all Active Floor Operations (assign, transfer, unassign,
reorder, pause/resume, remove-from-rotation, quick add, clear cell/row/
column/board, delete empty row, add row, undo/redo, use all 5 views) but
gains nothing outside `src/features/allocation/**` — no account, role,
auth, payroll, or unrelated-settings capability changes.

## 6. Occupancy integrity solution

**Problem**: `table_label` is free text; nothing stops two different
`rotation_member` columns from claiming the same label concurrently. This
is fine for Grid-as-a-log (it's just text in a cell) but not for
Floor/Picker, which must answer "is T17 available right now" and "can two
devices both grab T17 at once" authoritatively.

**Chosen architecture**: keep `table_rotation_entries` exactly as today (a
historical per-round log — a table can legitimately appear in many rounds
over a shift as parties turn over; that is not a bug). Add `table_occupancy`
(section 3) as a **separate, single source of truth for "current holder,"
not a duplicate of history** — it always reflects at most one active
(`released_at is null`) claim per physical table per session, updated
transactionally by the same RPCs that write the grid log:

- **`board_assign`** (extended): resolve `table_label` against
  `dining_tables` for the entry's location. If it resolves to one or more
  registered tables (parse `"12 + 13"` → `["12","13"]`, matching the
  existing production combined-table syntax from
  `docs/features/003-table-allocation.md` — do not invent new syntax):
  - If none of those tables have an active claim, or the only active claim
    is already held by *this same* `rotation_member_id`: proceed — write
    the grid entry, then claim (or re-claim) `table_occupancy` for those
    tables under row-level locking (section 3.4).
  - If any of those tables are actively claimed by a **different**
    `rotation_member_id`: reject with a distinguishable error (e.g. a
    Postgres exception with a recognizable SQLSTATE/message Codex can map
    to a typed client error), naming the current holder. The client (Grid,
    Floor, or Picker — same RPC, same rule everywhere) then offers an
    explicit **Transfer** action, which re-calls `board_assign` with an
    explicit `p_confirm_transfer := true` argument; only with that flag
    does the RPC release the other holder's claim and reassign. This is
    the DB-level version of "authoritative server validation," replacing
    "disable the button client-side" (explicitly insufficient per the
    brief) with an atomic reject-or-transfer decided inside one
    transaction, immune to a race between two concurrent requests because
    the lock/constraint from section 3.4 makes exactly one of two
    simultaneous conflicting calls win.
  - If the label does not resolve to any registered table at all (free
    text with no match), no occupancy claim is made or checked — behaves
    exactly as today. Floor/Picker simply won't show that assignment as
    occupying a mapped table (expected: those views only cover the
    registered floor plan).
- **`board_clear_cell` / `board_clear_row` / `board_clear_column` /
  `board_clear_board`**: when deleting a `table_rotation_entries` row that
  has an associated active `table_occupancy` row, release it
  (`released_at = now()`) in the same transaction.
- **`board_undo` / `board_redo`**: since occupancy claims are derived
  side-effects of the same RPC calls being undone/redone, undo/redo must
  also reverse/reapply the corresponding `table_occupancy` claim/release
  inside the same `inverse_payload`/`payload` JSON already used for the
  grid entry — extend the payload shape (do not add a second, separately-
  tracked undo mechanism for occupancy).

**Why not a client-side check, and why not a plain unique index on
`table_label`**: a plain unique index on `table_rotation_entries.table_label`
would break the very common, legitimate case of the same table appearing
in multiple historical rounds. A client-side "if already shown occupied,
disable the button" check has an unavoidable race window between two
devices' simultaneous reads and writes. The `table_occupancy` +
partial-unique-index-or-lock design gives exactly one authoritative,
transactional, DB-enforced answer, decoupled from history, undo/redo-safe,
and Realtime-compatible (the existing `board_events` INSERT subscription
already triggers a refresh on every occupancy-affecting RPC, since all of
them already write a `board_events` row).

## 7. Combined-table handling

Existing production syntax (confirmed, not invented): a cell may contain
`"12 + 13"` (`docs/features/003-table-allocation.md`). New views must
**parse this same syntax**, not add a different combination mechanism.
Floor/Picker: selecting multiple adjacent/compatible tables in one
assignment action produces a `"A + B"` label and a single `table_occupancy`
row with two `table_occupancy_members` rows (section 3.4). Availability:
a table is unavailable if it appears in *any* active occupancy's member
set, whether it's the sole table or part of a combination. Undo/redo:
reversing a combined assignment releases/reclaims the whole membership set
atomically (one `table_occupancy` row, one `inverse_payload` entry).
`dining_tables.combinable_group` (existing column) should be used by the
Picker UI to *suggest* which tables are physically combinable, but must
not be used to *block* the free-text Grid path, which has never enforced
that today.

## 8. Authoritative rotation source

`table_rotation_entries` remains the authoritative log of what was
assigned when (grid truth, undo/redo truth, audit truth via
`board_events`). `table_occupancy` is a derived-but-persisted authoritative
answer to "who holds table X right now," maintained transactionally
alongside it — never computed ad hoc client-side, never a second
independently-writable source of truth.

## 9. Auto-row rule (single reconciled rule)

Replaces `private.ensure_trailing_round` (which today ensures exactly one
trailing empty round) with `private.ensure_trailing_rounds(p_service_session_id,
p_target integer default 2)`:

- **Empty round** = a `rotation_rounds` row with zero `table_rotation_entries`
  rows, regardless of any `rotation_members`' pause/active/removed status
  (member status never affects row emptiness — only presence/absence of
  entries does).
- **Trigger**: called at the end of every RPC that can add an entry to the
  *current* trailing rounds — in practice, only `board_assign` need call
  it (clear/delete/pause/reorder never add an entry, so they never need to
  top up). After the entry write, recompute the count of consecutive empty
  rounds at the tail of the session's round sequence; if that count is
  below `p_target` (2), insert new empty rounds (next `sequence` values)
  until it reaches 2.
  - This single "recompute-and-top-up-to-2" rule is mathematically
    equivalent to "when the last or second-to-last row gets a value, add
    rows to restore 2 empty trailing rows" — assigning into either of
    those two rows necessarily drops the trailing-empty count to 1 or 0,
    which the top-up then restores to 2. **Implement only the
    recompute-and-top-up version** — do not additionally implement a
    row-position check; that would be a second, redundant mechanism and a
    source of drift.
- **Manual Add Row** (`board_add_row`, opened to any active member per
  section 12) composes normally: it always appends one round at
  `max(sequence)+1`, independent of the auto-rule, and never gets
  "corrected" back down by it (the auto-rule only ever adds rows, never
  removes them).
- **Undo**: undoing a `board_assign` reverses that specific entry via its
  `inverse_payload`; it does **not** retroactively remove any rows the
  original assign's auto-top-up created. (Rationale: those rows are cheap,
  and removing them risks deleting a round a different concurrent user has
  since started using — not worth the complexity for an append-only,
  harmless side effect.)
- **Realtime/concurrency convergence**: `rotation_rounds` keeps its
  existing `unique (service_session_id, sequence)` constraint; two
  concurrent `board_assign` calls each attempting to top up will race on
  the same next `sequence` value, but the unique constraint plus a retry-
  on-conflict (or `insert ... on conflict (service_session_id, sequence)
  do nothing` in a loop advancing the candidate sequence) prevents
  duplicate/colliding rounds. No client-side auto-row logic is needed or
  permitted — clients only ever render whatever `rotation_rounds` rows the
  server returns.
- **Historical rounds**: `sequence` stays monotonic and is never
  renumbered, including across auto-created rows.
- **Clear/delete interaction**: `board_clear_row`/`clear_cell` never
  trigger the top-up (they only remove entries, never add one), and never
  delete the round itself. `board_delete_row` (new, section 12) removes a
  round row entirely, only when it has zero entries (see section 12) —
  deleting a non-tail empty round has no effect on the trailing-empty
  count; deleting a tail empty round is a no-op with respect to the rule
  (the tail was already empty).

## 10. Floor resource model

`dining_tables` (existing, now connected — section 3.1) is the resource
model: `label`, `seat_count`, `dining_area_id`, `position_x`/`position_y`
(already present, used for SVG placement), `combinable_group`, `active`.
Availability for a given table = no active `table_occupancy_members` row
referencing it for the current `service_session_id` (section 6). The Floor
view renders every active `dining_tables` row for the location using
`position_x`/`position_y` as SVG coordinates, colored/labeled by
availability + which server (if occupied) via the existing
`--server-one`…`--server-seven` design tokens (`docs/DESIGN_SYSTEM.md`).

## 11. Shared Floor/Picker renderer

One component, e.g. `src/features/allocation/components/table-map.tsx`,
React + SVG (`viewBox`-based, data-driven from `dining_tables.position_x/y`
— not a static image of the JPG reference, which only defines the *layout*
data used to seed the table). Props determine mode:
```
<TableMap
  tables={resolvedTables}       // dining_tables + derived occupancy status
  mode="floor" | "picker" | "server-picker"
  onSelectTable={(table) => ...}
  selection={...}                // for multi-select combined-table picking
/>
```
Consumers: Floor view (mode="floor", full interactive tap-to-assign),
Picker view (mode="picker", embedded next to the Grid), Server Board's
`+ Table` (mode="server-picker", opened inside a `Dialog`/`Popover` per
`docs/DESIGN_SYSTEM.md`'s "Server/table picker → `Command` + `Popover`"
convention). No second, duplicated map implementation is permitted.

## 12. Quick Add behavior

Reuse the existing `fetchClockedInRoster` pattern
(`src/features/tips/data/fetch-clocked-in-roster.ts`, itself built on
`getActiveClockedInRows` in `src/features/attendance/data/attendance-data.ts`,
which already queries the Neon `attendance` table for
`clock_in is not null and clock_out is null and auto_clocked_out = false`,
resolved to Supabase profile IDs via `attendance_identity_links`). Add an
equivalent `fetchClockedInRosterForAllocation` (or extend the existing
function with an allocation-specific exclusion list) that:
- Groups results into "Clocked in — floor/servers" and "Clocked in — other
  staff" (per the design's `INTERACTIONS.md`), by whatever role/position
  data distinguishes them (Codex to confirm against `memberships`/profile
  role data — do not fabricate a distinction that doesn't exist; if none
  exists, use a single "Clocked in" group and flag the split as a later
  refinement).
- Excludes anyone already an active `rotation_members` row for the current
  session (no duplicate-add path, per existing `INTERACTIONS.md`).
- Supports one-click add (single clocked-in person → `board_add_column`)
  and multi-select ("Add N to Rotation").
- Supports search over "Other members" (not clocked in) via the existing
  team/profile query used elsewhere (Codex to locate — do not add a new
  unscoped member-search endpoint; reuse `organization_id`-scoped queries
  already in the codebase).
- Clocked-in is a **prioritization/grouping signal only** — never
  auto-adds anyone.
- Available to Staff and up (all 3 `AppRole` values) per section 4/5.
- Must not expose payroll/attendance fields beyond name + "clocked in"
  status — no hours worked, no wage data, no clock-in timestamp shown in
  the picker UI.

## 13. Grid changes

- Remove the `isManager &&` gate from: Add row, Clear board, move-column
  up/down (reorder), pause/resume, Clear column, Remove server, Clear row
  (`allocation-workspace.tsx` lines ~573-934 per current source — exact
  line numbers will drift, match by control, not line number). Replace
  with a single new capability, e.g. add `"allocation:operate"` to the
  `Capability` union in `src/features/auth/domain/passcode.ts` and grant it
  to all three `AppRole` values (`owner`, `manager`, `server`), gating on
  `can(user.role, "allocation:operate") && !readOnly` instead of
  `isManager && !readOnly`. This follows the codebase's existing
  capability-table pattern rather than inventing a parallel one.
- Add the auto-row rule (section 9) — this is a backend/RPC change; the
  Grid component itself doesn't need new logic beyond re-rendering
  whatever rounds the server returns.
- Add a **Delete row** control (`Trash2` icon, destructive-styled, only
  enabled for rounds with zero entries — "delete row where the model
  permits it" per the brief; a non-empty round must be cleared first, then
  deleted, preserving history for anything that was ever assigned). Calls
  new `board_delete_row(p_organization_id, p_service_session_id,
  p_round_id)` RPC, which raises an exception if the round has any
  entries, else deletes it and writes a `board_events` row
  (`event_type = 'delete_row'`).
- Add the view switcher (Grid / Floor / Picker / Servers / Dashboard) —
  see section 20 for routing/layout approach.

## 14. Floor behavior

New view. Renders `<TableMap mode="floor">`. Tap an available table →
quick-assign sheet → pick an active, non-paused server → `board_assign`
(with the "Advance rotation" toggle per `INTERACTIONS.md`, default on,
controlling whether the assigned server moves to the back of `position`
order — this is a new optional parameter on `board_assign`, default
`false`/off unless Codex confirms the design's "default on" against final
UX review, since changing rotation order as a side effect of assignment is
a behavior change worth flagging, not silently defaulting to a stronger
behavior than the design's own words suggest — implement whatever the
design explicitly states, default on, but keep it an explicit named
parameter so it's auditable in `board_events.payload`). Occupied table tap
→ detail sheet → Transfer (re-assign with `p_confirm_transfer`) or
Unassign (clear that entry, releasing occupancy).

## 15. Picker behavior

New view. Grid (existing component, reused) + `<TableMap mode="picker">`
side by side. Picking a table in the map assigns it to whatever
cell/column is currently selected in the Grid half — same `board_assign`
call as typing in the Grid, so occupancy/auto-row/undo all behave
identically regardless of entry path (per `INTERACTIONS.md`: "This applies
identically whether the value came from typing in Grid, picking a table in
Picker, or any other supported assignment path").

## 16. Server behavior

New view: one card per active `rotation_members` row (server board), each
showing: rotation position, active/paused status (`Badge`, never color
alone per `docs/DESIGN_SYSTEM.md`), assigned tables (from
`table_rotation_entries` for that member in the current round, or all open
assignments — Codex to confirm against design screenshots
`04-servers.png`), workload (table/cover count — `rotation_members` already
has `active_table_count`/`cover_count`/`party_count` columns, use them
rather than recomputing), `+ Table` (opens `<TableMap mode="server-picker">`
in a dialog, assigns directly per `INTERACTIONS.md`'s "+ Table" spec — a
direct floor assignment via `board_assign`, not a distinct RPC), reorder
(↑/↓, calls existing `board_move_column` — same global `position` order
Grid uses, no separate ordering state), pause/resume
(`board_set_column_status`), remove from rotation (same RPC, `status:
"removed"`), contextual per-table actions (transfer/unassign, same as
Floor's detail sheet, reused).

## 17. Dashboard behavior

New view, read-only except for navigation. Sections: Servers on Floor
(active `rotation_members` count/list), Next Turn (lowest-`position`
active non-paused member), Active Tables / Available Tables (from
`table_occupancy` + `dining_tables`), Upcoming Rotation, Current Table Load
(per-server `active_table_count`), Recent Activity (recent `board_events`
for the session, human-readable), and read-only Master Rotation (section
18).

## 18. Master Rotation behavior

Visually the Grid (same component/rendering), rendered in a read-only mode
(reuse the existing `readOnly` prop path already used for historical/
locked dates — do not build a second read-only Grid). Same data, no
mutation controls. A visible action routes back to the editable Grid view.

## 19. Undo/redo integration

Every new mutation this feature introduces (occupancy claim/release,
`board_delete_row`, Floor/Picker assignment, Server Board's `+ Table`) goes
through the **existing** `board_assign`/`board_clear_*`/new
`board_delete_row` RPCs — there is no new mutation path that bypasses the
`board_events` payload/inverse_payload mechanism. `board_undo`/`board_redo`
require no new dispatch branches beyond handling the extended payload
shape for occupancy (section 6) and the new `delete_row` event type
(inverse: re-insert the round — trivial since a deletable round is always
empty, so the inverse is just an insert with the same `id`/`sequence`, no
entries to restore).

## 20. Realtime / concurrency

No new channels. The existing `board_events` INSERT subscription already
covers every RPC in this feature (all of them write a `board_events` row).
View-switching itself is local UI state, not synced (matches the existing
"Undo/Redo does not cover which view is active" rule in
`INTERACTIONS.md`). Concurrent occupancy claims are resolved at the DB
layer per section 6/3.4, not client-side.

## 21. Retention

Scope for this feature's v1: **`board_events` only**, rows older than 7
days, via a scheduled job calling a new `service_role`-only function
(`board_events` currently has no `delete` grant to `authenticated` — add
one narrowly, or route deletion through a `security definer` function
callable only by a scheduled job/service role, whichever matches this
repo's existing cron/scheduled-job convention — Codex to check for an
existing pattern, e.g. `pg_cron` or a Vercel cron hitting an API route,
before choosing). Confirmed safe: `board_events` has no incoming FKs
(nothing references `board_events.id`), so deleting old rows needs no
cascade cleanup. Confirmed this does not affect current undo/redo (which
only ever targets the single most recent non-undone event).

**Explicitly deferred, not implemented in this feature**:
`table_rotation_entries` / `rotation_rounds` retention. Reason: Feature 028
shipped historical date navigation specifically so the Grid can be viewed
read-only for past dates — deleting rotation history after 7 days would
silently break that already-shipped, tested capability, and there's no
evidence in the repo that this data is meant to be purged on the same
schedule as the pure audit log. This needs explicit product sign-off on
how far back date navigation must remain functional before a retention
rule is written for it. Must **never** delete: `attendance`
(separate Neon DB), payroll, tips/ledger data, employee accounts, any
`service_sessions` row (other features may still reference it), or
anything outside `board_events`.

## 22. Light / dark mode

No new palette. Every new component (Floor, Picker, Server Board,
Dashboard, drawers, dialogs, table/occupancy states, paused states,
destructive actions) must style exclusively via the existing CSS custom
properties (`src/app/globals.css`, `:root` = dark, `:root[data-theme="light"]`
override) through their Tailwind `@theme inline` mapping — never a
hardcoded hex value, never a Tailwind `dark:` variant (this repo doesn't
use that strategy; see section 12 of the Phase-0 findings /
`docs/DESIGN_SYSTEM.md:17`). Reference `docs/design/table-rotation/screenshots/{dark,light}/` for the approved look.

## 23. Responsive behavior

Match the existing Playwright project matrix (`playwright.config.ts`:
desktop, host-tablet, server-mobile) — all 5 views must render usably at
each. `docs/design/table-rotation/screenshots/tablet/` shows the
prototype's own tablet reflow (desktop layout + horizontal scroll, no
distinct tablet redesign) — acceptable as a starting point for Floor/
Picker/Servers/Dashboard; Grid's existing responsive behavior is
unchanged.

## 24. Accessibility

Match existing repo conventions (`AGENTS.md`: `prefers-reduced-motion`
respected for any new animation/transition; status shown via text + icon +
`Badge`, never color alone, per `docs/DESIGN_SYSTEM.md`). New interactive
elements (TableMap's SVG table nodes, Server Board cards) need proper
roles/labels (e.g. `role="button"` + `aria-label` per table, not bare
`<rect>`/`<path>` click targets with no accessible name).

## 25. Migrations

One additive migration set (can be split into multiple files following
this repo's existing one-concern-per-file convention, e.g.
`dining_tables` seed, `table_occupancy`/`table_occupancy_members` DDL +
RLS, `board_assign` extension, `board_clear_*`/`add_row`/new
`board_delete_row` permission changes, `rotation_members_operate_service`
role-array change, `board_event_type` new value, `ensure_trailing_rounds`
replacement). No destructive changes to any existing table/column/
constraint. Every new migration needs a corresponding pgTAP test under
`supabase/tests/database/` per this repo's existing convention.

## 26. Test requirements

See `TEST_PLAN.md` for the full breakdown (permissions, quick add,
occupancy, rotation, auto-row, Grid, Floor, Picker, Servers, Dashboard,
themes, retention, regression). Minimum bar: no reduction in the current
359 Vitest / 153 Playwright / 228 pgTAP counts; every new RPC gets pgTAP
coverage; every new view gets at least one Playwright test per
theme×viewport-project combination that exercises its primary action.

## 27. Local validation gate

Before any push: `npm run check` (format + lint + typecheck), `npm test`
(Vitest), `npm run build`, `npm run test:e2e` (Playwright, all projects),
`npm run db:test` (pgTAP, requires local Supabase via `npm run supabase:start`
/ `npm run db:reset` first). All must pass with zero regressions. Stop
after this — no push, PR, merge, or deploy without explicit user approval
(see `CODEX_IMPLEMENTATION_PROMPT.md`).

## 28. CI/CD plan (reference only — not changed by this feature)

Existing `.github/workflows/ci.yml` (`application` job: format/lint/
typecheck/test/build; `browser-smoke` job: Playwright desktop project) and
`.github/workflows/database.yml` (`migrations-and-policies`: local Supabase
+ `db:reset` + `db:test` on PRs; `deploy-migrations`: `supabase db push` on
merge to `main`) already cover everything this feature adds — no new job
needed unless Codex finds a gap (e.g. non-desktop Playwright projects
aren't in `browser-smoke` today; flag if that matters for this feature's
tablet/mobile requirements, don't change CI silently).

## 29. Rollout / rollback considerations

All new capabilities are additive (new views, new table, new columns,
loosened RLS/RPC gates). Rollback path: revert the migrations (new tables/
columns can be dropped cleanly; loosened RLS/RPC gates can be reverted to
the prior manager-only state in a follow-up migration if the permission
expansion needs to be walked back). No existing data is mutated in place
by this feature's migrations. Feature-flag the view switcher if a staged
rollout (Grid-only → all 5 views) is desired — not required by this
contract, but not precluded either; Codex may propose it if useful.

## 30. Explicit non-goals

- Not implementing full `dining_tables` management UI (adding/editing
  physical tables) — seeding is enough for this feature; a table-editor UI
  is out of scope unless separately requested.
- Not changing anything in Schedule, Tips, Payroll, Team, or auth beyond
  the exact `PERMISSIONS.md` mapping.
- Not implementing broader `table_rotation_entries`/`rotation_rounds`
  retention (section 21) — explicitly deferred pending product sign-off.
- Not redesigning the approved visual design — implement it, adapted to
  this repo's design tokens/components, not the prototype's own CSS.
- Not pushing, opening a PR, merging, or deploying — local validation only
  (section 27), per explicit user instruction.
