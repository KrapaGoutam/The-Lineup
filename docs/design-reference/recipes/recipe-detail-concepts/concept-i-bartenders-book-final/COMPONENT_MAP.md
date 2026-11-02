# View I — Component Map

Inspected on `KrapaGoutam/The-Lineup@development` (2026-11-01), `src/features/recipes`. Files read in full: `components/recipe-detail.tsx`, `recipe-detail-variant.tsx`, `recipe-detail-presentation.tsx`, `recipe-image.tsx`, `domain/recipe-detail.ts`, `recipe-differences.ts`, `variant-content.ts`, and `src/app/globals.css`. **Not read:** `recipe-glance.ts`, `recipes-module.tsx`, the editor files, the tests' contents beyond file names. Verify those before relying on them.

## Reuse unchanged

| Item                                                                             | Path                                                  | Why                                                                                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `variantHasPersistedContent`                                                     | `domain/variant-content.ts`                           | Decides which variants exist                                                                                                |
| `deriveVariantDifferences`                                                       | `domain/recipe-differences.ts`                        | Gives `ingredientIds` / `stepIds` per side; use only to count "N differences" in View I (no row highlighting)               |
| `derivePresentation`                                                             | `domain/recipe-differences.ts`                        | Glass / rim / garnish / notes, `mode` shared vs split, `differing` set                                                      |
| `RecipeDetail`, `DetailVariant` types                                            | `domain/recipe-detail.ts`                             | Data contract unchanged                                                                                                     |
| `RecipeDetailView` props `{ recipe, backHref, onBack, restaurantSlug }`          | `components/recipe-detail.tsx`                        | Keep the public contract                                                                                                    |
| `useRecipeImages` and image URL logic                                            | `hooks/use-recipe-images.ts`, `domain/image-rules.ts` | Image pipeline untouched                                                                                                    |
| Tokens and fonts                                                                 | `src/app/globals.css`                                 | `font-serif` is already Newsreader, `font-sans` Geist Sans, `font-mono` Geist Mono; dark base + `:root[data-theme="light"]` |
| `deriveGlanceFields`, `deriveQuickGlance`, `deriveQuickMeasure`, `deriveOzRatio` | `domain/recipe-glance.ts`                             | Only if the owner keeps Quick Glance / Quick Measure (not read here)                                                        |

## Reuse with presentation refactor

| Component                        | Path                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecipeDetailView`               | `components/recipe-detail.tsx`              | Replace the layout: new header (No. / title / chapter), spread wrapper, new page order. Remove or relocate: "‹ Bar Recipes" link row (becomes the in-header Back), `space-y-8 pb-24` wrapper (breaks zero-scroll), Quick Glance band, jump nav, `FinalPresentation` section (image + glass/rim/garnish move into the spine). Keep `heading` focus-on-mount, the `recipe-variant-*` ids, and the `data-testid` values or update the tests deliberately |
| `VariantArticle`                 | `components/recipe-detail-variant.tsx`      | Keep the subgrid idea (`row-span` + `grid-rows-subgrid`), change to 5 content rows + filler. Replace dotted-leader quantities with the three-column quantity; replace `DIFF_ROW` row tinting with the "N differences" label; replace `list-decimal` markers with zero-padded serif numerals; move Quick Measure and Method (now a meta item); move tips into the Bartender Note                                                                       |
| `FinalPresentation` / `SpecList` | `components/recipe-detail-presentation.tsx` | Image + glass/rim move to the spine caption; split-presentation case renders four fields per page instead. The component may be reused for its data logic only                                                                                                                                                                                                                                                                                        |
| `RecipeImage`                    | `components/recipe-image.tsx`               | Add a presentation-only prop (for example `aspect="portrait"`) that renders 4:5 with the **hero** URL and `object-cover`; today `thumbnail` gives 4:5 but also swaps to the small thumbnail URL. Keep `data-testid="recipe-image"` and the Martini fallback                                                                                                                                                                                           |

## New presentation-only pieces (names are suggestions)

Keep this small; do not over-componentize.

- `RecipeBookHeader` — No., title, chapter, Back, Edit.
- `RecipeBookPage` — one variant page (replaces the visual part of `VariantArticle`); renders ingredient list, meta, preparation, note.
- `RecipeBookSpine` — figure with `RecipeImage`, glass/rim caption, optional shared note.
- `BartenderNote` — label + italic text, with the mobile collapse behaviour.
- Helpers (pure, unit tested): `splitQuantity(amount, unit, system)`, `emphasiseVerb(instruction)`, `countDifferences(...)`, `isLongRecipe(variants)`.

## Existing tests to revisit

`components/recipe-detail.test.tsx` (15 KB), `recipe-image.test.tsx`, `domain/recipe-differences.test.ts`, `domain/recipe-glance.test.ts` assert the current structure (for example `recipe-spread`, `recipe-single`, `oz-ratio`). Update deliberately; do not delete coverage.

## Open decisions for the owner

The approved mockup does not show these, but the current screen does. Implementation must not silently drop them:

1. Quick Glance band and Quick Measure / Oz Ratio.
2. Batch notes (`batch_notes`).
3. Recipe description, base spirit, Popular and On menu badges.
4. Mobile "Jump to recipe" links (not needed when both pages are visible).
5. Presentation notes (`presentation_notes`).
6. Edit entry point (where it lives, who sees it).
7. Back label ("‹ Bar Recipes" today vs "← Recipes" in the mock).

Suggested defaults if the owner defers: Batch notes and presentation notes under a `More` disclosure on each page; badges and description kept in a quiet line under the chapter marker only if they fit without breaking the 1366×768 fit; Quick Measure replaced by the `oz | ml` toggle; jump links removed.
