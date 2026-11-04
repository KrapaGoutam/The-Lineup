import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUserAccessibleLocations } from "@/features/locations/data/location-reader";
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
import type { ContextResolutionResult } from "@/features/context/domain/active-context";

import { resolveCurrentActiveContext } from "./active-context";

/**
 * V2-003.001 — security matrix at the REAL server-resolution boundary.
 * The loader and canonical resolver run unmodified; only the Supabase client
 * is an in-memory double that applies the real RLS read rules (see
 * testing/fake-supabase.ts), so these tests prove behavior, not that a mock
 * returns a context.
 */

const cookie = (organizationId: string, locationId: string) =>
  serializeActiveContextCookie({ organizationId, locationId });

async function resolve(
  db: FakeDb,
  userId: string | null,
  options: {
    routeSlug?: string | null;
    cookieValue?: string | null;
    rls?: boolean;
    authError?: { name?: string; status?: number } | null;
    tableErrors?: Parameters<typeof createFakeSupabase>[0]["tableErrors"];
  } = {},
) {
  const fake = createFakeSupabase({
    userId,
    db,
    rls: options.rls,
    authError: options.authError,
    tableErrors: options.tableErrors,
  });
  const result = await resolveCurrentActiveContext({
    routeSlug: options.routeSlug ?? null,
    cookieValue: options.cookieValue ?? null,
    client: fake.client,
  });
  return { result, queries: fake.queries };
}

function resolved(result: ContextResolutionResult) {
  if (result.status !== "resolved") {
    throw new Error(`expected resolved, got ${JSON.stringify(result)}`);
  }
  return result.context;
}

