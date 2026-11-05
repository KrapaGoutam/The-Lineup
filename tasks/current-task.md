# V2-003.004 — Secure Active Context Persistence

Canonical docs: `docs/v2.0/features/003-active-context/004-secure-context-persistence/`
Parent Feature: Issue #251 · Program: Issue #248 · Subfeature Issue: #290 · Milestone #8
Branch: `feature/v2.0-003.004-secure-context-persistence` (from `origin/development` `398393bfa4f0a8edb5b99f33b78574960d74666a`)
Environment: Claude Code Cloud

## Implementation Checklist

- [x] Pre-flight: SHAs recorded; PRs #287/#289 verified merged; Issue #290 created
- [x] Audit: cookie contract, reader, switcher, sign-out, `getPrimaryLocation` call sites, entry path
- [x] Domain: central cookie attributes (`context-cookie.ts`), request-consistency hint
- [x] Server: cookie writer, `setActiveContextAction` / `clearActiveContextAction`, sign-in/sign-out cookie expiry
- [x] `getPrimaryLocation` resolves from the persisted context; Referer reject-only
- [x] Client: `useContextSwitch` via the action; `ContextReconcileGate`; recovery "Clear saved location"; ordered sign-out helper
- [x] Tests: PERSIST-01…36 + negatives (Vitest 2,880 passed / 7 skipped); mutation checks
- [x] format:check, lint, typecheck, check:local-paths, `next build --webpack` (demo + real)
- [x] Playwright demo desktop + server-mobile 26/26
- [x] Hosted-test files updated/added for Local (not executed in Cloud)
- [x] Docs: PLAN / STATUS / TEST_MATRIX / EVIDENCE; ROADMAP, CURRENT_STATE, 003 README/STATUS
- [x] Commit, push, open PR #291 into `development`
- [ ] Exact-head CI green (verify on the final PR head)
- [x] **Claude Local**: hosted DEV real-JWT 46/46, Chromium 25/25 + WebKit iPad 25/25, passcode/sign-out/races verified; one narrow `Secure`/`X-Forwarded-Host` hardening (see EVIDENCE.md)
- [ ] Exact-head CI green on the new PR head, then regular merge into `development`

## Current State & Next Step

Locally validated (`LOCALLY_VALIDATED`, 2026-11-04). Next: verify CI on the final PR head, regular merge commit into `development`, then a docs-only closeout PR. Do NOT start V2-003.005.
