# Table Rotation Multi-View — Implementation Log

Concise engineering facts only, phase by phase. See `AGENT_HANDOFF.md` for
current state/next-step and `IMPLEMENTATION_CONTRACT.md` for the frozen
design this log tracks against.

## Phase A — Baseline + branch

- Branch: `feature/table-rotation-multi-view` (created from `main` at
  `2130026`).
- Baseline reconfirmed live: Vitest 359/359, pgTAP 228/228 (18 files).
  Matches `docs/STATUS.md`, no drift since planning.
- Commit `cab76c5`: froze planning docs + copied design handoff (docs only).

## Phase B+C — Occupancy integrity, auto-row reconciliation, permission expansion (combined)

Combined into one migration because they're tightly coupled (the
permission-gated RPCs and the occupancy trigger both live in the same
`board_*` surface).

**Migration**: `supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql`

**Deviation from the frozen contract** (documented per the contract's own
rule — smallest safe deviation, when repository state materially differs
from a frozen assumption): the contract specified two new tables,
`table_occupancy` + `table_occupancy_members`. Implementation found
`public.section_assignments` already exists (foundation migration),
already has almost exactly the right shape (organization_id,
service_session_id, dining_table_id, server_profile_id, one-row-per-table-
per-session uniqueness), already has correct `_select_member` RLS and
Realtime publication membership, and was confirmed dead code (Phase 0).
Extended it instead of adding two new tables:
- Added `rotation_member_id`, `table_rotation_entry_id`, `released_at`.
- Replaced its old always-unique `(service_session_id, dining_table_id)`
  constraint with a partial unique index (`where released_at is null`) —
  a table can be claimed/released/reclaimed many times per session.
- A combined label (`"T1 + T2"`) is just two `section_assignments` rows
  sharing one `table_rotation_entry_id` — no junction table needed.
- Dropped `section_assignments_operate_service` (direct client writes).
  All writes now flow through one `SECURITY DEFINER` trigger
  (`private.sync_table_occupancy`, fired `AFTER INSERT OR UPDATE OR DELETE`
  on `table_rotation_entries`), so occupancy can never drift from the grid
  log, and every existing/new RPC that touches `table_rotation_entries`
  (`board_assign`, `board_clear_cell/row/column/board`, `board_undo`,
  `board_redo`) gets correct occupancy behavior automatically, including
  undo/redo, without per-RPC occupancy code.

Also **not** added: `table_rotation_entries.dining_table_id`. The frozen
contract planned this column, but it's redundant once occupancy resolution
happens inside the trigger (which resolves labels against `dining_tables`
directly) — a scalar FK on `table_rotation_entries` couldn't represent a
combined-table entry correctly anyway (two tables, one entry).

**What else this migration does**:
- `board_assign` gained `p_confirm_transfer boolean default false` (old
  6-arg overload explicitly dropped, not left ambiguous for PostgREST).
  Threaded into the trigger via a transaction-local GUC
  (`app.confirm_transfer`). Conflict without confirmation raises
  `Table % is already assigned to another active server on this board.`
- `private.ensure_trailing_round` rewritten for the ~2-trailing-empty-round
  rule (was: ensure exactly 1). Same name/signature, no caller changes
  needed.
- New `board_delete_row` RPC — only succeeds on a round with zero entries.
- New `board_event_type` value `delete_row`; `board_undo`/`board_redo`
  gained matching case branches.
- New `private.assert_is_active_board_member` (all 5 DB roles); replaces
  `private.assert_is_board_manager` inside `board_clear_row`,
  `board_clear_column`, `board_clear_board`, `board_add_row`, and gates
  the new `board_delete_row`. `assert_is_board_manager` itself is
  untouched (left in place, unused by this feature going forward).
- `rotation_members_operate_service` RLS policy: role array extended to
  include `server` (reorder, pause/resume, remove-from-rotation).

**Tests**: `supabase/tests/database/0019_table_rotation_multi_view_foundation.test.sql`
(15 assertions) — plain-server permission checks (assign/add-row/clear-
column), occupancy conflict + explicit transfer + release, combined-table
reservation, the exact auto-row round count, and `board_delete_row`'s
empty-vs-non-empty gate. All pass. Full suite: 243/243 (228 baseline + 15
new), zero regressions. Full local `npm run db:reset` + `npm run db:test`
run clean.

**Commit**: pending (this phase committed together with this log entry).

## Phase D+ — not yet started

See `AGENT_HANDOFF.md` for current status and next step.
