# Table Rotation Multi-View — Data Model Delta

This is a **delta** doc — new/changed schema only. For the full existing
model (unchanged parts), see `docs/DATA_MODEL.md`'s "Rotation model" and
"RLS matrix" sections, which this feature extends but does not replace.
Full detail and reasoning for every decision below is in
`IMPLEMENTATION_CONTRACT.md` sections 3, 6, 7, 9.

## New/changed tables

```
table_rotation_entries
  + dining_table_id bigint references dining_tables(id)   -- nullable

table_occupancy                                            -- new
  id, organization_id, service_session_id, dining_table_id,
  rotation_member_id, table_rotation_entry_id, claimed_at,
  released_at (nullable)
  unique index (service_session_id, dining_table_id) where released_at is null

table_occupancy_members                                    -- new (combined tables)
  table_occupancy_id, dining_table_id   -- composite PK

board_event_type enum
  + delete_row                                              -- new value

dining_tables                                               -- existing, now seeded/live
  (no column changes — label, seat_count, dining_area_id,
   position_x, position_y, combinable_group, active already present)
```

## Retention-relevant columns

- `board_events.created_at timestamptz` — the 7-day retention cutoff
  column (section 21 of the contract). No incoming FKs to `board_events`.
- `table_rotation_entries` / `rotation_rounds` — **not** retention-scoped
  by this feature (deferred; Feature 028's date navigation depends on it).

## RLS additions

`table_occupancy`, `table_occupancy_members`: same shape as
`table_rotation_entries` (select: any active org member; write: only via
the `SECURITY INVOKER` RPCs that already gate at the RPC-body level per
`PERMISSIONS.md`).

## RPC signature changes

- `board_assign(...)` — extended to resolve `table_label` against
  `dining_tables`, claim/check `table_occupancy` transactionally, accept
  a new `p_confirm_transfer boolean default false` parameter.
- `board_delete_row(p_organization_id uuid, p_service_session_id bigint,
p_round_id bigint) returns void` — new; rejects if the round has any
  entries.
- `private.assert_is_active_board_member(p_organization_id uuid)
returns void` — new private helper (section 4/12 of the contract),
  used instead of `private.assert_is_board_manager` in
  `board_clear_row`/`clear_column`/`clear_board`/`add_row`/`delete_row`.

See `IMPLEMENTATION_CONTRACT.md` for exact constraints, locking strategy,
and the full reasoning behind each choice.
