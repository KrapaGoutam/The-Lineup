# View I — The Bartender's Book Implementation

Approved feature: Final Recipe Detail View I (The Bartender's Book)
Baseline: `origin/development` = `152401fea9eb6b2d4057747b44a2836602423a54`
Branch: `feature/recipe-detail-view-i`
Worktree: `.tmp/recipe-detail-view-i`

## Implementation Checklist

- [x] Phase 0: Preflight and handoff reading (12 documents, tokens, reference CSS/HTML, fit report)
- [x] Phase 0: Baseline test suite verification (`vitest run src/features/recipes` - 28 files, 270 passed)
- [x] Phase 1: Pure domain presentation helpers & unit tests (`splitQuantity`, `emphasiseVerb`, `countDifferences`, `isLongRecipe`)
- [x] Phase 2: Scoped View I stylesheet (`recipe-book.css`) with light theme contrast adjustment (`--k-acc: #8a5112`)
- [x] Phase 3: `RecipeImage` portrait aspect prop (`aspect="portrait"` with hero URL and 4:5 crop)
- [x] Phase 4: `RecipeBookHeader`, `RecipeBookPage`, `RecipeBookSpine`, and `BartenderNote` components
- [x] Phase 5: Rebuild `RecipeDetailView` with dual open-book spread and single-variant layouts
- [x] Phase 6: App shell layout scoping for Recipe Detail (header ≤ 48px, zero vertical padding)
- [x] Phase 7: Functionality preservation (Edit entry point, permissions, Quick Measure/Ratio, More details, navigation)
- [x] Phase 8: Unit tests & component tests passing (`npm run check` and `vitest run src/features/recipes` - 29 files, 287 passed)
- [x] Phase 9: Playwright browser QA across Light/Dark, Laptop (1366x768), Tablet (Landscape/Portrait), Mobile (390x844), and Single Variant
- [x] Phase 10: 1366x768 0 px document scroll verification report (`scrollAmount === 0`, `scrollHeight <= 768`, `headerHeight <= 48px` on dual and single builds across both Light and Dark themes)
- [ ] Phase 11: Git commit on `feature/recipe-detail-view-i`, push, PR creation, CI monitoring, merge commit to `development`

## In flight

Phase 11: Staging changes, creating commit on `feature/recipe-detail-view-i`, pushing branch, opening PR to `development`, and completing merge commit (`--no-ff`).
