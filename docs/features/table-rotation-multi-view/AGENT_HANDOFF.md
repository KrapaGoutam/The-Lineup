# Table Rotation Multi-View — Agent Handoff

**Planning agent:** Claude (Claude Code)
**Implementation agent:** Claude Code — explicit user-approved override of
the normal Claude-plans/Codex-implements division of labor, for this
feature only (2026-09-19).
**Current branch:** `feature/table-rotation-multi-view`
**Current phase:** Implementation — COMPLETE for all 5 views and the full
backend (occupancy integrity, permission expansion, auto-row
reconciliation, retention). Locally validated (Vitest/pgTAP/build/
Playwright desktop+host-tablet all green; Playwright server-mobile
unreliable in this sandbox, see below — not a known regression). A small
number of items are explicitly out of scope for this session (dining_tables
seeding/onboarding, broader retention) — see "What's not done" below and
`IMPLEMENTATION_LOG.md` for the full phase-by-phase record.

**Design reference:** `docs/design/table-rotation/` — primary HTML
`approved-design-export/Table Rotation Multi-View v2.dc.html`
(`docs/design/table-rotation/README.md` explains why, not
`Table Rotation Multi-View Standalone.html` despite the name).

**Feature branch recommendation:** `feature/table-rotation-multi-view`
(this repo's current branch already matches — confirm with the user
whether to continue on it or cut fresh from `main` before Codex starts).

**Baseline before this feature (reproduced live 2026-09-19):** Vitest
359/359, Playwright 153/153, pgTAP 228 assertions — all independently
re-run, not just read from `docs/STATUS.md`.

**Current state (reproduced live 2026-09-19, end of this implementation
session):** Vitest 366/366, pgTAP 248/248, `npm run check` and
`npm run build` both pass. Playwright: desktop 57/57 and host-tablet
57/57 (51 baseline + 6 new each), server-mobile unreliable in this
sandbox — reproduces on an unrelated, pre-existing test too, so it does
not look like a regression from this feature, but could not be proven
clean either (see `IMPLEMENTATION_LOG.md`'s "Known issue" section for the
full diagnosis). Zero regressions in everything that could be reliably
run. Full detail in `IMPLEMENTATION_LOG.md`'s "Final local validation"
section.

**Important existing features this upgrade builds on or supersedes in
part:** 003 (live table-allocation rotation, RPC architecture), 009 (any
employee addable), 010 (reorder), 011 (open cross-column editing), 028
(unrestricted cell editing + date navigation + historical lock). See
`docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md`
section 2 and the individual feature docs' new "Superseded in part by
table-rotation-multi-view" notes.

## Major risks (ranked) — status: 1-4 and 6 addressed and tested; see below

1. **Occupancy/data-integrity implementation** — the `table_occupancy` +
   combined-table locking design (contract section 6/3.4) is the most
   architecturally load-bearing new piece; get the concurrency guarantee
   right (DB-level lock/constraint, not an app-level check) or Floor/
   Picker's core promise ("is this table really available") is false.
2. **Auto-row rule reconciliation** — must fully replace
   `private.ensure_trailing_round`, not run alongside it (contract
   section 9). Two competing auto-row mechanisms would be worse than one
   wrong one.
3. **Authorization expansion correctness** — must be enforced at the RPC/
   RLS layer, not only hidden/shown in the frontend (contract section 4,
   `PERMISSIONS.md`). A frontend-only gate change would be a real security
   gap, not just a UX one.
4. **Undo/redo compatibility** — every new mutation type (occupancy,
   delete_row) must extend the existing `board_events` payload/
   inverse_payload mechanism, not add a parallel undo path.
5. **Realtime/concurrency** — no new channels; correctness rides entirely
   on the DB-level transaction guarantees in points 1 and 2.
