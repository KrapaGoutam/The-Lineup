# Feature V2-005: Existing Module Location Scoping

GitHub Issue: [#253](https://github.com/KrapaGoutam/The-Lineup/issues/253)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `IN PROGRESS` — Allocation merged; Tasks implementation/verification in progress.

---

## 1. Overview and Mission

Feature V2-005 updates all existing functional modules across the codebase to operate strictly within the resolved active location context. It retires the legacy `getPrimaryLocation` loader and updates module data loaders and Server Actions to enforce branch boundaries.

---

## 2. Planned Subfeatures

| Subfeature            | Current state                                                 |
| --------------------- | ------------------------------------------------------------- |
| V2-005.001 Allocation | MERGED / IMPLEMENTED (PR #306, development `3fa0bf72`)        |
| V2-005.002 Tasks      | MERGED / IMPLEMENTED (PR #311, development `d7268978`)        |
| V2-005.003 Tips       | MERGED / IMPLEMENTED (PR #312); [Tips plan](003-tips/PLAN.md) |
| V2-005.004 Schedule   | MERGED / IMPLEMENTED (PR #313); DEV migrated 78 -> 79         |
| V2-005.008 Team       | MERGED / IMPLEMENTED (PR #313)                                |
| V2-005.005 Payroll    | MERGED / IMPLEMENTED (PR #314); DEV migrated 79 -> 80         |
| V2-005.006–007        | NOT STARTED (Bar Inventory, Recipes)                          |

- **V2-005.001**: Table Allocation / Rotation (Bind boards, rounds, and physical tables to active location).
- **V2-005.002**: Tasks (Enforce location scoping in `private.tasks_can_access_location`).
- **V2-005.003**: Tips (Scope tip pools, intervals, and splits to active location).
- **V2-005.004**: Schedule / Roster (Scope schedule periods, shifts, and templates to active location).
- **V2-005.005**: Payroll (Retain org-level settings with location-filtered reporting and snapshots).
- **V2-005.006**: Bar Inventory (Retain org catalog with location-scoped stock ledger, counts, and orders).
- **V2-005.007**: Recipes (Retain org-wide recipe book by default).
- **V2-005.008**: Team / Settings (Hybrid scoping: org memberships vs location rosters and branch settings).
