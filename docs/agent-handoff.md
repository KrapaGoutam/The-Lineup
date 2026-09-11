# Agent Handoff — Payroll UX / Timezone / PIN Keypad Mega-Request

This tracks a single large, multi-part request spanning six areas:
payroll bulk generation, payroll/ledger modals, ledger unlock, payment
unconfirm/edit, the attendance timezone bug, and PIN keypad hardening.
It is being worked one bounded branch/PR at a time (this codebase's
established convention — see `CLAUDE.md`/`AGENTS.md`), not as one giant
PR. Update this file as each phase lands or as decisions are made, so
any agent (Claude, Codex, or otherwise) can pick up mid-stream without
re-deriving the investigation below.

**Note on branching:** phases 2 and 8 branch fresh off `main`, fully
independent of the payroll work. Phases 3–7 are a stacked chain (each
branches off the previous phase's branch, since each one builds on the
UI/logic the previous phase just wrote) — see the PR numbers below for
the exact stacking order. This file is duplicated onto each phase's
branch as part of its own commit — always check the branch's own copy
is current, and merge/reconcile this file's content by hand if
multiple phase PRs land close together and both touch it.

## Status at a glance

| Phase | Area                                       | Status                                                                                                                                                                                                                          |
| :---- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Investigation                              | ✅ Done — findings below                                                                                                                                                                                    |
| 2     | Attendance timezone bug                    | ✅ **Merged to `main`** — PR #35 (`fix/attendance-timezone`)                                                                                                                                               |
| 3     | Payroll bulk generation (single/multi/all) | ✅ **Merged to `main`** — PR #36 (`feature/payroll-bulk-generation`)                                                                                                                                       |
| 4     | Generate Payroll → modal                   | ✅ **Merged to `main`** — PR #41 (`feature/payroll-modal-workflow`; replaces #37, which GitHub auto-closed when its stacked base branch was deleted post-merge — see note below)                          |
| 5     | Ledger → modal                             | ✅ **Merged to `main`** — same branch/PR as Phase 4 (2nd commit)                                                                                                                                            |
| 6     | Ledger unlock                              | ✅ **Merged to `main`** — PR #38 (`feature/payroll-ledger-controls`)                                                                                                                                        |
| 7     | Payment unconfirm/edit                     | ✅ **Merged to `main`** — PR #39 (`feature/payroll-payment-unconfirm`)                                                                                                                                      |
| 8     | PIN keypad hardening                       | ✅ Done — PR #40 (`feature/pin-virtual-keyboard`). Full 3-project Playwright suite: 153/153 passing (see Phase 8 notes for a real regression found + fixed along the way)                                 |
| 9     | Responsive verification                    | ✅ Done — via the device-emulated E2E projects themselves (desktop/host-tablet/server-mobile); see Phase 8 notes for what's covered and what isn't (portrait tablet)                                      |
| 10    | Documentation sweep                        | ⏳ In progress — this file is being reconciled against the fully-merged `main` as part of landing PR #40; a dedicated final sweep still follows                                                           |
| 11    | Full CI                                    | Per-PR all green; PRs #35, #36, #41, #38, #39 merged to `main` in dependency order (each rebased/re-verified against the previous merge, not just fast-forwarded) — see "Merge notes" below for specifics |

### Merge notes (for whoever reads git history and is confused by PR numbers)

- **PR #37 → #41**: #37 (Phase 4/5, `feature/payroll-modal-workflow`) was
  stacked on #36's branch (`feature/payroll-bulk-generation`). Merging
  #36 with `--delete-branch` deleted that base branch; GitHub could not
  auto-retarget #37 and auto-closed it instead (not merged). The branch
  and commits were untouched — rebased cleanly onto the new `main` and
  reopened as **PR #41**, which is what actually merged. Lesson for
  future stacked-PR sequences: **retarget every downstream PR's base to
  `main` (`gh pr edit <n> --base main`) immediately after rebasing it,
  before deleting the branch it used to point at** — don't rely on
  GitHub's auto-retarget.
- Each of #36/#41/#38/#39 needed a real rebase (not just a merge) onto
  the previous PR's post-merge `main`, because they're a stacked chain
  where each branch's own git history literally contains the previous
  phase's now-superseded commits. `git rebase --onto origin/main
