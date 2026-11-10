import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCurrentActiveContext: vi.fn(),
  getEntryUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: mocks.resolveCurrentActiveContext,
}));
vi.mock("@/lib/current-user", () => ({ getEntryUser: mocks.getEntryUser }));

import { getAttendanceEntryUser } from "./attendance-actor";

const PROFILE = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";

function resolved(allowed: boolean, profileId = PROFILE) {
  return {
    status: "resolved",
    context: { profileId, organizationId: ORG, access: { allowed } },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getAttendanceEntryUser", () => {
  it("asks the canonical resolver for exactly the route slug", async () => {
    mocks.resolveCurrentActiveContext.mockResolvedValue(resolved(true));
    mocks.getEntryUser.mockResolvedValue({ profileId: PROFILE });
    await getAttendanceEntryUser("my-org");
    expect(mocks.resolveCurrentActiveContext).toHaveBeenCalledWith({
      routeSlug: "my-org",
    });
  });

  it("returns the hydrated user only when access is allowed", async () => {
    mocks.resolveCurrentActiveContext.mockResolvedValue(resolved(true));
    mocks.getEntryUser.mockResolvedValue({
      profileId: PROFILE,
      organizationId: ORG,
    });
    expect(await getAttendanceEntryUser("my-org")).toEqual({
      profileId: PROFILE,
      organizationId: ORG,
    });
  });

  it("returns null (and never hydrates) when the context denies access", async () => {
    mocks.resolveCurrentActiveContext.mockResolvedValue(resolved(false));
    expect(await getAttendanceEntryUser("foreign-org")).toBeNull();
    expect(mocks.getEntryUser).not.toHaveBeenCalled();
  });

  it("returns null for any unresolved status", async () => {
    for (const status of ["unauthenticated", "no_access", "error"]) {
      mocks.resolveCurrentActiveContext.mockResolvedValue({ status });
      expect(await getAttendanceEntryUser("x")).toBeNull();
    }
    expect(mocks.getEntryUser).not.toHaveBeenCalled();
  });

  it("refuses a hydrated user whose profile differs from the verified context", async () => {
    mocks.resolveCurrentActiveContext.mockResolvedValue(resolved(true));
    mocks.getEntryUser.mockResolvedValue({
      profileId: "99999999-9999-4999-8999-999999999999",
    });
    expect(await getAttendanceEntryUser("my-org")).toBeNull();
  });

  it("returns null when hydration finds no profile", async () => {
    mocks.resolveCurrentActiveContext.mockResolvedValue(resolved(true));
    mocks.getEntryUser.mockResolvedValue(null);
    expect(await getAttendanceEntryUser("my-org")).toBeNull();
  });
});
