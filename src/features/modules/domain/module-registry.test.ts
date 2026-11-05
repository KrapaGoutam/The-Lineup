import { describe, expect, it } from "vitest";

import type { AppTab } from "@/lib/app-tab";
import { Constants } from "@/types/database.generated";

import {
  CONFIGURABLE_MODULES,
  CONFIGURABLE_MODULE_KEYS,
  MODULES,
  MODULE_KEYS,
  MODULE_REGISTRY,
  getModuleDefinition,
  isConfigurableModuleKey,
  isModuleKey,
  moduleForAppTab,
  type ModuleKey,
} from "./module-registry";

// The intended identity of every module. This table IS the contract: a change
// to a key, tab, requirement or scope must be a deliberate edit here too.
const EXPECTED: ReadonlyArray<
  readonly [ModuleKey, string, AppTab, "optional" | "system_required", string]
> = [
  [
    "table_allocation",
    "Table Allocation",
    "allocation",
    "optional",
    "location",
  ],
  ["tasks", "Tasks", "tasks", "optional", "location"],
  ["schedule", "Schedule", "schedule", "optional", "location"],
  ["tips", "Tip Split", "tips", "optional", "location"],
  ["team", "Team", "team", "optional", "hybrid"],
  ["attendance", "Attendance", "attendance", "optional", "hybrid"],
  ["payroll", "Payroll", "payroll", "optional", "hybrid"],
  ["bar_inventory", "Bar Inventory", "barInventory", "optional", "hybrid"],
  ["recipes", "Recipes", "recipes", "optional", "organization"],
  ["settings", "Settings", "settings", "system_required", "hybrid"],
];

describe("module registry (V2-004.001)", () => {
  it("MC-015: every canonical key maps to its intended module identity", () => {
    expect(
      MODULES.map((m) => [m.key, m.label, m.appTab, m.requirement, m.scope]),
    ).toEqual(EXPECTED.map((row) => [...row]));
  });

  it("MC-015: keys are readable snake_case, never UI camelCase ids", () => {
    for (const key of MODULE_KEYS) {
      expect(key).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
    // The UI id and the durable key are deliberately different values.
    expect(getModuleDefinition("bar_inventory").appTab).toBe("barInventory");
    expect(isModuleKey("barInventory")).toBe(false);
  });

  it("MC-016: no duplicate keys, labels, tabs or sort orders", () => {
    const columns: ReadonlyArray<ReadonlyArray<string | number>> = [
      MODULES.map((m) => m.key),
      MODULES.map((m) => m.label),
      MODULES.map((m) => m.appTab),
      MODULES.map((m) => m.sortOrder),
    ];
    for (const values of columns) {
      expect(new Set(values).size).toBe(values.length);
    }
    // The registry record key always equals the definition's own key.
    for (const [recordKey, definition] of Object.entries(MODULE_REGISTRY)) {
      expect(definition.key).toBe(recordKey);
    }
  });

  it("registry configurable keys equal the database enum, in the same order", () => {
    expect([...CONFIGURABLE_MODULE_KEYS]).toEqual([
      ...Constants.public.Enums.location_module_key,
    ]);
  });

  it("Settings is system-required, never configurable and never storable", () => {
    const settings = getModuleDefinition("settings");
    expect(settings.requirement).toBe("system_required");
    expect(settings.locationConfigurable).toBe(false);
    expect(isConfigurableModuleKey("settings")).toBe(false);
    expect(isModuleKey("settings")).toBe(true);
    expect(CONFIGURABLE_MODULES.map((m) => m.key)).not.toContain("settings");
    expect(
      MODULES.filter((m) => m.requirement === "system_required").map(
        (m) => m.key,
      ),
    ).toEqual(["settings"]);
  });

  it("only configurable modules are eligible for location configuration", () => {
    expect(CONFIGURABLE_MODULES).toHaveLength(9);
    for (const definition of CONFIGURABLE_MODULES) {
      expect(definition.requirement).toBe("optional");
      expect(definition.locationConfigurable).toBe(true);
    }
  });

  it("records organization-level dependencies and the recovery host", () => {
    expect(getModuleDefinition("recipes").scope).toBe("organization");
    expect(getModuleDefinition("recipes").organizationDependencies).toEqual([
      "recipe_book",
    ]);
    expect(
      getModuleDefinition("bar_inventory").organizationDependencies,
    ).toEqual(["inventory_catalog"]);
    expect(getModuleDefinition("payroll").organizationDependencies).toEqual([
      "payroll_settings",
    ]);
    // Team hosts passcode reset: V2-004.003/.004 must keep recovery reachable.
    expect(
      MODULES.filter((m) => m.hostsAccountRecovery).map((m) => m.key),
    ).toEqual(["team"]);
  });

  it("moduleForAppTab is total and round-trips every registered tab", () => {
    for (const definition of MODULES) {
      expect(moduleForAppTab(definition.appTab).key).toBe(definition.key);
    }
    expect(() => moduleForAppTab("nope" as AppTab)).toThrow(/No module/);
  });

  it("isModuleKey / isConfigurableModuleKey reject anything unknown", () => {
    for (const bad of [
      undefined,
      null,
      1,
      {},
      "",
      "Tasks",
      "TASKS",
      "tasks ",
    ]) {
      expect(isModuleKey(bad)).toBe(false);
      expect(isConfigurableModuleKey(bad)).toBe(false);
    }
    expect(isConfigurableModuleKey("tasks")).toBe(true);
  });

  it("MC-019: ordering and labels are deterministic and immutable", () => {
    const first = MODULES.map((m) => `${m.sortOrder}:${m.key}:${m.label}`);
    const second = MODULES.map((m) => `${m.sortOrder}:${m.key}:${m.label}`);
    expect(first).toEqual(second);
    expect(first).toEqual(
      [...first].sort((a, b) => Number.parseInt(a) - Number.parseInt(b)),
    );
    expect(Object.isFrozen(MODULES)).toBe(true);
    expect(Object.isFrozen(CONFIGURABLE_MODULES)).toBe(true);
    expect(Object.isFrozen(MODULE_KEYS)).toBe(true);
    expect(Object.isFrozen(CONFIGURABLE_MODULE_KEYS)).toBe(true);
    expect(MODULE_KEYS[0]).toBe("table_allocation");
    expect(MODULE_KEYS.at(-1)).toBe("settings");
  });
});
