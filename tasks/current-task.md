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
- [x] Generate normalized JSON artifact (`monks_cocktail_recipes_prod_normalized.json`, SHA-256 `f41a803217ae730bf81a433c3cc91fc37e3c762488774d403b0776f0fa74d08b`).
- [x] Exclude suggested tips (47 tips across 38 recipes) by default pending owner decision.
- [x] Track unresolved import warnings: Virgin Coco Margarita Splash (0.75 oz vs 2 oz), Smoked Vanilla Old Fashioned (Absolut Vanilia vs vanilla syrup).
- [x] Execute PROD Recipe dry run (`--mode dry-run`) targeting `ftadewtkjlaotfdvtjcv` with owner actor `4fc73830-14ed-42aa-94b0-e7ec22b196c3` and org `the-monks`: 38 creates, exit code 0.
- [x] Verify zero persistent writes on PROD after dry run: all recipe counts remain 0.
- [x] Maintain CLI linked to DEV.
- [ ] GATE C: Explicit owner Recipe import approval (pending owner decisions on warnings and suggested tips).
- [ ] GATE D: `development -> main` release PR, exact-head CI, merge commit, Vercel deployment verification, and browser smoke.

## In flight

Production migration batch (8 migrations) is successfully executed and verified on `ftadewtkjlaotfdvtjcv`. Parity is 62/62 at head `20261029194855`. Recipe storage and database security are verified. Inventory operational state confirmed empty. Canonical 38-recipe source is parsed, normalized, schema-validated, and verified via transactional rollback dry run on PROD. Zero persistent rows written. CLI safely relinked to DEV. Execution is halted at the Recipe Import Approval Gate awaiting owner decisions.
