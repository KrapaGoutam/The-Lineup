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
- [ ] Commit, push, open PR into `development`; exact-head CI green
- [ ] **Claude Local**: hosted DEV real-JWT A–G + Chromium/WebKit browser verification, then merge decision

## Current State & Next Step

All Cloud work is complete; PR open for authenticated local verification (`READY_FOR_CLAUDE_LOCAL_VALIDATION`). Next: Claude Local follows `EVIDENCE.md` → "Claude Local handoff". Do NOT start V2-003.005. Do not merge before hosted DEV + browser checks pass.
