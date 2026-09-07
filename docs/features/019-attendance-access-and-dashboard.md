# Feature 019 — Attendance access restriction and dashboard

**Name:** Attendance access restriction and dashboard
**Owner:** Krapa Goutam
**Status:** implemented — full validation complete, opening PR for review
**Issue/PR:**

## Numbering note

Next free number after `018-neon-attendance-report.md` — no collisions with any existing `docs/features/*.md`.

## Read before assuming this is greenfield

- Feature 018 gates the whole Attendance tab on `isManager` (`role !== "server"`) — a plain server currently sees nothing at all. This feature changes that: everyone gets the tab, but what they see inside it differs by role.
- `AppRole` is exactly three values (`"owner" | "manager" | "server"`, `src/features/auth/domain/passcode.ts`) — owner, manager, _and_ assistant manager already collapse to the single role `"manager"` via `designationToRole`. This means the existing `currentUser.role !== "server"` check already is precisely "owner, manager, or assistant manager" — no new role-comparison logic is needed, only a different _consequence_ when it's false.
- **The real gap this feature has to fill**: there is no existing link, anywhere in this schema, between a Supabase `profiles` row and a Neon `users.id`. They're two separate identity systems with nothing in common — no shared email, no shared id format (Supabase uses `uuid`, Neon uses a plain integer), and Feature 018's own spec deliberately never attempted name-matching (Neon names collide — the two "Anil"s, the "Bhoomi"/"Bloomi"/"BHOOMII" spellings — matching by name would be actively wrong, not just fragile). This feature has to create that link from scratch.
- `attendance-data.ts`'s Neon queries are already parameterized by an explicit `userIds: number[]` array (`ANY($1)`) — scoping a query to "just this one person" is already mechanically trivial; the actual work is entirely in _deciding which id(s) are allowed_ before that array is ever built, server-side.

## User outcome

Everyone signed in gets an Attendance tab. An owner, manager, or assistant manager sees exactly what they see today — every active Neon user, the "All" option, every report. Anyone else sees only their own attendance record, with no way to see or even discover another person's name, hours, or existence in the attendance system. Above the report, a small dashboard shows day/week/month totals — everyone's, for a privileged viewer; just their own, for anyone else.

## Scope

