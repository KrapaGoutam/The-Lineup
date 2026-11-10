import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOverallRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: mocks.getOverallRole,
}));

import { entryDesignation, getCurrentUser } from "./current-user";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

type Table = "organizations" | "profiles" | "memberships";

/** Minimal chainable PostgREST double: every filter returns the builder; maybeSingle resolves. */
function clientDouble(rows: Record<Table, unknown>, user: string | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user: user ? { id: user } : null } }),
    },
    from(table: Table) {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = async () => ({ data: rows[table], error: null });
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOverallRole.mockResolvedValue(null);
});

describe("getCurrentUser — membership-strict by design", () => {
  it("returns the caller for an ACTIVE membership in the slug's organization", async () => {
    mocks.createClient.mockResolvedValue(
      clientDouble(
        {
          organizations: { id: ORG },
          profiles: { display_name: "Pat" },
          memberships: { roles: ["owner"] },
        },
        USER,
      ),
    );
    const user = await getCurrentUser("some-org");
    expect(user).toMatchObject({ profileId: USER, organizationId: ORG });
    expect(user?.designation).toBe("owner");
  });

  it("returns null for an Overall role with NO membership in that organization", async () => {
    // The shared helper behind the service-role account routes (passcode reset, member
    // deactivate/reactivate, account recovery). An Overall owner/manager must NOT pass it
    // for an organization they hold no membership in; that would grant cross-organization
    // account control. Overall administrators use the canonical-context resolver instead.
    mocks.getOverallRole.mockResolvedValue("owner");
    mocks.createClient.mockResolvedValue(
      clientDouble(
        {
          organizations: { id: ORG },
          profiles: { display_name: "Overall Admin" },
          memberships: null,
        },
        USER,
      ),
    );
    expect(await getCurrentUser("foreign-org")).toBeNull();
  });

  it("returns null when the caller has no active membership and no Overall role", async () => {
    mocks.createClient.mockResolvedValue(
      clientDouble(
        {
          organizations: { id: ORG },
          profiles: { display_name: "Nobody" },
          memberships: null,
        },
        USER,
      ),
    );
    expect(await getCurrentUser("some-org")).toBeNull();
  });

  it("returns null when unauthenticated or the slug is unknown", async () => {
    mocks.createClient.mockResolvedValue(
      clientDouble(
        { organizations: null, profiles: null, memberships: null },
        null,
      ),
    );
    expect(await getCurrentUser("some-org")).toBeNull();

    mocks.createClient.mockResolvedValue(
      clientDouble(
        { organizations: null, profiles: null, memberships: null },
        USER,
      ),
    );
    expect(await getCurrentUser("no-such-org")).toBeNull();
  });

  it("never consults the Overall role to authorize (membership-only helper)", async () => {
    mocks.getOverallRole.mockResolvedValue("owner");
    mocks.createClient.mockResolvedValue(
      clientDouble(
        {
          organizations: { id: ORG },
          profiles: { display_name: "Overall Admin" },
          memberships: null,
        },
        USER,
      ),
    );
    await getCurrentUser("foreign-org");
    expect(mocks.getOverallRole).not.toHaveBeenCalled();
  });
});

describe("entryDesignation", () => {
  it("is the higher of membership and Overall designation", () => {
    expect(
      entryDesignation({ membershipRoles: ["server"], overallRole: "manager" }),
    ).toBe("manager");
    expect(
      entryDesignation({ membershipRoles: ["owner"], overallRole: null }),
    ).toBe("owner");
    expect(entryDesignation({ membershipRoles: null, overallRole: null })).toBe(
      "staff",
    );
  });
});
