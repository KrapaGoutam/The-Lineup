# Current task: Recipes V1 R2-E COMPLETE

- [x] Verify branch/starting HEAD 2f820078 and clean working tree.
- [x] Read R2_HANDOFF.md, current-task.md, and R2-E locked specs (IMPLEMENTATION_PLAN.md, UI_UX_PLAN.md, DATA_MODEL.md, TEST_MATRIX.md).
- [x] Implement useViewPreference hook (list | picture, localStorage try/catch, SSR/hydration safe) with unit tests.
- [x] Implement shared recipe filters and sorting helpers in domain (All, Popular, On menu, Non-alcoholic, Book order, A-Z) with unit tests.
- [x] Implement Picture Book card (recipe-card.tsx) with single link target, thumbnail/placeholder, recipe number, name, Popular star.
- [x] Implement Picture Book view (recipe-picture-book.tsx) with category grouping, empty category omission, fallback last, and search-flat Results mode.
- [x] Integrate view toggle, filter chips, and sort control in RecipesModule; preserve search/filter/sort across view switches.
- [x] Update recipe data/action index query to include is_menu_item, is_alcoholic, image_thumb_path for Staff and Management.
- [x] Add domain and component tests covering view preference, filters, sorting, Picture Book, search interaction, and role behavior.
- [x] Verify focused Recipes suite, npm run check, and full Vitest suite.
- [x] Verify Playwright suite across desktop Chromium, WebKit host-tablet, and server-mobile.
- [x] Verify DEV-pinned build, explicit-empty build, zero PROD references / secrets, and migrations remain 56.
- [x] Validate on hosted DEV with synthetic recipes (view switch, filters, sorting, search-flat, archived state, Staff access) and clean up synthetic data with 0 residue.
- [x] Update R2_HANDOFF.md, current-task.md, commit coherent changes, push to origin/feature/recipes-v1-r2-management, and verify local=remote.

