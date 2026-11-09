# Next Agent Instructions (For Claude Code Independent Review)

## Context

Antigravity (Gemini 3.8 Flash High) executes internal phases E0 through E5 on branch `feature/v2-005-006e-inventory-storage-enhancement` and publishes a single PR targeting `development`.

## Claude Code Local Role (E6)

1. Perform independent code review of the PR.
2. Verify:
   - Option A Placement Only compliance (no stock quantities on placements, zero stock adjustments when moving or placing products).
   - Cross-location and cross-organization security.
   - Fractional count parser accuracy and error handling.
   - Selection synchronization.
   - Safe Date Groups and Stock imports.
   - Cooler Layout rendering and direct editing.
3. Perform database rehearsal against isolated backup.
4. Verify exact-head CI green on GitHub.
5. Deploy to hosted DEV under controlled conditions and merge into `development`.
