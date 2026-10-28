# Current task: Recipes V1 R2-D — image pipeline

- [x] Verify clean starting branch/HEAD fcaba014 and fetched remote refs; read locked R2-D contracts.
- [x] Implement and verify browser validation/preparation, server caller-session Storage actions and compensation.
- [x] Integrate signed URL lifecycle, detail hero and saved editor Add/Replace/Remove; preserve demo/Staff/archive boundaries.
- [x] Verify focused tests (20 files / 185), check, full Vitest (144 / 1,878), browser (15/15) and both builds/scans (zero PROD/secret matches).
- [x] Verify hosted DEV upload/read/replace/stale/remove/archive, migration parity 56/56 and zero synthetic Storage/DB residue.
- [ ] Review diff, update handoff, commit/push same branch and verify clean/local=remote.

Data: existing private recipe-images bucket and bar_recipe_set_image only; no migration. Authorization: server-resolved active membership plus caller-session RLS/RPC. UI: save-first, idle/preparing/uploading/success/error, confirmation, placeholder and single error retry. Risks: partial upload/metadata compensation, stale versions, best-effort cleanup and expiring bearer URLs. Tests: domain, actions/data, lifecycle/components, browser encoding and hosted Storage authorization. List View loads no images per locked S-11; thumbnail display deferred with Picture Book to R2-E.

R2-E NOT STARTED. PROD, main/development, migrations and Part 2 out of scope.

In flight: implementation/validation complete; final git and completion documentation remain. Hosted application data-layer JWT Storage suite 6/6 PASS; hosted editor regression 1/1 and final image browser 1/1 PASS, including real Staff action replay denial and no-reload detail invalidation. Independent connector audit: six Recipes tables 0 rows each, recipe-images 0 objects, R2-D synthetic Auth users/organizations 0; bucket private with 2 MiB JPEG/WebP limits, UPDATE policies 0. DEV/repository parity 56/56, zero mismatches. Exact failed-run prefix mvsn3vrr also cleaned through Storage API. Security/accessibility/scope diff review complete. All code/tests ready for feature commit/push, followed by completion handoff.
