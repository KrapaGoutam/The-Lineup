# Feature 023 — Settings Consolidation

**Name:** Settings Consolidation  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Adds a dedicated full Settings page layout (`src/features/settings/`) with card sections; modifies `src/components/restaurant-operations-app.tsx` navigation and consolidates fragmented modal triggers into one organized screen.
- **Contradiction Flags:** Brand is "The Monk's" (ignore "ServiceFlow" in mockups).
- **Session Scope:** Own-session build.

## Page vs Modal Recommendation

**Recommendation: Dedicated Page (not a modal).**  
**Rationale:**

1. **Scope & Hierarchy:** Settings houses complex multi-record domains: a full 7-day Store Hours grid, Shift Hours, Organization Pay Rates, Team management, Schedule management, and Passcode security. Embedding these in a modal forces cramped nested dialogs (e.g. editing a team member or importing a schedule from inside a settings modal).
2. **Mobile Usability:** On 375px/390px viewports, tall modals cause scroll chaining and virtual keyboard occlusion when editing numerical inputs (pay rates, passcodes, store hours). A dedicated page with vertical scrolling provides an uncompromised mobile experience.
3. **Deep Linking & Back Navigation:** Managers frequently need to navigate directly to `/settings` (or return via browser back button). A dedicated page integrates cleanly with browser history.
4. **Reference Mockup Alignment:** Section 2d in `design-system-reference.html` defines a dedicated full Settings page reached via the avatar quick panel's "More options" action.

## User Outcome

Managers and staff access a consolidated, structured Settings page. Quick operational adjustments (appearance, mid-shift hours) remain reachable via the top-right avatar menu, while administrative configurations (default shift hours, 7-day store hours, pay rates, team roster, schedule, and account passcodes) are organized into clear card sections on a dedicated page.

## Scope

- **In:**
  - Dedicated full Settings page with left navigation / tab categories and right content cards (matching Section 2d layout reference).
  - Shift hours configuration (day start, mid-shift cutoffs, closing time).
  - Store hours grid (displaying Sunday through Saturday open/close times, timezone aware for America/Chicago).
  - Quick action cards linking to or embedding Schedule management and Team management.
  - Organization Pay Rates section (view and manage standard roles: Server, Host, Busser, Manager).
  - Passcode management section (change own passcode; for managers, reset staff passcodes via Feature 024).
  - Appearance toggle (Light / Dark) and Sign out action.
- **Out:**
  - Modifying table allocation logic or payroll calculations.
  - Adding new unapproved roles or external integrations.

## Acceptance Criteria

- [ ] Given a user on any screen, clicking "Settings" in the navigation or "More options" in the avatar quick panel opens the dedicated Settings page.
- [ ] Given a manager, they see configuration cards for Shift Hours, Store Hours (Sun–Sat), Pay Rates, Team, and Schedule.
- [ ] Given a regular server/staff member, they see only their personal account settings (Passcode, Appearance, Sign out) and read-only store hours.
- [ ] Given any changes to Shift Hours or Store Hours, updates persist and reflect in the live header countdown timer.
- [ ] Given a mobile screen, the Settings page stacks vertically with accessible form controls and clear back navigation.

## UX Contract

- **Entry point:** Desktop second-row "Settings" button, mobile "More" sheet item, or avatar quick panel "More options".
- **Desktop:** Split view / card stack (matching Section 2d) with back button returning to the previous operational view.
- **Mobile:** Single-column scrollable cards with sticky header back button.

## Data & Authorization

- **Tables/columns:** Extends `restaurants` (or `restaurant_settings`) for store hours and default shift hours if not already present. Uses existing `pay_rates` table (Feature 020).
- **Grants/RLS:** Manager/owner write access on organization settings; authenticated members have read access.

## Implementation Map

- `src/features/settings/components/settings-page.tsx`: Main settings layout and card sections.
- `src/features/settings/components/store-hours-grid.tsx`: 7-day operating hours.
- `src/features/settings/components/shift-hours-card.tsx`: Operational cutoffs.
- `src/components/restaurant-operations-app.tsx`: Integration into shell navigation.

## Test Plan

- Unit: Settings component rendering, permission gates for server vs manager.
- E2E: Full navigation flow into Settings, updating store hours, verifying persistence.
