# Feature 013 — Virtual numeric keypad on login

Status: deferred (spec only — do not implement)

**Implementation note**: same division-of-labor change as Feature 005 would apply if this were built — moot while deferred.

## User outcome

On a tablet or phone, a server can tap an on-screen number pad to enter their 4-digit passcode instead of bringing up the device's own keyboard — while the typed input field stays right there for anyone who prefers it or is on desktop.

## Scope

**In**

- An on-screen 0–9 (+ backspace, no submit key — the existing "Open workspace" button stays the single submit action) numeric keypad rendered below the existing passcode `<Input>` on the login screen, visible at tablet and phone widths.
- Tapping a digit appends it to the same `passcode` state the typed input already writes to (`setPasscode` in `login-screen.tsx`), capped at 4 digits exactly like typing — one state, two input methods, not two competing sources of truth.
- A backspace key removes the last digit; no explicit "clear" key beyond holding backspace or using the existing input's native clear behavior.
- Hidden at desktop width — desktop already has a physical keyboard; the keypad is additive for touch-primary devices, not a universal replacement.
- Matches the current visual language: same `--primary`/`--border`/`--radius` tokens as every other button in the app, 44×44 CSS px minimum per key (larger than the minimum where space allows, since this is the primary input method it's designed for).

**Out**

- Replacing the typed input — both remain, always, per explicit direction. A person can type, tap the keypad, or mix both across the same entry.
- A keypad on the registration screen's passcode-choice field, or anywhere else numeric entry happens — scoped to the login passcode field only unless a later feature extends it.
- Haptic feedback or sound — not part of this pass.
- Any change to the underlying passcode validation, submission, or rate-limiting logic (Features 006's org-lockout/degradation behavior is entirely unaffected — this changes how a digit gets into the field, not what happens once it's submitted).

## Acceptance criteria

- [ ] The keypad is visible at tablet and phone widths and hidden at desktop width.
- [ ] Tapping a digit updates the same passcode value the typed input shows, capped at 4 digits, identically to typing.
- [ ] Tapping past 4 digits does nothing (matches the existing typed-input cap behavior).
- [ ] Backspace removes exactly one digit.
- [ ] The typed input remains fully functional and focus-visible the whole time — this is additive, not a takeover.
- [ ] Every key meets the 44×44 CSS px touch-target minimum.
- [ ] The keypad is operable by screen reader (each key is a real, labeled button) even though its primary use case is touch.

## UX contract

- Entry point: always visible (no toggle needed) below the passcode field, at tablet/phone widths, on the login screen's default ("login") mode only — not shown in "register" mode's passcode-choice field per the stated scope, unless revisited later.
- Loading/Empty/Error: unchanged — the keypad doesn't introduce new states; the existing passcode error text (`aria-live`) still applies regardless of which input method produced the value.
- Success: unchanged — same submit flow.
- Keyboard/screen reader: each digit and backspace is a distinct labeled `<button>` ("Digit 4", "Backspace"), laid out in a standard 3×4 telephone-style grid (1–9, backspace/0/— or similar), reachable by keyboard tab order for completeness even though it's a touch-first control.

## Data and authorization

None — pure client-side UI state, no schema, RLS, route, or migration.

## Implementation map (for whenever this is built)

- `src/components/login-screen.tsx`: new keypad grid rendered below the passcode `<Input>`, `hidden md:hidden`-equivalent (visible below the tablet breakpoint, hidden at and above it), digit taps calling the same `setPasscode` updater the input's `onChange` already uses.
- Possibly a small extracted `<NumericKeypad>` component if the same pattern is ever reused (registration's passcode-choice field, e.g.) — not created speculatively now.

## Test plan

- Component: tapping digits updates the passcode value identically to typing; the 4-digit cap holds; backspace removes one digit; keypad hidden at desktop viewport width, visible at tablet/phone.
- Playwright: a tablet-width viewport test taps a full 4-digit passcode via the keypad alone and successfully signs in; a desktop-width viewport test confirms the keypad isn't rendered at all.
- Manual viewports: iPhone SE (375px), iPad portrait/landscape — confirm key sizing and spacing feel right for a thumb, not just technically meet the 44px minimum.

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (UI-only).

## Decisions and risks

- **Decision**: additive alongside the typed input, never a replacement, exactly as directed — both input methods write to the same state, so there's no divergence risk between them.
- **Decision**: scoped to the login screen's passcode field only, not extended to registration's passcode-choice field in this pass, to keep the change small and reviewable.
- **Risk**: a 3×4 grid at 44px minimum keys plus spacing needs real vertical space on a short phone screen (iPhone SE class) alongside the existing card content above it — worth a specific layout check at build time rather than assuming it fits.
- Open questions: none remaining — this spec is deliberately deferred, not blocked on an unresolved decision.
