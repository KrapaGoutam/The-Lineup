# V2-003.002 — Status

Status: **IMPLEMENTED — PR open into `development`; `READY_FOR_CLAUDE_LOCAL_VALIDATION`**

- Branch: `feature/v2.0-003.002-org-location-switcher` from `development` `5333a5267d06e438877ed222e30b9910d90399ad` (main `5e5b7747…` untouched; Production never contacted).
- Migration: none.
- Done: resolver explicit-selection input + precedence; `listCurrentEligibleContexts()`; page-data wiring (`availableContexts`, `availableContextsFailed`); header switcher; interactive recovery screen; `ContextScopeBoundary`; tests; docs.
- Pending (blocks merge): hosted DEV real-JWT verification of `?location=` (Cloud cannot perform it) and a real-browser visual/touch pass of the switcher.
- Open dependencies: **V2-005** location-scoped RLS (release dependency), **V2-008** assignment backfill, write-path location scoping (see PLAN.md).
- Next (not started): V2-003.003 Single-Context Auto Resolution.
