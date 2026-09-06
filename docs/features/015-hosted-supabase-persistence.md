# Feature 015 — Hosted Supabase persistence and Vercel deployment

Status: Phases A, B, and D shipped. Phase A: hosted Supabase project linked, migrations applied, first owner bootstrapped. Phase B: schedule reads/writes real data. Phase D: tips reads/writes real data. Phase C (allocation + Realtime) and Phase E (registration/team/CSV writes) remain.

**Numbering note**: you called this "feature 009," but `docs/features/009-add-any-employee-to-rotation.md` already exists (shipped). This is filed as **015** — the next free number, no collisions with any existing `docs/features/*.md`. This is also the item that was deliberately _not_ scoped as a numbered feature earlier this session ("leave it as the existing unchecked ROADMAP Phase 2 item 6") — that instruction is superseded now that you're asking for it directly.

**Implementation note**: same division-of-labor as every feature this session — Claude builds directly, Codex is not in this loop, one phase per session per your instruction below.

## Environment check (done before writing this spec, as asked)

| Tool                                                          | Status                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gh`                                                          | **Authenticated** as `KrapaGoutam`, scopes `gist, read:org, repo, workflow`. A GitHub remote (`KrapaGoutam/The-Lineup`) already exists and `main` is already pushed and up to date — nothing to set up here. |
| `supabase` (CLI, via `npx`, v2.76.8, already a devDependency) | **Not authenticated.** No access token in this environment.                                                                                                                                                  |
| `vercel` (CLI, via `npx`)                                     | **Not authenticated.** "Logged out."                                                                                                                                                                         |

Neither `supabase login` nor `vercel login` can complete in this sandbox — both open an interactive browser OAuth flow, and this session has no browser. That shapes the "what you need to do yourself" section below: it's not just project creation that needs your account, it's CLI authentication itself, unless you hand me a **personal access token** for each (Supabase: Account → Access Tokens; Vercel: Account Settings → Tokens) as an environment variable — both CLIs accept a token non-interactively (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`) with no browser step. Your call which way you want to do it; the checklist below covers both paths.

## User outcome

Every screen that currently runs on in-memory `useState` — schedule, table allocation, tips, team, CSV import — reads from and writes to the real Postgres database through the schema and RLS policies that already exist (built and pgTAP-tested since the very first commit, never actually exercised against a live project). Data survives a refresh, a redeploy, and a second device. `NEXT_PUBLIC_DEMO_MODE=true` keeps working locally with zero Supabase dependency, exactly as today.

## What already exists — read before assuming this is greenfield

This is not a from-scratch build. Confirmed by reading the schema and the app code, not assumed:

