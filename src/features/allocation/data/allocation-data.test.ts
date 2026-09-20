import { describe, expect, it } from "vitest";

import { DINING_TABLES_SELECT } from "./allocation-data";

// Production hotfix (PGRST201): dining_tables has two foreign keys to
// dining_areas (dining_tables_dining_area_id_fkey, a plain FK, and
// dining_tables_area_tenant_fk, a composite tenant-isolation FK) --
// embedding `dining_areas(name)` unqualified is ambiguous and PostgREST
// rejects it with PGRST201 ("more than one relationship was found"),
// which went undetected locally/in CI because dining_tables was always
// empty before the floor-layout backfill. This guards against silently
// reverting to the unqualified form, which would reintroduce the same
// production failure the moment real rows exist.
describe("DINING_TABLES_SELECT (PGRST201 regression guard)", () => {
  it("explicitly qualifies which dining_tables -> dining_areas relationship to embed", () => {
    expect(DINING_TABLES_SELECT).toContain(
      "dining_areas!dining_tables_dining_area_id_fkey(name)",
    );
  });

  it("never reverts to the ambiguous, unqualified embed", () => {
    expect(DINING_TABLES_SELECT).not.toMatch(/[^!]dining_areas\(name\)/);
  });

  it("still selects every column the frontend maps into FloorLayoutEntry", () => {
    for (const column of ["label", "position_x", "position_y", "active"]) {
      expect(DINING_TABLES_SELECT).toContain(column);
    }
  });
});
