# V2-005.003 Tips Location Scoping — Status

```text
Status: FINAL DELIVERY IN PROGRESS (security corrections applied; DEV rollout and merge pending)
Branch: feature/v2.0-005.003-tips-location-scoping
Base SHA: d72689786984ae55aa480b2f08339db96fcc72ba
Target: development
Parent Issue: #253
PR: #312
```

- CP-P00: Baseline verified. Local Supabase running, 241 Vitest suites (3261 unit tests) pass, 66 pgTAP files (2198 tests) pass.
- CP-P01: Existing Tips contracts mapped in `ENTRY_POINT_MATRIX.md` and `PLAN.md`.
- CP-P02 – CP-P10: Implemented, PR #312 opened, original exact-head CI green.

## Final security corrections (CP-P11 / CP-P12)

The single, still-unapplied migration `20261107194700_tips_location_scoping.sql` was corrected in place (no second Tips migration).

| Finding                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Organization-wide roster fallback | Confirmed and removed. The loader has no fallback: a missing RPC (`PGRST202`/`42883`), a denial (`42501`) or a malformed payload returns an explicit `unavailable` context with no people and no money. The clocked-in suggestion also fails closed (it used to return the unfiltered attendance list when the roster RPC errored).                                                                                                                                     |
| B. Day-data RPC not consumed         | Confirmed. The loader now reads only `tips_location_roster` + `tips_get_day_data`, bound to the verified location, with no direct table reads. Staff receive only their own intervals, no audit log and only their own roster row.                                                                                                                                                                                                                                      |
| C. Shared `audit_events`             | Confirmed over-broad (Overall actors could write/read every module's events in every organization). The Tips branch is now limited to `entity_type='tip_pool'`, actions `finalized`/`reopened`, at a location the caller manages (`tips_is_manager`). The dropped composite FK is replaced by a `BEFORE INSERT` trigger (`audit_events_actor_authority`) that still requires an organization membership OR an Overall role for every module. Historical rows untouched. |
| D. Authenticated browser coverage    | The original local spec had never run and its selectors could not match the UI. Rewritten; 21/21 pass on desktop, tablet and phone, plus a 3/3 old-schema compatibility spec.                                                                                                                                                                                                                                                                                           |
| E. Finalized immutability            | Already protected by the restrictive `*_draft_only` policies; now proven with real-role pgTAP (0067) and real PostgREST calls (`tips-final-security.local.test.ts`). Note: a manager may still reopen a pool directly through the pre-existing `tip_pools_reopen_manager` policy without an audit row; this predates Tips scoping and is recorded as residual risk, not changed here.                                                                                   |
| F. Historical vs eligible            | `tips_location_roster` now returns `eligible` (same test `tips_add_interval` enforces). Historical-only people stay in the name directory but are never offered for a new interval. The Tips page now uses its own roster instead of the Schedule team.                                                                                                                                                                                                                 |

Two further defects were found by exercising RLS as the real `authenticated` role (the original pgTAP never switched role): `tip_allocations_select_own` returned zero rows to staff because it read `tip_pools` through RLS (baseline allowed own-row reads); fixed with the definer helper `private.tips_allocation_visible`.

## Independent review and further defects (CP-P11 / CP-P12, second pass)

Replaying the deployed (pre-RPC) app against the new schema as real users exposed one more defect, and an independent read-only review confirmed four more. All are fixed in the same unapplied migration:

- Direct `tip_interval_participants` inserts failed with "permission denied" for every caller because the policy called a helper that `authenticated` cannot execute. Now `private.tips_can_add_participant` (definer; true only for a manager of the pool location AND current workforce). `tips_workforce_eligible` itself stays private so it cannot be used to enumerate who works where.
- A direct `PATCH tip_pools` could finalize with an arbitrary `finalized_by` (the FK now accepts any profile), forging attribution and exposing another tenant display name through the roster. The update policy now requires `finalized_by` to be NULL or the caller. Direct finalize/reopen by a location manager (without an audit row) remains available to the pre-RPC app; this predates Tips scoping and is the documented residual.
- `tips_add_interval`, `tips_finalize_pool`, `tips_reopen_pool` and `recalculate_tip_pool` now lock the pool row (`for update`), so a finalize cannot interleave with an in-flight edit.
- Managers can no longer write `tip_allocations` directly (read-only); allocations are derived by the definer recalculation, so a forged payee can no longer survive finalization.
- `recalculate_tip_pool` authorizes before revealing existence or state (same `P0002` for "missing" and "not yours").
- Accepted, not changed: staff receive the co-workers opaque profile ids and interval totals, because the existing product shows the total split among N people and the client computes the equal split; no names are disclosed (the roster is self-only).

## Verification (local, disposable stack)

- Vitest 244 files / 3,303 tests; pgTAP 68 files / 2,301 tests (new `0067_tips_final_security`: 60); real-session suites 20 tests (including the deployed app replayed on the new schema); `npm run check`, `next build --webpack` pass.
- Clean 77→78 replay and a nonempty 77→78 upgrade (finalized + draft pools, intervals, participants, allocations, audit events): all table digests identical before and after.
- Backend enforcement remains STAGED; no module configuration, no hosted change yet.

Remaining: exact-head CI on the corrected head, encrypted DEV backup and rehearsal, single-migration DEV rollout, hosted acceptance, merge.
