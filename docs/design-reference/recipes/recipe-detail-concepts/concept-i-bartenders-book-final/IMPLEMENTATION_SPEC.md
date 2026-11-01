# View I — Implementation Spec

All values come from the approved mockup. `px` unless stated. Fonts already exist in the app: `font-sans` = Geist Sans, `font-serif` = Newsreader, `font-mono` = Geist Mono.

## 1. Structure

```
main.book                      (flex column, min-height = 100dvh − app header)
 ├ header.book-head            No. / title / chapter, Back, Edit
 └ div.book-spread             grid: [Perfect] [spine] [House]
     ├ article.book-page--perfect   (subgrid rows)
     │    header · ingredients · meta · preparation · note
     ├ figure.book-spine
     └ article.book-page--house
```

- The spread is `display:grid`, columns `minmax(0,1fr) var(--cc) minmax(0,1fr)`, rows `repeat(5,auto) minmax(0,1fr)`.
- Each page is `grid-row: 1 / span 6; display:grid; grid-template-rows: subgrid`. Header, ingredients, meta, preparation and note therefore start on the same line on both pages, even when ingredient counts differ (Mojito: 5 vs 6). The existing `VariantArticle` already uses the same subgrid pattern (`lg:row-span-6 lg:grid-rows-subgrid`).
- The sixth row (`minmax(0,1fr)`) absorbs leftover height so the spread fills the viewport.
- The spread has `flex: 1 0 auto`, margin `0 var(--iM) var(--iM)`, border `1px var(--k-line2)`, radius 6 (tablet and up), `overflow:hidden`.

## 2. Page widths (laptop 1366 example, Old Fashioned)

Inner width 1366 − 2×18 margin − 2 border = 1328. Spine 256. Each page 536. Mojito: spine 216, each page 556. See `RESPONSIVE_SPEC.md` for every breakpoint.

## 3. Header

| Element   | Spec                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container | grid `1fr auto 1fr`, gap 16, padding `var(--tI) var(--iM) 12px`                                                                                                                                                                 |
| Back      | 11.5 / 1, 600, tracking .16em, uppercase, `--k-mute`, min-height `--tap`. Text `← Recipes` (mockup copy; the live app currently reads "‹ Bar Recipes", keep the existing wording if the owner prefers)                          |
| Edit      | same style, `--k-ink`, right aligned                                                                                                                                                                                            |
| Number    | `No. 20`: "No." Newsreader italic 400 15px `--k-acc`; digits Geist 600 13px tracking .1em                                                                                                                                       |
| Title     | Newsreader 400, `--ttl` (25 mobile / 38 landscape tablet / 44 laptop / 50 large laptop and portrait tablet), line-height 1.04, tracking −.015em, `text-wrap: balance`                                                           |
| Chapter   | category, Geist 600 10.5/1, tracking .26em, uppercase, `--k-mute`; flanked by a double hairline (two 1px `--k-line2` rules 3px apart), max-width 540, margin `9px auto 0`. This is the only decorative motif; do not add others |

Recipe number: two digits, zero padded (existing `String(recipe_number).padStart(2,"0")`).

## 4. Page header

- Row: marker + label + trailing 1px `--k-line` rule. Label: Geist 700 12.5/1, tracking .24em, uppercase.
- Marker: 10px circle. Perfect hollow (2px `--k-mute` border). House filled `--k-acc`. This is the non-colour cue (shape) together with the sub-label.
- Sub-label (margin `3px 0 0 20px`): Newsreader italic 400 15/1.3 `--k-mute`. Perfect "Reference Build"; House "The Monk's Build". Static presentation copy.
- House only: "N differences" at the right of the sub-label row, `--k-acc`, italic, `title` lists the differing fields. Not shown for Perfect or in single-variant. Never highlights rows.

## 5. Ingredients

- Section heading: `Ingredients`, Geist 600 10.5/1.2, tracking .2em, uppercase, `--k-mute`, followed by a 1px `--k-line` rule. Min-height 26.
- `oz | ml` toggle sits at the right of the Perfect heading only. Buttons: Geist Mono 600 12, underline 1.5px in `--k-acc` when active, `--k-mute` otherwise, `aria-pressed`. Mobile buttons are 36px tall with −5px vertical margin so they do not grow the row.
- Row: flex, `justify-content: space-between`, min-height `--row`, no card, no fill. Hairline `1px --k-line` between rows (none above the first).
- Name: `--fi`, line-height 1.25, `--k-ink`.
- Quantity: Geist Mono 600 `--fi`, `font-variant-numeric: tabular-nums`, three fixed columns: whole part (right aligned, min-width `--aW`), fraction (left aligned, `--aF`), unit (`--uW`, margin-left `--aG`, 0.8em, 500, `--k-mute`). The decimal point therefore lines up down the column (`1.50`, `0.50`, `0.25`). Text amounts (`8–10`, `top`) go in the whole/unit slot.
- House quantities use `--k-acc`; Perfect uses `--k-ink`.
- Two-decimal rule in oz mode (`0.25`, `1.50`); one decimal at most in ml (`7.5`, `22.5`).

## 6. Metadata