- **In**: a new Supabase table linking a `profiles` row to a Neon `users.id`, manager-settable from the Team tab; the Attendance tab shown to every signed-in role, with content scoped by that link; a dashboard (day/week/month totals + the currently-selected period's total) pinned above the existing report, scoped the same way; an explicit, distinct empty state for "signed in, not privileged, no link set" (never falls back to showing everyone).
- **Out**: any change to _who_ can create/edit/remove a link (owner/manager/assistant manager only, same tier as everything else personnel-related) beyond that single capability. Linking automation (no attempt to auto-match by name, phone, or any heuristic — every link is a deliberate, auditable manager action). Any change to Feature 018's actual report layout, disambiguation, or edge-case rendering — this feature only changes _who_ can reach what, and adds the dashboard on top.

## How a signed-in person maps to a Neon `user_id`

**A new Supabase table, `attendance_identity_links`, is the only mechanism — never inferred, never automatic.**

```sql
create table public.attendance_identity_links (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  linked_by uuid not null references public.profiles (id),
  linked_at timestamptz not null default now(),
  unique (organization_id, profile_id),   -- one person, one Neon identity
  unique (organization_id, neon_user_id)  -- one Neon identity, one person -- prevents two Lineup accounts both claiming to be "Anil"
);
```

Both `unique` constraints matter, not just the first: without the second, two different signed-in people could each be linked to the _same_ `neon_user_id`, and one of them would see the other's hours and (once Feature 020 exists) the other's pay. The database enforces this, not application code that could have a bug or a race.

**Where a manager sets a link**: a new "Link attendance record" action per row in the Team tab, next to Reset/Deactivate — owner/manager/assistant-manager only. This intentionally uses the attendance manager tier rather than `canChangeDesignation`: assistant managers may manage attendance links even though Feature 014 deliberately prevents them from changing designations. The dialog shows the _same disambiguated Neon user list_ Feature 018 already builds (`buildDisplayLabels`) so a manager picks "Anil (Manager)" or "Anil (Host)" deliberately, by the same names they already recognize from the report — never a raw numeric id. A person who already has a link shows their current one and can be re-linked or unlinked.

**Resolving access, server-side, in every attendance-touching Server Action** (extends `requireManager` in `attendance-actions.ts` into a function that returns one of three outcomes instead of a plain refusal):

```ts
type AttendanceAccess =
  | { scope: "all" } // owner/manager/assistant manager
  | { scope: "self"; neonUserId: number } // a regular user with a link
  | { scope: "unlinked" }; // signed in, not privileged, no link row

async function resolveAttendanceAccess(
  restaurantSlug: string,
): Promise<AttendanceAccess | null> {
  const currentUser = await getCurrentUser(restaurantSlug);
  if (!currentUser) return null; // not signed in at all
  if (currentUser.role !== "server") return { scope: "all" };

  const link = await getOwnAttendanceLink(
    currentUser.organizationId,
    currentUser.profileId,
  );
  return link
    ? { scope: "self", neonUserId: link.neonUserId }
    : { scope: "unlinked" };
}
```

**Every Server Action forces the scope itself — it never trusts a client-supplied `userIds` array for a non-privileged caller.** Today's `getAttendanceReportAction` accepts `userIds: number[]` straight from the client; after this feature, that parameter is only _honored_ when `resolveAttendanceAccess` returns `{ scope: "all" }`. For `{ scope: "self", neonUserId }`, the action silently substitutes `[neonUserId]` regardless of what the client sent — a tampered request asking for someone else's id gets that person's own data back, not an error that would confirm the id was valid. For `{ scope: "unlinked" }`, the action returns an empty result with a distinct reason code, never an error and never falling through to `{ scope: "all" }`'s behavior. This is the literal answer to "what happens when there's no match": **they see nothing, because the action never even builds a Neon query for them** — there's no `userIds` array to run at all, not an empty one that happens to match nobody.

The same `resolveAttendanceAccess` result also decides what the _person picker_ itself shows: `{ scope: "all" }` gets today's full multi-select; `{ scope: "self", ... }` and `{ scope: "unlinked" }` get no picker at all — there's nothing to pick, since there is exactly one possible selection (themselves) or none.

## Dashboard

Pinned above the existing report body, four tiles:

| Tile                  | Scope for a privileged viewer                                                                                                | Scope for a non-privileged viewer                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Day total             | Sum of hours for every active Neon user, today                                                                               | Their own hours today                              |
| Week total            | Sum of hours for every active Neon user, this week (Monday–Sunday, matching `getWeekDates`'s existing week-start convention) | Their own hours this week                          |
| Month total           | Sum of hours for every active Neon user, this calendar month                                                                 | Their own hours this month                         |
| Selected-period total | The exact number already shown as the report's grand total for whatever's currently selected                                 | Their own total for whatever period they've picked |

The first three are independent of the person/period picker — they always mean "today," "this week," "this month," regardless of what's selected below. They're fetched via one new Server Action (`getAttendanceDashboardTotalsAction`), scoped by the exact same `resolveAttendanceAccess` result as the report body, called once on mount (day/week/month don't change from filter interaction, only from the clock moving forward, so there's no reason to refetch them when the person/period picker changes). The fourth tile needs no separate query at all — it's `aggregateHours()` (already exported from Feature 018's domain module) applied to whatever rows are already loaded for the report below, just also surfaced at the top for visibility.

## Acceptance criteria

- [ ] Given an owner, manager, or assistant manager, when they open Attendance, then they see exactly what Feature 018 already built — full person picker, "All," every report — plus the four dashboard tiles scoped to everyone.
- [ ] Given a server with a link set, when they open Attendance, then they see no person picker, one report (their own), and dashboard tiles scoped to only their own hours.
- [ ] Given a server with no link, when they open Attendance, then they see a distinct "your account isn't linked to the attendance system yet" state — not an error, not the full report, not another person's data — and dashboard tiles all reading zero/empty with the same explanation.
- [ ] Given a non-privileged caller, when a tampered request asks the underlying Server Action for another person's `neon_user_id`, then the action still returns only the caller's own linked data, silently ignoring the requested id.
- [ ] Given two different signed-in people, then the database itself refuses linking both of them to the same `neon_user_id` — proven by a constraint violation, not just absent from the UI.
- [ ] Given a manager on the Team tab, when they link, re-link, or unlink a person's attendance identity, then the disambiguated Neon name list (identical to Feature 018's) is what they choose from, never a raw id, and the change is audited.

