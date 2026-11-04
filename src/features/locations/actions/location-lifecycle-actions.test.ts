import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getLocationLifecycleReadinessAction,
  listLocationLifecycleEventsAction,
  transitionLocationLifecycleAction,
} from "./location-lifecycle-actions";
import { getLocationById } from "@/features/locations/data/location-reader";
import { getOverallRole } from "@/features/auth/data/overall-role";
import { getOrganizationMembership } from "@/features/auth/data/organization-membership";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/locations/data/location-reader", () => ({
  getLocationById: vi.fn(),
  getLocationOperatingHours: vi.fn(),
  listLocationsByOrganization: vi.fn(),
}));
vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: vi.fn(),
}));
vi.mock("@/features/auth/data/organization-membership", () => ({
  getOrganizationMembership: vi.fn(),
}));
vi.mock("@/features/organizations/data/organization-reader", () => ({
  listUserOrganizations: vi.fn(),
}));

const ACTOR = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR = "11111111-1111-1111-1111-111111111111";
const ORG_MONKS = "22222222-2222-2222-2222-222222222222";
const LOC_NASA = "33333333-3333-3333-3333-333333333331";

function nasa(over: Record<string, unknown> = {}) {
  return {
    id: LOC_NASA,
    organizationId: ORG_LIQUOR,
    name: "NASA",
    timeZone: "America/Chicago",
    address: {},
    coverWeight: 0.25,
    active: true,
    archivedAt: null,
    openingLocal: "11:00",
    closingLocal: "23:00",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function locationRpcRow(over: Record<string, unknown> = {}) {
  return {
    id: LOC_NASA,
    organization_id: ORG_LIQUOR,
    name: "NASA",
    time_zone: "America/Chicago",
    address: {},
    cover_weight: 0.25,
    active: false,
    archived_at: null,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function createClientMock(opts: {
  user?: { id: string } | null;
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
  events?: unknown[];
}) {
  const user = opts.user === undefined ? { id: ACTOR } : opts.user;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) =>
    opts.rpc ? opts.rpc(name, args) : { data: null, error: null },
  );
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data: opts.events ?? [], error: null }));
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
    from: vi.fn(() => chain),
    rpc,
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    rpc,
  };
}

function asOwner() {
  vi.mocked(getOverallRole).mockResolvedValue(null);
  vi.mocked(getOrganizationMembership).mockResolvedValue({
    organizationId: ORG_LIQUOR,
    profileId: ACTOR,
    roles: ["owner"],
    active: true,
  } as never);
}

beforeEach(() => {
  vi.mocked(getOverallRole).mockReset();
  vi.mocked(getOrganizationMembership).mockReset();
  vi.mocked(getLocationById).mockReset();
  vi.mocked(getLocationById).mockResolvedValue(nasa() as never);
});