`dl`, grid `minmax(0,1fr) minmax(0,1.5fr)`, gap `6px 16px`, padding `var(--g2) 0`. `dt`: Geist 600 10.5/1.3, tracking .16em, uppercase, `--k-mute`. `dd`: `--fs`, 500, line-height 1.25.

- Per page: **Method**, **Garnish**.
- **Glass** and **Rim** move to the spine caption when Perfect and House have identical glass and rim ("Old Fashioned / Rocks" italic serif 16, then "NO RIM" Geist 600 10.5 tracking .2em). If they differ, render all four fields (Method, Glass, Rim, Garnish) on each page and show no caption values in the spine.
- Rim reads "No rim" when none; otherwise "<value> rim".

## 7. Preparation

- Heading as Ingredients (no toggle).
- `ol`, steps gap `--sg` (0 on laptop where line-height spaces them).
- Step: grid `28px 1fr`, gap 12, line-height `--lh`.
- Number: Newsreader 400 20px (17px mobile), `--k-acc`, zero padded `01`.
- Text: `--fs`, `--k-ink2`. Action verb: 700, `--k-ink`. The verb is the first or second word if it matches Add, Shake, Stir, Strain, Top, Muddle, Pour, Smoke, Serve, Garnish, Express (so "Gently muddle mint" emphasises "muddle"). No match, no emphasis. This is a render-time presentation rule only; step text is never edited.

## 8. Bartender Note

- Container: margin-top `--g2`, padding `8px 12px 9px`, radius 4, background `--k-accs`, top edge `inset 0 1px 0 color-mix(--k-acc 50%, transparent)`. Not an alert, no border box, no left bar.
- Label row: 13px bulb icon (decorative, `aria-hidden`) + `BARTENDER NOTE`, Geist 600 10/1, tracking .2em, `--k-acc`.
- Text: Newsreader italic 400, `calc(--ts + 1.5px)`, line-height 1.35, `--k-ink`, margin-top 3.
- Placement: under each page (per-build), or once under the spine caption (shared). Hidden entirely when there is no persisted tip; the sixth grid row reclaims the space.
- Mobile: collapsed to two lines with `-webkit-line-clamp: 2`, label reads `NOTE +` / `NOTE −`, the whole note is `role="button"` with `aria-expanded`.

## 9. Spine and image

- Column background `--k-mid` plus two 1px `--k-line2` vertical rules 3px inside each edge (the "double spine line").
- Padding `var(--padY) 16px`, items centred, gap 12.
- Image mat: padding 5, 1px `--k-line2`, radius 3, background `--k-p`. Inside, a `4 / 5` portrait well with 1px `--k-line`. Photo is `object-fit: cover`. No gradient overlays on a real photo (the radial tint exists only on the placeholder).
- One image per recipe (the data model has one canonical image); never duplicate it.
- Mat width equals the spine column minus 32 px padding (224 px wide on 1366 short recipes, 184 on long); height follows the 4:5 well plus 12 px for mat padding and borders (277 / 227).

## 10. Gutter and surfaces

- Perfect page: `--k-p` with `linear-gradient(to left, --k-gut, transparent 34px)` on its inner edge.
- House page: `--k-h` with `linear-gradient(to right, --k-gut, transparent 34px)`.
- Gutter alpha: dark `rgba(0,0,0,.2)`, light `rgba(60,40,20,.045)`. No box-shadow, no paper texture.

## 11. Single variant

- Spread becomes `minmax(0,1fr) <spine>` (260 / 300 / 320 px by breakpoint), `max-width: 1120`, centred, width `calc(100% − 2·--iM)`.
- One page, padded `calc(--padY + 4px) calc(--pad × 1.5)`: header, then two columns (gap 40): left Ingredients + Meta (all four fields), right Preparation + Note.
- Type steps up on laptop and landscape tablet: `--padY 22`, `--row 40`, `--fi 17`, `--fs 16`, `--lh 28`, `--ts 15`, `--g2 14`.
- No difference label, no empty second page, image and caption kept.
- Shows whichever variant has persisted content (Perfect or House) with its own marker.

## 12. Long recipes

Mock rule: Mojito is "long". Proposed production rule: long when either variant has more than 5 ingredients or more than 5 steps. Effect: spine narrows (laptop 256 → 216, large 280 → 240, landscape tablet 216 → 188, portrait tablet 192 → 172). Nothing else changes.

## 13. Theme

Dark is the base (`:root`), Light under `:root[data-theme="light"]`, matching the app. Exact values in `VIEW_I_TOKENS.md`.

## 14. Controls and interaction

- `oz | ml` toggle (new, presentation only; see `DATA_MAPPING.md`). Default oz.
- Back and Edit are links/buttons using existing routing; the mock does not define new behaviour.
- Note toggle on mobile only.
- No animations are required. If any are added they must honour `prefers-reduced-motion`.

## 15. Vertical budget at 1366×768 (Old Fashioned)

App header 48 + title block ≈ 107 + spread. Spread natural height ≈ 554 inside a 719 px body, so about 91 px spare (Mojito about 58). If the production header is taller than 48 px or the page adds bottom padding (the current `pb-24` on `RecipeDetailView`), the contract fails; both must be neutralised for View I.
