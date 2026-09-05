# Feature 004 — Interval-based tip split

Status: schema and UI complete but disconnected. The Postgres schema, the `recalculate_tip_pool` function, RLS, and pgTAP coverage are production-ready; `tip-workspace.tsx` runs the pure `calculate-tip-splits.ts` logic entirely on in-memory `useState` and never calls `recalculate_tip_pool` or persists a `tip_pool`. Wiring is tracked as `docs/ROADMAP.md` Phase 2 item 6. See `docs/AUDIT.md` (2026-09-05).

## User outcome

Managers enter tip amounts for time intervals and confirm who worked each interval. Employees see their own continuously updated estimate and the final day-end amount.

## Rules

- The active floor snapshot is the primary participant suggestion.
- A manager can correct participants. If no floor data exists, scheduled staff may be suggested but must be confirmed.
- Every interval has start, end, amount in integer cents, and at least one participant.
- Interval cents are divided equally. Remainders are assigned deterministically by stable participant order and disclosed.
- Daily employee totals are the sum of their interval allocations.
- Only manager/owner roles add, edit, calculate, or finalize. Employees read only their own estimate/final total.

## UI

- Manager: summary cards, interval editor, participant toggles, calculation table, and finalize control.
- Employee: one personal estimated-total card and interval explanation; no visibility into another employee’s amount.
- Validation handles overlapping/invalid times, no participants, negative amounts, and post-finalization edits.

## Data and authorization

- Tip pool is location/service-date scoped with `estimating` or `finalized` status.
- Intervals, participants, and materialized allocations are tenant scoped and regenerated transactionally.
- Finalized pools are immutable to normal manager writes; owner correction is a later audited workflow.

## Tests

- Equal split, remainder, multiple intervals, participant changes, and cent-precision unit tests.
- Employee-own-only RLS tests.
- Playwright manager calculator and employee personal estimate flows.

## Codex build prompt

Implement the approved calculator with integer arithmetic, deterministic remainders, strict role visibility, and full quality-gate verification.
