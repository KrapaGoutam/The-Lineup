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
2. [x] Link hosted Supabase and create the first owner/invite through the setup runbook (Feature 015, Phase A)

## Phase 2 — Three operational modules

3. [x] Weekly/monthly Morning, Evening, and Full Day roster with defaults, optional overrides/ranges, and publish state
4. [x] Flexible table-allocation columns, auto rows, manager clear, undo, and redo (any-column writes replaced the original employee-self-column-only rule — see Phase 3, Feature 011)
5. [x] Interval-based tip split with active-floor suggestion, cent accuracy, manager controls, and employee-own estimate
6. [x] Connect the interactive reference UI to hosted Supabase mutations and Realtime subscriptions (Feature 015, Phases B–E — schedule, table allocation (the first module with a live Realtime subscription), tips, registration, team designations, and CSV import all wired)

## Phase 3 — Post-MVP scope changes

11. [x] Self-serve registration with immediate active-server membership and manager/owner role promotion (Feature 005)
12. [x] Four-digit passcodes with a degrading, exemptible organization-wide rate limit and manager-clearable lockout (Feature 006)
13. [x] Bulk schedule CSV import: template, preview, per-row errors, draft-only commit (Feature 008)
14. [x] Add any active employee to the rotation, scheduled or not (Feature 009)
15. [x] Reorder servers in the live rotation without disturbing recorded rounds (Feature 010)
16. [x] Drop the self-or-manager write restriction on the allocation board; cross-column edits are always attributed with no reason mechanism (revised twice post-ship); the board locks once tips are finalized until a manager/owner reopens it (Feature 011)
17. [ ] Mobile/tablet responsive pass, including the allocation board's narrow-screen restructure (Feature 007 — specced, not yet implemented)
18. [x] Light/dark theme toggle, persisted, OS-preference-aware on first visit, full contrast-audited light palette including all seven server accents (Feature 012)
19. [x] Virtual numeric keypad on login, additive alongside the typed passcode input, tablet/phone only (Feature 013)
20. [x] Team designations — Owner/Manager/Assistant Manager/Staff, a label over the existing role model with Manager and Assistant Manager granted identical full permissions (Feature 014)

## Table Allocation V2 — Part 1 (NOW)

Tracking: parent #101, milestone "Table Allocation V2 — Part 1", Project #4. Plan and evidence: `docs/features/table-rotation-multi-view/`.

| Stage   | State                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NOW     | Final gate: CI on the feature PR, merge into `development`                                                                              |
| DONE    | 1A database integrity · 1B trusted mutations · 1C read model · 1D undo/redo · 1E client/realtime · 1F real-mode validation (see report) |
| NEXT    | Reconcile PROD parity and release flow (#111, #112, #113) before any promotion to `main`                                                |
| LATER   | Part 2 — multiple organizations/branches, per-location module availability, internal attendance (see backlog)                           |
| BLOCKED | Production parity: expected Supabase project not reachable from this tooling context (#111)                                             |

### Backlog (deferred on purpose — do not start inside Part 1)

- #106 `private.has_org_role` still honors `organizations.created_by` (board mutation path already membership-only).
- Rotate the Neon attendance credential (DEV `NEON_DATABASE_URL` equals PROD's; operator task).
- Picker taking over a held table with explicit confirmation (today it points to Floor Transfer).
- Hosted real-mode suites (`npm run test:real`, `test:real:ui`) in a protected CI job with DEV secrets.
- Part 2: user → organization membership → location access; per-location module toggles (Table Rotation, Tips); Attendance = External / Internal The Lineup / Disabled with Clock In/Out.

## Phase 5 — Pilot hardening

7. Accessibility and host-stand field test
8. Performance/load test for concurrent board writes
9. Backup, recovery, usage monitoring, and incident runbook
10. CSV/PDF export and configurable restaurant policies

POS, reservations, payroll, SMS, and native apps require separate product discovery after pilot evidence.