- **Every table, RLS policy, and constraint for all three modules already exists** across 6 applied-in-history-but-never-deployed migrations (`supabase/migrations/*.sql`), including the Feature 011 open-editing policy, the finalized-day freeze, and the `tip_pools_reopen_manager` reopen path. None of that needs rewriting.
- **The passcode auth routes are already real-mode code**, not demo stubs: `/api/auth/passcode`, `/api/auth/register`, `/api/auth/clear-lockout`, `/api/auth/lockout-status`, and `getCurrentUser()` all already query Supabase directly, already compute `designation` (Feature 014) and `role`, and already implement the org-wide degrading rate limit (Feature 006). They've simply never run against a linked project. Phase A's auth-adjacent work is verification, not construction.
- **Both entry routes already exist**: `/` (env-var default restaurant) and `/r/[restaurantSlug]` (real multi-tenant path, slug from the URL) — both already branch on demo mode identically (`NEXT_PUBLIC_DEMO_MODE === "true" || !NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). This means simply **omitting** the Supabase env vars from a given deploy environment already forces demo mode there, with no extra flag needed — used deliberately in the CI/CD design below.
- **Two real schema gaps found while writing this spec**, both scoped into Phase C below: `board_event_type` (a Postgres enum) has no `'move_column'` or `'add_row'` value — Feature 010's reorder and last session's manual "Add row" control were built demo-only and never got a migration. And there is no atomic board-write function analogous to `recalculate_tip_pool` — `table_rotation_entries` writes and their `board_events` audit row would currently be two separate client calls, which is a real atomicity gap for real persistence (a mid-write failure could record the table assignment without the audit event, or vice versa).

## Scope by phase

| Phase | What it does                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Supabase project, migrations applied, `db:types`, Vercel linked, first-owner bootstrap                                                                              |
| B     | Schedule: Server Component reads + Server Actions, `shifts`/`shift_assignments`/`operating_hours`/`shift_kind_defaults`                                             |
| C     | Allocation: Server Actions writing `table_rotation_entries`/`rotation_rounds`/`rotation_members` + `board_events`, Realtime scoped to the open `service_session_id` |
| D     | Tips: Server Actions + `recalculate_tip_pool` RPC, finalize/reopen against real `tip_pools`                                                                         |
| E     | Registration, Team (designations), and CSV import flipped from demo to real writes                                                                                  |

Every phase also has to carry forward everything built in demo mode since the original phase notes were sketched: 4-digit passcodes (already real-mode, Phase A verifies it), designations (Phase E — no schema change, per Feature 014's own spec), board reordering and the manual add-row control (Phase C), and the finalized-day lock plus its reopen path (Phase D writes it, Phase C's board has to respect it when reading lock state).

## Out of scope for this feature

- The retained pure `floor`/`rotation` recommendation-engine modules and the "legacy core" seating tables (`dining_areas`, `seatings`, etc.) — those are a separate, larger product surface (ARCHITECTURE.md's "Table assignment and rotation" section) that the PRD explicitly defers past this MVP's three delivered modules.
- Feature 007 (mobile/tablet responsive pass) — still specced, not built; unrelated to persistence.
- Realtime multi-device conflict UX beyond "last write wins, re-fetch on conflict" — the PRD's non-functional requirement is transactional/idempotent, not conflict-resolution UI; that's future work if it proves necessary.
- A second, non-demo staging database for Preview deploys with real data — see the CI/CD section for why Preview stays in demo mode instead, and what upgrading that later would look like.

## Credentials: passcodes stay runtime-managed, never in env vars

Confirmed as a hard constraint, and it's already how the app works today — nothing to change here, only to keep true as real persistence lands: `passcode_credentials` holds only the HMAC locator (`HMAC(APP_PIN_PEPPER, organization_id + ":" + passcode)`) and a synthetic email; the raw passcode is never stored anywhere, and the only place `APP_PIN_PEPPER` appears is as a server-only env var used to compute that HMAC at request time. Registering, promoting, demoting, and (once built) revoking a person are all runtime `memberships`/`passcode_credentials` row operations through the app — never a deploy.

## Bootstrap: how the very first owner gets in

Three options exist; here's which one and why.

- **Manual SQL** — rejected. The passcode locator is `HMAC-SHA256(APP_PIN_PEPPER, org_id + ":" + passcode)`; hand-writing that in SQL means re-deriving the HMAC correctly outside the one function that already computes it (`createPasscodeLocator` in `src/lib/passcode-security.ts`), with no compiler or test catching a mismatch. A first login failure with no error message beyond "passcode not recognized" is a bad first experience to debug by hand.
- **A one-time HTTP setup route** — rejected. Even gated by "refuse if an owner already exists," it's still shipped code living at a guessable URL in the production bundle forever, reachable by anyone who finds it before the guard condition (an owner row existing) is true. A route is _always_ live attack surface; a script is only live while someone with the real secrets is deliberately running it on their own machine.
- **A local script, run once, with a database-level guard so re-running it is inert** — this is what I'm building: `scripts/bootstrap-owner.ts`, invoked with `npx tsx scripts/bootstrap-owner.ts`.

What it does:

1. Connects with the **service-role key** (from your local `.env.local` — never committed, never the browser-safe key).
2. **Guard, checked first, before anything else**: `select count(*) from memberships where 'owner' = any(roles)`. If that's greater than zero, the script exits immediately with an error and creates nothing. This is a database-state check, not a "please don't run this twice" comment — it can't be bypassed by running the script again, because the thing it checks for is exactly what running it successfully the first time creates. The only way to get a second owner after this is through the app itself (an existing owner promoting someone — Feature 014, already real-mode-ready).
3. Takes the organization name, slug, location name, IANA time zone, your name, and a passcode as CLI flags (passcode optional — if omitted, the script generates a random 4-digit code and prints it once).
4. Creates, in order, using the exact same primitives `/api/auth/register/route.ts` already uses (reused, not reimplemented): a Supabase Auth user (synthetic email + the passcode as its password), a `profiles` row, an `organizations` row, a `locations` row (with the time zone — feeds Phase B directly), a `memberships` row with `roles: ['owner']`, and a `passcode_credentials` row via `createPasscodeLocator`.
5. Prints the passcode to stdout exactly once, with an explicit "this will not be shown again — write it down" line. Never written to a file, a database column, an env var, or a log line anywhere else.
6. Requires a `--yes` flag to actually write (a dry run without it just prints what it would do) — a small guard against running it by accident against a `.env.local` that's pointed at the real project instead of local Supabase.

If `createPasscodeLocator` turns out to be awkward to import directly into a standalone `tsx` script (it's marked `"server-only"`, a Next.js-specific build-time guard — it should still execute fine under plain Node since the guard is a bundler-resolution trick, not a runtime assertion, but I'll verify this empirically in Phase A rather than assume it) — the fallback is inlining the identical one-line HMAC call, not a different algorithm.

## Demo mode stays exactly as it is

Every component this phases through keeps the same `demoMode: boolean` prop it has today. Server Components/Actions are the real-mode path; the demo `useState` path stays in place for `NEXT_PUBLIC_DEMO_MODE=true`, unchanged, so `npm run dev` with no Supabase project linked keeps working exactly as now. No component gets its demo path deleted in this feature.

## The one genuinely new piece of domain logic: local wall time → `timestamptz`

Flagged in the original phase notes, confirmed true while writing this spec: `shift_kind_defaults.start_local`/`end_local` and a shift's chosen custom times are location-local wall-clock strings (`HH:mm`); `shifts.starts_at`/`ends_at` are `timestamptz`. Converting between them, correctly, across a DST transition, is the one piece of new logic — everything else is "read/write the row that already has a policy for it."

**Design — native `Intl.DateTimeFormat` only, no new dependency** (this repo already carries an unused `date-fns` dependency; I'm not reaching for it or adding `date-fns-tz` — the existing `use-restaurant-clock.ts` hook already establishes the `Intl.DateTimeFormat(...).formatToParts()` pattern for the _other_ direction, reading a wall clock out of an instant; this is that pattern run in reverse):

```ts
// src/lib/timezone.ts
export function zonedWallTimeToInstant(input: {
  date: string; // "YYYY-MM-DD", location-local calendar date
  time: string; // "HH:mm", 24h, location-local wall clock
  timeZone: string; // IANA zone, e.g. "America/Chicago"
}): Date;
```

Two-pass offset correction:

1. **Guess**: build `guess = Date.UTC(y, m, d, hh, mm)` — treat the wall-clock numbers as if they were already UTC.
2. **Read back**: `Intl.DateTimeFormat("en-US", { timeZone, ...}).formatToParts(guess)` tells us what wall-clock date/time `guess` actually renders as _in the target zone_.
3. **Diff**: the difference between that rendered wall time and the original input wall time is the zone's UTC offset at (approximately) that instant, in minutes.
4. **Correct**: `instant = guess - offsetMinutes`.
5. **Re-verify**: render `instant` back through the same formatter. If it matches the input exactly, done. If it doesn't, we landed on a DST transition:
   - **Spring-forward gap** (the wall time never existed, e.g. 2:30 AM on the day clocks jump 2→3): resolve to the instant immediately at the new offset — deterministic, never throws.
   - **Fall-back overlap** (the wall time happens twice, e.g. 1:30 AM occurs at both offsets): resolve to the **first** occurrence (the pre-transition, larger-offset instant) — the same default most timezone libraries use.

This composes correctly for overnight shifts spanning a transition without any special-casing: `starts_at` and `ends_at` are each converted independently from their own `(date, time)` pair, so `ends_at - starts_at` automatically comes out as the real elapsed wall-clock duration (7 or 9 hours across a transition night, not a naive 8) — worth its own test, not just asserted.

**Test plan** (`src/lib/timezone.test.ts`):

- A non-DST-observing zone, any date — sanity baseline.
- The same US zone in January (standard time) vs July (daylight time) — proves the offset used is the one for _that date_, not "whatever the offset is right now."
- The exact spring-forward date/time (second Sunday in March, 2:30 AM local) — deterministic, doesn't throw.
- The exact fall-back date/time (first Sunday in November, 1:30 AM local) — resolves to the documented first-occurrence policy.
- An overnight shift (e.g. 11 PM → 7 AM) whose date crosses a DST transition night — asserts the resulting duration reflects the real 7-or-9-hour elapsed time, not 8.

## What you need to do yourself

Numbered, in order. I can't complete the checked items myself in this environment (see the CLI table above) without a token from you.

1. **Supabase**: create (or confirm you already have) a Supabase account, then either (a) run `supabase login` yourself in your own terminal once — I'll pick up the resulting local session — or (b) generate a personal access token (Supabase dashboard → Account → Access Tokens) and give it to me as `SUPABASE_ACCESS_TOKEN` so I can run the CLI non-interactively.
2. **Create the Supabase project** (Free tier) — either you do this in the dashboard and give me the project ref/URL/keys, or, if you gave me a token in step 1, I can run `supabase projects create` myself. Your call.
3. **Vercel**: same shape — either `vercel login` yourself once, or a personal access token (Vercel → Account Settings → Tokens) as `VERCEL_TOKEN`.
4. **Link Vercel to the GitHub repo** (`KrapaGoutam/The-Lineup`, already exists) — this part specifically wants your account's authorization click in Vercel's GitHub App installation flow; a token doesn't substitute for that one step.
5. **Add environment variables** in Vercel's dashboard (or I do it via `vercel env add` if you've given me a token) — see the exact Production/Preview split in the CI/CD section below.
6. **Add repository secrets** in GitHub (Settings → Secrets and variables → Actions) for the migration-deploy workflow: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` (I can do this myself via `gh secret set`, already authenticated — only listed here because the _values_ have to come from you).
7. **Run the bootstrap script** yourself, locally, once the project exists and migrations are applied (Phase A) — I'll hand you the exact command; you're the one who should hold the printed first-owner passcode, not me.

## CI/CD: migrations on deploy, and keeping Preview off the production database

**Preview deploys stay in demo mode — no second database, no cost, no risk of touching real data.** Both entry routes already compute `demoMode` as true whenever the Supabase env vars are absent, so the fix is simply: **never add `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` / `APP_PIN_PEPPER` to Vercel's Preview environment scope at all** — only Production gets them. I'll also set `NEXT_PUBLIC_DEMO_MODE=true` explicitly for Preview for clarity, even though omitting the Supabase vars already forces it. A reviewer opening a PR's preview URL gets a fully-functional demo-mode app — real UI, fake data, zero chance of writing to production. If you later want Preview to exercise real Supabase code paths, the documented upgrade is a second free Supabase project used only by Preview — deliberately not built now, since it's extra infrastructure this pilot doesn't need yet.

**Migrations deploy on merge to `main`**, not on every PR (PRs already get ephemeral local-Supabase migration testing from the existing `database.yml`, unchanged). New job (added to `database.yml`, gated `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`): checks out, links the CLI to the real project with `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_ID` secrets, and pushes any unapplied migrations. The exact CLI invocation (`supabase db push` vs `supabase migration up --linked`, and whether it needs a direct DB password secret alongside the access token) is something I'll confirm empirically against the real project in Phase A rather than assert now — noted as a Phase A risk, not a blocker to approving this spec.

**The existing quality gate (`ci.yml`) is untouched** — format/lint/typecheck/unit tests/build/Playwright-desktop still run on every PR and push to `main`, unchanged.

## Phase A — project, migrations, types, Vercel link, bootstrap

**Scope**: no application code changes. Infrastructure and one new script.

- Create the Supabase project (see checklist).
- Apply all 6 existing migrations in order (`supabase db push` against the linked project, or the SQL editor as a fallback — CLI preferred so the migration history table stays authoritative).
- `npm run db:types` against the linked project; commit `src/types/database.generated.ts`.
- Link Vercel to the repo; add Production env vars; explicitly withhold them from Preview (see CI/CD).
- Write and run `scripts/bootstrap-owner.ts` (see Bootstrap section) — creates the first owner, org, location, and passcode.
- **Verification, not construction**: sign in through `/r/<slug>` with the real passcode against the real project; confirm `getCurrentUser()` returns the right role/designation; confirm the org-wide rate limit and manager-clearable lockout (Feature 006) behave correctly against real `passcode_login_attempts` rows; confirm self-serve registration (Feature 005) creates a real `server`-role membership end to end.
- Add the migration-deploy GitHub Actions job.

**Test plan**: no new unit tests (no new app logic). Manual verification checklist above, run once against the live project. `npm run check`/`npm test`/`npm run build` still pass (no source changes expected to touch existing tests).

## Phase B — Schedule

**Scope**: `schedule-workspace.tsx`'s demo `useState` (`initialShifts`, local `shifts` state) replaced with a Server Component read (`shifts` + `shift_assignments` scoped to `organization_id`/`location_id`/the visible week or month) and Server Actions for: add shift (single or date-range), publish a draft period, and (Phase E territory, but touches the same files) commit a CSV import. Wall-clock `startLocal`/`endLocal` inputs go through `zonedWallTimeToInstant` before insert; reads convert back the other direction for display, reusing `use-restaurant-clock.ts`'s existing `formatToParts` pattern.

**Data and authorization**: `shifts_select_member`/`shifts_write_manager`-shaped policies already exist (confirmed in DATA_MODEL's RLS matrix) — no new policy expected; Phase B is a read/write client swap, not a schema change, unless verification in Phase A surfaces a real gap.

**Test plan**: `timezone.test.ts` (above) is the new unit coverage. Component/Playwright: existing schedule Playwright tests re-run against real mode (a second project matrix entry or an env-gated variant — exact CI shape decided at Phase B start) to confirm no regression versus demo mode's behavior.

## Phase C — Allocation

**Scope**: `allocation-workspace.tsx`'s demo reducer (`rotation-board.ts`, kept as the pure domain logic — it stays the source of truth for _shape_, not persistence) replaced with Server Actions calling new atomic RPC functions, one per `BoardAction` variant that mutates state: `assign`, `add-column`, `set-column-status`, `clear-row`, `clear-column`, `clear-board`, `move-column`, `add-row`. Each function does the `table_rotation_entries`/`rotation_members`/`rotation_rounds` write **and** the matching `board_events` insert in one transaction — closing the atomicity gap named above. Realtime: a `postgres_changes` subscription scoped to `service_session_id = <the open session>` (not organization-wide) refreshes other open boards.

**Migration work** (new, scoped precisely):

- `alter type board_event_type add value 'move_column'` and `add value 'add_row'` (each its own migration file — Postgres requires an enum-value addition to commit before it can be referenced in the same session).
- The new SECURITY INVOKER RPC(s), mirroring `recalculate_tip_pool`'s existing shape (`set search_path = ''`, re-checks eligibility, no `SECURITY DEFINER`).
- Verify (not assume) that `rotation_members.position` (reorder) and `rotation_rounds` insert (manual add-row) are already covered by the existing manager-scoped policies from the original schema; add a policy only if verification finds a real gap.

**Data and authorization**: everything in SECURITY.md's "Allocation-board open editing" section (any active member writes any column, unconditional attribution, no reason field, finalized-day freeze, manager/owner-only reopen) has to hold against the real RPCs exactly as it does against the demo reducer today — this is the highest-stakes phase for a regression, and gets the most scrutiny at review.

**Test plan**: pgTAP for the new RPCs (any member can call `assign` for any column; `assigned_by` can't be spoofed through the function; the function is rejected once the service date's tip pool is finalized; move-column/add-row work for managers only). Playwright: the full existing allocation suite (reorder, cross-column attribution, add-row, finalized lock, reopen) re-run against real mode.

## Phase D — Tips

**Scope**: `tip-workspace.tsx`'s demo state replaced with Server Actions against `tip_pools`/`tip_intervals`/`tip_interval_participants`, calling the existing `recalculate_tip_pool(tip_pool_id)` RPC after any interval/participant change, plus finalize (update `tip_pools.status = 'finalized'`, already permitted by the existing `tip_pools_update_draft_manager` policy's unrestricted `with check`) and reopen (the existing `tip_pools_reopen_manager` policy from Feature 011, already migrated).

**Data and authorization**: no new migration expected — confirmed by reading the existing policies while writing this spec, not assumed. Server-only visibility rules (a server sees only their own `tip_allocations` row) already exist.

**Test plan**: Playwright — the full existing tip suite (interval add, finalize, reopen with reason, cross-module board lock) re-run against real mode. A real-mode-specific test asserting `tip_allocations` sums exactly to `tip_intervals.amount_cents` after `recalculate_tip_pool` runs against real rows, not just the demo pure-function equivalent.

## Phase E — Registration, Team, CSV import

**Scope**:

- Registration: `/api/auth/register` is already real-mode code (Phase A verifies it) — Phase E's actual work is `login-screen.tsx`/`restaurant-operations-app.tsx` calling it instead of `registerDemoMember` when `demoMode` is false, which the components are already structured to support (the `demoMode` branch already exists at the call site).
- Team: designations (Feature 014) need **no schema change** by that feature's own spec — `general_manager`/`shift_manager` already map to Manager/Assistant Manager. Phase E wires `team-workspace.tsx` to a real `memberships` read + a Server Action calling the existing `memberships_update_manager`/`memberships_insert_manager`-governed update, replacing `changeDemoMemberDesignation`.
- CSV import: `parse-schedule-csv.ts` stays the pure parser (unchanged); `csv-import-panel.tsx`'s commit step calls the same Phase B shift-creation Server Action per parsed row instead of local state, inside one batch (all rows succeed or the whole import is rejected, matching today's demo all-or-nothing commit).

