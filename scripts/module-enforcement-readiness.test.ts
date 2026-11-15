import { describe, expect, it } from "vitest";

import { evaluateModuleReadiness } from "../src/features/modules/domain/module-readiness";
import { CONFIGURABLE_MODULE_KEYS } from "../src/features/modules/domain/module-registry";
import {
  assertAllowedTarget,
  evaluateReadiness,
  EXPECTED_MODULE_KEYS,
  PROD_REF,
} from "./module-enforcement-readiness.mjs";

describe("module-enforcement-readiness script", () => {
  it("expects exactly the registry's configurable modules (no drift)", () => {
    expect([...EXPECTED_MODULE_KEYS].sort()).toEqual(
      [...CONFIGURABLE_MODULE_KEYS].sort(),
    );
  });

  it("BE-43/44: applies the same rule as the typed evaluator", () => {
    const locations = [
      {
        id: "l1",
        organization_id: "o",
        name: "One",
        active: true,
        archived_at: null,
      },
      {
        id: "l2",
        organization_id: "o",
        name: "Two",
        active: true,
        archived_at: null,
      },
      {
        id: "l3",
        organization_id: "o",
        name: "Gone",
        active: false,
        archived_at: null,
      },
      {
        id: "l4",
        organization_id: "o",
        name: "Old",
        active: true,
        archived_at: "2026-01-01",
      },
    ];
    const configs = [
      ...EXPECTED_MODULE_KEYS.map((module_key) => ({
        location_id: "l1",
        module_key,
      })),
      { location_id: "l2", module_key: "tasks" },
      { location_id: "l2", module_key: "unknown_future_module" },
    ];
    const script = evaluateReadiness(locations, configs);
    const typed = evaluateModuleReadiness(
      locations.map((l) => ({
        organizationId: l.organization_id,
        locationId: l.id,
        active: l.active,
        archivedAt: l.archived_at,
      })),
      configs.map((c) => ({
        locationId: c.location_id,
        moduleKey: c.module_key,
      })),
    );
    expect(script.activeLocations).toBe(typed.activeLocations);
    expect(script.readyLocations).toBe(typed.readyLocations);
    expect(script.ready).toBe(false);
    expect(
      script.rows.find((r: { locationId: string }) => r.locationId === "l2")
        ?.missing,
    ).toHaveLength(8);
    expect(script.rows.map((r: { ready: boolean }) => r.ready)).toEqual(
      typed.locations.map((r) => r.ready),
    );
  });

  it("an estate with no active locations is vacuously ready", () => {
    expect(evaluateReadiness([], []).ready).toBe(true);
  });

  it("refuses Production and any hosted project other than DEV", () => {
    expect(() =>
      assertAllowedTarget(`https://${PROD_REF}.supabase.co`),
    ).toThrow(/PRODUCTION/);
    expect(() => assertAllowedTarget("https://example.supabase.co")).toThrow();
    expect(() => assertAllowedTarget("")).toThrow();
    expect(() => assertAllowedTarget("not a url")).toThrow();
    expect(() => assertAllowedTarget("http://127.0.0.1:54321")).not.toThrow();
    expect(() =>
      assertAllowedTarget("https://opmujepkemwcdxxorhfd.supabase.co"),
    ).not.toThrow();
  });
});
