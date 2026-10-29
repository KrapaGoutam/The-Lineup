# Recipe Detail concepts

**DESIGN REFERENCE — NOT PRODUCTION SOURCE CODE**

The approved foundation is **E — Editorial Recipe Book** in [Recipe Detail Concepts.dc.html](Recipe%20Detail%20Concepts.dc.html). Use an editorial/book-style presentation. The export is a prototype with illustrative data, not a source of production values or implementation code. It requires the adjacent `support.js`; its runtime loads React, React DOM and Babel from unpkg and fonts from Google Fonts, so online access may be needed. Serve the directory over HTTP if browser security restrictions interfere with opening it directly.

## Approved behavior for the pending redesign

- When both variants exist, Perfect and House are each complete recipes. On desktop, show them side by side with comparable weight and align corresponding major sections where practical. Preserve Concept E's editorial character; dotted ingredient leaders may be used.
- On tablet and mobile, stack complete recipes vertically, Perfect first and House second, with Perfect / House jump navigation where useful. The previous segmented Perfect/House mobile tabs are intentionally superseded for this redesign.
- House differences should be noticeable but restrained: use editorial markers, emphasis or a concise adjustment note, not error styling.
- Final Presentation follows the recipe content. If presentations are equivalent, use one shared section, image, and Glass / Garnish / Rim. If House genuinely differs, show separate Perfect and House specs and values as applicable, and allow separate images reflecting each presentation (for example, a House image without a removed lime garnish). This is **Presentation behavior: House differs**.
- Do not invent values absent from persisted recipe data. Quick Measure is display-derived and preserves source measurement wording. Ratio is optional and appears only when safe to derive.

## Implementation handoff

Inspect the current Recipes implementation first, then this reference. Reproduce the design intent with production React and existing tokens/components, preserving accessibility; do not wholesale-copy prototype HTML. Preserve Recipes data contracts, authorization, tenant isolation, optimistic concurrency, security, image handling, numbering, categories, archive behavior and Picture Book behavior unless a later task explicitly authorizes changes. The approved presentation behavior is an intent, not authorization to invent persisted fields; assess the existing data model and image handling during implementation.

Test dual- and single-variant recipes, identical and House-different presentation, and desktop, tablet and mobile layouts. Implementation is pending.
