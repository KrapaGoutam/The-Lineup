import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireLiveSession: vi.fn(),
  listContexts: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/context/data/active-context", () => ({
  listCurrentEligibleContextsWithAccess: mocks.listContexts,
}));

import type { ResolverCapability } from "@/features/auth/domain/access-resolver";

import { loadReportingAuthorities } from "./reporting-authority";

const MANAGER: ResolverCapability[] = [
  "org:member",
  "location:access",
  "location:operate",
  "location:manage",
  "location:assistant_manage",
];
const MEMBER: ResolverCapability[] = [
  "org:member",
  "location:access",
  "location:operate",
];

function ctx(
  locationId: string,
  capabilities: ResolverCapability[],
  org = "org-tap",
) {
  return {
    organizationId: org,
    organizationSlug: org,
    organizationName: org === "org-tap" ? "Liquor Tap" : "The Monk's",
    locationId,
    locationName: locationId,
    timeZone: "America/Chicago",
    access: { allowed: true, capabilities },
  };
}

function client(opts: {
  rows?: string[];
  manage?: Record<string, boolean | "error">;
  rowsError?: boolean;
}) {
  return {
    from: () => ({
      select: () => ({
        in: async () =>
          opts.rowsError
            ? { data: null, error: { code: "x" } }
            : {
                data: (opts.rows ?? []).map((id) => ({
                  id,
                  attendance_mode: "internal_the_lineup",
                  address: null,
                })),
                error: null,
              },
      }),
    }),
    rpc: async (_name: string, args: { p_location_id: string }) => {
      const v = opts.manage?.[args.p_location_id];
      return v === "error"
        ? { data: null, error: { code: "x" } }
        : { data: v === true, error: null };
    },
  } as never;
}

const allUsable = async () => true;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLiveSession.mockResolvedValue(null);
});

describe("loadReportingAuthorities — fail closed", () => {
  it("a dead session fails before any context is read", async () => {
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    const res = await loadReportingAuthorities(client({}), allUsable);
    expect(res).toMatchObject({ ok: false, sessionInvalid: true });
    expect(mocks.listContexts).not.toHaveBeenCalled();
  });

  it("an unauthenticated resolver result is a session failure", async () => {
    mocks.listContexts.mockResolvedValue({ status: "unauthenticated" });
    expect(await loadReportingAuthorities(client({}), allUsable)).toMatchObject(
      { ok: false, sessionInvalid: true },
    );
  });

  it("an unreadable context list is an ERROR, never an empty-but-successful list", async () => {
    mocks.listContexts.mockResolvedValue({ status: "error", reason: "x" });
    const res = await loadReportingAuthorities(client({}), allUsable);
    expect(res.ok).toBe(false);
  });

  it("an unreadable branch row is an error (not silently authorized)", async () => {
    mocks.listContexts.mockResolvedValue({
      status: "ok",
      profileId: "me",
      contexts: [ctx("l1", MANAGER)],
    });
    const res = await loadReportingAuthorities(
      client({ rowsError: true }),
      allUsable,
    );
    expect(res.ok).toBe(false);
  });

  it("a branch whose row is not visible gets no authority", async () => {
    mocks.listContexts.mockResolvedValue({
      status: "ok",
      profileId: "me",
      contexts: [ctx("l1", MANAGER)],
    });
    const res = await loadReportingAuthorities(
      client({ rows: [], manage: { l1: true } }),
      allUsable,
    );
    expect(res.ok && res.authorities).toEqual([]);
  });
});

describe("loadReportingAuthorities — authority combination", () => {
  beforeEach(() => {
    mocks.listContexts.mockResolvedValue({
      status: "ok",
      profileId: "me",
      contexts: [
        ctx("l1", MANAGER),
        ctx("l2", MEMBER),
        ctx("l3", MANAGER, "org-monks"),
      ],
    });
  });

  it("manager → all, member → self, per branch, with the database verdict deciding", async () => {
    const res = await loadReportingAuthorities(
      client({
        rows: ["l1", "l2", "l3"],
        manage: { l1: true, l2: false, l3: true },
      }),
      allUsable,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const by = Object.fromEntries(
      res.authorities.map((a) => [a.locationId, a]),
    );
    expect(by.l1).toMatchObject({ attendance: "all", payroll: "all" });
    expect(by.l2).toMatchObject({ attendance: "self", payroll: "self" });
    expect(by.l3).toMatchObject({ attendance: "all", payroll: "all" });
  });

  it("a revoked database verdict downgrades a stale resolver manager to self", async () => {
    const res = await loadReportingAuthorities(
      client({ rows: ["l1"], manage: { l1: false } }),
      allUsable,
    );
    expect(res.ok && res.authorities[0]).toMatchObject({
      attendance: "self",
      payroll: "self",
    });
  });

  it("a failing database call fails closed (self, never all)", async () => {
    const res = await loadReportingAuthorities(
      client({ rows: ["l1"], manage: { l1: "error" } }),
      allUsable,
    );
    expect(res.ok && res.authorities[0]!.attendance).toBe("self");
  });

  it("module verdicts are per branch and per module; a branch with both off is dropped", async () => {
    const usable = vi.fn(async (module: string, _o: string, loc: string) => {
      if (loc === "l1") return module === "attendance"; // payroll off at l1
      if (loc === "l2") return false; // both off at l2
      return true;
    });
    const res = await loadReportingAuthorities(
      client({
        rows: ["l1", "l2", "l3"],
        manage: { l1: true, l2: true, l3: true },
      }),
      usable,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.authorities.map((a) => a.locationId)).toEqual(["l1", "l3"]);
    expect(res.authorities[0]).toMatchObject({
      attendance: "all",
      payroll: "none",
    });
    // The branch count the reader uses for the sole-branch rule includes the dropped branch.
    expect(res.orgLocationCounts).toEqual({ "org-tap": 2, "org-monks": 1 });
  });

  it("a module verdict that throws is treated by the caller's injected function (fails closed there)", async () => {
    const res = await loadReportingAuthorities(
      client({ rows: ["l1"], manage: { l1: true } }),
      async () => false,
    );
    expect(res.ok && res.authorities).toEqual([]);
  });
});
