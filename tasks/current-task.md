# Current task: Recipe Detail Concept E implementation (#230)

- Branch: `feature/recipe-detail-editorial-concept-e`, from `origin/development` `69391777b2a5b2a2db2a8bca20b04bc7533b226a`.
- Scope: presentation/interaction only. No schema, migration, authorization, concurrency or Realtime change.

## Checklist

- [x] Verify state, read Concept E reference and canonical screenshots, audit current detail code and tests.
- [x] Domain helpers: `recipe-differences.ts` (House differences, shared/split presentation), `deriveGlanceFields` in `recipe-glance.ts`.
- [x] Components: `recipe-detail.tsx` (header, Quick Glance strip, jump links, spread/single), `recipe-detail-variant.tsx`, `recipe-detail-presentation.tsx`; `--font-serif` token in `globals.css` (no new font dependency).
- [x] Tests: unit/component updated (tabs replaced by stacked + jump-link coverage), new domain tests, `recipes-detail.spec.ts` updated.
- [x] Validation: `npm run check`, full `vitest` (2028 pass), `npm run build`, recipes Playwright on desktop + server-mobile (32 pass), manual screenshots at 1440/820/390 light+dark, no horizontal overflow.
- [x] Docs: STATUS, ROADMAP, UI_UX_PLAN, backlog.
- [ ] Commit, push, PR to `development`, exact-head CI, merge commit, update/close #230 after merge.

## Locked decisions

- Desktop breakpoint is `lg` (1024px); below it Perfect then House stack with Perfect ↓ / House ↓ jump links (focus moves to the variant heading; smooth scroll honours reduced motion). Segmented tabs removed from Recipe Detail only.
- House differences are derived for display (normalized name+amount+unit for ingredients, normalized text for steps); marked by inset accent edge, tint, bolder amount and "House adjustment" text (sr-only note on the Perfect side). Not destructive/warning styling.
- Presentation specs (Glass, Garnish, Rim, notes) moved out of the variant articles into Final Presentation after the recipes; shared block when equivalent, else Perfect/House Presentation.
- Known limitation: one canonical image per recipe (`image_path`), so the image is shown once in both states; no per-variant images, no schema added.
- `host-tablet` Playwright project (WebKit) cannot run in this cloud container (browser not installed); it runs in CI.

## Current State & Next Step

Implementation and docs complete locally. Next: commit, push, open PR #230 → `development`, wait for CI on the exact head, merge with a merge commit, verify `development`, then update issue #230. Do not touch `main`.
