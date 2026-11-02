# View I — Fit Report

Measured in the live browser layout of `Concept I - The Bartenders Book - Final.dc.html` on 2026-11-01. Not from screenshots.

**How to read it.** "Frame" is the device viewport including the 48–52 px app header. "Body" is the area under the header. "Scroll" is `scrollHeight − clientHeight` of the body (document scroll for laptop/tablet; internal scroll for mobile). "H-scroll" is `scrollWidth − clientWidth`. "Spare" is body height minus the head and the spread at natural height (how much room is left). "Wrapped steps" counts step lines taller than 1.5 line heights.

Both recipes in the default state: Perfect + House, per-build notes, oz.

## Old Fashioned (#20)

| State                        | Frame    | Body | Scroll            | H-scroll | Image (mat) | Spine | Page widths    | Spare | Wrapped steps |
| ---------------------------- | -------- | ---- | ----------------- | -------- | ----------- | ----- | -------------- | ----- | ------------- |
| Light laptop                 | 1366×768 | 719  | **0**             | 0        | 224×277     | 256   | 536 / 536      | 91    | 0             |
| Dark laptop                  | 1366×768 | 719  | **0**             | 0        | 224×277     | 256   | 536 / 536      | 91    | 0             |
| Light large laptop           | 1440×900 | 847  | **0**             | 0        | 248×307     | 280   | 557 / 557      | —     | 0             |
| Dark large laptop            | 1440×900 | 847  | **0**             | 0        | 248×307     | 280   | 557 / 557      | —     | 0             |
| Dark tablet landscape        | 1180×820 | 771  | **0**             | 0        | 184×227     | 216   | 463 / 463      | 150   | 0             |
| Light tablet landscape       | 1180×820 | 771  | **0**             | 0        | 184×227     | 216   | 463 / 463      | 150   | 0             |
| Dark tablet portrait         | 820×1180 | 1127 | **0**             | 0        | 160×197     | 192   | 299 / 299      | 289   | 2             |
| Light tablet portrait        | 820×1180 | 1127 | **0**             | 0        | 160×197     | 192   | 299 / 299      | 289   | 2             |
| Light mobile                 | 390×844  | 791  | **88** (internal) | 0        | 88×107      | none  | 194 / 194      | —     | —             |
| Dark mobile                  | 390×844  | 791  | **88** (internal) | 0        | 88×107      | none  | 194 / 194      | —     | —             |
| Single variant, Light laptop | 1366×768 | 719  | **0**             | 0        | 264×327     | 300   | 819 (one page) | 186   | 0             |
| Single variant, Dark laptop  | 1366×768 | 719  | **0**             | 0        | 264×327     | 300   | 819            | 186   | 0             |

## Mojito (#01, long)

| State                                                     | Frame    | Body | Scroll             | H-scroll | Image (mat) | Spine | Page widths | Spare   | Wrapped steps |
| --------------------------------------------------------- | -------- | ---- | ------------------ | -------- | ----------- | ----- | ----------- | ------- | ------------- |
| Light laptop                                              | 1366×768 | 719  | **0**              | 0        | 184×227     | 216   | 556 / 556   | 58      | 0             |
| Dark laptop                                               | 1366×768 | 719  | **0**              | 0        | 184×227     | 216   | 556 / 556   | 58      | 0             |
| Dark large laptop                                         | 1440×900 | 847  | **0**              | 0        | 208×257     | 240   | 577 / 577   | 119     | 0             |
| Dark tablet landscape                                     | 1180×820 | 771  | **0**              | 0        | 156×192     | 188   | 477 / 477   | 117     | 0             |
| Dark tablet portrait                                      | 820×1180 | 1127 | **0**              | 0        | 140×172     | 172   | 309 / 309   | 261     | 0             |
| Light mobile                                              | 390×844  | 791  | **131** (internal) | 0        | 88×107      | none  | 194 / 194   | —       | —             |
| Dark mobile                                               | 390×844  | 791  | **131** (internal) | 0        | 88×107      | none  | 194 / 194   | —       | —             |
| Dark mobile, shared note                                  | 390×844  | 791  | **57** (internal)  | 0        | 88×107      | none  | 194 / 194   | —       | —             |
| Dark mobile, no note                                      | 390×844  | 791  | **49** (internal)  | 0        | 88×107      | none  | 194 / 194   | —       | —             |
| Single variant (Perfect only and House only), Dark laptop | 1366×768 | 719  | **0**              | 0        | 264×327     | 300   | 819         | 185–186 | 0             |

Note on the earlier ≈40 px figure: that was measured on the pre-freeze build before the final spacing pass. The frozen build measures **58 px** spare for the Mojito at 1366×768. The contract is "0 px scroll"; the spare value is informational.

## Mobile, what sits below the 390×844 fold

| State                          | Below the fold                                     |
| ------------------------------ | -------------------------------------------------- |
| Old Fashioned, per-build notes | Perfect step 05, both notes                        |
| Mojito, per-build notes        | Perfect steps 05–06, House steps 05–06, both notes |
| Mojito, shared note            | Perfect steps 05–06, House steps 04–06             |
| Mojito, no note                | Perfect steps 05–06, House steps 05–06             |

Not measured separately: Old Fashioned with shared note or no note on mobile (not required by the contract).

## Renderer caveat

Screenshots in `references/` come from the preview's DOM re-renderer. It does not draw CSS counters, can drop the "0" of step numerals, and wraps some House step lines differently (the Mojito screenshot shows overlapping short steps). Browser layout, as measured above, has 0 wrapped steps on laptop and landscape tablet. Do not change the design to match the screenshots.

## Production risk to the contract

Zero scroll holds only if the real app header is ≤ 48 px at 1366×768 and the page adds no extra vertical padding. `RecipeDetailView` currently has `space-y-8 pb-24`; this must be removed for View I. Re-measure in the real app.
