import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * V2-003.001 — the REAL initial loaders, given a verified scope, must use that
 * exact location/time zone and must never fall back to the legacy
 * primary-location query (`from("locations")` ordered by creation).
 * Only the Supabase client and the (organization-wide) roster/attendance
 * helpers are doubled.
 */

const log = vi.hoisted(() => ({
  tables: [] as string[],
  eqs: [] as Array<{ table: string; column: string; value: unknown }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (table: string) => {
      log.tables.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of [
        "select",
        "in",
        "gte",
        "lte",
        "lt",
        "gt",
        "order",
        "limit",
        "is",
        "neq",
        "not",
        "or",
        "contains",
      ]) {
        builder[method] = () => builder;
      }
      builder.eq = (column: string, value: unknown) => {
        log.eqs.push({ table, column, value });
        return builder;
      };
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.single = async () => ({ data: null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));

vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: async () => [],
}));

vi.mock("@/features/tips/data/fetch-clocked-in-roster", () => ({
  fetchClockedInRoster: async () => ({ ok: true, data: [] }),
}));

import { getAllocationContext } from "@/features/allocation/data/allocation-data";
import { getScheduleContext } from "@/features/schedules/data/schedule-data";
import { getTipsContext } from "@/features/tips/data/tips-data";

const SCOPE = {
  organizationId: "org-monks",
  locationId: "loc-webster",
  timeZone: "America/Chicago",
};

describe("initial loaders honour the verified scope (V2-003.001)", () => {
  beforeEach(() => {
    log.tables.length = 0;
    log.eqs.length = 0;
  });

  it("CTX-19: schedule uses the verified location + time zone and never queries a primary location", async () => {
    const ctx = await getScheduleContext("org-monks", SCOPE);
    expect(ctx?.locationId).toBe("loc-webster");
    expect(ctx?.timeZone).toBe("America/Chicago");
    expect(log.tables).not.toContain("locations");
    expect(
      log.eqs.filter((e) => e.column === "location_id").map((e) => e.value),
    ).toEqual(["loc-webster", "loc-webster"]);
  });

  it("CTX-19: tips uses the verified location + time zone and never queries a primary location", async () => {
    const ctx = await getTipsContext("org-monks", SCOPE);
    expect(ctx?.locationId).toBe("loc-webster");
    expect(ctx?.timeZone).toBe("America/Chicago");
    expect(log.tables).not.toContain("locations");
    expect(
      log.eqs.filter((e) => e.column === "location_id").map((e) => e.value),
    ).toEqual(["loc-webster"]);
  });

  it("CTX-19: allocation uses the verified location + time zone and never queries a primary location", async () => {
    const ctx = await getAllocationContext("org-monks", undefined, SCOPE);
    expect(ctx?.locationId).toBe("loc-webster");
    expect(log.tables).not.toContain("locations");
    expect(
      log.eqs.filter((e) => e.column === "location_id").map((e) => e.value),
    ).toContain("loc-webster");
    expect(
      log.eqs.filter((e) => e.column === "location_id").map((e) => e.value),
    ).not.toContainEqual(expect.not.stringMatching(/^loc-webster$/));
  });

  it("CTX-18: every loader fails safe (null) when the scope belongs to another organization", async () => {
    const other = { ...SCOPE, organizationId: "org-liquor" };
    expect(await getScheduleContext("org-monks", other)).toBeNull();
    expect(await getTipsContext("org-monks", other)).toBeNull();
    expect(
      await getAllocationContext("org-monks", undefined, other),
    ).toBeNull();
    expect(log.tables).not.toContain("locations");
  });

  it("legacy direct callers (no scope) still use the primary-location helper", async () => {
    await getTipsContext("org-monks");
    expect(log.tables).toContain("locations");
  });
});
