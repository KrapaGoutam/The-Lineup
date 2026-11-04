# V2-003.002 — Status

Status: **VERIFIED LOCALLY — wrong-location follow-up defect fixed on this PR; merge after exact-head CI**

- Branch: `feature/v2.0-003.002-org-location-switcher` from `development` `5333a5267d06e438877ed222e30b9910d90399ad` (main `5e5b7747…` untouched; Production never contacted).
- Migration: none.
- Done: resolver explicit-selection input + precedence; `listCurrentEligibleContexts()`; page-data wiring (`availableContexts`, `availableContextsFailed`); header switcher; interactive recovery screen; `ContextScopeBoundary`; tests; docs.
- Verified (2026-11-04): hosted DEV real-JWT 16/16; real-browser 390/768/1366 on Chromium + WebKit iPad 10/10; follow-up reads/writes now follow the verified selection (see EVIDENCE.md).
- Open dependencies: **V2-005** location-scoped RLS (release dependency), **V2-008** assignment backfill, client-supplied `locationId` binding and no-Referer fallback (see PLAN.md / EVIDENCE.md).
- Next (not started): V2-003.003 Single-Context Auto Resolution.
