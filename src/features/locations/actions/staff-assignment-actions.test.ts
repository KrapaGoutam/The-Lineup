import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  applyStaffLocationChangesAction,
  getEmployeeLocationAssignmentsAction,
  getLocationStaffAction,
  listOrganizationStaffAction,
} from "./staff-assignment-actions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ACTOR = "00000000-0000-0000-0000-0000000000a1";
const TARGET = "00000000-0000-0000-0000-0000000000b2";
const ORG_LIQUOR = "11111111-1111-1111-1111-111111111111";
const ORG_MONKS = "22222222-2222-2222-2222-222222222222";
const LOC_NASA = "33333333-3333-3333-3333-333333333331";
const LOC_LEAGUE = "33333333-3333-3333-3333-333333333332";
const LOC_CLOSED = "33333333-3333-3333-3333-333333333333";
const LOC_WEBSTER = "44444444-4444-4444-4444-444444444441"; // Monks

type Filters = Record<string, unknown>;
type TableData = unknown[] | ((filters: Filters) => unknown[]);

function locRow(id: string, org: string, name: string, active = true) {
  return {
    id,
    organization_id: org,
    name,
    time_zone: "America/Chicago",
    address: {},
    cover_weight: 0.25,
    active,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function lmRow(
  id: number,
  profile: string,
  location: string,
  org: string,
  role: string,
  active = true,
) {
  return {
    id,
    location_id: location,
    profile_id: profile,
    role,
    active,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    locations: { organization_id: org },
  };
}

function createClientMock(opts: {
  user?: { id: string } | null;
  overallRole?: string | null;
  tables?: Record<string, TableData>;
  rpc?: { data?: unknown; error?: { message: string; code?: string } | null };
}) {
  const user = opts.user === undefined ? { id: ACTOR } : opts.user;
  const tables = opts.tables ?? {};
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpc?.data ?? [],
    error: opts.rpc?.error ?? null,
  });

  const from = vi.fn((table: string) => {
    const filters: Filters = {};
    const resolve = () => {
      if (table === "overall_roles") {
        return opts.overallRole ? [{ role: opts.overallRole }] : [];
      }
      const data = tables[table] ?? [];
      return typeof data === "function" ? data(filters) : data;
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.range = vi.fn(() => b);
    b.in = vi.fn(() => b);
    b.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return b;
    });
    b.maybeSingle = vi.fn(async () => ({
      data: resolve()[0] ?? null,
      error: null,
    }));
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve({ data: resolve(), error: null }).then(ok, bad);
    return b;
  });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
    from,
    rpc,
  };
  return { client: client as unknown as SupabaseClient<Database>, rpc, from };
}

/** Membership table keyed by (profile_id, organization_id). */
function membershipsTable(
  rows: Array<{
    profile_id: string;
    organization_id: string;
    roles: string[];
    active: boolean;
    display_name?: string;
  }>,
): TableData {
  return (filters) =>
    rows
      .filter(
        (r) =>
          (filters.profile_id === undefined ||
            r.profile_id === filters.profile_id) &&
          (filters.organization_id === undefined ||
            r.organization_id === filters.organization_id),
      )
      .map((r, i) => ({
        id: i + 1,
        created_at: "2026-01-01T00:00:00Z",
        profiles: { display_name: r.display_name ?? "Someone" },
        ...r,
      }));
}

const ORG_LOCATIONS = [
  locRow(LOC_NASA, ORG_LIQUOR, "NASA"),
  locRow(LOC_LEAGUE, ORG_LIQUOR, "League City"),
  locRow(LOC_CLOSED, ORG_LIQUOR, "Closed", false),
];

const ACTOR_GM = {
  profile_id: ACTOR,
  organization_id: ORG_LIQUOR,
  roles: ["general_manager"],
  active: true,
  display_name: "Actor",
};
const TARGET_ACTIVE = {
  profile_id: TARGET,
  organization_id: ORG_LIQUOR,
  roles: ["server"],
  active: true,
  display_name: "Sam",
};

function locationsTable(): TableData {
  return (filters) =>
    ORG_LOCATIONS.filter(
      (l) =>
        (filters.id === undefined || l.id === filters.id) &&
        (filters.organization_id === undefined ||
          l.organization_id === filters.organization_id),
    );
}

const CHANGE = [
  { locationId: LOC_NASA, action: "assign" as const, role: "manager" as const },
];

