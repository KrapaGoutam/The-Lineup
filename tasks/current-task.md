# V2-003.001 — Active Organization / Location Context Resolution

Canonical docs: `docs/v2.0/features/003-active-context/001-context-resolution/`
Parent Feature: Issue #251 · Program: Issue #248 · Subfeature Issue: #283 · Milestone #8
Branch: `feature/v2.0-003.001-context-resolution` (from `origin/development` `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`)
Environment: Claude Code Cloud (implementation explicitly assigned by the owner)

## Implementation Checklist

- [x] Pre-flight: SHAs recorded; PR #282 verified merged; Issue #250 closed
- [x] Issue #283 created under #251 (milestone #8)
- [x] Audit: resolver/readers/RLS/loaders; role-authority divergence found (PLAN §6)
- [x] Domain: `context-cookie.ts`, `active-context.ts` (pure, over canonical resolver)
- [x] Data: `active-context.ts` loader (RLS client, `auth.getUser()`, error-discriminating), read-only cookie reader
- [x] Loaders: `locationForLoader`; schedule/tips/allocation accept a verified scope; legacy helper isolated
- [x] Entry: `loadPageData` integration, `getEntryUser`, `RestaurantEntry`, `ContextUnavailableNotice`
- [x] Tests: CTX-01…27 (Vitest, 115 new; full suite 2,732 passed / 7 skipped)
- [x] format:check, lint, typecheck, check:local-paths, `next build --webpack`
- [x] Docs: PLAN / STATUS / TEST_MATRIX / EVIDENCE; CURRENT_STATE, ROADMAP, 003 STATUS/README
- [ ] Playwright desktop + mobile regressions (demo)
- [ ] Commit, push, open PR into `development`; exact-head CI green
- [ ] Merge (only if all gates pass; otherwise Codex Local handoff on the same PR)

## Current State & Next Step

All code and unit/boundary tests are complete and green locally. Remaining: Playwright demo regressions, commit/push/PR, exact-head CI, then merge-or-handoff decision (see PLAN §10 and the owner-decision flag on Org Owner/GM without a location assignment). Do NOT start V2-003.002.
