# V2-004.002 — Evidence

## Baseline/environment

Linux x86_64 Codespaces, Node 24.22.2, npm 11.19.1, Codex CLI 0.166.0, Supabase CLI 2.76.8. Docker unavailable. Chromium/WebKit installed. Supabase DEV process credentials present; no secrets persisted to disk. GitHub calls work with normal network approval (sandboxed initial auth status was misleading).

Live GitHub baseline rechecked before worktree mutation: development `0024bc8355cd5b2899f5c1721981508b285e296f`, main `5e5b7747693b6e81014eafdf299b87e56c3f033d`; PR #299 merged at development baseline. Initial checkout clean at older `fcc661d`; preserved untouched. No other worktrees or target branches existed.

## Implemented

Settings → Locations → Manage → Modules. Nine configurable registry entries plus immutable Settings. Immediate explicit per-module choices; no default writes. Three persisted states. Request-scoped actions delegate to server-only injectable data helpers; target organization derived from verified location then compared to editor binding. Canonical admin authority + RLS, actor check, archived guard. INSERT for missing, updated_at-conditional UPDATE otherwise; RETURNING row validated before reporting success. No metadata editing; supplied metadata rejected, stored metadata preserved. Last-writer attribution retained, full append-only preference history deferred as not required. No delete, operational gating or assignment/catalog writes.

Demo source owned by administration session, no remote calls. Pending saves prevent close/tab switch; failed choice remains available for retry. Errors retain schema/transport/invalid-row/unauthorized/location distinctions; no raw database error text leaks tenant information.

## Executed validation

- Final full Vitest: 225 files, 3,099 PASS, 7 existing skips (190.08s).
- Final webpack production build PASS.
- DEV real-JWT suite: 15/15 PASS, including new actual writer path. Counts before and after: organizations 30, locations 44, memberships 52, profiles 53, overall_roles 0, location_module_configs 0. Tracked residual organizations/locations/auth users 0. No persistent test account PIN/role/assignment changed.
- Combined formatting/lint/typecheck PASS; standalone TypeScript and local-path checks PASS.
- Demo WebKit 4/4 widths PASS, Chromium 4/4 final rerun PASS, phone Chromium 4/4 PASS. Real authenticated Chromium DEV flow PASS (47.2s), verified DEV public bundles and pre/post counts identical across measured task/auth/config fixture scope. Real WebKit tablet authenticated flow PASS (46.4s); cleanup diff {}. HTTPS Preview/exact-head PR/CI pending; do not merge until accepted.

Initial new JWT test targeted an already archived fixture; corrected to active fixture, rerun passed. Initial browser server denied socket bind; approved loopback execution used. Turbopack could not resolve parent-installed Next across worktree boundary; supported webpack server used. Overlapping build/dev attempt stopped before final browser run.

## Decisions/dependencies

Q1 defaults stays open: zero rows until explicit choice. Q2 missing/unauthorized stays open: canonical admin guard before reader, neutral unavailable message, no RPC/enumeration. Q3 recovery stays open: Settings system-required; self passcode/sign-in/out/context unchanged; Team manager reset entry and backend must remain reachable in .003/.004. Q4 authority stays open: conservative Overall Owner/Manager or active org Owner/GM only. No frontend isManager authorization.

V2-004.003 navigation, .004 backend enforcement, V2-005 location scoping, V2-008.004 owner-approved backfill deferred. No Production contact.

## Review

Reviewed diff for tenant selectors, authority, lifecycle, stale identity/version, metadata, RLS enforcement, secrets and unrelated scope. No schema/type regeneration required. Main source adds no enforcement consumer. Existing static isolation test now permits only the administration host; operational shell remains disallowed. Phone screenshot visually reviewed (390px), no overflow; buttons and status text fit. Final light/dark responsive matrix 12/12 PASS across desktop Chromium, iPad WebKit and mobile Chromium at 1366/1024/768/390px. Existing location administration desktop regression 4/4 PASS. Review corrected auth transport classification and added regression coverage (focused 23 files / 324 PASS).