describe("staff assignment server actions — authorization", () => {
  it("ACT-001: unauthenticated actor is denied", async () => {
    const { client, rpc } = createClientMock({ user: null });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, sessionInvalid: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["ACT-002 Overall Owner", "owner"],
    ["ACT-003 Overall Manager", "manager"],
  ])("%s is permitted", async (_n, overallRole) => {
    const { client, rpc } = createClientMock({
      overallRole,
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([TARGET_ACTIVE]),
      },
      rpc: { data: [lmRow(1, TARGET, LOC_NASA, ORG_LIQUOR, "manager")] },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("ACT-004: Overall Assistant Manager alone is denied", async () => {
    const { client, rpc } = createClientMock({
      overallRole: "assistant_manager",
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([TARGET_ACTIVE]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["ACT-005 Organization Owner", ["owner"]],
    ["ACT-006 Organization General Manager", ["general_manager"]],
  ])("%s is permitted in own organization", async (_n, roles) => {
    const { client, rpc } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([{ ...ACTOR_GM, roles }, TARGET_ACTIVE]),
      },
      rpc: { data: [lmRow(1, TARGET, LOC_NASA, ORG_LIQUOR, "manager")] },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ACT-007 Shift Manager", ["shift_manager"]],
    ["ACT-008 ordinary staff (server)", ["server"]],
    ["host", ["host"]],
  ])("%s is denied", async (_n, roles) => {
    const { client, rpc } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([{ ...ACTOR_GM, roles }, TARGET_ACTIVE]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-009 / SEC-001: manager of another organization is denied", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([
          { ...ACTOR_GM, organization_id: ORG_MONKS },
          TARGET_ACTIVE,
        ]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-010: inactive organization member is denied", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([
          { ...ACTOR_GM, active: false },
          TARGET_ACTIVE,
        ]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("staff assignment server actions — mutation", () => {
  const base = {
    locations: locationsTable(),
  };

  it("ACT-011 / SEC-006: target without active organization membership is denied for assignment", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([
          ACTOR_GM,
          { ...TARGET_ACTIVE, active: false },
        ]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "MEMBERSHIP_REQUIRED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not create an organization membership for a non-member target", async () => {
    const { client, rpc, from } = createClientMock({
      tables: { ...base, memberships: membershipsTable([ACTOR_GM]) },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "NOT_ORGANIZATION_MEMBER" });
    expect(rpc).not.toHaveBeenCalled();
    // The mock builders expose no write methods, so any insert/upsert of a
    // membership would have thrown; only reads occurred.
    expect(from).toHaveBeenCalledWith("memberships");
  });

  it("allows deactivating an assignment of an inactive member (historical cleanup)", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([
          ACTOR_GM,
          { ...TARGET_ACTIVE, active: false },
        ]),
      },
      rpc: { data: [lmRow(1, TARGET, LOC_NASA, ORG_LIQUOR, "staff", false)] },
    });
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [{ locationId: LOC_NASA, action: "deactivate" }],
      },
      client,
    );
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("ACT-012: unknown / foreign location is denied as tenant mismatch", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [{ locationId: LOC_WEBSTER, action: "assign", role: "staff" }],
      },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "TENANT_MISMATCH" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-013 / SEC-011: inactive location is rejected", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [{ locationId: LOC_CLOSED, action: "assign", role: "staff" }],
      },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "LOCATION_INACTIVE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("SEC-005: a role outside the canonical enum is rejected before the RPC", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
      },
    });
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [
          { locationId: LOC_NASA, action: "assign", role: "owner" as never },
        ],
      },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "INVALID_ROLE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-014 / SEC-010: forged actor identity and privilege flags are ignored", async () => {
    const { client, rpc } = createClientMock({
      // Real actor is merely a server in the org.
      tables: {
        ...base,
        memberships: membershipsTable([
          { ...ACTOR_GM, roles: ["server"] },
          TARGET_ACTIVE,
        ]),
      },
    });
    const forged = {
      organizationId: ORG_LIQUOR,
      targetProfileId: TARGET,
      changes: CHANGE,
      actorProfileId: "someone-else",
      isManager: true,
      isOwner: true,
      actorRole: "owner",
      overallRole: "owner",
      authorized: true,
    };
    const res = await applyStaffLocationChangesAction(forged, client);
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ACT-015: calls the existing atomic RPC once with the whole change set", async () => {
    const { client, rpc } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
      },
      rpc: {
        data: [
          lmRow(1, TARGET, LOC_NASA, ORG_LIQUOR, "manager"),
          lmRow(2, TARGET, LOC_LEAGUE, ORG_LIQUOR, "assistant_manager"),
        ],
      },
    });
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [
          { locationId: LOC_NASA, action: "assign", role: "manager" },
          {
            locationId: LOC_LEAGUE,
            action: "assign",
            role: "assistant_manager",
          },
        ],
      },
      client,
    );
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_location_assignment_changes", {
      p_target_profile_id: TARGET,
      p_changes: [
        {
          locationId: LOC_NASA,
          action: "assign",
          role: "manager",
          active: true,
        },
        {
          locationId: LOC_LEAGUE,
          action: "assign",
          role: "assistant_manager",
          active: true,
        },
      ],
    });
    // Payload never carries an actor identity.
    const payload = JSON.stringify(rpc.mock.calls[0][1]);
    expect(payload).not.toContain(ACTOR);
  });

  it("ACT-016 / SEC-012: RPC failure is reported as failure, never success", async () => {
    const { client } = createClientMock({
      tables: {
        ...base,
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
      },
      rpc: {
        error: {
          message: "Unauthorized: caller lacks management role",
          code: "42501",
        },
      },
    });
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: CHANGE },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("empty change set is a no-op without touching the database", async () => {
    const { client, rpc, from } = createClientMock({});
    const res = await applyStaffLocationChangesAction(
      { organizationId: ORG_LIQUOR, targetProfileId: TARGET, changes: [] },
      client,
    );
    expect(res).toEqual({ ok: true, data: [] });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects duplicate location instructions before the RPC", async () => {
    const { client, rpc } = createClientMock({});
    const res = await applyStaffLocationChangesAction(
      {
        organizationId: ORG_LIQUOR,
        targetProfileId: TARGET,
        changes: [
          { locationId: LOC_NASA, action: "assign", role: "staff" },
          { locationId: LOC_NASA, action: "assign", role: "manager" },
        ],
      },
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "DUPLICATE_LOCATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("staff assignment server actions — reads", () => {
  it("ACT-017: roster read requires authority and returns only safe display fields", async () => {
    const denied = createClientMock({
      tables: {
        memberships: membershipsTable([
          { ...ACTOR_GM, roles: ["host"] },
          TARGET_ACTIVE,
        ]),
      },
    });
    expect(
      await listOrganizationStaffAction(ORG_LIQUOR, denied.client),
    ).toMatchObject({ ok: false });

    const allowed = createClientMock({
      tables: { memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]) },
    });
    const res = await listOrganizationStaffAction(ORG_LIQUOR, allowed.client);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.map((m) => m.profileId).sort()).toEqual(
        [ACTOR, TARGET].sort(),
      );
      for (const m of res.data) {
        expect(Object.keys(m).sort()).toEqual([
          "displayName",
          "membershipActive",
          "organizationRoles",
          "profileId",
        ]);
      }
    }
  });

  it("roster includes inactive members so the UI can distinguish them", async () => {
    const { client } = createClientMock({
      tables: {
        memberships: membershipsTable([
          ACTOR_GM,
          { ...TARGET_ACTIVE, active: false },
        ]),
      },
    });
    const res = await listOrganizationStaffAction(ORG_LIQUOR, client);
    expect(
      res.ok && res.data.find((m) => m.profileId === TARGET),
    ).toMatchObject({ membershipActive: false });
  });

  it("location staff read rejects a location from another organization", async () => {
    const { client } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([
          { ...ACTOR_GM, organization_id: ORG_MONKS },
        ]),
      },
    });
    const res = await getLocationStaffAction(ORG_MONKS, LOC_NASA, client);
    expect(res).toMatchObject({ ok: false, code: "TENANT_MISMATCH" });
  });

  it("SEC-001: employee read never returns assignments from other organizations", async () => {
    const { client } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([ACTOR_GM, TARGET_ACTIVE]),
        location_memberships: [
          lmRow(1, TARGET, LOC_NASA, ORG_LIQUOR, "manager"),
          lmRow(2, TARGET, LOC_WEBSTER, ORG_MONKS, "manager"),
        ],
      },
    });
    const res = await getEmployeeLocationAssignmentsAction(
      ORG_LIQUOR,
      TARGET,
      client,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.assignments.map((a) => a.locationId)).toEqual([LOC_NASA]);
    }
  });

  it("employee read rejects a profile that is not an organization member", async () => {
    const { client } = createClientMock({
      tables: {
        locations: locationsTable(),
        memberships: membershipsTable([ACTOR_GM]),
      },
    });
    const res = await getEmployeeLocationAssignmentsAction(
      ORG_LIQUOR,
      TARGET,
      client,
    );
    expect(res).toMatchObject({ ok: false, code: "NOT_ORGANIZATION_MEMBER" });
  });
});
