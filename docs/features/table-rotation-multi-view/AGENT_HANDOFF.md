# Table Rotation Multi-View — Agent Handoff

**Planning agent:** Claude (Claude Code)
**Implementation agent:** Codex
**Current phase:** Planning / contract freeze — COMPLETE. Awaiting user
review/approval of `IMPLEMENTATION_CONTRACT.md` before Codex begins.

**Design reference:** `docs/design/table-rotation/` — primary HTML
`approved-design-export/Table Rotation Multi-View v2.dc.html`
(`docs/design/table-rotation/README.md` explains why, not
`Table Rotation Multi-View Standalone.html` despite the name).

**Feature branch recommendation:** `feature/table-rotation-multi-view`
(this repo's current branch already matches — confirm with the user
whether to continue on it or cut fresh from `main` before Codex starts).

**Baseline (reproduced live 2026-09-19):** Vitest 359/359 (independently
re-run). Playwright 153/153, pgTAP 228 assertions (per `docs/STATUS.md`,
not independently re-run this session — Codex should re-run
`npm run test:e2e` and `npm run db:test` once a local Supabase stack is up,
before making any changes, to reconfirm).

**Important existing features this upgrade builds on or supersedes in
part:** 003 (live table-allocation rotation, RPC architecture), 009 (any
employee addable), 010 (reorder), 011 (open cross-column editing), 028
(unrestricted cell editing + date navigation + historical lock). See
`docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md`
section 2 and the individual feature docs' new "Superseded in part by
table-rotation-multi-view" notes.

## Major risks (ranked)

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

## Pending next action

User reviews/approves `IMPLEMENTATION_CONTRACT.md`. Once approved, hand
`CODEX_IMPLEMENTATION_PROMPT.md` to Codex. Codex implements per that
prompt and this handoff, stops after local validation
(`npm run check && npm test && npm run build && npm run test:e2e && npm run db:test`
all green), and does not push/PR/merge/deploy without further explicit
user approval.

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

## Design handoff copy record

- Source: `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\jobquest-adaptation-workspace\JobQuest1.0\docs\design\table-rotation\` (read-only copy — nothing modified or removed at the source).
- Destination: `docs/design/table-rotation/` (this repo).
- 51 files copied (HTML exports, `support.js`, `uploads/`, nested export
  docs, floor-layout reference PNG, 19 screenshots across dark/light/
  tablet, the automation tool). No unrelated JobQuest application code or
  documentation was copied — the entire source directory was already
  scoped to table-rotation design material only.
