# Current task: Recipe Detail Concept E implementation (#230)

## Independent audit in flight

- Baseline `development` / `origin/development`: `d7678164ca12ffbd6f96c614f0db04aed5cc9cf9`; branch `fix/recipe-detail-concept-e-final-audit`.
- [x] Preserve pre-existing untracked files, fetch, fast-forward development, create audit branch.
- [x] Inspect Concept E implementation and identify comparison and focus concerns; focused existing unit tests pass.
- [x] Reproduce missing ingredient preparation and step ordering differences; implement display-only corrections and focus outline.
- [x] Correct whitespace-only Quick Glance values; focused Vitest 39/39, targeted lint and typecheck pass; targeted WebKit 1/1 passes after fixes.
- [ ] Review and complete fix PR workflow, including exact-head CI.
- Tablet WebKit: installed already; `npx.cmd playwright test tests/e2e/recipes-detail.spec.ts --project=host-tablet --workers=1` passed 1/1 locally. CI browser-smoke runs desktop Chromium only.
- Local `npm run check` cannot pass unchanged: format check sees two pre-existing untracked files and lint sees seven warnings in ignored `artifacts/dev-manual-preview`; do not modify or delete those files. Typecheck passes.

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
- The authoring container lacked WebKit; PR #232 CI browser-smoke covered desktop Chromium only. The independent local audit ran WebKit as recorded above.

## Current State & Next Step

PR #232 merged into `development` at `d767816`; #230 is closed. Independent audit fixes are in flight on the branch above. Finish targeted validation and review, then commit, push, open a fix PR to `development`, and require exact-head CI before merging. Do not touch `main` or Production.
