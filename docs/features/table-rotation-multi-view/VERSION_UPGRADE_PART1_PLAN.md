# Table Allocation Version Upgrade Part 1 — Implementation Plan

**Status:** Proposed; waiting for explicit user approval

**Source:** `VERSION_UPGRADE_PART1_AUDIT.md`

**Branch:** `upgrade/table-allocation-v2-part1`

**Implementation:** Not started

## Objective and Guardrails

Establish one secure, session-consistent Table Allocation contract across Grid, Floor, Picker, Servers, and Dashboard. The plan fixes database integrity and authorization before client behavior, preserves applied migration history, and avoids unrelated product enhancement.

Guardrails:

- Do not modify an applied migration; add forward-only migrations.
- Every operational row remains organization- and location/session-scoped.
- Authorization comes from active membership rows, never `organizations.created_by` or editable metadata.
- Physical exclusivity is database-enforced; no UI-only availability check.
- Board events are written in the same transaction as the mutation they describe.
- Realtime is invalidation followed by an authoritative read.
- Each phase is independently reviewable and must be green before the next begins.
- No production action occurs until the project-context gate passes.

## Target Architecture

```text
Server read model
  logical board/history <- table_rotation_entries
  physical current claims <- section_assignments
  server order/status <- rotation_members
  immutable activity/undo <- board_events

Client views
  -> shared total reducer + serialized mutation coordinator
  -> validated Server Action
  -> explicit RPC contract
  -> same-session + active-membership + lock checks
  -> transactional rows + physical trigger + immutable event
  -> Realtime invalidation -> authoritative refetch
```

## Phase 0 — Trusted Project Context and Release Containment

### Goal

Make it impossible to audit or deploy against the wrong GitHub, Vercel, or Supabase project, independently verify production migration parity, and prevent frontend promotion before compatible database state exists.

### Files

- `scripts/verify-lineup-context.ps1` (new)
- `scripts/use-lineup-context.ps1` (new)
- `.env.example` (variable names only if needed)
- `.mcp.json.example` (project-scoped read-only example)
- `.github/workflows/database.yml`
- `.github/workflows/ci.yml` or a new release workflow
- `docs/CI_CD.md`
- handoff/status documentation

### Database Changes

None. Run read-only catalog and migration-history queries only after identity verification.

### RPC Changes

None.

### RLS Changes

None.

### Frontend Changes

None.

### Tests

- Pester or deterministic PowerShell invocation tests for correct and mismatched remote/project IDs.
- Prove secrets are neither printed nor persisted by wrappers.
- Workflow static validation.
- Read-only production parity report covering migrations, functions, policies, grants, constraints, indexes, triggers, publications, scheduled retention, and integrity queries.

### Migration

No migration. Reconcile the unmerged historical deployment evidence only after independent production verification.

### Rollback / Risk

Scripts and workflow gates are reversible. The principal risk is locking out a valid release due to stale expected IDs; fail closed and require explicit identifier review rather than bypassing the gate.

### Dependencies

- Re-authenticated GitHub account `KrapaGoutam` with repository access.
- Supabase account/token that can read expected project `ftadewtkjlaotfdvtjcv`.
- Confirmed Vercel project/org IDs and canonical production domain.

### Acceptance Criteria

- `verify-lineup-context.ps1` prints `SAFE CONTEXT: YES` only when all configured identities match and exits nonzero otherwise.
- No secret value is committed or logged.
- Production migration/catalog parity is documented read-only.
- Release flow applies and verifies backward-compatible migrations before candidate frontend smoke and promotion.
- A failed database step cannot change the production Vercel alias.

## Phase 1 — Critical Session Integrity and End Authorization

### Goal

Eliminate both P0 findings: allow any authorized active board member to End without corrupting assignment attribution, and make cross-session/mixed-ID mutations structurally and procedurally impossible.

### Files

- New forward migration under `supabase/migrations/`
- New pgTAP file under `supabase/tests/database/`
- `src/types/database.generated.ts` only if generated as part of this schema phase
- allocation architecture/data-model documentation

### Database Changes

