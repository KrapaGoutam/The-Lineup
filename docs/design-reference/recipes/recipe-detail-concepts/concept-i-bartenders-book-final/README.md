# View I — The Bartender's Book

## FINAL APPROVED RECIPE DETAIL DESIGN

**Status:** design frozen. **Production implementation has NOT happened.** No application source, Supabase, migration, Recipe content, image storage or deployment was touched while producing this package.

This folder is the source of truth for rebuilding the approved Recipe Detail design inside The Lineup (The Monk's, `src/features/recipes`).

## What is where

| Need                                                                                                                    | File                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Interactive visual reference (Light/Dark, Laptop/Tablet/Mobile, Old Fashioned/Mojito, tip states, Perfect/House/single) | `Concept I - The Bartenders Book - Final.dc.html` (needs the sibling `support.js`) |
| Clean DOM structure                                                                                                     | `view-i-reference.html`                                                            |
| Reference CSS (scoped under `.book`, light + dark, breakpoints)                                                         | `view-i-reference.css`                                                             |
| Layout, typography, colour, behaviour                                                                                   | `IMPLEMENTATION_SPEC.md`                                                           |
| Breakpoint behaviour                                                                                                    | `RESPONSIVE_SPEC.md`                                                               |
| Field-by-field data sources and gaps                                                                                    | `DATA_MAPPING.md`                                                                  |
| Existing code to reuse, change or add                                                                                   | `COMPONENT_MAP.md`                                                                 |
| Spacing, type, colour, image tokens                                                                                     | `VIEW_I_TOKENS.md`                                                                 |
| Pass/fail criteria                                                                                                      | `VISUAL_ACCEPTANCE.md`, `ACCESSIBILITY_NOTES.md`                                   |
| Measured browser results                                                                                                | `FIT_REPORT.md`                                                                    |
| Phased plan                                                                                                             | `IMPLEMENTATION_CHECKLIST.md`                                                      |
| Ready-to-paste coding prompt (not executed)                                                                             | `IMPLEMENT_VIEW_I_PROMPT.md`                                                       |
| Screenshots                                                                                                             | `references/*.png`                                                                 |

## Reading order

1. `README.md`
2. `IMPLEMENTATION_SPEC.md`
3. `RESPONSIVE_SPEC.md`
4. `DATA_MAPPING.md`
5. `COMPONENT_MAP.md`
6. `VIEW_I_TOKENS.md`
7. `view-i-reference.html`
8. `view-i-reference.css`
9. `VISUAL_ACCEPTANCE.md`
10. `FIT_REPORT.md`

## Do not change

Spacing, type scale, proportions, 4:5 image ratio, page colours, double-rule chapter marker, gutter shade, title hierarchy, decimal-aligned quantities, step numerals and the Bartender Note treatment. If a value here conflicts with the mockup in a browser, the mockup wins.

## Related, separate files

- **View H** (Precision Bartender Board) is a different preserved concept inside `../../../../../Recipe Detail Concepts.dc.html`. It was not changed.
- Concept history (`concept-h-one-look`, `concept-h2-one-look-tips`, `historical`, `approved`) is untouched.

## Known limits of the screenshots

The screenshot renderer re-draws the DOM and wraps text differently from a browser, draws scrollbar tracks inside the frames (the live layout has 0 px horizontal overflow and no document scrollbar on laptop/tablet), does not draw CSS counters, and can overlap short step lines in the House column (visible in `view-i-mojito-laptop.png`). Measurements in `FIT_REPORT.md` come from the live browser layout and show no wrapped or colliding steps on laptop. Do not adjust the design to match renderer artifacts.

## Open decisions for the owner (do not guess in code)

See the end of `COMPONENT_MAP.md`: Quick Measure / Oz Ratio, Batch notes, description, badges and the mobile jump links exist in the current screen and are absent from the approved mockup.
