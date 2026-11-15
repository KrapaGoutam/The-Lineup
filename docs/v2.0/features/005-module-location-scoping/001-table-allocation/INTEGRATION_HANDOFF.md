# PR305 / PR306 integration handoff

## Actual Git state and authority

PR305 merged through standard gh CLI, without bypass, at2026-11-07T06:21:30Z.
Development/merge: ad878715b84fcdc3f36414b882d52207fb4f139e. Its tree matches reviewed
7271141d0bc0c586ffb2d8477439bc938055cb9f. Enforcement STAGED; issue304 remains open.
Remote PR306 remains OPEN at40c99addf568c1c34c91678ee09e300d55227437.
Local integration merge: dfd2118003dfd7a2a5f333db81c9007b25e37bb5.
Parents: original30640c99addf568c1c34c91678ee09e300d55227437 and actual
developmentad878715b84fcdc3f36414b882d52207fb4f139e. No force/rebase/history replacement.
A documentation-only delivery commit records this merge; no remote push occurred.
GitHub main remains5e5b7747693b6e81014eafdf299b87e56c3f033d.

Owner authorized305 merge,306 local integration/validation and push only after
verified Preview safety. No306 merge, hosted migration/configuration/activation,
main/Production change, JobQuest change or V2-005.002 is authorized.

## Resolution

Four actual conflicts: allocation-actions.ts, shared STATUS/CURRENT_STATE and task
checklist. Actions and five test/fixture files reuse preserved validated bde49c9;
generated types auto-merged and match both schemas. Runtime code, all migrations,
scripts/workflows/packages/configs match the validated composition exactly.

Preserved: real canonical Overall/ordinary actors, live session, stale expectation,
verified org/location/timezone, session ownership, module guards before board reads,
restrictive module/location RLS, begin_board_write assertion, recovery exemptions,
actual actor snapshots, participant FKs, revocation and undo/redo history.

Only effective test difference:0063_allocation_location_scoping fixed service dates
expired on November7. Ten literals now use transaction-stable current America/Chicago
date, preserving the actual previous-day read-only rule and existing assertions.
No reviewed migration was changed. The inherited305 migration trailing blank line
is preserved; diff-check against validated composition passes.

## Migration compatibility

20261106120000_module_backend_enforcement.sql ->
20261106150000_table_allocation_location_scoping.sql ->
20261106221451_allocation_overall_actor_identity.sql.
All unchanged. Local ledger76; hostedDEV freshly verified73/latest20261105210000,
with rosterRPC and enforcement switch absent. No hosted migration was deployed.

## New local verification

- Targeted actor/action/module tests57/57.
- Fullcheck(format, zero-warninglint, TypeScript), fullunits3258/7 existing skips,
  production webpackbuild, tracked-path/nonproduction/secret-pattern scans PASS.
- Final combinedpgTAP65files2163 assertions PASS. Initial3failures correctly
  enforced historical-date lock; targeted corrected65 and fullsuite then PASS.
- Actual Allocation/OverallJWT45/45; moduleJWT15/15; Overallmodule3/3;
  eleven-role Enabled/Disabled/Missing matrix13/13.
- Authenticated Chromium/WebKit iPad/mobile15/15, actor history and undo/redo.
- Cleanup: zero orgs/profiles/Auth users/module rows/events; no unvalidated
  constraints; modeSTAGED, activation_referenceNULL; taskserver stopped.
- Reused, not rerun: clean76-migration replay and legacy-data upgrade receipts,
  because migration contents are identical to validated bde49c9.

Logs remain ignored under test-results/integration-\*.log. No new integrated-head
GitHub CI exists until a safe push; old40c99ad checks do not validate the new SHA.

## Verified Preview safety block

Existing VercelCLI61 provides supported read-only access; the old connector403/
recovery404 was not retried. Project prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ in onepiece11
has productionBranch main, no configured password protection and no SSO deployment
type. Public NEXT_PUBLIC_SUPABASE_URL for Preview (generic binding, no306 override)
matches hostedDEV. Only that public variable was read; no secret values printed.

Actual automatic305 deployment dpl_AaMab6ZmdNywrXB4RzbahnUCQZYS is READY, target
Preview, refdevelopment, exactad878715. No Production deployment was triggered.

PR306 requires missing board_location_roster. Pushing would build an incompatible
DEV-backed Preview without verified traffic containment. **PUSH BLOCKED.** No
push was attempted and no deployment/traffic/env setting was changed.

## Resume

Owner must separately approve and execute compatible DEV schema-first deployment,
or establish verified isolated Preview backend/traffic containment. Recheck live
binding, schema and refs; then push existing306 without force and require exact-new-
head application/browser/migration-policy/Vercel/PreviewComments CI. Record skipped
deploy-migrations. PR306 still needs separate owner merge approval afterward.

Operational handoff is untracked .tmp/v2-integration-handoff/{CURRENT_AGENT_STATE,
INTEGRATION_HANDOFF,VERIFICATION_RECEIPTS,NEXT_AGENT_INSTRUCTIONS}.md. Preserve
parent checkout, both feature worktrees and reference .tmp/v2-controlled-integration-20261106.

## Evidence

- [PR305 merge](https://github.com/KrapaGoutam/The-Lineup/commit/ad878715b84fcdc3f36414b882d52207fb4f139e).
- [PR305 merge receipt](https://github.com/KrapaGoutam/The-Lineup/pull/305#issuecomment-6703320489).
- [Issue304 rollout receipt](https://github.com/KrapaGoutam/The-Lineup/issues/304#issuecomment-6703320690).
- [Actual305 automatic Preview](https://vercel.com/onepiece11/the-lineup/AaMab6ZmdNywrXB4RzbahnUCQZYS).
- [Reviewed305 application/browser CI](https://github.com/KrapaGoutam/The-Lineup/actions/runs/42274211775).
- [Reviewed305 migration-policy CI](https://github.com/KrapaGoutam/The-Lineup/actions/runs/42274211632), deploymentSKIPPED.