describe("transitionLocationLifecycleAction (V2-002.005)", () => {
  it("ACT-001: org owner deactivates; actor is never sent, expected state is", async () => {
    asOwner();
    const { client, rpc } = createClientMock({
      rpc: () => ({ data: locationRpcRow(), error: null }),
    });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "  Closing for renovation  ",
        // forged fields must be ignored
        ...({ actorProfileId: "forged", isManager: true } as object),
      },
      client,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.active).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("transition_location_lifecycle");
    expect(args).toEqual({
      p_location_id: LOC_NASA,
      p_action: "deactivate",
      p_reason: "Closing for renovation",
      p_expected_status: "active",
    });
    expect(JSON.stringify(args)).not.toMatch(/actor|forged|isManager/i);
  });

  it("ACT-002: overall owner/manager is authorized without a membership", async () => {
    vi.mocked(getOverallRole).mockResolvedValue("manager");
    vi.mocked(getOrganizationMembership).mockResolvedValue(null);
    const { client } = createClientMock({
      rpc: () => ({ data: locationRpcRow(), error: null }),
    });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "Overall decision",
      },
      client,
    );
    expect(res.ok).toBe(true);
  });

  it.each([
    [
      "overall assistant manager",
      "assistant_manager",
      { roles: ["server"], active: true },
    ],
    ["shift manager", null, { roles: ["shift_manager"], active: true }],
    ["revoked owner", null, { roles: ["owner"], active: false }],
    ["server", null, { roles: ["server"], active: true }],
  ])(
    "ACT-003: %s is denied before any RPC call",
    async (_n, overall, member) => {
      vi.mocked(getOverallRole).mockResolvedValue(overall as never);
      vi.mocked(getOrganizationMembership).mockResolvedValue(member as never);
      const { client, rpc } = createClientMock({});
      const res = await transitionLocationLifecycleAction(
        {
          organizationId: ORG_LIQUOR,
          locationId: LOC_NASA,
          action: "deactivate",
          reason: "Not allowed",
        },
        client,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("UNAUTHORIZED");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("ACT-004: a Monks manager cannot act on a Liquor Tap location (tenant mismatch)", async () => {
    vi.mocked(getOverallRole).mockResolvedValue(null);
    vi.mocked(getOrganizationMembership).mockResolvedValue({
      organizationId: ORG_MONKS,
      profileId: ACTOR,
      roles: ["owner"],
      active: true,
    } as never);
    const { client, rpc } = createClientMock({});
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_MONKS,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "Wrong tenant",
      },
      client,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TENANT_MISMATCH");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-005: unauthenticated callers get sessionInvalid", async () => {
    const { client, rpc } = createClientMock({ user: null });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "No session",
      },
      client,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.sessionInvalid).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-006: validates action and reason before touching the backend", async () => {
    asOwner();
    const { client, rpc } = createClientMock({});
    for (const reason of ["", "   ", "ab", "x".repeat(501)]) {
      const res = await transitionLocationLifecycleAction(
        {
          organizationId: ORG_LIQUOR,
          locationId: LOC_NASA,
          action: "deactivate",
          reason,
        },
        client,
      );
      expect(res.ok).toBe(false);
    }
    const bad = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "delete" as never,
        reason: "Remove it",
      },
      client,
    );
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-007: rejects an unsupported transition from persisted state without an RPC call", async () => {
    asOwner();
    vi.mocked(getLocationById).mockResolvedValue(
      nasa({ active: false, archivedAt: "2026-02-01T00:00:00Z" }) as never,
    );
    const { client, rpc } = createClientMock({});
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "reactivate",
        reason: "Reopen it",
      },
      client,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("INVALID_TRANSITION");
      expect(res.error).toMatch(/restore it from the archive/i);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-008: surfaces structured blockers from an LC001 refusal", async () => {
    asOwner();
    const { client } = createClientMock({
      rpc: () => ({
        data: null,
        error: {
          code: "LC001",
          message:
            "Cannot deactivate this location while unresolved operational work exists",
          details: JSON.stringify([
            {
              code: "ACTIVE_SERVICE_SESSIONS",
              count: 1,
              capped: false,
              deactivate: "hard",
              archive: "hard",
            },
          ]),
        },
      }),
    });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "Try anyway",
      },
      client,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("BLOCKED");
      expect(res.blockers).toEqual([
        {
          code: "ACTIVE_SERVICE_SESSIONS",
          count: 1,
          capped: false,
          deactivate: "hard",
          archive: "hard",
        },
      ]);
    }
  });

  it.each([
    ["LC002", "INVALID_TRANSITION"],
    ["LC003", "STATE_CONFLICT"],
    ["42501", "UNAUTHORIZED"],
    ["22023", "INVALID_INPUT"],
    ["P0002", "NOT_FOUND"],
    ["XX000", "UNKNOWN"],
  ])("ACT-009: maps database error %s to %s", async (code, kind) => {
    asOwner();
    const { client } = createClientMock({
      rpc: () => ({ data: null, error: { code, message: "boom" } }),
    });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "deactivate",
        reason: "Mapping check",
      },
      client,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe(kind);
  });

  it("ACT-010: archive of an inactive location passes expected status 'inactive'", async () => {
    asOwner();
    vi.mocked(getLocationById).mockResolvedValue(
      nasa({ active: false }) as never,
    );
    const { client, rpc } = createClientMock({
      rpc: () => ({
        data: locationRpcRow({ archived_at: "2026-03-01T00:00:00Z" }),
        error: null,
      }),
    });
    const res = await transitionLocationLifecycleAction(
      {
        organizationId: ORG_LIQUOR,
        locationId: LOC_NASA,
        action: "archive",
        reason: "Permanently closed",
      },
      client,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.archivedAt).toBe("2026-03-01T00:00:00Z");
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_action: "archive",
      p_expected_status: "inactive",
    });
  });
});

describe("readiness and history actions", () => {
  it("ACT-011: returns parsed readiness for an authorized caller", async () => {
    asOwner();
    const { client, rpc } = createClientMock({
      rpc: () => ({
        data: {
          locationId: LOC_NASA,
          organizationId: ORG_LIQUOR,
          status: "active",
          canDeactivate: false,
          canReactivate: false,
          canArchive: false,
          canRestoreArchive: false,
          blockers: [
            {
              code: "ACTIVE_SERVICE_SESSIONS",
              count: 1,
              capped: false,
              deactivate: "hard",
              archive: "hard",
            },
          ],
          retained: { shifts: 4 },
        },
        error: null,
      }),
    });
    const res = await getLocationLifecycleReadinessAction(
      { organizationId: ORG_LIQUOR, locationId: LOC_NASA },
      client,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.blockers[0].count).toBe(1);
      expect(res.data.retained.shifts).toBe(4);
    }
    expect(rpc.mock.calls[0][0]).toBe("get_location_lifecycle_readiness");
  });

  it("ACT-012: fails closed on a malformed readiness payload", async () => {
    asOwner();
    const { client } = createClientMock({
      rpc: () => ({ data: { nope: true }, error: null }),
    });
    const res = await getLocationLifecycleReadinessAction(
      { organizationId: ORG_LIQUOR, locationId: LOC_NASA },
      client,
    );
    expect(res.ok).toBe(false);
  });

  it("ACT-013: denies readiness to unauthorized callers without an RPC call", async () => {
    vi.mocked(getOverallRole).mockResolvedValue(null);
    vi.mocked(getOrganizationMembership).mockResolvedValue({
      roles: ["server"],
      active: true,
    } as never);
    const { client, rpc } = createClientMock({});
    const res = await getLocationLifecycleReadinessAction(
      { organizationId: ORG_LIQUOR, locationId: LOC_NASA },
      client,
    );
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-014: lists audit history newest-first for authorized callers", async () => {
    asOwner();
    const { client } = createClientMock({
      events: [
        {
          id: 2,
          location_id: LOC_NASA,
          organization_id: ORG_LIQUOR,
          actor_profile_id: ACTOR,
          action: "archive",
          previous_state: "inactive",
          new_state: "archived",
          reason: "Permanently closed",
          changed_at: "2026-03-01T00:00:00Z",
        },
      ],
    });
    const res = await listLocationLifecycleEventsAction(
      { organizationId: ORG_LIQUOR, locationId: LOC_NASA },
      client,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        action: "archive",
        previousState: "inactive",
        newState: "archived",
        reason: "Permanently closed",
      });
    }
  });
});
