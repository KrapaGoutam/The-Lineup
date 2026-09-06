# Feature 005 — Self-serve registration and role promotion

Status: shipped. **Update (Feature 015, Phase E)**: `/api/auth/register` needed no changes to go real — it was already real-mode code, as this document's own "Out" section already said; `login-screen.tsx`'s `submitRegister` was already calling it whenever `demoMode` is false. Verified live: a throwaway account self-registered through the real UI and showed up under its real name everywhere the roster is read (this was worth checking specifically — see `docs/DATA_MODEL.md`'s "PostgREST embed cardinality" section for the unrelated bug that once made real names show as "Unknown," fixed in Feature 015 Phase B, before this phase, not by it). The Team tab's promotion control is covered separately in `docs/features/014-team-designations.md`.

**Implementation note**: for this batch (features 005–008), Claude implements directly — the user explicitly changed the default Claude-plans/Codex-builds division of responsibility from `CLAUDE.md` for this batch only. Codex is not in this loop. The default split resumes for future feature work unless the user says otherwise again. This note exists so it doesn't need repeating per feature.

## User outcome

A new person at `/r/<restaurant-slug>` registers with a name and a passcode they choose — contact is optional — and is immediately signed in as an active server — no manager approval step blocks them. Managers/owners retain the sole ability to promote someone beyond server role, through a new Team view.

**Amended 2026-09-05**: contact (phone/email) is optional. Only the display name and the chosen passcode are mandatory.

## Scope

**In**

- `POST /api/auth/register`: validates input, creates the Supabase Auth user (synthetic email + chosen passcode as password), creates `profiles` / `memberships` (`roles = ['server']`, `active = true`) / `passcode_credentials`, returns the same signed-in-user payload `/api/auth/passcode` already returns.
- Passcode collision handling at registration (same-organization duplicate detection + rollback — see Data and authorization).
- Migration: rename and repurpose `access_requests` → `registrations`, an append-only self-serve registration log (kept, not dropped — see Decisions).
- `login-screen.tsx`: "Request access" mode becomes "Register" (name, contact, chosen passcode); the old "Request sent" confirmation screen is removed since success signs the person in directly.
- Demo mode: an in-memory registration path (session-local state) so the flow is exercisable with `NEXT_PUBLIC_DEMO_MODE=true` and no backend, mirroring how demo login already works.
- New manager/owner-only **Team** tab (4th tab alongside Schedule/Allocation/Tips): lists active members and their role(s), with a promote/demote control. Demo-mode/in-memory for this batch, consistent with every other module's current persistence state at the time — real writes landed in Feature 015 Phase E.

**Out**

- Real Supabase persistence for the Team tab specifically (demo-only this batch; the registration _route_ itself is written as real code exactly like the existing `/api/auth/passcode` and old `/api/access-requests` routes are — it simply isn't exercised until a project is linked, unchanged from today's reality).
- Email verification (synthetic email, not a real inbox — matches the existing passcode pattern).
- Password reset / passcode recovery flow.
- Payroll or government-ID identity verification.

## Acceptance criteria

- [x] Given an unregistered person on `/r/<slug>`, when they submit a name and a valid 4-digit passcode not already used in that organization (contact optional, left blank or filled), then they are immediately signed in as an active server and appear in the organization's member list.
- [x] Given a chosen passcode already used by someone else in the same organization, when they submit, then registration fails with "That passcode is already in use — choose a different one" and no orphaned Auth user / profile / membership row remains.
- [x] Given a manager/owner on the Team tab, when they change another member's role, then: owner can grant any role; `general_manager` cannot grant `owner`/`general_manager`; `shift_manager`/`host`/`server` cannot change roles at all (this already matches the existing `memberships_update_manager` RLS policy — no policy change needed, only a UI that exercises it).
- [x] Given demo mode, when a person registers, then they're added to the in-memory team roster for that session and can sign in with their chosen passcode for the rest of the session (resets on refresh, consistent with every other demo-mode surface).
- [x] Given a successful self-serve registration, then one append-only `registrations` row records who/when; application roles cannot update or delete it.

## UX contract

- Entry point: "Register" link on the passcode login screen, replacing "Request access."
- Desktop / tablet / mobile: single-column form, same visual treatment as the existing login card.
- Loading: submit button shows "Creating your account…".
- Error: inline `aria-live` text for invalid name / passcode format / passcode-already-taken / a contact value that's non-empty but malformed (empty contact is always valid).
- Success: immediate sign-in, no intermediate screen.
- Permission denied: Team tab and its controls are not rendered at all for non-managers.
- Keyboard/screen reader: same labeled-input + `aria-live` + 44px-target pattern as the existing login form.

## Data and authorization

- Tables/columns: rename `access_requests` → `registrations`; add `profile_id uuid references profiles(id) on delete set null`, `self_served boolean not null default true`; `contact` made nullable (only `display_name` and the passcode are mandatory — a follow-up migration relaxed the original `not null` + length-check to allow null while still bounding a provided value's length).
- Constraints/indexes: no new constraint required — the existing `unique (organization_id, locator)` on `passcode_credentials` is the collision guard.
- Grants/RLS: `registrations` grants drop `update` for `authenticated` (no more accept/decline action) and keep `select` (managers can view registration history) and the existing `grant all ... to service_role`. No change to `profiles`/`memberships`/`passcode_credentials` RLS — the route writes through the service-role admin client exactly like `/api/auth/passcode` already does today, bypassing RLS by design (same trust boundary already in the codebase).
- Roles/capabilities: new registrants always get `roles = ['server']`, enforced in the route, not by a DB trigger — flagged as an application-layer invariant (same trust model as the rest of the admin-client pattern).
- Audit events: one `registrations` row per successful registration (`reviewed_by`/`reviewed_at` left null — "no manual review occurred").
- Idempotency/concurrency: on a losing passcode race, the route deletes the Auth user it just created (compensating rollback, since Auth-user creation via the admin API isn't part of the same Postgres transaction as the table inserts) and returns a clean error. No partial/orphaned account is left active.
- Time-zone behavior: n/a.

## Implementation map

- Routes: new `src/app/api/auth/register/route.ts`; remove `src/app/api/access-requests/route.ts`.
- Feature modules: `src/features/auth/domain/` (registration validators), new `src/features/team/domain/` (promote/demote pure logic), new `src/features/team/components/team-workspace.tsx`.
- Server actions/RPCs: none new — sequential admin-client inserts, matching the existing `passcode/route.ts` style.
- Realtime: none.
- Migration: one new migration renaming/extending `access_requests` as above.
- Generated types: deferred — real hosted linkage is out of scope for this batch (tracked as the existing unchecked `docs/ROADMAP.md` Phase 2 item 6).

## Test plan

- Unit: registration domain validators (name/contact/passcode format); promote/demote pure role-set logic.
- Component: `LoginScreen` register-mode states; `TeamWorkspace` controls hidden for non-managers.
- Database/RLS: pgTAP — `registrations` RLS enabled, `anon` denied, `authenticated` select-only; duplicate-locator-within-org insert fails; same passcode across two different organizations succeeds.
- Playwright: rewrite "unregistered user can request access" → "self-registers and lands in the app" (demo mode); manager promotes a server via the Team tab (demo mode).
- Manual viewports: covered by Feature 007 for the shared login form.

## Rollout and rollback

- Feature flag: none — direct replacement of the old request-access UI.
- Expand/migrate/contract: the migration only adds nullable/defaulted columns and renames a table in place — backward compatible, no destructive step.
- Backfill: none needed (the table holds no real rows in this checkout).
- Rollback limit: reverting the migration is safe — no real registrations exist yet to lose.

## Decisions and risks

- **Decision**: keep and repurpose `access_requests` as `registrations` rather than drop it — a self-serve account-creation path is exactly the kind of security-sensitive action worth an audit trail, and the migration cost is small.
- **Decision**: Team-tab promotion ships demo-mode/in-memory only this batch, for consistency with every other module's current persistence state; the registration _route_ is real code, matching the existing (also currently unlinked) passcode-login route.
- **Risk**: a self-serve flow with no review step means anyone holding the restaurant's URL can create a server account — the URL becomes the real access boundary now, not a manager's approval. This is the explicit, intentional product decision being made; flagging it so it's a conscious trade-off, not a surprise later.
- **Risk**: role-default enforcement (`roles = ['server']`) lives only in application code, not a DB constraint — consistent with, and no weaker than, the rest of this codebase's existing service-role trust boundary.
- Open questions: none remaining — resolved in prior planning turns.