<old-branch-tip> <branch>` (skipping straight to each branch's own
  unique commits, rather than replaying already-merged ancestor commits
  and re-resolving the same conflicts repeatedly) was the efficient way
  to do this once the pattern became clear.
- `docs/agent-handoff.md` and `tasks/current-task.md` conflicted at
  every single rebase step (each branch carries its own evolving copy).
  Resolved by taking `main`'s copy at each intermediate step and only
  reconciling this file properly by hand at the very end (this PR),
  once the full merged history was known — trying to hand-merge it at
  every intermediate step would have been pure waste.

## Architecture already in place — do not rebuild these

Read this before writing any code in this area. Significant parts of
the original request assume gaps that don't actually exist:

- **The PIN virtual keypad already shipped** (Feature 013,
  `src/components/login-screen.tsx`'s `NumericKeypad`). Phase 8 closed
  the specific, narrow gaps in it (see that section) — it was not
  rebuilt.
- **The timezone conversion primitive already exists and is correct**
  (`src/lib/timezone.ts`'s `zonedWallTimeToInstant`/
  `zonedWallTimeFromInstant`, `Intl`-based, full DST-transition test
  coverage in `src/lib/timezone.test.ts`). Phase 2 added
  `src/lib/date-time.ts` as a thin, correct 12-hour-display wrapper for
  print/statement surfaces — reuse that, don't reinvent it again.
- **The app's modal convention** is a hand-rolled `fixed inset-0
z-50` overlay + `Card` (see `payroll-print-dialog.tsx` and
  `combined-statement-dialog.tsx` for the exact pattern: overlay div
  with `print:static` overrides, `role="dialog" aria-modal="true"` on
  the `Card`, a `print:hidden` toolbar). **There is no shadcn `Dialog`
  primitive anywhere in this codebase.** Phases 4–7 all reused this
  existing pattern — don't introduce a second modal system.
- **Payroll's audit trail already exists**: `recordAuditEvent` (used by
  `lockPayrollPeriod`, `editDraftPayment`, `confirmPayment`, etc. in
  `src/features/payroll/data/payroll-data.ts`) — before/after state,
  actor, action, entity. Phases 6/7 reused it (Phase 7's RPC inserts
  into the same `audit_events` table directly, for atomicity). Don't
  build a second audit mechanism.
- **Bulk payroll generation now exists** (Phase 3,
  `generatePayrollForEmployeesAction` in `payroll-actions.ts`). Reuse
  it; don't add a second bulk-generate path.
- **Payment unconfirm now exists** (Phase 7,
  `public.unconfirm_payroll_payment` RPC + `unconfirmPaymentAction`).
  Reuse it; don't add a second door to the same trigger.

## Phase 1 investigation notes (payroll structure)

- `payroll_periods.status` has **no** immutability trigger (only
  `hours_snapshot`/`rate_cents_snapshot`/`gross_cents` are protected
  once a payment exists). This made Phase 6 (unlock) a plain UPDATE,
  no migration needed.
- `payroll_payments.status` (once `'confirmed'`) **does** have a hard
  immutability trigger, deliberately added to close a real
  vulnerability. This made Phase 7 (unconfirm) require a real
  migration + a `SECURITY DEFINER` RPC with a session-local bypass
  flag — see that section.

## Phase 2 (shipped on `fix/attendance-timezone`, PR #35, off `main`)

Root cause was `combined-statement-dialog.tsx`'s own broken, zone-naive
`formatClockTime` (no `timeZone` option, defaulting to the viewer's
browser zone) — not a Neon/region issue, that pipeline was already
correct. Fixed via new `src/lib/date-time.ts` + threading a `timeZone`
prop through the component chain. `date-time.ts` is now the shared home
for future 12-hour print/statement time formatting.

## Phase 3 (shipped on `feature/payroll-bulk-generation`, PR #36, off `main`)

- `generatePayrollForEmployeesAction`/`getPayrollGenerationEligibilityAction`
  (new, `payroll-actions.ts`) — bulk generation reusing the exact
  single-employee `getPayrollPeriod`/`computeSnapshot`/
  `generatePayrollPeriod` calls, returning a structured `{ successful,
skipped, failed }` result. Not one DB transaction — one person's
  failure never blocks another's success.
- `GenerateForm` rewritten from a single-person dropdown into a bulk
  checklist (Select All/Clear All, per-row "Already generated"
  status, defaults to not-yet-generated employees, adaptive submit
  label, result summary). Still an inline `Card` at this point — the
  modal conversion is Phase 4.

## Phase 4/5 (merged to `main` via PR #41, `feature/payroll-modal-workflow`)

- **Phase 4** (1st commit): new `GenerateFormDialog` wraps `GenerateForm`
  (which lost its own `Card`/header) in the standard modal shell.
  `PayrollKpiCards`'s toggle button is now a static "Generate Payroll"
  label (no more toggle text — a modal has its own close button).
  **Gotcha found and fixed**: once the dialog is open, the toolbar's
  opener button and the dialog's own submit button can share the exact
  same accessible name ("Generate Payroll") — scope every query
  `within(screen.getByRole("dialog", ...))` once a modal is open, or
  `getByRole`/`getByText` throws on multiple matches.
- **Phase 5** (2nd commit): new `LedgerDialog` (a separate component
  from `GenerateFormDialog` — the ledger has error/loading/success
  states that all need a close button). `PeriodLedgerPanel` gained an
  optional `onClose` prop: provided → renders inside `LedgerDialog`;
  omitted → renders as a plain inline `Card` exactly as before.
  **Only the privileged ("click a period row") entry point passes
  `onClose`.** `SelfPayrollView`'s own usage deliberately does not —
  a regular employee's ledger _is_ their "My Payroll" page's primary
  content, not a triggered popup. Don't "fix" this into a modal too
  without re-reading this reasoning. The component's JSX was split
  into named fragments (header/content/print-area/dialog) assembled
  once at the end into either a `Card` or a `LedgerDialog`, preserving
  the exact print-isolation structure (printable area as a flat
  `hidden print:block` sibling of `print:hidden` screen chrome)
  Feature 033 established.

## Phase 6 (merged to `main` via PR #38, `feature/payroll-ledger-controls`)

- `unlockPayrollPeriod`/`unlockPayrollPeriodAction` (new) mirror
  `lockPayrollPeriod`/`lockPayrollPeriodAction` exactly — a plain
  UPDATE, no migration (see Phase 1's notes on why this is safe).
  Requires a mandatory, audited reason (≥3 chars), rolls back to the
  caller's own already-fetched `previousLockedAt`/`previousLockedBy`
  on audit failure.
- UI: a "Ledger Locked" badge, and (privileged view only) an "Unlock
  Ledger" button opening `UnlockLedgerDialog` — a small, explicit,
  mandatory-reason confirmation. Stacks at `z-[60]` above
  `LedgerDialog`'s `z-50` since it opens from inside that modal — the
  first dialog-launched-from-a-dialog case in this codebase; follow
  this same higher-z-index precedent for any future nested dialog.
- **Accessible-name collision, found and handled**: the ledger
  dialog's own "Unlock Ledger" trigger and the confirmation's "Unlock
  Ledger" submit button share the exact same name — scope with
  `within()`, same discipline as Phase 4.

## Phase 7 (merged to `main` via PR #39, `feature/payroll-payment-unconfirm`) — the heaviest phase

A real migration, a new `SECURITY DEFINER` RPC, and **live pgTAP
verification against local Postgres** (`npx supabase db reset` +
`npm run db:test`) — not just TypeScript, since the whole point was
verifying the trigger-bypass mechanics empirically.

- New migration `20260911130000_payroll_payment_unconfirm.sql`:
  - `private.forbid_confirmed_payment_edit()` updated to add exactly
    one exception: a transaction-local `set_config('app.allow_payment_unconfirm', 'true', true)`
    flag that only the new RPC ever sets (auto-clears at
    commit/rollback). Even with the flag set, only a transition
    specifically to `'draft'` is allowed, and the trigger's _other_
    guard (amount/date/comment/period/org immutability) stays
    completely unconditional.
  - New `public.unconfirm_payroll_payment(p_payment_id, p_reason)`:
    `SECURITY DEFINER`, re-validates privilege (`private.has_org_role`)
    and payment state itself (RLS doesn't apply inside a SECURITY
    DEFINER body — this function _is_ the authorization boundary),
    requires a reason (≥3 chars), writes its own audit event
    atomically in the same transaction using `audit_events.reason` (a
    real, pre-existing column no other payroll action had populated).
- `supabase/tests/database/0018_payroll_payment_unconfirm.test.sql`
  (17 assertions, verified live): the critical one is that **a plain
  client UPDATE still cannot unconfirm a payment** — proving the
  original vulnerability class stays closed. Also: RPC happy path,
  non-privileged/cross-org refusal, short-reason rejection,
  double-unconfirm refusal, post-unconfirm editability, RPC
  reusability (not a one-shot exception).
- `unconfirmPaymentAction` (new): thin wrapper around
  `supabase.rpc("unconfirm_payroll_payment", ...)`, matching this
  codebase's `board_assign`-style RPC convention
  (`allocation-actions.ts`).
- UI: an "Unconfirm" button on confirmed payments opening
  `UnconfirmPaymentDialog` (same shape as `UnlockLedgerDialog`).
  **Rendered once at `PeriodLedgerPanel`'s own level** (state lifted
  up via `unconfirmingPaymentId`), not owned by the row — a
  `<tr>`/`<tbody>` can only legally contain more table rows, so a
  fixed-overlay modal can't be a row's own child (invalid HTML the
  browser silently restructures).
- UI: also added inline editing for draft payments (amount/date/
  comment) — `editDraftPaymentAction` already existed and worked, it
  simply had **no UI trigger anywhere in this codebase before this
  phase**.
- `database.generated.ts` regenerated (stdout/stderr kept separate —
  merging corrupts the file, a previously-hit issue this session).

## Phase 8 (PR #40, `feature/pin-virtual-keyboard`, off `main`, independent of the payroll stack)

Against the already-shipped `NumericKeypad`/`LoginScreen`
(`src/components/login-screen.tsx`), all six confirmed gaps closed:

1. **Masking**: both the login passcode input and the registration
   "choose a passcode" input changed from `type="tel"` to
   `type="password"` — pairs correctly with `inputMode="numeric"` for
   a numeric mobile keyboard while still masking the display.
2. **Enter key added to the virtual keypad**: the previously-empty
   bottom-left grid cell is now a real `type="submit"` button
   (`CornerDownLeft` icon) — it participates in the surrounding
   `<form onSubmit>` natively, exactly like a physical Enter key,
   rather than a separate `onEnter` callback that could drift out of
   sync with the form's own submit logic.
3. **Auto-submit at 4 digits**: `submitPasscode`'s body was factored
   out into `attemptSignIn(candidatePasscode: string)`, called both by
   the form's `onSubmit` and by a new `useEffect` that fires the
   instant `passcode.length === 4` (whether the 4th digit arrived by
   typing or tapping). `attemptSignIn` itself guards `if (pending)
