import { describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

const mockSignOut = vi.fn(async () => ({}));
const mockVerifyPasscode = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "org-1", slug: "test-slug" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "passcode_credentials") {
        type CredChain = {
          eq: () => CredChain;
          maybeSingle: () => Promise<{
            data: {
              id: string;
              organization_id: string;
              profile_id: string;
              synthetic_email: string;
              active: boolean;
            } | null;
            error: null;
          }>;
        };
        const credChain: CredChain = {
          eq: () => credChain,
          maybeSingle: async () => ({
            data: {
              id: "cred-1",
              organization_id: "org-1",
              profile_id: "expected-profile-id",
              synthetic_email: "test@passcode.internal",
              active: true,
            },
            error: null,
          }),
        };
        return {
          select: () => credChain,
        };
      }
      if (table === "passcode_login_attempts") {
        type AttemptsChain = {
          eq: () => AttemptsChain;
          gte: () => Promise<{ count: number; error: null }>;
        };
        const attemptsChain: AttemptsChain = {
          eq: () => attemptsChain,
          gte: async () => ({ count: 0, error: null }),
        };
        return {
          insert: async () => ({ error: null }),
          select: () => attemptsChain,
        };
      }
      if (table === "passcode_lockout_resets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signOut: mockSignOut },
  }),
}));

vi.mock("@/features/auth/data/passcode-verify", () => ({
  verifyPasscode: (...args: unknown[]) => mockVerifyPasscode(...args),
  migrateLegacyAuthPassword: vi.fn(),
}));

describe("POST /api/auth/passcode", () => {
  it("returns 400 with 'Enter a valid 4-digit passcode.' when passcode is not 4 digits", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/auth/passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: "test-slug",
        passcode: "123456",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Enter a valid 4-digit passcode.");
  });

  it("returns 400 when restaurantSlug is missing", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/auth/passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passcode: "1234",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Enter a valid 4-digit passcode.");
  });

  it("fails closed with 401 and signs out when authenticated identity does not match expected credential profile_id (F-2)", async () => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
    mockVerifyPasscode.mockResolvedValueOnce({
      ok: true,
      verifiedVia: "person",
      session: {
        user: { id: "mismatched-profile-id" },
        access_token: "fake-token",
      },
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/auth/passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: "test-slug",
        passcode: "1234",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Passcode not recognized.");
    expect(mockSignOut).toHaveBeenCalled();
  });
});
