# Recipes V1 — Security and roles

Status: **LOCKED in R-0**. Conventions are those of Bar Inventory V1 and Tasks V1 (audited and in production): membership-only role helpers, SELECT-only grants, writes through `SECURITY DEFINER` RPCs with an empty `search_path`, actor taken from `auth.uid()`. Authorization is **database-authoritative**; hidden buttons and `resolveTab` are convenience only.

## 1. Role model (verified in the repository)

| Designation (UI)  | DB role (`memberships.roles`) | TypeScript `AppRole` | `designation`       | Recipes V1     |
| ----------------- | ----------------------------- | -------------------- | ------------------- | -------------- |
| Owner             | `owner`                       | `owner`              | `owner`             | **Management** |
| Manager           | `general_manager`             | `manager`            | `manager`           | **Management** |
| Assistant Manager | `shift_manager`               | `manager`            | `assistant_manager` | **Management** |
| Staff             | `host`, `server`              | `server`             | `staff`             | **Read-only**  |

Sources: `normalizeDatabaseRole` / `designationForRoles` (`src/features/auth/domain/passcode.ts`), `getCurrentUser` (`src/lib/current-user.ts`), `private.inventory_is_manager` / `private.tasks_is_manager` (migrations `20261026170000`, `20261025090000`). The three management roles have **identical** capability (the app has no fourth tier); there is no Owner-only Recipes action.

**Helpers Recipes reuses or mirrors (no parallel role system):**

| Layer      | Use                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL        | New `private.recipes_is_manager(org)` — the same one-statement membership check as `inventory_is_manager` (`owner`, `general_manager`, `shift_manager`, active membership, `auth.uid()`). Same set, own seam.                                           |
| SQL        | New `private.recipes_is_member(org)` — any active membership (a Staff read needs it; no existing helper does exactly this without the `created_by` bypass in `has_org_role`).                                                                           |
| TypeScript | `isRecipesManager(designation) = designation !== "staff"` in `domain/recipe-types.ts`, mirroring `isInventoryManager` / `isTasksManager`. A shared extraction of the three one-liners is a separate refactor (backlog), not combined with this feature. |
| Shell      | `user.role !== "server"` (`isManager`) is **not** used for Recipes; Recipes is visible to everyone. Management UI is shown from `isRecipesManager(user.designation)`.                                                                                   |

