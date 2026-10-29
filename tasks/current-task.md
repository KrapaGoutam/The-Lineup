# Recipes + Inventory integration sanity — GO; PR/CI next

- Branch: `fix/recipes-inventory-integration-sanity`.
- Baseline development: `508cab9584bb77aacee89107f2d6940314b47214`; main: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`.
- Worktree: `.tmp/integration-sanity`; original `docs/recipes-owner-retest-handoff` worktree untouched.
- Scope: IS-01–IS-20, focused demo browser fixtures and static mutation/auth contracts. No database/live operational writes.
- Data/auth: shared verified membership organization identity; separate module tables/RPCs. Recipes readable by staff, management writes; Inventory management-only.
- UI states: existing loading/error/empty/success and permission coverage reused; inspect normal responsive shell, light/dark focus and safe cancelled dialogs.
- Risk: shared Light ring and shell sticky-header attribute from #235; inspect for CSS spillover, query interference and unintended API calls.
- Tests: focused existing units first, manager navigation and Inventory smoke on Chromium/WebKit/mobile, one cross-module boundary test if existing coverage lacks it. Reuse #235 full CI; no full Vitest/build without application changes.
- SHELVED / LATER: owner acceptance retest; RD-E-005/007/008; O-1–O-4; Staff TC-19; persistent DEV realistic-data review. #234 and milestone #7 remain open.

## Checklist

- [x] Verify remote baseline/auth and preserve shelved work in isolated branch.
- [x] Discover actual modules, navigation, state, shared shell/theme and authorization contracts.
- [x] Focused unit/component verification: 11 files / 116 tests.
- [x] Targeted browser IS-01–IS-20: 15 unique cases pass; IS-17 not applicable; no integration defect.
- [x] Synchronize TEST_MATRIX, STATUS, ROADMAP, backlog and #220 (GO completion update; release still pending).
- [ ] Review, commit, push and PR to development; exact-head CI.
- [ ] Merge commit after GO/green; verify development and unchanged main.

No application source changes were required. Added only `tests/e2e/recipes-inventory-integration.spec.ts` for the missing cross-module boundary. Canonical IS-01 through IS-20 and limitations: [TEST_MATRIX](../docs/features/recipes-v1/TEST_MATRIX.md#recipes--inventory-integration-sanity--2026-10-29).

Validation executed:

- `npx vitest run src/lib/app-tab.test.ts src/hooks/use-theme.test.tsx src/features/auth/domain/passcode.test.ts src/features/recipes/actions/recipe-actions.test.ts src/features/recipes/actions/recipe-write-actions.test.ts src/features/recipes/actions/recipe-management-actions.test.ts src/features/recipes/actions/recipe-image-actions.test.ts src/features/recipes/components/recipes-module.test.tsx src/features/bar-inventory/domain/stock-rules.test.ts src/features/bar-inventory/hooks/use-catalog-controller.test.tsx src/features/bar-inventory/components/table-kit/filterable-table.test.tsx` - 116/116 pass.
- `npx playwright test tests/e2e/recipes-inventory-integration.spec.ts tests/e2e/bar-inventory.spec.ts tests/e2e/bar-inventory-inventory.spec.ts tests/e2e/bar-inventory-responsive.spec.ts --grep 'Recipes and Inventory isolate|a manager reaches|Critical first|item sheet and the add-product' --workers=1` with `PLAYWRIGHT_BASE_URL=http://localhost:3018` - nine existing cases pass; five integration cases pass; one theme-fixture assumption corrected.
- Final `npx playwright test tests/e2e/recipes-inventory-integration.spec.ts --workers=1` on 3018 - 6/6 pass across Chromium desktop, real WebKit tablet and mobile with persisted Light/Dark preference. Earlier draft RGB serialization assertion corrected; no application fix.
- `npx.cmd eslint tests/e2e/recipes-inventory-integration.spec.ts --max-warnings=0` - pass. Scoped Prettier and `git diff --check` before commit.
- Full local check/typecheck/build/Vitest deliberately not repeated under focused checkpoint instructions. Exact-head PR CI runs repository-standard checks.
- Server: `NEXT_PUBLIC_DEMO_MODE=true npm run dev -- --webpack --port 3018`; existing dependency junction avoids installation; no environment files copied. Initial Turbopack junction resolution failure was tooling only.

GitHub: #220 in-progress update posted; completion/PR/exact-head CI/merge to be recorded there. #234 and milestone #7 verified OPEN; no new issue. PR/head/CI/merge pending. Next: tracking sync, review, push PR to development, require green exact-head checks, merge commit, verify unchanged main. After merge: Recipes V1 release-readiness audit in a new independent session; do not start it here.
