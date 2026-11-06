# V2-004.003 — Evidence

## Synchronization (2026-11-06)

Windows local workspace verified against `github.com/KrapaGoutam/The-Lineup`. Original branch `docs/recipes-owner-retest-handoff`, HEAD `508cab9`. Local development before fetch `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`; freshly fetched development `6000e6cdffeb24496fce192020d3edce0f669341`. PR #301's merge is reachable. Clean development worktree `.tmp/v2-staff-assignments` fast-forwarded normally; isolated feature worktree `.tmp/v2-location-module-navigation` created from that remote base. Parent checkout's modified docs/ROADMAP.md, docs/STATUS.md and tasks/current-task.md and all existing untracked worktrees/files preserved. No reset/clean/force operation. Remote main baseline `5e5b7747693b6e81014eafdf299b87e56c3f033d`.

Tracking: [#302](https://github.com/KrapaGoutam/The-Lineup/issues/302). GitHub connector read works but issue creation returned integration 403; authorized local GitHub CLI succeeded. No duplicate issue existed.

## Implementation

Canonical reader follows verified active context/profile hydration in loadPageData; array-serialized validated configuration and profile/org/location identity passed to the client. Pure module-navigation policy intersects enablement/lifecycle/identity with existing role/demo restrictions. Settings unconditional; deterministic Tasks → Allocation → existing secondary order → Settings fallback. All nav tiers, module mounting, Tasks badge/reminder, home/back and Settings shortcuts use policy. No operational action/RPC/RLS enforcement added.

Settings offers active-target recovery using canChangeDesignation, PasscodeResetDialog and unchanged reset endpoint/authority/audit. Native Dialog supplies focus trapping/Escape/restoration for reset and More. Context-unavailable screen provides system-only Settings so inactive/archived contexts retain authorized administration and account recovery without opening an operational location. Module save action refreshes the server response. Independent-session changes require normal reload/refresh; no realtime subscription.

Browser investigation found normalization from the previous shell could overwrite Next's history tree while the address bar already named another context. It now waits for matching verified location props and closes the old workspace during that transition. History provenance is tied to the destination context rather than expiring before slow reconciliation.

## Executed acceptance

Implementation head: 3b26a9de098ae38b14ef201b7bf8b376e040115c. Final follow-up changes are test coverage and delivery documentation only. Final exact-head CI/Preview and merge evidence is recorded on [PR #303](https://github.com/KrapaGoutam/The-Lineup/pull/303), not inferred from earlier checkpoints.

- PASS: format, lint, typecheck, full Vitest 232 files / 3,148 tests, with 7 pre-existing skips; demo and DEV-bound webpack production builds. Final-head checks must repeat before merge.
- PASS: focused policy/entry/shell/settings/recovery tests (276/276 broad checkpoint, plus 39/39 final transport/context regressions).
- PASS: hosted DEV real-JWT suite 9/9: persisted A/B/C, all-missing/all-disabled, inactive/archive refusal, foreign-org refusal and staff role intersection.
- PASS: authenticated local Chromium 5/5 and WebKit iPad 5/5, including four-width (1366/1024/768/390), light/dark, keyboard focus/Escape/restoration and overflow checks.
- PASS: HTTPS implementation Preview https://the-lineup-5dunuzqpe-onepiece11.vercel.app - Chromium main flow 1/1, WebKit main flow 1/1 and actual Pixel 7 mobile navigation/recovery 1/1. Real synthetic reset, reason/audit, staff reset refusal (403), self-change/sign-out/new-PIN sign-in, native Back/Forward/reload, cross-org/context, disabled deep links, save-refresh, Settings-only/inactive administration and 1/2/3-button dock coverage.
- PASS: implementation-head CI application (including Turbopack build and nonproduction scan), browser-smoke 337/337, and Vercel deployment. Run https://github.com/KrapaGoutam/The-Lineup/actions/runs/42252422881. Final exact-head application/browser-smoke/Vercel must all pass before merge; PR records their conclusions and CI run.
- Desktop demo local regression: 335/337 on the first run; two trace ENOENT failures were artifact-directory collisions from concurrent Playwright runners. The four affected XM-070 cases PASS on isolated retry. Navigation owns a separate artifact directory. Implementation-head CI independently passed all 337 cases; the final-head repeat remains mandatory before merge.
- SKIPPED: full pgTAP replay/database workflow for this change (no schema/RLS/generated-types changes). Accepted V2-004.001 73-migration replay, 62 files / 2,012 assertions are reused, not claimed rerun.

Browser investigation fixed rejected Tasks/badge/pay-rate reads and native focus restoration under Strict Mode. WebKit pageerror auditing excludes only an access-control diagnostic correlated to an actually canceled/aborted same-origin request (pathname/location matched); real CORS failures, script exceptions and unhandled rejections fail. The accepted main flow reported no TypeError/unhandled promise rejection. Windows WebKit's bundled TLS trust store rejected Vercel's otherwise trusted certificate: HTTPS WebKit alone uses a test-only Windows ignoreHTTPSErrors flag, after Node validates TLS normally before fixtures/authentication. Chromium validates the same HTTPS host normally. Linux retains normal WebKit certificate validation. Acceptance blocks injected vercel.live feedback-toolbar requests only; application code and deployment protection are unchanged.

Fixture corrections: explicit active location assignments are required even for synthetic owners; inactive assignment correctly rejected and fixture fixed. DEV bundle verification scans initial scripts and RSC-observed chunks before authentication. Failed runs also verified cleanup.

## DEV safety and cleanup

Only the-lineup-dev (opmujepkemwcdxxorhfd) was contacted. HTTPS Preview passed normal Node TLS and bundle scanning: DEV ref present, Production ref absent. No Production env file read/copied, no secret printed/committed, no persistent test PIN/role/assignment changed. Only random disposable identities received recovery mutations. No migration or backfill; canonical 73-migration contract reused.

Every completed JWT/browser run verifies before = after counts and zero tracked residue: organizations 30; locations 44; memberships 52; location_memberships 5; overall_roles 0; profiles 53; tasks 42; task_events 44; task_assignments 13; task_notifications 170; task_recurrence_rules 1; checklist_templates 2; checklist_instances 19; passcode_credentials 7; passcode_login_attempts 535; audit_events 1; auth_users 53; location_module_configs 0. Teardown removes tracked config rows, then disposable organizations through declared FK cascades and synthetic users; no direct audit-row deletion or lifecycle bypass. Final complete HTTPS-suite cleanup must pass before merge and is recorded on PR #303.

## Delivery and residuals

The final-head CI run, immutable Preview URL, complete HTTPS suite, fixture cleanup, merge SHA and unchanged-main verification are authoritative on PR #303. No pending/failing check may be bypassed. This document is committed before those final delivery gates to keep the tested head identical to the merged head.

Q1 defaults, Q2 missing/unauthorized distinction, Q3 recovery authority and Q4 manager authority remain formally open. Existing conservative authority retained. Unreconciled locations become Settings-only; explicit owner-approved configuration is required for operational navigation. Independent-session configuration edits need normal refresh/reload; no realtime invalidation. Backend module enforcement is NOT active. V2-005 action binding/location RLS and legacy reconciliation remain Production blockers. V2-004.004 NOT STARTED; parent V2-004 stays open; main and Production untouched.
