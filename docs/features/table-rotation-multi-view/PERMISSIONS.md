# Table Rotation Multi-View — Permissions

Exact role-vocabulary mapping and every permission-gating site this feature
touches. Do not interchange DB/app/UI role names without stating which
layer is meant — that confusion is exactly what this document exists to
prevent.

## Role vocabulary — three layers, exact mapping

| DB `app_role` (enum, array on `memberships.roles`) | App `AppRole` (`src/features/auth/domain/passcode.ts`) | UI `Designation` (Feature 014, same file) |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `owner`                                            | `owner`                                                | `owner`                                   |
| `general_manager`                                  | `manager`                                              | `manager`                                 |
| `shift_manager`                                    | `manager`                                              | `assistant_manager`                       |
| `host`                                             | `server`                                               | `staff`                                   |
| `server`                                           | `server`                                               | `staff`                                   |

Mapping functions (unchanged by this feature): `normalizeDatabaseRole(roles)
→ AppRole`, `designationForRoles(roles) → Designation`,
`designationToRole(designation) → AppRole`.

Note: `host` and `server` are indistinguishable at the `AppRole`/
`Designation` layer today (both → `server`/`staff`). This feature does not
change that — any "floor/servers vs. other staff" distinction needed for
Quick Add's two groupings (section 12 of `IMPLEMENTATION_CONTRACT.md`) must
be sourced from elsewhere (e.g. scheduled position data) or reduced to one
group; it cannot come from `AppRole`/`Designation`.

## Approved permission expansion (explicit user sign-off, 2026-09-19)

Staff (`Designation: staff` — DB roles `host`, `server`; `AppRole: server`)
gains all **Active Floor Operations**:

- Quick Add Staff/Members, add/remove active rotation member
- Reorder servers, pause, resume
- Assign table, transfer, unassign, update/edit an assignment
- Clear cell, clear row, clear column, clear board
- Add row, delete row (empty rows only)
- Undo, redo (already available to Staff today — unchanged)
- Use Grid, Floor, Picker, Servers, Dashboard

Staff explicitly does **not** gain: deleting employee accounts, changing
employee roles, modifying authentication, payroll administration, or any
other manager/owner function outside `src/features/allocation/**`. Nothing
in this feature touches Schedule, Tips, Payroll, Team, or auth code.

## Current gating sites and what changes

All in `src/features/allocation/components/allocation-workspace.tsx`
(exact line numbers drift; match by control):

| Control                                           | Current gate                          | New gate                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isManager` definition (`user.role !== "server"`) | —                                     | Superseded for this feature's purposes by a new `can(user.role, "allocation:operate")` capability, granted to all 3 `AppRole` values. Keep `isManager` only if still used elsewhere in the file for something outside this list (verify via typecheck; remove if dead). |
| Add row                                           | `isManager && !readOnly`              | `can(user.role, "allocation:operate") && !readOnly`                                                                                                                                                                                                                     |
| Clear board                                       | `isManager && !readOnly`              | same                                                                                                                                                                                                                                                                    |
| Move column up/down (reorder)                     | inside `isManager && !readOnly` block | same                                                                                                                                                                                                                                                                    |
| Pause/Resume                                      | inside `isManager && !readOnly` block | same                                                                                                                                                                                                                                                                    |
| Clear column                                      | inside `isManager && !readOnly` block | same                                                                                                                                                                                                                                                                    |
| Remove server (column)                            | inside `isManager && !readOnly` block | same                                                                                                                                                                                                                                                                    |
| Clear row                                         | `isManager && !readOnly`              | same                                                                                                                                                                                                                                                                    |
| Undo / Redo                                       | not gated by `isManager` today        | unchanged                                                                                                                                                                                                                                                               |
| Cell assign/clear-cell                            | not gated by `isManager` today        | unchanged                                                                                                                                                                                                                                                               |

Add `"allocation:operate"` to the `Capability` union in
`src/features/auth/domain/passcode.ts`, granted to `owner`, `manager`,
`server` (i.e., effectively always true) — follow the existing
`can(role, capability)` table pattern rather than a bespoke boolean.

## RPC / RLS layer changes

- `private.assert_is_board_manager(p_organization_id)` (role array today:
  `owner, general_manager, shift_manager, host`) — **stop calling it** from
  `board_clear_row`, `board_clear_column`, `board_clear_board`,
  `board_add_row`. Add a new `private.assert_is_active_board_member
(p_organization_id)` (role array: all 5 DB roles, active membership) and
  call that instead from those four RPCs plus the new `board_delete_row`.
  Do not delete `assert_is_board_manager` itself — it may still be used
  elsewhere or in a future feature that needs a true manager-only gate.
- `board_assign`, `board_clear_cell`, `board_undo`, `board_redo` — already
  open to any active member; unchanged.
- `board_move_column`, `board_set_column_status` — no RPC-level guard
  function today; gated purely by the `rotation_members_operate_service`
  RLS policy (role array today: `owner, general_manager, shift_manager,
host` — **not** `server`). Add `server` to that policy's role array.
- New `board_delete_row` — gated by `private.assert_is_active_board_member`
  (same population as the other newly-opened RPCs), plus its own check
  that the target round has zero `table_rotation_entries`.

## Known asymmetry to preserve, not silently "fix"

`private.assert_is_board_manager`'s role array includes `host` (a manager
for RPC purposes) while the frontend's `isManager` boolean does not (`host`
maps to `AppRole: server`, so `isManager` is `false` for a `host`-only
account). This asymmetry already exists in production today and is
unrelated to this feature — do not change it as a side effect of this
work. After this feature, it becomes moot for the four RPCs being opened
up (both `host` and `server` get access either way), but it still applies
wherever `assert_is_board_manager` remains in use elsewhere in the schema.
Flag it in code review if it looks confusing; do not "fix" it here.
