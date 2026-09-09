# Feature 034 — Team Status Categorization & Active Filtering

**Name:** Team Status Categorization & Active Filtering
**Owner:** Krapa Goutam
**Status:** shipped
**Issue/PR:** (branch `feature/034-035-team-status-and-purge`, opened off `main`)

## Classification & Session Scope

- **Category:** UI CATEGORIZATION (small, mostly-additive)
- **Modifies vs Adds:**
  - Modifies `src/features/team/components/team-workspace.tsx`: adds an
    Active/Inactive tab bar with live counts; the member list filters to
    the selected tab instead of showing everyone in one flat list.
  - Adds `memberships_org_active_idx` (migration
    `20260909220000_member_status_and_purge.sql`, shared with Feature 035) for the "list org X's active/inactive members" access pattern.
  - Fixes a real, pre-existing bug in the same migration: see "A bug
    found along the way" below.
- **Contradiction Flags & Hard Boundaries:** none new. Every invariant
  this feature touches (tenant isolation, active-only scheduling/
  allocation/tips pickers, role-based authorization for deactivate/
  reactivate) already existed and is unchanged -- see "What already
  existed" below.
- **Session Scope:** paired with Feature 035 in one combined
  audit/build pass, since the two were requested together and 035's
  "Inactive tab" entry point depends on 034 existing first.

## What already existed (audited before writing any code)

Before touching anything, a full audit of the current codebase found
that most of this feature's own spec was **already shipped**, by
Feature 017 (Member Deactivation) and Feature 024 (Team Management
Enhancements):

- `memberships.active boolean not null default true` has existed since
  the very first migration (`20260905065702_initial_schema.sql`) --
  not something this feature adds.
- Deactivate/reactivate (`src/app/api/team/deactivate/route.ts`,
  `.../reactivate/route.ts`, `src/features/auth/data/member-deactivation.ts`)
  already fully implemented, fully symmetric, audit-logged.
- Every scheduling/allocation/tips picker already receives a
  pre-filtered `activeTeam` (`restaurant-operations-app.tsx`'s own
  `team.filter((m) => m.active !== false)`), never the full roster --
  an inactive member already cannot leak into an assignment picker
  today, unrelated to this feature.
- Role-based authorization for deactivate/reactivate
  (`canDeactivateMember`) already existed and needed no change.

The **only** genuinely missing piece was the Team page itself: it
showed every member (active and inactive) in one flat list, with an
inline "Inactive" badge as the only visual distinction, and its own
card header literally said "Active members" even while inactive rows
were mixed into the same list. That's the actual, bounded scope of
this feature: real Active/Inactive tabs, defaulting to Active, with
live counts.

## A bug found along the way (fixed here, not a feature of this one)

Live-testing this feature's own premise -- an Inactive tab that shows
_who_ is inactive, by name -- surfaced a real, pre-existing RLS bug:
`private.can_view_profile` required **both** the viewer's and the
**target's** membership to be `active` before `profiles_select_shared_org`
would let anyone read that profile's `display_name`. Confirmed directly
against a local database: an owner querying a deactivated colleague's
name back through exactly the join `getOrganizationRoster()`
(`src/features/team/data/roster.ts`) already runs today got
`display_name: null`, silently falling through to that function's own
"Unknown" fallback. This almost certainly means today's live Team tab
already shows "Unknown" for every deactivated member's name, and would
have made this feature's own Inactive tab show "Unknown" for every row
in it.