return` for re-entrancy, and the effect needs an inline
   `// eslint-disable-next-line react-hooks/set-state-in-effect` --
   deliberate, not a bug: triggering that state update the instant the
   4th digit lands is the entire point of auto-submit.
4. **Touch-aware keypad visibility**: `lg:hidden` replaced with a
   compound arbitrary media query,
   `[@media(min-width:64rem)_and_(pointer:fine)]:hidden` -- hides the
   keypad only when BOTH desktop-width AND a fine pointer (real mouse)
   are true, so a large touch tablet keeps its only input method
   regardless of width. Pure CSS, no JS/hydration-timing complexity.
5. **Keypad + typed input disabled while pending**: `NumericKeypad`
   gained a `disabled` prop (applied to every digit/backspace/Enter
   button); the typed `<Input>` also gets `disabled={pending}` now,
   for the same reason.
6. **Wrong-PIN clears the field**: every failure branch of
   `attemptSignIn` (unrecognized demo passcode, a non-2xx real-mode
   response including lockout, and the network-error catch) now calls
   `setPasscode("")` in addition to `setError(...)` -- a rejected guess
   never just sits there implicitly re-submittable.

### Regression found and fixed during E2E verification

The full 3-project Playwright suite (desktop / host-tablet / server-mobile)
surfaced two real problems after the above landed — both root-caused and
fixed, not skipped or weakened:

