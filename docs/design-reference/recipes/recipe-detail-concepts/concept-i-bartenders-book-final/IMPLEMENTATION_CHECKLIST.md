# View I — Implementation Checklist

Checklist only. Nothing here has been done. Work on a feature branch, integrate to `development`, and do not merge to `main` without owner approval.

## Phase 0 — Before coding

- [ ] Read `README.md`, `IMPLEMENTATION_SPEC.md`, `RESPONSIVE_SPEC.md`, `DATA_MAPPING.md`, `COMPONENT_MAP.md`.
- [ ] Open the final mockup and `view-i-reference.html` in a browser; keep them beside the app.
- [ ] Re-read the current `recipe-detail*.tsx`, `recipe-glance.ts`, `recipes-module.tsx`, and the editor access code (not reviewed for this package).
- [ ] Get the owner's decisions on the open items in `COMPONENT_MAP.md`.

## Phase 1 — Preserve existing implementation

- [ ] Keep the current detail screen reachable (feature flag, a `view` prop, or a kept copy) until View I is approved in the real app.
- [ ] No database change, migration, RLS change or Recipe-content edit.
- [ ] No change to the importer, image storage or image URL logic.
- [ ] Note which tests assert the old structure.

## Phase 2 — Shell

- [ ] Add the scoped `.book` tokens (Light and Dark) from `VIEW_I_TOKENS.md`; use existing fonts.
- [ ] Build `RecipeBookHeader`: Back, No., title, chapter marker (double rule), Edit.
- [ ] Build the spread grid with subgrid rows and the 1fr filler row.
- [ ] Build the spine with the 4:5 matted `RecipeImage` and the caption.
- [ ] Remove `pb-24` / `space-y-8` effects for this view; make the root fill `100dvh − header`.

## Phase 3 — Variant content

- [ ] Page header: hollow / filled marker, label, sub-label, "N differences" (House only, dual only).
- [ ] Ingredients with the three-column quantity and hairline rows; `oz | ml` toggle on Perfect.
- [ ] Metadata: Method, Garnish per page; Glass/Rim in the spine when shared (`derivePresentation().mode`), otherwise four fields per page.
- [ ] Preparation with zero-padded serif numerals and verb emphasis.
- [ ] Unit tests: `splitQuantity`, `emphasiseVerb`, `countDifferences`, `isLongRecipe`.

## Phase 4 — Responsive

- [ ] Breakpoints per `RESPONSIVE_SPEC.md` (1440, 1280, 1024, 640, mobile).
- [ ] Long-recipe spine narrowing.
- [ ] Tablet portrait keeps the three-zone spread.
- [ ] Mobile: image band, two pages, collapsible notes, no tabs.
- [ ] Single variant: wide page + spine; mobile one column.

## Phase 5 — Themes

- [ ] Light and Dark verified against the reference screenshots and the live mockup, not against each other.
- [ ] Check contrast, especially the Light note label (see `VIEW_I_TOKENS.md`).

## Phase 6 — Tips

- [ ] Render `variant.tips` only when non-empty.
- [ ] Shared note only when both tips are equal after normalisation.
- [ ] No placeholder, no auto-generated text.
- [ ] Decide `More` for multiple tips only if the owner defines a structure.
- [ ] Decide where Batch notes go (open decision).

## Phase 7 — Validation

- [ ] 1366×768: 0 px document scroll, Old Fashioned and Mojito, Light and Dark, in the real app with the real header.
- [ ] 1440×900, 1180×820, 820×1180: 0 px scroll.
- [ ] 390×844: no horizontal overflow; expected vertical scroll recorded.
- [ ] Owner and Staff permissions (Edit visibility, editor access tests).
- [ ] Recipe CRUD, image upload, archive, browse and picture-book views unchanged.
- [ ] Keyboard, focus, screen reader checks from `ACCESSIBILITY_NOTES.md`.
- [ ] Update, do not delete, existing tests.
- [ ] Complete `VISUAL_ACCEPTANCE.md`.
