# Feature: Table Rotation Multi-View

Follows this repo's `docs/ai/FEATURE_HANDOFF.md` template. Full detail
lives in the sibling docs in this directory — this file is the index.

## Feature

Add four new views (Floor, Picker, Servers, Dashboard) alongside the
existing Grid for Table Allocation Rotation, all projections over one
shared rotation state, plus an expanded Staff permission set and a fixed
table-occupancy integrity gap. See
`docs/design/table-rotation/` for the approved visual reference.

## User outcome

Any active floor staff member (not just managers) can run the full table
rotation from whichever view suits the moment — a live floor map, a visual
table picker, a per-server board, or a read-only dashboard summary —
without two people ever being able to double-book the same physical table.

## Scope

In scope: the 5-view UI, the `table_occupancy` integrity layer, the
permission expansion (`PERMISSIONS.md`), the reconciled auto-row rule,
Quick Add's clocked-in-first behavior, `board_events` 7-day retention.
Out of scope: anything outside `src/features/allocation/**` and its RPCs/
migrations — see `IMPLEMENTATION_CONTRACT.md` section 30 for the full
non-goals list.

## Acceptance criteria

See `IMPLEMENTATION_CONTRACT.md` sections 3–24 (one per capability area)
and `TEST_PLAN.md` for the testable form of each.

## UX contract

`docs/design/table-rotation/` (approved design export + screenshots) +
`INTERACTIONS.md` (production-grounded reconciliation of the design's own
interaction spec) + `docs/DESIGN_SYSTEM.md` (tokens/components every new
view must use).

## Data and authorization

`DATA_MODEL.md` (schema delta) + `PERMISSIONS.md` (exact role mapping and
every gating site changed).

## Implementation map

`ARCHITECTURE.md` (component/data-flow diagrams) +
`IMPLEMENTATION_CONTRACT.md` section 2 (reuse/extend/modify/new per
capability).

## Test plan

`TEST_PLAN.md`.

## Rollout and rollback

`IMPLEMENTATION_CONTRACT.md` section 29.

## Codex build prompt

`CODEX_IMPLEMENTATION_PROMPT.md` — self-contained, paste directly into
Codex.

## Status

Planning and implementation complete (Claude Code, explicit user-approved
override of the normal Claude→Codex division of labor for this feature,
2026-09-19): the full backend (occupancy integrity, permission expansion,
auto-row reconciliation, retention) and all 5 views (Grid, Floor, Picker,
Servers, Dashboard) are built, tested, and locally validated. See
`AGENT_HANDOFF.md` and
`IMPLEMENTATION_LOG.md` for the full current state and what's left.

## Upgrade 1.1

Adds a per-cell lifecycle (Active/Ended/Skipped, on top of Empty) so
Transfer, End Table, and Skip Turn are each first-class actions distinct
from Assign/Unassign, instead of the original model where a cell was
just "has a label or not." See
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` for the full spec,
reconciliation against the shipped architecture, and schema/RPC design;
`IMPLEMENTATION_LOG.md`'s Upgrade 1.1 phase section for the implementation
record. Additive only — no rebuild, no new tables (reuses
`table_rotation_entries` with a `status` column), no permission-model
changes.

**Final UI decision**: Transfer and End Table are Floor-only controls.
Grid and Picker expose Assign/Edit, Unassign, and Skip Turn, but not
Transfer or End — Floor is the one surface for the full occupied-table
action set. This is a UI-only choice: `board_transfer`/`board_end_table`
and their domain-layer equivalents remain fully implemented and tested,
just not wired to a Grid/Picker control. See
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 7.

**Multi-table follow-up**: a server may hold zero, one, or many active
tables at once (nothing in the schema ever limited this — the bug was
purely a client-side round-selection collision). Floor's assign flow now
branches: no existing active table assigns directly; one or more opens a
decision dialog (Assign Also / Transfer / End Existing & Assign /
Cancel). Picker's TableMap now opens as a popup (`components/ui/dialog.tsx`,
this repo's first Dialog primitive — a native `<dialog>` element, no new
dependency) instead of rendering inline below the rotation grid. See
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 8.
