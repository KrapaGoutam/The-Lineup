# Recipes V1 — Source mapping and initial import

Status: **LOCKED in R-0 as a process and format contract.** The recipe content itself is **not** here and **not** invented here.

> **Source availability (stated plainly): the source book files were NOT available to R-0.** The environment contains no DOCX, PDF, spreadsheet or image of _The Monks Cocktail Recipe Book_ (searched the repository and the container). Everything below that names a drink comes from the planning brief's wireframes and is marked **UNVERIFIED**. No ingredient, measurement, method, glass, rim, garnish or step was written, compared with the web, "corrected" or normalized in R-0.

## 1. Source authority (data-governance rule, locked)

| Rank | Source                                                          | Use                                                                                                                       |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Latest recipe corrections explicitly approved by the owner**  | Overrides everything below, per recipe and field.                                                                         |
| 2    | **Current DOCX recipe book** (_The Monks Cocktail Recipe Book_) | The content source: numbers, names, categories, both versions.                                                            |
| 3    | **Existing PDF recipe book**                                    | **Visual and layout reference only** (two-column look, illustration style). Never a content source when the DOCX differs. |
| 4    | Earlier recipe data                                             | **Superseded** wherever a later source differs.                                                                           |

Rules that follow from this:

- **The source is the source.** If something looks unusual (an unusual measure, a brand, a spelling, a method that "should" be different), it is imported as written and listed under §8. R-1/R-2 agents and the operator do not "fix" recipes using general bartending knowledge.
- **Not normalized:** spelling, capitalization, brand names, measurement style (`¾` vs `0.75`), abbreviations, punctuation. Presentation-only transformations (uppercase headings, zero-padded numbers) happen in CSS/formatting code, never in stored data.
- **Not immutable:** the owner has said recipes may be altered slightly later. After import a recipe is ordinary application data edited in the Recipes editor (R-2). The importer never overwrites an edited recipe (§5).
- Corrections are recorded: each owner-approved correction is listed in the import file's `source.corrections[]` (what, which recipe, who approved, date) so the import report and PR can show it.

## 2. Model mapping

| Source concept                                  | Persisted as                                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book section ("Signature Cocktails", …)         | `bar_recipe_categories` row (`slug`, `name`, `display_order`)                                                                                                                                                                               |
| Recipe number printed in the book               | `bar_recipes.recipe_number` — the book's own number, never a position                                                                                                                                                                       |
| Drink name                                      | `bar_recipes.name`                                                                                                                                                                                                                          |
| **Perfect** version                             | `bar_recipe_variants.variant = 'perfect'`                                                                                                                                                                                                   |
| **Your Version** (Monks book wording)           | `bar_recipe_variants.variant = 'house'` (never `'your'`); UI label "House Recipe" (`UI_UX_PLAN.md` D-LBL)                                                                                                                                   |
| Ingredient lines ("White rum – 2 oz")           | `bar_recipe_ingredients` rows: name / amount / unit / preparation — **split, not blobbed**; `amount` is free text so "Top", "Splash", "2 dashes", "To taste", "8 leaves" fit                                                                |
| Method ("Muddle + Shake")                       | `method` (free text)                                                                                                                                                                                                                        |
| Numbered instructions                           | `bar_recipe_steps` rows in order                                                                                                                                                                                                            |
| Rim                                             | `rim_type` (+ `rim_notes`)                                                                                                                                                                                                                  |
| Garnish(es)                                     | `bar_recipe_garnishes` rows                                                                                                                                                                                                                 |
| Ideal glass (+ unusual service detail)          | `glass` (+ `glass_notes`)                                                                                                                                                                                                                   |
| Tips / house notes                              | `tips`                                                                                                                                                                                                                                      |
| Green Tea Shot "4-shot batch"                   | `batch_notes` of the variant it belongs to (free text; no batch subsystem, `DATA_MODEL.md` D-12)                                                                                                                                            |
| Price printed on a recipe (e.g. Green Tea Shot) | **Not imported** (pricing is out of scope, `DATA_MODEL.md` D-13) — listed in §8 for the owner                                                                                                                                               |
| Illustration / photo                            | Not part of the import; uploaded later as the recipe's image (§6)                                                                                                                                                                           |
| Base spirit / alcoholic flag                    | Not printed as fields in the book (assumed); the operator sets `base_spirit` and `is_alcoholic` from the recipe's own ingredients and the owner confirms in the review report. When uncertain: leave `base_spirit` empty and flag it in §8. |