6. **Retention scope creep** — v1 is `board_events` only; do not extend to
   `table_rotation_entries`/`rotation_rounds` without explicit product
   sign-off (Feature 028's date navigation depends on that data).

## What's done

- **Occupancy integrity** (risk #1): `section_assignments` (existing,
  previously-dead table) extended into the authoritative ledger, one
  `SECURITY DEFINER` trigger on `table_rotation_entries` keeps it in sync
  for every mutation path automatically. Deviates from the frozen
  contract's `table_occupancy`/`table_occupancy_members` design — reuses
  existing schema instead; see `IMPLEMENTATION_LOG.md` for why. 15 pgTAP
  assertions covering conflict/transfer/release/combined-tables.
- **Auto-row rule** (risk #2): single reconciled rule (~2 trailing empty
  rounds), implemented identically in the real-mode RPC and the demo-mode
  reducer. pgTAP + Vitest coverage.
- **Permission expansion** (risk #3): enforced at the RPC/RLS layer first
  (`private.assert_is_active_board_member`, `rotation_members_operate_service`
  role array), frontend gates changed to match. pgTAP + Playwright
  coverage.
- **Undo/redo compatibility** (risk #4): no new mechanism — occupancy
  changes ride the existing `table_rotation_entries` mutations
  automatically; `delete_row` got its own case branch.
- **Retention** (risk #6): `board_events` only, 7 days, `pg_cron`. Correctly
  did NOT touch `table_rotation_entries`/`rotation_rounds`.
- **Grid**: delete-row control, Active Floor Operations gates, Quick Add
  clocked-in prioritization.
- **Floor, Picker, Servers, Dashboard views**: all built on the shared
  `TableMap` and the same `execute()` mutation path the Grid uses.
  Manually verified working end-to-end in the browser (assign via any
  view shows up correctly on every other view, in the same round), both
  themes legible. Automated Playwright coverage for all four
  (`tests/e2e/table-rotation-multi-view.spec.ts`).

## What's not done

- **`dining_tables` seeding/onboarding** — intentionally not done, no
  stable fixture exists to attach it to (see `IMPLEMENTATION_LOG.md`).
  Real-mode Floor/Picker/Servers show no physical tables until an org has
  registered a floor plan.
- **`table_rotation_entries`/`rotation_rounds` retention** — deliberately
  deferred per the contract, needs explicit product sign-off.
- Design-screenshot comparison pass, formal accessibility/performance
  review passes (contract sections 50, 24, 57) — not formally done.
- **Playwright `server-mobile` project reliability in this sandbox** —
  see `IMPLEMENTATION_LOG.md`'s "Known issue" section. Worth a fresh
  investigation (clean environment, no leftover dev-server processes)
  before this repo relies on that project's results here.

## Pending next action

All 5 views and the full backend are implemented, tested, and manually
verified. Recommended: review the branch, decide on the `server-mobile`
Playwright question above (retry in a clean environment, or accept
desktop+host-tablet as sufficient local evidence), then proceed to
push/PR/remote CI once you're ready — none of that has happened yet.

Per the mega-prompt's own explicit instruction: local implementation and
validation are complete. No push, PR, merge, or deploy has happened or
should happen without further explicit approval.

## Documentation created/updated this phase

- `docs/design/table-rotation/` — copied into this repo from JobQuest1.0
  (see below), `README.md` corrected/extended.
- `docs/design/table-rotation/tools/capture-design-screenshots.mjs` —
  Playwright import path fixed for this repo's layout (root
  `node_modules`, not a `backend/` subdirectory).
- `docs/features/table-rotation-multi-view/README.md`
- `docs/features/table-rotation-multi-view/ARCHITECTURE.md`
- `docs/features/table-rotation-multi-view/DATA_MODEL.md`
- `docs/features/table-rotation-multi-view/PERMISSIONS.md`
- `docs/features/table-rotation-multi-view/INTERACTIONS.md`
- `docs/features/table-rotation-multi-view/TEST_PLAN.md`
- `docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md`
- `docs/features/table-rotation-multi-view/CODEX_IMPLEMENTATION_PROMPT.md`
- `docs/features/table-rotation-multi-view/AGENT_HANDOFF.md` (this file)
- `docs/features/003-table-allocation.md`, `009-*.md`, `010-*.md`,
  `011-*.md`, `028-*.md` — each gets a short pointer note (not a rewrite)
  to this feature where it materially supersedes/extends their content.
- `docs/features/table-rotation-multi-view/IMPLEMENTATION_LOG.md` — the
  phase-by-phase implementation record (created during implementation,
  not planning).

## Implementation files (this session, see IMPLEMENTATION_LOG.md for detail)

- `supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql`,
  `20260919130000_board_events_retention.sql`
- `supabase/tests/database/0019_*.test.sql`, `0020_*.test.sql`
- `src/features/allocation/domain/floor-layout.ts` (+ `.test.ts`)
- `src/features/allocation/components/table-map.tsx`, `floor-view.tsx`,
  `server-board-view.tsx`, `dashboard-view.tsx`
- Modified: `rotation-board.ts` (+`.test.ts`), `allocation-workspace.tsx`,
  `allocation-actions.ts`, `allocation-data.ts`,
  `src/features/auth/domain/passcode.ts`, `src/types/database.generated.ts`
- `tests/e2e/table-rotation-multi-view.spec.ts` (new — Floor/Picker/
  Servers/Dashboard coverage)
- Modified: `tests/e2e/allocation-open-editing.spec.ts`,
  `tests/e2e/dashboard.spec.ts` (permission-expansion assertions updated)
- `.prettierignore`, `eslint.config.mjs` — exclude the copied design
  export from formatting/linting (reference material, not ours to
  reformat).

## Design handoff copy record

- Source: `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\jobquest-adaptation-workspace\JobQuest1.0\docs\design\table-rotation\` (read-only copy — nothing modified or removed at the source).
- Destination: `docs/design/table-rotation/` (this repo).
- 51 files copied (HTML exports, `support.js`, `uploads/`, nested export
  docs, floor-layout reference PNG, 19 screenshots across dark/light/
  tablet, the automation tool). No unrelated JobQuest application code or
  documentation was copied — the entire source directory was already
  scoped to table-rotation design material only.
