# Feature V2-004: Per-Location Module Configuration

GitHub Issue: [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `IN PROGRESS` (V2-004.001 complete; V2-004.002–.004 not started)

---

## 1. Overview and Mission

Feature V2-004 establishes per-location module configuration. It allows restaurant operators to enable, disable, and configure specific functional modules (e.g., Table Allocation, Tasks, Tips, Schedule, Bar Inventory) independently for each physical branch.

---

## 2. Planned Subfeatures

- **V2-004.001**: Module Configuration Contract (Relational schema `location_module_configs` and types) — Issue [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298); **complete** (validated on the official local stack and hosted DEV, merged via PR #299). See [001-module-configuration-contract/](001-module-configuration-contract/STATUS.md).
- **V2-004.002**: Location Module Settings (Management UI for toggling modules by branch).
- **V2-004.003**: Navigation Enforcement (Dynamic hiding of disabled module navigation items).
- **V2-004.004**: Backend Enforcement (Server Actions and RPCs fail-closed if module is disabled).