## 3. Known categories and numbering (planning knowledge — UNVERIFIED against the book)

Initial categories (`display_order` leaves gaps for later inserts; **Others** is the fallback and sorts last by `is_fallback`):

| Order | Name                | slug                  | Notes                                                             |
| ----: | ------------------- | --------------------- | ----------------------------------------------------------------- |
|    10 | Signature Cocktails | `signature-cocktails` |                                                                   |
|    20 | Margaritas          | `margaritas`          |                                                                   |
|    30 | Martinis            | `martinis`            |                                                                   |
|    40 | Mocktails           | `mocktails`           | Lemonades, if the book lists them separately, see §8              |
|    50 | Shots               | `shots`               |                                                                   |
|    60 | Others              | `others`              | `is_fallback = true`; created empty; used when no category chosen |

The brief's rough shape — 1–20 Signature, 21–24 Margaritas, 25–30 Martinis, 31 onward Mocktails / Lemonades / Shots — is **planning knowledge, not a constraint**: the import accepts whatever sequence the book has, including gaps and a different split. No code, constraint or test depends on those ranges.

## 4. Mapping table (to be completed from the book — by the R-1 import dry-run report)

Columns the operator fills from the DOCX, one row per recipe; the importer's dry-run report prints exactly this table so it can be reviewed against the book:

`recipe_number · name · category · Perfect variant? · House variant? · image/artwork available? · special notes`

Rows named in the planning brief (all **UNVERIFIED**; confirm number, spelling and category from the book):

| # (brief) | Name (brief)              | Category (brief)    | Perfect? | House?  | Image | Special notes                                                                   |
| --------: | ------------------------- | ------------------- | -------- | ------- | ----- | ------------------------------------------------------------------------------- |
|        01 | Monks Ala Carte Mojito    | Signature Cocktails | ?        | ?       | ?     | wireframe example                                                               |
|        02 | Coco Mojito               | Signature Cocktails | ?        | ?       | ?     | wireframe example                                                               |
|        03 | Spicy Rum Old Fashioned   | Signature Cocktails | ?        | ?       | ?     | wireframe example                                                               |
|        21 | Jalapeño Margarita        | Margaritas          | ?        | ?       | ?     | wireframe example (diacritic: store as typed)                                   |
|        22 | Frozen Margarita          | Margaritas          | ?        | ?       | ?     | wireframe example                                                               |
|    **23** | **Cadillac Margarita**    | Margaritas          | ?        | ?       | ?     | **stated by the owner: must stay #23** regardless of sort/search/new categories |
|        24 | Coco Margarita            | Margaritas          | ?        | ?       | ?     | wireframe example                                                               |
|        25 | Dirty Martini             | Martinis            | ?        | ?       | ?     | wireframe example                                                               |
|        26 | Chocolate Martini         | Martinis            | ?        | ?       | ?     | wireframe example                                                               |
|        31 | Strawberry Mint Refresher | Mocktails           | ?        | ?       | ?     | wireframe example                                                               |
|        32 | Mango Blossom             | Mocktails           | ?        | ?       | ?     | wireframe example                                                               |
|        37 | Green Tea Shot            | Shots               | **yes**  | **yes** | ?     | **has a 4-shot batch**; may show a price (§8)                                   |

"Most drinks" have both a Perfect and a Your Version; some may have only one. The model allows either (at least one is required). A missing side is imported as absent, never as an empty placeholder.

## 5. Initial import mechanism (decision)

Options evaluated against the brief's priorities — repeatability, reviewability, no accidental PROD demo/test data, easy later correction:

