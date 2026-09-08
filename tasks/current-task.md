# Current Task: Feature 024 — Team Management Enhancements

**Active Spec:** `docs/features/024-team-management-enhancements.md`
**Branch:** `feature/024-team-management-enhancements` (stacked on `feature/023-settings-consolidation`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Add the one genuinely missing Team capability — **renaming a member's
display name** — with server-side validation, RLS authorization, and an
audit trail; add audit logging to the two adjacent sensitive actions
(designation change, passcode reset) that don't have it yet; and surface
attendance-link status directly in the roster so acceptance criterion 1
("...attendance link status...") is actually visible without opening a
dialog. Designation management, passcode reset, attendance linking, and
active/deactivate are **already fully implemented** (Features 014/016/
017/019) and embedded reachable from Settings (Feature 023's Team quick-
link card) — this feature does not rebuild any of that.

## 📖 Reconciliations (spec text vs. actual app — resolved before coding)

1. **Entry point is already satisfied.** The spec allows "a full subview
   reachable from Settings" as an alternative to embedding inline —
   Feature 023 already added exactly that (Settings → Team card →
   `setTab("team")`). No navigation change needed.
2. **Designations are not "Server, Host, Busser."** The real, RLS-backed
   `Designation` type (Feature 014) is `owner | manager |
assistant_manager | staff` — it encodes the _authorization tier_
   (mirrors `memberships_update_manager`'s RLS exactly), not a job title.
   There is no job-title column in the schema and adding one is a bigger,
   unscoped change. Rename/designation/reset all continue to operate on
   the real 4-value designation system, matching `assignableDesignations`
   already in `src/features/team/domain/designations.ts` — untouched.
3. **`user_profiles.full_name` doesn't exist.** The real table is
   `public.profiles.display_name` (constrained 1–100 chars, trimmed).
   Rename targets that column, reusing `isValidDisplayName` from
   `@/features/auth/domain/registration` (2–100 chars) for both the
   dialog and the server action — the same validator registration
   already uses, not a new one.
4. **`audit_logs` doesn't exist; `audit_events` already does.** A
   generic, tenant-scoped, RLS-protected audit table already exists
   (`supabase/migrations/20260905065702_initial_schema.sql`, used today
   by Tip Split's finalize/reopen trail). Rename, designation change, and
   passcode reset write into this existing table — no new table.
5. **Rename requires a genuine RLS change — the one real schema delta
   this feature needs.** `profiles` currently has only
   `profiles_update_self` (`id = auth.uid()`); nothing lets a manager
   update a _different_ member's row. Adds one additive UPDATE policy
   (`profiles_update_manager`) via a new `private.can_manage_member()`
   SECURITY DEFINER helper mirroring `memberships_update_manager`'s exact
   hierarchy (owner unrestricted; manager can act only on a target who
   isn't owner/manager). Covered by a pgTAP policy test, run for real
   against the local Supabase instance already running in this
   environment (`npm run db:reset && npm run db:test`).
6. **One new dialog, not one mega-dialog.** The spec's Implementation Map
   names a single `edit-member-dialog.tsx` for rename + designation +
   attendance linking combined. The existing, working, already-tested
   UI uses three separate lightweight dialogs/inline-actions
   (`PasscodeResetDialog`, `MemberStatusDialog`, `AttendanceLinkDialog`,
   plus inline "Make X" designation buttons). Consolidating all of that
   into one mega-dialog would be a risky, unscoped rewrite of working
   code for a cosmetic requirement no acceptance criterion actually
   tests. Adds `RenameMemberDialog` following the exact same pattern as
   its siblings instead.
7. **No reason prompt for rename or designation-change audit rows.**
   Passcode reset already collects a `reason` (3–500 chars) that maps
   directly onto `audit_events.reason`. Designation change and rename are
   one-click actions today with no reason UI; `audit_events.reason` is
   nullable, so their audit rows carry `reason: null` and put the actual
   change in `before_state`/`after_state` (jsonb) instead — more
   informative than forcing a free-text reason onto a currently
   frictionless action, and not a UX change this feature asks for.

## 🔒 Non-negotiable constraints

- Identity linking stays 100% manual by UUID/`neonUserId` pairing —
  nothing added here infers or matches on name strings (unchanged,
  `AttendanceLinkDialog` already enforces this).
- Team management stays manager/owner-only; the entry point (Settings'
  Team card) is already gated by `isManager` (Feature 023).
- No changes to tenant scoping (`organization_id`), the allocation/
  payroll/tips RLS surface, or Feature 019 attendance scoping.
- Self-service role promotion stays impossible — `assignableDesignations`
  (unchanged) already only offers a target set the acting role is
  RLS-permitted to write.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app code.
- [x] **Step 2: Migration + pgTAP policy test**
  - [x] `supabase/migrations/20260908170000_profiles_manager_rename.sql`:
        `private.can_manage_member(target_profile_id uuid)` SECURITY
        DEFINER function. Delegates the actor-side check to
        `private.has_org_role` (found via the target's own active
        membership row) rather than re-deriving it inline, so the
        org-creator bypass `has_org_role` already has stays consistent
        here too; refuses a deactivated target entirely. Revoked from
        public/anon, granted to authenticated; new additive
        `profiles_update_manager` UPDATE policy using it. No GRANT
        changes needed (`update` on `profiles` is already granted to
        `authenticated`).
  - [x] `supabase/tests/database/0012_profiles_manager_rename.test.sql`:
        owner renames anyone including another owner; manager renames
        an assistant-manager-tier target; manager blocked from renaming
        the owner; deactivated target blocked; cross-organization
        rename blocked; self-rename still works via the untouched
        `profiles_update_self` policy. 8/8 assertions.
  - [x] `npm run db:reset && npm run db:test` — ran for real against the
        local Supabase instance already running in this environment:
        `Files=12, Tests=179 ... Result: PASS` (was already 171 tests
        across 11 files; this feature adds the 12th file, 8 new tests).
        `npm run db:types` regenerated with zero net diff (the new
        function lives in the `private` schema, never exposed to
        PostgREST, so the public type surface is unchanged).
  - [x] `npm run check`, `npm test` (187/187), `npm run build` — all
        clean.
- [x] **Step 3: Server actions + audit logging**
  - [x] `src/features/team/data/audit-log.ts`: `writeAuditEvent()` —
        thin wrapper around an `audit_events` insert, structurally typed
        so it accepts both the regular RLS-bound client and the admin
        client. Logs and swallows its own failure.
  - [x] `src/features/team/actions/member-actions.ts` (new, per the
        spec's Implementation Map): `renameTeamMemberAction` — validates
        with `isValidDisplayName`, updates `profiles.display_name`
        (authorized by the new RLS policy, not re-checked in
        application code), writes an audit_events row
        (`entity_type: "profile"`, before/after `display_name`),
        revalidates.
  - [x] `src/features/team/actions/team-actions.ts`: added a
        `writeAuditEvent` call to `updateTeamDesignationAction` (before/
        after designation); `previousDesignation` now an input, looked
        up client-side from the already-loaded `team` state rather than
        an extra server round trip.
  - [x] **Correction to the plan**: `src/app/api/auth/passcode/reset/route.ts`
        already writes its own `audit_events` row (`action:
"passcode_reset"`, with the reset dialog's collected `reason`) —
        missed in the original exploration pass (an earlier grep for
        `audit_log`/`auditLog` didn't match `audit_events`). Left
        untouched: it already does the job correctly, and swapping it to
        the new shared helper would be a same-behavior refactor of
        working code with no test coverage change to show for it.
  - [x] Unit tests: `member-actions.test.ts` (5 tests — empty/whitespace-
        only/over-100-char names rejected without touching the database,
        a 100-char name accepted at the boundary, a valid rename trims,
        saves, and writes the audit row with correct before/after
        state). `designations.test.ts` (already comprehensive) needs no
        changes.
  - [x] `npm run check`, `npm test` (192/192), `npm run build` — all
        clean.
- [x] **Step 4: UI**
  - [x] `src/features/team/components/rename-member-dialog.tsx`: same
        lightweight pattern as `PasscodeResetDialog`/`MemberStatusDialog`
        (no explicit focus trap there either -- matched, not invented).
  - [x] `src/features/team/components/team-workspace.tsx`: added a
        "Rename" action (same authorization tier as passcode reset —
        `canReset`, already computed per row); loads attendance-link
        status once on mount via the existing `onLoadAttendanceOptions`
        prop (no new action) and shows a Linked/Not linked badge per
        row, refreshed after any link/unlink action.
  - [x] **Real regression found and fixed via live testing**: the
        roster row's flex-wrap layout, already dense, broke visibly on
        a 390px viewport once the Rename button and link-status badge
        were added -- the name truncated to nothing and action buttons
        overlapped the badge. Restructured the row to stack vertically
        (name+badges, then a wrapped action-button group) below `sm:`
        and stay horizontal at `sm:` and up; confirmed clean on both a
        390×780 and a 1440×900 screenshot after the fix, and re-diffed
        the resulting desktop screenshot against the pre-change one to
        confirm no regression there either.
  - [x] `src/components/restaurant-operations-app.tsx`: new
        `renameTeamMember` handler (demo + real mode, mirrors
        `changeDesignation`'s shape, including its same pre-existing
        limitation that the signed-in `user` object itself isn't
        updated if an owner renames themselves), prop threading into
        `TeamWorkspace` (`renameTarget` dialog state lives inside
        `TeamWorkspace` itself, matching its sibling dialogs -- no new
        state needed in the app shell).
  - [x] Live Playwright smoke test (manager desktop + mobile): renamed
        Mia Chen to "Mia Chen-Rodriguez", confirmed immediate roster
        reflection; linked her attendance record and confirmed the
        badge flipped from "Attendance not linked" to "Attendance
        linked" without a reload.
  - [x] `npm run check`, `npm test` (192/192), `npm run build` — all
        clean.
- [x] **Step 5: E2E flow** (`tests/e2e/team-management.spec.ts`)
  - [x] Manager renames a staff member, promotes Staff -> Assistant
        Manager, resets their passcode to a known chosen value (simpler
        and just as conclusive as parsing an auto-generated one out of
        the DOM), links their attendance record, then signs out and
        back in as that member with the new passcode -- proves the
        reset passcode actually works end to end, not just that the
        dialog reported success.
  - [x] Server cannot reach Team management at all (the "Team" nav
        button is absent both directly and inside the mobile "More"
        sheet).
  - [x] Two real bugs in the test itself, found and fixed while running
        it live rather than assumed correct: `getByLabel("Name")` and
        `getByRole("button", { name: "Reset passcode" })` both hit
        Playwright's default substring matching against _other_
        elements whose labels happen to contain those words as a
        substring ("Re**name**", "Close **reset passcode**") --
        `exact: true` fixed both.
  - [x] 6/6 passing across all three Playwright projects (desktop,
        host-tablet, server-mobile).
- [ ] **Step 6: Docs**
  - [ ] Check off acceptance criteria in
        `docs/features/024-team-management-enhancements.md`.
  - [ ] Update `docs/STATUS.md` Feature Matrix.
- [ ] **Step 7: Push branch, open PR (base:
      `feature/023-settings-consolidation`), paste gate output + PR link
      here.**

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `supabase/migrations/20260908170000_profiles_manager_rename.sql` (new)
- `supabase/tests/database/0012_profiles_manager_rename.test.sql` (new)
- `src/features/team/data/audit-log.ts` (new)
- `src/features/team/actions/member-actions.ts` (new)
- `src/features/team/actions/member-actions.test.ts` (new)
- `src/features/team/actions/team-actions.ts` (audit logging added)
- `src/app/api/auth/passcode/reset/route.ts` (audit logging added)
- `src/features/team/components/rename-member-dialog.tsx` (new)
- `src/features/team/components/team-workspace.tsx` (Rename action, link-status badges)
- `src/components/restaurant-operations-app.tsx` (rename wiring)
- `tests/e2e/team-management.spec.ts` (new)
- `docs/features/024-team-management-enhancements.md` (checkboxes)
- `docs/STATUS.md` (milestone update)

## Current State & Next Step

Branch created, this file committed. Next: Step 2 (migration + pgTAP
test).
