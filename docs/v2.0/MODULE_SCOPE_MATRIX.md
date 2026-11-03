# The Lineup V2.0 — Module Scope Matrix

This matrix formalizes the scope classifications, data relationships, and migration impact for all major functional modules in The Lineup V2.0 based on the repository architecture audit.

---

## 1. Classification Definitions

- **`ORGANIZATION`**: State, catalog, or configuration applies globally across all locations of that tenant (e.g., Recipe Book).
- **`LOCATION`**: State, operational records, and transactions are strictly bound to a single physical restaurant location (e.g., Table Rotation).
- **`HYBRID`**: The module contains both organization-level reference data (e.g., catalog, base settings) and location-level operational state (e.g., stock ledger, timesheets).

---

## 2. Canonical Module Scope Matrix

| Module                          | Current Scope                   | V2 Target Scope                 | Org Context Req? | Loc Context Req? | DB Change? | RLS Change? | UI Context Change? | Migration Needed? | Dependencies           | Architecture Notes                                                                                                                                                              |
| ------------------------------- | ------------------------------- | ------------------------------- | :--------------: | :--------------: | :--------: | :---------: | :----------------: | :---------------: | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table Allocation / Rotation** | `LOCATION`                      | `LOCATION`                      |       Yes        |       Yes        |     No     |     Yes     |        Yes         |        Yes        | V2-001, V2-003         | Sessions & dining tables are already location-keyed. Update `private.can_operate_board` to enforce location assignments instead of org-wide floor access.                       |
| **Tasks**                       | `LOCATION`                      | `LOCATION`                      |       Yes        |       Yes        |     No     |     Yes     |        Yes         |        No         | V2-001, V2-003         | Tables already carry `location_id` and composite tenant FKs. Update single seam `private.tasks_can_access_location` to check user location assignment.                          |
| **Tips**                        | `LOCATION`                      | `LOCATION`                      |       Yes        |       Yes        |     No     |     Yes     |        Yes         |        Yes        | V2-001, V2-003         | `tip_pools` already carries `location_id`. Recalculation RPCs and estimate policies must verify caller assignment at that location.                                             |
| **Schedule / Roster**           | `LOCATION`                      | `LOCATION`                      |       Yes        |       Yes        |     No     |     Yes     |        Yes         |        No         | V2-001, V2-003         | `schedule_periods`, `shifts`, and `shift_templates` are location-keyed. Update manager management policies to respect branch manager scope.                                     |
| **Payroll**                     | `HYBRID`                        | `HYBRID`                        |       Yes        |       Yes        |  Optional  |     Yes     |        Yes         |        Yes        | V2-001, V2-006         | Settings (rates) are Org-level; timesheet snapshots can be filtered by Location. Add optional `location_id` on snapshot periods for branch payroll segregation.                 |
| **Attendance**                  | `LOCATION` / `HYBRID` reporting | `LOCATION` / `HYBRID` reporting |       Yes        |       Yes        |    Yes     |     Yes     |        Yes         |        Yes        | V2-001, V2-006, V2-007 | Add `attendance_mode` (`external`, `internal_the_lineup`, `disabled`) to `locations`. Add native `attendance_events` schema for internal mode. Preserve Neon for external mode. |
| **Bar Inventory**               | `HYBRID`                        | `HYBRID`                        |       Yes        |       Yes        |     No     |     Yes     |        Yes         |        No         | V2-001, V2-003         | Catalog (vendors, products) is Organization-level. Stock ledger, bulk counts, and order drafts are Location-level. Update `private.inventory_can_access_location`.              |
| **Recipes**                     | `ORGANIZATION`                  | `ORGANIZATION`                  |       Yes        |        No        |     No     |     No      |         No         |        No         | V2-001                 | Recipes and categories are shared across the organization by design. No `location_id` column. Remains purely organization-scoped in V2.0.                                       |
| **Team**                        | `HYBRID`                        | `HYBRID`                        |       Yes        |       Yes        |    Yes     |     Yes     |        Yes         |        Yes        | V2-001, V2-002         | `memberships` represents org affiliation. Introduce `location_assignments` to track which branches an employee works at and their scoped role per location.                     |
| **Settings**                    | `HYBRID`                        | `HYBRID`                        |       Yes        |       Yes        |    Yes     |     Yes     |        Yes         |        Yes        | V2-001, V2-004         | Split into Organization Settings (branding, slug, overall staff) and Branch Settings (operating hours, shift defaults, module enablement configs).                              |

---

## 3. Implementation Verification Checklist

- [ ] All location-scoped tables enforce composite foreign keys: `(location_id, organization_id) references locations(id, organization_id)`.
- [ ] No location-scoped mutation relies on `primary-location.ts` (the hardcoded single-location loader is decommissioned in V2-003).
- [ ] Recipes remain organization-wide without accidental location columns.
- [ ] Modules verify both active role tier and `location_module_configs.is_enabled` before rendering or permitting writes.
