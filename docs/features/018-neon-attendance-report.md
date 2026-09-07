# Feature 018 — Neon attendance report

**Name:** Neon attendance report
**Owner:** Krapa Goutam
**Status:** discovery (spec only — no code written yet)
**Issue/PR:**

## Numbering note

Next free number after `017-member-deactivation.md` — no collisions with any existing `docs/features/*.md`.

## Read before assuming this is greenfield — including one real scope tension

- This app has never connected to any database other than Supabase. There is no existing Postgres client dependency in `package.json` beyond `@supabase/supabase-js`/`@supabase/ssr` — this feature needs a new one (below).
- **`docs/PRD.md` explicitly lists "Payroll, clock-in/out, POS settlement... integrations" under "Out of scope for MVP."** This feature reads already-existing clock-in/clock-out data from an external system and displays it — it does not build a clock-in/out system, does not write to Neon, and computing anything from the hours (payroll, overtime, compliance) is explicitly deferred by you to future scope. That's narrower than what the PRD line was almost certainly written to keep out (this app growing into its own timeclock/payroll product), but it's close enough to the letter of that exclusion that it needs an explicit, narrow annotation to the PRD, not a silent bypass — see the doc sweep below. Flagging this now, not after building it.
- Neon's `users` table has no organization/tenant column at all — it's a flat, single list. This app's Supabase side is multi-tenant-capable (`organization_id` everywhere), but Neon isn't, and can't be scoped to match. **Named limitation, not a blocker for today's reality**: this integration assumes a single restaurant/organization uses this deployment, which is the current, only real deployment. If a second organization ever used this same codebase, its managers would see the exact same Neon data as the first — there is no tenant key to filter by. Worth knowing before this ever gets reused for a second restaurant; not a reason to hold up a single-restaurant feature today.
- `docs/DEPLOYMENT.md` already documents that **Vercel Preview deployments never get Supabase credentials, which forces them into demo mode "at zero extra infrastructure cost."** The same pattern applies directly here (see Rollout below): `NEON_DATABASE_URL` in Production only, never Preview — Preview stays a fully self-contained demo build with zero external dependencies, same as it already is today.
- CI (`npm run build` in `.github/workflows/ci.yml`) already runs today with **no** Supabase secrets set at all, and passes — because every existing data-layer module reads its connection details from `process.env` lazily, inside a function, at request time, never at module load or build time. `NEON_DATABASE_URL` will follow the exact same rule, which is what makes the answer to your CI question "no" (below) something confirmed by the existing pattern, not a new assumption.

## User outcome

A manager or owner opens a new "Attendance Report" tab and sees, for whichever staff and period they pick, exactly what Neon's `attendance` table already recorded — clock-in, clock-out, hours worked, and a total per person — without any of that data ever being copied into this app's own database. If Neon is slow or unreachable, the tab says so clearly; nothing else in the app notices or is affected.

## Scope

- **In**: a new manager/owner-only "Attendance Report" tab; a person multi-select (all active Neon users, plus "All"); a period selector (This month / Previous month / custom range, default This month); per-person attendance tables with a period total; a grand total across every currently-shown person; the three edge cases named below rendered explicitly; demo-mode fixture data (including a same-name, different-role pair, so the disambiguation logic is visible without live Neon access); a hard query timeout with a clear "attendance data unavailable" state; the `NEON_DATABASE_URL` env var documented and added to `.env.example`; the narrow PRD annotation above.
- **Out**: any computation on the hours (payroll, overtime, compliance) — display only, exactly as you scoped it. Writing to Neon in any form. A scheduled/cached sync of Neon data — every view is a live read at the moment the tab or filters are used. Multi-tenant scoping of Neon data (named above, not solvable without a Neon schema change). Editing or correcting a Neon row from this app. Exposing Neon `role` as anything other than verbatim display text — it is never mapped onto this app's own designations, and no permission decision in this app is ever based on it.

## Acceptance criteria

