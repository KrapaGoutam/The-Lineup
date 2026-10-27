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

## Table Allocation V2 — Part 1 (DONE on `development`; `main` awaits approval)

Tracking: parent #101, milestone "Table Allocation V2 — Part 1", Project #4. Plan and evidence: `docs/features/table-rotation-multi-view/`.

| Stage   | State                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DONE    | Merged into `development` (PR #131, `589b470`); issues #101–#105, #107, #108, #110, #129 closed; milestone closed                                            |
| DONE    | 1A database integrity · 1B trusted mutations · 1C read model · 1D undo/redo · 1E client/realtime · 1F real-mode validation (see report)                      |
| DONE    | Since Part 1: Tasks V1, #134 production-build Realtime fix, #109 Table Allocation UX consistency (below). Infrastructure (#111–#113) is PR #135 — still open |
| PART 2  | Multi-organization / multi-location, per-location modules, internal Attendance / Clock In-Out                                                                |
| PART 3  | MCP / AI integration                                                                                                                                         |
| BLOCKED | Production parity: expected Supabase project not reachable from this tooling context (#111)                                                                  |

### Backlog (deferred on purpose — do not start inside Part 1)

- #106 `private.has_org_role` still honors `organizations.created_by` (board mutation path already membership-only).
- Rotate the Neon attendance credential (DEV `NEON_DATABASE_URL` equals PROD's; operator task).
- ~~Picker taking over a held table with explicit confirmation~~ — done in #153: every assignment origin shares one Transfer / End + Assign / Cancel dialog.
- Hosted real-mode suites (`npm run test:real`, `test:real:ui`) in a protected CI job with DEV secrets.
- Part 2: user → organization membership → location access; per-location module toggles (Table Rotation, Tips); Attendance = External / Internal The Lineup / Disabled with Clock In/Out.

## Tasks V1, #134, #109 (DONE on `development`; `main` awaits approval)

Tracking: Tasks parent #136 (closed), milestone "Tasks V1" (closed), T1–T8 = #137–#144 (closed), Project #4 Done. Merged via PR #145 (merge commit `4c393d3`). Plan and evidence: `docs/features/tasks-v1/`.

| Stage           | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DONE            | ✅ Table Rotation V2 Part 1 · ✅ Tasks V1 · ✅ #134 production-build Realtime fix (PR #147, merge commit `50fbd02`) · ✅ #109 Table Allocation UX consistency (PR #149, merge commit `a34af14`) · ✅ #153 Table Allocation cross-view integrity & conflict actions (PR #156, merge commit `aaf11f0`) · ✅ PR #135 DEV Preview & CI reliability (merge commit `23e38a9`, #133 closed) · ✅ Numeric Grid input → canonical physical table (#157, PR #158, merge commit `f8fa191`) |
| PLANNED / NEXT  | ⬜ #154 Tasks notifications — Opening / Closing only · ⬜ #155 Tips V2 — Corrections, History & Analytics · DONE: ✅ release-readiness audit — **NO-GO** (2026-10-26; PROD migration path broken #111/#161, release skew #113; see `docs/releases/release-readiness-2026-10/`) · NEXT: ⬜ clear release conditions C1–C8; `main` = owner approval only                                                                                                                          |
| PART 2          | ⬜ multi-org / multi-location / module configuration / internal attendance                                                                                                                                                                                                                                                                                                                                                                                                      |
| PART 3          | ⬜ MCP / AI integration                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| TASKS DEFERRALS | custom recurrence intervals, per-org categories, everyone-on-shift, automatic shift handoff, manager verification, per-assignee completion, push/email/SMS, Realtime invalidation after #134 (see `tasks/backlog.md`)                                                                                                                                                                                                                                                           |

## Next development cycle (owner order, set 2026-10-26)

Production release **complete** (PR #163, `main` `d08eb4e`). Everything below is on `development`; nothing here is released.

| #   | Item                                                                                                                                                               | State                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Table Allocation — same-server repeat-table lifecycle** (#166, PR #167, merge commit `a9a1edf`; plan/evidence `docs/features/same-server-repeat-table/`)         | ✅ merged into `development` (DEV migration `20261026150000`; PROD not touched)                                                                                                                                                      |
| 2   | **Bar Inventory V1** (#168) — Dashboard · Inventory · Manage, vendors, CSV/XLSX import/export, column filters, history, analytics, vendor ordering recommendations | 🔧 **IN BUILD** — decisions D1–D8 locked, BI-0 → BI-2 merged, BI-3 (table kit, column filters, Inventory view) PR open (`docs/features/bar-inventory-v1/`); phases BI-4 → BI-11 via `feature/bar-inventory-*` PRs into `development` |
| 3   | **Tasks Today — management staff visibility** (#169) — All Staff / My Tasks / per person, staff name on each task                                                  | 📋 planned, tracked only                                                                                                                                                                                                             |
| 4   | **Tips V2** (#155) — corrections, history, analytics                                                                                                               | 📋 planned (unchanged)                                                                                                                                                                                                               |

Infrastructure follow-ups (independent of the product order): #111 `deploy-migrations` · #113 migration/app sequencing · #164 deferred Production smoke checks. Bar Inventory's **release phase is blocked on #111/#113**; its build phases are not.

## Infrastructure — DEV Preview & CI Reliability (ACTIVE / RELEASE PREP)

Tracking: parent #133, milestone "Platform / CI Reliability", Project #4, PR #135 (open, not merged). Plan and evidence: `docs/features/dev-preview-ci-reliability/`. PR #135 is **not Done until merged**: it is reconciled with `development` and waits on the owner's manual Preview smoke gate.

| Stage  | State                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ACTIVE | 🟡 PR #135 DEV Preview / CI Reliability — INFRA-A Preview/Dev → DEV · INFRA-B Database CI registry · INFRA-C guards · INFRA-D docs/tracking |
| NEXT   | ⬜ Release-readiness review (separate step; then the owner decides `development → main`)                                                    |
| PART 2 | ⬜ multi-org · multi-location / branches · module configuration · internal attendance                                                       |
| PART 3 | ⬜ MCP / AI integration                                                                                                                     |

## Phase 5 — Pilot hardening

7. Accessibility and host-stand field test
8. Performance/load test for concurrent board writes
9. Backup, recovery, usage monitoring, and incident runbook
10. CSV/PDF export and configurable restaurant policies

POS, reservations, payroll, SMS, and native apps require separate product discovery after pilot evidence.
