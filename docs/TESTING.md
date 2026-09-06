# Testing Strategy

## Test pyramid

| Layer       | Tool               | Covers                                                                     |
| ----------- | ------------------ | -------------------------------------------------------------------------- |
| Domain unit | Vitest             | Passcodes, shift ranges, board undo/redo, tip cents, rotation ranking      |
| Component   | Testing Library    | Forms, permission states, keyboard/touch behavior, empty/error states      |
| Database    | pgTAP/Supabase CLI | Constraints, RLS, grants, transactional functions, tenant isolation        |
| Browser     | Playwright         | Passcode/access request, three modules, manager/server permission surfaces |

## Critical invariants

- Same input yields the same rotation recommendation.
- Ineligible servers are never selected.
- Ties resolve by oldest seating time and stable position.
- A retried seating key creates one seating only.
- Two simultaneous host actions do not consume the same next turn incorrectly.
- A floor rebalance preserves occupied tables.
- DST transition fixtures preserve location-local shift intent. Covered by `src/lib/timezone.test.ts` (Feature 015, Phase B): plain conversion, spring-forward gap, fall-back overlap, and an overnight shift's real elapsed duration (7 or 9 hours across a transition, not a naive 8).
- A user from organization A cannot read or mutate organization B.
- Tip allocations sum exactly to every interval amount in integer cents.
- A standing empty table-allocation row stays ready one row ahead of wherever work is actually happening, opened on a row's first value rather than waiting for every column to fill it.
- Undo and redo restore complete table-board snapshots. In real mode (Feature 015 Phase C), this is one shared server-side timeline per session rather than a per-tab stack — covered by `supabase/tests/database/0007_allocation_board_rpcs.test.sql` (RPC existence, SECURITY INVOKER-only, the four RLS/grant gaps and their fixes) and live-verified against the hosted project with two real signed-in accounts, since Realtime propagation and cross-account RLS behavior aren't things a unit test can prove.

## Commands

```bash
npm run check
npm run test
npm run test:coverage
npm run db:test
npm run test:e2e
```

Playwright MCP is useful for exploratory browser verification by an agent. Checked-in Playwright tests remain the repeatable CI contract; MCP browsing does not replace them.

## Fixtures

Use deterministic factories for two organizations, two locations, six servers, one manager, dining areas, active/inactive tables, and a service session. Freeze time in domain tests. Never rely on production data or real staff contact details.

## Pull-request evidence

Every feature PR lists the commands run and their results. UI changes include screenshots at the relevant viewport. Database changes include the RLS cases added. A flaky test is fixed or quarantined with an owner and issue; it is not silently retried until green.
