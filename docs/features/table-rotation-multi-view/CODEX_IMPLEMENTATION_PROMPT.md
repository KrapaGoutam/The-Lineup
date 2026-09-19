# Codex Implementation Prompt — Table Rotation Multi-View

Paste this whole file into Codex as its task prompt.

---

You are implementing a frozen feature contract in The Lineup
(`C:\Users\krapa\Documents\Projects\Restaurent\The Lineup`), a Next.js 16 +
Supabase modular-monolith restaurant scheduling app. Claude Code has
already completed planning and design-handoff placement for this feature;
you are the implementer, per this repo's own `CLAUDE.md`/`AGENTS.md`
division of labor. Do not redesign or reinterpret the requirements below
unless a specific document explicitly marks a decision as open — where you
find one, resolve it the way the relevant document instructs (e.g. by
checking existing code before choosing), and record what you decided in
that document, don't just improvise silently.

## Read these first, in this order

1. `/CLAUDE.md`, `/AGENTS.md` — non-negotiable repo rules.
2. `docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md` —
   the frozen contract. This is authoritative.
3. `docs/features/table-rotation-multi-view/AGENT_HANDOFF.md` and
   `PERMISSIONS.md`.
4. `docs/features/table-rotation-multi-view/ARCHITECTURE.md`,
   `DATA_MODEL.md`, `INTERACTIONS.md`, `TEST_PLAN.md`.
5. `docs/design/table-rotation/README.md` and the approved design export
   it points to (primary reference:
   `docs/design/table-rotation/approved-design-export/Table Rotation Multi-View v2.dc.html`,
   plus `screenshots/dark/` and `screenshots/light/`).
6. Existing feature docs this upgrade builds on:
   `docs/features/003-table-allocation.md`, `009-add-any-employee-to-rotation.md`,
   `010-reorder-rotation-servers.md`, `011-allocation-board-open-editing.md`,
   `028-table-allocation-unrestricted-editing.md`.
7. `docs/DATA_MODEL.md` and `docs/DESIGN_SYSTEM.md` for the existing,
   unchanged-by-this-feature model/tokens you must plug into.

## Ground rules

- Implement the frozen contract. Do not add scope, do not skip scope, do
  not silently change an architectural decision the contract already
  made (occupancy design, auto-row rule, permission model). If you
  genuinely believe a decision in the contract is wrong, stop and say so
  in `AGENT_HANDOFF.md` rather than deviating silently.
- SECURITY INVOKER RPCs, one per action, each RPC writing its table
  mutation and its `board_events` row in one transaction — this repo's
  established pattern (ADR 0001, existing `board_*` RPCs). Follow it for
  every new RPC.
- Multi-tenant scoping (`organization_id`, `location_id`) and RLS on every
  new/changed table — mandatory, no exceptions.
- The rotation "decision engine" stays a pure, deterministic reducer
  (`rotation-board.ts`) — DB persistence and Realtime are separate
  concerns layered on top, not mixed into it.
- No new palette — style only via the existing CSS custom properties
  (`src/app/globals.css`) and their Tailwind mapping, both `data-theme`
  values.
- Reuse `lucide-react` icons the way `allocation-workspace.tsx` already
  does for the same actions (contract section 21 has the exact mapping).
- Known project commands (confirm they still match `package.json` before
  running — do not assume):
  ```
  npm run check      # format:check + lint + typecheck
  npm test           # Vitest
  npm run build
  npm run test:e2e   # Playwright
  npm run db:test    # pgTAP (needs `npm run supabase:start` / `npm run db:reset` first)
  ```
  Testing stack is Vitest + Playwright + pgTAP — not Jest.

## Local-first workflow

1. Create/confirm feature branch `feature/table-rotation-multi-view`.
2. Work in logical, reviewable commits.
3. Migrations through this repo's normal `supabase/migrations/` workflow
   (new files, never edit a merged one) with matching pgTAP tests under
   `supabase/tests/database/`.
4. Run targeted tests as you go, not just at the end.
5. Update `docs/features/table-rotation-multi-view/AGENT_HANDOFF.md` after
   each stable phase (what's done, what's next, any decision you had to
   make that wasn't already pinned down).
6. Before considering the feature done, run **all** of, locally, and fix
   anything that fails:
   ```
   npm run check
   npm test
   npm run build
   npm run test:e2e          # desktop, host-tablet, server-mobile projects
   npm run db:test
   ```
7. Capture Playwright screenshots (desktop, iPad-landscape/host-tablet,
   Pixel-7/server-mobile projects; dark and light) for the 5 new/changed
   views as part of your own validation — compare against
   `docs/design/table-rotation/screenshots/`.
8. Run the full regression suite — do not delete or weaken existing tests
   to make numbers pass. New tests must expand coverage per `TEST_PLAN.md`.

## Baseline you must not regress

Vitest 359/359, Playwright 153/153, pgTAP 228 assertions (re-verify these
counts yourself at the start, since time may have passed since this
contract was frozen).

## Hard stop

**After local validation passes, STOP.**

Do NOT:

- push
- open a pull request
- merge
- deploy

Wait for explicit user approval before any of those. Local validation
passing is the finish line for this phase, not a signal to proceed to any
of the above.

## What "done" looks like

Every checklist item in `IMPLEMENTATION_CONTRACT.md`'s own text is
implemented, `TEST_PLAN.md`'s coverage exists and passes, `AGENT_HANDOFF.md`
reflects final state (mark phase as "Implementation complete, awaiting
user review for push/PR"), and the 5 views are visually consistent with
`docs/design/table-rotation/screenshots/` in both themes.
