# View I — Responsive Spec

The mockup previews fixed device frames; Production uses viewport breakpoints. The mapping below is the proposed one and is already encoded in `view-i-reference.css`. Frame heights in the mockup are viewport heights including the app header.

| Range     | Mockup target                 | Frame    | App header | Size set                            |
| --------- | ----------------------------- | -------- | ---------- | ----------------------------------- |
| ≥ 1440    | Laptop 1440×900               | 1440×900 | 52         | `l`                                 |
| 1280–1439 | Laptop 1366×768 (**primary**) | 1366×768 | 48         | `m`                                 |
| 1024–1279 | Tablet landscape              | 1180×820 | 52         | `m` (smaller title, narrower spine) |
| 640–1023  | Tablet portrait               | 820×1180 | 52         | `p`                                 |
| < 640     | Mobile                        | 390×844  | 52         | `s`                                 |

No separate small-mobile layout was designed. The mobile frame was checked at 390 wide only; below about 360 px the two-column pages would need a re-check (widths 150–165 px each).

## Size sets

| Token                 | `l` ≥1440 | `m` laptop | `m` tablet land. | `p` portrait | `s` mobile |
| --------------------- | --------- | ---------- | ---------------- | ------------ | ---------- |
| page padding X        | 30        | 24         | 24               | 20           | 12         |
| page padding Y        | 16        | 14         | 14               | 22           | 12         |
| ingredient row        | 34        | 30         | 30               | 42           | 36         |
| ingredient/qty font   | 16        | 15         | 15               | 16           | 13.5       |
| step / meta font      | 15        | 14         | 14               | 15           | 13         |
| step line height      | 27        | 24         | 24               | 26           | 18         |
| note base font        | 15        | 14         | 14               | 14.5         | 13         |
| title                 | 50        | 44         | 38               | 50           | 25         |
| outer margin          | 22        | 18         | 18               | 14           | 0          |
| head top padding      | 12        | 10         | 10               | 18           | 4          |
| step gap              | 0         | 0          | 0                | 6            | 6          |
| spine, short recipe   | 280       | 256        | 216              | 192          | none       |
| spine, long recipe    | 240       | 216        | 188              | 172          | none       |
| spine, single variant | 320       | 300        | 260              | 230          | none       |

## Per range

**Laptop (1366 and 1440)**

- Columns `1fr | spine | 1fr`. Title block centred, Back and Edit on the title row ends.
- Metadata: Method + Garnish per page; Glass + Rim under the image when shared.
- Notes per page (default), one shared note in the spine, or none.
- Scrolling: none. Measured 0 px for both recipes (see `FIT_REPORT.md`).

**Tablet landscape (1180×820)**

- Same structure, smaller title (38) and spine. 0 px scroll measured.

**Tablet portrait (820×1180)**

- Same three-zone spread, spine narrowed to 192 / 172, larger row height and type because there is spare height (289 px spare for the Old Fashioned, 261 for the Mojito). Pages are 299 / 309 wide, so two step lines wrap on the Old Fashioned ("Stir until chilled and diluted." and "Add all ingredients to mixing glass."). This is accepted. 0 px scroll measured.
- Perfect and House are never stacked at this width.

**Mobile (390×844)**

- Header: Back and Edit row (44 tall), centred No. / title (25, `text-wrap: balance`) / chapter marker.
- Image band: 88 px mat (4:5) beside the shared glass caption (and the shared note when that mode is selected), centred, 14px vertical padding.
- Two equal pages (194 px each) with no spine: ingredients (qty columns tightened to 1.4 / 2.4 / 3.2 ch), meta (Method, Garnish), Preparation, note.
- Notes collapse to two lines; tap toggles (`NOTE +` / `NOTE −`).
- Scrolling is expected. Measured vertical scroll inside the 390×844 frame (content − viewport 791 px): Old Fashioned 88 px; Mojito 131 px with per-build notes; 57 px with a shared note; 49 px with no note. Horizontal overflow 0 px in every state.
- Below the fold at load: Old Fashioned, step 05 on Perfect and both notes. Mojito per-build, steps 05–06 on both pages and both notes. Mojito shared note: Perfect steps 05–06 and House steps 04–06. Mojito no note: Perfect steps 05–06 and House steps 05–06.
- No tabs; both builds stay side by side.

**Single variant**

- ≥1024: one wide page (max 1120) with Ingredients + Meta left, Preparation + Note right, image spine right. 0 px scroll.
- 640–1023: same two-column page, spine 230.
- < 640: image band on top, one column, page padding 14.

## Rules that must hold at every range

1. Perfect and House are always visible together (never tabs, never hidden).
2. The image never pushes recipe content out; shrink the spine, not the text.
3. Ingredient and step text is never truncated.
4. Metadata stays compressed (no cards).
5. Missing tip: remove the note, let the sixth grid row reclaim space.
