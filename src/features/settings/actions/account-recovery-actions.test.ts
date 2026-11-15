import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ current: vi.fn(), roster: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: mocks.current }));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: mocks.roster,
}));
import { loadAccountRecoveryAction } from "./account-recovery-actions";
describe("recovery authority without operational location", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses the existing verified actor and filters active allowed targets", async () => {
    mocks.current.mockResolvedValue({
      organizationId: "verified",
      designation: "manager",
    });
    mocks.roster.mockResolvedValue([
      { id: "allowed", designation: "staff" },
      { id: "denied", designation: "manager" },
      { id: "inactive", designation: "staff", active: false },
    ]);
    const result = await loadAccountRecoveryAction("untrusted-slug");
    expect(mocks.current).toHaveBeenCalledWith("untrusted-slug");
    expect(mocks.roster).toHaveBeenCalledWith("verified");
    expect(result.ok && result.team.map((member) => member.id)).toEqual([
      "allowed",
    ]);
  });
  it.each(["staff", "assistant_manager"])(
    "%s cannot load recovery targets",
    async (designation) => {
      mocks.current.mockResolvedValue({ organizationId: "org", designation });
      const result = await loadAccountRecoveryAction("org");
      expect(result.ok && result.team).toEqual([]);
      expect(mocks.roster).not.toHaveBeenCalled();
    },
  );
  it("fails closed without a verified actor", async () => {
    mocks.current.mockResolvedValue(null);
    expect(await loadAccountRecoveryAction("org")).toEqual({ ok: false });
    expect(mocks.roster).not.toHaveBeenCalled();
  });
});
