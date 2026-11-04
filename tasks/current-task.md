# V2-002.003 — Location Administration

Approved Subfeature: Manager/Owner UI for provisioning and configuring branches.
Canonical docs: `docs/v2.0/features/002-organizations-locations/003-location-administration/`
Parent Feature: Issue #250 (`[V2-002] Organizations & Locations`)
Parent Milestone: Issue #248 (`The Lineup V2.0` / Milestone #8)
Subfeature Issue: Issue #277 (`[V2-002.003] Location Administration`)
Prerequisites:

- V2-002.001 Organization Model (PR #274 merged)
- V2-002.002 Location Model (PR #276 merged at `23cfa4156b07ecbfc9e17c262182fbbeb7dcc229`)
  Branch: `feature/v2.0-002.003-location-administration` (from `origin/development` at `23cfa4156b07ecbfc9e17c262182fbbeb7dcc229`)
  Worktree: `.tmp/v2-location-administration`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`23cfa4156b07ecbfc9e17c262182fbbeb7dcc229` dev, `5e5b7747693b6e81014eafdf299b87e56c3f033d` main), isolated worktree created (`.tmp/v2-location-administration`), branch `feature/v2.0-002.003-location-administration`
- [x] Subfeature issue created: #277 under Milestone #8, linked to #250 and #248
- [x] Hosted DEV baseline verified: linked to `opmujepkemwcdxxorhfd`, 68 migrations in sync through `20261103050000`
- [x] Baseline test verification: 179 Vitest files (2,433 tests passed) and 57 pgTAP files (1,759 assertions passed)
- [x] Baseline quality gates: format, lint, typecheck, next build all green
- [x] Initialize canonical feature documentation: `PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md` in `docs/v2.0/features/002-organizations-locations/003-location-administration/`
- [x] Implement Server Action adapters: `src/features/locations/actions/location-admin-actions.ts`
  - [x] `getLocationAdminContextAction`: server-authoritative check for administrable organizations
  - [x] `listLocationsForAdminAction`: fetch locations for authorized organization
  - [x] `provisionLocationAction`: secure branch provisioning via existing RPC
  - [x] `updateLocationDetailsAction`: secure metadata update via existing mutation
  - [x] `getLocationOperatingHoursAction`: fetch 7-day schedule
  - [x] `updateLocationOperatingHoursAction`: update 7-day schedule with overnight and closed-day support
  - [x] Unit tests for server actions: `location-admin-actions.test.ts` (17 tests passing)
- [x] Implement UI Components in `src/features/locations/components/`:
  - [x] `location-administration.tsx`: main management view with org picker, search, cards, empty/loading/error states
  - [x] `location-list.tsx`: list and card view with active/inactive status and address summaries
  - [x] `location-form.tsx`: create and edit location form with name, address, IANA timezone selector, operating defaults
  - [x] `location-operating-hours-editor.tsx`: 7-day weekly schedule editor with closed days and overnight indicator
  - [x] Unit & component tests: `location-administration.test.tsx` (7 tests), `location-form.test.tsx` (6 tests), `location-operating-hours-editor.test.tsx` (6 tests)
- [x] Integrate into Settings & App Shell navigation:
  - [x] `src/features/settings/components/settings-page.tsx`: add Locations quick link card and subview navigation
  - [x] Responsive behavior for desktop, tablet, and mobile
  - [x] Light and dark theme compatibility
  - [x] Accessibility: labels, aria attributes, keyboard navigation, focus management
- [x] Browser E2E tests:
  - [x] `tests/e2e/location-administration.spec.ts` (4 tests passing across desktop, tablet, and mobile)
  - [x] `tests/e2e/settings.spec.ts` (9 tests passing across all viewports)
- [x] Run full validation suite:
  - [x] Vitest unit & component tests (183 files, 2,470 passed)
  - [x] pgTAP database security tests (57 files, 1,759 passed)
  - [x] Playwright E2E tests (all green across desktop, tablet, mobile)
  - [x] Formatting, linting (0 warnings), typecheck (0 errors), Next.js build (compiled successfully)
- [x] Update roadmap and status documentation:
  - [x] `docs/v2.0/CURRENT_STATE.md`
  - [x] `docs/v2.0/ROADMAP.md`
  - [x] `docs/v2.0/features/002-organizations-locations/STATUS.md`
- [ ] Commit, push branch, open Pull Request targeting `development`
- [ ] Exact-head CI green verification
- [ ] Merge commit into `development` and closeout
