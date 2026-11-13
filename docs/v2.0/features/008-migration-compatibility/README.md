# Feature V2-008: Migration & Compatibility

GitHub Issue: [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `IN PROGRESS` — Batch A (read-only discovery/planning) complete; see [STATUS.md](STATUS.md) and [HANDOFF.md](HANDOFF.md). Note: the sub-feature descriptions below are the original plan; where they conflict with the Batch A plans (e.g. "default `EXTERNAL`", "seed default module enablement"), the Batch A plans and owner decisions prevail.

---

## 1. Overview and Mission

Feature V2-008 delivers the forward-only database migration and data backfill scripts required to upgrade the existing single-restaurant Monks pilot to The Lineup V2.0 without operational downtime or data loss.

---

## 2. Planned Subfeatures

- **V2-008.001**: Existing Data Inventory (Audit existing organizations, profiles, locations, and operational rows).
- **V2-008.002**: Organization / Location Backfill (Map Monks pilot to Webster location; backfill missing location bindings).
- **V2-008.003**: Existing Role Migration (Translate legacy `memberships.roles` into new baseline and location assignments).
- **V2-008.004**: Module Configuration Backfill (Seed default module enablement for all existing locations).
- **V2-008.005**: Attendance Compatibility (Backfill default `EXTERNAL` mode for Monks to preserve Neon workflow).
- **V2-008.006**: Hosted DEV Migration Validation (Execute forward migration rehearsals on hosted DEV database).
- **V2-008.007**: Recovery / Forward-Fix Strategy (Deterministic rollback and forward-fix runbooks for migration safety).
