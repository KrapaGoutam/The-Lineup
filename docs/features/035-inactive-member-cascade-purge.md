# Feature 035 — Inactive Member Permanent Purge (Anonymization, Not Hard Delete)

**Name:** Inactive Member Permanent Purge
**Owner:** Krapa Goutam
**Status:** shipped
**Issue/PR:** (branch `feature/034-035-team-status-and-purge`, opened off `main`)

## Classification & Session Scope

- **Category:** IRREVERSIBLE DATA-ERASURE FEATURE (schema + RPC + UI)
- **Modifies vs Adds:**
  - Adds `memberships.purged_at timestamptz` / `purged_by uuid` --
    marks a membership as permanently, irreversibly purged, distinct
    from merely `active = false`.
  - Adds `private.can_purge_member(uuid)` and
    `public.purge_inactive_member(uuid, uuid, text)` -- the
    authorization check and the atomic SECURITY DEFINER RPC that
    performs the actual anonymization + audit write.
  - Adds `src/features/team/domain/designations.ts`'s
    `canPurgeMember` -- the client-side mirror of the RPC's own
    authorization predicate.
  - Adds `src/app/api/team/purge/route.ts`, `src/features/team/components/purge-member-dialog.tsx`.
  - Modifies `TeamWorkspace` to render "Permanently delete" on the
    Inactive tab only, for a target `canPurgeMember` approves.
- **Contradiction Flags & Hard Boundaries:**
  - Tenant isolation: the RPC re-validates the caller's claimed
    `organization_id` against the target's actual (inactive, unpurged)
    membership row explicitly -- not merely inherited from
    `can_purge_member`'s own org-derivation.
  - Role-based authorization: same owner/general_manager hierarchy as
    every other personnel action (`canDeactivateMember`), reused, not
    re-derived, plus purge's own extra condition (target must be
    inactive, not already purged).
  - Atomicity: the entire write (profile scrub + registration scrub +
    membership purge marker + audit event) happens inside one
    PostgreSQL function body -- genuinely atomic, not the
    best-effort/non-atomic three-write pattern deactivate/reactivate
    use.
- **Session Scope:** a full audit + a deliberate architecture decision
  (see "Decisions and risks") preceded any schema work, given the
  request's literal spec conflicted with this codebase's real data
  model and a considered decision Feature 017 already made.

## User outcome

From the Inactive tab only, a manager/owner (within the existing
designation hierarchy) can permanently erase a deactivated member's
personal information -- their name and the contact details they
originally registered with -- everywhere those appear, after typing
their exact name to confirm. This is irreversible. Their historical
shifts, tip participation, and payroll records are **not** deleted;
they remain on file, now showing "Deleted User" instead of the
person's real name.

## Why "purge" means anonymize, not hard-delete (read before extending this)

The original request asked for a literal cascading `DELETE` --
"Deletes dependent rows in correct foreign-key order... shift
assignments, attendance punches, payroll ledger entries, table
assignments, manual overrides, and finally the member record." A full
audit of the real schema, done before writing any migration, found
this doesn't match how this application's data actually lives:

- Every FK from real operational history to `memberships`
  (`shift_assignments`, `availability_rules`, `time_off_requests`,
  `rotation_members`, `section_assignments`, `seatings`,
  `tip_interval_participants`, `tip_allocations`, `audit_events`'
  actor, several payroll `*_by` columns) is `NO ACTION`/RESTRICT, not
  `CASCADE` -- deliberately, per Feature 017's own build notes,
  specifically so deactivation would never orphan that history. A
  literal `delete from memberships` fails immediately with a foreign
  key violation for any member with real activity.
- Attendance and payroll aren't even in this database. They live in a
  separate **Neon** database entirely, keyed by an integer
  `neon_user_id`, bridged to a Supabase profile only via
  `attendance_identity_links` (which itself only cascades the _link_,
  not the actual Neon-side history). There is no
  `attendance_punches`/`payroll_ledger_entries` table in this schema
  to cascade-delete at all.