- Add a structural same-session invariant. Preferred design: add/backfill `service_session_id` on `table_rotation_entries`, make it non-null, and use composite/constraint relationships that prove the entry, round, and rotation member share the same session. If PostgreSQL FK shape requires supporting unique constraints, add them explicitly.
- Validate existing data before validating new constraints; stop on any cross-session row.
- Preserve `assigned_by` as immutable original attribution. If modifier attribution is required, add a separate `updated_by`/event actor concept rather than overwriting history.
- Add the leading entry index needed for member/status active-entry lookups.

### RPC Changes

- Update all RPCs accepting session, round, member, entry, or event IDs to validate organization, location, and one exact service session before mutation.
- Correct `board_end_table`, `board_end_and_assign`, and relevant undo/redo branches to use the common invariant.
- Add a common private assertion helper only if it reduces duplicated validation and remains invoker-safe.

### RLS Changes

- Replace the entry UPDATE `WITH CHECK assigned_by = auth.uid()` rule with a policy that permits an authorized active board member to change allowed lifecycle fields while preserving tenant/session/lock checks.
- Enforce assignment attribution on INSERT, not by requiring an unrelated updater to equal the original assigner.
- Keep RLS enabled and tenant restrictions explicit; do not solve the defect by disabling policies or making public RPCs privileged without internal checks.

### Frontend Changes

None beyond regenerated types required to compile. Floor and Servers continue calling the shared End contract.

### Tests

- Two authenticated actors in the same org: A assigns, B ends from the equivalent RPC path; verify ended history, released occupancy, and actor event.
- Same for bulk End + Assign, undo, and redo.
- Reject cross-org, cross-location, cross-session, historical-round/current-session, and current-round/historical-member combinations for every ID-bearing mutation.
- Verify same-actor behavior remains valid.
- Verify finalized/historical boards remain locked.
- Verify physical unique claims under simultaneous transactions.

### Migration

Use expand/backfill/validate/contract steps in one safe forward sequence where table size permits. The migration must be compatible with the currently deployed frontend and RPC signatures until its new function definitions are installed transactionally.

### Rollback / Risk

Adding and validating constraints can reveal pre-existing corruption. Before deployment, run read-only detection queries and define a manual remediation decision; do not auto-delete or rewrite production rows. Roll back functions/policies with a forward corrective migration, not by editing applied files.

### Dependencies

- Phase 0 trusted context and production parity.
- Confirmed actual function owners/security modes in production.

### Acceptance Criteria

- Cross-actor End passes via pgTAP/PostgREST and creates exactly one correct event.
- All entry/member/round IDs are guaranteed to belong to the guarded session.
- Historical/finalized session bypass is impossible through direct RPC calls.
- Original assignment attribution is preserved.
- Existing occupancy conflict and position-concurrency tests remain green.

## Phase 2 — One Secure Mutation and Audit Boundary

### Goal

Make RPCs the only authenticated mutation API for allocation state, make board events trustworthy and immutable to clients, centralize lock/role semantics, and serialize undo/redo.

### Files

- New forward migration(s) under `supabase/migrations/`
- New/updated allocation pgTAP tests
- `src/features/allocation/actions/allocation-actions.ts` only if signatures change
- permission/architecture documentation

### Database Changes

- Keep trigger-only mutation privileges for `section_assignments`.
- Remove direct authenticated INSERT/UPDATE/DELETE grants from rotation/session/event tables wherever an RPC owns the operation.
- Make `board_events` append-only and RPC/system-written; retain read access needed by clients and retention ownership needed by cleanup.
- Add row/advisory locking so concurrent undo/redo cannot select the same eligible event.
- Decide and document release-row retention semantics. Do not broaden historical retention without product approval.

### RPC Changes

- If invoker RPCs cannot mutate after grant removal, convert only the required mutation functions to tightly guarded SECURITY DEFINER functions owned by a non-login privileged owner.
- Each privileged RPC must set an empty/fixed search path, verify `auth.uid()`, active membership, org/location/session ownership, allowed role, date lock, and every caller-controlled ID before writes.
- Centralize event creation inside the transaction.
- Add missing `clear_cell` inverse/reapply branches to `board_undo` and `board_redo`.
- Reject stale undo/redo when newer state invalidates the payload.

### RLS Changes