- [ ] Given a manager or owner, when they open the Attendance Report tab, then they see a list of active Neon users (`is_active = true`) to select from, each disambiguated as specified below, and the period defaults to the current month.
- [ ] Given a server, then the Attendance Report tab is not shown at all — not shown-then-disabled — matching how the Team tab is already gated, and the underlying read is refused server-side too if attempted directly.
- [ ] Given "All" selected, then one section per active user appears, sorted by display name, each showing that person's attendance rows for the period followed by their period total, and a grand total across everyone appears at the bottom.
- [ ] Given specific people selected instead, then only their sections appear, in the same shape, with the grand total scoped to just those people.
- [ ] Given two Neon users with the same `full_name`, then their sections are never confusable — see the disambiguation rule below — and their rows/totals are computed strictly from `attendance.user_id`, never from name matching.
- [ ] Given a selected person with zero attendance rows in the period, then their section still renders (they were explicitly selected) with an explicit "no attendance recorded for this period" state and a period total of zero, which contributes zero to the grand total.
- [ ] Given an attendance row with `clock_out` null and `auto_clocked_out = true`, then the clock-out cell shows an explicit "auto-closed" indicator, never a blank cell.
- [ ] Given an attendance row with `hours_worked` null, then the hours cell shows an explicit "—", the value contributes zero to that person's total (and to the grand total), and the total itself notes that some rows had no recorded hours rather than silently under-stating without explanation.
- [ ] Given the query column list sent to Neon for `users`, then it never includes `pin_hash` — enforced by a named, tested constant, not just written correctly once.
- [ ] Given Neon is unreachable or exceeds the query timeout, then the tab shows a clear "attendance data unavailable" state and every other tab/feature in the app is completely unaffected — proven by the data fetch never being part of initial page load (see Implementation map).

## UX contract

- **Entry point**: a new "Attendance Report" item in the manager-only tab set (desktop nav, mobile bottom nav), gated exactly like Team — rendered only for `isManager`, never shown-then-disabled for a server.
- **Desktop / host tablet**: person multi-select and period selector at the top (checkboxes + an "All" checkbox that syncs with "every person individually checked"); each person's section below as a table (date, clock in, clock out, hours worked) with their total beneath it; grand total at the very bottom.
- **Server mobile**: never reached — the tab isn't shown to a server at all.
- **Loading**: the tab shows a loading state while the active-user list loads, and each time the filters change and a fresh attendance query is in flight (the rows section specifically, not the whole tab, re-shows a loading state on refetch — the person/period controls themselves stay interactive/visible throughout).
- **Empty**: a selected person with no rows in the period — see the acceptance criterion above; the whole tab (no one selected yet) can default to "All" so it's never empty on first open.
- **Error**: a distinct "Attendance data unavailable — try again in a moment" panel in place of the report body, on either the initial active-user load or an attendance-row fetch, with a manual retry action. Never a raw error string, never a stack trace.
- **Success**: n/a beyond the report rendering — this is a read-only view, no submission to confirm.
- **Permission denied**: the tab is not rendered at all for a server, matching Team.
- **Keyboard/screen reader**: checkboxes are real `<input type="checkbox">` elements with associated labels; the period dropdown is a real `<select>` (or an accessible listbox) with a visible label; the custom date range's two date inputs are labeled individually; loading and error states are announced via `aria-live`, matching every other async state in this app.

## Data and authorization

- **Tables/columns**: none new in Supabase. Reads Neon `users(id, full_name, role, phone, created_at, is_active)` — **never `pin_hash`, enforced by a named column-list constant, not a one-time correct query** — and `attendance(id, user_id, date, clock_in, clock_out, hours_worked, auto_clocked_out)`, joined on `attendance.user_id = users.id`.
- **Constraints/indexes**: none — this app has no write access to Neon (the connection string is read-only) and adds no Neon-side schema.
- **Grants/RLS**: Neon is entirely outside this app's Supabase RLS model, by construction — nothing read from it is ever written into any Supabase table, so there is no Postgres row-level policy that could apply to it even in principle. The only authorization check that matters is Supabase-side: is the caller a manager or owner in their own organization. Enforced twice, matching this app's established defense-in-depth pattern for every other manager-only action: the tab is hidden client-side for a server (`isManager`, same check Team already uses), and the Server Action re-checks the caller's designation server-side via `getCurrentUser()` before ever opening a Neon connection — a direct call bypassing the UI is refused the same way a direct passcode-reset call from a non-manager already is.
- **Roles/capabilities**: owner and manager (general_manager) and assistant manager (shift_manager) — the same "full operational access" tier Team, Hours, and every other manager-only surface in this app already uses; a plain server gets nothing.
- **Audit events**: none. This is a read; nothing changes state anywhere. Consistent with the rest of this app, which only audits writes.
- **Idempotency/concurrency**: n/a — every read is independent and re-run on demand; there is nothing to retry-safely mutate.
- **Time-zone behavior**: "This month"/"Previous month" resolve against the restaurant's own configured time zone (the same `zonedWallTimeFromInstant` helper `getScheduleContext` already uses for "today"), not the server's or the browser's local time — a manager checking the report near midnight shouldn't see a month boundary that doesn't match the restaurant's actual calendar day. Neon's `attendance.date` is a plain date column (per the schema you gave), compared directly against the resolved period's start/end dates — no instant-to-wall-time conversion needed on that side, since there's no timestamp to convert, only a date.

