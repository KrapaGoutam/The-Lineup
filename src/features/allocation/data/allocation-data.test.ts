import { describe, expect, it } from "vitest";

import { DINING_TABLES_SELECT, diningAreaName } from "./allocation-data";

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

// Production stability hotfix (bar-seat visual bug): PostgREST embeds a
// many-to-one relationship (many dining_tables -> one dining_areas) as a
// single object, never an array -- `row.dining_areas?.[0]?.name` always
// missed, so bar seats (B1-B8) always fell back to the square "table"
// shape instead of the round "bar_seat" one. diningAreaName must read
// the real (object) shape correctly, while still tolerating an array
// shape defensively (in case generated types or a future PostgREST
// version ever describe it that way).
describe("diningAreaName (bar-seat resourceType regression guard)", () => {
  it("reads the name from the real PostgREST shape: a single object", () => {
    expect(diningAreaName({ name: "Bar" })).toBe("Bar");
  });

  it("still reads the name if given an array shape (defensive, not the real shape)", () => {
    expect(diningAreaName([{ name: "Bar" }])).toBe("Bar");
  });

  it("returns null for a table with no dining area linked", () => {
    expect(diningAreaName(null)).toBeNull();
  });

  it("returns null for an empty array shape", () => {
    expect(diningAreaName([])).toBeNull();
  });
});