- `audit_events` is append-only by design (no UPDATE/DELETE grants) --
  deleting a purged member's own audit trail entries, or their prior
  actions as an actor, would break the accountability record this app
  deliberately maintains everywhere else (its own "Overrides Require
  Auditing" invariant).

Given this, this feature was explicitly re-scoped with the user before
any schema was written (see the conversation's own decision point):
**"purge" is a GDPR-style right-to-erasure anonymization**, not a hard
delete. `profiles.display_name`/`avatar_url` and the original
`registrations` record are scrubbed to `'Deleted User'`/`null`; every
row that references the person by id stays fully intact for
referential and financial integrity. `memberships.purged_at`/
`purged_by` mark the action as done, permanently, distinct from plain
deactivation.

## Scope

### In

- `memberships.purged_at timestamptz`, `memberships.purged_by uuid
references profiles(id) on delete set null`.
- `private.can_purge_member(target_profile_id uuid)`: mirrors
  `private.can_manage_member`'s exact owner/general_manager hierarchy
  and "derive the org from the target's own membership row" approach,
  with the one condition flipped -- requires `not target.active` (the
  opposite of every other personnel action) and `target.purged_at is
null`.
- `public.purge_inactive_member(p_organization_id, p_target_profile_id,
p_reason default null)`: SECURITY DEFINER, single-transaction. Self-
  target refusal; `can_purge_member` check; an explicit re-check that
  the target is inactive/unpurged **in the caller's claimed org**
  specifically (defense in depth against a mismatched org id);
  a guard refusing to purge a profile that holds membership rows in
  more than one organization (display_name/avatar_url are single
  global columns, not one per membership -- scrubbing them here would
  also blank the person's identity in any other org they belong to,
  which this org's manager has no authority over); the actual
  anonymizing writes; a `member_purged` `audit_events` row.
- `src/features/team/domain/designations.ts`'s `canPurgeMember`: the
  client-side mirror, used by both the route (for a friendly pre-check
  error) and `TeamWorkspace` (to decide whether to render the button
  at all). The database function's own check remains authoritative.
- `src/app/api/team/purge/route.ts`: validates the request, re-checks
  the target's state via the admin client, enforces the typed-name
  confirmation server-side (not just client-side, which would be
  trivially bypassable from devtools), then calls the RPC via the
  regular per-request client (not admin) so `auth.uid()` resolves
  correctly for the function's internal checks and the audit actor.
- `src/features/team/components/purge-member-dialog.tsx`: danger-
  themed confirmation dialog, submit disabled until the typed name
  exactly matches, copy that accurately describes the real
  (anonymize-not-delete) behavior.
- `TeamWorkspace`: "Permanently delete" button, Inactive tab only, a
  `danger`-toned "Purged" badge once done.

### Out

- No hard `DELETE` of the `memberships` row, ever.
- No change reaching Neon (attendance/payroll) at all -- architecturally
  out of reach for a Supabase-side migration/RPC, and those are
  financial/attendance records with their own retention concerns
  regardless.
- No change to `audit_events` rows the purged person generated as an
  _actor_ in the past (e.g. an old designation change they made while
  still a manager) -- those stay exactly as they are; only the target
  side of this feature's own new `member_purged` event names them.

## Acceptance Criteria

- [x] Given an ACTIVE member, purge is refused -- deactivation is
      required first.
- [x] Given an authorized actor and an inactive, unpurged target in
      their own org, purge succeeds: `profiles.display_name` becomes
      "Deleted User", `avatar_url` is cleared, the matching
      `registrations` row (if any) is scrubbed the same way,
      `memberships.purged_at`/`purged_by` are set, and a
      `member_purged` audit event is recorded with before/after state
      and the actor.
  - [x] Given the SAME target purged a second time, the RPC refuses --
        idempotent-safe against a double-click or retry.
- [x] Given a target's profile with a membership in more than one
      organization, purge is refused entirely.
- [x] Given a mismatched organization id (an org the actor doesn't
      share with the target's actual inactive membership), purge is
      refused, even though the actor is otherwise authorized elsewhere.
- [x] Given the role hierarchy, a manager cannot purge a fellow
      manager or an owner, and a non-manager has zero purge capability
      -- exactly `canDeactivateMember`'s existing bar.
- [x] Given self-targeting, purge is refused unconditionally.
- [x] Given the UI, "Permanently delete" appears on the Inactive tab
      only, requires typing the member's exact name to enable the
      submit button, and the dialog's copy accurately describes
      anonymization (not deletion of shift/tip/payroll history).
- [x] Given the full quality gate, `npm run check` (0 errors/warnings),
      `npx vitest run` (330/330), `npm run db:test` (226/226, 18
      files), `npm run build`, and the full Playwright suite (156/156
      across 3 viewports) all pass.

## UX Contract

- **Entry point:** Team page → Inactive tab → "Permanently delete
  <name>" (destructive-styled outline button, only next to a target
  the actor is authorized to purge).
- **Confirmation:** a danger-themed dialog (`AlertTriangle` icon,
  destructive border/text) with accurate copy about what actually
  happens; a text input that must exactly match the member's current
  name before the submit button enables; an optional reason field.
- **Success:** "Their personal information has been permanently
  erased."; the row updates in place to show "Deleted User" and a
  `danger`-toned "Purged" badge; the "Permanently delete" action
  disappears (already done). "Reactivate" remains available if the
  org later wants to restore membership access under a since-updated
  name.
- **Failure:** a specific, friendly error (wrong typed name; target
  became active/already purged since the row was rendered; not
  authorized) inline in the dialog, nothing changed.

## Data & Authorization

- Tenant isolation: enforced twice -- once by `can_purge_member`
  deriving the org from the target's own row, and again by an
  explicit `organization_id` + `profile_id` + `not active` + `purged_at
is null` existence check inside the RPC pinned to the caller's
  claimed org.
- Role-based authorization: reuses `canDeactivateMember`'s exact
  hierarchy (owner unrestricted; general_manager blocked from
  owner/general_manager targets; shift_manager/host/server have zero
  capability), both client-side (`canPurgeMember`) and database-side
  (`can_purge_member`), plus the target-must-be-inactive/unpurged
  condition neither of those needed.
- Atomicity: the entire operation is one PL/pgSQL function body --
  genuinely one transaction, unlike deactivate/reactivate's documented
  best-effort three writes.

## Implementation Map

- `supabase/migrations/20260909220000_member_status_and_purge.sql`
  (shared with Feature 034): `purged_at`/`purged_by` columns,
  `private.can_purge_member`, `public.purge_inactive_member`.
- `supabase/tests/database/0018_member_status_and_purge.test.sql`:
  14 of its 15 assertions cover this feature's authorization matrix,
  the successful purge's actual writes, and the audit event.
- `src/features/team/domain/designations.ts`: `canPurgeMember`.
- `src/features/team/domain/designations.test.ts`: 5 new tests.
- `src/app/api/team/purge/route.ts` (new).
- `src/features/team/components/purge-member-dialog.tsx` (new).
- `src/features/team/components/team-workspace.tsx`: the purge button,
  the "Purged" badge, `PurgeMemberDialog` wiring.
- `src/components/restaurant-operations-app.tsx`: `purgeTeamMember`
  (demo-mode simulation + real-mode fetch), wired as `onPurge`.
- `src/lib/demo-data.ts`: `TeamMember.purgedAt`.
- `src/features/team/data/roster.ts`: selects and maps `purged_at`.
- `src/types/database.generated.ts`: regenerated against the local
  schema (`supabase gen types typescript --local`) -- the `--linked`
  script target points at the hosted project, which doesn't have this
  migration applied yet; the local generation is the accurate
  equivalent until a real deploy applies it there.

## Test Plan & Quality Gates

- **DB tests (pgTAP):** `0018_member_status_and_purge.test.sql`, 15
  assertions -- active-target refusal, self-purge refusal, multi-org
  refusal, manager-vs-manager refusal, cross-org mismatch refusal, the
  successful purge's every write (profile, registration, membership
  marker, audit event), and double-purge refusal.
- **Unit tests:** `designations.test.ts`'s 5 new `canPurgeMember`
  cases (active target refused, purged target refused, inactive
  target allowed, role hierarchy mirrors `canDeactivateMember`,
  self-target refused).
- **E2E tests:** `team-management.spec.ts`'s new test drives the full
  UI flow in demo mode -- deactivate, switch to Inactive, wrong-name
  confirmation blocks submit, correct name succeeds, "Deleted
  User"/"Purged" badge appear, the action disappears afterward.
- **Verification Gate:**
  - `npm run check` clean.
  - `npx vitest run` 44/44 files, 330/330 tests.
  - `npm run db:test` 18/18 files, 226/226 assertions.
  - `npm run build` clean.
  - `npx playwright test` full suite, 156/156 across 3 viewports.

## Decisions and risks

- **Decision (the big one):** re-scoped "permanent purge" from a
  literal cascading hard delete to an anonymization, after a full
  schema audit found the literal spec both architecturally impossible
  for any member with real activity (FK RESTRICT everywhere) and in
  direct conflict with Feature 017's own considered decision to avoid
  exactly this kind of orphaning. Surfaced explicitly as a decision
  point rather than silently picking one interpretation or the other --
  this is real financial/audit data, not a place to guess.
- **Decision:** the multi-membership guard refuses purge outright
  rather than attempting any partial anonymization, because
  `profiles.display_name`/`avatar_url` are single global columns in
  the current data model, not one per membership -- there is no
  per-org name to scrub instead. A future feature that wants
  per-membership display names would need a real schema change first;
  this feature deliberately doesn't attempt to work around that gap.
- **Decision:** the RPC, not this session's own judgment about "safe
  enough," is the enforcement layer -- the route's own checks exist
  only to produce a friendlier error before hitting the database, and
  are explicitly documented as non-authoritative duplicates of the
  RPC's real checks.
- **Risk/mitigation:** purged rows keep their `neon_user_id`-linked
  attendance/payroll history fully intact, now permanently
  unattributable to a real name from the Team page's perspective
  (shows "Deleted User"). This is the intended behavior, not a gap --
  but worth naming plainly: a manager cannot use this feature to
  recover a purged person's real name later from anywhere in this
  application. That irreversibility is exactly what the typed-name
  confirmation exists to make deliberate, not accidental.
