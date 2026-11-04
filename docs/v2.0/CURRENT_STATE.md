# The Lineup V2.0 — Current Operational State

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
DEV Migration Status:     SYNCHRONIZED 72/72
Latest Migration:         20261104164217_location_schedule_publication_guard
Hosted pgTAP:             362 assertions passed (0050–0061)
Actual JWT Authorization: PASS (eight synthetic identities + anonymous)
Concurrency:              PASS (A–D; both publication orderings)
WebKit host-tablet:       PASS 16/16
Canonical Types:          MATCH
Exact-head CI:            application/browser-smoke/database/Vercel PASS
Blockers:                 NONE
Active Subfeature:        V2-003.003 Single-Context Auto Resolution — COMPLETE (PR #289)
Active Subfeature Status: COMPLETE — hosted DEV real-JWT 22/22, Chromium + WebKit iPad 8/8, exact-head CI green; synthetic fixtures cleaned
Previous Subfeature:      V2-003.002 Organization / Location Switcher — COMPLETE (PR #286, development 3c83535)
Next Subfeature:          V2-003.004 Secure Context Persistence (NOT STARTED)
Production Changes:       NONE; Production not contacted
Main Branch Merge:        NONE
```

V2-001 and V2-002 are complete. V2-002.005 reused the Cloud implementation, added the narrow database-authoritative schedule-publication guard, verified hosted DEV with synthetic fixtures and true independent sessions, reconciled canonical types, and passed the real iPad/WebKit gate before merging the same PR.

Evidence: [Location Lifecycle Integrity](features/002-organizations-locations/005-location-lifecycle-integrity/EVIDENCE.md). The resulting docs-only development integration SHA is recorded in GitHub tracking and the final report. Main and Production remain untouched.

Next recommended environment: Claude Code Cloud for the bounded V2-003.001 feature, with Codex Local for hosted DEV/WebKit validation if required. Do not infer approval for Production or main promotion. V2-003 was not started in this closeout.

## V2-003.001 (COMPLETE — PR #284 merged, `development` 5333a526)

Branch `feature/v2.0-003.001-context-resolution` from `development` `cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e`; no migration. Implements the server-authoritative active context (resolved / selection_required / unauthenticated / no_access / invalid_context / error), read-only cookie preference, route-over-cookie precedence, and verified-location initial loaders. Deferred: .002 switcher, .003 auto-selection workflow, .004 cookie persistence, .005 cross-tab safety, V2-005 module scoping. V2-003 is not complete. See [001-context-resolution/STATUS.md](features/003-active-context/001-context-resolution/STATUS.md).

## V2-003.002 (COMPLETE — PR #286 merged, development 3c83535)

Branch `feature/v2.0-003.002-org-location-switcher` from `development` `5333a5267d06e438877ed222e30b9910d90399ad`; no migration. Adds the header organization/location switcher, the server-verified temporary `?location=<uuid>` selection (no cookie writes), a reusable `listCurrentEligibleContexts()` candidate loader, interactive selection-required/invalid-context recovery, and a client-state boundary keyed by verified profile + organization + location. Open dependencies: V2-005 location-scoped RLS (some operational tables are organization-scoped), V2-008 assignment backfill, client-supplied `locationId` binding and the no-Referer fallback until V2-003.004. Follow-up reads/actions now follow the verified selected location (fixed in PR #286); hosted DEV 16/16, browser 10/10 (see its STATUS.md). See [002-org-location-switcher/STATUS.md](features/003-active-context/002-org-location-switcher/STATUS.md).

## V2-003.003 (COMPLETE — PR #289 merged into development)

No migration. `/` now redirects a signed-in user with no access to the default tenant but exactly one verified eligible context to `/r/<verified-slug>?location=<verified-id>` (built from verified data, never input; ambiguous/invalid/stale/errored cases keep the existing presentation; `/r/*` never redirects). `getPrimaryLocation()` no longer falls back to the oldest location: verified `Referer` selection, else the caller's single eligible location in the organization, else `null`. Hosted DEV real-JWT 22/22 (incl. real Server Action no-`Referer` write-outcome checks), real browser Chromium + WebKit iPad 8/8. Open dependencies: V2-003.004 (replace the temporary `Referer` mechanism), V2-005 (location-scoped RLS and server-authoritative `locationId` binding — release blockers), V2-008 (backfill). See [003-single-context-auto-resolution/EVIDENCE.md](features/003-active-context/003-single-context-auto-resolution/EVIDENCE.md).
