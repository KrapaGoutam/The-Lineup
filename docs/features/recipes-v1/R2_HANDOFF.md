# Recipes V1 R-2 handoff

- Phase: R-2; checkpoint: R2-A; status: IN PROGRESS, NOT COMPLETE
- Base development and current HEAD: `8f358a422c91275319c9f4479891a54a4cbb21c3`
- Branch: `feature/recipes-v1-r2-management`
- R-1: COMPLETE; DEV migrations before R-2: 55 (R-1 reported state; not independently reverified in this session)
- PROD: UNTOUCHED; main: UNCHANGED; DEV: UNTOUCHED in this session.
- Completed: fetched and reconciled development; checked for existing branch; created branch; read R-2 contracts and local Supabase guidance; confirmed local Docker and Supabase stack running; discovered CLI migration/test commands.
- In progress: R2-A implementation has not started. The CLI-created empty migration was removed so it cannot be applied accidentally; create a fresh one with `npx.cmd supabase migration new bar_recipes_management_and_images` when resuming.
- Not started: management RPCs, Storage policies, database tests, clean replay, generated types, hosted DEV verification and all later checkpoints.
- Schema/RPCs: R-1 foundation remains unchanged. `private.recipes_apply` currently requires the existing recipe number on update, while the R-2 editor contract allows changing the number. Extend the write implementation carefully without changing import semantics; enforce uniqueness and stale protection atomically.
- Storage: no R-2 bucket or policies implemented or verified.
- Tests: no R2-A tests run.
- Known blockers: none established; hosted DEV target and permissions still need verification after local gates.
- Exact next action: create the migration with the CLI and implement the locked management and Storage contracts, then follow the ordered test and DEV gates in the request.
- Safety flags: no PROD, main merge, real recipe import, or Part 2; stop at R2-A. Do not apply to DEV until all specified local gates pass and the target is independently verified.
