# Agent Handoff — Payroll UX / Timezone / PIN Keypad Mega-Request

This tracks a single large, multi-part request spanning six areas:
payroll bulk generation, payroll/ledger modals, ledger unlock, payment
unconfirm/edit, the attendance timezone bug, and PIN keypad hardening.
It is being worked one bounded branch/PR at a time (this codebase's
established convention — see `CLAUDE.md`/`AGENTS.md`), not as one giant
PR. Update this file as each phase lands or as decisions are made, so
any agent (Claude, Codex, or otherwise) can pick up mid-stream without
re-deriving the investigation below.

**Note on branching:** each phase branches fresh off `main`, independent
of the others' still-open PRs (they don't depend on each other's
changes). This file is duplicated onto each phase's branch as part of
its own commit — always check the branch's own copy is current, and
merge/reconcile this file's content by hand if multiple phase PRs land
close together and both touch it.

## Status at a glance

| Phase | Area                                       | Status                                                                 |
| :---- | :----------------------------------------- | :--------------------------------------------------------------------- |
| 1     | Investigation                              | ✅ Done — findings below                                               |
| 2     | Attendance timezone bug                    | ✅ Done — PR #35 (`fix/attendance-timezone`), open                     |
| 3     | Payroll bulk generation (single/multi/all) | ✅ Done — PR #36 (`feature/payroll-bulk-generation`), open             |
| 4     | Generate Payroll → modal                   | ✅ Done — branch `feature/payroll-modal-workflow` (stacked on Phase 3) |
| 5     | Ledger → modal                             | ⏳ Not started                                                         |
| 6     | Ledger unlock                              | ⏳ Not started                                                         |
| 7     | Payment unconfirm/edit                     | ⏳ Not started — **design decided, see below**                         |
| 8     | PIN keypad hardening                       | ⏳ Not started                                                         |
| 9     | Responsive verification                    | ⏳ Not started                                                         |
| 10    | Documentation sweep                        | 🔶 Partial (this file)                                                 |
| 11    | Full CI                                    | Per-phase, not yet a final sweep                                       |

## Architecture already in place — do not rebuild these

Read this before writing any code in this area. Significant parts of
the original request assume gaps that don't actually exist:

- **The PIN virtual keypad already shipped** (Feature 013,
  `src/components/login-screen.tsx`'s `NumericKeypad`) — digits 0–9 and
  Backspace, real `<button>`s with `aria-label`s, writing to the same
  `passcode` state as the typed input. Phase 8 below is about closing
  specific, narrow gaps in it, not building a new one.
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
  primitive anywhere in this codebase.** Phases 4/5 must reuse this
  existing pattern, not introduce a second modal system.
- **Payroll's audit trail already exists**: `recordAuditEvent` (used by
  `lockPayrollPeriod`, `editDraftPayment`, `confirmPayment`, etc. in
  `src/features/payroll/data/payroll-data.ts`) — before/after state,
  actor, action, entity. Reuse it for unlock/unconfirm; don't build a
  second audit mechanism. `payroll_periods.locked_at`/`locked_by`
  already exist as columns.
- **Bulk payroll generation now exists** (Phase 3,
  `generatePayrollForEmployeesAction` in `payroll-actions.ts`) — see
  below. Reuse it; don't add a second bulk-generate path.

## ⚠️ Decided design point: payment "unconfirm"

The original request (Section 12) asked for confirmed payments to be
explicitly unconfirmable and editable. **This directly reverses a
deliberately-shipped security fix**, not an oversight:
`private.forbid_confirmed_payment_edit()` (migration
`20260907200000_payroll_payment_draft_delete_and_lock.sql`) is a
`BEFORE UPDATE` trigger on `payroll_payments` that unconditionally
blocks ANY change to `status` away from `'confirmed'`, for every role
including a manager's own normal authenticated session. Its own
migration comment documents this closed a real, proven vulnerability
(a privileged role could previously flip status back to draft and
silently re-edit a "confirmed" payment).

**This was raised to the user explicitly rather than decided silently.
Their answer: implement it as a narrow, audited `SECURITY DEFINER` RPC**
— the blanket trigger stays exactly as strict as it is today for every
ordinary UPDATE path (no regression on the fixed vulnerability), but one
new, purpose-built Postgres function is the sole door through which an
authorized manager can unconfirm a payment, and every use of that door
is unconditionally audited (mandatory reason, before/after state,
actor) via the existing `recordAuditEvent` pattern.

**Not yet implemented.** When picking this up:

1. New migration: a `private.unconfirm_payroll_payment(payment_id,
reason)` (or similarly named) `SECURITY DEFINER` function that:
   validates the caller is a privileged role for the payment's
   organization (mirror `private.has_org_role` usage elsewhere), sets
   `status = 'draft'` bypassing the trigger from _inside_ the function
   body (a `SECURITY DEFINER` function's own body is not itself subject
   to a `BEFORE UPDATE` trigger it triggers on the same table — verify
   this empirically against a real Postgres instance before trusting it,
   the way every other migration in this codebase's history has been
   pgTAP-verified against a live local instance, not just read) or,
   safer: add a narrow, explicit exception to the trigger itself gated
   on a session-local flag (`set_config`) that only the RPC ever sets,
   so the general UPDATE path truly never gets a new hole. Requires a
   mandatory `reason` argument and writes an audit event in the same
   transaction.
