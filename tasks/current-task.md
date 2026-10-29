# Current task: Recipe Detail editorial design reference

Branch `docs/recipe-detail-editorial-reference` from fetched `origin/development`
`3fcb96e81dead0fe19694f656627d383be157201`. Main at preflight
`9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`. Recipes R-2g merged as PR #228.

- [x] Fetch and preflight; preserve the untracked export; create docs branch.
- [x] Inspect Concept E and export dependencies; document approved behavior.
- [x] Review the documentation scope and local asset references; incidental export files excluded.
- [ ] PR #229: fix export formatting gate, observe required checks and merge if GO.
- [ ] Verify development, assets, tracking and unchanged main.

Concept E and Presentation behavior: House differs are approved; the reference is
being versioned. No UI implementation is part of this phase. Next implementation
may be performed by Claude Cloud on a new branch from updated `origin/development`.
Preserve existing Recipes contracts and do not reopen the previous mobile tabs
decision. `main` remains untouched; production promotion requires owner approval.

PR #229 targets development. CI flagged the verbatim export in formatting and
lint; exclude only its HTML and support script from Prettier and the script from
ESLint, following the existing design-export convention. Next: validate, commit
and push the lint correction, then observe current checks before merging.