- Replace raw policies that query manager-hidden `tip_pools` with a reliable locked-date helper or remove unused raw mutation policies after grants are revoked.
- Remove `organizations.created_by` authorization from `private.has_org_role`; require active membership and the exact role set.
- Preserve SELECT policies for all legitimate view reads.
- Audit and assert `PUBLIC`/`anon` denial plus exact authenticated EXECUTE grants for all 16 signatures.

### Frontend Changes

- Update RPC argument/result handling only where the explicit contract changes.
- Present structured stale/conflict/locked errors without exposing internals.

### Tests

- Full two-tenant, two-location, two-session negative matrix for all 16 RPCs.
- Exact `pg_proc` security/search-path/owner/ACL assertions.
- Direct PostgREST table mutation denial for authenticated clients.
- Event actor/payload forgery and event update denial.
- Deactivated organization creator loses access.
- `clear_cell` undo/redo restores/removes logical and physical state.
- Concurrent undo and concurrent redo yield one winner and deterministic loser.

### Migration

Change RPC definitions and grants in one transaction. Revoke table grants only after every mutation path has a working RPC. Explicitly re-grant sequences/functions required by those RPCs.

### Rollback / Risk

The main risk is accidentally revoking a legitimate non-board writer or creating a definer escalation. Build a caller inventory first. A rollback is a new migration restoring the prior ACL/function definitions; retain audit evidence of why it was needed.

### Dependencies

- Phase 1 invariants and cross-actor policy correction.
- Production function-owner metadata from Phase 0.

### Acceptance Criteria

- Authenticated clients cannot directly mutate allocation tables or board events.
- All supported UI operations succeed through RPCs for permitted roles.
- Nonmembers, inactive members, wrong tenants/locations/sessions, anon, and PUBLIC are denied.
- Board events are transactionally accurate and client-immutable.
- Clear Cell Undo/Redo works; concurrent undo/redo is safe.

## Phase 3 — Typed Authoritative Read Model

### Goal

Return one explicit read model that distinguishes logical board history from physical occupancy, eliminate silent partial state, and make the TypeScript client reflect deployed schema.

### Files

- `src/features/allocation/data/allocation-data.ts`
- `src/features/allocation/data/allocation-data.test.ts`
- `src/features/allocation/domain/rotation-board.ts`
- `src/features/allocation/domain/floor-layout.ts`
- Supabase client construction files
- `src/types/database.generated.ts`
- related component prop types

### Database Changes

- No new table unless Phase 1 validation proves the current model insufficient.
- Decide whether dead `active_table_count`/`max_concurrent_tables` columns are removed in a later forward migration or formally maintained/enforced. Prefer removal if no approved requirement uses them.
- Retain entries as logical history and section assignments as current physical claims.

### RPC Changes

None required for mutations. A read RPC is optional only if it materially improves atomic snapshot consistency; otherwise use Server Component queries in one clear loader contract.

### RLS Changes

- Confirm authorized allocation readers can SELECT the required active `section_assignments` rows while tenant/location scope remains enforced.
- No browser write policy is added.

### Frontend Changes

- Load active physical claims and project them explicitly into `AllocationContext`.
- Stop deriving physical availability solely by splitting entry labels.
- Keep entry labels/history for logical Grid rendering.
- Define query failure as an error state, not a plausible empty board; represent loading, empty, error, permission denied, and success separately.
- Regenerate database types and instantiate Supabase clients with `Database` generics.
- Define combined resources structurally in the read model rather than repeated ad hoc string parsing where possible.

### Tests

- Data projection tests for active, ended, skipped, combined, unknown-layout, stale/missing claim, and permission/error cases.
- Type check proving current columns/RPC signatures are represented.
- Reconciliation test: every active resolvable entry has expected active claim(s), and every claim points to an active entry.
- Query failure tests for each loader segment.

### Migration

Only if removing/deprecating dead counters. Use a separate forward migration after proving no callers and no production data dependency.

### Rollback / Risk

Switching physical UI truth can expose existing data drift. Add a diagnostic/reconciliation state before changing user-visible availability; never silently choose one conflicting owner.

### Dependencies

- Phases 1–2 stable schema and ACLs.
- Production type generation from the verified linked project or local reset at exact migration head.

### Acceptance Criteria