Fixed in the same migration: `can_view_profile` no longer requires the
target to be active -- only the viewer does (a deactivated person still
can't see anyone else's profile, consistent with "`memberships.active`
blocks everything"), but another org member's own active/inactive/
purged status no longer gates whether their name is visible to their
own manager or owner. See
`supabase/migrations/20260909220000_member_status_and_purge.sql`'s own
comment for the full account, and
`supabase/tests/database/0018_member_status_and_purge.test.sql` for
the pgTAP test confirming the fix (and that it would have failed
before).

## Scope

### In

- Active/Inactive tab bar in `TeamWorkspace`, `role="tablist"`/`"tab"`
  with `aria-selected`, default `"active"`. Labels show live counts:
  "Active (N)" / "Inactive (N)", computed off the full unfiltered
  `team` array so the counts stay correct regardless of which tab is
  currently selected.
- The member list (`visibleTeam`) filters to the selected tab; an empty
  tab shows "No active members."/"No inactive members." instead of a
  bare empty card.
- The card header text ("Active members"/"Inactive members") now
  actually matches what's shown, fixing the pre-existing mislabel.
- `memberships_org_active_idx (organization_id, active)` -- the access
  pattern this feature's own list queries actually use; the existing
  `memberships_profile_org_idx` is `(profile_id, organization_id)
where active`, tuned for the opposite query shape ("is this profile
  active in org X").
- The `can_view_profile` fix above.

### Out

- No change to deactivate/reactivate's own authorization, writes, or
  UI (`MemberStatusDialog` is untouched).
- No change to any scheduling/allocation/tips picker -- they were
  already correctly active-only before this feature, and stay that way.
- No new database column for "status" -- `memberships.active`
  (boolean) remains the only status flag; Feature 035 adds a third,
  orthogonal state (`purged_at`) but that's its own feature's doc.

## Acceptance Criteria

- [x] Given the Team page, the default view shows only active members,
      with an explicit Active/Inactive tab bar.
- [x] Given the Inactive tab, every inactive member's real name is
      visible (not "Unknown") -- confirmed both by the `can_view_profile`
      pgTAP fix and by a live e2e test in demo mode.
- [x] Given either tab, the tab labels show accurate live counts.
- [x] Given an empty tab, a clear "No active/inactive members." message
      appears instead of a blank card.
- [x] Given the full quality gate, `npm run check` (0 errors/warnings),
      `npx vitest run` (330/330), `npm run db:test` (226/226, 18 files),
      `npm run build`, and the full Playwright suite (156/156 across 3
      viewports) all pass.

## Implementation Map

- `supabase/migrations/20260909220000_member_status_and_purge.sql`
  (shared with Feature 035): `memberships_org_active_idx`; the
  `can_view_profile` fix.
- `supabase/tests/database/0018_member_status_and_purge.test.sql`
  (shared with Feature 035): index existence + the `can_view_profile`
  visibility-fix assertion (test 2 of 15).
- `src/features/team/components/team-workspace.tsx`: `StatusTab` state,
  `activeCount`/`inactiveCount`/`visibleTeam` derivations, the tab bar,
  the empty-state messages.
- `src/features/team/data/roster.ts`: no change needed for this
  feature specifically (already returns the full roster with `active`;
  Feature 035 is what adds `purged_at` to its select).

## Test Plan & Quality Gates

- **DB tests:** `0018_member_status_and_purge.test.sql`'s structural
  index check and the `can_view_profile` visibility assertion (shared
  file with Feature 035's own purge tests).
- **E2E tests:** `tests/e2e/team-management.spec.ts`'s new test opens
  with tab-default and empty-Inactive-tab assertions before moving into
  Feature 035's purge flow, and confirms the deactivated member's real
  name is visible in the Inactive tab afterward.
- **Verification Gate:**
  - `npm run check` clean.
  - `npx vitest run` 44/44 files, 330/330 tests.
  - `npm run db:test` 18/18 files, 226/226 assertions (local Supabase).
  - `npm run build` clean.
  - `npx playwright test` full suite, 156/156 across
    desktop/host-tablet/server-mobile.

## Decisions and risks

- **Decision:** audited the existing codebase fully before writing any
  code, rather than assuming the spec's numbered steps (schema check,
  index, UI tabs) all represented new work. Most of them didn't --
  building them again from scratch would have duplicated Feature
  017/024 and very likely introduced a second, competing notion of
  "active" alongside the real one.
- **Decision:** fixed the `can_view_profile` bug in this same migration
  rather than filing it separately, since it directly and completely
  undermines this feature's own stated purpose (an Inactive tab that
  shows who is inactive, by name) -- leaving it unfixed would have
  shipped a tab that always reads "Unknown."
- **Risk/mitigation:** the `can_view_profile` fix widens profile-name
  visibility slightly (an inactive member's name is now visible to
  their active teammates, where before it silently wasn't) -- reviewed
  against this schema's own stated invariants and judged correct
  (`memberships.active` on the _viewer_ still gates everything; a
  deactivated person still can't see anyone), but worth flagging
  explicitly as a visibility change, not just a fix framed as
  risk-free.
