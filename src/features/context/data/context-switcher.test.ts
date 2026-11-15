import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseExplicitLocationSelection,
  type ContextResolutionResult,
  type ExplicitLocationSelection,
} from "@/features/context/domain/active-context";
import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";
import {
  IDS,
  addAssignment,
  addMembership,
  addOverall,
  baseDb,
  createFakeSupabase,
  type FakeDb,
} from "@/features/context/testing/fake-supabase";

import {
  listCurrentEligibleContexts,
  resolveCurrentActiveContext,
} from "./active-context";

/**
 * V2-003.002 — switcher candidate list + explicit `?location=` selection,
 * exercised at the real server-resolution boundary (loader + canonical
 * resolver on an RLS-emulating in-memory Supabase double). This is NOT hosted
 * DEV verification (see EVIDENCE.md).
 */

const cookie = (organizationId: string, locationId: string) =>
  serializeActiveContextCookie({ organizationId, locationId });
const pick = (locationId: string): ExplicitLocationSelection => ({
  status: "present",
  locationId,
});

function client(db: FakeDb, userId: string | null, rls = true) {
  return createFakeSupabase({ userId, db, rls }).client;
}

async function resolve(
  db: FakeDb,
  userId: string,
  options: {
    routeSlug?: string | null;
    cookieValue?: string | null;
    explicitSelection?: ExplicitLocationSelection;
  },
) {
  return resolveCurrentActiveContext({
    routeSlug: options.routeSlug ?? null,
    cookieValue: options.cookieValue ?? null,
    explicitSelection: options.explicitSelection,
    client: client(db, userId),
  });
}

async function listed(db: FakeDb, userId: string) {
  const result = await listCurrentEligibleContexts({
    client: client(db, userId),
  });
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result.contexts.map((c) => `${c.organizationName}/${c.locationName}`);
}

function resolved(result: ContextResolutionResult) {
  if (result.status !== "resolved") {
    throw new Error(`expected resolved, got ${JSON.stringify(result)}`);
  }
  return result.context;
}

