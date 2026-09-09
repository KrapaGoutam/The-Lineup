# Feature 022 — App Shell Brand Refresh & Navigation Hierarchy

**Name:** App Shell Brand Refresh & Navigation Hierarchy  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** UI-ONLY
- **Modifies vs Adds:** Modifies existing header and navigation structures in `src/components/restaurant-operations-app.tsx`. Adds no backend tables or migrations.
- **Contradiction Flags:** The HTML reference mockups display the name "ServiceFlow". This is explicitly superseded: the brand is **"The Monk's"** and the header logo URL is `https://www.monkswebster.com/assets/img/logo-light.png`. Ignore any ServiceFlow strings.
- **Session Scope:** One-session build.

## User Outcome

Users see an updated brand identity ("The Monk's") with the official brand logo. The desktop experience provides a two-row operational shell with primary focus on daily service: Table Allocation and Tip Split are front-and-center, Schedule is tucked into Settings, and Team, Attendance, and Payroll are accessible but treated as secondary/management workflows. Mobile users navigate via a dedicated 3-button bottom dock (`Allocation`, `Tip Split`, `More`), with `More` sliding up a sheet for secondary destinations.

## Scope

- **In:**
  - Update header branding with official logo (`https://www.monkswebster.com/assets/img/logo-light.png`) and "The Monk's" text.
  - Implement two-row desktop header per reference mockup Section 2a:
    - Row 1: Logo/Brand on left, centered live countdown timer pill ("Day ends in" / "Closing"), user profile / quick settings pill on right.
    - Row 2: Primary operational tabs (`Table Allocation`, `Tip Split`), visual divider, secondary tabs (`Attendance`, `Payroll`), and `Settings` trigger. Schedule is removed from the primary tab row and moved under Settings.
  - Mobile bottom navigation bar (3-item: `Allocation`, `Tip Split`, `More`).
  - Mobile slide-up sheet triggered by `More` containing secondary items (`Attendance`, `Payroll`, `Settings`, `Appearance` switch, `Sign out`).
  - Accessible keyboard navigation and mobile tap targets ($\ge 44\text{px}$).
- **Out:**
  - Database schema changes or migrations.
  - Business logic modifications to table rotation or tip calculations.

## Acceptance Criteria

- [ ] Given any page in the app, the header displays "The Monk's" and renders the brand logo from `https://www.monkswebster.com/assets/img/logo-light.png`.
- [ ] Given a desktop viewport, the navigation displays a two-row layout where Row 1 has the brand, centered countdown pill, and user profile pill, and Row 2 features `Table Allocation` and `Tip Split` as primary tabs.
- [ ] Given the navigation tabs, `Schedule` is no longer in the primary tab bar (relocated to Settings), while `Team`, `Attendance`, and `Payroll` are styled as secondary or settings-linked items.
- [ ] Given a mobile viewport ($\le 768\text{px}$), the bottom dock displays three items: `Allocation`, `Tip Split`, and `More`.
- [ ] Given a mobile user tapping `More`, a bottom sheet slides up with options for `Attendance`, `Payroll`, `Settings`, `Appearance`, and `Sign out`.

## UX Contract

- **Entry point:** Application shell (`src/components/restaurant-operations-app.tsx`).
- **Desktop:** Two-row header with centered countdown urgency pill.
- **Mobile:** Fixed 3-button bottom dock + slide-up drawer for secondary items.
- **Accessibility:** Semantic `<nav>` landmark, ARIA expanded state on mobile sheet, touch targets $\ge 44\text{px}$.

## Data & Authorization

- **Tables/columns:** None (pure presentation and client navigation).
- **Grants/RLS:** Unchanged.
- **Role gates:** Non-managers do not see manager-only secondary tabs in mobile sheet or desktop row.

## Implementation Map

- `src/components/restaurant-operations-app.tsx`: Main header, two-row tab bar, mobile bottom bar, and slide-up sheet.
- `src/components/login-screen.tsx`: Brand logo and naming alignment.
- `docs/DESIGN_SYSTEM.md`: Shell layout hierarchy documentation.

## Test Plan

- Unit: Component rendering tests for navigation tabs across roles.
- E2E: Playwright desktop and mobile viewport tests verifying two-row desktop layout and mobile 3-item dock.
