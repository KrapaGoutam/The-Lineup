# Feature 021 — Design System Refresh & Two-Row Shell Navigation

**Name:** Design System Refresh & Two-Row Shell Navigation  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Numbering note

Next free number after `020-payroll.md`.

## User outcome

Users on desktop experience a cleaner two-row operational shell with a centralized live countdown timer pill ("Day ends in") that shifts colors based on closing urgency, weighted operational tabs, and a dedicated mid-shift settings quick panel. On mobile, a 3-button bottom dock (Allocation, Tip Split, More) keeps primary floor operations prominent while moving secondary utilities into a slide-up sheet. The entire visual palette is refreshed with warm amber accents, espresso/stone contrast tokens, and WCAG AA verified light/dark palettes.

## Scope

- **In**:
  - Palette and CSS token alignment in `src/app/globals.css` with dark base (`#0b0b0d`) and warm stone light mode (`#e9e7e2`).
  - Two-row desktop header in `src/components/restaurant-operations-app.tsx` with centered countdown timer pill and weighted navigation (Primary: Allocation, Tip Split; Secondary: Attendance, Payroll; Utility: Settings).
  - Countdown urgency styling: >1h (accent), <1h (warn amber), <15m (destructive red + "Closing" label).
  - Mobile bottom dock (Allocation, Tip Split, More) and slide-up sheet with Attendance, Payroll, Settings, and segmented Appearance toggle.
  - Avatar dropdown quick settings panel with shift hours, today's store hours, and "More options" routing.
  - Updating `src/features/attendance/components/attendance-report.tsx` stat cards and table badges.
  - Updating `docs/DESIGN_SYSTEM.md` with new tokens, layout maps, and urgency states.
- **Out**:
  - Any backend schema or database migrations (all visual and client-side shell presentation).
  - Altering the rotation decision engine or Supabase authorization rules.

## Acceptance criteria

- [x] Given a desktop user, when viewing the application header, they see a two-row navigation bar with a centered "Day ends in" countdown pill in `Geist Mono tabular-nums`.
- [x] Given a closing store within 15 minutes of scheduled end time, the countdown pill shifts to `--danger` and displays "Closing" instead of "Day ends in".
- [x] Given a mobile user, they see a fixed 3-item dock (`Allocation`, `Tip Split`, `More`), and tapping `More` opens a sheet containing `Attendance`, `Payroll` (manager, real mode only — the pre-existing Feature 020 demo-mode gate is unchanged), `Settings`, an `Appearance` switch, and `Sign out`.
- [x] Given any user toggling between Light and Dark mode, the tokens shift cleanly to their corresponding values defined in `design-system-reference.html` without color collisions or low contrast.
- [x] Given the Attendance tab, the summary cards show `Days worked`, `Total hours`, and `Avg per day`, and table rows display styled badges for `Auto-closed` and `Open shift`; below `sm`, the table is replaced by the condensed card ledger from reference section 2f.

All five verified live (Playwright, desktop 1440×900 and mobile 390×780, both themes) against the demo manager account. Implementation note: the reference's `--warnSoft`/`--warnLine`/`--dangerSoft`/`--dangerLine` pairs were not added as new CSS custom properties — soft/tinted urgency backgrounds reuse this codebase's existing convention of Tailwind opacity modifiers on the base color (`bg-warn/15 border-warn/30`, `bg-destructive/15 border-destructive/30` — `--danger` in the reference maps to this app's pre-existing `--destructive` token), matching how `Badge`'s tones and `Button`'s `outline` variant already work.

## UX contract

- **Entry point**: App shell (`src/components/restaurant-operations-app.tsx`).
- **Desktop**: Two-row header. Top: brand, centered countdown pill, user avatar pill. Bottom: live floor tabs, divider, secondary tabs, settings trigger.
- **Host tablet**: Preserves full operational table allocation board with accessible touch targets (>=44px).
- **Server mobile**: Compact 3-tab dock with slide-up menu sheet.
- **Urgency states**:
  - `> 60m`: Surface background, `--accent` numerals, label "Day ends in".
  - `< 60m`: `--warnSoft` background, `--warnLine` border, `--warn` numerals.
  - `< 15m`: `--dangerSoft` background, `--dangerLine` border, `--danger` numerals, label "Closing".
- **Keyboard / screen reader**: Numerals use `tabular-nums` to eliminate jitter; label change ensures non-color-reliant urgency comprehension.

## Data and authorization

- **Tables/columns**: None (purely client UI/styling).
- **Grants/RLS**: Unchanged.
- **Roles/capabilities**: Universal visual upgrade across all roles.

## Implementation map

- `design-system-reference.html`: Root visual and layout reference.
- `src/app/globals.css`: Base theme tokens (`:root` and `:root[data-theme="light"]`).
- `src/components/restaurant-operations-app.tsx`: Two-row shell, countdown timer pill, mobile dock & sheet, quick settings dropdown.
- `src/features/attendance/components/attendance-report.tsx`: Stat tiles, Auto-closed and Open shift badges.
- `docs/DESIGN_SYSTEM.md`: Documented token updates and component layouts.

## Test plan

- `npm run check`: Verify formatting, linting, and typecheck pass without warnings.
- `npm run test`: Verify all unit and action tests continue to pass.
- `npm run build`: Verify production Next.js build succeeds.
- Browser test: Verify dark/light toggle and mobile sheet responsiveness.
