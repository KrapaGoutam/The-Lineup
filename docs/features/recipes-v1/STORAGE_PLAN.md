# Recipes V1 — Image storage plan

Status: **LOCKED in R-0**. Nothing here exists yet: no bucket, no policy, no object. R-2 creates the bucket and policies in its migration; R-1 only reserves the two nullable columns and renders the placeholder.

## 1. Repository truth

| Fact (verified at `development` `73ebc21`)                                                                                                   | Consequence                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| No Storage bucket, no `storage.objects` policy and no `[storage.buckets.*]` config exists.                                                   | There is no pattern to reuse; Recipes defines the first one. Keep it small and conventional.                                         |
| `supabase/config.toml` has `[storage] enabled = true`, `file_size_limit = "50MiB"`.                                                          | Local Storage works for pgTAP/E2E; the bucket limit below is stricter and per bucket.                                                |
| `next/image` is not used; the only `<img>` elements are logos (`eslint-disable @next/next/no-img-element`).                                  | Plain `<img>` is the repository convention. No `images.remotePatterns` config, no Vercel image-optimizer usage (free-tier friendly). |
| Server Actions already carry `serverActions.bodySizeLimit = "8mb"` and every mutation goes through Server Actions with `requireLiveSession`. | Uploads go through a Server Action too, so content checks happen server-side and the session check is shared.                        |
| The browser Supabase client is used only for Realtime.                                                                                       | The browser never talks to Storage directly in V1.                                                                                   |
| No CSP header is configured.                                                                                                                 | Signed Supabase URLs load without header changes. If a CSP is ever added, `img-src` must allow the Supabase project host.            |

## 2. Decisions

| #    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1  | **One bucket `recipe-images`, private** (`public = false`). Not a prefix in some other bucket: none exists. Not public-read: recipe imagery is internal source material, archived recipes must stop serving, and the security rules forbid world-readable business data.                                                                                                                                                        |
| S-2  | **Path** `<organization_id>/<recipe_id>/<image_uuid>.<ext>` for the hero and `<organization_id>/<recipe_id>/<image_uuid>-thumb.<ext>` for the thumbnail. `<ext>` is `webp` or `jpg`. Stable ids, never names (renaming a drink never moves an object). A fresh `image_uuid` per upload → **objects are immutable** (never overwritten).                                                                                         |
| S-3  | **Read** = any active member of the organization, for an **active** recipe; management also for archived ones. **Write** (insert, delete) = management only, only into the folder of an existing **active** recipe of their own organization. **No UPDATE policy** → no overwrite/upsert is possible.                                                                                                                           |
| S-4  | **Enforcement is Storage RLS on `storage.objects`**, plus the `bar_recipes_image_scope` check, plus the `set_image` RPC. UI hiding is cosmetic.                                                                                                                                                                                                                                                                                 |
| S-5  | **Browser prepares, server validates, user session writes.** The browser downscales/re-encodes (also stripping EXIF/GPS) and sends the two blobs to a Server Action; the action re-checks size, magic bytes and role, uploads with the **caller's** Supabase session (RLS applies; the service-role key is never used here), then records the paths via RPC.                                                                    |
| S-6  | **Accepted input** (file picker): JPEG, PNG, WebP, up to **8 MiB** and at least 200 px on the short side. **Stored output**: WebP (JPEG fallback when the browser cannot encode WebP). iPhone HEIC is converted to JPEG by iOS when the picker `accept` lists only the three types above; any other type is rejected with a plain message.                                                                                      |
| S-7  | **Dimensions**: hero ≤ **1600 px** long edge (target ≤ 400 KB, hard limit **2 MiB**); thumbnail ≤ **480 px** long edge (target ≤ 60 KB, hard limit **300 KB** in the action; bucket limit 2 MiB). Aspect ratio is preserved; display uses `object-fit: cover` in a fixed-ratio box (cards 4:5, hero 16:10). No cropping tool, no filters, no server-side image editing.                                                         |
| S-8  | **Bucket settings**: `file_size_limit = 2097152`, `allowed_mime_types = {image/webp, image/jpeg}`. (The 8 MiB source limit is client/action only.)                                                                                                                                                                                                                                                                              |
| S-9  | **Delivery**: signed URLs, TTL **3600 s**, created server-side with the caller's session (so Storage RLS gates URL creation). Thumbnails are signed in one `createSignedUrls` batch when the Picture Book is first shown; the hero URL is signed with the recipe detail. The client refetches when `expiresAt` is within 5 minutes, on `visibilitychange`, and once on an `<img>` error before falling back to the placeholder. |
| S-10 | **Caching**: objects upload with `cacheControl: 31536000` (immutable by name). Signed URLs carry a token so the browser cache key changes per signing; at 40–250 thumbnails of ≤ 60 KB this is acceptable and avoids a proxy route. A stable-URL image route is backlog B-RC-6 if usage proves it necessary.                                                                                                                    |
| S-11 | **Lazy loading**: `<img loading="lazy" decoding="async">` with explicit `width`/`height` or `aspect-ratio` boxes (no layout shift). Only thumbnails load in Picture Book; the hero loads only on the detail page. List View loads no images.                                                                                                                                                                                    |
| S-12 | **Alt text** = the recipe name (`alt="Cadillac Margarita"`). No alt-text field in V1. The placeholder is `aria-hidden` with the name always present as visible text.                                                                                                                                                                                                                                                            |
| S-13 | **Placeholder** (no image, or image failed): a tinted tile with a cocktail-glass icon (`Martini` from `lucide-react`; confirm the export exists in the pinned version, else `GlassWater`). Never a broken-image icon, never an empty card.                                                                                                                                                                                      |
| S-14 | **Orphans**: the upload action compensates in-flow (a failed `set_image` deletes the just-uploaded objects; a successful replace/remove deletes the previous objects, best-effort). A repair script for stragglers is backlog B-RC-5 (low volume, service role, dry-run default, DEV/PROD guard like `bootstrap-owner.mjs`). Hosted tests delete their own prefix.                                                              |
| S-15 | **Licensing**: initial imagery is **owner-provided** (uploaded by management) or the placeholder. Nobody sources images from the web; the original PDF's page images are **not** reused as recipe images (`SOURCE_MAPPING.md` §6).                                                                                                                                                                                              |
| S-16 | **Recipe data stays complete without images.** Image failure never blocks viewing or saving a recipe.                                                                                                                                                                                                                                                                                                                           |

