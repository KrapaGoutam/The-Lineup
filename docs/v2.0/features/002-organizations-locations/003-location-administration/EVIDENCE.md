# Subfeature V2-002.003: Location Administration — Evidence

## 1. Environment & Pre-Flight

- **Integration Branch:** `development`
- **Starting Development SHA:** `23cfa4156b07ecbfc9e17c262182fbbeb7dcc229`
- **Starting Main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-002.003-location-administration`
- **Worktree:** `.tmp/v2-location-administration`
- **GitHub Issue:** [#277](https://github.com/KrapaGoutam/The-Lineup/issues/277)
- **Parent Issue:** [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250)
- **Program Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)
- **Milestone:** The Lineup V2.0 (#8)
- **Supabase Dev Project:** `opmujepkemwcdxxorhfd`
- **Production Guard:** `ftadewtkjlaotfdvtjcv` (Strictly Prohibited; untouched)

---

## 2. Baseline Verification

- **Remote Auth Verification:** Process-local mapping of `LINEUP_SUPABASE_ACCESS_TOKEN`. CLI default account NOT trusted.
- **Hosted DEV Migration List:** 68 migrations in sync through `20261103050000_location_model_foundation.sql`.
- **Vitest Baseline:** 179 test files, 2,433 tests passed, 0 failures, 7 skipped.
- **pgTAP Baseline:** 57 test files, 1,759 assertions passed, 0 failures.
- **Next.js Build Baseline:** Compiled successfully with dynamic and static routes.
- **Code Quality Baseline:** `check:local-paths`, `format:check`, `lint` (0 warnings), `typecheck` (0 errors) all passed.

---

## 3. Database Migration Decision

**NO NEW SCHEMA MIGRATION REQUIRED.**  
All required database constructs (tables `locations`, `operating_hours`, `organizations`, `memberships`, triggers, RLS policies, and RPC `provision_location`) are already fully deployed and verified on hosted DEV `opmujepkemwcdxxorhfd`.

---

## 4. Implementation Log & Files Changed

### Created Files:

1. `src/features/locations/actions/location-admin-actions.ts`:
   - Server Action adapters: `getLocationAdminContextAction`, `listLocationsForAdminAction`, `provisionLocationAction`, `updateLocationDetailsAction`, `getLocationOperatingHoursAction`, `updateLocationOperatingHoursAction`.
   - Security verification: `verifyLocationAdminAuthority` enforces session authentication, role checks (Overall Owner/Manager or Org Owner/General Manager), and tenant isolation.
2. `src/features/locations/actions/location-admin-actions.test.ts`:
   - 17 unit tests verifying authentication failure, authorization hierarchy (overall roles vs org roles), cross-organization protection, validation errors, and happy-path operations.
3. `src/features/locations/components/location-time-zone-select.tsx`:
   - IANA time zone selector providing prioritized common American zones plus full `Intl.supportedValuesOf("timeZone")` searchable list.
4. `src/features/locations/components/location-operating-hours-editor.tsx`:
   - 7-day schedule editor (Sunday through Saturday), closed toggles, wall-clock time pickers, overnight closure indicators ("Closes next day"), validation and save error recovery.
5. `src/features/locations/components/location-operating-hours-editor.test.tsx`:
   - 6 component tests covering initial render, closed toggle, time edits, overnight badge, and save action.
6. `src/features/locations/components/location-form.tsx`:
   - Create and edit branch form, address fields (line1, line2, city, region, postalCode, countryCode), time zone selector, cover weight slider/input, fallback hours, duplicate submit prevention.
7. `src/features/locations/components/location-form.test.tsx`:
   - 6 component tests covering valid submission, field errors, duplicate name conflict handling, hydration in edit mode.
8. `src/features/locations/components/location-list.tsx`:
   - Deterministic sorting (active first, then alphabetical by name), address summaries, time zone and hours display, search filter, empty state with Add Location CTA.
9. `src/features/locations/components/location-administration.tsx`:
   - Coordinator component: organization selector for multi-org managers, auto-selected organization for single-org managers, locations grid, Add Location modal, Manage Location modal with Details & Hours tabs, demo mode support.
10. `src/features/locations/components/location-administration.test.tsx`:
    - 7 component tests verifying organization listing, location listing, search filtering, Add Location flow, and Manage Location tab switching.
11. `tests/e2e/location-administration.spec.ts`:
    - Playwright E2E browser tests: manager navigation from Settings -> Locations, branch creation in demo mode, branch inspection and operating hours tabs, and staff access denial (card absent).

### Modified Files:

1. `src/features/settings/components/settings-page.tsx`:
   - Added `subview: "main" | "locations"` state.
   - Added Locations QuickLinkCard (`#settings-locations`) and navItem for managers.
   - Seamless navigation into `LocationAdministration` and back.
2. `src/features/settings/components/settings-page.test.tsx`:
   - Updated component tests to verify Locations card visibility for managers and absence for staff.
3. `src/components/ui/dialog.tsx`:
   - Added defensive check for environments (jsdom) lacking native `showModal`/`close`.
4. `playwright.config.ts`:
   - Added `--webpack` flag to `webServer.command` to ensure reliable build and hot reload under Windows.

---

## 5. Verification & Test Evidence

### Vitest Suite:

```
Test Files  183 passed (183)
     Tests  2470 passed | 7 skipped (2477)
  Duration  15.56s
```

### Locations & Settings Component/Unit Tests:

```
✓ src/features/locations/domain/location.test.ts (23 tests)
✓ src/features/locations/data/location-mutation.test.ts (15 tests)
✓ src/features/locations/data/location-reader.test.ts (11 tests)
✓ src/features/locations/actions/location-admin-actions.test.ts (17 tests)
✓ src/features/locations/components/location-operating-hours-editor.test.tsx (6 tests)
✓ src/features/locations/components/location-form.test.tsx (6 tests)
✓ src/features/locations/components/location-administration.test.tsx (7 tests)
✓ src/features/settings/components/settings-page.test.tsx (4 tests)
✓ src/features/settings/components/store-hours-grid.test.tsx (3 tests)
✓ src/features/settings/components/shift-hours-card.test.tsx (2 tests)
✓ src/features/settings/components/pay-rates-section.test.tsx (2 tests)
Total: 11 test files, 96 passed
```

### pgTAP Database Tests:

```
Files=57, Tests=1759, 11 wallclock secs
Result: PASS
```

### Playwright E2E Tests:

```
tests/e2e/location-administration.spec.ts:
- desktop: 4 passed
- host-tablet: 4 passed
- server-mobile: 4 passed

tests/e2e/settings.spec.ts:
- 9 passed (desktop, host-tablet, server-mobile)
```

### Quality Gates:

- `npm run check:local-paths`: OK
- `npm run check:env --scan .next`: OK (no references to production Supabase ref `ftadewtkjlaotfdvtjcv`)
- `npm run format:check`: OK (All matched files use Prettier code style)
- `npm run lint`: OK (0 warnings, 0 errors)
- `npm run typecheck`: OK (0 errors)
- `npx next build --webpack`: Compiled successfully in 10.9s (all 13 routes generated)