- Grid history comes from entries; physical occupancy/availability comes from active section assignments.
- A disagreement is visible as a recoverable error/conflict, not a double-bookable table.
- No avoidable `any`; Supabase queries and RPCs use generated types.
- Partial database failure cannot render as an empty successful board.

## Phase 4 — Client State, Realtime, and Mutation Consistency

### Goal

Make client state total, authoritative after authentication/date/reconnect changes, and safe under user interaction latency.

### Files

- `src/components/restaurant-operations-app.tsx`
- `src/features/allocation/components/allocation-workspace.tsx`
- `src/features/allocation/actions/allocation-actions.ts`
- `src/features/allocation/domain/rotation-board.ts`
- relevant unit/component tests

### Database Changes

None.

### RPC Changes

Return stable typed results/version identifiers if required for stale optimistic-action detection. Do not add view-specific RPCs.

### RLS Changes

None.

### Frontend Changes

- Synchronize or remount authenticated team, tip-lock, location, and allocation props after login/route refresh.
- Make reducers total for sparse boards by materializing or safely addressing absent cells.
- Serialize board mutations per session, disable duplicate destructive/undo/redo controls while pending, and reconcile from authoritative state after success or failure.
- Roll back activity and board changes together; project all supported event types consistently.
- Compute next server from cell status, not label presence.
- Recompute today at local date rollover; refetch when returning from history.
- Refresh authoritatively on focus, visibility, online, and Realtime reconnect; narrow no-session invalidation to location when schema permits.
- Revalidate both root and slug entry routes, or tag/cache-invalidate the shared loader coherently.

### Tests

- Login without full reload updates team IDs, occupancy, and finalized lock state.
- Sparse transfer, skip, and end-and-assign do not crash/no-op.
- Overlapping clicks cannot corrupt rollback; duplicate undo/redo is blocked.
- Midnight rollover and history-to-today refetch.
- Offline/sleep/reconnect/focus obtains events missed while disconnected.
- RPC failure removes optimistic activity and restores authoritative state.

### Migration

None unless location-scoped no-session Realtime requires an indexed location field already absent; prefer existing relationships first.

### Rollback / Risk

Over-serialization can make the UI feel slow. Use scoped pending states and clear feedback, but correctness wins over speculative parallel mutation. Keep deterministic domain functions independently testable.

### Dependencies

- Phase 3 explicit read model.
- Stable Phase 2 event and mutation contract.

### Acceptance Criteria

- Authentication, date, focus, reconnect, and route refresh converge to server truth.
- No supported action assumes a dense board.
- At most one conflicting mutation/undo operation runs per session/client.
- All optimistic state, including activity, reconciles on error.
- Reduced-motion, keyboard, and touch behavior remain intact.

## Phase 5 — Cross-View Semantics and UX Parity

### Goal

Give all five views one definition of active/ended/skipped/available/occupied and one explicit model for single, multiple, and combined-table assignments.

### Files

- `allocation-workspace.tsx`
- `floor-view.tsx`
- `server-board-view.tsx`
- `dashboard-view.tsx`
- `table-assignment-decision.tsx`
- `table-map.tsx`
- shared domain utilities and tests
- design/interaction documentation

### Database Changes

None expected. If combined resources cannot be represented safely without normalization, stop and obtain approval for a separate data-model phase rather than encoding more label conventions.

### RPC Changes

- Make transfer/end/unassign target semantics explicit: whole logical assignment versus selected physical resource.
- Reuse shared RPCs across views; do not fork Floor/Server variants.

### RLS Changes

None; view choice must not alter permission.

### Frontend Changes

- Centralize state labels and counts.
- Show when multiple physical tables belong to one logical assignment and explain whole-assignment actions.
- Include unknown/unpositioned active claims in server/dashboard totals with a visible reconciliation state.
- Render recent activity from the full supported event model.
- Fix Picker nested-click propagation.
- Align action availability in Grid, Floor, Picker, Servers, and Dashboard with the same permission/read-only contract.

### Tests

- Cross-view fixture matrix for empty, active, ended, skipped, combined, unknown layout, locked, and permission-denied states.
- Verify one mutation is reflected identically in all five views after authoritative refresh.
- Keyboard/touch/accessibility and tablet/mobile layouts.
- Combined assignment whole-resource behavior for assign, transfer, End, Unassign, and Undo.

