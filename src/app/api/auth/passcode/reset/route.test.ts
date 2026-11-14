import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: vi.fn(),
}));

vi.mock("@/features/auth/data/passcode-rotation", () => ({
  rotatePasscodeCredential: vi.fn(),
}));

const mockAdmin = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

describe("POST /api/auth/passcode/reset", () => {
  const actorProfileId = "00000000-0000-0000-0000-000000000001";
  const targetProfileId = "00000000-0000-0000-0000-000000000002";
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with 403 when target belongs to multiple organizations and actor is not Overall Owner", async () => {
    const { getCurrentUser } = await import("@/lib/current-user");
    const { getOverallRole } = await import(
      "@/features/auth/data/overall-role"
    );
    const { POST } = await import("./route");

    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: actorProfileId,
      name: "Manager Alice",
      role: "manager",
      designation: "manager",
      organizationId: orgA,
    });

    // Actor has NO overall role (or is just org manager)
    vi.mocked(getOverallRole).mockImplementation(async (userId) => {
      if (userId === actorProfileId) return null;
      if (userId === targetProfileId) return null;
      return null;
    });

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "organization_id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { roles: ["server"] },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              if (col === "profile_id") {
                return {
                  neq: vi.fn().mockResolvedValue({
                    // Target has a membership in Org B as well!
                    data: [{ organization_id: orgB }],
                    error: null,
                  }),
                };
              }
              return {};
            }),
          }),
        };
      }
      return {};
    });

    const request = new Request("http://localhost/api/auth/passcode/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: "org-a",
        targetProfileId,
        reason: "Reset requested by staff",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe(
      "This team member belongs to multiple organizations. Only an Overall administrator can reset their passcode.",
    );
  });

  it("permits reset of a multi-org member when actor IS an Overall Owner", async () => {
    const { getCurrentUser } = await import("@/lib/current-user");
    const { getOverallRole } = await import(
      "@/features/auth/data/overall-role"
    );
    const { rotatePasscodeCredential } = await import(
      "@/features/auth/data/passcode-rotation"
    );
    const { POST } = await import("./route");

    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: actorProfileId,
      name: "Overall Owner Boss",
      role: "owner",
      designation: "owner",
      organizationId: orgA,
    });

    // Actor IS Overall Owner
    vi.mocked(getOverallRole).mockImplementation(async (userId) => {
      if (userId === actorProfileId) return "owner";
      if (userId === targetProfileId) return null;
      return null;
    });

    const mockAuditInserts: unknown[] = [];
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "organization_id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { roles: ["server"] },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              if (col === "profile_id") {
                return {
                  neq: vi.fn().mockResolvedValue({
                    data: [{ organization_id: orgB }],
                    error: null,
                  }),
                };
              }
              return {};
            }),
          }),
        };
      }
      if (table === "audit_events") {
        return {
          insert: vi.fn().mockImplementation((data) => {
            mockAuditInserts.push(data);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    });

    vi.mocked(rotatePasscodeCredential).mockResolvedValue({ ok: true });

    const request = new Request("http://localhost/api/auth/passcode/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: "org-a",
        targetProfileId,
        newPasscode: "9999",
        reason: "Owner administrative override",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.passcode).toBe("9999");
    expect(rotatePasscodeCredential).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({
        organizationId: orgA,
        profileId: targetProfileId,
        newPasscode: "9999",
      }),
    );
    expect(mockAuditInserts.length).toBeGreaterThanOrEqual(1);
  });

  it("permits reset of a strictly single-org member by an authorized Org Manager", async () => {
    const { getCurrentUser } = await import("@/lib/current-user");
    const { getOverallRole } = await import(
      "@/features/auth/data/overall-role"
    );
    const { rotatePasscodeCredential } = await import(
      "@/features/auth/data/passcode-rotation"
    );
    const { POST } = await import("./route");

    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: actorProfileId,
      name: "Manager Bob",
      role: "manager",
      designation: "manager",
      organizationId: orgA,
    });

    vi.mocked(getOverallRole).mockResolvedValue(null);

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "organization_id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { roles: ["server"] },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              if (col === "profile_id") {
                return {
                  neq: vi.fn().mockResolvedValue({
                    // Target has NO other memberships
                    data: [],
                    error: null,
                  }),
                };
              }
              return {};
            }),
          }),
        };
      }
      if (table === "audit_events") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    vi.mocked(rotatePasscodeCredential).mockResolvedValue({ ok: true });

    const request = new Request("http://localhost/api/auth/passcode/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: "org-a",
        targetProfileId,
        newPasscode: "4321",
        reason: "Forgot passcode on shift",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.passcode).toBe("4321");
  });
});
