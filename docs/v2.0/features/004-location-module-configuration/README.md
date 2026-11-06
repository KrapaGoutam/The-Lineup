# Feature V2-004: Per-Location Module Configuration

GitHub Issue: [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `IN PROGRESS` (V2-004.001/.002 complete; V2-004.003 acceptance complete (#302; delivery PR #303); V2-004.004 IMPLEMENTED — ACTIVATION BLOCKED (#304))

---

## 1. Overview and Mission

Feature V2-004 establishes per-location module configuration. It allows restaurant operators to enable, disable, and configure specific functional modules (e.g., Table Allocation, Tasks, Tips, Schedule, Bar Inventory) independently for each physical branch.

---

## 2. Planned Subfeatures

- **V2-004.001**: Module Configuration Contract (Relational schema `location_module_configs` and types) — Issue [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298); **complete** (validated on the official local stack and hosted DEV, merged via PR #299). See [001-module-configuration-contract/](001-module-configuration-contract/STATUS.md).
- **V2-004.002**: Location Module Settings (Management UI for toggling modules by branch).
- **V2-004.003**: Navigation Enforcement — issue #302, [status and delivery gates](003-navigation-enforcement/STATUS.md).
- **V2-004.004**: Backend Enforcement (Server Actions and RPCs fail-closed if module is disabled) — issue #304; **implemented, activation blocked** (hosted DEV has 44 unconfigured active locations); [status](004-backend-enforcement/STATUS.md).

## V2-004.002 - complete

PR #301 is merged: source head `2a8ed9c312bfe73bb80a3c1b0250eee9b9911273`, development merge `6000e6cdffeb24496fce192020d3edce0f669341`. Its accepted schema/reader/writer/editor are the baseline for V2-004.003. No schema or backend enforcement change in .003. Q1-Q4 remain open. See the .003 evidence for current acceptance and delivery status.