## UX contract

- **Entry point**: Attendance now appears in the tab set for every signed-in role (desktop nav, mobile bottom nav) — the manager-only gate on the _tab itself_ is removed; the gate moves entirely to _what's inside it_.
- **Desktop / host tablet / server mobile**: for a privileged viewer, unchanged from Feature 018. For a non-privileged viewer, no person-picker UI at all (nothing to pick), dashboard tiles + a single report section headed with their own name, same table/edge-case rendering Feature 018 already built.
- **Loading / Error**: unchanged from Feature 018's existing states, now also covering the dashboard's own fetch.
- **Empty (unlinked)**: a distinct, calm explanation ("Ask a manager to link your account" or similar) — never styled as an error, since it's an expected, resolvable state, not a failure.
- **Permission denied**: n/a in the old sense — there's no longer a "you can't see this tab" state; there's only "you can see your own."
- **Team tab addition**: the new "Link attendance record" action follows the exact same hidden-not-disabled, reason-optional-unless-stated-otherwise pattern every other Team action already uses.

## Data and authorization

- **Tables/columns**: new `attendance_identity_links` (above). No changes to any existing table.
- **Constraints/indexes**: the two `unique` constraints above are the real enforcement, not a UI convenience.
- **Grants/RLS**: `attendance_identity_links` gets real RLS, unlike `passcode_credentials` — this table is read by the signed-in user themselves (to resolve their own scope), not only by the service role.

  ```sql
  alter table public.attendance_identity_links enable row level security;

  create policy "attendance_identity_links_select" on public.attendance_identity_links
    for select to authenticated
    using (
      (profile_id = (select auth.uid()) and (select private.has_org_role(
        organization_id,
        array['owner','general_manager','shift_manager','host','server']::public.app_role[]
      )))
      or (select private.has_org_role(
        organization_id,
        array['owner','general_manager','shift_manager']::public.app_role[]
      ))
    );
  ```

  Insert, update, and delete have separate policies using the manager-tier predicate above; update includes both `using` and `with check`. A regular user can read _their own_ row (to know their own link, or its absence) but never anyone else's, and can never write one at all — only a privileged member can create, change, or remove any link, including their own. Tenant-composite foreign keys require both the target profile and the actor to be memberships of the row's organization.

- **Roles/capabilities**: linking capability matches Team's existing tier exactly (owner/manager/assistant manager); viewing capability is now universal, scoped per the table above.
- **Audit events**: one `audit_events` row per link/re-link/unlink — `action: "attendance_identity_linked" | "attendance_identity_unlinked"`, `entity_type: "attendance_identity_link"`, `entity_id`: the target profile id, `after_state`/`before_state` carrying the Neon user id (never a passcode-shaped secret, so no redaction concern the way passcode audit rows have).
- **Idempotency/concurrency**: re-linking overwrites the existing row (upsert on the `(organization_id, profile_id)` unique key); the `(organization_id, neon_user_id)` unique key is the concurrency guard against two simultaneous links claiming the same Neon identity — the database decides, same pattern as passcode locator collisions.
- **Time-zone behavior**: "day/week/month" resolve against the restaurant's own time zone, identical to Feature 018's "This month"/"Previous month," via the same `zonedWallTimeFromInstant`-derived "today."

## Implementation map

