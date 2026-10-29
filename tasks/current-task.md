# Recipes V1 release-readiness audit — GO to Production preflight; PR/CI next

- Branch: `audit/recipes-v1-release-readiness` (from `development`).
- Starting development: `754b34a5d5860269f2fda48b27efb56fbfb90993`; main: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05` (unchanged).
- Scope: independent, read-first audit; documentation and tracking only. No application, schema, Production, `main`, import or Inventory-injection change.
- Report: [RELEASE_READINESS_AUDIT](../docs/features/recipes-v1/RELEASE_READINESS_AUDIT.md).
- Decision: **GO — READY TO ENTER PRODUCTION PREFLIGHT.** No release blocker. Not release approval.

## Checklist

- [x] Verify baseline (`754b34a`), create audit branch.
- [x] Areas A–P: features, migrations, RLS/authorization, concurrency, archive, Storage/images, import tooling, numbering, Recipe/Inventory boundary, navigation/responsive/accessibility, tests, CI, secrets, Production preconditions, Bar Inventory data status.
- [x] Classify #234 and shelved items; Staff and owner-retest decisions.
- [x] Targeted validation: Recipes Vitest 30 files / 281 tests, typecheck, ESLint, throwaway PostgreSQL reproduction of F-1.
- [x] Update STATUS, ROADMAP, IMPLEMENTATION_PLAN, TEST_MATRIX, backlog, this file.
- [ ] Commit, push, PR to `development`, exact-head CI, merge commit, verify development and unchanged main.
- [ ] Post audit result on #220; verify #234 and milestone #7 remain open.

## Findings

- No release blocker.
- Preflight work: import script refuses Production (P-3); canonical 38-Recipe payload not in repository (P-4); 7 pending migrations (2 Recipes + 5 Inventory V1.1).
- F-1 Low (reproduced): `bar_recipe_category_reorder` unknown-ID validation is vacuous; manager-only, tenant-scoped; fix before Production migration batch recommended (owner decision).
- Coverage gaps (non-blocking): CI browser smoke desktop-only; no pgTAP run on the combined tree before the release PR; Staff TC-19 manual run shelved (technically covered).
- Bar Inventory Production data injection source not established by repository evidence.

## Tests actually run

- `npx vitest run src/features/recipes scripts/recipes scripts/check-nonprod-env.test.ts` — 30 files / 281 tests pass.
- `npm run typecheck` pass; `npx eslint src/features/recipes scripts/recipes` clean.
- Not run: full Vitest, build, Playwright, pgTAP, hosted suites (recorded evidence and exact-head CI relied on).

## Current State & Next Step

Audit complete; remaining work is Git/GitHub (commit, PR, CI, merge, #220 comment). Next phase after merge: **Release Candidate Validation / Production Preflight Preparation** — new session (Codex Local, GPT-6.1 Sol, high; fallback Claude Code Cloud, Sonnet 5.5, high). Do not start automatically.
