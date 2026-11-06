# V2-004.003 — Per-location module navigation enforcement

Approved: owner prompt 2026-11-06. Branch `feature/v2.0-004.003-module-navigation-enforcement`.
Worktree `.tmp/v2-location-module-navigation`; baseline `6000e6cdffeb24496fce192020d3edce0f669341`, PR #301 verified.
Main `5e5b7747693b6e81014eafdf299b87e56c3f033d`; Production forbidden.

- [x] Fetch and verify remote baseline, fast-forward clean development; preserve unrelated work
- [x] Inspect canonical configuration, entry/context boundaries, navigation and recovery authority
- [x] Scoped serializable snapshot and pure navigation policy
- [x] Desktop/mobile, URL/history/home, Settings recovery and save refresh (Chromium acceptance 5/5)
- [ ] Focused tests, full checks and build
- [ ] Authenticated DEV/JWT, Chromium/WebKit/Preview and synthetic cleanup
- [ ] Documentation, security/accessibility/scope review
- [ ] Green commit/PR, exact-head CI, regular merge to development after mandatory gates

In flight: final WebKit transport/cancellation acceptance, documentation and PR delivery gates. Full Vitest 3,148 PASS / 7 existing skips; DEV JWT 9/9; Chromium 5/5 with exact cleanup. WebKit functional flow passes but console/network cancellation classification is still being verified on local release build. No migration or backend module enforcement. Q1–Q4 open. Existing unreconciled DEV locations intentionally become Settings-only. V2-004.004 NOT STARTED.

Predecessor V2-004.002 complete: PR #301, source `2a8ed9c`, merge `6000e6c`. Current evidence: docs/v2.0/features/004-location-module-configuration/003-navigation-enforcement/.
