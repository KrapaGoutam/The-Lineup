# Recipes V1 — UI / UX plan

Status: **LOCKED in R-0**. ASCII wireframes are layout contracts, not pixel specs. Everything uses the existing design tokens and primitives (`Button`, `Card`, `Badge`, `Dialog`, `Input`, `Label`, `Select`; `docs/DESIGN_SYSTEM.md`); there is **no Recipes-specific palette, theme or component library**. Light/dark follow the existing theme system; all colours come from tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary/15`, …).

The feel is **a restaurant cocktail recipe book**, not an admin table: generous type for the drink name, numbers as a printed index, calm cards, no dense grids.

> **Recipe Detail redesign (implemented, #230):** Concept E — Editorial Recipe Book and Presentation behavior: House differs are selected. The [design reference](../../design-reference/recipes/recipe-detail-concepts/README.md) supersedes this historical plan's detail-layout and segmented mobile variant-tab instructions for the redesign. The finalized reference defines shared versus House-different presentation and a centered single-recipe reading flow. The redesign is implemented: desktop two-column spread, stacked Perfect then House with jump links on tablet/mobile (no tabs), derived House-adjustment markers, and Final Presentation after the recipes using the single canonical image. Other contracts remain in force.

## 1. Name, navigation, routing

| Item                    | Decision                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nav label               | **Recipes** (existing labels are short: Tasks, Schedule, Attendance, Tip Split; "Bar Inventory" is the only prefixed one because "Inventory" alone is ambiguous). Icon: `Martini` (lucide; confirm the export in the pinned version, else `BookOpen`).                                                              |
| Page heading            | **Bar Recipes** (matches "Bar Inventory" and the source wireframe). Never "Cocktail Database".                                                                                                                                                                                                                      |
| Internal names          | feature folder `recipes`, tables `bar_recipe*`, `AppTab` id `recipes`, URL value `recipes`.                                                                                                                                                                                                                         |
| Visibility              | **Every role** (Staff included). `resolveTab` needs no rule for it.                                                                                                                                                                                                                                                 |
| Desktop placement       | Secondary tier, directly **after Bar Inventory** (so for management: Schedule, Team, Attendance, Bar Inventory, **Recipes**, Tip Split, Payroll; for Staff: Schedule, Attendance, **Recipes**, Tip Split, Payroll). Primary tier (Table Allocation, Tasks) untouched.                                               |
| Mobile                  | The fixed 3-button dock (Allocation, Tasks, More) is **unchanged**. Recipes is reached through the existing **More** sheet, which already renders every secondary tab (`moreTabs = [...secondaryTabs]`). No new overflow mechanism.                                                                                 |
| Module URL              | `/?tab=recipes` and `/r/<restaurantSlug>?tab=recipes` (T-1 `?tab=` addressing; no router rewrite, no `/recipes` route).                                                                                                                                                                                             |
| Recipe detail URL       | `/?tab=recipes&recipe=<slug>` and `/r/<restaurantSlug>?tab=recipes&recipe=<slug>`. Shareable; the restaurant path is preserved. Editor: `…&recipe=<slug>&mode=edit`; Add: `…?tab=recipes&mode=new`. (`new` and `edit` are reserved slugs.)                                                                          |
| History                 | Opening a recipe = `history.pushState`; Back returns to the index and **restores the scroll position** (stored in `sessionStorage` per organization); Forward re-opens. Closing the detail uses the same Back behaviour (a "‹ Bar Recipes" link pushes the index URL). Refresh on a detail URL reloads that recipe. |
| Unknown / archived slug | Staff (and anyone): "Recipe not found" with a "Back to Bar Recipes" link. Staff cannot tell an archived recipe from a missing one (RLS). Management sees archived recipes normally, with an "Archived" banner.                                                                                                      |
| Leaving the module      | `tabHref` drops module-scoped parameters (`recipe`, `mode`) when the target tab is not `recipes`; clicking **Recipes** while a detail is open returns to the index.                                                                                                                                                 |
| View preference         | List/Picture Book choice is a per-device preference in `localStorage` (try/catch; default **List**). It is not in the URL.                                                                                                                                                                                          |

### Exact extension points (R-1 changes these; R-0 changes none)

| File                                                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/app-tab.ts`                                                         | add `"recipes"` to `AppTab`; `PARAM_BY_TAB.recipes = "recipes"`; `tabHref` strips `recipe`/`mode` unless the target tab is `recipes`; `resolveTab` unchanged (no gating).                                                                                                                                                                                                                                        |
| `src/lib/app-tab.test.ts`                                                    | param round-trip, unknown param, `tabHref` strips/keeps `recipe` and `mode`, `resolveTab("recipes", staff) === "recipes"`.                                                                                                                                                                                                                                                                                       |
| `src/components/restaurant-operations-app.tsx`                               | `recipesTab` const (label "Recipes", icon) next to `barInventoryTab`; insert into `secondaryTabs` after Bar Inventory; render `{tab === "recipes" ? <RecipesModule …/> : null}` next to the Bar Inventory branch; pass `restaurantSlug`, `user`, `onSessionInvalid={forceSignOut}`, `demo` (demo mode). Nothing else in the shell changes: no new dock button, no new state, no data prefetch in `loadPageData`. |
| `src/app/page.tsx`, `src/app/r/[restaurantSlug]/page.tsx`                    | **unchanged** (the module fetches its own data through Server Actions, like Bar Inventory and Tasks).                                                                                                                                                                                                                                                                                                            |
| `tests/e2e/default-landing.spec.ts` (and the nav assertions that count tabs) | updated for the new tab; verify no hard-coded tab counts break.                                                                                                                                                                                                                                                                                                                                                  |

