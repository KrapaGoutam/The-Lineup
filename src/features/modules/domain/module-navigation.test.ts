import { describe, expect, it } from "vitest";
import {
  buildModuleConfigSnapshot,
  type ModuleConfigReadResult,
  type LocationModuleConfig,
} from "./module-config";
import { CONFIGURABLE_MODULE_KEYS } from "./module-registry";
import {
  moduleNavigationPolicy,
  resolveNavigationTab,
  serializeModuleNavigation,
} from "./module-navigation";
import { tabHref } from "@/lib/app-tab";

const identity = {
  profileId: "person",
  organizationId: "org",
  locationId: "location",
};
const access = { isManager: true, demoMode: false };
const configs: LocationModuleConfig[] = CONFIGURABLE_MODULE_KEYS.map(
  (moduleKey) => ({
    moduleKey,
    locationId: identity.locationId,
    isEnabled: true,
    metadata: {},
    createdAt: "",
    updatedAt: "",
    updatedBy: null,
  }),
);
function policy(
  result: ModuleConfigReadResult = buildModuleConfigSnapshot(
    identity.locationId,
    "active",
    configs,
  ),
  overrides = {},
) {
  return moduleNavigationPolicy(
    serializeModuleNavigation(identity, result),
    identity,
    { ...access, ...overrides },
  );
}
describe("location module navigation policy", () => {
  it("enabled rows use registry tab mapping and preserve existing navigation order", () => {
    expect(policy().tabs).toEqual([
      "tasks",
      "allocation",
      "schedule",
      "team",
      "attendance",
      "barInventory",
      "recipes",
      "tips",
      "payroll",
      "settings",
    ]);
    expect(policy().fallback).toBe("tasks");
  });
  it("disabled and missing rows never enable modules; Settings remains available", () => {
    expect(
      policy(
        buildModuleConfigSnapshot(
          identity.locationId,
          "active",
          configs.map((c) => ({ ...c, isEnabled: false })),
        ),
      ).tabs,
    ).toEqual(["settings"]);
    expect(
      policy(buildModuleConfigSnapshot(identity.locationId, "active", [])).tabs,
    ).toEqual(["settings"]);
  });
  it.each<ModuleConfigReadResult>([
    { status: "unauthorized", reason: "unauthenticated" },
    { status: "unauthorized", reason: "permission_denied" },
    { status: "unavailable", reason: "schema_missing" },
    { status: "unavailable", reason: "database_error" },
    { status: "error", code: "invalid_row", message: "invalid" },
    {
      status: "location_unavailable",
      reason: "not_found",
      locationId: identity.locationId,
    },
  ])("preserves failure $status and fails closed", (result) => {
    const resolved = policy(result);
    expect(resolved.tabs).toEqual(["settings"]);
    expect(resolved.configurationStatus).toBe(result.status);
    expect(resolveNavigationTab("recipes", resolved)).toBe("settings");
  });
  it.each(["inactive", "archived"] as const)(
    "hides optional modules for %s locations",
    (lifecycle) => {
      expect(
        policy(
          buildModuleConfigSnapshot(identity.locationId, lifecycle, configs),
        ).tabs,
      ).toEqual(["settings"]);
    },
  );
  it("configuration never grants Team or Inventory management; attendance retains existing access", () => {
    const staff = policy(undefined, { isManager: false });
    expect(staff.tabs).not.toContain("team");
    expect(staff.tabs).not.toContain("barInventory");
    expect(staff.tabs).toContain("attendance");
    // Payroll's existing shell visibility is universal in real mode.
    expect(staff.tabs).toContain("payroll");
  });
  it.each(["profileId", "organizationId", "locationId"] as const)(
    "rejects stale %s",
    (key) => {
      const snapshot = serializeModuleNavigation(
        identity,
        buildModuleConfigSnapshot(identity.locationId, "active", configs),
      );
      expect(
        moduleNavigationPolicy(
          snapshot,
          { ...identity, [key]: "other" },
          access,
        ).tabs,
      ).toEqual(["settings"]);
    },
  );
  it("rejects mismatched result/row locations and absent initial snapshots", () => {
    expect(
      policy(buildModuleConfigSnapshot("other", "active", configs)).tabs,
    ).toEqual(["settings"]);
    expect(
      policy(
        buildModuleConfigSnapshot(
          identity.locationId,
          "active",
          configs.map((c) => ({ ...c, locationId: "other" })),
        ),
      ).tabs,
    ).toEqual(["settings"]);
    expect(moduleNavigationPolicy(null, identity, access).tabs).toEqual([
      "settings",
    ]);
  });
  it("serializes Map to arrays and survives a JSON round trip", () => {
    const snapshot = serializeModuleNavigation(
      identity,
      buildModuleConfigSnapshot(identity.locationId, "active", configs),
    );
    expect(
      snapshot.result.status === "ok" && Array.isArray(snapshot.result.configs),
    ).toBe(true);
    expect(
      moduleNavigationPolicy(
        JSON.parse(JSON.stringify(snapshot)),
        identity,
        access,
      ),
    ).toEqual(policy());
  });
  it("fallback chooses Tasks then Allocation then secondary order then Settings", () => {
    for (const [keys, expected] of [
      [["tasks", "table_allocation"], "tasks"],
      [["table_allocation", "schedule"], "allocation"],
      [["schedule", "recipes"], "schedule"],
      [["tips", "recipes"], "recipes"],
      [[], "settings"],
    ] as const) {
      const nav = policy(
        buildModuleConfigSnapshot(
          identity.locationId,
          "active",
          configs.filter((c) =>
            (keys as readonly string[]).includes(c.moduleKey),
          ),
        ),
      );
      expect(resolveNavigationTab(null, nav)).toBe(expected);
      expect(resolveNavigationTab("team", nav)).toBe(expected);
    }
  });
  it("demo bypasses any hosted snapshot and retains role and Payroll restrictions", () => {
    const demo = moduleNavigationPolicy(null, null, {
      demoMode: true,
      isManager: false,
    });
    expect(demo.configurationStatus).toBe("demo");
    expect(demo.tabs).toContain("tasks");
    expect(demo.tabs).not.toContain("payroll");
    expect(demo.tabs).not.toContain("team");
    expect(demo.tabs).not.toContain("barInventory");
  });
  it("fallback URLs drop recipe details, keep verified context and stabilize", () => {
    const nav = policy(
      buildModuleConfigSnapshot(identity.locationId, "active", []),
    );
    const shown = resolveNavigationTab("recipes", nav);
    const href = tabHref(
      "/r/test",
      "?location=verified&tab=recipes&recipe=old&mode=edit",
      shown,
    );
    expect(href).toBe("/r/test?location=verified&tab=settings");
    expect(tabHref("/r/test", href.split("?")[1], shown)).toBe(href);
  });
});
