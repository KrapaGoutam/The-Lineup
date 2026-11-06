# V2-004.003 — Evidence

## Synchronization (2026-11-06)

Windows local workspace verified against `github.com/KrapaGoutam/The-Lineup`. Original branch `docs/recipes-owner-retest-handoff`, HEAD `508cab9`. Local development before fetch `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`; freshly fetched development `6000e6cdffeb24496fce192020d3edce0f669341`. PR #301's merge is reachable. Clean development worktree `.tmp/v2-staff-assignments` fast-forwarded normally; isolated feature worktree `.tmp/v2-location-module-navigation` created from that remote base. Parent checkout's modified docs/ROADMAP.md, docs/STATUS.md and tasks/current-task.md and all existing untracked worktrees/files preserved. No reset/clean/force operation. Remote main baseline `5e5b7747693b6e81014eafdf299b87e56c3f033d`.

Tracking: [#302](https://github.com/KrapaGoutam/The-Lineup/issues/302). GitHub connector read works but issue creation returned integration 403; authorized local GitHub CLI succeeded. No duplicate issue existed.

## Implementation

Canonical reader follows verified active context/profile hydration in loadPageData; array-serialized validated configuration and profile/org/location identity passed to the client. Pure module-navigation policy intersects enablement/lifecycle/identity with existing role/demo restrictions. Settings unconditional; deterministic Tasks → Allocation → existing secondary order → Settings fallback. All nav tiers, module mounting, Tasks badge/reminder, home/back and Settings shortcuts use policy. No operational action/RPC/RLS enforcement added.

Settings offers active-target recovery using canChangeDesignation, PasscodeResetDialog and unchanged reset endpoint/authority/audit. Native Dialog supplies focus trapping/Escape/restoration for reset and More. Context-unavailable screen provides system-only Settings so inactive/archived contexts retain authorized administration and account recovery without opening an operational location. Module save action refreshes the server response. Independent-session changes require normal reload/refresh; no realtime subscription.

Browser investigation found normalization from the previous shell could overwrite Next's history tree while the address bar already named another context. It now waits for matching verified location props and closes the old workspace during that transition. History provenance is tied to the destination context rather than expiring before slow reconciliation.

## Executed gates (in flight)

Latest source checkpoint: full Vitest 232 files / 3,148 PASS / 7 pre-existing skips; focused navigation/settings/context 276/276 before the final transport cases; webpack builds pass both demo and DEV-bound release modes. Chromium authenticated acceptance 5/5 PASS: native Back/Forward/reload, configuration save refresh, Team-disabled real reset/audit, denied staff reset (403), synthetic self-change/sign-out/new-PIN sign-in, all-missing/all-disabled, cross-org and four-width light/dark matrix. Exact DEV counts after every run equal the baseline below.

WebKit functional assertions passed, but the newly strict pageerror audit exposed canceled fetch transport behavior. Badge and pay-rate reads and the Tasks snapshot controller now handle rejected transport promises; Tasks business commands/authorization are unchanged. The browser test excludes a WebKit access-control diagnostic only when it correlates to an actual canceled/aborted SAME-ORIGIN request; real CORS failures, unhandled rejections and script exceptions remain failures. Final release/HTTPS verification pending. Native focus restoration additionally preserves the trigger across Strict Mode effect replays without synthesizing a close event.

- Focused policy/entry/shell/settings/recovery tests PASS; final count to be recorded after stabilization.
- Full Vitest checkpoint: 230 files, 3,139 PASS, 7 pre-existing skips. Final rerun required after context corrections.
- Webpack production build PASS; final build required after context corrections.
- Typecheck PASS before final context correction. Formatting/check rerun pending; earlier checks caught formatting of a test file being edited during the run.
- Hosted DEV real-JWT navigation suite: 9/9 PASS, including persisted A/B/C, all-missing/all-disabled, inactive/archive, foreign-org refusal and staff role intersection.
- Desktop demo regression: 335/337 PASS on first run; two trace ENOENT failures caused by concurrent runners clearing their shared output directory. All four XM-070 cases then PASS in isolated output. Navigation now owns a separate artifact directory. No allocation source change.
- Authenticated Chromium/WebKit, HTTPS Preview, exact-head CI: pending.

Fixture harness corrections: explicit location assignments are required even for synthetic org owners; inactive assignment correctly rejected by lifecycle guard, fixture fixed to assign only active locations. Initial DEV bundle scan missed route chunks referenced only in RSC; now checks both initial scripts and observed RSC chunk paths before fixtures/authentication. All failed fixture runs verified cleanup.

## DEV safety and cleanup

Only `the-lineup-dev` (`opmujepkemwcdxxorhfd`) is allowed. No Production requests. No migrations; accepted 73-migration canonical contract reused. No production env file read/copied. Local DEV env retained in ignored feature-worktree file; no secrets printed/committed. Existing persistent test PINs/roles/assignments untouched. Only random disposable identities receive recovery mutations.

Successful JWT run exact before = after counts: organizations 30; locations 44; memberships 52; location_memberships 5; overall_roles 0; profiles 53; tasks 42; task_events 44; task_assignments 13; task_notifications 170; task_recurrence_rules 1; checklist_templates 2; checklist_instances 19; passcode_credentials 7; passcode_login_attempts 535; audit_events 1; auth_users 53; location_module_configs 0. Tracked organizations/locations/profiles/auth users removed. Teardown removes tracked module rows, then disposable organizations through their declared FK cascades and synthetic users; no direct audit-row delete or lifecycle bypass.

Final authenticated browser counts/residue and exact commit/Preview/CI/merge evidence will be appended before closure.

## Residuals

Q1 defaults, Q2 missing/unauthorized distinction, Q3 recovery authority and Q4 manager authority remain formally open. Existing conservative authority retained. Unreconciled locations become Settings-only; explicit owner-approved configuration is required for operational navigation. Backend module enforcement is NOT active. V2-005 action binding/location RLS and legacy reconciliation remain release blockers. V2-004.004 NOT STARTED; main and Production untouched.
