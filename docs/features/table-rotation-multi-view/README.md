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

Planning / contract freeze complete. Implementation in progress (Claude
Code, explicit user-approved override of the normal Claude→Codex division
of labor for this feature, 2026-09-19): backend (occupancy integrity,
permission expansion, auto-row reconciliation, retention) and the Grid +
Floor views are complete, tested, and locally validated. Picker, Servers,
and Dashboard are not built yet. See `AGENT_HANDOFF.md` and
`IMPLEMENTATION_LOG.md` for the full current state and what's left.