**Test plan**: Playwright — self-registration, promote-to-Assistant-Manager-then-sign-back-in, and CSV import, all re-run against real mode.

## Documentation sweep — after each phase, not all at once

Per phase, whichever of these actually changed:

- **DEPLOYMENT.md** — the one that has to be exactly right. Gets fully rewritten in Phase A (current version predates 4-digit passcodes, the `registrations` rename, and has no bootstrap-script or CI-migration content at all) — not a light edit.
- **README.md** — "Current delivery state" section updated to say what's real vs. demo-only, per phase.
- **ROADMAP.md** — Phase 2 item 6 ("Connect the interactive reference UI to hosted Supabase mutations and Realtime subscriptions") checked off incrementally as B/C/D land, and Phase 1 item 2 ("Link hosted Supabase...") checked off after Phase A.
- **ARCHITECTURE.md** — the "Request patterns" section stops being aspirational once Server Components/Actions are real; the Realtime scoping detail (per-`service_session_id`) gets documented in Phase C.
- **DATA_MODEL.md** — any policy actually added (the two Phase C RPCs, the enum values) gets the same "real treatment" standard as every other authorization change this session.
- **SECURITY.md** — Phase A's bootstrap mechanism gets its own subsection (the same depth as Feature 011's and 014's), Phase C's atomicity fix gets one.
- **TESTING.md** — real-mode Playwright/pgTAP additions per phase.
- Affected `docs/features/*.md` — 002/003/004 (currently marked "schema and UI complete but disconnected") get their status lines corrected phase by phase as they stop being disconnected.
- **CLAUDE.md/AGENTS.md** — only if a rule actually changes; I don't expect one, but I'll say explicitly per phase if I find otherwise rather than skipping the check.