## 3. Policies (pseudo-SQL for the R-2 migration)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Parse '<org>/<recipe>/<uuid>(-thumb)?.(webp|jpg)'; NULL when the name does not match (no uuid cast can throw).
create function private.recipes_image_parts(p_name text) returns uuid[] …  -- {org, recipe} or null

create function private.recipes_can_read_image(p_name text) returns boolean … security definer
  -- parts not null AND exists recipe(id, org) AND private.recipes_can_read_recipe(recipe_id)
create function private.recipes_can_write_image(p_name text) returns boolean … security definer
  -- parts not null AND private.recipes_is_manager(org)
  --   AND exists recipe(id = recipe, organization_id = org, is_active)

create policy recipe_images_select on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and private.recipes_can_read_image(name));
create policy recipe_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and private.recipes_can_write_image(name));
create policy recipe_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and private.recipes_can_write_image(name));
-- deliberately NO update policy
```

R-2 must prove on the local stack (pgTAP, `set local role authenticated` with a JWT claim) **and** on hosted DEV that `storage.objects` policies can be created by the migration role. If the migration role cannot, the policy statements become the documented manual step in the release plan, and R-2 reports it before merging (this is the one Storage-specific risk of the release).

## 4. Flows

**Upload / replace** (Server Action `uploadRecipeImageAction(formData: recipeId, expectedVersion, hero, thumb)`):

1. `getCurrentUser` + `requireLiveSession`; management only; recipe must be active.
2. Validate: both blobs ≤ limits, magic bytes are WebP (`RIFF…WEBP`) or JPEG (`FFD8FF`), extension derived from the sniffed type (never from the client name/MIME).
3. Upload hero then thumb with the caller's session at fresh `image_uuid` paths (`upsert: false`).
4. `bar_recipe_set_image(org, recipe, expectedVersion, heroPath, thumbPath)`. On `PT409`/error → delete both new objects, return the plain message.
5. Delete the previous hero and thumb (best-effort; failures are logged to the action result as a warning, not shown as an error).
6. Return the new version and fresh signed URLs.

**Remove**: `set_image(…, null, null)` then delete both old objects.

**Archive**: images stay (restore is lossless); Staff stop seeing them immediately (policy requires an active recipe).

## 5. Test obligations (full IDs in `TEST_MATRIX.md`)

pgTAP: Staff read active / denied archived; management read both; cross-organization denied (select, insert, delete); Staff insert/delete denied; insert into another recipe's folder or a non-matching name denied; no UPDATE possible; unauthenticated denied. Hosted DEV (`tests/real`): management upload, Staff read via signed URL, replace, remove, cross-org denial, cleanup, using a **tiny controlled test image** (a few hundred bytes, generated in the test — never a large asset).
