# Recipe Detail — approved implementation reference

**Selected design: Concept E — Editorial Recipe Book**
**Presentation behavior: House presentation differs (supported alongside the shared-presentation state)**

This folder is a visual/design reference. It is not production code.

## What to open

| File                                        | Purpose                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Recipe Detail - Approved E.dc.html`        | Approved reference. Opens on E · Perfect + House · House differs · Desktop · Light. Needs `support.js` beside it. |
| `approved/*.png`                            | Canonical screenshots of Concept E. Use these as the visual target.                                               |
| `historical/Recipe Detail Concepts.dc.html` | Original A–G exploration. History only, not selected. Needs the `support.js` beside it.                           |

Inside the approved HTML, the banner above the frame reads **APPROVED IMPLEMENTATION REFERENCE · CONCEPT E** on E, and **EXPLORATION / NOT SELECTED** on every other concept. Concept G in particular is not the approved design.

## Canonical screenshots (`approved/`)

- `e-desktop-dual-light-house-differs.png` — two-column spread, split Perfect / House presentation
- `e-desktop-dual-dark-house-differs.png`
- `e-desktop-dual-light-presentation-shared.png` — identical presentation, one shared image
- `e-tablet-dual-light-house-differs.png` — Perfect, then House, jump links
- `e-mobile-dual-light-house-differs.png` — Perfect, then House, no tabs
- `e-mobile-dual-dark-house-differs.png`
- `e-desktop-single-perfect-light.png` — single-variant layout

## Approved behavior

1. **Both recipes are complete.** Perfect and House each show ingredients, Quick Measure, optional ratio, method, numbered steps and notes (Bartender Tips / House Notes). House is never reduced to differences only.
2. **Desktop (1440):** two-column editorial spread, Perfect left and House right, with a center hairline. Sections align on shared rows where practical; no filler.
3. **Tablet (820) and mobile (390):** Perfect, then House, stacked. Perfect ↓ / House ↓ jump links. No Perfect/House tabs.
4. **House differences:** a thin accent edge, a light tint, a stronger amount, and a small "House adjustment" note. Not red, not struck through, not warning styling.
5. **Final Presentation follows the recipes.**
   - Identical specs: one shared Final Presentation (Glass, Garnish, Rim) with one image.
   - House differs: separate Perfect Presentation and House Presentation, each with its own specs and image. The House image may reflect the House recipe (for example, no lime wheel when House drops it).
6. **Single variant:** one centered editorial reading column. No empty second column, divider, disabled House placeholder, or unnecessary side rail. Integrate Quick Glance and Quick Measure naturally into the main reading flow; the screenshot's rail is not a requirement.
7. **Quick Glance:** a compact strip under the title (a 2 × 2 grid on mobile). Where Perfect and House differ, the value shows both.
8. **Themes:** Light and Dark, using the existing TheLineup tokens.

## Implementation notes

- Design reference only. Do not copy the prototype HTML into production.
- Build with the existing TheLineup React components, tokens and architecture.
- Preserve the existing Recipes data contracts, permissions, tenant isolation, optimistic concurrency and recipe persistence.
- Preserve private image security, recipe numbering, categories, archive behavior, Picture Book behavior, Staff access, management permissions and House Notes terminology. The cocktail illustration here is a placeholder, not an asset. The reference does not authorize new persisted fields or schema changes.
- Do not invent recipe data. The metadata line ("Signature · Rum · On Menu · Popular") and Style are mock content; Quick Glance must come from the recipe.
- Quick Measure is derived for display from ingredient amounts (fractions ¼ ½ ¾ are display only). Ratio is optional and shown only when it can be derived safely; otherwise omit it.
- Preserve accessibility: 44 px interactive targets, visible focus, logical heading order, and a non-color marker for House differences.
- Type: Newsreader (serif) for title, recipe headings, ingredient names and steps; Geist and Geist Mono for labels and measurements. Both load from Google Fonts in the prototype.

Mock data is static (Coco Mojito). The prototype makes no backend calls.

The prototype loads React, React DOM and Babel from unpkg and fonts from Google Fonts; online access may be required. Serve the directory over HTTP if browser security restrictions interfere with opening it directly.
