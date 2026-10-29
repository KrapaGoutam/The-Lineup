# Recipes V1 — Release Candidate Validation + Production Preflight

Owner-approved scope: attached execution profile, 2026-10-29. Production is read-only; no imports, Storage mutation, deployment or main merge.

- Baseline / PR #237 merge: `dd792f359a77b60ea05115ce8c682b38a5a6d5d8`.
- Main: `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`.
- Branch: `release/recipes-v1-production-preflight`; worktree: `.tmp/recipes-prod-preflight`.
- DEV: `the-lineup-dev`, `opmujepkemwcdxxorhfd`; PROD: `the-lineup`, `ftadewtkjlaotfdvtjcv`; both East US (Ohio), verified by CLI project listing.
- Existing parent-worktree changes and shelved worktrees preserved.

## Contract

Data: new forward migration only for category ID validation; no changed table shape. Authorization: retain active manager membership, organization scope, grants and pinned search path. UI: unchanged. Import: explicit prod origin, organization, default dry run, deliberate execution acknowledgement and resolved warnings; create/upsert only. Risks: environment selection, hidden writes in dry run, warning bypass, unknown category IDs. Tests: focused importer unit tests and pgTAP first, repository check/test/build, exact-head CI; no browser rerun for unchanged UI.

## Checklist

- [x] Verify #237 already merged, expected head and CI #238 success through GitHub connector; fetch latest development and verify main.
- [x] Create isolated worktree; verify both exact Supabase project refs; keep CLI 2.76.8 (available 2.122.0).
- [x] Link DEV explicitly; inspect actual DEV and PROD history; restore DEV immediately.
- [x] Reproduce and fix category reorder; test locally; apply reviewed fix to DEV only and verify parity.
- [x] Implement and test Production importer safeguards with mocked writes.
- [x] Inspect pending migrations, PROD Inventory/Storage/recovery, canonical payload/source, app configuration.
- [x] Write exact future Production plan and update release tracking/docs.
- [x] Local validation, security/accessibility/tenant/scope review and secret/artifact scan (12 intended files) pass.
- [ ] Commit, push, open PR and verify exact-head CI.
- [ ] Conditional merge to development — withheld while recovery/data preflight blockers remain.
- [ ] Verify ending development/main and DEV linkage; return preflight decision and owner decisions.

## In flight

GitHub and Vercel local credentials work outside the sandbox; connectors lacked write/team access, so local CLI provides authorized tracking/inspection. PR #237 already merged; issue #238 created, #220 updated in progress, #234/milestone #7 open. DEV fix `20261029194855` applied and verified, parity 62/62; PROD 54 through `20261028100100`, exact eight pending in PRODUCTION_RELEASE.md. Seven historical PROD name/statement-serialization differences investigated: SQL tokens match DEV, no repair. Reorder baseline failed 3/12 assertions; fixed 12/12. Combined local pgTAP 49 files / 1550 assertions; SQL lint pass. Focused importer 29/29, check pass, full unit 2061/2061, build pass after isolated locked npm ci. No types shape change. Local browser suite not rerun (no UI change); exact-head CI required.

PROD Inventory operational tables empty; no approved Inventory source found. Canonical Recipe source not found (expected 38/76); two content warnings left for owner. Recipe bucket absent (migration creates it). Vercel Production branch main and required variable names verified; values unverified. Backup metadata returns 403 for missing backups_read, so usable recovery point remains a mandatory execution gate. See docs/features/recipes-v1/PRODUCTION_RELEASE.md for P0–P14, pending migration reviews and decisions. No Production migration, row/import/Storage write, deployment or main merge. Tokens never printed/stored. Focused final importer 32/32; final full unit 2064/2064. Decision: NO-GO — PREFLIGHT BLOCKERS REMAIN; safe PR prepared for review, conditional development merge withheld. Next: commit/PR and exact-head CI, then return concrete owner gates (no Production execution).
