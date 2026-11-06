# V2-004.003 - Per-location module navigation enforcement

Approved: owner prompt 2026-11-06. Branch feature/v2.0-004.003-module-navigation-enforcement.
Worktree .tmp/v2-location-module-navigation; baseline 6000e6cdffeb24496fce192020d3edce0f669341, PR #301 verified.
Main 5e5b7747693b6e81014eafdf299b87e56c3f033d; Production forbidden.

- [x] Fetch/verify remote baseline; fast-forward clean development; preserve unrelated work
- [x] Inspect canonical configuration, entry/context boundaries, navigation and recovery authority
- [x] Implement scoped serializable snapshot and pure navigation policy
- [x] Desktop/mobile, URL/history/home, Settings recovery and save refresh
- [x] Focused/full unit, format/lint/typecheck, demo and DEV release builds
- [x] Authenticated DEV JWT 9/9, local Chromium 5/5 and WebKit 5/5; exact cleanup
- [x] HTTPS implementation Preview: Chromium/WebKit main flows and Pixel 7 mobile recovery
- [x] Documentation and security/accessibility/tenant/scope review; delivery gates specified on PR #303

Implementation acceptance complete. Final delivery state is authoritative on PR #303: repeat all required CI at final HEAD, test its immutable HTTPS Preview with the complete 11-case suite and verify cleanup, then regular merge into development and verify unchanged main. Until those checks and merge finish, delivery is pending; no gate is waived. This pre-delivery record keeps the tested and merged head identical. Final CI/Preview/merge SHAs and gate results are recorded on PR #303 and in the closeout report.

No migration/backend module enforcement. Q1-Q4 open; unreconciled DEV locations intentionally Settings-only. V2-004.004 NOT STARTED; stop after .003. Parent #252/program #248/milestone #8 remain open. Evidence: docs/v2.0/features/004-location-module-configuration/003-navigation-enforcement/.