1. **Auto-submit raced every e2e sign-in helper.** Every spec file's
   `signIn`/`signInOnCurrentPage` helper (`tests/e2e/*.spec.ts` — 9
   files, each with its own local copy, no shared import) did
   `.fill(passcode)` followed by an explicit `.click({name: "Open
workspace"})`. A full 4-digit `fill()` now auto-submits on its own,
   so that click was not just redundant but actively racing an
   already-in-flight/-completed sign-in — Playwright's retry loop kept
   finding the button mid-unmount ("element was detached from the DOM,
   retrying") until the 120s test timeout hit. Root cause confirmed by
   reproducing live against a correctly-configured demo-mode dev server
   (see the debugging note below) before touching any test file. Fixed
   by removing the now-redundant click from the helper in all 9 files,
   plus a rewrite of `dashboard.spec.ts`'s two keypad-specific tests:
   `"...completes a full sign-in via taps alone..."` now asserts
   straight through to the dashboard (no manual submit — that's the
   actual point of auto-submit), and `"...is hidden at desktop
width..."` was renamed to `"...visibility follows pointer type, not
just viewport width..."` and now asserts per-project (`desktop` =
   fine pointer = hidden; `host-tablet`/`server-mobile` = touch = stays
   visible even at a manually-forced desktop-class viewport), which is
   a _more_ accurate test of the intentional Phase 8 behavior than the
   width-only assertion it replaced.
2. **Real, pre-existing app bug, newly exposed by fix #1:**
   `signOut()` in `restaurant-operations-app.tsx` reset `user` and
   `tab` but never closed the account/avatar panel
   (`showAvatarPanel`/`showMobileSheet`) — and `signOut()` is only ever
   reachable from _inside_ that open panel. So the panel state stayed
   `true` underneath the login screen and into the next person's
   session; their first tap on the account button toggled it _closed_
   instead of open. This was previously masked by an unrelated side
   effect: the old, now-removed "Open workspace" click, fired while on
   the login screen (where the panel's DOM refs are unmounted), was
   treated by `useDismissOnOutsideOrEscape` as an outside click and
   incidentally closed the stuck-open panel. Removing that click (fix
   #1) exposed the real gap. Fixed at the source — `signOut()` now
   also calls `setShowAvatarPanel(false)` / `setShowMobileSheet(false)`
   — not by changing the test.

**Debugging method, for any agent hitting a similar "works locally,
fails in an automated run" gap**: the first diagnostic run reused a
stale `npm run dev` process already listening on port 3000 that had
been started _without_ `NEXT_PUBLIC_DEMO_MODE=true` — Playwright's
`webServer.reuseExistingServer: true` (the local, non-CI default)
silently adopted it instead of spawning its own correctly-configured
server. That produced a _different_, misleading failure shape (real
`/api/auth/passcode` fetches, a 429, a stale-closure empty-passcode
validation error) than the real bug. Confirmed by manually driving a
freshly-started, explicitly `NEXT_PUBLIC_DEMO_MODE=true` dev server via
the Playwright MCP browser tool step-by-step, then killing the stale
process and re-running the suite — which reproduced the _actual_ two
bugs above cleanly. Lesson: when a local Playwright run's failure looks
inconsistent with the code, verify which server it actually talked to
before trusting the failure shape.

**Final verification after both fixes**: full 3-project Playwright
suite, clean re-run — **153 passed, 0 failed, 0 flaky** (confirmed by
reading the run's actual output, not just its exit code, per this
project's own established caution about piped Playwright logs).

### Phase 9 (responsive/live-browser verification) — done, via the E2E suite itself

Rather than a one-off manual DevTools screenshot pass, verification
used Playwright's own device-emulated projects, which set real
`pointer`/`hasTouch` CSS media capabilities (something a plain
mouse-driven manual check cannot exercise) and is repeatable in CI:

- **Desktop** (`desktop` project, real mouse/fine pointer): keypad
  hidden at desktop width; physical-keyboard typing, Enter-key submit,
  masking, and auto-submit-at-4-digits all covered by
  `login-screen.test.tsx` + `dashboard.spec.ts`.
- **Large tablet, landscape, touch** (`host-tablet` project — iPad gen
  7 landscape, `hasTouch: true`): keypad stays visible even when the
  viewport is manually forced to a desktop-class width (1280×800) —
  this is the exact "large tablet shouldn't lose its keypad" bug the
  request called out, and it's now asserted, not just eyeballed.
- **Phone** (`server-mobile` project — Pixel 7, touch, 390×844 in the
  keypad test): a full sign-in via taps alone (no typed input, no
  manual submit) completes and lands on the dashboard.
- **Portrait orientation**: not separately covered — `host-tablet` is
  fixed to iPad landscape by the Playwright project config
  (`playwright.config.ts`). If a future phase wants portrait-tablet
  coverage, add a dedicated project rather than overriding viewport
  size mid-test (viewport size and touch/pointer capability are
  independent in Playwright's device emulation; only the former is
  practical to override per-test).

## Non-negotiables that apply to every remaining phase

- Neon stays read-only.
- No new modal system — reuse the existing fixed-overlay `Card`
  pattern.
- No new audit mechanism — reuse `recordAuditEvent`/`audit_events`.
- Every payroll write stays server-action-gated + RLS-checked (or, for
  Phase 7's specific case, RPC-gated with its own re-validation).
- One bounded branch per phase, full quality gate
  (`format:check`/`lint`/`typecheck`/`vitest`/`build`/relevant
  Playwright, plus `db:test` for any migration) before each commit.
