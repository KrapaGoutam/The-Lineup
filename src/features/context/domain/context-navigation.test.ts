import { describe, expect, it } from "vitest";

import { tabHref } from "@/lib/app-tab";

import {
  contextIdentityKey,
  contextSwitchHref,
  groupContextsByOrganization,
} from "./context-navigation";

const target = { organizationSlug: "liquor-tap", locationId: "loc-nasa" };

describe("contextSwitchHref", () => {
  it("targets the canonical organization route with the explicit location", () => {
    expect(contextSwitchHref(target, "")).toBe(
      "/r/liquor-tap?location=loc-nasa",
    );
  });

  it("carries only the module tab; location-specific detail ids are dropped", () => {
    expect(
      contextSwitchHref(
        target,
        "?tab=recipes&recipe=abc&mode=edit&location=old&utm=x",
      ),
    ).toBe("/r/liquor-tap?tab=recipes&location=loc-nasa");
  });

  it("never carries the previous location", () => {
    expect(contextSwitchHref(target, "?location=old")).not.toContain("old");
  });

  it("encodes the slug", () => {
    expect(
      contextSwitchHref({ organizationSlug: "a/b?c", locationId: "x" }, ""),
    ).toBe("/r/a%2Fb%3Fc?location=x");
  });
});

describe("SW-17: module navigation keeps the temporary selection", () => {
  it("tabHref preserves ?location= while changing tabs, both directions", () => {
    const toSchedule = tabHref(
      "/r/liquor-tap",
      "?location=loc-nasa",
      "schedule",
    );
    expect(toSchedule).toBe("/r/liquor-tap?location=loc-nasa&tab=schedule");
    // Back to the default landing still keeps the selection.
    expect(
      tabHref("/r/liquor-tap", "?location=loc-nasa&tab=schedule", "tasks"),
    ).toBe("/r/liquor-tap?location=loc-nasa");
  });
});

describe("groupContextsByOrganization", () => {
  const c = (o: string, l: string) => ({
    organizationId: o,
    organizationSlug: o,
    organizationName: o.toUpperCase(),
    locationId: l,
    locationName: l,
    timeZone: "America/Chicago",
  });
  it("groups locations under their organization in incoming order", () => {
    const groups = groupContextsByOrganization([
      c("a", "1"),
      c("a", "2"),
      c("b", "3"),
    ]);
    expect(groups.map((g) => [g.organizationName, g.locations.length])).toEqual(
      [
        ["A", 2],
        ["B", 1],
      ],
    );
  });
});

describe("contextIdentityKey", () => {
  it("changes when profile, organization or location changes", () => {
    const base = contextIdentityKey("p", "o", "l");
    expect(contextIdentityKey("p2", "o", "l")).not.toBe(base);
    expect(contextIdentityKey("p", "o2", "l")).not.toBe(base);
    expect(contextIdentityKey("p", "o", "l2")).not.toBe(base);
  });
});
