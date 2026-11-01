# Prompt for a future coding agent — implement View I

> **Not executed.** This file is a ready-to-paste prompt. Do not run it until the owner approves implementation.

---

You are implementing the approved **View I — The Bartender's Book** Recipe Detail design in The Lineup (restaurant: The Monk's).

**Source of truth** (read first, in order), all under `docs/design-reference/recipes/recipe-detail-concepts/concept-i-bartenders-book-final/`:
`README.md`, `IMPLEMENTATION_SPEC.md`, `RESPONSIVE_SPEC.md`, `DATA_MAPPING.md`, `COMPONENT_MAP.md`, `VIEW_I_TOKENS.md`, `view-i-reference.html`, `view-i-reference.css`, `VISUAL_ACCEPTANCE.md`, `ACCESSIBILITY_NOTES.md`, `FIT_REPORT.md`. The visual truth is `Concept I - The Bartenders Book - Final.dc.html` opened in a browser, with the PNGs in `references/` as secondary aids (the screenshot renderer wraps text differently from a browser).

## Rules

1. **Inspect the current code first.** Start with `src/features/recipes/components/recipe-detail.tsx`, `recipe-detail-variant.tsx`, `recipe-detail-presentation.tsx`, `recipe-image.tsx`, `domain/recipe-detail.ts`, `domain/recipe-differences.ts`, `domain/variant-content.ts`, `domain/recipe-glance.ts`, `recipes-module.tsx`, the recipe detail tests, and `src/app/globals.css`. Names and fields in the handoff were verified on 2026-11-01; re-verify before relying on them.
2. **Presentation only.** Do not change the Recipe data model, Supabase schema, migrations, RLS, importer, image storage or image URL logic. Do not invent fields. If you believe a capability is genuinely missing, stop and report it instead of building it.
3. **Reuse** `variantHasPersistedContent`, `deriveVariantDifferences`, `derivePresentation`, `deriveGlanceFields`/`deriveQuickGlance` (if kept), `RecipeImage`/`useRecipeImages`, and the `RecipeDetailView` props. Add small pure helpers with unit tests for quantity splitting, verb emphasis, difference counting and the long-recipe rule.
4. **Preserve semantics:** Perfect and House keep their current meaning and selection logic; show both together (no tabs); one image per recipe, shown once; Bartender Note shows only persisted `variant.tips`, never generated text, and disappears completely when empty.
5. **Preserve** permissions (Owner and Staff behaviour), Recipe CRUD, image upload and archive flows, browse and picture-book views, and all Recipes V1 functionality. Do not touch unrelated features.
6. **Implement** responsive Light and Dark View I exactly as specified: three-zone spread (Perfect | spine image | House) on laptop and tablet, two pages with an image band on mobile, single-variant layout, long-recipe spine narrowing, mobile collapsible notes, `oz | ml` toggle.
7. **Resolve open decisions** listed at the end of `COMPONENT_MAP.md` with the owner before coding the affected parts. Do not silently drop Quick Measure, Batch notes, description/badges, presentation notes or the Edit entry point.
8. **Validate** at 1366×768 (0 px document scroll with the real app header, Old Fashioned and Mojito/long content, Light and Dark), 1440×900, 1180×820, 820×1180, and 390×844 (no horizontal overflow; record vertical scroll). Complete `VISUAL_ACCEPTANCE.md` and report measured numbers. If the real header exceeds 48 px or the page adds bottom padding, fix the shell for this view; do not shrink the design.
9. **Do not redesign.** Spacing, type, colours, ratios and treatments are frozen. Fix real bugs only.
10. **Git:** work on a feature branch off `development`, integrate to `development` first, and **do not merge to `main` without owner approval.**
11. Update existing tests deliberately rather than deleting them; keep `data-testid` values where practical.

## Deliverable

A pull request containing the View I implementation, helper tests, updated component tests, and a short report with: measured fit numbers, screenshots at the five viewports in both themes, the decisions made on the open items, and any deviations from the spec with reasons.

---