Regression guard (RC-NAV-\*): Tasks remains the default landing; `?tab=` for every existing module still works; Back/Forward; `/r/<slug>`; mobile dock still 3 buttons; More sheet lists Recipes for all roles.

## 2. Landing page — List View (default)

Desktop / tablet (≥ md). One column of category blocks; two columns of rows inside a block from `lg` up on wide screens (rows never wrap names mid-word).

```text
Bar Recipes                                           [ + Add Recipe ]   ← management only
┌────────────────────────────────────────────────┐
│ 🔍  Search recipes, spirits, numbers…          │   [ List | Picture Book ]
└────────────────────────────────────────────────┘
 ( All ) ( ★ Popular ) ( On menu ) ( Non-alcoholic )      □ Show archived ← management only

SIGNATURE COCKTAILS                                                         ← <h2>, count muted
──────────────────────────────────────────────────────────────────────────
 01   Monks Ala Carte Mojito                                   ★
 02   Coco Mojito
 03   Spicy Rum Old Fashioned
 …
MARGARITAS
──────────────────────────────────────────────────────────────────────────
 21   Jalapeño Margarita
 23   Cadillac Margarita                                        ★
…
OTHERS
──────────────────────────────────────────────────────────────────────────
```

- Category blocks are in `(is_fallback, display_order, name)` order; **empty categories are not shown** (Staff or management; the editor's category picker still lists them). **Others is always last.**
- Row = a real `<a href="?tab=recipes&recipe=slug">` (keyboard, middle-click, copy-link all work); the click handler uses `pushState`. Row content: zero-padded **number** (`01`; three digits from 100), **name**, optional muted second line (alternate name or base spirit) only when it fits, **★** for Popular (with `aria-label="Popular"`/visually hidden text), "On menu" is a filter, not a row badge. Min row height 48 px.
- The number is the recipe's stored `recipe_number` (never the position), shown in a fixed-width tabular column so names align.
- Header actions: `+ Add Recipe` is rendered **only** for management.

Mobile (< md):

```text
Bar Recipes                       [＋]   ← management: icon button "Add recipe"
[ 🔍 Search…                    ]
[ List | Picture Book ]                  ← full-width segmented control
( All )( ★ )( Menu )( No alcohol ) →     ← horizontally scrollable chips
SIGNATURE COCKTAILS
 01  Monks Ala Carte Mojito   ★
 02  Coco Mojito
```

Single column, 48 px rows, the bottom dock stays visible (module content has bottom padding like other modules).

## 3. Search and filters

- **Search** is instant, client-side over the loaded index. Normalization: Unicode NFKD, strip combining marks, lowercase, collapse whitespace — so `jalapeno` finds `Jalapeño`. A query matches **recipe name, alternate name, category name, base spirit, and number** (`23` and `#23` and `023`). Ingredient-name search is **not** in V1 (backlog B-RC-4; it needs the index to carry ingredient text).
- **Multiple words** are AND-ed (`spicy marg` → recipes matching both words across the searchable fields).
- **While a query is non-empty the category grouping is replaced by one flat "Results (n)" list** (same row/card component). Ranking: exact number → name starts with → name contains → alternate name → base spirit → category; ties by `recipe_number`. In Picture Book the flat results grid shows each card's category as a small caption (category context retained). **Clearing the query restores the grouped layout** and the previous scroll position.
- No match: "No recipes match “xyz”." with a Clear search button.
- **Filter chips** (single row, service-time light): `All` (default) · `★ Popular` · `On menu` · `Non-alcoholic`. They combine with search and with grouping (a chip narrows what is grouped). `A–Z` sort is a small secondary control (`Book order` default / `A–Z`) inside each category; **Book order = `recipe_number`**. A "Category" filter is intentionally not a chip: grouping + search already do that job. Chips are `aria-pressed` toggle buttons.
- **Show archived** (management only) adds archived recipes to the index, dimmed with an "Archived" badge; archived recipes are never mixed into Popular/On-menu counts.

## 4. Landing page — Picture Book

Same toolbar, same category headings, same order; rows become cards. **Not** a flat gallery.

```text
MARGARITAS
──────────────────────────────────────────────────────────────────────────
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│              │ │              │ │   🍸          │ │              │
│ drink image  │ │ drink image  │ │ (placeholder)│ │ drink image  │
│          ★   │ │              │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
 21               22               23               24
 Jalapeño         Frozen           Cadillac         Coco
 Margarita        Margarita        Margarita        Margarita
```

- Grid: 2 columns (mobile), 3 (`md`), 4 (`lg`), 5 (`xl`); cards are a **single focusable link** wrapping image + number + name (the image and the name are both clickable and open the same detail; one tab stop per card, no duplicate links). Image area is 4:5, `object-fit: cover`, rounded, token borders.
- A card shows **only** number, name, image, Popular star (and the category caption in search results). **No ingredients, no tags, no prices** — service lookup stays clean.
- No image / image failed → tinted tile with the glass icon (`aria-hidden`) and the number large in the tile; the name is always present as text.
- Thumbnails only (≤ 480 px); `loading="lazy"`; signed URLs requested once when Picture Book first opens and refreshed per `STORAGE_PLAN.md` S-9. List View never loads images.
- Keyboard: cards are links in DOM order (category by category, number order); `:focus-visible` ring from the existing tokens.

## 5. Recipe detail

### Desktop / tablet (≥ md): both variants side by side

````text
‹ Bar Recipes                                       [ Edit ] [ Archive ]   ← management only
23  CADILLAC MARGARITA                                 ★ Popular  ● On menu  [Margaritas]
Tequila · Sweet • Smooth • Citrusy                                         ← base spirit · description (if any)

              ┌─────────────────────────────────┐
              │          hero image             │   16:10, max ~ 520px wide, centered; placeholder if none
              └─────────────────────────────────┘

┌── PERFECT BARTENDING RECIPE ───────────┐  ┌── HOUSE RECIPE ───────────────────────┐
│ Ingredients                            │  │ Ingredients                           │
│  <amt> <unit>   <ingredient name>      │  │  <amt> <unit>   <ingredient name>     │
│  Top            <ingredient name>      │  │  2 dashes       <ingredient name>     │
│ Method    <method>                     │  │ Method    <method>                    │
│ Steps                                  │  │ Steps                                 │
│  1. <instruction>                      │  │  1. <instruction>                     │
│ Rim       <rim> (<rim notes>)          │  │ Rim       <rim>                       │
│ Glass     <glass> (<glass notes>)      │  │ Glass     <glass>                     │
│ Garnish   <garnish> — <notes>          │  │ Garnish   <garnish>                   │
│ Bartender Tips                         │  │ House Notes                           │
│  <tips>                                │  │  <notes>                              │
└────────────────────────────────────────┘  └───────────────────────────────────────┘
(Angle-bracket text is layout filler; no recipe content is invented anywhere in these docs.)

* **Detail Layout (Owner-Approved Revision, R2-F)**:
  - **Recipe-first order**: Recipe Number & Name -> Metadata -> Quick Glance -> Recipe Variant Content -> Hero Image.
  - **Quick Glance**: Compact summary across variants (method, measurements, common glass, garnish, rim) rendered near top.
  - **Quick Measure & Oz Ratio**: Structured quick measure rows at the start of each variant card. Conservative optional oz ratio (e.g. `8 : 1` for 2 oz spirit + 0.25 oz syrup) derived client-side for compatible ounce ingredients, with bitters/dashes listed separately.
  - **Bartender Tips**: Renders existing `variant.tips` with preserved line breaks (`whitespace-pre-wrap`); completely omitted when empty.
  - **Hero Image Relocation**: Hero image container moved *after* recipe content, centered (`max-w-3xl`, 16:10 aspect ratio).
* Header: number + name (uppercase via CSS only), badges (Popular, On menu, category chip linking back to that category in the index), base spirit and description as a muted subline. `Archived` management banner when archived.
* **Hero**: one image only (no gallery). Placeholder when absent. Hero is `alt={recipe name}`. Rendered centered at the bottom of the detail view.
* **Two columns** from `md` (≥ 768 px), each a `Card` with the heading **Perfect Bartending Recipe** / **House Recipe** (default wording, D-LBL below). Sections, in order: **Quick Measure** · **Ingredients** · **Method** · **Steps** · **Rim** · **Glass** (with glass notes) · **Garnish** (with presentation notes) · **Bartender Tips** (Perfect) / **House Notes** (House) · **Batch** (only when `batch_notes` exists). **Empty sections are omitted** (no "—" placeholders in the Staff view).
* Ingredient line = `amount unit` in a fixed-width left column (so `Top`, `2 dashes`, `¾` align), then name, then muted `preparation`. Order is `sort_order`. Free-text amounts are shown exactly as stored.
* If a recipe has only one variant, it renders as a single full-width card and there are no tabs (no empty column, no "missing" message for Staff).
* Back: `‹ Bar Recipes` link and browser Back.

### Mobile (< md): one variant at a time

```text
‹ Bar Recipes
23  CADILLAC MARGARITA
Tequila · …        ★ On menu
      [ hero image ]
[  PERFECT  |  HOUSE  ]          ← segmented tabs, role=tablist
 Ingredients …
 Method …
 …
````

- Header and hero stay above; the **variant control is a real tab pattern** (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, roving `tabindex`, ←/→ and Home/End move focus and selection, ≥ 44 px targets). Only the selected panel is rendered visibly.
- **Default tab: House when the recipe has a House variant, otherwise Perfect** (staff are making the restaurant's version; one constant, owner can flip it). The selection is local state, not in the URL.
- Short tab labels: **Perfect** / **House**.

### Variant wording (D-LBL)

| Persisted | Card heading (desktop)    | Tab (mobile) | Tips section label |
| --------- | ------------------------- | ------------ | ------------------ |
| `perfect` | Perfect Bartending Recipe | Perfect      | Bartender Tips     |
| `house`   | House Recipe              | House        | House Notes        |

Recommendation: **"House Recipe", not "Your Recipe"** — "your" is ambiguous when many people read the same screen, and the persisted value is already `house` for future organizations ("Monks Recipe", "Liquor Tap Recipe"). Labels live in one function (`variant-labels.ts`, with a hook for `organizations.settings.recipes.houseLabel` that V1 does not populate). The owner can change the Monks wording by editing that one constant. Listed as owner-overridable decision OD-3 in `PLAN.md`.

## 6. Management editor (R-2)

A full in-module view (not a modal: it is long and structured). Entered from `+ Add Recipe` or `Edit`. Sticky bottom bar on mobile / top-right on desktop: **Save**, **Cancel**; a dirty indicator ("Unsaved changes").

```text
‹ Back            ADD RECIPE   |   EDIT 23 · CADILLAC MARGARITA                 [ Cancel ] [ Save ]

── Basic info ──────────────────────────────────────────────────────────────
 Recipe number [ 38 ]  (suggested next: 38)      Name [ …………………………………… ]
 Category [ Margaritas ▾ ]   Base spirit [ Tequila ▾ (type to add) ]   □ Non-alcoholic
 Alternate name [ …… ]   Description [ …… ]
 □ Popular   □ On menu          Status: Active   [ Archive recipe ]   (edit mode only)

── Image ───────────────────────────────────────────────────────────────────
 [ preview / placeholder ]   [ Upload ]  [ Replace ]  [ Remove ]   JPEG, PNG or WebP, up to 8 MB

── Perfect Bartending Recipe ─────────────────────────────────────────────
 Ingredients                                              [ + Add ingredient ]
  ⠿  Amount [ 2 ]  Unit [ oz ▾ ]  Ingredient [ …… ]  Prep [ …… ]   [↑][↓][✕]
 Method [ Shake ▾ (type to add) ]
 Steps                                                    [ + Add step ]
  1  [ …………………………………… ]                                         [↑][↓][✕]
 Rim [ Salt ▾ (type to add) ]  Rim notes [ …… ]
 Glass [ Margarita ▾ (type to add) ]  Glass notes [ …… ]
 Garnish                                                   [ + Add garnish ]
  [ name ] [ notes ]                                                  [↑][↓][✕]
 Presentation notes [ … ]     Bartender tips [ … ]      Batch notes [ … ]

── House Recipe ───────────────────────────────────────────────────────────
 [ Copy Perfect Recipe → House Recipe ]   [ Remove House Recipe ]
 (same fields as above; "Add House Recipe" when none exists)
```

- **Sections** exactly as the brief: Basic Info · Image · Perfect Recipe · House Recipe. Each variant section is collapsible on mobile (a labelled `<details>`-like disclosure, open by default).
- **Repeatable rows** for ingredients, steps, garnishes. Reorder = **↑ / ↓ buttons** (keyboard- and touch-friendly; drag-and-drop is not in V1). Deleting a row is immediate in form state (reversible by Cancel). Row caps from `DATA_MODEL.md` §3; at the cap the Add button disables with a reason.
- **Controlled lists with free text**: Method, Rim, Glass, Base spirit, Unit are comboboxes (suggestions + any typed value). Suggestion lists are constants (`method-options.ts`, `rim-options.ts`, `glassware.ts`, `spirits.ts`, `units.ts`); no admin screen for them.
- **Recipe number**: pre-filled with the suggested next number but editable; a duplicate shows an inline error from the database (`23505`), never only a client check. Archived numbers count as used.
- **Category**: select of active categories; defaults to **Others** (the fallback) on Add when nothing is chosen; choosing a real category is never overridden. `Manage categories…` link opens the category dialog (§8).
- **Validation**: field-level messages tied to inputs with `aria-describedby`; `aria-invalid`; on submit the first invalid field gets focus and an error summary (`role="alert"`) is shown. Server `22023` messages map to the same fields.
- **Save**: one `bar_recipe_save` call; success returns to the detail with a status message ("Recipe saved"); on `PT409` the form is kept and a banner offers **Reload latest** (discarding edits) or **Keep editing**; on network error the form is kept with a retry message. No autosave, no draft storage.
- **Unsaved changes**: dirty state = deep compare with the loaded snapshot. Guard (a) in-module navigation (Cancel, Back link, opening another recipe, changing view) with a Discard / Keep editing dialog, and (b) `beforeunload` while dirty. This is parity with the Order Draft editor's guard; the shell has no cross-module leave guard (a tab switch through the app shell unmounts the module — recorded as known limitation, backlog B-RC-7).
- **Archive / Restore** are explicit buttons with a confirmation dialog, disabled while the form is dirty ("Save or discard your changes first"). Archive explains: "Hidden from staff. You can restore it later." Restore (from an archived detail) asks for a category only when the old one is inactive.
- **Image** actions run immediately (they are separate from Save) and require the recipe to exist: on Add, the Image block says "Save the recipe first, then add a photo" and becomes active after the first save (the editor stays in edit mode with the saved recipe).

## 7. Copy Perfect → House

Button on the House section header ("Copy Perfect Recipe → House Recipe"). Operates on the **form state** (including unsaved Perfect edits); persisted only by Save.

| House state                | Behaviour                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No House variant, or empty | Confirmation: "Copy the Perfect Recipe into the House Recipe? You can then edit the differences." → creates the House section with deep copies of ingredients, method, steps, rim (+notes), glass (+notes), garnishes, presentation notes, tips, batch notes (fresh client row keys). |
| House has any content      | Warning dialog: "Replace the House Recipe? Everything currently in the House Recipe will be replaced by a copy of the Perfect Recipe. This isn't saved until you press Save." Confirm = replace; Cancel = nothing changes. **Never silently destroyed.**                              |
| Perfect empty              | Button disabled with "Add a Perfect Recipe first".                                                                                                                                                                                                                                    |

"Content" = any non-empty field or row. Focus moves to the House section heading after the copy; a polite live region announces "House Recipe copied from Perfect". The result stays reversible until Save (Cancel/Discard).

## 8. Category management (R-2, small)

`Manage categories` dialog (management only): list in display order with **Rename**, **↑ / ↓ reorder**, **Active** switch; **Add category** at the bottom (name only; the slug is derived and fixed). **Others** shows a lock note: it can be renamed but not moved, deactivated or removed. A category with active recipes cannot be deactivated ("Move or archive its 4 recipes first"). Categories can never be deleted. New categories are appended before Others.

## 9. States

| State                                                            | Presentation                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (index)                                                  | Skeleton: heading bars + ~6 row skeletons (cards in Picture Book); `aria-busy="true"` on the region; no layout jump when data arrives.                                                                                |
| Loading (detail)                                                 | Header + hero box skeleton; panels as 3 text-line skeletons.                                                                                                                                                          |
| Empty — no recipes at all                                        | Staff: "No recipes yet. Ask a manager to add the recipe book." Management: "No recipes yet." + **Add Recipe** (and a one-line note that a bulk import exists for the original recipe book — operator step, not a UI). |
| Empty — filter/search                                            | "No recipes match …" + **Clear search / Clear filters**.                                                                                                                                                              |
| Error (index/detail)                                             | Inline `role="alert"` card: "Couldn't load recipes." + **Try again**; no stack traces. A dead session → `onSessionInvalid` signs out cleanly.                                                                         |
| Permission denied (a management URL by Staff, e.g. `&mode=edit`) | Falls back to the read-only detail (or index for `mode=new`) — never an empty/error page; the database would refuse anyway.                                                                                           |
| No image                                                         | Placeholder tile (glass icon) — never a broken image; hero keeps its box.                                                                                                                                             |
| Image failed to load / URL expired                               | One automatic re-sign attempt, then placeholder.                                                                                                                                                                      |
| Archived (management)                                            | Dimmed row/card + "Archived" badge; detail banner "Archived — hidden from staff" with **Restore**; editing disabled until restored.                                                                                   |
| Not found                                                        | "Recipe not found. It may have been removed." + link to the index.                                                                                                                                                    |
| Stale save                                                       | PT409 banner (§6).                                                                                                                                                                                                    |
| Demo mode                                                        | Fully working with **clearly synthetic** demo recipes (names such as "Demo Margarita"); never real Monks content; edits are in-memory (`demo` binding like Bar Inventory).                                            |

## 10. Accessibility checklist (acceptance, `TEST_MATRIX.md` RC-A11Y-\*)

- One `<h1>` (Bar Recipes) → category `<h2>` → detail sections `<h2>/<h3>`; semantic lists (`<ul>`/`<ol>`) for rows, ingredients, steps.
- All recipe links are real anchors; the view toggle is a labelled group of `aria-pressed` buttons (or `role="radiogroup"`), not colour alone; chips `aria-pressed`.
- Mobile variant tabs follow the WAI-ARIA tabs pattern (§5). Focus is never lost: after opening a detail, focus moves to its `<h1>` (`tabIndex=-1`); after Back, focus returns to the recipe link that was opened.
- Forms: every input has a visible `Label`; errors linked by `aria-describedby`; dialogs trap and restore focus (existing `Dialog`); Escape closes non-destructive dialogs.
- Touch targets ≥ 44 px (rows 48 px); `:focus-visible` rings kept; `prefers-reduced-motion` honoured (no decorative motion is planned).
- Contrast uses existing tokens; the star is accompanied by text for assistive tech; archived dimming never drops below contrast minimums (use a badge, not just opacity, for meaning).
- Picture Book never depends on imagery: every card carries the number and name as text; the placeholder is `aria-hidden`.

## 11. Responsive matrix

| Viewport (Playwright project)                                     | List View                    | Picture Book | Detail             | Editor                                   |
| ----------------------------------------------------------------- | ---------------------------- | ------------ | ------------------ | ---------------------------------------- |
| `server-mobile` (Pixel 7)                                         | 1 column, chips scroll       | 2 columns    | tabs Perfect/House | single column, sticky save bar           |
| `host-tablet` (iPad landscape, **real WebKit in the final gate**) | 2-column rows                | 4–5 columns  | two columns        | two-column Basic Info                    |
| `desktop`                                                         | 2-column rows in wide blocks | 4–5 columns  | two columns        | wide form, side-by-side variants stacked |

Tablet landscape is an actual service device (the host stand): the final gate runs `host-tablet` on real WebKit.
