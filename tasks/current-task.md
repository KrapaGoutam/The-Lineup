# Current Task: Features 034/035 — Team Status Categorization & Inactive Member Permanent Purge

**Active Spec:** `docs/features/034-team-status-filtering.md` & `docs/features/035-inactive-member-cascade-purge.md`
**Branch:** `feature/034-035-team-status-and-purge` (branched from `main`, after Feature 032 / PR #31 merged)
**Status:** Complete — PR open: https://github.com/KrapaGoutam/The-Lineup/pull/32
**Assigned Agent:** Claude Code (audit, implementation, verification gate, and PR)

## 🎯 Objective

Feature 034: default the Team page to showing only active members,
with explicit Active/Inactive tabs and an intuitive path to reactivate
anyone inactive. Feature 035: an explicit, guarded "Permanently
Delete" action in the Inactive tab, requiring typed-name confirmation,
that irreversibly erases the person's PII.

## 📖 Key Findings & Architecture

1. **Audited before writing any code, not after.** A full read-only
   audit of the existing schema/actions/UI (not code-search alone --
   confirmed live against a local database) found Feature 034's own
   spec was ~90% already shipped by Feature 017 (Member Deactivation)
   and Feature 024 (Team Management Enhancements):
   `memberships.active` has existed since the very first migration;
   deactivate/reactivate is fully built and symmetric; every
   scheduling/allocation/tips picker already receives a pre-filtered
   `activeTeam`. The only real gap was the Team page's own UI --
   one flat list with an inline badge, no tabs.
2. **The literal "cascading delete" spec for Feature 035 didn't match
   the real data model, and conflicted with a considered decision
   Feature 017 already made.** Every FK from real operational history
   to `memberships` (shifts, availability, time-off, rotation history,
   tip allocations, audit-event actor) is `NO ACTION`, not `CASCADE` --
   deliberately, specifically so deactivation would never orphan that
   history. Attendance/payroll live in a wholly separate Neon
   database, keyed by `neon_user_id`, not reachable by any Supabase
   migration/RPC. A literal hard delete would fail immediately for any
   member with real activity, or would require reversing Feature 017's
   own decision and deleting real financial/audit records. This was
   surfaced explicitly to the user as a decision point (not guessed at
   silently) before any migration was written; the user chose
   anonymization (a GDPR-style "right to erasure") over a hard delete.
3. **A real, pre-existing bug was found live-testing Feature 034's own
   premise.** `private.can_view_profile` required BOTH the viewer's
   AND the target's membership to be `active` before anyone could read
   that profile's `display_name` -- confirmed directly against a local
   database that a deactivated member's name comes back `null` to
   everyone but themself via the exact join
   `getOrganizationRoster()` already runs. This would have made
   Feature 034's own Inactive tab show "Unknown" for every row. Fixed
   in the same migration (dropped the `target.active` half of the
   predicate; `viewer.active` stays).
4. **Manual retyping was avoided wherever byte-exact transfer mattered
   more than convenience** -- not applicable to this feature directly,
   but the same discipline carried over: the purge RPC's authorization
   helper (`private.can_purge_member`) was modeled directly on the
   existing, already-correct `private.can_manage_member`
   (Feature 024's own rename-authorization function) rather than
   re-derived from scratch, to avoid quietly diverging from an
   already-proven role hierarchy.
5. **Local pgTAP testing, not just reading the SQL.** Ran
   `npx supabase db reset` + `npm run db:test` against a real local
   Postgres instance repeatedly while building the migration --
   caught the `can_view_profile` bug this way (a manual `docker exec
psql` repro), not by inspection alone.

## 🔒 Non-negotiable Constraints

- Tenant isolation: every query/write stays scoped by
  `organization_id` -- the purge RPC re-validates the caller's claimed
  org against the target's actual row explicitly, not just inherited
  from the authorization helper.
- Role-based authorization: only owner/general_manager-tier actors (per
  the existing `canDeactivateMember`/`can_manage_member` hierarchy) may
  deactivate, reactivate, or purge -- unchanged, reused, not re-derived.
- Active team view stays clean by default: unchanged (was already
  true before this feature) -- no scheduling/allocation/tips picker
  was ever touched.
- Irreversible purge requires typed-name confirmation, enforced both
  client-side (disables the submit button) and server-side (the route
  re-checks it against the real name -- a client-only check would be
  trivially bypassable from devtools).
- Atomic execution: the entire purge (profile scrub + registration
  scrub + membership marker + audit event) is one PL/pgSQL function
  body -- genuinely atomic, unlike deactivate/reactivate's documented
  best-effort three writes.
- Quality gates (`npm run check`, `npm test`, `npm run db:test`, `npm
run build`) pass before every commit.

## 🛠️ Implementation Steps

- [x] **Step 1: Audit** -- read-only research (dispatched to a
      sub-agent for thoroughness) covering schema, existing
      deactivation logic, existing Team UI, every scheduling/
      allocation/tips picker, existing RLS/FK behavior, the existing
      audit-log convention, and the `db:types` workflow. Findings
      directly determined the plan below.
- [x] **Step 2: Clarify purge semantics with the user** -- presented
      the FK/Neon-architecture conflict plainly via a clarifying
      question before writing any migration; user chose anonymization
      over a real hard delete.
- [x] **Step 3: Migration**
      (`supabase/migrations/20260909220000_member_status_and_purge.sql`):
      `memberships_org_active_idx`; the `can_view_profile` fix;
      `memberships.purged_at`/`purged_by`; `private.can_purge_member`;
      `public.purge_inactive_member` (SECURITY DEFINER RPC).
- [x] **Step 4: DB tests**
      (`supabase/tests/database/0018_member_status_and_purge.test.sql`,
      15 assertions) -- run against a real local Postgres via
      `npx supabase db reset` + `npm run db:test`, not just written and
      assumed correct. Caught and required a real fix
      (`can_view_profile`) before passing.
- [x] **Step 5: Generated types** -- `npm run db:types` targets
      `--linked` (the hosted project, which doesn't have this
      migration applied yet); used
      `supabase gen types typescript --local` instead as the accurate
      equivalent, and regenerated `src/types/database.generated.ts`
      from the real local schema.
- [x] **Step 6: TS domain layer** -- `canPurgeMember` in
      `designations.ts` (mirrors `canDeactivateMember`'s hierarchy plus
      the inactive/unpurged condition); 5 new unit tests.
- [x] **Step 7: Route handler** -- `src/app/api/team/purge/route.ts`:
      validates the request, re-checks state via the admin client,
      enforces the typed-name confirmation server-side, then calls the
      RPC via the regular per-request client (not admin, so
      `auth.uid()` resolves for the function's own checks and the
      audit actor).
- [x] **Step 8: UI** - [x] `TeamMember.purgedAt` (`lib/demo-data.ts`); `roster.ts`
      selects/maps `purged_at`. - [x] `TeamWorkspace`: Active/Inactive tab bar with live counts,
      default Active, empty-state messages; "Permanently delete"
      button (Inactive tab only, `canPurgeMember`-gated); danger-
      toned "Purged" badge. - [x] `PurgeMemberDialog` (new component): typed-name
      confirmation, accurate (anonymize-not-delete) copy,
      danger styling. - [x] `restaurant-operations-app.tsx`: `purgeTeamMember` (demo +
      real mode), wired as `onPurge`.
- [x] **Step 9: Quality gate** - [x] `npm run check` clean. - [x] `npx vitest run` 44/44 files, 330/330 tests. - [x] `npm run db:test` 18/18 files, 226/226 assertions (local
      Supabase, via Docker). - [x] `npm run build` clean.
- [x] **Step 10: E2E** -- extended
      `tests/e2e/team-management.spec.ts` with a full tab-switch +
      deactivate + purge flow (wrong-name blocks submit, correct name
      succeeds, "Deleted User"/"Purged" badge, action disappears
      afterward); confirmed no regression in the file's existing tests;
      re-ran the FULL Playwright suite (156/156 across 3 viewports, up
      from 153).
- [x] **Step 11: Documentation** - [x] New `docs/features/034-team-status-filtering.md`. - [x] New `docs/features/035-inactive-member-cascade-purge.md`
      (includes the full "why anonymize, not hard-delete"
      architecture record). - [x] Updated `docs/STATUS.md`. - [x] This task file.
- [x] **Step 12: Commit + push + PR** - [x] Commit with clear, atomic
      commit messages (`31c6756` code+tests, `41d6f87` docs). - [x]
      Push `feature/034-035-team-status-and-purge`. - [x] Open
      [PR #32](https://github.com/KrapaGoutam/The-Lineup/pull/32)
      against `main`.

## 🗂️ File List

- `supabase/migrations/20260909220000_member_status_and_purge.sql` (new)
- `supabase/tests/database/0018_member_status_and_purge.test.sql` (new)
- `src/types/database.generated.ts`
- `src/features/team/domain/designations.ts`
- `src/features/team/domain/designations.test.ts`
- `src/app/api/team/purge/route.ts` (new)
- `src/features/team/components/purge-member-dialog.tsx` (new)
- `src/features/team/components/team-workspace.tsx`
- `src/features/team/data/roster.ts`
- `src/lib/demo-data.ts`
- `src/components/restaurant-operations-app.tsx`
- `tests/e2e/team-management.spec.ts`
- `docs/features/034-team-status-filtering.md` (new)
- `docs/features/035-inactive-member-cascade-purge.md` (new)
- `docs/STATUS.md`
- `tasks/current-task.md`

## Current State & Next Step

Features 034/035 are fully complete: implemented, unit-tested,
db-tested, e2e-tested, documented, committed (`31c6756` code+tests,
`41d6f87` docs), pushed, and opened as
[PR #32](https://github.com/KrapaGoutam/The-Lineup/pull/32) against
`main`. Nothing further pending on this branch.
