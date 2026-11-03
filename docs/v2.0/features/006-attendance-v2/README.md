# Feature V2-006: Attendance V2

GitHub Issue: [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `NOT STARTED`

---

## 1. Overview and Mission

Feature V2-006 delivers Attendance V2. It introduces per-location attendance mode configuration (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`), native internal attendance tracking (schema, clock integrity rules, manager adjustments), and unifies reporting and payroll/tips feeds across both modes.

---

## 2. Planned Subfeatures

- **V2-006.001**: Attendance Mode Configuration (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED` per branch).
- **V2-006.002**: Internal Attendance Data Model (Native clock events, breaks, auto-clock-out, audit trail).
- **V2-006.003**: Clock Integrity Rules (Duplicate prevention, minimum clock duration, timestamp validation).
- **V2-006.004**: Manager Corrections (Reason-required timesheet adjustments and audit trail).
- **V2-006.005**: Attendance Reporting (Unified reporting dashboard switching transparently by location mode).
- **V2-006.006**: Payroll / Tips Integration (Feed internal attendance data directly into Tip Split and Payroll snapshots).
- **V2-006.007**: External Attendance Compatibility (Preserve Neon integration for locations configured in `EXTERNAL` mode).
