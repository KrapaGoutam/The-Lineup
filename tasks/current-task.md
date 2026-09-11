# Current Task: PIN Keypad Hardening (Phase 8 of the mega-request)

**Active Spec:** none (bounded phase, not a numbered feature) — see
`docs/agent-handoff.md` for the full mega-request context and remaining
phases.
**Branch:** `feature/pin-virtual-keyboard`, branched from `main`
(independent of the payroll stack — phases 3–7 are separate).
**Status:** Complete — ready to push and open a PR.
**Assigned Agent:** Claude Code

## 🎯 Objective

Close the specific, narrow gaps in the already-shipped virtual PIN
keypad (Feature 013) — masking, an Enter key, auto-submit at 4 digits,
touch-aware visibility, disabled-while-pending, and wrong-PIN
clearing. Not a rebuild: the keypad, the typed input, and the
sign-in flow all already existed and worked.

## 🛠️ What was built

1. **Masking**: both passcode inputs (login, and registration's
   "choose a passcode") changed `type="tel"` → `type="password"` —
   still pairs with `inputMode="numeric"` for a numeric mobile
   keyboard, but the display is now genuinely masked.
2. **Enter key**: the keypad's previously-empty bottom-left cell is
   now a real `type="submit"` button — participates in the
   surrounding form's native submit, exactly like a physical Enter
   key, no separate callback to keep in sync.
3. **Auto-submit at 4 digits**: `submitPasscode` factored into
   `attemptSignIn(candidatePasscode)`, called by the form's submit AND
   a new effect that fires the instant `passcode.length === 4`
   (typed or tapped). Guarded against re-entrancy (`if (pending)
return`).
4. **Touch-aware visibility**: `lg:hidden` → a compound arbitrary
   media query hiding the keypad only when BOTH desktop-width AND a
   fine (mouse) pointer are true — a large touch tablet keeps it
   regardless of width.
5. **Disabled while pending**: the keypad's `disabled` prop (every
   button) and the typed input's own `disabled={pending}`.
6. **Wrong-PIN clears the field**: every failure branch of
   `attemptSignIn` now clears `passcode`, not just shows an error.

## 🔒 Non-negotiables honored

- No rebuild — the existing `NumericKeypad`/typed-input/sign-in flow
  is extended in place, not replaced.
- Physical keyboard still works (unchanged — the typed `<Input>` is
  still a real, fully functional text input).
- No duplicate submit path — the Enter button and auto-submit both
  funnel through the exact same `attemptSignIn`/form-submit logic.

## 🧪 Tests

- `login-screen.test.tsx` (+6): masking (`type="password"`),
  auto-submit via typing, auto-submit via tapping, wrong-passcode
  clears the field and shows the error, the Enter button submits
  (tested with an incomplete passcode to isolate it from auto-submit),
  keypad + typed input disabled while a real (non-demo) request is
  pending (using a controlled-resolution `fetch` mock).
- All 4 pre-existing tests in that file still pass unmodified.

## 🐛 Regression found and fixed during E2E verification

The full 3-project Playwright run surfaced two real problems, both now
fixed (root-caused, not skipped/weakened — see `docs/agent-handoff.md`
Phase 8 section for the full writeup):

1. **Auto-submit race in every e2e sign-in helper.** Every spec file's
   `signIn`/`signInOnCurrentPage` helper filled the 4-digit passcode
   and then _also_ explicitly clicked "Open workspace" — redundant
   once a full 4-digit `fill()` auto-submits on its own, and actively
   racing it: the explicit click could land on a button that was
   already mid-unmount, timing out the whole test. Fixed by removing
   the now-redundant click from the helper in all 9 spec files (one
   copy per file, no shared import) plus the two keypad-specific tests
   in `dashboard.spec.ts`, which needed slightly different treatment
   (see `docs/agent-handoff.md`).
2. **Real, pre-existing app bug, newly exposed:** `signOut()` in
   `restaurant-operations-app.tsx` reset `user` and `tab` but never
   closed the still-open avatar panel (`showAvatarPanel`/
   `showMobileSheet`) it was always invoked from — so the panel state
   stayed `true` underneath the login screen and into the _next_
   person's session, making their first tap on the account button
   toggle it closed instead of open. Previously masked by an
   incidental side effect of the old (redundant) "Open workspace"
   click, which the outside-click-dismiss hook treated as an outside
   click and closed the panel as a side effect. Fixed at the source in
   `signOut()`, not in the tests.

## ✅ Verification Gate

- [x] `npm run lint` — clean (including the deliberate, commented
      `react-hooks/set-state-in-effect` exception for the auto-submit
      effect).
- [x] `npx tsc --noEmit` — clean.
- [x] `npx vitest run` — 44/44 files, 331/331 tests (up from 325 — 6 new).
- [x] `npm run build` — clean.
- [x] `npm run test:e2e` (full 3-project suite: desktop/host-tablet/
      server-mobile) — **153/153 passed, 0 failed, 0 flaky**, verified
      via a clean targeted re-run after the two fixes above (not just
      the background run's exit code).

## 🗂️ File List

- `src/components/login-screen.tsx`
- `src/components/login-screen.test.tsx`
- `src/components/restaurant-operations-app.tsx` (the `signOut` bug fix)
- `tests/e2e/dashboard.spec.ts`, `allocation-open-editing.spec.ts`,
  `attendance-reporting.spec.ts`, `debug.spec.ts`,
  `payroll-timesheet-overhaul.spec.ts`, `recurring-schedules.spec.ts`,
  `settings.spec.ts`, `team-management.spec.ts`,
  `tips-clocked-in-roster.spec.ts` (redundant post-fill click removed)
- `docs/agent-handoff.md`
- `tasks/current-task.md` (this file)

## Current State & Next Step

Implementation, unit tests, and the full 3-project Playwright suite are
all green (153/153). Quality gate is fully clean: lint, typecheck,
vitest (331/331), build, and e2e. Ready to commit, push, and open the
PR against `main`. After that: Phase 9 (live-device/browser responsive
check) and Phase 10 (final documentation sweep), then the coordinated
merge sequence for PRs #35–#39 + this one.
