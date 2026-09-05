# Feature 007 — Mobile and tablet responsive pass

Status: discovery

**Implementation note**: same division-of-labor change as Feature 005 — Claude implements this batch directly, Codex is not in this loop. See 005 for the full note.

## User outcome

Servers can run their shift from a phone and managers/hosts from a tablet without fighting the layout. Every workspace restructures at narrow widths rather than just shrinking, and every control meets the 44×44 CSS px touch-target rule the PRD already requires.

## Scope

**In**: login field keypad (cross-ref Feature 006), app-shell touch targets, schedule narrow-viewport agenda layout, allocation-board narrow-viewport restructure (see below — the hard case), tips workspace touch/spacing pass, a `button.tsx` icon-size audit.

**Out**: a new component/gesture library, drag-and-drop, offline support.

## The allocation board's narrow-screen structure — the specific ask

Today: a CSS grid, one column per active server (`grid-template-columns: 72px repeat(N, minmax(190px,1fr))`), wrapped in `overflow-x-auto`. At phone width this means scrolling sideways past every other server's column to reach your own — not acceptable per the review that flagged this.

**Below 640px, the grid is replaced entirely** — not just made to scroll better. Revised after review: the original version lost cross-server visibility (who's up next, relative workload) behind per-server tapping, which defeats the board's actual purpose. The fix is a **persistent cross-server summary that's always visible without switching**, merged into the same chip strip rather than added as a second, redundant row:

- **The chip strip is the summary, not just a switcher.** Each chip (one per active/paused server column) shows: status dot, short name, and a **count badge** — the number of rounds that server has a recorded table assignment for so far this service (reusing the counts already implicit in `board.rounds`/`cells`, no new state). The chip for whichever server is next up (the same `nextColumn` value `allocation-workspace.tsx` already computes for the desktop "Next turn" card) gets a distinct highlighted treatment. This means "who's next" and "how does everyone's count compare" are both visible at a glance, permanently, without tapping any chip — satisfying the actual point of the board even at this width.
- Tapping a chip additionally selects that server's column as the one shown in the detail list below — the strip does double duty as summary and switcher rather than duplicating a second nearly-identical row.
- Below the strip: **a single vertical list of rounds for the selected server only** — one row per round (`Turn 1`, `Turn 2`, …), showing that column's cell for that round: the recorded table label, the live "Add table" input inline if it's the signed-in server's own column and their turn is next, or a plain "—" for an empty, not-yet-actionable cell.
- Default selection: a signed-in server's own column is pre-selected (their chip scrolls into view automatically); a manager sees the next-up column selected by default (not just "the first active one" — this puts the operationally relevant column in view immediately).
- Manager controls (pause / resume / clear column / remove) move from always-visible-per-column-header into a single "Manage [selected server]" affordance next to the strip, revealing those same actions for whichever column is currently selected — not N sets of controls rendered at once.
- Clear-row / clear-board / undo / redo stay in the page header, unchanged — they aren't per-column.
- The chip strip itself scrolls horizontally if there are more servers than fit — this is the only horizontal scroll left at this breakpoint, and it's a compact glanceable strip, not a wide data grid.
- 640–1024px (tablet): keeps today's grid + horizontal scroll — the PRD explicitly names 768px/landscape as the live-board target, and the grid is genuinely usable there with a handful of columns, cross-server visibility included natively.
- ≥1024px (desktop/manager): unchanged.
- Implementation: both structures render server-side; Tailwind breakpoint classes (`hidden md:block` / `md:hidden`) toggle visibility — CSS-only, no JS media-query hook, to avoid a second hydration-mismatch risk class like the one already diagnosed in this session.

**This is the part to push back on if it's wrong** — everything else in this spec is lower-stakes layout work.

## Other surfaces

- **App shell**: header icon-only buttons currently render at `size-9` (36px) — under the 44px minimum. Bumping to `size-11`.
- **Schedule**: the 7-day week grid (`min-w-[960px]`, horizontal scroll) becomes, below 640px, a **vertical day-by-day agenda** — one card per day, that day's shifts only. Tablet width keeps the existing grid.
- **Tips**: already mostly stacks correctly at narrow width via existing `sm:grid-cols-3` — touch-target/spacing pass only, no structural change.
- **Login**: `type="tel"` for the passcode field (specified in Feature 006, listed here for completeness since it's a mobile requirement).

## Acceptance criteria

- [ ] At <640px, the allocation board renders the chip strip + single-column round list; the N-column grid never renders full-width at this breakpoint.
- [ ] At <640px, every server's current turn count and the next-up server are visible from the chip strip alone, without tapping into any individual server's detail view.
- [ ] A signed-in server at <640px sees their own column pre-selected, with their next-turn input immediately actionable.
- [ ] A manager at <640px sees the next-up column pre-selected by default.
- [ ] At 768–1024px (both orientations), the allocation board renders the existing grid, matching the PRD's explicit tablet requirement.
- [ ] At <640px, the schedule workspace renders the vertical agenda instead of the 7-day grid.
- [ ] All icon-only header buttons measure ≥44×44 CSS px.
- [ ] The passcode field opens a numeric keypad on a real mobile browser (manual check — Playwright can't fully verify OS keyboard type).

## UX contract

- Desktop: unchanged.
- Host tablet: existing grid/board patterns retained; explicit 768px/landscape target preserved.
- Server mobile: new agenda list (schedule), new summary-and-switcher chip strip + single-column list (allocation), tips workspace unchanged but tightened.
- Loading / Empty / Error / Success / Permission-denied: unchanged states, re-flowed per breakpoint, not redesigned.
- Keyboard/screen reader: the chip strip uses a plain button group with `aria-pressed`/`aria-current`, matching the existing Schedule/Allocation/Tips tab-nav pattern already in the app shell — not new ARIA tabs semantics for a first pass. Each chip's count and next-up status are exposed as visible text (not color alone, per the PRD's "color is never the only indicator" rule), so a screen reader announces "Mia, next up, 3 turns" rather than relying on a highlight color.

## Data and authorization

None — pure UI, no schema, RLS, or migration.

## Implementation map

- `src/components/login-screen.tsx` (input type, cross-ref 006)
- `src/components/restaurant-operations-app.tsx` (header touch targets)
- `src/components/ui/button.tsx` (icon-size audit; will confirm exact current class during build)
- `src/features/schedules/components/schedule-workspace.tsx` (agenda list)
- `src/features/allocation/components/allocation-workspace.tsx` (chip switcher + single-column list)
- `src/features/tips/components/tip-workspace.tsx` (spacing/touch pass)
- No routes, server actions, RPCs, Realtime, migration, or generated types.

## Test plan

- Playwright: new `tests/e2e/responsive.spec.ts` using `test.use({ viewport })` at 375×667 (phone) and 768×1024 / 1024×768 (tablet, both orientations) — asserts allocation shows the chip strip (not the grid) at phone width and the grid at tablet width; every server's count badge and the next-up highlight are visible in the chip strip without tapping any chip; schedule shows the agenda (not the grid) at phone width; the signed-in server's column is pre-selected at phone width; a manager's next-up column is pre-selected; header icon buttons measure ≥44px via `page.evaluate(() => el.getBoundingClientRect())`.
- Component: Testing Library render tests for the chip strip's count/next-up computation and selection logic, and the agenda list's day-grouping, in isolation from full Playwright runs.
- Manual viewports: iPhone SE (375px), iPad portrait/landscape (768/1024), confirm no desktop regression.

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a — pure UI.
- Backfill: none.
- Rollback limit: plain code revert, no data implications.

## Decisions and risks

- **Decision**: the allocation-board narrow-screen structure above (summary-and-switcher chip strip with counts + next-up highlight, single active-column detail list, inline manager controls) — flagged explicitly for approval or pushback.
- **Decision**: the cross-server summary is merged into the chip strip rather than added as a separate row, to avoid two overlapping horizontal strips doing almost the same job.
- **Decision**: CSS-only dual-layout via Tailwind breakpoints, not a JS media-query hook.
- **Risk**: a manager on a phone still can't see every server's _table label detail_ simultaneously, only their turn counts and next-up status — full per-cell detail still requires switching. Accepted trade-off: the summary answers "who's up and who's behind," which was the actual gap; full grid detail remains a tablet/desktop task, consistent with the PRD's primary manager surfaces.
- Open questions: none remaining — this is the spec you said you'd approve or push back on directly.
