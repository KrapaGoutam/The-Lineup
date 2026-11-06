import { describe, expect, it } from "vitest";

import { evaluateModuleReadiness } from "./module-readiness";
import { CONFIGURABLE_MODULE_KEYS } from "./module-registry";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const L1 = "00000000-0000-0000-0000-0000000000b1";
const L2 = "00000000-0000-0000-0000-0000000000b2";

const location = (
  locationId: string,
  over: Partial<{ active: boolean; archivedAt: string | null }> = {},
) => ({
  organizationId: ORG,
  locationId,
  active: true,
  archivedAt: null,
  ...over,
});

const allKeys = (locationId: string) =>
  CONFIGURABLE_MODULE_KEYS.map((moduleKey) => ({ locationId, moduleKey }));

describe("evaluateModuleReadiness", () => {
  it("expects exactly the nine configurable modules", () => {
    expect(CONFIGURABLE_MODULE_KEYS).toHaveLength(9);
  });

  it("BE-43 rejects an active location with missing rows and names the gaps", () => {
    const report = evaluateModuleReadiness(
      [location(L1), location(L2)],
      [...allKeys(L1), { locationId: L2, moduleKey: "tasks" }],
    );
    expect(report.ready).toBe(false);
    expect(report.activeLocations).toBe(2);
    expect(report.notReadyLocations).toBe(1);
    const l2 = report.locations.find((l) => l.locationId === L2);
    expect(l2?.ready).toBe(false);
    expect(l2?.configuredKeys).toEqual(["tasks"]);
    expect(l2?.missingKeys).toHaveLength(8);
    expect(l2?.missingKeys).not.toContain("tasks");
  });

  it("BE-44 accepts an explicitly complete estate (enabled and disabled alike count)", () => {
    const report = evaluateModuleReadiness(
      [location(L1), location(L2)],
      [...allKeys(L1), ...allKeys(L2)],
    );
    expect(report).toMatchObject({
      ready: true,
      readyLocations: 2,
      notReadyLocations: 0,
    });
  });

  it("BE-45 is a pure read: inputs are not mutated and nothing is defaulted", () => {
    const locations = [location(L1)];
    const configs: { locationId: string; moduleKey: string }[] = [];
    const before = JSON.stringify({ locations, configs });
    const report = evaluateModuleReadiness(locations, configs);
    expect(JSON.stringify({ locations, configs })).toBe(before);
    expect(configs).toHaveLength(0);
    expect(report.locations[0].missingKeys).toHaveLength(9);
  });

  it("ignores inactive and archived locations", () => {
    const report = evaluateModuleReadiness(
      [
        location(L1, { active: false }),
        location(L2, { archivedAt: "2026-01-01T00:00:00Z" }),
      ],
      [],
    );
    expect(report).toMatchObject({ activeLocations: 0, ready: true });
  });

  it("ignores unknown module keys and other locations' rows", () => {
    const report = evaluateModuleReadiness(
      [location(L1)],
      [
        { locationId: L1, moduleKey: "totally_new_module" },
        ...allKeys(L2), // another location's complete set grants L1 nothing
      ],
    );
    expect(report.ready).toBe(false);
    expect(report.locations[0].missingKeys).toHaveLength(9);
  });

  it("duplicate rows cannot make an incomplete location look complete", () => {
    const report = evaluateModuleReadiness(
      [location(L1)],
      Array.from({ length: 12 }, () => ({
        locationId: L1,
        moduleKey: "tasks",
      })),
    );
    expect(report.ready).toBe(false);
    expect(report.locations[0].configuredKeys).toEqual(["tasks"]);
  });
});
