# Table Rotation Multi-View — Agent Handoff

**Planning agent:** Claude (Claude Code)
**Implementation agent:** Claude Code — explicit user-approved override of
the normal Claude-plans/Codex-implements division of labor, for this
feature only (2026-09-19).
**Current branch (as of the production parity fix):**
`fix/table-rotation-production-upgrade`, branched from `main` after
`feature/table-rotation-multi-view` merged (PR #46, merge commit
`d1161c9`, explicit user approval given).
**Current phase:** `feature/table-rotation-multi-view` itself —
COMPLETE and MERGED to `main`: all 5 views, the full backend (occupancy
integrity, permission expansion, auto-row reconciliation, retention),
Upgrade 1.1, the multi-table follow-up, the "End one or more"
follow-up, and the Floor popup/ownership-visuals follow-up (see that
section below). Since merging, production reported a blank Floor/
Picker/Servers layout and a missing `board_skip_turn` RPC — root-caused
and fixed on `fix/table-rotation-production-upgrade` (PR #47); see the
"Production parity fix" section below for current status and the two
items still needing user action. `dining_tables` seeding, once listed
under "What's not done," is now done in production (section below) —
that list entry is historical.

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

**Current state (reproduced live 2026-09-19):** Vitest 366/366, pgTAP
248/248, `npm run check` and `npm run build` both pass, **Playwright
171/171 across all 3 projects** (desktop 57/57, host-tablet 57/57,
server-mobile 57/57 — 153 baseline + 18 new, zero exclusions). Zero
regressions. Full detail in `IMPLEMENTATION_LOG.md`'s "Final local
validation" section.

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

## server-mobile investigation — RESOLVED

Previously reported as an open question (possibly pre-existing/
environmental). That was investigated further and **disproven**: it was
a real regression this feature introduced (the new 5-tab view switcher
caused horizontal page overflow on narrow viewports, which broke click-
actionability against the app's pre-existing fixed bottom mobile nav).
Proven via a clean two-clone A/B comparison (`git clone` + `npm ci`, no
shared `node_modules`) — see `IMPLEMENTATION_LOG.md`'s "server-mobile
investigation" section for exact commands, measurements, and the fix
(commit `17594c0`). Verified: 171/171 across all 3 Playwright projects.

## What's not done

- **`dining_tables` seeding/onboarding** — intentionally not done, no
  stable fixture exists to attach it to (see `IMPLEMENTATION_LOG.md`).
  Real-mode Floor/Picker/Servers show no physical tables until an org has
  registered a floor plan.
- **`table_rotation_entries`/`rotation_rounds` retention** — deliberately
  deferred per the contract, needs explicit product sign-off.
- Formal accessibility/performance review passes (contract sections 24, 57) — not formally done beyond what native semantics and the existing
  design-token discipline provide by construction. Design-screenshot
  comparison was done informally (see `IMPLEMENTATION_LOG.md`).

## Upgrade 1.1 (2026-09-20) — status: implemented, tested, locally validated

Assign / Transfer / End Table / Unassign / Skip Turn as five distinct,
precisely-specified semantics (previously a cell only had "has a label or
not"). Full spec: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md`;
implementation record: `IMPLEMENTATION_LOG.md`'s "Upgrade 1.1" section.

Additive schema only (`table_rotation_entries` gained `status`/
`ended_at`, no new tables); three new RPCs (`board_transfer`,
`board_end_table`, `board_skip_turn`); `board_assign` gained an
overwrite guard; `board_undo`/`board_redo` gained matching case branches
and were also fixed for a genuine pre-existing latent bug (timestamp-
based target selection that could collide within one transaction —
rewritten to order by `board_events.id` instead). Frontend: Grid, Floor,
Picker, and Dashboard all updated for the new lifecycle; Servers inherits
the occupancy fix automatically via `resolveFloorTables`.

**Follow-up UI refinement (same day)**: Transfer and End Table are
Floor-only. Grid and Picker keep only Assign/Edit, Unassign, and Skip
Turn — the Transfer button, End button, and inline "Transfer to…"
submenu were removed from the shared `TableEntry` component (Picker
renders the same table underneath its map card, so it inherited the
change automatically). Backend/domain layer unaffected — `board_transfer`
and `board_end_table` remain fully implemented and tested, just not
wired to a Grid/Picker control. See
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 7 and
`IMPLEMENTATION_LOG.md`'s matching follow-up phase entry.

**Local validation, reproduced live 2026-09-20 (after the follow-up)**:
`npm run check` PASS, Vitest 379/379 (+13, unaffected by the UI-only
follow-up), pgTAP 279 assertions (+31, unaffected), `npm run build`
PASS, Playwright 189/189 across all 3 projects (+18 total over the
pre-Upgrade-1.1 baseline, zero regressions — one existing test's
accessible-name expectation was updated for an intentional rename,
"Clear table N" → "Unassign table N", and one existing test's fixture
setup was moved from Grid's End button to Floor's once Grid's was
removed). Manual visual check (light/dark) of Grid's Ended/Skip badges
and Floor's Transfer/End/Unassign panel: legible, no contrast or layout
issues.

**No merge to `main` has been performed or authorized.** Per this
upgrade's own explicit instruction, the local app must be launched for
manual testing and the user must explicitly approve before any commit,
push, PR, or CI action is taken.

## Multi-table follow-up (2026-09-20) — status: implemented, tested, locally validated

A server may hold zero, one, or many active tables at once — this was
already true of the domain model (no schema change), but Floor's assign
flow (and Servers' `+ Table`) always wrote into one shared "current
round" pointer, so a second assignment for an already-busy server
silently collided with the first, looking exactly like an unwanted
auto-transfer. Full spec: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md`
section 8; implementation record: `IMPLEMENTATION_LOG.md`'s "Multi-table
follow-up" section.

Fixed by a new domain helper (`findEarliestEmptyRoundForColumn`, reused
by `board_transfer`'s existing destination search, the new
`board_end_and_assign` RPC, and every "create a new assignment" call
site) so every new assignment always lands in the target column's own
next free round, never a shared one. Floor's tap-a-table-then-pick-a-
server flow now branches: zero active tables assigns directly; one or
more opens a decision dialog (Assign Also / Transfer / End Existing &
Assign / Cancel), with a sub-picker asking which existing table when
there's more than one. One new RPC (`board_end_and_assign`, atomic,
one `board_events` row); no other RPC's signature changed. Picker's
TableMap now opens as a popup (`components/ui/dialog.tsx`, this repo's
first Dialog primitive — a native `<dialog>` element, no new
dependency) instead of rendering inline below the rotation grid.

A real bug was found and fixed during manual verification (not caught
until an existing Playwright test re-exercised the exact sequence): the
decision dialog's completion paths didn't deselect the Floor panel
afterward, so tapping the same table again toggled the selection off
instead of reopening it. Fixed in `closeDecisionDialog`. See
`IMPLEMENTATION_LOG.md` for the full account.

**Local validation, reproduced live 2026-09-20**: `npm run check` PASS,
Vitest 385/385 (+6), pgTAP 297 assertions (+18), `npm run build` PASS,
Playwright 219/219 across all 3 projects (+30, zero regressions — 6
existing tests were updated because every demo-seed server already has
an active table, so assigning to them now hits the decision dialog, and
2 more had stale pre-popup Picker copy/flow expectations). Manual visual
check (light/dark, desktop + Pixel-7-viewport mobile): the Floor
decision dialog and the Picker popup are both legible, correctly
contrasted, and produce no body horizontal overflow on mobile.

**No merge to `main` has been performed or authorized.**

## "End one or more" follow-up (2026-09-20) — status: implemented, tested, locally validated

Expands "End existing table(s) & assign" (the multi-table follow-up's
third decision-dialog choice) from ending exactly one existing table to
ending any non-empty selection of them — one, several, or every one — in
the same atomic step as assigning the newly selected table. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 9; implementation
record: `IMPLEMENTATION_LOG.md`'s "'End one or more' follow-up" section.

`board_end_and_assign`'s `p_end_round_id bigint` parameter became
`p_end_round_ids bigint[]` (dropped and recreated — Postgres has no
in-place parameter-type change). Validation and the ending update are
both all-or-nothing over the whole array: a stale selection (something
already ended/reassigned one of the checked tables) rejects the entire
call rather than partially applying, and the same guarantee carries over
to `board_undo`/`board_redo`. Floor's End sub-step is now a checkbox
multi-select ("Select all"/"Clear all", a running "N of M selected"
count, a primary action disabled until at least one box is checked)
instead of a list of single-choice buttons; exactly one active table
still skips it and acts immediately, unchanged. No schema changes; no
other RPC's signature changed.

**Local validation, reproduced live 2026-09-20**: `npm run check` PASS,
Vitest 389/389 (+4), pgTAP 319 assertions (+22), `npm run build` PASS,
Playwright 231/231 across all 3 projects (+12, zero regressions — 3
existing tests updated for the intentional button-text change, "End an
existing table & assign" → "End existing table(s) & assign", and the
old single-choice list becoming a checkbox + confirm). Manual visual
check (light/dark, desktop + Pixel-7-viewport mobile): the checkbox
multi-select is legible, correctly contrasted, touch-friendly, and
produces no body horizontal overflow on mobile.

**No merge to `main` has been performed or authorized.**

The multi-table lifecycle and "End one or more" follow-ups above were
committed as `2e464f7 feat(table-rotation): support multi-table floor
assignment lifecycle` at the start of the next phase below, before that
phase's own work began — see `IMPLEMENTATION_LOG.md`'s "Floor commit"
entry. Floor's approved behavior is unaffected by that commit.

## Picker direct popup / Server decision flow follow-up (2026-09-20) — status: implemented, tested, locally validated

Floor's decision flow (multi-table lifecycle + "End one or more") is
treated as approved and left unchanged. This follow-up: (1) Picker's
`TableMap` popup now opens directly from an eligible cell click — no
inline "Table picker" section, no intermediate "Choose table" click —
with Skip Turn moved inside the popup; (2) Server Board's `+ Table` now
runs the exact same zero/one-or-more decision flow Floor uses (via a new
shared `useTableAssignmentDecision` hook,
`components/table-assignment-decision.tsx`, extracted out of
`floor-view.tsx` so the two surfaces can't drift apart), instead of
always doing a plain additive assign with no decision dialog; (3) each
already-assigned table on a Server card is now its own button, scoping
Transfer/End/Unassign to that one table only. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 10; implementation
record: `IMPLEMENTATION_LOG.md`'s "Picker direct popup / Server decision
flow follow-up" section.

No schema or RPC changes — every action Server Board now performs
(`board_assign`, `board_transfer`, `board_end_table`, `board_clear_cell`,
`board_end_and_assign`) already existed and was already exercised from
Floor.

**Local validation, reproduced live 2026-09-20**: `npm run check` PASS,
Vitest 389/389 (unchanged), pgTAP 319 assertions (unchanged), `npm run
build` PASS, Playwright 270/270 across all 3 projects (90/90 ×
desktop/host-tablet/server-mobile). Manual visual check via the running
dev server (live browser interaction at 390×844 mobile, dark theme):
Picker's popup opens immediately on cell click with the correct
server/turn title, Skip Turn and Cancel render inside it, and selecting
a table both closes the popup and visibly assigns (Undo enabled, event
count incremented); Server Board's `+ Table` opens the same popup
scoped to the card's server, and selecting a table for an already-busy
server opens the identical four-choice decision dialog, including its
checkbox multi-select for End existing table(s) — all rendering
correctly with no horizontal overflow at mobile width.

**No merge to `main` has been performed or authorized.**

This follow-up was committed as `e9c4d57 feat(table-rotation): open
picker table map directly, add floor-style actions to server view` and
pushed to `feature/table-rotation-multi-view` at the start of the next
phase below (explicitly authorized by that phase's own staged-git
instruction) — see `IMPLEMENTATION_LOG.md`.

## Floor available-table popup + ownership visuals follow-up (2026-09-20) — status: implemented, tested, locally validated

Every decision-flow semantic from the prior follow-ups is unchanged.
This follow-up: (1) Floor's own AVAILABLE-table "pick a server" step
also became a popup (previously an always-visible side-panel section —
the one thing Picker/Server Board's popups didn't yet match on Floor
itself); (2) an assigned tile (Floor/Picker/Servers, via the shared
`TableMap`) now shows the current server's initials and accent color
instead of a color-only indicator; (3) a new compact server legend sits
above Floor's map, listing every active-on-floor server's initials,
name, and live active-table count. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 11; implementation
record: `IMPLEMENTATION_LOG.md`'s "Floor available-table popup +
ownership visuals follow-up" section.

No schema or RPC changes — presentation-only, reading the same
`resolveFloorTables` occupancy data every other view already shared, so
End/Unassign/Transfer update ownership visuals as a side effect of the
next render rather than through any separate "clear/replace ownership"
step.

Implemented and pushed as three staged commits (per this follow-up's
explicit staged-git-and-CI instruction): `f03a062` (Floor popup),
`b4b12c8` (ownership visuals + legend), and this documentation commit —
CI checked green after each of the first two pushes before proceeding.

**Local validation, reproduced live 2026-09-20**: `npm run check` PASS
at every stage; Vitest 395/395 (+6, all `getInitials` cases); pgTAP 319
assertions (unchanged); `npm run build` PASS; Playwright 144/144 across
all 3 projects (desktop/host-tablet/server-mobile). Manual visual check
via the running dev server (live browser interaction): at desktop width
in light theme, tapping an available table opened the "Assign `<table>`"
popup exactly as specified, and assigning it to a server who already had
active tables correctly chained into the existing decision dialog;
assigning T13 to Mia Chen showed "T13" / "MC" on her accent color with
the legend reading "Mia Chen · 1 table"; at 390×844 mobile width in dark
theme, the legend scrolled horizontally with no page-level overflow and
the assigned tile stayed legible.

This follow-up was merged to `main` as `d1161c9 Merge pull request #46
from KrapaGoutam/feature/table-rotation-multi-view`, after explicit user
manual-test approval ("approved") — matching this repo's existing
merge-commit convention (every prior PR merge, never squash/rebase).

## Production parity fix (2026-09-20) — status: schema/data deployed and verified; two follow-ups need user action

Post-merge, production reported a blank Floor/Picker/Servers layout and
a missing `board_skip_turn` RPC. Root-caused directly against the live
production database (Supabase MCP, read-only first): `dining_tables`/
`dining_areas` had zero rows for this restaurant's location, and
production's migration history had never advanced past
`20260909120000` — all five Table Rotation Multi-View migrations
(including `board_skip_turn`, `board_transfer`, `board_end_table`, and
a `board_assign` signature fix) were undeployed, not just
`board_skip_turn`'s. Root cause of _that_: `deploy-migrations`
(`.github/workflows/database.yml`, push-to-`main` only) has been
silently failing since before PR #39 (`SUPABASE_ACCESS_TOKEN`
privilege problem — a repo-owner action, not a code fix). Full
writeup: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 12;
implementation record: `IMPLEMENTATION_LOG.md`'s "Production parity
fix" section.

Fix branch `fix/table-rotation-production-upgrade` (from `main`), PR
#47, CI green. Local validation: `npm run check` PASS, Vitest 397/397
(+2), pgTAP 330/330 (+11), `npm run build` PASS, Playwright 297/297.

The five already-correct pending migrations plus this fix's new
`20260923090000_table_rotation_floor_layout_backfill.sql` were applied
directly to production via the Supabase MCP connector (each reviewed
for destructive statements first — none found; every referenced
constraint/policy confirmed against the live schema before applying).
Verified after deployment: all 16 `board_*` RPCs now match every
frontend call exactly with correct grants; the full T1-T19/B1-B8
layout exists for the real location with correct coordinates and
area names; `pg_cron` confirmed available, retention job scheduled.

**No merge to `main` has been performed or authorized for this fix
branch.**

## Pending next action

**Migration-history bookkeeping — resolved**: the user granted explicit
permission, the six-row `version` correction was re-run and verified —
production's migration history now matches local filenames exactly.

Two items remain (neither blocks production working right now — the
schema/data fix is already live and verified):

1. **`SUPABASE_ACCESS_TOKEN` GitHub Actions secret**: still needs
   rotation/re-scoping from an account with sufficient privileges on
   project `ftadewtkjlaotfdvtjcv` (the-lineup) before the normal
   `deploy-migrations` CI path works again for future migrations.
2. **Live production smoke test**: not yet performed. This agent could
   not independently determine the public production URL (the
   Vercel MCP connector returned a 403 for this account scope, and the
   deployment URL found via GitHub's deployments API redirects to
   Vercel SSO) — the user is providing the correct URL so this can run
   with the existing test accounts.

Once those are resolved: confirm PR #47 is current with `main`, re-run
CI, and wait for explicit user approval before merging (never
automatic).

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
- Picker/Server follow-up: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md`
  section 10 (new), `INTERACTIONS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`,
  `TEST_PLAN.md`, `README.md`, `IMPLEMENTATION_LOG.md`, this file — all
  updated for the shared decision hook and Picker's direct-popup change.
- Floor popup/ownership visuals follow-up:
  `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 11 (new),
  `INTERACTIONS.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`, `README.md`,
  `IMPLEMENTATION_LOG.md`, this file.

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
- `docs/features/table-rotation-multi-view/tools/capture-implementation-screenshots.mjs`
  (new) + `docs/features/table-rotation-multi-view/screenshots/{dark,light,tablet}/`
  (17 PNGs, new).
- Picker/Server follow-up (new):
  `src/features/allocation/components/table-assignment-decision.tsx`.
  Modified: `floor-view.tsx` (now calls the shared hook instead of
  owning the decision-dialog state), `server-board-view.tsx` (rewritten
  — popup TableMap, decision flow, per-table action dialog),
  `allocation-workspace.tsx` (Picker's direct-popup cell click, popup
  Skip Turn/Cancel, new Server Board props), `tests/e2e/table-rotation-multi-view.spec.ts`.
- Floor popup/ownership visuals follow-up: Modified:
  `floor-view.tsx` (available-table popup, `FloorLegend`, new `team`
  prop), `table-map.tsx` (initials + strengthened selected ring),
  `floor-layout.ts` (+`.test.ts`, new `getInitials`),
  `allocation-workspace.tsx` (threads `team` into `FloorView`),
  `tests/e2e/table-rotation-multi-view.spec.ts`.

## Design handoff copy record

- Source: `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\jobquest-adaptation-workspace\JobQuest1.0\docs\design\table-rotation\` (read-only copy — nothing modified or removed at the source).
- Destination: `docs/design/table-rotation/` (this repo).
- 51 files copied (HTML exports, `support.js`, `uploads/`, nested export
  docs, floor-layout reference PNG, 19 screenshots across dark/light/
  tablet, the automation tool). No unrelated JobQuest application code or
  documentation was copied — the entire source directory was already
  scoped to table-rotation design material only.