| Option                                | Verdict                 | Why                                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed data inside a migration          | **Rejected**            | Migrations replay everywhere, including PROD, so content would ship with the schema (the exact "accidental PROD data" risk), is org-specific (organization ids differ per environment), cannot be corrected without another migration, and is immutable history. |
| `supabase/seed.sql`                   | **Rejected**            | The committed seed is deliberately free of real customer data and runs only on local reset; it cannot target a named organization on hosted DEV/PROD.                                                                                                            |
| Manual entry in the editor            | **Rejected as primary** | ~40+ structured recipes by hand is slow and unreviewable; it stays the way to _correct_ recipes afterwards.                                                                                                                                                      |
| **One-time controlled import script** | **CHOSEN**              | A reviewed, versioned JSON file → `scripts/recipes/import-recipes.mjs` → `bar_recipes_import` RPC (service role, one transaction). Repeatable, dry-run-able, diff-able, environment-explicit, idempotent, and data stays normal editable data afterwards.        |

**The script (built in R-1):**

```bash
node scripts/recipes/import-recipes.mjs --file <import.json> --org <organization-slug> --actor <manager-profile-uuid> --target dev --mode dry-run
node scripts/recipes/import-recipes.mjs --file <import.json> --org <organization-slug> --actor <manager-profile-uuid> --target dev --mode create
```

- Reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` from the process environment (does not load an env file automatically). Explicit `--target local|dev|prod` must match its pinned origin. Never prints keys. Dry run is the default and the RPC rolls back its temporary transactional validation writes.
- Production create additionally requires `--execute --confirm-prod --dry-run-report <reviewed-report.json>`, matching file hash/organization/actor and approved warnings. Production overwrite is forbidden. The executable preflight contract, warning IDs and future Production commands are in [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md); the original R-0 `--allow-prod`/`--confirm` proposal is superseded. No Production import was run during preflight.
- The actor is explicitly supplied with `--actor` and must be an existing active management member (verified by the RPC; recorded as `created_by`). The organization is explicitly supplied by slug and its ID/name are read back before execution; there is no first-organization fallback.
- Validates the file with a zod schema (the same constraints as `DATA_MODEL.md` §3), then calls `bar_recipes_import`. Prints a per-recipe report (created / skipped-existing / error) and the §4 mapping table.
- **Idempotent and non-destructive:** `create` inserts a recipe only if its number **and** slug are free; otherwise it reports "skipped (exists)". Re-running after management edited a recipe changes nothing. Local/DEV overwriting a specific recipe requires `--overwrite <numbers>` **and** that recipe's number in the file; never a blanket overwrite. Production create always skips existing recipes.
- Categories are created from the file when their slug is missing and never modified when present. The six initial categories (§3) are part of the import file, so nothing about them is hard-coded in app code.

**Import file format** (`format: "the-lineup.bar-recipes.import"`, `version: 1`):

```json
{
  "format": "the-lineup.bar-recipes.import",
  "version": 1,
  "source": {
    "title": "The Monks Cocktail Recipe Book",
    "document": "<file name of the DOCX>",
    "sha256": "<hash of the DOCX used>",
    "approved_by": "<owner>",
    "approved_on": "<date>",
    "corrections": [
      { "recipe_number": 0, "field": "…", "note": "…", "approved_on": "<date>" }
    ]
  },
  "categories": [
    { "slug": "margaritas", "name": "Margaritas", "display_order": 20 }
  ],
  "recipes": [
    {
      "recipe_number": 0,
      "name": "…",
      "category_slug": "margaritas",
      "alternate_name": null,
      "description": null,
      "base_spirit": null,
      "is_alcoholic": true,
      "is_popular": false,
      "is_menu_item": false,
      "variants": {
        "perfect": { "…": "as bar_recipe_save payload" },
        "house": null
      },
      "source_ref": "page/section in the DOCX (report only, not stored)",
      "source_notes": "operator note for the review report (not stored)"
    }
  ]
}
```

`source_ref` and `source_notes` appear in the report and PR review only; they are not columns.

**Procedure (each step has an owner):**

1. _Owner_ provides the DOCX (and PDF for visual reference, and any corrections) to the R-1 session. **The real import is gated on this; R-1 itself builds and tests the importer with a small, obviously synthetic fixture** (`tests/fixtures/recipes/import-sample.synthetic.json`, names like "Sample Recipe A") and does not wait.
2. _Operator_ extracts the DOCX into the draft JSON (manual or assisted; the extraction helper, if any, is not committed).
3. `--mode dry-run` against hosted DEV: schema + database validation, review report.
4. _Owner_ reviews the report against the book (every recipe, both versions) and approves; corrections are applied to the JSON and listed in `source.corrections`.
5. `--mode create` on **hosted DEV** (the DEV organization the owner designates; a DEV import is not synthetic test data and is never auto-deleted by tests).
6. UI verification on DEV.
7. The _same file_ (hash recorded) is imported to PROD only in the release phase after owner approval (`IMPLEMENTATION_PLAN.md` §6).

**Where the approved file lives.** Default: **outside the repository** (the book is owner-provided internal source material and the repository's visibility is the owner's call); the import report records the file's SHA-256, counts and the correction list, and that report may be committed. If the owner prefers the file committed for reviewability, it goes under `docs/features/recipes-v1/import/` in its own PR. Only the synthetic fixture and the format schema are committed by default. (OD-2 in `PLAN.md`.)

## 6. Images and artwork

- Images are **separate recipe assets** supplied by the owner (photographs or the book's illustration style). **The PDF's page images are not embedded** and not cropped into recipe images.
- No web-sourced or stock images; no generated artwork in R-0 or R-1/R-2. Without an approved image a recipe uses the placeholder (`UI_UX_PLAN.md` §9).
- Intended workflow: management uploads each image in the editor (R-2), recipe by recipe. Suggested file naming when the owner prepares assets: `<recipe_number>.<ext>` (for example `23.png`) so the right file is obvious; the app does not parse file names.
- Provenance note: initial imagery is **owner-provided / uploaded**, or placeholder.

## 7. Number and slug assignment during import

- `recipe_number` comes from the book as printed. If the book has duplicates, gaps or letter-suffixed numbers, the operator does **not** renumber silently: the dry-run fails on duplicates (database unique constraint) and the case goes to §8 for an owner decision.
- `slug` is derived from the name by `recipes_slugify` at insert; the report shows each slug so URLs can be reviewed. Slugs do not change on later renames.

## 8. Unresolved source ambiguities (record here when found; none can be resolved in R-0)

| #   | Ambiguity                                                                                                           | Default until the owner decides                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | The DOCX/PDF were not available to R-0, so counts, exact names/numbers and which drinks lack a version are unknown. | Operator completes §4 from the book; the dry-run report is the source of truth.                                                                                                     |
| A-2 | Green Tea Shot may carry a price. Pricing is out of scope.                                                          | Price is **not imported**; owner decides whether to keep it as free text in `tips` or drop it.                                                                                      |
| A-3 | Green Tea Shot has a "4-shot batch".                                                                                | `batch_notes` on the relevant variant(s), as written.                                                                                                                               |
| A-4 | The brief mentions "Lemonades" in the 31+ range but the category list has no Lemonades category.                    | Follow the book's own headings; lemonades go under **Mocktails** unless the book separates them, in which case a `lemonades` category is added in the import file (data, not code). |
| A-5 | Whether some recipes have only a Perfect or only a Your Version.                                                    | Import what exists; at least one is required.                                                                                                                                       |
| A-6 | Base spirit / alcoholic flag are not source fields.                                                                 | Operator infers conservatively; `is_alcoholic = false` only for drinks the book lists as mocktails; uncertain → flag for owner.                                                     |
| A-7 | Unusual source data (odd units, brand spellings, inconsistent method wording).                                      | Imported as written; listed here by the operator; never normalized.                                                                                                                 |
| A-8 | Which recipes are Popular / On-menu is not in the book.                                                             | All imported with `is_popular = false`, `is_menu_item = false`; management sets them in the editor (R-2).                                                                           |
