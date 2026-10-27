import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_TAB,
  resolveTab,
  tabFromParam,
  tabHref,
  tabToParam,
  type AppTab,
} from "./app-tab";

const ALL_TABS: AppTab[] = [
  "schedule",
  "allocation",
  "tasks",
  "tips",
  "team",
  "attendance",
  "barInventory",
  "payroll",
  "settings",
];

describe("default landing (TS-001)", () => {
  it("is Tasks", () => {
    expect(DEFAULT_APP_TAB).toBe("tasks");
  });

  it("is what an absent, empty or unknown tab parameter resolves to", () => {
    expect(tabFromParam(null)).toBeNull();
    expect(tabFromParam(undefined)).toBeNull();
    expect(tabFromParam("")).toBeNull();
    expect(tabFromParam("not-a-module")).toBeNull();
    expect(tabFromParam("__proto__")).toBeNull();
  });
});

describe("explicit module parameter (TS-002, TS-003)", () => {
  it("round-trips every module", () => {
    for (const tab of ALL_TABS) {
      expect(tabFromParam(tabToParam(tab))).toBe(tab);
    }
  });

  it("uses the kebab-case name for Bar Inventory", () => {
    expect(tabFromParam("bar-inventory")).toBe("barInventory");
    expect(tabFromParam("barInventory")).toBeNull();
  });
});

describe("tabHref", () => {
  it("keeps the default landing on a clean URL", () => {
    expect(tabHref("/", "?tab=schedule", "tasks")).toBe("/");
  });

  it("sets the module and keeps unrelated parameters", () => {
    expect(tabHref("/", "", "allocation")).toBe("/?tab=allocation");
    expect(tabHref("/r/the-monks", "?x=1", "barInventory")).toBe(
      "/r/the-monks?x=1&tab=bar-inventory",
    );
    expect(tabHref("/", "?tab=team&x=1", "tasks")).toBe("/?x=1");
  });
});

describe("resolveTab fallback (TS-005)", () => {
  it("sends staff away from manager-only modules", () => {
    const staff = { isManager: false, demoMode: false };
    expect(resolveTab("team", staff)).toBe("tasks");
    expect(resolveTab("barInventory", staff)).toBe("tasks");
    expect(resolveTab("schedule", staff)).toBe("schedule");
  });

  it("lets managers open them", () => {
    const manager = { isManager: true, demoMode: false };
    expect(resolveTab("team", manager)).toBe("team");
    expect(resolveTab("barInventory", manager)).toBe("barInventory");
  });

  it("hides payroll in demo mode, as the navigation does", () => {
    expect(resolveTab("payroll", { isManager: true, demoMode: true })).toBe(
      "tasks",
    );
    expect(resolveTab("payroll", { isManager: true, demoMode: false })).toBe(
      "payroll",
    );
  });
});
