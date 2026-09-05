# Feature Roadmap

Each item is one or more vertical pull requests. Create `docs/features/<slug>.md` before implementation.

## Phase 0 — Foundation

- [x] Project scaffold, pinned dependencies, agent contracts, CI, and design direction
- [x] Initial domain schema and RLS baseline
- [x] Pure rotation recommendation engine and unit tests
- [ ] Link a new Supabase project and generate types
- [ ] Link a new GitHub repository and Vercel project

## Phase 1 — Shared foundation

1. [x] Restaurant-scoped passcode shell, access request UI, role modes, hours, local clock, and countdown
2. [ ] Link hosted Supabase and create the first owner/invite through the setup runbook

## Phase 2 — Three operational modules

3. [x] Weekly/monthly Morning, Evening, and Full Day roster with defaults, optional overrides/ranges, and publish state
4. [x] Flexible table-allocation columns, auto rows, employee self-column entry, manager clear, undo, and redo
5. [x] Interval-based tip split with active-floor suggestion, cent accuracy, manager controls, and employee-own estimate
6. [ ] Connect the interactive reference UI to hosted Supabase mutations and Realtime subscriptions

## Phase 5 — Pilot hardening

7. Accessibility and host-stand field test
8. Performance/load test for concurrent board writes
9. Backup, recovery, usage monitoring, and incident runbook
10. CSV/PDF export and configurable restaurant policies

## Deferred (spec written, not scheduled)

- [ ] Light/dark theme toggle — `docs/features/012-theme-toggle.md`. Spec only; a light palette doesn't exist yet in `globals.css` and needs designing before this can be built, not just a toggle wired up.
- [ ] Virtual numeric keypad on login — `docs/features/013-virtual-numeric-keypad.md`. Spec only; additive alongside the typed passcode input, not a replacement.

POS, reservations, payroll, SMS, and native apps require separate product discovery after pilot evidence.
