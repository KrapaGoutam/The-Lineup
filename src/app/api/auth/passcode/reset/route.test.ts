import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: vi.fn(),
}));
vi.mock("@/features/auth/data/global-pin", () => ({
  rotateGlobalPersonalPin: vi.fn(),
}));

const targetMembership = vi.fn();
const otherMemberships = vi.fn();
const targetOverallRole = vi.fn();
const auditInsert = vi.fn();
const mockAdmin = { from: vi.fn() };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdmin }));

const actorProfileId = "00000000-0000-0000-0000-000000000001";
const targetProfileId = "00000000-0000-0000-0000-000000000002";
const orgA = "11111111-1111-1111-1111-111111111111";
const orgB = "22222222-2222-2222-2222-222222222222";

function request() {
  return new Request("http://localhost/api/auth/passcode/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug: "org-a",
      targetProfileId,
      newPasscode: "4321",
      reason: "Requested by staff",
    }),
  });
}

async function actor(overallOwner = false) {
  const { getCurrentUser } = await import("@/lib/current-user");
  const { getOverallRole } = await import("@/features/auth/data/overall-role");
  vi.mocked(getCurrentUser).mockResolvedValue({
    profileId: actorProfileId,
    name: overallOwner ? "Overall Owner" : "Manager",
    role: overallOwner ? "owner" : "manager",
    designation: overallOwner ? "owner" : "manager",
    organizationId: orgA,
  });
  vi.mocked(getOverallRole).mockResolvedValue(overallOwner ? "owner" : null);
}

describe("POST /api/auth/passcode/reset sensitive-action hold", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    targetMembership.mockResolvedValue({
      data: { roles: ["server"] },
      error: null,
    });
    otherMemberships.mockResolvedValue({ data: [], error: null });
    targetOverallRole.mockResolvedValue({ data: null, error: null });
    auditInsert.mockResolvedValue({ error: null });
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === "memberships")
        return {
          select: () => ({
            eq: (column: string) =>
              column === "organization_id"
                ? {
                    eq: () => ({
                      eq: () => ({ maybeSingle: targetMembership }),
                    }),
                  }
                : { neq: otherMemberships },
          }),
        };
      if (table === "overall_roles")
        return {
          select: () => ({ eq: () => ({ maybeSingle: targetOverallRole }) }),
        };
      if (table === "audit_events") return { insert: auditInsert };
      return {};
    });
    const { rotateGlobalPersonalPin } = await import(
      "@/features/auth/data/global-pin"
    );
    vi.mocked(rotateGlobalPersonalPin).mockResolvedValue({ ok: true });
  });

  it("denies multi-organization recovery to a manager", async () => {
    await actor();
    otherMemberships.mockResolvedValue({
      data: [{ organization_id: orgB }],
      error: null,
    });
    const { POST } = await import("./route");
    const { rotateGlobalPersonalPin } = await import(
      "@/features/auth/data/global-pin"
    );
    expect((await POST(request())).status).toBe(403);
    expect(rotateGlobalPersonalPin).not.toHaveBeenCalled();
  });

  it("denies multi-organization recovery even to an Overall Owner", async () => {
    await actor(true);
    otherMemberships.mockResolvedValue({
      data: [{ organization_id: orgB }],
      error: null,
    });
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Privileged credential recovery is temporarily held.",
    );
  });

  it("denies recovery of an Overall-role holder in one organization", async () => {
    await actor(true);
    targetOverallRole.mockResolvedValue({
      data: { role: "manager" },
      error: null,
    });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(403);
  });

  it("denies recovery of an Organization Owner in one organization", async () => {
    await actor(true);
    targetMembership.mockResolvedValue({
      data: { roles: ["owner"] },
      error: null,
    });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(403);
  });

  it("fails closed when a sensitive lookup fails", async () => {
    await actor(true);
    const { POST } = await import("./route");
    targetOverallRole.mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });
    expect((await POST(request())).status).toBe(503);
    otherMemberships.mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });
    expect((await POST(request())).status).toBe(503);
  });

  it("preserves authorized same-organization staff recovery", async () => {
    await actor();
    const { POST } = await import("./route");
    const { rotateGlobalPersonalPin } = await import(
      "@/features/auth/data/global-pin"
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).passcode).toBe("4321");
    expect(rotateGlobalPersonalPin).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({
        organizationId: orgA,
        profileId: targetProfileId,
        newPasscode: "4321",
      }),
    );
    expect(auditInsert).toHaveBeenCalled();
  });
});
