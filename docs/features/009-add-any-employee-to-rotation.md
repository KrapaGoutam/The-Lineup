# Feature 009 — Add any active employee to the rotation

Status: shipped, later revised

**Implementation note**: same division-of-labor change as Feature 005 — Claude implemented this batch directly, Codex was not in this loop.

**Build note**: implemented together with Feature 010 in one session (both touch `rotation-board.ts` and its undo/redo logic), committed separately.

**Revision (post-ship)**: the claim below that quick-add "already lists everyone" was true only of the static demo roster this feature tested against (`team` in `lib/demo-data.ts`). It stopped being true the moment a live roster could grow beyond that static list — a self-serve registration (Feature 005) never appeared in quick-add, because `availableMembers` filtered the static import, not the live `demoTeam` state registration actually writes to. Root cause: same seam existed in the schedule grid and tip participant picker too. Fixed by lifting `team` into a prop threaded from the single source of truth in all three operational workspaces — see the commit "fix: quick-add, schedule roster, and tip participants all read the live team." The "not schedule-filtered" invariant this feature set out to test and protect remains true and unaffected; only the roster _source_ was wrong.

## User outcome

A manager can add any active employee to the live allocation board as a column — someone who picked up a shift, came in on a day off, or was never rostered at all — not just people the schedule happens to already show as working.

## What the code actually does today

Read before writing anything: `allocation-workspace.tsx`'s `availableMembers` is computed as `team.filter(member => !visibleColumns.some(col => col.id === member.id))` — the full `team` array (all demo employees), filtered only by "not already a column." **There is no schedule-derived filter in the current code at all.** The framing that the board is "limited to scheduled people" describes the intended real-backend behavior once allocation is wired to actual `shift_assignments` (a natural, easy-to-reach-for query would join to today's schedule) — not a bug in the current demo. This feature exists to make that non-filtering an explicit, tested invariant now, before real persistence work (ROADMAP Phase 2 item 6, still unchecked, not touched by this feature) ever gets a chance to accidentally narrow it.

The demo has no example of a genuinely unrostered person to prove this with: every current `team` member has at least one shift in `initialShifts`. Fixing that is part of this feature's scope.

## Scope

**In**

- Add one new demo team member with zero shifts in `initialShifts` (reusing "Ivy Tran" — already named as a 7th demo server in the dead `dashboard-overview.tsx` from Feature 000, so no new identity is invented) to make "never rostered, still addable" concretely demonstrable and testable.
- A code comment and a unit/component test on `availableMembers`/its equivalent making the "not schedule-filtered, all active employees" invariant explicit, so a future change can't silently narrow it without a test failing.
- No change to the "Floor team changed?" quick-add UI itself — it already lists everyone not currently a column, which is the correct behavior; it just wasn't proven or protected by a test.

**Out**

- Any distinction between "active" and "inactive" employee in demo mode — the demo has no deactivation concept yet (flagged as a known gap in the original codebase audit); this feature doesn't add one. All demo `team` members are implicitly active.
- Real Supabase persistence — unchanged, stays demo-mode/in-memory like the rest of the app.

## Acceptance criteria

- [x] A demo employee with no shifts in `initialShifts` (Ivy Tran) appears in the "Floor team changed?" quick-add list and can be added as a column.
- [x] Adding a column — scheduled or not — does not reset, rebuild, or clear the board: existing rounds' recorded table labels are unchanged, the round count is unchanged, and undo/redo history (`past`/`future`) is unaffected. This is already true of the existing `applyBoardAction`'s `"add-column"` case (verified by reading `rotation-board.ts`: it pushes an empty cell for the new column into every existing round and only re-evaluates whether a _new_ round is needed, which it isn't, since the new column's empty cell makes the last round newly incomplete) — this feature adds the test that locks that behavior in, not new reducer logic.
- [x] Undoing an add-column action removes exactly that column and its appended empty cells, restoring the prior board state.

## UX contract

Unchanged from the existing allocation workspace — no new UI states. The "Floor team changed?" card's button list simply includes an employee with no shifts today, same as any other.

## Data and authorization

None — demo-mode-only, no schema, RLS, or migration. (Real-mode note for whenever ROADMAP Phase 2 item 6 is picked up: the eventual Supabase-backed "available to add" query must select from `memberships` scoped to `active = true`, not from a schedule/shift join — this is the concrete requirement this feature is protecting.)

## Implementation map

- `src/lib/demo-data.ts`: add "Ivy Tran" to `team` with no corresponding entries in `initialShifts`.
- `src/features/allocation/domain/rotation-board.ts`: no logic change expected; the existing `"add-column"` case already satisfies the requirement — confirmed by reading it, not assumed.
- `src/features/allocation/components/allocation-workspace.tsx`: no UI change expected beyond the new team member appearing naturally in the existing quick-add list.

## Test plan

- Unit: `rotation-board.test.ts` — adding a column mid-board (with existing filled rounds) leaves prior rounds' cell data byte-for-byte equal except for the new column's appended null cell, and does not create a new trailing round beyond what completeness already requires.
- Component/Playwright: an employee with zero shifts (Ivy) is offered in the quick-add list and can be added; the board's round count and existing table labels are unchanged immediately after.

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (demo-mode only).

## Decisions and risks

- **Decision**: prove and lock the existing "no schedule filter" behavior with a test rather than write new filtering logic that doesn't need to exist yet.
- **Decision**: reuse "Ivy Tran" from the dead `dashboard-overview.tsx` code rather than inventing a new name, since that component is otherwise still unused (Feature 000 audit finding).
- Open questions: none remaining.
