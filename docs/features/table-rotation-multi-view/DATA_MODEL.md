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

## Upgrade 1.1 delta

Builds on the architecture actually shipped (`section_assignments`, not
the `table_occupancy`/`table_occupancy_members` design above — see
`IMPLEMENTATION_LOG.md`'s "Occupancy integrity" phase for why). Full
spec and reasoning in `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md`.

```
table_rotation_entries
  + status text not null default 'active'
      check (status in ('active','ended','skipped'))
  + ended_at timestamptz
  ~ table_label: not null -> nullable
  + constraint table_rotation_entries_label_status_check
      (status='skipped' and table_label is null)
      or (status<>'skipped' and table_label is not null)

board_event_type enum
  + transfer, end, skip                                     -- new values
```

`private.sync_table_occupancy` (the occupancy trigger) gained one guard:
only claim occupancy when `NEW.status = 'active'` (in addition to the
existing "has a real label" check) — an ended or skipped row never holds
a physical table.

New RPCs: `board_transfer`, `board_end_table`, `board_skip_turn` (see
`ARCHITECTURE.md` for their bodies). `board_assign` gained a guard:
refuses to overwrite an ended/skipped row instead of silently clobbering
it. `board_undo`/`board_redo` gained matching case branches, and were
also rewritten to order strictly by `board_events.id` rather than
`created_at`/`undone_at` timestamps (a real, pre-existing latent bug: an
undo and the log row it inserts share one transaction's frozen `now()`,
which could make an immediately-following redo indistinguishable by
timestamp).

## Multi-table follow-up delta

`supabase/migrations/20260921100000_table_rotation_multi_table_per_server.sql`.
No schema changes — a member could always hold more than one active row
(one per round; nothing enforces one-active-row-per-member). Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 8.

```
board_event_type enum
  + end_and_assign                                          -- new value
```

New RPC `board_end_and_assign(p_organization_id, p_service_session_id,
p_end_round_id, p_member_id, p_table_label)`: in one transaction, ends
`p_end_round_id`'s entry (status→'ended', history preserved) and inserts
a new active row for the same member at their own earliest genuinely
empty round (searched server-side, before the update, using the same
query `board_transfer` uses for its destination — so the round being
ended is correctly never picked as the new row's destination). Writes
one `board_events` row (`end_and_assign`). `board_undo`/`board_redo`
gained a matching case branch each; undo reactivates the ended row via
the same code path `board_end_table`'s undo already uses, so it inherits
the identical typed occupancy-conflict protection with no new logic.

## "End one or more" follow-up delta

`supabase/migrations/20260922100000_table_rotation_end_multiple_and_assign.sql`.
Still no schema changes. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 9.

```
board_end_and_assign RPC signature
  ~ p_end_round_id bigint      -> p_end_round_ids bigint[]
```

Function dropped and recreated (Postgres has no in-place parameter-type
change). Behavior: every id in `p_end_round_ids` must currently be an
active row for `p_member_id`, checked as one all-or-nothing count
comparison before anything is touched — a stale selection (something
already ended/reassigned one of them) rejects the whole call, not just
the invalid entry. Ending is one `update ... where rotation_round_id =
any(p_end_round_ids)`; since `private.sync_table_occupancy` is a
row-level trigger, it still fires once per ended row, so a conflict on
any single release rolls back the entire statement (and transaction),
never partially ending some of the selected tables. `board_events`'
`payload`/`inverse_payload` now carry `end_round_ids` (a JSON array)
instead of `end_round_id`; `board_undo`/`board_redo`'s `end_and_assign`
branches restore/re-apply the whole array in one statement each, with
the same all-or-nothing guarantee on the way back.

## Picker direct popup / Server decision flow follow-up delta

No schema or RPC changes. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 10. This follow-up
is UI-only: Picker's popup now opens directly from a cell click instead
of via an intermediate "Choose table" button, and Server Board's
`+ Table` gained the same `useTableAssignmentDecision` flow Floor
already used, plus per-table Transfer/End/Unassign scoped to one tapped
assigned table. Every RPC these call
(`board_assign`, `board_transfer`, `board_end_table`, `board_clear_cell`,
`board_end_and_assign`) already existed and was already exercised from
Floor — Server Board simply gained new client-side call sites for them,
confirmed unchanged by the full pgTAP suite (319 assertions, all still
passing) requiring no new migration.

## Floor popup + ownership visuals follow-up delta

No schema or RPC changes. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 11. Presentation
only — a `getInitials(name)` pure function and a `TableMap`/`FloorView`
rendering change, both reading data (`FloorOccupant.name`/`.color` from
`resolveFloorTables`) that was already being returned. Confirmed
unchanged by the full pgTAP suite (319 assertions, all still passing).
