# Table Allocation — Cross-View Integrity & Conflict Actions

Tracker: GitHub #153 (release / Preview blocker) · Branch `fix/table-allocation-cross-view-integrity` (from `origin/development` `63fdbe0`) · Milestone "Table Allocation V2 — Part 2" · Project #4.

Origin: owner testing of the final DEV Preview (PR #135). PR #135 itself is infrastructure and stays untouched until this lands on `development`.

Not a redesign. A correctness/consistency phase across Grid, Floor, Picker, Servers and Dashboard.

## Phases (all on one branch, logical commits)

| Phase | Scope                                                                    |
| ----- | ------------------------------------------------------------------------ |
| X0    | Repo/domain audit + planning/tracking (this file)                        |
| X1    | Canonical identity + off-map representation in all five views            |
| X2    | Occupied-table conflict resolver (one domain contract, one dialog)       |
| X3    | Servers ended / session-history consistency                              |
| X4    | Parameterized automated cross-view matrix                                |
| X5    | Real-mode (hosted DEV, production build) concurrency / reconnect / date  |
| X6    | PR #135 reintegration + final Preview preparation                        |

## X0 audit findings (evidence, no secrets)

### Canonical identity — "Table 1" vs "T1"

Read-only probe of DEV (`opmujepkemwcdxxorhfd`, 2026-10-26):

- `dining_tables` has **no row labelled `1`**. The registered labels include `T1` (id 19), `T2` (id 18) and `T6` (id 12); every registered row has map coordinates.
- Board entry `table_label = '1'` is therefore a **free-text label with no physical record**, not an alias of `T1`, and not a second physical table. It has no `section_assignments` claim (the occupancy trigger `continue`s past a label it cannot resolve), so the DB's one-active-claim-per-table guard never covered it.
- So "off-map" has two real shapes, both must be handled:
  1. **Registered, unpositioned** — a `dining_tables` row with `position_x/y` null. `getAllocationContext` filters these out of `physicalTables`, so Floor and Picker never show them, while the ledger and Servers/Dashboard still count a claim on them.
  2. **Unregistered label** — free text typed in the Grid (the owner's `1`). No row, no id, no ledger claim.
- `T1` ≠ `1`. Nothing in this feature maps one to the other. No prefix stripping, no normalization, no case folding.

Identity model (documented decision): `dining_tables` is unique per `(location_id, label)`; board entries (and combined assignments such as `T6 + T7`) persist the label text, and `section_assignments.dining_table_id` is the authoritative physical claim. Re-keying entries to ids would rewrite the approved Table Rotation V2 storage, undo payloads and combined-assignment syntax, so it is out of scope. Instead the read model resolves every label **exactly, once, through the location registry** to a `TableIdentity { key, diningTableId | null, label, registered }`; occupancy, availability and counts are keyed by `key` (`id:<n>` or `label:<text>`), and tests assert `diningTableId`. Label strings are display and RPC addressing only.

### Current mutation paths

- RPCs (all `SECURITY DEFINER`, empty `search_path`, `auth.uid()`, active membership, session lock): `board_assign`, `board_transfer`, `board_end_table`, `board_end_and_assign`, `board_clear_cell/row/column/board`, `board_skip_turn`, `board_add_column/row`, `board_delete_row`, `board_set_column_status`, `board_move_column`, `board_undo/redo`.
- One server action `executeBoardActionRemote` (`allocation-actions.ts`) fans out to them. Demo mode runs the same actions through the pure reducer `applyBoardAction`.

### Current occupied-table behaviour (the defect)

| Origin  | Table held by another server today                                              |
| ------- | ------------------------------------------------------------------------------- |
| Grid    | `assign` with `confirmTransfer: true` — **silently ends** the other server's entry |
| Picker  | error banner "…Use Floor to transfer it."                                       |
| Servers | inline error "…already assigned to X."                                           |
| Floor   | occupied tile opens a panel: Transfer / End / Unassign (no End + Assign)        |

DB: `private.displace_conflicting_entries` refuses to end a combined holder wider than the wanted label; matches only registered tables (so unregistered labels can be double-held); a stale non-confirm `assign` fails with a generic P0001 string.

### History collections

Grid and Dashboard "Master Rotation" render ended cells struck through (all board entries). Servers cards use `getActiveTablesForColumn` (active only) — ended history is dropped there. That is defect B.

## Contracts

### Off-map

An off-map table is valid, may be ACTIVE / AVAILABLE / ENDED, and simply has no coordinates. Never placed at fake coordinates. Every view accounts for it:

- Grid: "Off-map" badge on the cell.
- Floor: "Off-map tables" rail beside/below the map (held ones with owner, available registered ones), selectable like tiles.
- Picker: "Off-map / unpositioned tables" section in the chooser dialog, selectable.
- Servers: chips marked off-map (existing "N not on the floor map" line stays).
- Dashboard: authoritative totals unchanged; available count includes registered off-map available tables.

### Count contract

`table count = physical active tables` (each combined part counts). Ended contributes 0 to the active count but stays in session history. Servers and Dashboard sum identically; Floor/Picker availability reads the same claims.

### Conflict contract (one shared classifier + one dialog)

`classifyTableClaim(board, { label, columnId, targetRoundId })` →

- `free` → proceed with the normal per-origin path.
- `same-server` → no mutation; notice "T6 is already assigned to TestOwner."
- `held` (one or more holders) → shared dialog: **Transfer** (only when exactly one holder and the wanted tables ⊆ the holder's assignment; moves the **entire** holder assignment), **End + Assign** (ends the **entire** holder assignment(s), then creates a new active entry for the selected label), **Cancel**.

Origins routed through it: Grid (typed), Picker (map pick), Servers ("+ Table"), Floor (new "Assign to a different server" on an occupied tile; existing Transfer button stays). Dashboard is read-only.

### Server-authoritative stale path

`board_assign` (non-confirm) raises SQLSTATE `PT409` (HTTP 409) with a JSON `detail` naming the current holders; the server action returns a structured `conflict`; the workspace opens the same dialog and refreshes. A stale client can never create a second active claim.

### Atomicity

End + Assign is one `board_assign` call (`p_confirm_transfer` + new `p_end_whole_assignment`), inside the session row lock held by `begin_board_write`: no window between END and ASSIGN. It emits the existing `assign` event with a `displaced` list, so Undo/Redo already work. Transfer reuses `board_transfer` unchanged. One forward-only migration; pgTAP added.

### Ended history

`ServerSummary.sessionHistory` (active + ended entries per server, in round order) and `endedAssignments`. Servers cards render a "Session history" row with ended tables struck through and labelled "Ended".

### Service day

Calendar date in the location time zone (`zonedWallTimeFromInstant`), no configurable business-day cutoff. Not redesigned here; boundary tested.

## Non-goals

No redesign, no partial release of a combined assignment, no label→table aliasing, no new history-editing model, no Tasks/Tips work (tracked as #154/#155), no PROD, no `main`.

## Rollout / rollback

DEV-only validation. Migration is forward-only and additive in behaviour (a new defaulted parameter, a stricter pre-check); rollback = revert the app commit and ship a corrective forward migration. PROD untouched; promotion is an owner decision after the release-readiness audit.

## Codex build prompt

Not applicable: the owner explicitly asked Claude to implement this phase.
