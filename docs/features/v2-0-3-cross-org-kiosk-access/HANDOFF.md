# V2.0.3 Cross-organization kiosk access — handoff

## Repository

- Branch: `feature/v2-0-3-cross-org-kiosk-access`; base `development` `7880756456139effd7c6443b6fe0093135550fc9` (remote verified 2026-11-16).
- Worktree: `.tmp/v2-0-3-worktree`; determine the current local SHA with `git rev-parse HEAD` before resuming.
- Feature PR: pending.

## Investigation and decision

The kiosk requires a destination `passcode_credentials` locator before Supabase Auth verification. Universal login can resolve `personal_pin_accounts` and verify the canonical person password, so an employee added to a second organization can sign in to the application while the kiosk rejects the same personal PIN.

Resolve the supplied PIN in both namespaces. A global account with no conflicting organization credential authenticates only with the person-derived Auth password. A different profile in the organization namespace is an ambiguous PIN and fails closed. Legacy organization credentials remain usable only when the resolved profile has no personal PIN account. Reject in-progress PIN operations and recheck account state after Auth verification. Preserve kiosk rate limits, membership, location assignment, attendance mode, device binding, and ephemeral sessions. No credential write or schema migration is needed. The database has no organization active flag; organization existence and active membership are the available readiness gates.

## Feature contract

- Data: read existing `personal_pin_accounts`, `passcode_credentials`, `memberships`, `location_memberships`, `locations`, and kiosk device/session tables; no schema change.
- Authorization: the server derives the organization/location from the paired device. Require active membership, active branch assignment and location, Internal attendance, and a canonical Auth identity matching the resolved profile. Ambiguity or lookup error fails closed.
- UI: reuse existing kiosk pairing, attendance-mode, assignment, lockout, and invalid-PIN messages; add only a generic recoverable ambiguity message if needed. No new dashboard.
- Risks: stale credentials, cross-namespace collisions, concurrent PIN rotation, session leakage, and attempt accounting. Tests target each changed decision and existing security gates.
- Rollout: code-only. Revert the feature commit to roll back; no data migration or credential repair.

## Implementation and validation

- `src/features/kiosk/actions/kiosk-clock-actions.ts`: dual-namespace lookup, conflict and stale-credential rejection, canonical person-password verification, post-auth account recheck, and exact device-organization location filter.
- `src/features/kiosk/actions/kiosk-clock-actions.test.ts` and `kiosk-lifecycle-security.test.ts`: existing fixtures updated; canonical second-organization success and focused negative security cases added. Both focused suites pass 26/26 each.
- `npm run check` PASS; full `npm run test` PASS (317 files, 4,273 passed, 7 skipped); `git diff --check` PASS. `npm run build -- --webpack` PASS. Standard Turbopack build cannot resolve the worktree's dependency junction outside its root; exact-head CI must verify the standard build. Next.js 16.4.3 reports a security upgrade recommendation.
- Independent security review: a separate read-only Codex reviewer inspected commit `ee173da7c6fcd5231cf38b23e2a188ff613a8c18` and found that failed initial personal PIN enrollment leaves a NULL-locator account, which the kiosk incorrectly treated as completed enrollment. The focused correction permits the existing organization credential only while that locator is NULL, rejects in-progress operations before Auth, and retains the post-Auth state recheck. Regression tests cover rollback and the actual raw legacy password fallback. Focused kiosk suites pass 54/54. The reviewer returned PASS on the corrected source and tests; exact-head CI remains pending. Review was read-only and included no hosted checks.
- Hosted DEV read-only verification 2026-11-16: League City is active, Internal, with one active kiosk. Asha QA has active Liquor Tap membership, League City assignment, a ready personal PIN account, and no Liquor Tap credential row. No PIN or secret was read. No login was attempted and no hosted write occurred.

## Owner-operated DEV pilot after development deployment

On the authorized paired League City kiosk, have Asha enter her own existing PIN privately. Confirm her original profile appears, her own attendance controls open, no clock-in is submitted, and Finish or the three-minute timeout returns to the idle kiosk. Check that a member without League City assignment is denied and that the existing Monks external attendance path remains unchanged. Record only pass/fail and the deployed commit; never record the PIN, token, or a credential-entry screenshot. Until this is observed, hosted authentication acceptance is CONDITIONAL, not PASS.

## Dependencies and recovery

V2.0.2 is merged to development, but its DEV migration is absent (latest hosted migration remains `20261114210116_v2_009_b5_global_pin_registry`), the new-location attendance default is NULL, and Liquor Tap NASA and The Monk's DEV Location remain unconfigured. A fresh encrypted DEV backup was verified in the separate V2.0.2 rollout; its required restored-database rehearsal and hosted writes have not occurred. Coordinate with that rollout; do not repeat its writes. Next: commit, push, obtain exact-head CI, merge to development if gates pass, and complete the owner-operated pilot. Recheck local status before continuing; no owner Production approval is granted.