## Phase B/D build notes — what actually happened versus what was specced

Built together in one session, in separate commits, per explicit direction (schedule first, then tips, on `feature/schedule-tips-persistence`). `npm run check`/`npm test`/`npm run build` all pass at both the Phase B commit and the Phase D commit independently — each commit was validated on its own, not only at the end of the branch.

- **`organizationId` threaded onto `SignedInUser`**: not explicitly specced, but both phases' Server Actions need an `organization_id` to scope every write, and the only place that value was available client-side was the signed-in user. Added as a required field (`current-user.ts`, both auth routes, `demo-data.ts`'s accounts) rather than an optional one, so every construction site gets it at once instead of a partial rollout with an optional field threaded through every consumer. Demo mode uses a stable placeholder (`DEMO_ORGANIZATION_ID = "demo-org"`) since nothing in demo mode ever queries with it.
- **`getPrimaryLocation`/`getOrganizationRoster` extracted as shared data-layer helpers** (`src/features/locations/data/primary-location.ts`, `src/features/team/data/roster.ts`) the moment a second real consumer (tips) needed the same lookup schedule had already written — the single-location-per-pilot simplification (`getPrimaryLocation` takes the org's first location by `created_at`) is documented at the source, not assumed.
- **`schedule_periods` uses a simplified one-draft-period-per-(location, year) model**, not the full per-batch-versioned model DATA_MODEL.md describes — see that document's "Schedule versions" section for the reasoning. This was a scope decision made during Phase B build, not called out in this spec beforehand.
- **CSV import (Feature 008) became real-mode-functional as a side effect** of `ShiftEditor`'s `onAdd` and `CsvImportPanel`'s `onCommit` sharing the same lifted `onAddShifts` handler — not a deliberate pull-forward of Phase E, just an honest consequence of the plumbing. Documented in `docs/features/008-bulk-schedule-import.md` rather than left silently stale.
- **PostgREST embed cardinality gotcha — this one shipped as two real bugs, not just a typecheck annoyance**: `schedule_periods(status)` and `profiles(display_name)` both typechecked as one-element arrays, and both were "fixed" at the time by indexing `[0]` to satisfy the compiler. That was wrong: `shifts→schedule_periods` and `memberships→profiles` are both many-to-one embeds that PostgREST returns as a single object, confirmed by querying the live project directly — `[0]` on a real object reads `undefined`. This shipped in the Phase B/D commits and surfaced as user-reported bugs (registered members showing as "Unknown"; the `shifts` query separately erroring outright on the unrelated ambiguous-FK issue below) rather than being caught before merge, since no local test exercises the real Supabase client. Fixed in the two commits after this section was first written — see DATA_MODEL.md's "PostgREST embed cardinality" section for the corrected rule and both fixes.
- **A second, independent PostgREST issue on the same `shifts` query**: `shifts` has two foreign keys to `schedule_periods` and `shift_assignments` has two back to `shifts`, so the bare embeds in `getScheduleContext()` returned a `PGRST201` ambiguous-relationship error on every request — an error the code never checked, so it read as an empty result, not a failure. This is the reason schedules appeared not to persist: writes were succeeding, reads were silently failing. Fixed by naming the tenant-composite constraint explicitly in the select string.
- **`audit_events` has no direct FK to `profiles`** for PostgREST embedding (its actual FK is a composite to `memberships`) — `getTipsContext()`'s audit-log actor-name resolution goes through a `Map` built from the already-fetched roster instead of a second query.
- **Tips needed no new time-zone logic**: the question raised at the start of this pairing — answered here — is that `zonedWallTimeToInstant`/`zonedWallTimeFromInstant` from Phase B cover tips' interval start/end conversion exactly as built; nothing schedule-specific in that utility needed generalizing.
- **`addTipIntervalAction`'s return shape carries the tip pool id** (`{interval, tipPoolId}`, not just the interval) so the client can capture a lazily-created pool's id without a second read — the pool doesn't exist until the first interval is added, so there's no id to pass in on the initiating call.

## Sequence

1. ~~This spec — stop here for your approval.~~ Done.
2. ~~Phase A. Full validation (`npm run check`, `npm test`, `npm run build`), doc sweep, stop for you to test sign-in against the real project.~~ Done — see the Phase A sections above.
3. ~~Phase B. Same cadence, stop.~~ Done — see "Phase B/D build notes" above. Built together with Phase D per explicit direction (shared Server Component read + Server Action pattern), as separate commits on `feature/schedule-tips-persistence`.
4. Phase C. Same cadence, stop. **Next.**
5. ~~Phase D. Same cadence, stop.~~ Done — see "Phase B/D build notes" above.
6. Phase E. Same cadence, stop.

Phase A landed directly on `main` (pushed after the user verified sign-in against the real project themselves); Phases B/D happened on `feature/schedule-tips-persistence`, branched off the updated `main`. Separate commits within a phase where the work naturally splits (e.g., Phase A's migration-apply vs. bootstrap-script vs. CI-workflow were three commits, not one; Phase B and Phase D were two commits, not one) — exact split decided at build time, same as every prior feature this session.

## Decisions and risks

- **Decision**: bootstrap via a local script with a database-state guard, not an HTTP route or manual SQL — see the Bootstrap section for the full reasoning.
- **Decision**: Preview deployments stay in demo mode rather than getting a second Supabase project — zero infrastructure cost, zero risk, and the existing `demoMode` computation already supports it with no code change. Documented as upgradable later.
- **Decision**: timezone conversion built on native `Intl.DateTimeFormat`, matching the existing `use-restaurant-clock.ts` pattern, no new dependency — per your explicit instruction.
- **Risk**: the exact `supabase` CLI invocation for pushing migrations to a linked project from CI (and whether it needs a DB password secret beyond the access token) isn't verified yet — first real test happens in Phase A against the actual project, not asserted here.
- **Risk**: Phase C's new atomic RPC functions are the highest-stakes schema change in this whole feature — they're new `SECURITY INVOKER` functions touching the allocation board's every write path. Gets explicit extra review time at that phase, not folded in casually.
- **Risk**: this repo carries an unused `date-fns` dependency (confirmed via grep — zero imports anywhere in `src/`). Not removed as part of this feature (out of scope, unrelated cleanup), but flagged since it came up while confirming the "no new dependency" decision above.
- Open questions: none blocking approval — the CLI-authentication question above is a "tell me which path" for you, not a blocker to starting Phase A once you answer it.