2. `revoke`/`grant` exactly like every other SECURITY DEFINER function
   in this codebase (`revoke all ... from public, anon; grant execute
... to authenticated;`).
3. New `unconfirmPaymentAction` in `payroll-actions.ts`, calling the RPC
   via the regular per-request Supabase client (not admin), mirroring
   `purge_inactive_member`'s calling convention from Feature 035.
4. pgTAP coverage proving: a privileged caller can unconfirm; a
   non-privileged caller cannot; a plain client-side `UPDATE ...
SET status='draft'` (bypassing the RPC entirely) still fails exactly
   as it does today; an audit event is recorded.
5. Once unconfirmed, `editDraftPaymentAction`/`editDraftPayment`
   **already exist and already work** for a draft-status payment — no
   new edit code path is needed, only the unconfirm door itself.

## Phase 1 investigation notes (payroll structure)

- `src/features/payroll/components/payroll-workspace.tsx` —
  `GenerateForm` (formerly single-person, now bulk as of Phase 3, see
  below) is currently an inline `<Card>` toggled by `showGenerateForm`
  (~line 300), rendered directly below `PayrollKpiCards`.
  `PeriodLedgerPanel` (line ~1050+, shifted by Phase 3's edits) is the
  ledger, currently an inline `<Card>` toggled by `selectedPeriodId`.
  Both still need converting to the fixed-overlay modal pattern
  described above (Phases 4/5) — this file is now ~1800 lines and
  touches a lot; expect each of those phases to be a substantial diff
  too.
- `payroll_periods.status` has **no** immutability trigger (only
  `hours_snapshot`/`rate_cents_snapshot`/`gross_cents` are protected
  once a payment exists — see `20260908090000_payroll_period_snapshot_lock.sql`,
  whose own comment says `status`/`locked_at`/`locked_by` are
  "deliberately NOT covered, so locking an already-paid period still
  works"). **Unlock is architecturally safe** — a new
  `unlockPayrollPeriodAction` mirroring `lockPayrollPeriodAction`
  exactly (plain UPDATE + `recordAuditEvent`) is sufficient, no
  migration required. Still gate it manager-only and require an
  explicit confirmation dialog per the original request.

## Phase 2 findings (shipped on `fix/attendance-timezone`, PR #35)

Root cause was `combined-statement-dialog.tsx`'s own broken, zone-naive
`formatClockTime` (no `timeZone` option, defaulting to the viewer's
browser zone) — not a Neon/region issue, that pipeline was already
correct. Fixed via new `src/lib/date-time.ts` + threading a `timeZone`
prop through the component chain. `date-time.ts` is now the shared home
for future 12-hour print/statement time formatting.

## Phase 3 (shipped on `feature/payroll-bulk-generation`)

- New in `src/features/payroll/actions/payroll-actions.ts`:
  - `generatePayrollForEmployeesAction({ restaurantSlug, neonUserIds,
periodMonth })` → `BulkGeneratePayrollResult` (`{ successful,
skipped, failed }`, each an array with the `neonUserId` and either
    the generated `PayrollPeriod`, a skip reason, or an error string).
    De-duplicates `neonUserIds`. Deliberately **not** one all-or-nothing
    DB transaction — loops per employee, reusing the exact same
    `getPayrollPeriod` duplicate-check and `computeSnapshot`/
    `generatePayrollPeriod` calculation+insert
    `generatePayrollPeriodAction` (the original single-employee action,
    still present and still used by `regeneratePayrollPeriodAction`'s
    call site) already used — one person's failure can never roll back
    or block another's already-successful generation in the same batch.
  - `getPayrollGenerationEligibilityAction({ restaurantSlug,
periodMonth })` → `PayrollGenerationEligibility[]` (`{ neonUserId,
fullName, alreadyGenerated }` per active employee) — read-only,
    lets the UI show "Already generated" status before the manager
    commits to generating.
- `GenerateForm` in `payroll-workspace.tsx` rewritten: month picker →
  fetches eligibility → renders a scrollable checklist (Select
  All/Clear All, an "Already generated" badge per row, defaults the
  selection to exactly the not-yet-generated employees) → submits via
  the bulk action → renders a `"N generated · N already existed · N
failed"` summary, listing each failure's reason. The submit button's
  label switches between "Generate Payroll" / "Generate Payroll for N
  Employees" / "Generate Payroll for All Employees" depending on
  selection. The form **no longer auto-closes** after submitting (it
  used to) — the manager needs to actually see the outcome summary;
  `PrivilegedPayrollView`'s `onGenerated` prop to it now only reloads
  the dashboard, doesn't also hide the form.
- Tests: `payroll-actions.test.ts` (+6: mixed success/skip/fail batch,
  id de-duplication, non-manager refusal, empty-list rejection,
  eligibility mapping, eligibility non-manager refusal),
  `payroll-workspace.test.tsx` (+1: full render → open form → type
  month → default-selection assertion → Select All → deselect → submit
  → verify the exact bulk-action call args → verify the result summary
  renders → verify the form is still open afterward).
- **Not yet done in this phase** (deliberately deferred to Phases 4/5
  per the original request's own phase split, to keep this diff
  reviewable on its own): the modal conversion. `GenerateForm` still
  renders as an inline `<Card>`, same as before -- only its _content_
  changed (single-select → bulk checklist), not its _placement_. Phase
  4 wraps it in the fixed-overlay modal pattern without needing to
  touch the bulk-selection logic again.
- Real-mode-only surface (payroll has no demo-mode UI path, per this
  codebase's established precedent — see `payroll-timesheet-overhaul.spec.ts`'s
  own comment on why Playwright coverage here goes through Vitest/jsdom
  component tests instead of e2e) — no new Playwright spec, matching
  that precedent; the new Vitest coverage above is this phase's real
  regression test, same tier as every other payroll surface.

## Phase 4 (shipped on `feature/payroll-modal-workflow`, stacked on

Phase 3's branch -- it rewrites the exact function Phase 3 just wrote,
so it branches from `feature/payroll-bulk-generation`, not `main`;
this PR's base is that branch, not `main`, until Phase 3 merges)

- New `GenerateFormDialog` component in `payroll-workspace.tsx`: the
  fixed-overlay + `Card` modal shell (`role="dialog" aria-modal="true"
aria-label="Generate Payroll"`, a close `X` button, click-outside-to-
  close), reusing this codebase's one existing modal convention
  (`PayrollPrintDialog`/`CombinedStatementDialog`'s pattern) rather than
  introducing anything new.
- `GenerateForm` itself no longer owns any `Card`/header chrome -- it's
  now bare form content, rendered as `GenerateFormDialog`'s `children`.
  The parent (`PrivilegedPayrollView`) still gates on
  `rateOptionsError`/`!rateOptions` before deciding what to render
  inside the dialog, same as before Phase 3.
- `PayrollKpiCards`'s toggle button lost its "Hide form"/"Generate
  period" toggle-text behavior (a modal has its own close button, so
  there's nothing left to "hide" by re-clicking the opener) -- it's now
  a static "Generate Payroll" label, and `showGenerateForm` there is
  now open-only (`onToggleGenerate={() => setShowGenerateForm(true)}`).
  The now-unused `showGenerateForm` prop was removed from
  `PayrollKpiCards`'s own signature (dead prop, not dead state --
  `PrivilegedPayrollView` still needs `showGenerateForm` itself, to
  decide whether to mount the dialog at all).
- `PayrollPeriodGroups`'s empty-state copy ("Click 'Generate period'
  above...") updated to match the renamed button.
- **Gotcha for anyone testing this**: once the dialog is open, the
  toolbar's opener button (still mounted behind the overlay, just
  visually covered) and the dialog's own submit button can share the
  exact same accessible name ("Generate Payroll", whenever exactly one
  employee is selected) -- any query for that name must be scoped to
  `within(screen.getByRole("dialog", { name: "Generate Payroll" }))` or
  it throws on multiple matches. Hit this rewriting Phase 3's own test
  after this phase's changes; fixed there, mentioned here so it doesn't
  get rediscovered the hard way in Phase 5 (which will have the exact
  same shape of problem for the Ledger modal's own print/export
  buttons, if any of its now-inline `PeriodLedgerPanel` action buttons
  share a name with something in the surrounding page).

## PIN keypad — specific confirmed gaps (Phase 8, not started)

Against the already-shipped `NumericKeypad`/`LoginScreen`
(`src/components/login-screen.tsx`):

1. **Masking**: the `<Input>` uses `type="tel"`, so typed digits render
   in plain text, not dots. Real gap.
2. **No Enter control** on the virtual keypad (only 0–9 + Backspace).
3. **No auto-submit** at 4 digits — currently requires the "Open
   workspace" button (or a physical Enter key via native form submit).
4. **`lg:hidden` is a width breakpoint, not touch-aware** — a large
   landscape tablet past that breakpoint would hide the keypad even
   though it has no physical keyboard. Consider `@media (pointer:
coarse)` or similar instead/in addition.
5. Keypad digit/backspace buttons aren't `disabled` during `pending` —
   only the submit button is.
6. A wrong PIN doesn't clear the field (`setError` only, `passcode`
   state untouched).

None of these are architecture conflicts — safe to implement directly
as a bounded `feature/pin-virtual-keyboard` branch.

## Non-negotiables that apply to every remaining phase

- Neon stays read-only.
- No new modal system — reuse the existing fixed-overlay `Card` pattern.
- No new audit mechanism — reuse `recordAuditEvent`.
- Every payroll write stays server-action-gated + RLS-checked, never
  client-trusted.
- One bounded branch per phase, full quality gate
  (`format:check`/`lint`/`typecheck`/`vitest`/`build`/relevant
  Playwright) before each commit, per this codebase's established
  convention.
