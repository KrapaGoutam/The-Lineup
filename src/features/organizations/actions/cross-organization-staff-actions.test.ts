import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOverallRole } from "@/features/auth/data/overall-role";
import { reactivateMember } from "@/features/auth/data/member-deactivation";
import { listOrganizationStaffAction } from "@/features/locations/actions/staff-assignment-actions";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import {
  addExistingEmployeeAction,
  listExistingEmployeesAction,
} from "./cross-organization-staff-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: vi.fn(),
}));
vi.mock("@/features/auth/data/member-deactivation", () => ({
  reactivateMember: vi.fn(),
}));
vi.mock("@/features/locations/actions/staff-assignment-actions", () => ({
  listOrganizationStaffAction: vi.fn(),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const sourceId = "11111111-1111-4111-8111-111111111111";
const destinationId = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const sourceMember = {
  profileId,
  displayName: "Sam",
  organizationRoles: ["host"],
  membershipActive: true,
};
const rpc = vi.fn();
let orgRows = [{ id: sourceId }, { id: destinationId }];
const client = {
  auth: {
    getUser: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "owner" } }, error: null }),
  },
  from: vi.fn(() => ({
    select: () => ({
      in: () => Promise.resolve({ data: orgRows, error: null }),
    }),
  })),
  rpc,
};

const input = {
  sourceOrganizationId: sourceId,
  destinationOrganizationId: destinationId,
  profileId,
  reason: "New branch staffing",
};

beforeEach(() => {
  vi.clearAllMocks();
  orgRows = [{ id: sourceId }, { id: destinationId }];
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  vi.mocked(requireLiveSession).mockResolvedValue(null);
  vi.mocked(getOverallRole).mockResolvedValue("owner");
  vi.mocked(listOrganizationStaffAction).mockImplementation(async (id) => ({
    ok: true,
    data: id === sourceId ? [sourceMember] : [],
  }));
  vi.mocked(reactivateMember).mockResolvedValue({
    ok: true,
    outcome: "changed",
  });
  rpc.mockResolvedValue({
    data: { outcome: "added", membership_active: true },
    error: null,
  });
});

describe("cross-organization staff linking", () => {
  it("lets an Overall Owner discover only active source staff and labels destination state", async () => {
    expect(await listExistingEmployeesAction(input)).toEqual({
      ok: true,
      data: [{ ...sourceMember, destinationStatus: "absent" }],
    });
    expect(listOrganizationStaffAction).toHaveBeenCalledWith(sourceId, client);
    expect(listOrganizationStaffAction).toHaveBeenCalledWith(
      destinationId,
      client,
    );
  });

  it("denies non-owners and expired sessions before any roster read or write", async () => {
    vi.mocked(getOverallRole).mockResolvedValue("manager");
    expect(await listExistingEmployeesAction(input)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(listOrganizationStaffAction).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    vi.mocked(requireLiveSession).mockResolvedValue({
      ok: false,
      error: "Expired",
      sessionInvalid: true,
    });
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("uses the same profile and only the audited Server-role RPC", async () => {
    expect(await addExistingEmployeeAction(input)).toEqual({
      ok: true,
      data: { profileId, outcome: "added" },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("team_add_member", {
      p_organization_id: destinationId,
      p_target_profile_id: profileId,
      p_roles: ["server"],
      p_reason: input.reason,
    });
    expect(client.from).not.toHaveBeenCalledWith("profiles");
    expect(client.from).not.toHaveBeenCalledWith("memberships");
  });

  it("rejects forged source profile, invalid reason and invalid destination without RPC", async () => {
    expect(
      await addExistingEmployeeAction({
        ...input,
        profileId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toMatchObject({ ok: false, code: "EMPLOYEE_NOT_FOUND" });
    expect(
      await addExistingEmployeeAction({ ...input, reason: "x" }),
    ).toMatchObject({ ok: false, code: "INVALID_REASON" });
    expect(
      await addExistingEmployeeAction({
        ...input,
        destinationOrganizationId: sourceId,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_ORGANIZATION" });
    orgRows = [{ id: sourceId }];
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "INVALID_ORGANIZATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never treats source roster failure as an empty roster", async () => {
    vi.mocked(listOrganizationStaffAction).mockResolvedValue({
      ok: false,
      error: "Denied",
    });
    expect(await listExistingEmployeesAction(input)).toMatchObject({
      ok: false,
      code: "SOURCE_ROSTER_FAILED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not duplicate active destination members", async () => {
    vi.mocked(listOrganizationStaffAction).mockImplementation(async (id) => ({
      ok: true,
      data:
        id === sourceId
          ? [sourceMember]
          : [{ ...sourceMember, membershipActive: true }],
    }));
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "ALREADY_ACTIVE",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires explicit reactivation of inactive membership and reuses its audited RPC", async () => {
    vi.mocked(listOrganizationStaffAction).mockImplementation(async (id) => ({
      ok: true,
      data:
        id === sourceId
          ? [sourceMember]
          : [{ ...sourceMember, membershipActive: false }],
    }));
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "INACTIVE_MEMBERSHIP",
    });
    expect(reactivateMember).not.toHaveBeenCalled();
    expect(
      await addExistingEmployeeAction({ ...input, reactivate: true }),
    ).toEqual({ ok: true, data: { profileId, outcome: "reactivated" } });
    expect(reactivateMember).toHaveBeenCalledWith(client, {
      organizationId: destinationId,
      profileId,
      reason: input.reason,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a concurrent duplicate without attempting another mutation", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect(await addExistingEmployeeAction(input)).toMatchObject({
      ok: false,
      code: "ALREADY_EXISTS",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
