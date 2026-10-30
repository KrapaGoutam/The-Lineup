# Recipes V1 — Production Execution (Migrations + Canonical Dry Run)

Owner-approved scope: Production migration execution, manual backup, infrastructure verification, empty inventory launch confirmation, canonical recipe parsing, and rollback-only dry run. Production Recipe writes, Inventory data injection, and `development -> main` merge are explicitly NOT authorized in this checkpoint.

- Baseline / Release Candidate: `3954041eabf9f3b3be98e0ca2c5ad6ab71444f8f` (`origin/development`).
- Main: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`.
- Branch: `release/recipes-v1-production-execution`; worktree: `.tmp/recipes-prod-execution`.
- DEV: `the-lineup-dev`, `opmujepkemwcdxxorhfd`; PROD: `the-lineup`, `ftadewtkjlaotfdvtjcv`.
- Root worktree preserved untouched.

## Checklist

- [x] Verify release candidate baseline (`3954041eabf9f3b3be98e0ca2c5ad6ab71444f8f`), clean worktree, and DEV link.
- [x] Analyze `origin/main..origin/development` dependency matrix: confirmed all 8 pending migrations required by final app release.
- [x] Create manual logical Production backup outside repo (`C:\Users\krapa\Documents\Projects\Restaurent\Backups\The-Lineup\`); verify schema, data, roles, non-zero sizes, SHA-256 hashes, and restore procedure accounting for `payroll_payments` circular FKs.
- [x] Link PROD and verify pre-migration head (`20261028100100`, 54 applied, 8 pending).
- [x] Run `supabase db push --linked --dry-run` to preview exact 8 migrations.
- [x] Apply 8 approved migrations to PROD; verify post-migration head (`20261029194855`, 62 applied, parity 62/62).
- [x] Verify Recipe Storage on PROD: `recipe-images` private, 2 MiB, image/webp & image/jpeg, 3 authenticated policies (SELECT, INSERT, DELETE), no UPDATE, no public access.
- [x] Verify Recipe database security on PROD: all 6 tables have RLS enabled; `bar_recipe_category_reorder` qualified fix verified (`c.id=ordered.id`, `SECURITY DEFINER`, search_path '').
- [x] Verify Inventory tables on PROD: 0 operational rows across all tables. Launch decision recorded: EMPTY INITIAL STATE. Zero operational data injected.
- [x] Restore Supabase CLI link to DEV (`the-lineup-dev` / `opmujepkemwcdxxorhfd`).
- [x] Locate canonical Recipe Markdown (`monks_cocktail_recipes_db_ready.md`), compute SHA-256 (`f3a82e5b448da2ad6b8006dffec30a0a7ef1bcfe82044f42fe9774772c45bced`).
- [x] Parse 38 recipes, 76 variants, 5 categories (20 Signature, 4 Margaritas, 6 Martinis, 7 Mocktails, 1 Shots), DB numbers 1-38; validate with `importSchema`.
- [x] Apply owner decisions to normalized release payload:
  - Recipe 33 (Virgin Coco Margarita Splash): Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz; warning resolved.
  - Recipe 20 (Smoked Vanilla Old Fashioned): Vanilla syrup 0.5 oz (Absolut Vanilia / Or omitted); warning resolved.
  - Suggested Bartender Tips: Excluded all 47 tips from import (0 tips imported).
  - Green Tea Shot (Recipe 38): Pricing omitted from DB fields, preserved in canonical source.
- [x] Regenerate normalized JSON artifact (`monks_cocktail_recipes_prod_normalized.json`, SHA-256 `ebabe35668487de6ca04b56a9db5c2fe0c1f720c7f901bb66516fcdf75c85b7a`).
- [x] Execute PROD Recipe dry run (`--mode dry-run`) with resolved payload targeting `ftadewtkjlaotfdvtjcv` with owner actor `4fc73830-14ed-42aa-94b0-e7ec22b196c3` and org `the-monks`: 38 creates, exit code 0.
- [x] Verify zero persistent writes on PROD after dry run: all 6 recipe table counts remain 0.
- [x] Maintain CLI linked to DEV (`opmujepkemwcdxxorhfd`).
- [x] Verify repository quality gates: `npm run check` clean, `npm run test` (157 files, 2,071 tests passed).
- [x] GATE C: Explicit owner Recipe import approval received and executed:
  - Live create-only import (`--mode create --execute --confirm-prod`) executed with matching dry-run report.
  - Successfully created 38 recipes, 76 variants across 5 categories in org `the-monks` (`284f0170-05a0-4d60-b171-1b5cb13ae076`) with actor Raj (`4fc73830-14ed-42aa-94b0-e7ec22b196c3`).
  - Readback verified on PROD: exactly 38 recipes, 76 variants (38 house, 38 perfect), 310 ingredients, 265 steps, 73 garnishes, 0 tips.
  - Category breakdown verified: 20 Signature Cocktails, 4 Margaritas, 6 Martinis, 7 Mocktails, 1 Shots.
  - Representative verification passed: Recipes 20 (Vanilla syrup 0.5 oz, Absolut Vanilia/Or absent), 33 (Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz), 35-37 (Simple, Flavored, Mint Lemonade), 38 (Green Tea Shot, Shots category, pricing excluded from DB).
  - Verified no extra/demo/test recipes exist (distinct numbers 1-38, total 38, org count 1).
  - Verified Bar Inventory operational tables remain empty (0 rows across all operational tables).
  - Supabase CLI linkage confirmed restored to DEV (`opmujepkemwcdxxorhfd`).
- [ ] GATE D: `development -> main` release PR, exact-head CI, merge commit, Vercel deployment verification, and browser smoke.

## In flight

GATE C Production Recipe import is complete and verified on `the-lineup` (`ftadewtkjlaotfdvtjcv`). Production database contains exactly 38 recipes, 76 variants (38 house, 38 perfect), and 0 tips. Bar Inventory operational tables confirmed at 0 rows. Supabase CLI is actively linked to DEV (`opmujepkemwcdxxorhfd`). Execution is halted awaiting explicit owner authorization for GATE D (`development -> main` release PR, merge commit, and Vercel deployment).