describe("V2-003.002 switcher candidates + explicit selection", () => {
  let db: FakeDb;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db = baseDb();
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["owner"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "staff");
    addAssignment(db, IDS.jack, IDS.locNasa, "manager");
    addMembership(db, IDS.sam, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.sam, IDS.locNasa, "manager");
    addAssignment(db, IDS.sam, IDS.locLeagueCity, "staff");
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
  });
  afterEach(() => vi.restoreAllMocks());

  describe("listCurrentEligibleContexts", () => {
    it("SW-02/SW-04: scoped users see only assigned, operable locations", async () => {
      expect(await listed(db, IDS.jerry)).toEqual(["Monks/Webster"]);
      // Sam never sees Webster; inactive Old Kemah / archived Annex omitted.
      expect(await listed(db, IDS.sam)).toEqual([
        "Liquor Tap/League City",
        "Liquor Tap/NASA",
      ]);
    });

    it("SW-03: a multi-organization user sees every authorized context, grouped order stable", async () => {
      expect(await listed(db, IDS.jack)).toEqual([
        "Liquor Tap/NASA",
        "Monks/Webster",
      ]);
    });

    it("SW-03: Overall roles see eligible tenants without synthetic memberships", async () => {
      addOverall(db, IDS.overallManager, "manager");
      expect(await listed(db, IDS.overallManager)).toEqual([
        "Liquor Tap/League City",
        "Liquor Tap/NASA",
        "Monks/Webster",
      ]);
    });

    it("SW-05: different location roles do not merge or elevate privileges", async () => {
      const result = await resolve(db, IDS.sam, {
        routeSlug: "liquor-tap",
        explicitSelection: pick(IDS.locLeagueCity),
      });
      const ctx = resolved(result);
      // Manager at NASA must NOT leak into League City (staff there).
      expect(ctx.access.capabilities).not.toContain("location:manage");
      const nasa = resolved(
        await resolve(db, IDS.sam, {
          routeSlug: "liquor-tap",
          explicitSelection: pick(IDS.locNasa),
        }),
      );
      expect(nasa.access.capabilities.length).toBeGreaterThan(
        ctx.access.capabilities.length,
      );
    });

    it("SW-06/SW-07: inactive and archived locations are never listed", async () => {
      addAssignment(db, IDS.sam, IDS.locOldKemah, "staff");
      addAssignment(db, IDS.sam, IDS.locArchived, "staff");
      const names = await listed(db, IDS.sam);
      expect(names).not.toContain("Liquor Tap/Old Kemah");
      expect(names).not.toContain("Liquor Tap/Closed Annex");
    });

    it("SW-08: a revoked assignment or membership is excluded", async () => {
      db.location_memberships.find(
        (a) => a.profile_id === IDS.sam && a.location_id === IDS.locLeagueCity,
      )!.active = false;
      expect(await listed(db, IDS.sam)).toEqual(["Liquor Tap/NASA"]);

      db.memberships.find(
        (m) => m.profile_id === IDS.jack && m.organization_id === IDS.orgMonks,
      )!.active = false;
      expect(await listed(db, IDS.jack)).toEqual(["Liquor Tap/NASA"]);
    });

    it("an unknown assignment role grants nothing", async () => {
      db.location_memberships.find(
        (a) => a.profile_id === IDS.sam && a.location_id === IDS.locLeagueCity,
      )!.role = "supreme_leader";
      expect(await listed(db, IDS.sam)).toEqual(["Liquor Tap/NASA"]);
    });

    it("a stranger and a signed-out caller get nothing (no tenant leak)", async () => {
      expect(await listed(db, IDS.stranger)).toEqual([]);
      expect(
        await listCurrentEligibleContexts({ client: client(db, null) }),
      ).toEqual({ status: "unauthenticated" });
    });

    it("a failed query is an error, never an empty permission set", async () => {
      const fake = createFakeSupabase({
        userId: IDS.jack,
        db,
        tableErrors: { locations: { message: "boom" } },
      });
      const result = await listCurrentEligibleContexts({
        client: fake.client,
      });
      expect(result).toEqual({
        status: "error",
        reason: "locations_query_failed",
      });
    });

    it("exposes a display-safe model only (no access/capability detail)", async () => {
      const result = await listCurrentEligibleContexts({
        client: client(db, IDS.jerry),
      });
      if (result.status !== "ok") throw new Error("expected ok");
      expect(Object.keys(result.contexts[0]).sort()).toEqual([
        "locationId",
        "locationName",
        "organizationId",
        "organizationName",
        "organizationSlug",
        "timeZone",
      ]);
    });
  });

  describe("explicit URL selection (resolver precedence)", () => {
    it("SW-11: a valid explicit location is validated and resolved", async () => {
      const ctx = resolved(
        await resolve(db, IDS.sam, {
          routeSlug: "liquor-tap",
          explicitSelection: pick(IDS.locLeagueCity),
        }),
      );
      expect(ctx.locationId).toBe(IDS.locLeagueCity);
      expect(ctx.selectedBy).toBe("explicit_selection");
    });

    it("SW-11: an explicit selection overrides a sole-eligible / cookie preference for that request", async () => {
      const ctx = resolved(
        await resolve(db, IDS.sam, {
          routeSlug: "liquor-tap",
          cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
          explicitSelection: pick(IDS.locLeagueCity),
        }),
      );
      expect(ctx.locationId).toBe(IDS.locLeagueCity);
    });

    it("SW-09: a location from another organization is rejected (route fixes the org)", async () => {
      const result = await resolve(db, IDS.jack, {
        routeSlug: "the-monks",
        explicitSelection: pick(IDS.locNasa), // Liquor Tap's location
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "selection_location_unavailable",
      });
    });

    it("SW-09: an unauthorized organization route yields no_access, not a tenant hint", async () => {
      const result = await resolve(db, IDS.jerry, {
        routeSlug: "liquor-tap",
        explicitSelection: pick(IDS.locNasa),
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("SW-09: a location in the right org that the user is NOT assigned to fails closed", async () => {
      const result = await resolve(db, IDS.sam, {
        routeSlug: "liquor-tap",
        explicitSelection: pick(IDS.locOldKemah),
      });
      expect(result.status).toBe("invalid_context");
      expect(JSON.stringify(result)).not.toContain("Old Kemah");
    });

    it("SW-06/07/08: inactive, archived or revoked explicit targets fail closed", async () => {
      addAssignment(db, IDS.sam, IDS.locOldKemah, "staff");
      addAssignment(db, IDS.sam, IDS.locArchived, "staff");
      for (const id of [IDS.locOldKemah, IDS.locArchived]) {
        expect(
          (
            await resolve(db, IDS.sam, {
              routeSlug: "liquor-tap",
              explicitSelection: pick(id),
            })
          ).status,
        ).toBe("invalid_context");
      }
      db.location_memberships.find(
        (a) => a.profile_id === IDS.sam && a.location_id === IDS.locLeagueCity,
      )!.active = false;
      expect(
        (
          await resolve(db, IDS.sam, {
            routeSlug: "liquor-tap",
            explicitSelection: pick(IDS.locLeagueCity),
          })
        ).status,
      ).toBe("invalid_context");
    });

    it("SW-10: malformed location input is rejected before any query", async () => {
      const fake = createFakeSupabase({ userId: IDS.sam, db });
      for (const raw of ["", "not-a-uuid", "1' OR '1'='1", ["a", "b"]]) {
        const selection = parseExplicitLocationSelection(raw);
        expect(selection).toEqual({ status: "malformed" });
        const result = await resolveCurrentActiveContext({
          routeSlug: "liquor-tap",
          cookieValue: null,
          explicitSelection: selection,
          client: fake.client,
        });
        expect(result).toEqual({
          status: "invalid_context",
          reason: "selection_malformed",
        });
      }
      expect(fake.queries).toEqual([]);
    });

    it("SW-10: a well-formed but unknown UUID is rejected, not substituted", async () => {
      const result = await resolve(db, IDS.sam, {
        routeSlug: "liquor-tap",
        explicitSelection: pick("99999999-9999-4999-8999-999999999999"),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "selection_location_unavailable",
      });
    });

    it("an explicit selection without a route organization is rejected", async () => {
      const result = await resolve(db, IDS.sam, {
        routeSlug: null,
        explicitSelection: pick(IDS.locNasa),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "selection_requires_route",
      });
    });

    it("SW-12: an intentional cross-organization switch is not trapped by the previous cookie", async () => {
      const ctx = resolved(
        await resolve(db, IDS.jack, {
          routeSlug: "liquor-tap",
          cookieValue: cookie(IDS.orgMonks, IDS.locWebster),
          explicitSelection: pick(IDS.locNasa),
        }),
      );
      expect(ctx.organizationId).toBe(IDS.orgLiquorTap);
      expect(ctx.locationId).toBe(IDS.locNasa);
      expect(ctx.selectedBy).toBe("explicit_selection");
    });

    it("SW-12: a corrupt cookie does not trap a valid explicit selection", async () => {
      const ctx = resolved(
        await resolve(db, IDS.jack, {
          routeSlug: "liquor-tap",
          cookieValue: "garbage",
          explicitSelection: pick(IDS.locNasa),
        }),
      );
      expect(ctx.locationId).toBe(IDS.locNasa);
    });

    it("SW-12: an INVALID explicit selection is not rescued by the cookie", async () => {
      const result = await resolve(db, IDS.jack, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
        explicitSelection: pick(IDS.locWebster),
      });
      expect(result.status).toBe("invalid_context");
    });

    it("SW-13: an unrelated cookie/route mismatch WITHOUT explicit selection stays fail-closed", async () => {
      const result = await resolve(db, IDS.jack, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgMonks, IDS.locWebster),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_route_organization_mismatch",
      });
      const malformed = await resolve(db, IDS.jack, {
        routeSlug: "liquor-tap",
        cookieValue: "garbage",
      });
      expect(malformed).toEqual({
        status: "invalid_context",
        reason: "cookie_malformed",
      });
    });

    it("without an explicit selection the established cookie behavior is unchanged", async () => {
      const ctx = resolved(
        await resolve(db, IDS.sam, {
          routeSlug: "liquor-tap",
          cookieValue: cookie(IDS.orgLiquorTap, IDS.locLeagueCity),
        }),
      );
      expect(ctx.selectedBy).toBe("cookie_preference");
    });

    it("SW-14: with no selection and several eligible locations, choices are offered (never first-created)", async () => {
      const result = await resolve(db, IDS.sam, { routeSlug: "liquor-tap" });
      expect(result.status).toBe("selection_required");
    });

    it("SW-22: a revoked/unrelated creator or stranger cannot gain context via explicit selection", async () => {
      for (const user of [IDS.stranger, IDS.revokedCreator]) {
        const result = await resolve(db, user, {
          routeSlug: "liquor-tap",
          explicitSelection: pick(IDS.locNasa),
        });
        expect(["no_access", "invalid_context"]).toContain(result.status);
        expect(result.status).not.toBe("resolved");
      }
    });

    it("never writes a cookie: the loader only reads (no setter exists)", async () => {
      const mod = await import("./context-cookie-reader");
      expect(Object.keys(mod)).toEqual(["readActiveContextCookieValue"]);
    });
  });
});

describe("parseExplicitLocationSelection", () => {
  it("is absent only when the parameter was not supplied", () => {
    expect(parseExplicitLocationSelection(undefined)).toEqual({
      status: "absent",
    });
    expect(parseExplicitLocationSelection(null)).toEqual({ status: "absent" });
  });

  it("normalizes a valid uuid to lower case", () => {
    expect(
      parseExplicitLocationSelection("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"),
    ).toEqual({
      status: "present",
      locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });
});
