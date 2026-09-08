# Current Task: Feature 023 — Settings Consolidation

**Active Spec:** `docs/features/023-settings-consolidation.md`
**Reference:** `design-system-reference.html` section `2d` ("Full Settings Page")
**Branch:** `feature/023-settings-consolidation` (off `feature/022-app-shell-brand-and-nav-hierarchy`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer for this feature, per user request)

## 🎯 Objective

Replace the placeholder "Settings" button (which currently just opens the
shift/store-hours edit dialog) with a real, dedicated Settings **page**
(`tab === "settings"`, same architecture as every other section of this
app — no new client-side router, matching how Schedule/Allocation/Team/
etc. already work) that consolidates: Shift hours, Store hours (Sun–Sat),
Team (link), Schedule (link), Pay rates, Passcode, Appearance, Sign out.

## 🔒 Non-negotiable constraints (from AGENTS.md + this task's brief)

- No new server actions that duplicate payroll calculation or attendance
  ledger logic. The Pay Rates section reuses Feature 020's existing
  rate-configuration actions (`getPayrollRateOptionsAction`,
  `setPayrollDefaultRateAction`, `setPayrollRateOverrideAction`,
  `removePayrollRateOverrideAction`) and its existing `RateSettings` UI
  (exported, not reimplemented) — never payroll ledger/balance code.
- No changes to tenant scoping (`organization_id`), Supabase RLS, or
  Feature 019 attendance scoping.
- Brand text is always "The Monk's" (never "ServiceFlow").
- 44px minimum touch targets; `font-mono tabular-nums` on any time/rate
  digits, matching the rest of the app.
- Store/shift hours persistence already exists (`saveScheduleConfig` via
  `HoursDialog`, which already updates the live header countdown through
  the same `operatingHours`/`shiftDefaults` state `useRestaurantClock`
  reads) — Settings reuses that save path unchanged, it does not add a
  second one.

## 📖 Reconciliations (spec text vs. actual app — resolved before coding)

1. **"Page" means `tab === "settings"`, not a new URL route.** This app
   has no per-tab routing today (Schedule/Allocation/Team/etc. are all
   client `tab` state, not `next/navigation` segments) — introducing real
   `/settings` routing for just this one tab would be an inconsistent,
   out-of-scope architecture change. "Dedicated page not a modal" is
   satisfied by giving Settings the same full-`<main>`, non-modal
   treatment every other tab already has.
2. **Pay Rates is per-person + an org default, not "Server/Host/Busser/
   Manager" role-rate table.** The spec's scope bullet says "standard
   roles"; both the actual Feature 020 data model (`PayrollRateOptions`:
   one org default + per-`neonUserId` overrides) and the reference
   mockup's section `2d` show per-person rows with a role label next to
   the name, not per-role rate configuration. Implementing the literal
   "per-role" reading would mean inventing a second, disconnected rate
   system. Settings' Pay Rates section reuses the real one.
3. **Pay Rates section is `isManager && !demoMode`.** Not called out
   explicitly in the acceptance criteria, but `getPayrollRateOptionsAction`
   requires a real manager session (`requirePayrollManager`) and demo mode
   has no Neon-backed data source for payroll — this is the exact same
   gate the Payroll tab itself already uses (Feature 020 Phase 2).
