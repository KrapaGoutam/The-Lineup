# Current Task: Feature 021 — Design System Refresh & Two-Row Shell Navigation

**Active Spec:** [docs/features/021-design-system-and-shell-refresh.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/docs/features/021-design-system-and-shell-refresh.md)  
**Status:** In Progress (Implementing & Verifying)  
**Assigned Agent:** Codex / Antigravity / Claude Code  
**Last Verified:** `npm run check` (0 errors), `npm test` (177/177 passed)

---

## 🎯 Objective & Outcome
Upgrade the application shell to a two-row desktop header with a centered live countdown timer pill ("Day ends in"), weighted operational tabs, and a quick settings menu. Add a 3-button bottom dock for mobile (Allocation, Tip Split, More) and refresh design tokens to match warm stone / dark amber styling without touching database schemas or rotation logic.

---

## 📋 Task Checklist

- [x] **Step 1: CSS Design Tokens**
  - Updated `src/app/globals.css` with dark base tokens (`#0b0b0d`), warm stone light mode (`#e9e7e2`), warm amber accents, and urgency status classes.
- [x] **Step 2: Two-Row Shell & Header**
  - Updated `src/components/restaurant-operations-app.tsx` with two-row layout.
  - Centered countdown timer pill with urgency color shift (`>60m` accent, `<60m` warn amber, `<15m` red danger + "Closing" label).
- [x] **Step 3: Mobile Dock & Slide-up Sheet**
  - Added bottom 3-item navigation dock (`Allocation`, `Tip Split`, `More`).
  - Slide-up sheet contains `Attendance`, `Payroll`, `Settings`, and `AppearanceSwitch`.
- [x] **Step 4: Attendance Report Badges & Stat Cards**
  - Styled `src/features/attendance/components/attendance-report.tsx` with updated badge and stat card tokens.
- [x] **Step 5: Code Quality & Unit Tests Verification**
  - Ran `npm test`: 26 files passed, 177 tests passed.
  - Ran `npm run check`: Prettier formatting, ESLint (0 warnings), and `tsc --noEmit` route types passed.
- [ ] **Step 6: Production Build & Browser Verification**
  - [ ] Run `npm run build` to ensure Next.js production bundle succeeds cleanly.
  - [ ] Verify light/dark theme toggle visually without contrast collisions.
  - [ ] Test mobile bottom dock and slide-up sheet on 375px/390px viewport.
- [ ] **Step 7: Final Documentation & Commit**
  - Update `docs/DESIGN_SYSTEM.md` token tables if any final adjustments are made.
  - Commit changes with message `feat: design system refresh and two-row shell navigation`.

---

## ⚠️ Non-Negotiable Invariants
- Do not modify database migrations or Supabase authorization for this feature.
- Table rotation algorithm in `src/domain/` remains pure and untouched.
- Preserve accessibility: all interactive touch targets must be $\ge 44\text{px}$.
