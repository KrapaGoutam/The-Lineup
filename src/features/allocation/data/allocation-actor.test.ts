import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), hydrate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: mocks.resolve,
}));
vi.mock("@/lib/current-user", () => ({ getEntryUser: mocks.hydrate }));
import { getAllocationActor } from "./allocation-actor";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hydrate.mockResolvedValue({
    profileId: "real-actor",
    organizationId: "verified-org",
    name: "Operator",
    designation: "owner",
    role: "owner",
  });
});
describe("Allocation actor hydration", () => {
  it.each(["owner", "manager", "assistant_manager", "staff"])(
    "uses canonical effective %s rather than membership display designation",
    async (effectiveLevel) => {
      mocks.resolve.mockResolvedValue({
        status: "resolved",
        context: {
          profileId: "real-actor",
          organizationId: "verified-org",
          locationId: "verified-location",
          access: {
            allowed: true,
            capabilities: ["location:operate"],
            effectiveLevel,
          },
        },
      });
      const actor = await getAllocationActor("requested-slug");
      expect(mocks.resolve).toHaveBeenCalledWith({
        routeSlug: "requested-slug",
      });
      if (!actor || "contextStale" in actor)
        throw new Error("Expected an authorized actor");
      expect(actor.profileId).toBe("real-actor");
      expect(actor.designation).toBe(effectiveLevel);
      expect(actor.role).toBe(
        effectiveLevel === "owner"
          ? "owner"
          : effectiveLevel === "staff"
            ? "server"
            : "manager",
      );
    },
  );
  it.each([
    "unauthenticated",
    "invalid_context",
    "selection_required",
    "error",
  ])("fails closed on %s before display hydration", async (status) => {
    mocks.resolve.mockResolvedValue({ status });
    expect(await getAllocationActor("slug")).toEqual(
      status === "unauthenticated" ? null : { contextStale: true },
    );
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
  it("refuses context without operational capability", async () => {
    mocks.resolve.mockResolvedValue({
      status: "resolved",
      context: {
        access: {
          allowed: true,
          capabilities: ["location:access"],
          effectiveLevel: "manager",
        },
      },
    });
    expect(await getAllocationActor("slug")).toEqual({ contextStale: true });
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
  it("refuses hydration for a different authenticated profile", async () => {
    mocks.resolve.mockResolvedValue({
      status: "resolved",
      context: {
        profileId: "other",
        access: {
          allowed: true,
          capabilities: ["location:operate"],
          effectiveLevel: "manager",
        },
      },
    });
    expect(await getAllocationActor("slug")).toBeNull();
  });
});