4. **"Read-only store hours" for staff = the 7-day grid only, no Shift
   Hours card, no Edit button.** Per acceptance criterion 3, staff see
   Passcode/Appearance/Sign out + read-only store hours — not the Shift
   Hours defaults card at all (that's an operational/manager concern).

## 🛠️ Implementation Steps

- [x] **Step 0: Branch hygiene** — finish the interrupted brand edit found
      uncommitted on `feature/022` (duplicate import + duplicated JSX in
      `login-screen.tsx`, stray lint-disable removal in
      `restaurant-operations-app.tsx`), commit it to `feature/022`, push,
      then branch `feature/023-settings-consolidation` off it.
- [x] **Step 1: This task file** — populate and commit before any app code.
- [x] **Step 2: Pure presentational building blocks**
  (`src/features/settings/components/`)
  - [x] `store-hours-grid.tsx` — `StoreHoursGrid({ hours, todayIndex })`:
        7-day (Sun–Sat) grid, today's cell highlighted with `--primary`,
        closed days shown as "Closed". Pure, no fetching, no actions.
  - [x] `shift-hours-card.tsx` — `ShiftHoursCard({ shiftDefaults, onEdit })`:
        Morning/Evening/Full day defaults display + an "Edit" button that
        calls the passed-in `onEdit` (opens the existing `HoursDialog` —
        no new dialog).
  - [x] Unit tests for both (rendering, today-highlight, closed state).
- [ ] **Step 3: Pay Rates section** (isolated payroll reuse)
  - [ ] Export `RateSettings` from
        `src/features/payroll/components/payroll-workspace.tsx` (adds one
        `export` keyword; zero behavior change to Payroll itself).
  - [ ] `src/features/settings/components/pay-rates-section.tsx`: self-
        contained — fetches `getPayrollRateOptionsAction`, handles
        loading/error/retry, renders the reused `RateSettings`. This file
        is the only place Settings touches anything under
        `src/features/payroll/`.
  - [ ] Unit test: loading → renders `RateSettings` with fetched options;
        error → shows retry.
- [ ] **Step 4: `settings-page.tsx`** — composes everything by role:
  - Header: back button (→ `allocation`, same "Home" semantics as the
    brand logo elsewhere) + "Settings" + "The Monk's · {timeZone}".
  - Manager: Shift Hours card, Store Hours grid (editable), Team quick-
    link card, Schedule quick-link card, Pay Rates section (skipped in
    demo mode), Passcode card, Appearance card, Sign out.
  - Staff: Store Hours grid (read-only, no Edit button), Passcode card,
    Appearance card, Sign out. Nothing else.
  - All callbacks (`onEditHours`, `onChangePasscode`, `onGoToTab`,
    `onSignOut`, `onBack`) are passed in from `restaurant-operations-app.tsx`
    — this component owns no state of its own beyond what it's given,
    and calls zero server actions directly except through
    `PayRatesSection`.
  - [ ] Unit tests: manager sees all 5 configuration cards + account
        section; staff sees only the account section + read-only store
        hours; demo-mode manager doesn't see Pay Rates.
- [ ] **Step 5: Wire into the app shell** (`restaurant-operations-app.tsx`)
  - [ ] Add `"settings"` to the `AppTab` union.
  - [ ] Render `<SettingsPage ... />` in the `<main>` tab-switch block.
  - [ ] Desktop row 2 "Settings" button: `setShowHours(true)` →
        `setTab("settings")`; drop the `isManager` gate (button is now
        universal — the page itself gates content by role).
  - [ ] Mobile mini avatar panel "Settings" button: same retarget, same
        gate removal.
  - [ ] Mobile "More" sheet's Settings item: same retarget, gate removal,
        neutral subtitle (no longer "Shift hours, store hours" — that's
        manager-only content now).
  - [ ] Desktop avatar panel "More options" button: retarget from
        `openHours` to a new `openSettingsPage` helper
        (`setTab("settings")` + close both panels). The avatar panel's
        "Edit" (shift hours) and "Store hours" quick-shortcuts keep
        calling `openHours` unchanged — the spec's own User Outcome says
        quick mid-shift adjustments stay one click from the avatar menu.
  - [ ] Full validation gate (`npm run check`, `npm test`, `npm run build`).
- [ ] **Step 6: E2E flow** (`tests/e2e/settings.spec.ts`)
  - [ ] Sign in as manager → open Settings from the nav → see Shift
        Hours/Store Hours/Pay Rates/Team/Schedule cards.
  - [ ] Edit store hours from Settings, confirm the header countdown
        pill's underlying value changes (persistence round-trip).
  - [ ] Sign in as server → open Settings → confirm Team/Schedule/Pay
        Rates/Shift-Hours are absent, store hours is read-only.
- [ ] **Step 7: Docs**
  - [ ] Check off acceptance criteria in
        `docs/features/023-settings-consolidation.md`.
  - [ ] Update `docs/STATUS.md` milestone/feature table.
- [ ] **Step 8: Push branch, open PR, paste gate output + PR link here.**

## 🧪 Validation gate (run before every commit)

```
npm run check   # prettier --check, eslint --max-warnings=0, tsc --noEmit
npm test        # vitest run
npm run build   # next build
```

`npm run test:e2e` runs once at the end (Step 6/8), not before every
intermediate commit — it boots a real dev server and is slower; the spec's
E2E ask is satisfied at the point the full flow actually exists to test.

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `src/features/settings/components/store-hours-grid.tsx` (new)
- `src/features/settings/components/store-hours-grid.test.tsx` (new)
- `src/features/settings/components/shift-hours-card.tsx` (new)
- `src/features/settings/components/shift-hours-card.test.tsx` (new)
- `src/features/settings/components/pay-rates-section.tsx` (new)
- `src/features/settings/components/pay-rates-section.test.tsx` (new)
- `src/features/settings/components/settings-page.tsx` (new)
- `src/features/settings/components/settings-page.test.tsx` (new)
- `src/features/payroll/components/payroll-workspace.tsx` (export `RateSettings`)
- `src/components/restaurant-operations-app.tsx` (nav wiring)
- `tests/e2e/settings.spec.ts` (new)
- `docs/features/023-settings-consolidation.md` (checkboxes)
- `docs/STATUS.md` (milestone update)

## Current State & Next Step

Branch created, this file committed. Next: Step 2 (store-hours-grid.tsx,
shift-hours-card.tsx + tests).