### Migration

None expected.

### Rollback / Risk

The risk is changing operator expectations for combined tables. Use clear copy and preserve the existing whole-entry behavior unless a separately approved partial-release model is chosen.

### Dependencies

- Phase 3 state definitions.
- Phase 4 reliable client reconciliation.

### Acceptance Criteria

- Every view agrees on active, ended, unassigned, skipped, available, and occupied.
- Counts include every authoritative claim, including reconciliation warnings.
- Combined-resource actions are unambiguous and consistent.
- Picker interaction and responsive/a11y regressions are covered.

## Phase 6 — Real Integration Verification and Controlled Release

### Goal

Prove the entire production-shaped story and release without frontend/database skew.

### Files

- `playwright.config.ts`
- real-mode E2E fixtures/setup under `tests/e2e/`
- `.github/workflows/ci.yml`
- release workflow from Phase 0
- `docs/CI_CD.md`, `docs/STATUS.md`, feature handoff/log

### Database Changes

No new product schema. CI starts a local Supabase instance at exact migration head and seeds two organizations, two locations, multiple roles, sessions, physical tables, and two authenticated actors.

### RPC Changes

None; this phase verifies the frozen contract.

### RLS Changes

None; this phase proves the frozen policies and ACLs.

### Frontend Changes

Only testability hooks that preserve semantics and accessibility. Do not add production demo bypasses.

### Tests

- Run `npm run check`, full Vitest, production build, all pgTAP, and Playwright desktop/tablet/mobile.
- Live-mode E2E uses Server Actions/PostgREST, real RLS, and two authenticated browser contexts.
- Required critical flows: cross-actor Floor/Servers End, assign/assign-also/transfer/unassign/skip/bulk End + Assign, undo/redo, finalized/history denial, combined resources, simultaneous assignment conflict, Realtime propagation, sleep/offline/reconnect/focus, login hydration, and date rollover.
- Release candidate smoke checks required RPC signatures, migration parity, authenticated reads/mutations, logs, and Supabase security/performance advisors where available.

### Migration

Apply approved forward migrations in order after dry-run. Verify linked history immediately after push. Deploy a Vercel candidate without changing the production domain; promote only after smoke passes.

### Rollback / Risk

Database changes must be backward-compatible so the previous frontend remains functional if candidate smoke fails. Do not rely on destructive down migrations. If a forward database defect is found, apply a corrective forward migration; if frontend smoke fails, leave the previous production alias in place.

### Dependencies

- Phases 0–5 complete and reviewed.
- Valid project identities and protected production environment approvals.

### Acceptance Criteria

- All unit, database, build, and responsive live-mode browser checks pass.
- Production migration list and required RPC/catalog signatures match the release commit.
- Candidate smoke passes before promotion.
- No RLS, PostgREST, Realtime, or application errors appear in release-window logs.
- Handoff and status documents record exact commit, migration head, deployment IDs, test totals, and rollback posture.

## Traceability to Audit Findings

| Phase | Findings addressed                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------- |
| 0     | DEP-001, DEP-002, DEP-003, TEST-001 operational gate                                                    |
| 1     | RLS-001, DATA-001, PERF-001                                                                             |
| 2     | RLS-002, AUDIT-001, UNDO-001, AUTH-001, RLS-003, CONC-001, TEST-002                                     |
| 3     | TYPE-001, DATA-003, SOURCE-001, DATA-004, DATA-005 decision                                             |
| 4     | FRONT-001, FRONT-002, REAL-001, REAL-002, FRONT-003, FRONT-004, CONC-002, REAL-003, FRONT-006, REAL-004 |
| 5     | DATA-002, FRONT-005, FRONT-007, FRONT-008, DOC-001                                                      |
| 6     | TEST-001 and all regression/release evidence                                                            |

## Approval Boundary

Approval should specify whether it covers the complete plan or only the next phase. The recommended first implementation authorization is **Phase 0 and Phase 1 only**, followed by review of the production parity report and critical database diff before Phase 2.

**Implementation status: NOT STARTED — WAITING FOR USER APPROVAL.**
