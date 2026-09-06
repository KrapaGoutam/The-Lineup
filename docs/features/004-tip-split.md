# Feature 004 — Interval-based tip split

Status: wired to hosted Supabase (Feature 015, Phase D). In real mode, `tip-workspace.tsx` no longer owns interval state itself — it reads `getTipsContext()` (a Server Component read of today's `tip_pools`/`tip_intervals`/`tip_interval_participants` plus the resolved audit log) and writes through `addTipIntervalAction`/`finalizeTipsAction`/`reopenTipsAction`, each calling `recalculate_tip_pool` or the finalize/reopen policy as appropriate; `NEXT_PUBLIC_DEMO_MODE=true` still runs the original in-memory `useState` path unchanged. A tip pool is created lazily on the first interval add for a service date, not pre-seeded. See `docs/AUDIT.md` (2026-09-05) for the pre-Phase-D state.

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
