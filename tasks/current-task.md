# V2-004.004 - Per-location backend module enforcement

Approved: owner prompt 2026-11-06 (explicit implementation authority). Branch feature/v2.0-004.004-backend-module-enforcement.
Worktree .tmp/v2-module-backend-enforcement; baseline 53ad8397dd8712b70846b13b067d9c3c1ef0c06a (PR #303 verified). Issue #304.
Main 5e5b7747693b6e81014eafdf299b87e56c3f033d; Production forbidden.

- [x] Fetch/verify remote baseline; worktree; preserve unrelated work
- [x] Entry-point inventory (98 actions, 9 routes, 80 SQL functions, 31 writable tables)
- [x] Pure decision + readiness domain, server guard, staged DB switch with readiness gate
- [x] Wire 78 Server Actions + page-entry loaders; 20 system actions exempt (tested list)
- [x] DB seams (tasks/inventory/board) + 36 restrictive policies
- [x] pgTAP 0063 (59), clean replay 74 migrations, full pgTAP, real-JWT local suite 15/15
- [x] Unit 3222 pass, format/lint/typecheck/paths, cold CI build
- [x] Hosted DEV read-only readiness: 44 active locations, 0 configured = NOT READY
- [x] Docs: PLAN, ENTRY_POINT_MATRIX, TEST_MATRIX, ROLLOUT_READINESS, EVIDENCE, STATUS
- [x] Push, PR #305 to development, exact-head CI at 732b509: application, browser-smoke, migrations-and-policies, Vercel all PASS
- [ ] Owner decision R1: approved module values for the 44 DEV locations -> then activate DEV and verify

## Current State & Next Step

Implemented, NOT activated. Do not set module_enforcement_settings.mode='active' in any environment until the readiness script says READY and the owner has approved the values (the database refuses otherwise). No merge until the owner decides on the activation dependency. Stop after V2-004.004; V2-005 is not authorized.