describe("resolveCurrentActiveContext (V2-003.001)", () => {
  let db: FakeDb;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db = baseDb();
    // Jack: multi-org (Monks/Webster + Liquor Tap/NASA + League City)
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["owner"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "staff");
    addAssignment(db, IDS.jack, IDS.locNasa, "manager");
    addAssignment(db, IDS.jack, IDS.locLeagueCity, "staff");
    // Sam: Liquor Tap, manager at NASA, staff at League City
    addMembership(db, IDS.sam, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.sam, IDS.locNasa, "manager");
    addAssignment(db, IDS.sam, IDS.locLeagueCity, "staff");
    // Tom: single org (Liquor Tap), NASA + League City (NASA created first)
    addMembership(db, IDS.tom, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.tom, IDS.locNasa, "staff");
    addAssignment(db, IDS.tom, IDS.locLeagueCity, "staff");
    // Jerry: Monks / Webster only
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("authentication", () => {
    it("CTX-01: unauthenticated request is denied and touches no tenant table", async () => {
      const { result, queries } = await resolve(db, null, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "unauthenticated" });
      expect(queries).toEqual([]);
    });

    it("CTX-01: expired/revoked session (auth error, no user) fails closed", async () => {
      const { result, queries } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
        authError: { name: "AuthApiError", status: 401 },
      });
      expect(result).toEqual({ status: "unauthenticated" });
      expect(queries).toEqual([]);
    });

    it("CTX-01: an auth-server outage is an error, not 'signed out'", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
        authError: { name: "AuthRetryableFetchError", status: 0 },
      });
      expect(result).toEqual({
        status: "error",
        reason: "auth_service_unavailable",
      });
    });
  });

  describe("resolution", () => {
    it("CTX-02: a valid organization/location pair resolves (Jerry: Monks/Webster)", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
      });
      const ctx = resolved(result);
      expect(ctx.organizationId).toBe(IDS.orgMonks);
      expect(ctx.organizationSlug).toBe("the-monks");
      expect(ctx.organizationName).toBe("Monks");
      expect(ctx.locationId).toBe(IDS.locWebster);
      expect(ctx.locationName).toBe("Webster");
      expect(ctx.timeZone).toBe("America/Chicago");
      expect(ctx.profileId).toBe(IDS.jerry);
      expect(ctx.access.allowed).toBe(true);
      expect(ctx.access.capabilities).toContain("location:operate");
      expect(ctx.selectedBy).toBe("sole_eligible_location");
    });

    it("CTX-02: route slug is matched case-insensitively", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: " The-Monks ",
      });
      expect(resolved(result).organizationId).toBe(IDS.orgMonks);
    });

    it("CTX-02: a valid cookie preference selects among several locations", async () => {
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locLeagueCity),
      });
      const ctx = resolved(result);
      expect(ctx.locationId).toBe(IDS.locLeagueCity);
      expect(ctx.selectedBy).toBe("cookie_preference");
    });

    it("CTX-02: with no route, a valid cookie alone resolves", async () => {
      const { result } = await resolve(db, IDS.jack, {
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(resolved(result).locationId).toBe(IDS.locNasa);
    });

    it("an unknown slug yields no_access (no tenant enumeration)", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "does-not-exist",
      });
      expect(result).toEqual({ status: "no_access" });
    });
  });

  describe("tenant isolation", () => {
    it("CTX-03: a cross-organization pair is denied (Jerry cannot select Liquor Tap/NASA)", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result.status).toBe("invalid_context");
      expect(result).toMatchObject({
        reason: "cookie_organization_unavailable",
      });
    });

    it("CTX-03: an organization/location pair that do not belong together is denied", async () => {
      const { result } = await resolve(db, IDS.jack, {
        cookieValue: cookie(IDS.orgMonks, IDS.locNasa),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      });
    });

    it("CTX-13: a multi-org user does not inherit a foreign organization's grants (Jack: owner at Liquor Tap, staff at Monks)", async () => {
      const { result } = await resolve(db, IDS.jack, {
        routeSlug: "the-monks",
      });
      const ctx = resolved(result);
      expect(ctx.organizationId).toBe(IDS.orgMonks);
      expect(ctx.access.capabilities).not.toContain("org:admin");
      expect(ctx.access.capabilities).not.toContain("location:manage");
      expect(ctx.access.effectiveLevel).toBe("staff");
    });

    it("CTX-13: Sam (Liquor Tap only) has no access to Monks", async () => {
      const { result } = await resolve(db, IDS.sam, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "no_access" });
    });
  });

  describe("lifecycle and revocation", () => {
    it("CTX-04: an inactive location is denied even if assigned", async () => {
      addAssignment(db, IDS.tom, IDS.locOldKemah, "staff");
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locOldKemah),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      });
    });

    it("CTX-05: an archived location is denied even if assigned", async () => {
      addAssignment(db, IDS.tom, IDS.locArchived, "staff");
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locArchived),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      });
    });

    it("CTX-05: an archived row with a (corrupt) active=true flag is still denied via archived_at", async () => {
      const row = db.locations.find((l) => l.id === IDS.locLeagueCity)!;
      row.archived_at = "2026-10-01T00:00:00Z";
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
      });
      // League City excluded -> NASA is now the only eligible location.
      expect(resolved(result).locationId).toBe(IDS.locNasa);
    });

    it("CTX-04/05: inactive/archived locations are never offered for selection", async () => {
      addOverall(db, IDS.overallManager, "manager");
      const { result } = await resolve(db, IDS.overallManager, {
        routeSlug: "liquor-tap",
      });
      expect(result.status).toBe("selection_required");
      if (result.status !== "selection_required") return;
      expect(result.availableContexts.map((c) => c.locationName)).toEqual([
        "League City",
        "NASA",
      ]);
    });

    it("CTX-06: an inactive organization membership is denied (and the org is invisible under RLS)", async () => {
      const row = db.memberships.find(
        (m) =>
          m.profile_id === IDS.sam && m.organization_id === IDS.orgLiquorTap,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.sam, {
        routeSlug: "liquor-tap",
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("CTX-06: defense in depth — even a privileged reader that sees the rows is denied by the resolver", async () => {
      const row = db.memberships.find(
        (m) =>
          m.profile_id === IDS.sam && m.organization_id === IDS.orgLiquorTap,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.sam, {
        routeSlug: "liquor-tap",
        rls: false,
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("CTX-07: an inactive location assignment is denied", async () => {
      const row = db.location_memberships.find(
        (a) => a.profile_id === IDS.tom && a.location_id === IDS.locNasa,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      });
    });

    it("CTX-07: with one assignment deactivated, the remaining one is the unique eligible context", async () => {
      const row = db.location_memberships.find(
        (a) => a.profile_id === IDS.tom && a.location_id === IDS.locNasa,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
      });
      expect(resolved(result).locationId).toBe(IDS.locLeagueCity);
    });

    it("CTX-17: a revoked organization creator keeps no access (creator bypass stays closed)", async () => {
      db.organizations.push({
        id: "00000000-0000-4000-8000-0000000000aa",
        name: "Creator Org",
        slug: "creator-org",
        created_by: IDS.revokedCreator,
      });
      addMembership(
        db,
        IDS.revokedCreator,
        "00000000-0000-4000-8000-0000000000aa",
        ["owner"],
        false,
      );
      for (const rls of [true, false]) {
        const { result } = await resolve(db, IDS.revokedCreator, {
          routeSlug: "creator-org",
          rls,
        });
        expect(result).toEqual({ status: "no_access" });
      }
    });

    it("a user with no memberships anywhere has no access", async () => {
      const { result } = await resolve(db, IDS.stranger, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "no_access" });
    });
  });

  describe("Overall roles", () => {
    it("CTX-08: an Overall Owner with NO organization membership resolves a valid context", async () => {
      addOverall(db, IDS.overallOwner, "owner");
      const { result } = await resolve(db, IDS.overallOwner, {
        routeSlug: "the-monks",
      });
      const ctx = resolved(result);
      expect(ctx.locationId).toBe(IDS.locWebster);
      expect(ctx.access.applicableSources).toEqual(["overall"]);
      expect(ctx.access.capabilities).toContain("overall:owner");
    });

    it("CTX-09: an Overall Manager has global scope across organizations", async () => {
      addOverall(db, IDS.overallManager, "manager");
      const { result } = await resolve(db, IDS.overallManager);
      expect(result.status).toBe("selection_required");
      if (result.status !== "selection_required") return;
      expect(
        result.availableContexts.map(
          (c) => `${c.organizationName}/${c.locationName}`,
        ),
      ).toEqual(["Liquor Tap/League City", "Liquor Tap/NASA", "Monks/Webster"]);
    });

    it("CTX-09: an Overall Manager's baseline is not owner-exclusive", async () => {
      addOverall(db, IDS.overallManager, "manager");
      const { result } = await resolve(db, IDS.overallManager, {
        routeSlug: "the-monks",
      });
      const ctx = resolved(result);
      expect(ctx.access.capabilities).toContain("overall:manage");
      expect(ctx.access.capabilities).not.toContain("overall:owner");
    });

    it("CTX-10: an Overall Assistant Manager receives only assistant-tier capabilities", async () => {
      addOverall(db, IDS.overallAssistant, "assistant_manager");
      const { result } = await resolve(db, IDS.overallAssistant, {
        routeSlug: "the-monks",
      });
      const caps = resolved(result).access.capabilities;
      expect(caps).toContain("overall:assistant_manage");
      expect(caps).toContain("location:operate");
      expect(caps).not.toContain("overall:manage");
      expect(caps).not.toContain("overall:owner");
      expect(caps).not.toContain("org:admin");
    });

    it("an unrecognised stored Overall role grants nothing", async () => {
      addOverall(db, IDS.stranger, "superuser");
      const { result } = await resolve(db, IDS.stranger, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("Overall authority does not require local membership and is not narrowed by an inactive one", async () => {
      addOverall(db, IDS.overallOwner, "owner");
      addMembership(db, IDS.overallOwner, IDS.orgMonks, ["server"], false);
      const { result } = await resolve(db, IDS.overallOwner, {
        routeSlug: "the-monks",
      });
      expect(resolved(result).organizationId).toBe(IDS.orgMonks);
    });
  });

  describe("organization / location role authority", () => {
    it("CTX-11: an Org Owner with no location assignment is NOT granted operational location access (canonical resolver: ACCESS_MODEL §5.5)", async () => {
      addMembership(db, IDS.orgOwnerLiquor, IDS.orgLiquorTap, ["owner"]);
      const { result } = await resolve(db, IDS.orgOwnerLiquor, {
        routeSlug: "liquor-tap",
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("CTX-11: an Org Owner assigned to a location resolves with org:admin plus the assigned role's authority", async () => {
      addMembership(db, IDS.orgOwnerLiquor, IDS.orgLiquorTap, ["owner"]);
      addAssignment(db, IDS.orgOwnerLiquor, IDS.locNasa, "manager");
      const { result } = await resolve(db, IDS.orgOwnerLiquor, {
        routeSlug: "liquor-tap",
      });
      const ctx = resolved(result);
      expect(ctx.locationId).toBe(IDS.locNasa);
      expect(ctx.access.capabilities).toContain("org:admin");
      expect(ctx.access.capabilities).toContain("location:manage");
    });

    it("CTX-11 (characterization): getCurrentUserAccessibleLocations over-lists an Org Owner; the canonical resolver is the context authority", async () => {
      addMembership(db, IDS.orgOwnerLiquor, IDS.orgLiquorTap, ["owner"]);
      const fake = createFakeSupabase({ userId: IDS.orgOwnerLiquor, db });
      const listed = await getCurrentUserAccessibleLocations(
        IDS.orgLiquorTap,
        fake.client,
      );
      // Legacy reader: every ACTIVE org location...
      expect(listed.map((l) => l.name).sort()).toEqual(["League City", "NASA"]);
      // ...but context resolution (resolver-backed) offers none.
      const { result } = await resolve(db, IDS.orgOwnerLiquor, {
        routeSlug: "liquor-tap",
      });
      expect(result.status).toBe("no_access");
    });

    it("CTX-12: ordinary staff sees only authorized branches (Tom cannot select Webster or an unassigned sibling)", async () => {
      addAssignment(db, IDS.jerry, IDS.locOldKemah, "staff", false);
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
      });
      expect(result.status).toBe("selection_required");
      if (result.status !== "selection_required") return;
      expect(result.availableContexts.map((c) => c.locationId).sort()).toEqual(
        [IDS.locNasa, IDS.locLeagueCity].sort(),
      );
    });

    it("CTX-12: staff cannot obtain a sibling location by cookie when only one is assigned", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
        cookieValue: cookie(IDS.orgMonks, IDS.locNasa),
      });
      expect(result.status).toBe("invalid_context");
    });

    it("Sam: manager at NASA, staff at League City — authority follows the selected location", async () => {
      const nasa = resolved(
        (
          await resolve(db, IDS.sam, {
            routeSlug: "liquor-tap",
            cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
          })
        ).result,
      );
      const lc = resolved(
        (
          await resolve(db, IDS.sam, {
            routeSlug: "liquor-tap",
            cookieValue: cookie(IDS.orgLiquorTap, IDS.locLeagueCity),
          })
        ).result,
      );
      expect(nasa.access.effectiveLevel).toBe("manager");
      expect(nasa.access.capabilities).toContain("location:manage");
      expect(lc.access.effectiveLevel).toBe("staff");
      expect(lc.access.capabilities).not.toContain("location:manage");
    });

    it("an unrecognised stored location role fails closed (not coerced to staff)", async () => {
      const row = db.location_memberships.find(
        (a) => a.profile_id === IDS.jerry,
      )!;
      row.role = "supervisor";
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "no_access" });
    });

    it("a location with an invalid IANA time zone is never offered", async () => {
      const row = db.locations.find((l) => l.id === IDS.locWebster)!;
      row.time_zone = "Texas";
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
      });
      expect(result).toEqual({ status: "no_access" });
    });
  });

  describe("no arbitrary location fallback", () => {
    it("CTX-18: a multi-location user without a cookie is NEVER given the first-created location", async () => {
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
      });
      expect(result.status).toBe("selection_required");
    });

    it("CTX-18: reversing creation order changes nothing (selection is not creation-order based)", async () => {
      db.locations.reverse();
      db.location_memberships.reverse();
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
      });
      expect(result.status).toBe("selection_required");
      if (result.status !== "selection_required") return;
      // deterministic by name/id, independent of row order
      expect(result.availableContexts.map((c) => c.locationName)).toEqual([
        "League City",
        "NASA",
      ]);
    });

    it("CTX-18: a unique eligible location is selected by eligibility, not age (second Monks branch exists but is unassigned)", async () => {
      db.locations.push({
        id: IDS.locMonksSecond,
        organization_id: IDS.orgMonks,
        name: "Aardvark Branch",
        time_zone: "America/Chicago",
        active: true,
        archived_at: null,
        created_at: "2000-01-01T00:00:00Z", // oldest of all
      });
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
      });
      expect(resolved(result).locationId).toBe(IDS.locWebster);
    });
  });

  describe("cookie input (read-only, untrusted)", () => {
    const malformed: Array<[string, string]> = [
      ["not json", "garbage"],
      ["json array", "[]"],
      ["json null", "null"],
      [
        "wrong version",
        JSON.stringify({ v: 2, o: IDS.orgMonks, l: IDS.locWebster }),
      ],
      ["missing location", JSON.stringify({ v: 1, o: IDS.orgMonks })],
      [
        "non-uuid organization",
        JSON.stringify({ v: 1, o: "the-monks", l: IDS.locWebster }),
      ],
      [
        "sql-ish location",
        JSON.stringify({ v: 1, o: IDS.orgMonks, l: "1' or '1'='1" }),
      ],
      ["oversized", "x".repeat(5000)],
    ];

    it.each(malformed)(
      "CTX-14: a malformed cookie (%s) is rejected, never silently ignored, before any tenant query",
      async (_label, value) => {
        const { result, queries } = await resolve(db, IDS.jerry, {
          routeSlug: "the-monks",
          cookieValue: value,
        });
        expect(result).toEqual({
          status: "invalid_context",
          reason: "cookie_malformed",
        });
        expect(queries).toEqual([]);
      },
    );

    it("CTX-15: a stale selection (location no longer exists) fails closed — no fallback to another location", async () => {
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(
          IDS.orgLiquorTap,
          "00000000-0000-4000-8000-0000000000ff",
        ),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      });
    });

    it("CTX-15: a stale selection after assignment revocation fails closed even though other locations remain valid", async () => {
      const row = db.location_memberships.find(
        (a) => a.profile_id === IDS.tom && a.location_id === IDS.locNasa,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.tom, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result.status).toBe("invalid_context");
    });

    it("CTX-15: a stale selection after the organization membership is revoked fails closed", async () => {
      const row = db.memberships.find(
        (m) =>
          m.profile_id === IDS.sam && m.organization_id === IDS.orgLiquorTap,
      )!;
      row.active = false;
      const { result } = await resolve(db, IDS.sam, {
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_organization_unavailable",
      });
    });

    it("CTX-16: a route/cookie organization mismatch is rejected even when BOTH organizations are authorized", async () => {
      const { result } = await resolve(db, IDS.jack, {
        routeSlug: "the-monks",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result).toEqual({
        status: "invalid_context",
        reason: "cookie_route_organization_mismatch",
      });
    });

    it("CTX-16: a route mismatch never loads the cookie's organization data", async () => {
      const { queries } = await resolve(db, IDS.jack, {
        routeSlug: "the-monks",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      const orgLookups = queries.filter((q) => q.table === "organizations");
      expect(
        orgLookups.every((q) =>
          q.filters.every(
            (f) => !(f.column === "id" && f.value === IDS.orgLiquorTap),
          ),
        ),
      ).toBe(true);
      const locationQueries = queries.filter((q) => q.table === "locations");
      for (const q of locationQueries) {
        expect(JSON.stringify(q.filters)).not.toContain(IDS.orgLiquorTap);
      }
    });

    it("a cookie never overrides route scope toward an organization the user cannot see", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "liquor-tap",
        cookieValue: cookie(IDS.orgLiquorTap, IDS.locNasa),
      });
      expect(result).toEqual({ status: "no_access" });
    });
  });

  describe("query failures vs empty results", () => {
    const tables = [
      ["overall_roles", "overall_role_query_failed"],
      ["memberships", "memberships_query_failed"],
      ["organizations", "organization_by_slug_query_failed"],
      ["locations", "locations_query_failed"],
      ["location_memberships", "location_assignments_query_failed"],
    ] as const;

    it.each(tables)(
      "CTX-20: a failed %s query is an error, not an empty successful result",
      async (table, reason) => {
        const { result } = await resolve(db, IDS.jerry, {
          routeSlug: "the-monks",
          tableErrors: { [table]: { message: "boom: secret detail" } },
        });
        expect(result).toEqual({ status: "error", reason });
      },
    );

    it("CTX-20: a failed 'all organizations' query is an error", async () => {
      addOverall(db, IDS.overallManager, "manager");
      const { result } = await resolve(db, IDS.overallManager, {
        tableErrors: { organizations: { message: "boom" } },
      });
      expect(result).toEqual({
        status: "error",
        reason: "organizations_query_failed",
      });
    });

    it("CTX-20: the error reason never leaks database detail", async () => {
      const { result } = await resolve(db, IDS.jerry, {
        routeSlug: "the-monks",
        tableErrors: { locations: { message: "relation locations secret" } },
      });
      expect(JSON.stringify(result)).not.toContain("secret");
    });

    it("CTX-20: an empty-but-successful result is no_access (distinct from error)", async () => {
      const { result } = await resolve(db, IDS.stranger, {
        routeSlug: "the-monks",
      });
      expect(result.status).toBe("no_access");
      expect(result.status).not.toBe("error");
    });

    it("a Next.js dynamic-rendering signal is rethrown, never converted to an error result (no cached signed-out snapshot)", async () => {
      const dynamicSignal = Object.assign(new Error("Dynamic server usage"), {
        digest: "DYNAMIC_SERVER_USAGE",
      });
      const dynamicClient = {
        auth: {
          getUser: async () => {
            throw dynamicSignal;
          },
        },
      } as never;
      await expect(
        resolveCurrentActiveContext({
          routeSlug: "the-monks",
          cookieValue: null,
          client: dynamicClient,
        }),
      ).rejects.toBe(dynamicSignal);
    });

    it("an unexpected throw inside the client is contained as an error", async () => {
      const broken = {
        auth: {
          getUser: async () => {
            throw new Error("network down");
          },
        },
      } as never;
      const result = await resolveCurrentActiveContext({
        routeSlug: "the-monks",
        cookieValue: null,
        client: broken,
      });
      expect(result).toEqual({
        status: "error",
        reason: "context_resolution_failed",
      });
    });
  });
});
