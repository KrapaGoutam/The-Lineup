import { describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

describe("POST /api/auth/passcode", () => {
  it("returns 400 with 'Enter a valid 4-digit passcode.' when passcode is not 4 digits", async () => {
    const { POST } = await import("./route");

    // Test with 6-digit passcode (verifies stale 6-8 digit message was corrected)
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
});
