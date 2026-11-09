# Feature V2-005.007: Recipes Evidence

Batch B evidence is shared with Bar Inventory: see [Bar Inventory evidence](../006-bar-inventory/EVIDENCE.md) for the review findings, CI resolution, test receipts, backup/restore/rehearsal and hosted DEV rollout. This page records the Recipes-specific facts.

## 1. Canonical tables (verified against the real schema)

`bar_recipe_categories`, `bar_recipes`, `bar_recipe_variants`, `bar_recipe_ingredients`, `bar_recipe_steps`, `bar_recipe_garnishes`. There is **no** `bar_recipe_images` table (an earlier draft of this page named one): images are `image_path` / `image_thumb_path` columns on `bar_recipes` plus objects in the private `recipe-images` bucket. None of the six tables has, or gained, a `location_id` column (pgTAP 0069 and the Playwright content tests).

## 2. What changed for Recipes

- Actor FKs on `bar_recipe_categories` (`created_by`, `updated_by`) and `bar_recipes` (`created_by`, `updated_by`, `archived_by`) now reference `profiles(id)` so Overall-only actors need no synthetic membership. The five constraints keep their original names (`*_creator_fk`, `*_updater_fk`, `bar_recipes_archiver_fk`) and stay **non-deferrable**, exactly as before.
- `recipes_is_member` now also admits any Overall role; `recipes_is_manager` admits Overall Owner/Manager/Assistant, org Owner/General Manager/Shift Manager, and any active location Manager/Assistant Manager of the organization. All require a live session (revoked, banned or unknown-session callers are denied). This is a strict superset of the previous rule for recipes (nobody loses recipe edit access).
- New client RPC `recipes_org_authorized(p_organization_id)`; the app actor now calls it with the correct argument name (see the P0 in the Bar Inventory evidence: the original call used `p_org`, denying every user).
- Storage and `recipes_begin` / `recipes_can_*` helpers are unchanged in behaviour.

## 3. Verified behaviour

| Area              | Evidence                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One org-wide book | A recipe saved by a Location Manager is visible to Staff and to Managers at every location; staff see active recipes only, managers also see archived (pgTAP 0070 RV-056..060; browser: the seeded recipe appears for Manager A, Manager B and Staff, and for Manager A after switching to a location where they are Staff).                                     |
| Cross-tenant      | A foreign-organization owner reads zero recipes and cannot write into this book; a revoked member reads nothing and cannot write (RV-061..064; hosted probe).                                                                                                                                                                                                    |
| Overall actors    | Overall Owner (no membership row) saves a recipe; `created_by` is the real caller (RV-065..066).                                                                                                                                                                                                                                                                 |
| Direct writes     | No client INSERT/UPDATE/DELETE on any recipe table; `bar_recipes_import` (which takes an actor parameter) is not client-executable (RV-048, RV-051).                                                                                                                                                                                                             |
| No duplication    | Exactly the expected recipe rows exist; org2 book untouched (RV-067..068). Recipe numbers/slugs unchanged by the migration (data digests identical on real DEV data).                                                                                                                                                                                            |
| Private images    | Bucket `recipe-images` stays private (verified on hosted DEV). Staff read active images, not archived ones; staff cannot write; a forged `org2/<org1 recipe>` path is rejected because the path organization must own the recipe; a revoked member loses access (RV-069..075; hosted probe).                                                                     |
| Module gating     | Recipes is organization-owned, so recipe tables and RPCs carry no location. Per-location availability is enforced at the server-action boundary (`guardModule("recipes", location)`), as in `ORGANIZATION_CATALOG_CONTRACT.md` section 3. A direct recipe RPC is therefore not blocked by a per-location recipes disable; no second permission system was added. |

## 3a. Data preserved (hosted DEV, real data)

Pre-migration backup counts equal the post-migration digests: 32 recipes, 48 variants, 156 ingredients, 132 steps, 49 garnishes, 8 categories (image paths, thumbnails, numbers, slugs, archived flags all inside the identical row digests). The 34 storage objects and bucket settings are unchanged. No recipe was imported, duplicated or rewritten.

## 4. Residuals

- Module gating is server-action level only (see above).
- The Recipes UI `isManager` flag follows the effective tier at the **active** location, while the database grants editing to a manager at any location of the organization (org-wide book). The UI is the stricter side; nothing can be done through the UI that the database would refuse.
