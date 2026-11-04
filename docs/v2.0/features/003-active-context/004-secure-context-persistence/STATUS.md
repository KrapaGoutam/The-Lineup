# V2-003.004 — Status

Status: **`READY_FOR_CLAUDE_LOCAL_VALIDATION`** — implementation complete and Cloud gates green; **not merged**. Hosted DEV real-JWT verification and real-browser (Chromium + WebKit iPad) cookie verification are MANDATORY before merge and have **not** been performed (Cloud has no Supabase credentials).

- Issue #290 · Parent #251 · Program #248 · Milestone #8
- Branch `feature/v2.0-003.004-secure-context-persistence` from `development` `398393bfa4f0a8edb5b99f33b78574960d74666a`; PR targets `development` only.
- Migration: none. `main` (`5e5b7747…`) and Production untouched.
- Plan: [PLAN.md](PLAN.md) · Tests: [TEST_MATRIX.md](TEST_MATRIX.md) · Evidence + Local handoff: [EVIDENCE.md](EVIDENCE.md)

## Merge blockers (must all be false after Local validation)

1. unauthorized location persisted · 2. cookie written without server authentication · 3. invalid cookie falls back to a different branch · 4. B-looking workspace performs an A action · 5. missing Referer selects an arbitrary branch · 6. stale/revoked assignment still usable · 7. sign-out leaves context for the next sign-in · 8. cross-organization cookie hydrates another tenant · 9. unverified URL value decides authorization · 10. cookie/selection error hidden as an empty success.

## Open dependencies (not closed here)

V2-003.005 (multi-tab), V2-005 (location RLS + module action binding — Production blockers), V2-008 (backfill).