- **Feature modules**: `attendance_identity_links` CRUD lives in `src/features/attendance/data/identity-links.ts` (Supabase-side, RLS-respecting client — unlike the Neon-facing files, this table is real Supabase schema and uses this app's normal real-mode pattern, not the admin-client-plus-app-check pattern Neon reads need). `resolveAttendanceAccess` lives in `attendance-actions.ts` alongside the actions it gates. The Team tab's new dialog lives in `src/features/team/components/` next to the existing reset/deactivate dialogs.
- **Routes**: none new — the link CRUD goes through Server Actions (RLS already does the enforcement, matching `updateTeamDesignationAction`'s existing pattern, not the Route-Handler-plus-admin-client pattern Feature 016/017 needed for Supabase Auth Admin API calls this doesn't touch).
- **Migrations**: the additive table migration plus a forward-only hardening migration. The latter replaces plain profile foreign keys with tenant-composite membership foreign keys, adds policy/FK indexes, narrows the sequence grant, and separates the three write policies.
- **Generated types**: `npm run db:types` picks up the new table automatically.

## Test plan

- **Unit**: `resolveAttendanceAccess`'s three-way branching (mocked `getCurrentUser`/link lookup); the Server Action's "ignore client-supplied userIds when scope is self" behavior specifically (a test that passes a _different_ id than the resolved link and asserts the query still only ever requests the linked one).
- **Database/RLS**: pgTAP for both `attendance_identity_links` policies (privileged can read/write any row; a regular user can read only their own and can write none; the two unique constraints actually reject a duplicate).
- **Playwright**: a linked server sees only their own report and dashboard; an unlinked server sees the distinct unlinked state; a manager links someone via the Team tab picking from the disambiguated name list, then that person's next sign-in shows their own scoped view; a privileged viewer's experience is unchanged from Feature 018's own Playwright coverage.
- **Manual/live verification**: exercise the full link → sign in as that person → confirm scoped Neon data flow against the real hosted Supabase project and the real Neon database, with throwaway accounts, matching this session's established practice.

## Rollout and rollback

- **Feature flag**: none.
- **Expand/migrate/contract**: one new table, additive — no existing data affected. Every existing manager/owner/assistant-manager account keeps identical behavior with zero links needing to exist for them.
- **Backfill**: none required — a restaurant adopts linking gradually, person by person, as a manager gets to it. An unlinked person simply sees the unlinked state until someone links them.
- **Rollback limit**: plain code revert; the new table can be left in place harmlessly (nothing else depends on it) or dropped in a follow-up migration.

## Decisions and risks

- **Decision**: the identity link is a deliberate, manager-set record — never inferred by name, phone, or any other heuristic. Names collide (Feature 018's whole disambiguation effort exists because of this); getting a link wrong would show someone else's hours (and, once Feature 020 ships, someone else's pay) to the wrong person, which is a materially worse failure mode than "not linked yet."
- **Decision**: a tampered client request for another person's data is answered with _the caller's own data_, not an error — an error would confirm "that id exists and you're just not allowed to see it," which is more information than a caller with no legitimate reason to probe other ids should get.
- **Risk**: this table has no `active`/soft-delete distinction — deactivating someone (Feature 017) doesn't touch their attendance link at all, since attendance/payroll history should stay attached to their identity regardless of current employment status. Named explicitly so a future feature doesn't assume deactivation implies unlinking.
- Open question: none — this spec is ready for approval as written.

## Build notes — what actually happened versus what was specced

Implementation crossed a Claude → Codex → Claude handoff mid-build (a session length limit, not a plan change) — a "switching to codex" safety commit marks the boundary. Everything below was verified after resuming, not assumed carried over.

- **A forward-only hardening migration** (`20260907143637_harden_attendance_identity_links.sql`) landed on top of the original additive one, because the initial table migration had already been applied to the hosted project by the time three real gaps were found, so fixing them meant a second migration rather than editing the first:
  - The original `profile_id`/`linked_by` foreign keys pointed at bare `profiles`, which only proves the id exists somewhere — not that it belongs to this organization. Replaced with **composite foreign keys** `(organization_id, profile_id)` → `memberships` and `(organization_id, linked_by)` → `memberships`, so a link can never target or be attributed to a person outside the tenant. Two supporting indexes were added, since Postgres doesn't create them automatically for foreign keys.
  - The original single `for all` manager policy was split into explicit `insert`/`update`/`delete` policies (each with its own `using`/`with check`), and the self-select policy now also requires the reader to still pass `has_org_role` for *some* role in the organization (owner through server) — a former member whose membership row was removed no longer matches their own historical link row. Verified behaviorally in `supabase/tests/database/0009_attendance_identity_links.test.sql`, including that an assistant manager (`shift_manager`) can manage links (the same manager tier as the RLS design always intended, distinct from `canChangeDesignation`'s narrower designation-change tier), that a regular member's insert/update/delete on their own row throws or no-ops under RLS, and that both unique constraints and the new tenant FK reject cross-tenant/duplicate rows with the exact Postgres error codes.
  - `select` was revoked from `authenticated` on the identity sequence — `nextval()` only needs `usage`, and there's no legitimate reason for a client to read the sequence's current value/state.
- **Audit-failure rollback**: `upsertAttendanceIdentityLink`/`removeAttendanceIdentityLink` now treat a failed `audit_events` insert as a failure of the whole operation, not a side detail — they compensate (restore the prior link, or remove the just-created one) and report failure, so this action can never claim success for a personnel change with no audit trail. Supabase's Data API has no client-side multi-statement transaction, so this is the same best-effort compensating-write pattern `setMemberActive` (Feature 017) already established, applied here for the first time to a table this feature owns; a rollback failure itself is logged as an operational incident rather than silently swallowed.
- **Input validation at every action boundary**: every exported Server Action in `attendance-actions.ts` now parses its input through a `zod` schema (`restaurantSlug`, `neonUserId`, `targetProfileId`, the period union, `todayLocalDate`) before doing anything else, returning a generic "that attendance request is invalid" rather than trusting shape/type from the client. This is additive hardening beyond the original spec text, not a scope change — the authorization boundary (`resolveAttendanceAccess`) is unchanged and still the actual enforcement.
- **Full validation, run after resuming**: `npm run check` (format/lint/typecheck) clean; `npm test` — 148 tests across 25 files, including the two new files `attendance-actions.test.ts` and `identity-links.test.ts`; `npx supabase test db` — 103 pgTAP assertions across 9 files, all passing, run against a local shadow database on the same schema as the hosted project; `npm run build` clean.
- **Migration applied and types regenerated against the real hosted Supabase project** (`supabase db push`, then `npm run db:types`), for both the original table migration and the hardening migration — `supabase migration list` confirms local and remote are in lockstep.
- **Playwright**: both new scenarios (`an unlinked server can open Attendance...`, `a manager can link attendance and the server then sees only that record`) pass cleanly on the `desktop` and `server-mobile` projects. One of the two originally had a strict-mode violation (`getByText("8.5h")` matched four elements — the dashboard tiles and the report both legitimately show the same figure from one demo attendance row) — fixed by scoping the assertion to the actual table cell (`getByRole("cell", { name: "8.5h" })`).
- **Known gap, confirmed pre-existing, not caused by this feature**: on the `host-tablet` (WebKit/iPad-viewport) Playwright project, nearly every scenario in `dashboard.spec.ts` times out at or immediately after sign-in — including both of this feature's new tests, and roughly twenty completely unrelated pre-existing tests (CSV import, allocation board, designation changes). Verified directly, not assumed: the identical failure (stuck on the login screen after clicking "Open workspace," no navigation) reproduces on an unmodified `origin/main` checkout in an isolated git worktree, under the exact same demo-mode Playwright configuration. This is a pre-existing WebKit/environment gap in this session's local setup, unrelated to any code this feature touched — named here explicitly rather than left for someone to rediscover, matching how Feature 017's `has_org_role` bypass is recorded. `desktop` and `server-mobile` (Chromium-based) are unaffected and fully green.
- **Separately pre-existing, also unrelated to this feature**: four more scenarios fail on `desktop`/`server-mobile` on unmodified `origin/main` too — visibility assertions for the "Manager access"/"Server access" header badge (styled `hidden xl:inline-flex`, so genuinely not visible below the `xl` breakpoint on `server-mobile`'s narrow viewport) and two tip-amount assertions in the schedule/tips flow. None of this feature's diff touches tips, registration, or the header badge.
- **Live verification against real Neon/Supabase data**: pgTAP exercises every RLS policy and constraint behaviorally against a real Postgres engine on the same schema as the hosted project (not mocked), and the hardening migration's application to the hosted project itself was confirmed via `supabase migration list` and a successful `db:types` schema introspection. An interactive sign-in walkthrough against the hosted project's real accounts (link a real person from the Team tab, sign in as them, confirm the scoped view) was intentionally left for direct confirmation rather than performed here, since it means writing a real link row against the restaurant's actual roster rather than a disposable pgTAP transaction — matching this session's practice of the user doing the final live sign-in pass themselves on data that isn't throwaway.
