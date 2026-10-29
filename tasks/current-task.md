# Recipes V1 owner acceptance fixes — IN PROGRESS

- Starting development: `21956cf70b43dd4bfa0872b8038bcfd0a3862bce`; main: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`.
- Branch: `fix/recipes-owner-acceptance-must-fix`; canonical QA issue #234; milestone Recipes V1 — Release Readiness.
- [x] Fetch and verify baseline; preserve pre-existing untracked paths.
- [x] Investigate preview provenance and reproduce scoped findings before source changes.
- [x] Implement scoped fixes and targeted regression coverage; no schema change.
- [x] Record all deferred findings and blocked Staff coverage in #234 and backlog; update #220 and local roadmap/status.
- [ ] Final review and commit; open PR, require exact-head CI, merge only if GO. Owner retest remains required; release NO-GO.

## Baseline and validation

Preview SHA unverified: Vercel lookup returned 404; GitHub deployment correlation unavailable. Current development was tested. RD-E-001: not reproduced; preparation comparison and regression test from #233 pass. RD-E-002: reproduced at 820/390: targets at 16px beneath a 149px sticky header. RD-E-003: reproduced presentation notes as garnish. RD-E-004: near-white report not reproduced on sampled controls; existing amber ring measured 2.58:1 on Light background. RD-E-006: heading focus and outline present in baseline; #233 verified, though obscured by RD-E-002. RD-E-009: reproduced default empty Perfect serialization and demo rendering. Original focused Vitest 45/45 and existing tablet/mobile browser tests 2/2 passed but missed these edge cases.

Changes: measured shell offset, shared Light ring and explicit semantic outlines, garnish-only glance, omit truly empty variants while retaining rows and all meaningful fields; filter empty legacy variants on detail. Focused Vitest 61/61; full Vitest 2034/2034; targeted browser 9/9 desktop/WebKit tablet/mobile including 820/390 and both themes; build and typecheck pass. `npm run check` blocked at format by preserved untracked `.tmp/recipe-detail-issue.md` and `docs/design-reference/recipes/recipe-detail-concepts/github.md`; full lint separately reports seven pre-existing ignored `artifacts/dev-manual-preview` warnings. Scoped lint passes. Project board unavailable: GitHub token lacks `read:project` scope. PR/head pending.

Data and authorization unchanged: existing tenant-scoped recipe save and membership/RLS. UI retains responsive single/dual, validation, and reduced-motion behavior. Risks checked: meaningful variant data, sticky header sizing and focus in both themes. Deferred RD-E-005/007/008, Staff TC-19, and O-1 through O-4 remain tracked in #234 and backlog. Main, Production and Part 2/3 untouched.

Next: final diff/security/accessibility review, commit and PR to development, exact-head CI. Owner browser acceptance retest is required after merge.
