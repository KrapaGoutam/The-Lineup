# V2-005.003 Tips Location Scoping — Status

```text
Status: COMPLETE (merged via PR #312; hosted DEV migrated 77 -> 78)
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

## Rollout record

- Encrypted DEV-only logical backup taken at ledger 77 (DPAPI, owner-only; 6 components; 107 tables reconciled to live DEV with 0 mismatches) and restored into an isolated no-network container; the final migration was rehearsed on that real-data copy (only Tips objects changed; 0 row, digest or grant changes).
- Single migration `20261107194700_tips_location_scoping.sql` (sha256 `69eabead7cf7b505590c786a115a6ce4e320607f2081fcb01ff450ec3be66a03`) applied to hosted DEV with the Supabase CLI: ledger 77 -> 78. Hosted catalog (635 policy/function/constraint/grant/trigger lines) is identical to the migration-built local catalog.
- Hosted acceptance used rolled-back transactions with real DEV rows under the `authenticated` role and live-session checks (cross-location, cross-tenant, staff, Overall, eligibility, finalized immutability, audit attribution); nothing persisted. Real GoTrue-JWT coverage is the local disposable-stack suites. The Preview for the final head renders and is bound to DEV only.
- **Hosted UI acceptance: DEFERRED.** Hosted DEV has zero `location_module_configs`, so the application hides every module; populating configuration or activating enforcement is a separate owner-controlled task and was not done.
- Backend enforcement remains STAGED. Production, `main` and JobQuest are untouched.

Known debt (not changed here): the global `docs/STATUS.md` and `docs/ROADMAP.md` still carry earlier-program wording; a manager can still finalize/reopen directly through the pre-RPC policies without an audit row (predates Tips scoping).
