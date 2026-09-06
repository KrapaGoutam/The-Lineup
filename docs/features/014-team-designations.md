# Feature 014 — Team designations

Status: shipped. **Update (Feature 015, Phase E)**: the Team tab's promotion control now writes to the real `memberships.roles` column in real mode, via `updateTeamDesignationAction` — this required no schema or RLS change, exactly as this document's "Data and authorization" section anticipated (`roles` was always the sole authorization source; only a read-side label was needed for display, and that already existed via `designationForRoles`). `changeDemoMemberDesignation` (Implementation map, below) was renamed `changeDesignation` and now branches on `demoMode`. Verified live: a manager promoted a real member to Assistant Manager and the write was confirmed directly in `memberships.roles`, not just in the UI.

**Implementation note**: same division-of-labor change as Features 005/012/013 — Claude implemented this directly, Codex was not in this loop.

**What shipped**: designation as a presentation label layered on top of the existing role model, not a rename or a new permission tier — see "The mapping decision" below for the full reasoning, which was reviewed and approved before any code was written. `TeamMember`/`SignedInUser` both gained a `designation` field; `AppRole` (and every `can()` capability check that already reads it) is unchanged and derived from designation via `designationToRole`. Promoting or demoting someone now also syncs their `demoAccounts` login-identity entry (a gap found during this feature's own Playwright coverage — without it, a promotion would silently not apply the next time that person signed in). Replaces Feature 005's `roles.ts` (`canChangeRole`/`otherAssignableRole`) with `designations.ts`, fixing one thing the old 3-role approximation got wrong along the way: it let a manager change another manager's role, which the real `memberships_update_manager` RLS policy has never allowed.

## User outcome

An owner or manager can set any team member's designation — Owner, Manager, Assistant Manager, or Staff — from the Team tab. Owner, Manager, and Assistant Manager all get identical, full operational access (schedule, allocation, tips) — the same access a manager has today. Staff gets today's regular employee access, unchanged.

## The mapping decision

Three options were on the table: rename the existing roles, add designation as a separate concept, or collapse the existing roles into fewer values. **Designation is a separate, additional concept — the existing roles are untouched.**

Why: the real schema already has exactly the granularity this needs, and it already grants the exact permissions this feature asks for.

- The real `app_role` enum (`supabase/migrations/20260905065702_initial_schema.sql`) is `owner`, `general_manager`, `shift_manager`, `host`, `server` — five values, unchanged by this feature.
- Nearly every operational RLS policy (schedule, allocation, tips) already grants `owner`, `general_manager`, **and `shift_manager`** identical access. `shift_manager` is already "full operational permissions, same as a manager" in the real schema, today, with zero policy changes needed.
- The **only** place `shift_manager` is excluded is the membership-write policies (`memberships_insert_manager` / `memberships_update_manager`), which check for `owner` or `general_manager` only.

So the mapping is: **`general_manager` → "Manager"**, **`shift_manager` → "Assistant Manager"**. Designation is a label over roles that already exist and already carry the right permissions. Renaming or collapsing the role enum instead would mean touching every RLS policy in the schema for zero behavioral gain.

The demo layer needed a genuine addition, not just relabeling: `AppRole` was deliberately simplified earlier this session (Feature 005) to three values (`owner`/`manager`/`server`), folding `general_manager` and `shift_manager` into one `manager` bucket. That collapse is partially undone here — `TeamMember`/`SignedInUser` gain a real `designation: Designation` field (four values), and `role: AppRole` is derived from it, never set independently:

```
owner              -> "owner"
manager            -> "manager"
assistant_manager  -> "manager"   (same AppRole as manager — same capabilities)
staff              -> "server"
```

Real mode needs no schema change beyond a read-side helper (`designationForRoles`) to derive the label from `roles` for display — `roles` stays the single source of truth for authorization either way.

## Who can change whose designation

Reuses the existing `memberships_update_manager` / `memberships_insert_manager` RLS semantics exactly — not a new rule invented for this feature.

| Actor                                   | Can set designation to                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**                               | Anyone, to anything — unrestricted, matching the real policy's owner branch (which has no target condition). This includes handing off ownership; that's existing, unchanged real-mode behavior, not something this feature adds.                         |
| **Manager** (`general_manager`)         | May toggle **Assistant Manager ⇄ Staff** on a target whose _current_ designation is not Owner or Manager (mirrors the `using` clause). May never write Owner or Manager into anyone's designation (mirrors the `with check` clause) — not even their own. |
| **Assistant Manager** (`shift_manager`) | **Nothing.** Despite full operational access, `shift_manager` was never in the membership-write policy's actor list. Personnel/HR capability is a separate grant from operational capability in the real schema, and this feature does not add one.       |
| **Staff**                               | Nothing (unchanged).                                                                                                                                                                                                                                      |

Direct answer to "can an assistant manager demote the owner?": no — an assistant manager cannot change _any_ designation, not even a fellow staff member's. That's a stronger guarantee than "just don't let them touch the owner," and it falls out of the existing schema rather than a new check that has to be independently maintained.

**Known, unchanged quirk, not introduced by this feature**: an owner can currently reassign the "owner" designation to someone else unilaterally (the real policy's owner branch has no restriction at all). Flagged, not fixed, per the approved plan.

## Scope

**In**

- `Designation` type (`owner` | `manager` | `assistant_manager` | `staff`) in `src/features/auth/domain/passcode.ts`, alongside `designationToRole` (designation → AppRole, the one place that mapping exists) and `designationForRoles` (real-mode `roles[]` → Designation, for display only).
- `src/features/team/domain/designations.ts`: `canChangeDesignation`, `assignableDesignations`, `designationLabel` — replaces `roles.ts` in full.
- Team tab (`team-workspace.tsx`): shows each member's designation label; renders one button per designation the signed-in actor is allowed to set that member to (`assignableDesignations`), each labeled `Make {designation}` with an `aria-label` of `Set {name} to {designation}` for unambiguous targeting.
- `TeamMember` and `SignedInUser` both gain `designation`; `role` stays derived from it everywhere it's constructed (demo seed data, self-registration, promotion/demotion, both real-mode API routes, `getCurrentUser`).
- Promoting/demoting a demo team member also updates their `demoAccounts` login-identity entry if they have one, so the change actually takes effect the next time they sign in. It does **not** retroactively change an already-open session — same as a real RLS-backed session would need a fresh JWT/claim refresh, not a live push.

**Out**

- A real-mode, Supabase-backed Team tab — stayed demo-only at the time this feature shipped, same boundary Feature 005 documented; wired in Feature 015 Phase E (see the status note above).
- Tightening the owner-unilateral-transfer quirk noted above — flagged, left as-is per the approved plan.
- A `host`-designation login identity or flow — `host` has no current app flow that creates one; it folds into "staff" alongside `server`, same as `normalizeDatabaseRole` already does.

## Acceptance criteria

- [x] Owner, Manager, and Assistant Manager all resolve to the same `AppRole` and therefore identical capabilities (proven at the domain layer and by signing in as a promoted Assistant Manager and seeing manager-level controls).
- [x] Staff resolves to `AppRole: "server"`, unchanged.
- [x] An owner can set anyone's designation to anything.
- [x] A manager can toggle Assistant Manager ⇄ Staff on anyone who isn't currently Owner or Manager, and can never grant Manager or Owner to anyone.
- [x] A manager cannot change an Owner's or another Manager's designation.
- [x] An Assistant Manager or Staff member cannot change anyone's designation, including their own.
- [x] Promoting/demoting someone updates their login identity so the change takes effect on their next sign-in.

## UX contract

- Entry point: Team tab, manager/owner only (unchanged gating from Feature 005).
- Each row shows the member's designation label as plain text (not a role name) and zero or more `Make {designation}` buttons, one per option the signed-in actor may set.
- No buttons render for a target the actor cannot change at all (Owner viewing an Owner isn't excluded — an owner has no restricted targets).
- Keyboard/screen reader: every button carries an `aria-label` naming both the target and the destination designation, not just the destination.

## Data and authorization

- Real mode: no schema change. `roles` (the existing `app_role[]` column) stays the sole authorization source; `general_manager`/`shift_manager` map to Manager/Assistant Manager for display via `designationForRoles`.
- Demo mode: `designation` on `TeamMember`/`SignedInUser`; `role` always derived, never independently set (enforced by convention — `changeDemoMemberDesignation` is the one place both are written).
- Authorization logic: `canChangeDesignation`/`assignableDesignations` in `designations.ts`, unit-tested against the exact matrix in "Who can change whose designation" above.

## Implementation map

- `src/features/auth/domain/passcode.ts`: `Designation`, `designationToRole`, `designationForRoles`.
- `src/features/team/domain/designations.ts` (new, replaces `roles.ts`): `canChangeDesignation`, `assignableDesignations`, `designationLabel`.
- `src/features/team/components/team-workspace.tsx`: per-member designation label + assignable-designation buttons.
- `src/components/restaurant-operations-app.tsx`: `changeDesignation` (originally `changeDemoMemberDesignation`, which replaced `changeDemoMemberRole`; renamed and made dual-mode in Feature 015 Phase E), syncs `team` and any matching `demoAccounts` entry together in demo mode, calls `updateTeamDesignationAction` in real mode.
- `src/components/login-screen.tsx`: `SignedInUser.designation`.
- `src/lib/demo-data.ts`: `TeamMember.designation`; seed data and `demoAccounts` given explicit designations.
- `src/app/api/auth/passcode/route.ts`, `src/app/api/auth/register/route.ts`, `src/lib/current-user.ts`: populate `designation` on every real-mode `SignedInUser` construction site.

## Test plan

- Unit: `designations.test.ts` — full `canChangeDesignation`/`assignableDesignations` matrix (owner unrestricted; manager toggles staff⇄assistant_manager only, never touches owner/manager, never grants manager/owner; assistant_manager and staff can change nothing).
- Playwright: manager promotes a staff member to Assistant Manager and back; a manager is never offered a Manager/Owner-granting button anywhere; an owner promotes someone to Manager and a manager can no longer touch that person's designation afterward; promoting someone to Assistant Manager and signing back in as them shows full manager-level UI (Add shift, Clear board).

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a — no schema change.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (demo-only, session state).

## Decisions and risks

- **Decision**: designation as a separate concept over the existing roles, not a rename or collapse — see "The mapping decision" above.
- **Decision**: who-can-change-whom mirrors the real RLS actor set exactly, including the manager-cannot-touch-a-fellow-manager restriction the earlier 3-role demo approximation had gotten wrong.
- **Decision**: promotions sync the login identity (`demoAccounts`), found necessary while writing this feature's own Playwright coverage — without it, "full permissions" would be unverifiable end-to-end.
- **Risk/mitigation**: an already-open session doesn't pick up a designation change until sign-out/sign-in — documented as intentional (matches how a real session would need a fresh claim), not a bug.
- **Flagged, not fixed**: an owner can unilaterally reassign the owner designation — existing real-mode RLS behavior, out of scope per the approved plan.
- Open questions: none remaining.
