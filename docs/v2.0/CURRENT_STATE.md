# The Lineup V2.0 — Current Operational State

Execution checkpoint (2026-11-08): V2-005.001-.005 and .008 are complete. Batch A (PR #313) delivered Schedule/Roster + Team/Settings; V2-005.005 Payroll is delivered via PR #314 after an independent financial/security review that closed a P0 (branch managers could fabricate payroll periods by direct PostgREST insert) and eight further findings in the not-yet-deployed migration. Hosted DEV (`opmujepkemwcdxxorhfd`) migrated 79 -> 80 with `20261108021714_payroll_location_scoping.sql` (sha256 `ed210194...dd395`) after a fresh encrypted ledger-79 backup, isolated restore and populated rehearsal; hosted authorization probe 73/73 with nothing persisted; backend enforcement remains STAGED and no module configuration exists (hosted UI acceptance DEFERRED). V2-005.006 Bar Inventory and .007 Recipes (Batch B, PR #315) were independently reviewed (P0: app actor helpers used wrong RPC argument names and denied every user; P1: FK deferrability and CI fixtures), rehearsed on real restored DEV data (76 data digests identical) and applied to hosted DEV 80 -> 81 with `20261108160000_batch_b_inventory_recipes.sql` (sha256 `ccd95597...18ccc8`); rolled-back hosted probe 94/94 (SQL-simulated roles). Enforcement remains STAGED, no module configuration exists, hosted UI acceptance DEFERRED. All eight V2-005 subfeatures are merged. Main and Production untouched. [Bar Inventory evidence](features/005-module-location-scoping/006-bar-inventory/EVIDENCE.md). [Payroll evidence](features/005-module-location-scoping/005-payroll/EVIDENCE.md).

Previous checkpoint (historical): V2-005.001 Overall actor repair, PR #306 / issue #307, TECHNICALLY READY FOR OWNER REVIEW (OPEN / NOT MERGED). Actual membership-free Overall mutations, real actor attribution, preserved historical data and standalone/combined acceptance pass. Repair-head CI is green; final documentation-delivery receipts are on the PR. [EVIDENCE.md](features/005-module-location-scoping/001-table-allocation/EVIDENCE.md). V2-004.004 remains implemented in open PR #305, staged / activation blocked; R1, hosted DEV deployment and owner merge order remain pending. No main or Production changes/contact. V2-005.002 through .008 NOT STARTED. Earlier checkpoints below retain their historical validation scope.

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Completed Feature:        V2-002 — Organizations & Locations (COMPLETE)
Completed Subfeature:     V2-002.005 — Location Lifecycle Integrity (COMPLETE)
Environment:              Codex Local; verified hosted DEV only
Final PR HEAD:            87e727cd808058da0ca9852dc1c7fbf5bce35854
PR #282 Merge SHA:        c543856a767b9f55452bf5f1c26bf5449d2e624b
Integration Branch:       development
Main SHA (unchanged):     5e5b7747693b6e81014eafdf299b87e56c3f033d
GitHub Milestone:         The Lineup V2.0 (#8; remains open)
GitHub Program:           #248 (open)
Feature/Subfeature:       #250 / #281 (closed)
DEV Migration Status:     SYNCHRONIZED 73/73 (V2-004.001 applied 2026-11-05)
Latest Migration:         20261105210000_location_module_configs
Hosted pgTAP:             362 assertions passed (0050–0061)
Actual JWT Authorization: PASS (eight synthetic identities + anonymous)
Concurrency:              PASS (A–D; both publication orderings)
WebKit host-tablet:       PASS 16/16
Canonical Types:          MATCH
Exact-head CI:            application/browser-smoke/database/Vercel PASS
Blockers:                 NONE
Active Subfeature:        V2-004.004 Backend Enforcement - issue #304
Active Subfeature Status: IMPLEMENTED - ACTIVATION BLOCKED (staged; hosted DEV NOT READY 0/44 active locations configured); record: 004-backend-enforcement/STATUS.md
Previous Subfeature:      V2-003.005 Multi-Tab / Stale Context Safety — COMPLETE (PR #296, merge de8c6732; hosted DEV 17/17, Chromium 20/20, WebKit iPad 20/20, HTTPS Preview 7/7)
Next Subfeature:          V2-005.002 Tasks (NOT STARTED; NOT AUTHORIZED); first resolve #306 closeout and #305 order
Production Changes:       NONE; Production not contacted
Main Branch Merge:        NONE
```

V2-001 and V2-002 are complete. V2-002.005 reused the Cloud implementation, added the narrow database-authoritative schedule-publication guard, verified hosted DEV with synthetic fixtures and true independent sessions, reconciled canonical types, and passed the real iPad/WebKit gate before merging the same PR.

Evidence: [Location Lifecycle Integrity](features/002-organizations-locations/005-location-lifecycle-integrity/EVIDENCE.md). The resulting docs-only development integration SHA is recorded in GitHub tracking and the final report. Main and Production remain untouched.

Next recommended environment: Claude Code Cloud for the bounded V2-003.001 feature, with Codex Local for hosted DEV/WebKit validation if required. Do not infer approval for Production or main promotion. V2-003 was not started in this closeout.

## V2-004.001 (COMPLETE — PR #299 merged into `development`; validated locally and on hosted DEV)

Issue #298 (parent #252, program #248, milestone #8); PR #299 merged into `development` by regular merge commit (SHA on the PR and issue). Migration `20261105210000_location_module_configs.sql` (additive, forward-only, inserts nothing): enum `location_module_key`, table `location_module_configs` (composite key `(location_id, module_key)`, explicit `is_enabled` with no default, validated informational `metadata`, immutable ownership, no client delete, frozen at archived locations), RLS aligned to the existing location-administration authority. TypeScript: canonical module registry + enabled/disabled/missing/unavailable result model + a reader that never reports a failure as an empty configuration. **No behaviour change**: nothing reads the table, demo mode never touches it. **Validation:** official local Supabase stack (CLI 2.76.8) — `db reset` applied all 73 migrations, `supabase test db` 62 files / 2012 assertions PASS (`0062` 92/92; `0039`/`0042`/`0045` pass); CLI-generated types identical to the committed file; hosted DEV `the-lineup-dev` migrated 72→73 with only this file (checksum `109b7f4a…f19a`), **0 configuration rows**, counts and role fingerprints unchanged; real-JWT `MCR-01…10` 10/10 with stored-state proof of denied writes; 0 synthetic leftovers; Vitest 3078 passed, build/lint/typecheck green. One test-harness defect found and fixed (teardown could not remove a location archived through the append-only audit RPC). **Release gates carried forward:** V2-004.004 must not be activated before every ACTIVE location has owner-approved explicit rows (no guessed defaults); account recovery must stay reachable when Team is disabled. Does not resolve any V2-003 residual; Production release stays blocked on V2-005, V2-008, V2-009. See [STATUS](features/004-location-module-configuration/001-module-configuration-contract/STATUS.md) · [EVIDENCE](features/004-location-module-configuration/001-module-configuration-contract/EVIDENCE.md).

## V2-003.005 (COMPLETE — PR #296 merged, `development` `de8c6732`)

Issue #295 / PR #296 (source head `870c5517`, merge `de8c67326ea7badc98a9e817178a527f9af0592a`); no migration. A protected Tasks action now carries the workspace the UI was built for (`profileId`, `organizationId`, `locationId`) as an **untrusted** assertion; the server compares it with the identity and operational location it verified itself (`getPrimaryLocation`: persisted cookie or sole eligible location, canonical resolver) and refuses before the RPC, with or without a `Referer`. This closes the V2-003.004 residual: reproduced on untouched `development` (stale tab, stripped `Referer` → 0 rows at the shown location, 1 at the persisted one), now 0/0. On top: an id-free BroadcastChannel notification, focus / visibility / bfcache / history reconciliation, a stale-workspace panel with verified recovery, a "confirm instead of persist" rule for reload / back-forward to an old `?location=`, and a sign-in that no longer inherits the previous employee's address-bar location.

Validation: unit 3020; hosted DEV real-JWT 17/17 (+ persistence 7/7) with exact row counts at both locations; real Chromium 20/20 and WebKit iPad 20/20; HTTPS Preview 7/7; exact-head CI (application, browser-smoke, Vercel) PASS; DEV table counts back to the pre-run baseline. **Not protected (V2-005, Production blockers):** every other module's actions (a stale tab with a stripped `Referer` still writes at the persisted location), a different employee acting through a stale tab for those modules, and direct-PostgREST cross-location RLS. V2-003 parent #251 stays **open** pending owner review. Evidence: [EVIDENCE.md](features/003-active-context/005-multi-tab-stale-context/EVIDENCE.md).

## V2-003.004 (COMPLETE — PR #291 merged, `development` `a649e82c`)

Issue #290 / PR #291; no migration. The active context is persisted in the existing `lineup_active_context` cookie (v1 format), now `HttpOnly; SameSite=Lax; Path=/; 7 days; Secure` in production, written only by `setActiveContextAction` after the canonical resolver authorizes the pair; cleared by `clearActiveContextAction`, sign-out and sign-in. `getPrimaryLocation` resolves from the persisted context (stale/invalid/cross-organization → fail closed); the `Referer` is only a reject-on-mismatch consistency signal. An explicit `?location=` that differs from the cookie is reconciled by a client gate that verifies and persists it before the workspace opens. Open dependencies: V2-003.005 (multi-tab), V2-005 (direct-PostgREST cross-location RLS and server-authoritative `locationId` binding — Production release blockers, **not fixed here**), V2-008 (backfill). See [004-secure-context-persistence/EVIDENCE.md](features/003-active-context/004-secure-context-persistence/EVIDENCE.md).

Local validation (2026-11-04): hosted DEV real-JWT 46/46, real Chromium 25/25 and WebKit iPad 25/25 (real passcode sign-in, cookie storage, browser restart, no-Referer writes, deep-link gate, cross-organization switch, sign-out, races, history), one narrow hardening (the `Secure` loopback exemption no longer trusts a spoofed `X-Forwarded-Host`). Accepted residuals owned by V2-003.005/V2-005: a stale tab with a stripped `Referer` writes to the persisted location, and the stale-tab refusal copy is misleading. Production and `main` untouched. Evidence: [EVIDENCE.md](features/003-active-context/004-secure-context-persistence/EVIDENCE.md).

## V2-003.001 (COMPLETE — PR #284 merged, `development` 5333a526)

Branch `feature/v2.0-003.001-context-resolution` from `development` `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`; no migration. Implements the server-authoritative active context (resolved / selection_required / unauthenticated / no_access / invalid_context / error), read-only cookie preference, route-over-cookie precedence, and verified-location initial loaders. Deferred: .002 switcher, .003 auto-selection workflow, .004 cookie persistence, .005 cross-tab safety, V2-005 module scoping. V2-003 is not complete. See [001-context-resolution/STATUS.md](features/003-active-context/001-context-resolution/STATUS.md).

## V2-003.002 (COMPLETE — PR #286 merged, development 3c83535)

Branch `feature/v2.0-003.002-org-location-switcher` from `development` `5333a5267d06e438877ed222e30b9910d90399ad`; no migration. Adds the header organization/location switcher, the server-verified temporary `?location=<uuid>` selection (no cookie writes), a reusable `listCurrentEligibleContexts()` candidate loader, interactive selection-required/invalid-context recovery, and a client-state boundary keyed by verified profile + organization + location. Open dependencies: V2-005 location-scoped RLS (some operational tables are organization-scoped), V2-008 assignment backfill, client-supplied `locationId` binding and the no-Referer fallback until V2-003.004. Follow-up reads/actions now follow the verified selected location (fixed in PR #286); hosted DEV 16/16, browser 10/10 (see its STATUS.md). See [002-org-location-switcher/STATUS.md](features/003-active-context/002-org-location-switcher/STATUS.md).

## V2-003.003 (COMPLETE — PR #289 merged into development)

No migration. `/` now redirects a signed-in user with no access to the default tenant but exactly one verified eligible context to `/r/<verified-slug>?location=<verified-id>` (built from verified data, never input; ambiguous/invalid/stale/errored cases keep the existing presentation; `/r/*` never redirects). `getPrimaryLocation()` no longer falls back to the oldest location: verified `Referer` selection, else the caller's single eligible location in the organization, else `null`. Hosted DEV real-JWT 22/22 (incl. real Server Action no-`Referer` write-outcome checks), real browser Chromium + WebKit iPad 8/8. Open dependencies: V2-003.004 (replace the temporary `Referer` mechanism), V2-005 (location-scoped RLS and server-authoritative `locationId` binding — release blockers), V2-008 (backfill). See [003-single-context-auto-resolution/EVIDENCE.md](features/003-active-context/003-single-context-auto-resolution/EVIDENCE.md).

## V2-004.002 - complete

PR #301 is merged: source head `2a8ed9c312bfe73bb80a3c1b0250eee9b9911273`, development merge `6000e6cdffeb24496fce192020d3edce0f669341`. Its accepted schema/reader/writer/editor are the baseline for V2-004.003. No schema or backend enforcement change in .003. Q1-Q4 remain open. See the .003 evidence for current acceptance and delivery status.

## V2-004.003 - acceptance complete (#302; delivery PR #303)

Baseline PR #301 merged at `6000e6c`. Canonical server-verified navigation policy, role intersection, desktop/mobile/URL/context handling and Settings-only recovery implemented. Local application checks and authenticated DEV evidence in [003 evidence](features/004-location-module-configuration/003-navigation-enforcement/EVIDENCE.md); Chromium/WebKit/Pixel 7 HTTPS acceptance passes. Final exact-head CI, full HTTPS repeat and regular merge are mandatory; authoritative delivery record is PR #303. No schema/backend module enforcement/backfill. Q1-Q4 open; V2-004.004 NOT STARTED. Main/Production untouched.

## V2-004.004 - implemented, activation blocked (#304)

Backend module enforcement is implemented and tested but **not active in any hosted environment**. A database switch (`public.module_enforcement_settings`) defaults to `staged`; the database itself refuses to activate it while any active location lacks an explicit row for every module. Hosted DEV (fresh read-only check): 44 active locations, 0 configured - NOT READY; no owner-approved backfill exists; DEV was not migrated by this work. 98 Server Actions classified (78 guarded, 20 exempt system actions), 9 routes exempt, 80 SQL functions and 36 restrictive policies classified; organization-level data without `location_id` (payroll, recipes, team, attendance links) is Server-Action-guarded only and recorded as a V2-005 gap. Evidence: `features/004-location-module-configuration/004-backend-enforcement/`. Main and Production untouched.
