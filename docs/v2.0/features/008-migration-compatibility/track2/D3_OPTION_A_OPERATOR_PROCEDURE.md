# D-3 Option A — Operator procedure (Manual Preview, two Staff Assignments)

> **2026-11-13 (later):** D-3 Option A EXECUTED: Manual Preview GM→manager and server→staff both saved via the app and verified; role planner NOOP (Manual Preview and the-monks); ledger 91, migration 92 absent, enforcement staged, Finance off. Manual Preview still has 0 module rows (D-5/5b) and NULL attendance (D-6). See HANDOFF 00000000.2. Supersedes the 'pending' note above.

Approved 2026-11-13. Only these two writes, **performed by Manual Preview's own general manager signed in as themselves**.
The agent does not sign in, click Save, or write via SQL/RPC/API. Never share the passcode/password in chat.

Target: org `the-lineup-manual-preview`, location id prefix `22fe5e` (the only active location).

1. **GM -> `manager`.** Open the DEV app, sign in as the GM (profile prefix `9e915b`). On the "No restaurant location assigned" screen open
   Settings -> Locations -> Staff Assignments, select the location, select your own member record, role `manager`, review, Save.
   Tell the agent "assignment 1 done"; it verifies read-only (one active `manager` row for `9e915b`, nothing else changed).
2. **Server -> `staff`** (only after step 1 is verified). Same screen, select the server (prefix `5cd66c`), role `staff`, review, Save.
3. If the UI blocks either step: STOP, report the exact message. No SQL fallback, no temporary admin.
4. Agent final check: `node track2/dev_org_readonly_snapshot.mjs --org the-monks --org the-lineup-manual-preview` vs baseline; expect exactly two new
   location_memberships rows (`9e915b` manager, `5cd66c` staff); Monks/modules/enforcement/finance/overall roles unchanged; ledger 91.