## Implementation map

- **Feature modules**: new `src/features/attendance/` — `data/attendance-data.ts` (the Neon query layer: lazy client creation reading `process.env.NEON_DATABASE_URL` inside each call, never at module scope, so a build with the var unset never breaks — matching the exact reason `npm run build` already succeeds in CI today with zero Supabase secrets set; a named `NEON_USER_COLUMNS` constant excluding `pin_hash`, unit-tested directly; a hard query timeout), `domain/` (pure, unit-tested helpers: period-range resolution, name disambiguation, hours aggregation with explicit null handling), `actions/attendance-actions.ts` (two Server Actions, re-checking the caller's designation before touching Neon), `components/attendance-report.tsx` (the tab body), `demo-data.ts` (this feature's own fixture users/attendance rows, including one same-name/different-role pair, kept separate from `src/lib/demo-data.ts` since it's a different shape entirely — Neon rows, not Supabase membership rows).
- **Routes**: none new — both reads go through Server Actions, not Route Handlers, since nothing here needs to run outside the Server Action/RSC request lifecycle the way a Supabase Auth Admin API call does (that's the reason the passcode/team routes are routes, not actions — this has no equivalent constraint).
- **Deliberate deviation from "Server Components perform initial reads" (`docs/ARCHITECTURE.md`)**: every other real-mode feature seeds its initial state from `loadPageData()`/the Server Component render. This one does not — the active-user list and every attendance-row query are fetched **only when the Attendance tab is actually opened**, client-triggered from `AttendanceWorkspace` on mount and on every filter change, never folded into the shared initial page load every tab (including ones a server can see) currently depends on. This is the direct implementation of "a second database being down must never break The Lineup": if Neon were baked into `loadPageData`, a slow or unreachable Neon would slow down or break the _entire app's_ initial page load for everyone, not just the one manager-only tab that actually needs it.
- **New dependency**: `@neondatabase/serverless` (current: `1.1.0`) — Neon's own HTTP-fetch-based driver, purpose-built for exactly this shape of workload (occasional reads from a Vercel serverless function), and avoids the connection-pool-exhaustion problems a traditional TCP client (`pg`) can hit when many serverless function instances each try to hold their own persistent connection. This is a real new dependency, not something existing code can reasonably provide (`@supabase/supabase-js` only talks to Supabase's own PostgREST/Auth endpoints, not an arbitrary external Postgres database) — flagged per `AGENTS.md`'s "do not add a dependency until existing code cannot reasonably solve the requirement," not added reflexively.
- **Query timeout**: a hard timeout on every Neon call (target: 5 seconds — generous for a simple indexed read, tight enough that a manager isn't left waiting on a visibly broken-feeling tab). Exact mechanism (the driver's own abort-signal support versus a `Promise.race` wrapper) confirmed against the installed driver's real API during the build, not asserted here as fact.
- **Generated types**: unaffected — Neon is not part of `supabase gen types`; the two Neon row shapes get their own hand-written TypeScript types in `attendance-data.ts`, matching the schema you confirmed.

## Test plan

- **Unit**: `NEON_USER_COLUMNS` never contains `"pin_hash"`; period-range resolution for This month/Previous month across a real month boundary and in a non-UTC time zone (mirroring `src/lib/timezone.test.ts`'s existing rigor); name disambiguation (`"Full Name (role)"`, falling back to an id-suffix only when both name and role collide, e.g. two identically-labeled "Anil (Server)" rows); hours aggregation with a null `hours_worked` row (contributes zero, doesn't throw, and the "some rows excluded" note is set), an empty row set (zero, no note), and a normal set (exact sum).
- **Component**: the three named edge cases render as specified (zero-attendance section, auto-clocked-out indicator, null-hours cell and total note); the tab is not rendered for a server; the loading and error states appear and recover on retry.
- **Database/RLS**: none needed — Neon has no Supabase RLS surface to test, per Data and authorization above. No new Supabase migration, so no new pgTAP coverage either.
- **Playwright**: manager opens the tab, sees the active user list including the demo duplicate-name pair correctly disambiguated, selects "All," sees every section plus a grand total; selects one person, sees only their section; a server never sees the tab at all (nav assertion, not just a route-guard check).
- **Manual/live verification** (this app's established practice for every feature touching a real external service this session): exercise both Server Actions against the real Neon database using the real `NEON_DATABASE_URL`, confirming the returned rows match what's actually in Neon, that `pin_hash` genuinely never crosses the wire (inspect the actual query/response, not just the column-list constant), that the query timeout genuinely aborts rather than hanging when tested against a deliberately slow/unreachable target, and that a live Neon outage or timeout produces the "unavailable" UI without any other tab or action being affected.

## Rollout and rollback

- **Feature flag**: none — gated the same way every other manager-only surface already is (role check), not a separate flag.
- **Expand/migrate/contract**: n/a — no Supabase schema change, and this app has no write access to Neon to migrate.
- **Backfill**: none.
- **Environment variable rollout** — mirrors `docs/DEPLOYMENT.md`'s existing Production/Preview split exactly, extending its table:

  | Variable            | Production      | Preview |
  | ------------------- | --------------- | ------- |
  | `NEON_DATABASE_URL` | yes (Sensitive) | **no**  |

  **Does it need to be in CI?** No — confirmed by the existing pattern, not a new judgment call: `.github/workflows/ci.yml` already runs `npm run build` today with zero Supabase secrets set, and passes, because every data-layer module reads its connection details from `process.env` lazily inside a function body, never at module load time. `attendance-data.ts` will follow the identical rule, so `npm run build` in CI needs no `NEON_DATABASE_URL` either. It's a **runtime-only** variable: Vercel Production, plus your own local `.env.local` for `npm run dev` (already present).
  `NEON_DATABASE_URL` also gets added to `.env.example` (empty placeholder, matching every other secret already there) so a fresh clone knows the variable exists without ever seeing a real value.

- **Rollback limit**: plain code revert. Nothing persists anywhere on the Supabase side to undo — Neon is never written to, so there's no data migration or backfill to reverse, only the code path that reads it.

## Decisions and risks

- **Decision**: one PR, not split. Every piece here — the Neon client, the domain helpers, the Server Actions, the UI, the demo fixtures — serves exactly one vertical feature with no independently useful sub-piece (unlike Feature 015, where each phase was already a separate, individually demoable module). Splitting it would mean reviewing a data layer with no UI attached, or a UI with no real data behind it. Matches how Features 016 and 017 (each a single cohesive vertical slice) shipped as one PR apiece, with multiple commits inside it.
- **Decision**: the "grand total" behavior described for "All" applies identically when specific people are selected too — a total across whichever sections are currently shown, which degenerates naturally to one person's own total when only one is selected. Your spec said "same, just limited to those sections" for the specific-selection case; this is the literal reading of "same." Flagging the interpretation explicitly rather than assuming silently.
- **Decision**: a row with null `hours_worked` renders as "—", contributes zero to every total it's part of, and the total itself carries a small note when this happened ("N rows have no recorded hours, excluded from this total") rather than silently under-stating a number with no explanation — matches this app's established pattern of naming a gap rather than hiding it (the allocation board's cross-edit log, the passcode rotation worst case, etc.).
- **Risk**: Neon's advertised read-only connection string is trusted to actually be read-only (least-privilege on Neon's side, outside this app's control) — this app adds no extra safeguard against an accidental write beyond simply never issuing one; if that connection string's privileges ever change on the Neon side, this app would not be the thing that notices.
- **Risk, named per "Read before assuming this is greenfield" above**: Neon's flat, tenant-less `users` table means this integration does not extend to a second organization sharing this codebase without a Neon-side schema change first. Accepted for a single-restaurant deployment, the only one that exists today.
- **Risk**: the query timeout's exact enforcement mechanism depends on what `@neondatabase/serverless`'s actual API surface supports (abort signal vs. a wrapper) — asserted as intent here, confirmed against the real, installed driver during the build, not claimed as fact in this spec.
