# Current task: Bar Inventory V1.1 enhancement

Approved owner scope, 2026-10-28. Branch `feature/bar-inventory-bulk-edit-freshness`
from fetched development `e4cffa8faad478164381899b4588748018c194b6`.
Main baseline `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`; migrations: 56.

- [x] Fetch, clean-tree/branch preflight, create feature branch.
- [x] Audit existing inventory architecture and owner scope.
- [x] Authenticate read-only to expected DEV endpoint `opmujepkemwcdxxorhfd`.
- [x] Verify live DEV management identity and exact migration parity (56/56, latest `20261028193159`).
- [x] Lock repository implementation contract and audit decisions in `docs/features/bar-inventory-v1/ENHANCEMENT_V1_1.md`.
- [x] BI-E1: date groups/rules, migration, secure RPCs, domain and DB tests.
- [x] BI-E2: atomic Bulk Count, review/conflicts, ledger, responsive selection.
- [x] BI-E3: scoped column ordering and personal saved views.
- [x] BI-E4: date detail, Manage rules, filters/sorts, Dashboard alerts.
- [x] BI-E5 pre-PR gates: focused/full tests, DB suites, browser matrix, both builds/scans.
- [x] Hosted DEV synthetic validation and independent zero-residue verification.
- [x] Synchronize docs; review security/accessibility/tenant isolation/scope.
- [ ] Green commits/push, PR to development, exact-head CI, merge commit.
- [ ] Verify final development, unchanged main, clean tree; completion report.

## Execution state

Access blocker resolved with owner's `LINEUP_SUPABASE_ACCESS_TOKEN` mapping.
Independently verified live DEV name/ref/region and 56/56 migration parity.
BI-E1–E4 implemented and validated. Five additive migrations applied to local and
verified DEV (61 total). Full browser matrix: desktop 84, WebKit tablet 84,
mobile 82 + 2 established card-layout skips. Hosted new DB suite 10/10 plus
four-table Realtime authorization PASS; synthetic residue independently zero.
Final gates: focus 36 files/760; full 155/2,002; pgTAP 48/1,538; browser 250 + 2
existing skips; hosted UI 4/4 and new DB 10/10; both builds and final PROD-ref/
secret/path scans PASS. DEV/repository parity 61/61. CI/PR/merge remain pending.
The 10px tablet shell overflow reproduced on baseline e4cffa8 and was fixed with
secondary-nav width containment; no Recipes implementation change.

## Prior preflight blocker (resolved)

Local Supabase CLI login lists only JobQuest projects. Supabase connector requires
a missing `link_id`. Local DEV credentials successfully read the expected endpoint;
cached project metadata identifies `the-lineup-dev`. No cloud mutation attempted.
Correct management connection requested; migration/parity gates remain pending.
The elevated read-only CLI project listing succeeded but returned only
`jobquest-dev` and `jobquest-prod`, proving this login does not expose The Lineup.
Do not infer live migration parity from cached linked-project metadata.
No application code/schema changes, tests, commits, pushes or PR in this attempt.
Resume by verifying the correct DEV connection and all 56 migration versions
before beginning BI-E1. Use an explicit feature-branch push destination.
Recipes R-2g not started. Production and main remain untouched.

## Previous task record: Recipes V1 Combined R2-F + R2-G Final R-2 Implementation

- [x] Mandatory preflight: verify branch `feature/recipes-v1-r2-management`, clean working tree, record starting HEAD `d1e91da96163a8e202be2044a3caf866db3fbc94`.
- [x] Verify baseline tests: focused Recipes Vitest (25 files / 217 tests PASS).
- [x] Implement pure domain helpers for Quick Measure, Quick Glance, and conservative optional derived oz ratio in `src/features/recipes/domain/recipe-glance.ts` with unit tests.
- [x] Update `RecipeDetailView` in `src/features/recipes/components/recipe-detail.tsx`:
  - Quick Glance section near top (compact, handles partial/empty variants gracefully).
  - Quick Measure section at the start of each variant card.
  - Optional conservative oz ratio displayed alongside Quick Measure when trustworthy.
  - Bartender Tips section labeled `BARTENDER TIPS`, preserving line breaks, omitted when empty.
  - Move hero `RecipeImage` after recipe content, centered with max-width constraint (16:10).
  - Responsive mobile tabbed view & desktop 2-column view with touch targets >= 44px.
- [x] Verify category reassignment in editor and add comprehensive domain/component tests covering management category changes, dirty state, cancel preservation, save persistence, stale conflict handling, and grouping updates.
- [x] Add accessibility improvements and automated tests: heading hierarchy, buttons/links, WAI-ARIA tabs, image alt, focus states.
- [x] Run focused Recipes Vitest tests and expand coverage (27 files / 237 tests PASS).
- [x] Run full Vitest suite (151 files / 1,930 tests PASS).
- [x] Run `npm run check` (Prettier, ESLint, route types, `tsc --noEmit` PASS).
- [x] Run Playwright Recipes matrix across desktop Chromium, WebKit `host-tablet`, and `server-mobile` (45/45 PASS).
- [x] Run production builds: DEV-pinned build and explicit-empty public Supabase build PASS.
- [x] Run bundle and security scans (`check-nonprod-env.mjs`, `check-tracked-local-paths.mjs` PASS).
- [x] Run database security regression against DEV database `opmujepkemwcdxxorhfd` (13/13 PASS).
- [x] Execute Owner Visual Preview flow with Recipe #16 Old Fashioned in a temporary DEV preview org, capture desktop/tablet/mobile/Picture Book screenshots, and clean up with 0 residue.
- [x] Execute hosted DEV validation with synthetic recipes and verify clean teardown (5/5 PASS, 0 remaining rows, 0 storage orphans).
- [x] Update documentation: `R2_HANDOFF.md`, `IMPLEMENTATION_PLAN.md`, `UI_UX_PLAN.md`, `TEST_MATRIX.md` (explicitly deferring Realtime under `B-RC-3`).
- [ ] Push clean commits to `feature/recipes-v1-r2-management`.
- [ ] Open Recipes R-2 PR to `development`.
- [ ] Verify exact-head CI passes on PR head SHA.
- [ ] Merge R-2 into `development` using a merge commit (`--no-ff`).
- [ ] Verify merged `development` SHA, confirm `main` and PROD are untouched.
