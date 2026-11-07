# V2-005.003 Tips Location Scoping — Plan

GitHub Issue: #253
Program: #248 | Milestone: #8 — The Lineup V2.0
Base: `d72689786984ae55aa480b2f08339db96fcc72ba`
Target: `development`

## 1. Objective

Scope the Tips module strictly to the server-verified active organization and location context:

1. Tips data loading: scope tip pools, intervals, and audit events to the verified active location.
2. Participant eligibility: replace organization-wide roster with location workforce (`location_memberships` + historical snapshot preservation).
3. Overall actor compatibility: replace `tip_pools.finalized_by` composite FK to `memberships` with a validated profile FK `references public.profiles(id)` so Overall administrators can finalize without fake memberships.
4. Server Actions:
   - Retire legacy `getPrimaryLocation`.
   - Verify caller live session, active context, and applicable location role (Owner, Manager, Assistant Manager).
   - Reject stale workspace expectations via `assertWorkspaceExpectation`.
   - Atomic database transactions for multi-step interval creation, finalization, and reopening.
5. Clocked-in team suggestions: intersect external attendance suggestions with authorized location workforce.
6. Financial integrity: preserve deterministic split algorithm, integer cents, and remainder distribution in `calculateTipSplits`.
7. Database security & RLS: replace legacy `has_org_role` on `tip_pools`, `tip_intervals`, `tip_interval_participants`, and `tip_allocations` with canonical location authority checks (`private.tips_is_manager`, `private.tips_can_access_location`, `private.tips_workforce_eligible`).

## 2. Checkpoints

- CP-P00: Baseline verified
- CP-P01: Existing Tips contracts mapped
- CP-P02: Database authorization implemented
- CP-P03: Application location scoping implemented
- CP-P04: Financial and history integrity verified
- CP-P05: Real-JWT security acceptance passed
- CP-P06: Browser and regression acceptance passed
- CP-P07: Independent review complete
- CP-P08: Feature committed and PR opened
- CP-P09: Exact-head CI verified
- CP-P10: Final owner handoff