`private.has_org_role` is **not** used: it also grants access to `organizations.created_by` regardless of membership (issue #106). Recipes, like Bar Inventory, authorizes by active membership only.

## 2. Capability matrix

| Capability                                                       | Staff | Assistant Manager | Manager |                                            Owner                                             |
| ---------------------------------------------------------------- | :---: | :---------------: | :-----: | :------------------------------------------------------------------------------------------: |
| Open the Recipes module                                          |  YES  |        YES        |   YES   |                                             YES                                              |
| View **active** recipes (index, detail, both variants)           |  YES  |        YES        |   YES   |                                             YES                                              |
| Search, switch List ↔ Picture Book, filter chips                |  YES  |        YES        |   YES   |                                             YES                                              |
| Switch Perfect / House                                           |  YES  |        YES        |   YES   |                                             YES                                              |
| View a recipe image (active recipe)                              |  YES  |        YES        |   YES   |                                             YES                                              |
| See **archived** recipes ("Show archived")                       |  NO   |        YES        |   YES   |                                             YES                                              |
| Open an archived recipe by slug or id                            |  NO   |        YES        |   YES   |                                             YES                                              |
| Add Recipe                                                       |  NO   |        YES        |   YES   |                                             YES                                              |
| Edit Recipe (basic info, both variants, flags, number, category) |  NO   |        YES        |   YES   |                                             YES                                              |
| Copy Perfect → House (editor)                                    |  NO   |        YES        |   YES   |                                             YES                                              |
| Archive / Restore                                                |  NO   |        YES        |   YES   |                                             YES                                              |
| Upload / replace / remove image                                  |  NO   |        YES        |   YES   |                                             YES                                              |
| Manage categories (add, rename, reorder, deactivate)             |  NO   |        YES        |   YES   |                                             YES                                              |
| Run the source import (service-role script)                      |  NO   |        NO         |   NO    | NO (operator task with the owner's authorization; actor recorded = an owner/manager profile) |
| Hard-delete a recipe                                             |   —   |         —         |    —    |                              — (does not exist anywhere in V1)                               |

Staff **must not see** Add, Edit, Archive, Restore, Upload, category management, Show archived, or any management control (not rendered, not merely disabled).

## 3. Enforcement layers

1. **Grants.** `anon`: nothing. `authenticated`: `SELECT` only on the six tables; no `INSERT/UPDATE/DELETE/TRUNCATE`.
2. **RLS `SELECT`** exactly as `DATA_MODEL.md` §5: members read active rows; management also reads archived rows; children inherit through `recipes_can_read_variant`. There is no write policy.
3. **RPCs** (R-2): `recipes_begin(org)` at the top of every write — `auth.uid()` not null and an **active** management membership of that organization, else `42501`. The organization is a parameter and **every id is validated against it** (category, recipe), so a forged cross-tenant id fails (composite FKs are the second line).
4. **Import RPC** (R-1): `execute` granted to `service_role` only; revoked from `public`, `anon`, `authenticated` (pgTAP asserts an authenticated manager cannot call it). It verifies `p_actor_profile_id` is an active management member of the target organization. The service-role key lives only in the operator's environment, never in the browser or CI.
5. **Server Actions**: `getCurrentUser(restaurantSlug)` resolves the caller's organization from the session and membership (never from a client-supplied organization id), `requireLiveSession` turns a deactivated/banned session into `sessionInvalid` so the shell signs out cleanly, and management actions reject non-management **before** calling the database (UX message only; the database re-checks).
6. **Storage RLS** (R-2): `STORAGE_PLAN.md` §3.
7. **Client**: `resolveTab` keeps its current behaviour (Recipes is open to every role); the management controls are conditional on `isRecipesManager` — convenience only.

**Inactive members.** `memberships.active = false` fails `recipes_is_member`/`recipes_is_manager`, so a deactivated person reads nothing even with an unexpired JWT (reads are RLS-gated; writes fail in `recipes_begin`). `requireLiveSession` additionally signs the UI out.

**Cross-organization.** A user of organization B reading organization A's rows gets zero rows; writing fails `42501` (not a member/manager of A). Two organizations may reuse the same `recipe_number` and the same `slug`.

**Input safety.** Recipe text is rendered as React text (escaped); no `dangerouslySetInnerHTML`, no markdown/HTML in any field. Formula-injection concerns do not arise (no export in V1). Image bytes are validated server-side (size and magic bytes) and re-encoded by the browser (EXIF/GPS stripped). Error messages are plain language and never echo SQL.

**Secrets.** No service-role key in the app bundle (`scripts/check-nonprod-env.mjs --scan .next` already scans builds). The importer reads it from the operator's environment only.

## 4. Error contract (shared by all Recipes RPCs; mirrors Bar Inventory)

| SQLSTATE | Meaning                                                     | Client mapping                                                                                                  |
| -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `42501`  | Not allowed (not a manager, not a member, signed out)       | "You don't have permission to change recipes."                                                                  |
| `22023`  | Validation (names the field)                                | Field-level message, focus the field                                                                            |
| `23505`  | Duplicate number / slug / category                          | "Recipe number 23 is already used by Cadillac Margarita." (from `detail.existing_label`)                        |
| `PT409`  | Stale (`detail.kind = 'stale'`, current version, who, when) | "Someone else changed this recipe (Name, 3:41 PM). Reload the latest to continue." Keep the form; offer Reload. |

## 5. Database test list (pgTAP; IDs and phases in `TEST_MATRIX.md`)

R-1 (`0043_bar_recipes_foundation.test.sql`): RLS enabled on all six tables; `anon` has no table privileges; `authenticated` has only `SELECT` (no write grant on any table); Staff reads active only; Staff cannot read archived (recipe, variants, children); management reads archived; inactive member reads nothing; cross-organization reads zero rows; composite-FK cross-tenant insert fails; `recipe_number` unique per organization (and allowed across organizations); archived recipe keeps its number (duplicate still refused); `slug` unique per organization and the reserved words refused; one `perfect` and one `house` per recipe (second `perfect` refused); `sort_order` unique per variant; image-path scope check; one fallback category per organization; archive-consistency check; import RPC not callable by `authenticated`/`anon`; import dry-run writes nothing; import create skips existing and never overwrites; import validates and rolls back as a unit; no security-definer function without `set search_path`; no `public` function executable by `anon`.

R-2 (`0044_bar_recipes_management.test.sql`, `0045_bar_recipes_storage.test.sql`): management can create/update/archive/restore; Staff cannot call any write RPC; stale save returns `PT409`; two parallel saves → exactly one wins; duplicate number returns `23505`; save is atomic (a failing child leaves the recipe, version and children unchanged); archived recipe cannot be saved; restore into an inactive category requires a category; category deactivate refused while active recipes remain; fallback category immutable except rename; reorder is deterministic; Storage policies per `STORAGE_PLAN.md` §5.

## 6. Residual risks and mitigations

| Risk                                                                            | Mitigation                                                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Staff can read all active recipes, including House recipes.                     | Intended (staff must make the drinks). If the owner later wants House recipes management-only, only `recipes_can_read_variant` changes.  |
| A manager can overwrite another manager's edit.                                 | `version` + `PT409` stale protection on every save; no silent last-write-wins.                                                           |
| Signed image URLs are bearer links for 1 hour.                                  | Short TTL; created only for callers who pass Storage RLS; recipe imagery is low-sensitivity; archived recipes stop signing immediately.  |
| `storage.objects` policy creation might not be permitted to the migration role. | Proven on local stack and hosted DEV in R-2 before merge; otherwise documented manual release step.                                      |
| Import with the service-role key bypasses RLS.                                  | RPC re-validates actor and organization; `dry_run` default; DEV/PROD guard in the script; PROD only in the owner-approved release phase. |
