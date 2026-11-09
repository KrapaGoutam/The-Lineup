# Feature V2-005.006-E: Integration Handoff

## 1. Scope Contract

- Feature: V2-005.006-E — Bar Inventory Usability & Physical Storage Layout.
- Architecture: Option A — Placement Only (physical metadata only, no stock quantities on shelves/coolers, authoritative stock remains location-scoped).
- Target Branch: `development`.
- Target Delivery: Single feature PR from `feature/v2-005-006e-inventory-storage-enhancement`.

## 2. Boundaries & Safety

- **No hosted DEV deployment** in this session.
- **No PR merge** in this session.
- **No force pushes**.
- **No schema modification to previous migrations**.
- Parent issue #253, #248, and milestone #8 remain open.

## 3. Recommended Reviewer & Protocol

- **Next Agent:** Claude Code LOCAL (Sonnet, HIGH effort, NEW session).
- **Mission:** Combined independent review + controlled DEV integration + merge of the single V2-005.006-E PR.
- **Verification Gates:**
  1. Option A placement and stock separation.
  2. Cross-location and cross-organization security.
  3. Fraction precision and parsing.
  4. Selection idempotency.
  5. Import atomicity and Date Group integrity.
  6. Direct item editing.
  7. Migration rehearsal on isolated database.
  8. Exact-head CI pass.
