# View I — Visual Acceptance

The real implementation passes only if every box is true when compared in a browser with the mockup (`Concept I - The Bartenders Book - Final.dc.html`) at the same viewport, theme, recipe and tip state.

## Laptop 1366×768 (Light and Dark, #20 and #01)

- [ ] Zero document scroll including the real app header.
- [ ] Recipe number, title and category visible.
- [ ] Perfect and House visible together; no tabs.
- [ ] All ingredients and measurements visible; decimal points align down each column.
- [ ] Method and Garnish on each page; Glass and Rim shown once in the spine when equal.
- [ ] All steps visible, one line each, verbs emphasised, numerals in serif bronze.
- [ ] Bartender Note visible on each page when a persisted tip exists.
- [ ] Image visible in the spine, 4:5, matted, single copy.
- [ ] Mojito: spine narrower, all six steps per page and both notes visible.
- [ ] No ingredient cards, no row highlighting, no red or warning colour.

## 1440×900, tablet landscape, tablet portrait

- [ ] 0 px scroll.
- [ ] Three-zone spread kept at 820 wide (never stacked).
- [ ] Wrapped lines allowed on portrait tablet; no overlap, no truncation.

## Dark mode

- [ ] Low glare: no pure black surfaces, no glow.
- [ ] Measurements and numerals clearly readable.
- [ ] Spine rules and page edges visible.
- [ ] Image well distinct from the page.

## Light mode

- [ ] Warm ivory pages, ink text, bronze accent, no pure white.
- [ ] Gutter shade subtle.

## Mobile 390×844

- [ ] No horizontal overflow.
- [ ] Perfect and House both recognisable above the fold and comparable (no tabs).
- [ ] Title and chapter marker do not wrap awkwardly (long titles balance onto two lines).
- [ ] Image band shows the photo and caption; shared note beside it when selected.
- [ ] Notes collapse to two lines, tap targets ≥ 44 px (unit toggle is a 36 px button with extended spacing: confirm the hit area is ≥ 44 px in the real app).
- [ ] Vertical scroll within the recorded range (about 49–131 px in the mockup frame).

## Tip states

- [ ] Per build, shared, none all render; none leaves no gap and no placeholder.

## Single variant

- [ ] No empty second page; wide page + spine centred; note, meta and image kept; Light and Dark.

## Behaviour

- [ ] `oz | ml` converts oz rows only; text amounts untouched.
- [ ] "N differences" appears only on House in dual state; hover/focus reveals the detail.
- [ ] Perfect and House remain visually equal in weight.
