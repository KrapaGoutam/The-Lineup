# Feature Roadmap

Each item is one or more vertical pull requests. Create `docs/features/<slug>.md` before implementation.

## Phase 0 — Foundation

- [x] Project scaffold, pinned dependencies, agent contracts, CI, and design direction
- [x] Initial domain schema and RLS baseline
- [x] Pure rotation recommendation engine and unit tests
- [ ] Link a new Supabase project and generate types
- [ ] Link a new GitHub repository and Vercel project

## Phase 1 — Shared foundation

1. [x] Restaurant-scoped passcode shell, role modes, hours, local clock, and countdown (self-serve registration replaced the original manager-reviewed access request UI — see Phase 3, Feature 005)
2. [ ] Link hosted Supabase and create the first owner/invite through the setup runbook

## Phase 2 — Three operational modules

3. [x] Weekly/monthly Morning, Evening, and Full Day roster with defaults, optional overrides/ranges, and publish state
4. [x] Flexible table-allocation columns, auto rows, manager clear, undo, and redo (any-column writes replaced the original employee-self-column-only rule — see Phase 3, Feature 011)
5. [x] Interval-based tip split with active-floor suggestion, cent accuracy, manager controls, and employee-own estimate
6. [ ] Connect the interactive reference UI to hosted Supabase mutations and Realtime subscriptions

## Phase 3 — Post-MVP scope changes

11. [x] Self-serve registration with immediate active-server membership and manager/owner role promotion (Feature 005)
12. [x] Four-digit passcodes with a degrading, exemptible organization-wide rate limit and manager-clearable lockout (Feature 006)
13. [x] Bulk schedule CSV import: template, preview, per-row errors, draft-only commit (Feature 008)
14. [x] Add any active employee to the rotation, scheduled or not (Feature 009)
15. [x] Reorder servers in the live rotation without disturbing recorded rounds (Feature 010)
16. [x] Drop the self-or-manager write restriction on the allocation board; any-column edits require a reason for cross-column writes; the board locks once tips are finalized until a manager/owner reopens it (Feature 011)
17. [ ] Mobile/tablet responsive pass, including the allocation board's narrow-screen restructure (Feature 007 — specced, not yet implemented)

## Phase 5 — Pilot hardening

7. Accessibility and host-stand field test
8. Performance/load test for concurrent board writes
9. Backup, recovery, usage monitoring, and incident runbook
10. CSV/PDF export and configurable restaurant policies

## Deferred (spec written, not scheduled)

- [ ] Light/dark theme toggle — `docs/features/012-theme-toggle.md`. Spec only; a light palette doesn't exist yet in `globals.css` and needs designing before this can be built, not just a toggle wired up.
- [ ] Virtual numeric keypad on login — `docs/features/013-virtual-numeric-keypad.md`. Spec only; additive alongside the typed passcode input, not a replacement.

POS, reservations, payroll, SMS, and native apps require separate product discovery after pilot evidence.
