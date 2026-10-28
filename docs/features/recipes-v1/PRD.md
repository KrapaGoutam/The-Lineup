# Recipes V1 — Product requirements

Status: **LOCKED in R-0** (planning). Tracking: one parent issue for Recipes V1 with an R-0 / R-1 / R-2 checklist (see `PLAN.md`). Nothing in this document is implemented yet.

## 1. Problem

The restaurant's cocktail knowledge lives in a printed/PDF/DOCX recipe book — _The Monks Cocktail Recipe Book_ — that bartenders and managers flip through during service. It is hard to search on a phone, impossible to correct in one place, and cannot show the restaurant's own "house" version beside the textbook "perfect" version. Staff already use this app on phones and the host-stand tablet; the recipe book should be there too, as **a restaurant cocktail recipe book, not a database admin table**.

## 2. Users

| User                                               | Needs                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Staff** (servers, hosts, bartenders on shift)    | Find a drink fast by name/number/spirit; read ingredients, method, steps, rim, garnish, glass; compare Perfect vs House; works one-handed on a phone.                               |
| **Management** (Owner, Manager, Assistant Manager) | Everything Staff do, plus keep the book correct: add drinks, edit either version, attach a photo or artwork, archive retired drinks, mark Popular / On menu, reorganize categories. |

## 3. Goals

1. **Recipe Index** (the landing page): categorized, numbered, searchable, as a **List View** (fastest during service, default) or a **Picture Book View** (same categories, with drink images).
2. **Recipe Detail**: one primary image/artwork above a two-version comparison — **Perfect** and **House** — laid out like the book on tablets/desktop and as Perfect/House tabs on phones.
3. **Recipe Editor** (management): a structured editor — never one giant text box — with Copy Perfect → House, atomic saves and stale-edit protection.
4. **Stable identity**: every recipe keeps its printed number (#23 stays #23) and a stable URL.
5. **Easy correction**: the owner has said recipes may be altered later, so seeded content is ordinary editable data.
6. **Tenant-safe from day one** (`organization_id` everywhere) and **database-authoritative security**: Staff read-only enforced by grants/RLS/RPCs/Storage, not by hidden buttons.

## 4. Non-goals (V1)

Draft/Review/Published or approval workflows · hard delete · pricing / menu / POS management · inventory linkage (recipes ↔ Bar Inventory stock) · recipe scaling or unit conversion · nutrition/allergen data · multi-image galleries · favorites, ratings, comments · print/PDF export · Realtime updates · per-location recipe sets · AI features · ingredient-name search · duplicate-recipe action · field-level audit history · a multi-organization Recipes UI (Part 2 is separate and stays on hold) · generating or sourcing images · altering, "improving" or normalizing any source recipe.

## 5. Roles

| Role                                | Recipes V1                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff (`host`, `server`)            | Read active recipes, search, switch List/Picture Book, open detail, switch Perfect/House. Nothing else.                                     |
| Assistant Manager / Manager / Owner | Identical management capability: everything above, plus archived recipes, add/edit/archive/restore, images, categories, Popular/Menu flags. |

Mapping and enforcement: `SECURITY_AND_ROLES.md`. No Recipes-specific role system.

## 6. Requirements

### 6.1 Index

- Name: nav label **Recipes**, page heading **Bar Recipes** (never "Cocktail Database").
- Toolbar: search, `[List | Picture Book]` toggle (R-2), filter chips (R-2), `+ Add Recipe` (management).
- **Grouped by category** in the stored category order; **Others** last; empty categories hidden; each recipe shows its **stored number**.
- A non-empty search replaces grouping with a flat **Results** list; clearing restores grouping.
- Row/card is a link to the detail; card image and name open the same recipe.
- Contract: `UI_UX_PLAN.md` §2–§4.

### 6.2 Detail

- Header (number, name, badges, category, base spirit, description), one hero image (or placeholder), then Perfect and House side by side (≥ 768 px) or as tabs (< 768 px; House first when present).
- Per version: Ingredients, Method, Steps, Rim, Glass (+notes), Garnish (+presentation notes), Bartender Tips / House Notes, Batch notes. Empty sections omitted.
- URL-addressable: `/?tab=recipes&recipe=<slug>` (also under `/r/<slug>`); refresh and Back behave; archived recipes are not reachable by Staff.
- Contract: `UI_UX_PLAN.md` §5.

### 6.3 Editor (R-2)

- Basic Info · Image · Perfect Recipe · House Recipe; repeatable ingredient/step/garnish rows; comboboxes for method, rim, glass, base spirit, unit (suggestions + free text); flexible amounts (`Top`, `2 dashes`, `0.75`).
- Copy Perfect → House with an explicit replace warning; unsaved-change protection; one atomic save with stale-edit (`PT409`) handling.
- Contract: `UI_UX_PLAN.md` §6–§7; save model `DATA_MODEL.md` §6.

### 6.4 Images

- One primary image per recipe (photo **or** illustration — the app does not care), upload / replace / remove by management, private bucket, signed URLs, tasteful placeholder when absent. Contract: `STORAGE_PLAN.md`.

### 6.5 Categories

- Database records (name, slug, display order, active, fallback). Initial six: Signature Cocktails, Margaritas, Martinis, Mocktails, Shots, **Others**. Management can add/rename/reorder/deactivate categories without a migration. Contract: `DATA_MODEL.md` D-1.

### 6.6 Numbering

- `recipe_number` is stored data, unique per organization (archived included), suggested as `max + 1` on Add and editable; the database rejects duplicates. Contract: `DATA_MODEL.md` D-2.

### 6.7 Search

- Deterministic, client-side, accent- and case-insensitive over name, alternate name, category, base spirit, number. No AI. Expected scale 40–250 recipes. Contract: `UI_UX_PLAN.md` §3.

### 6.8 Archive

- Archive/Restore replace delete. Archived = hidden from Staff and from the default index; management can show them; restore is lossless. Contract: `DATA_MODEL.md` D-15.

### 6.9 Source book

- _The Monks Cocktail Recipe Book_ is the content source (owner corrections > DOCX > PDF for visuals > earlier data). Perfect → `perfect`; "Your Version" → `house`. Initial data enters through a reviewed, repeatable, non-destructive import script, never a migration. Contract: `SOURCE_MAPPING.md`.

## 7. Success criteria

1. A bartender on a phone finds a drink by partial name, number or spirit in under ~10 seconds and reads its House recipe without horizontal scrolling.
2. Management can add a new recipe with both versions, an image and a category in one editing session, and Staff see it on their next load.
3. #23 is #23 after any search, sort, re-categorization or new category; a duplicate number is impossible.
4. Staff cannot create, change, archive or upload anything — proven at the grant, RLS, RPC and Storage layers, not just the UI.
5. A mid-save failure never leaves a half-saved recipe; a stale second tab cannot silently overwrite.
6. Adding a category needs no deploy.
7. Every R-1 and R-2 row of `TEST_MATRIX.md` is green; the final gate passes on real WebKit host-tablet, desktop and server-mobile; PROD is touched only after owner approval.
8. The original recipe book is imported with its numbers, categories and both versions intact and **unmodified**, and the owner can correct any recipe afterwards in the app.
