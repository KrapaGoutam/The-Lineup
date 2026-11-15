import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deactivateMember,
  reactivateMember,
} from "@/features/auth/data/member-deactivation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { POST as deactivate } from "./deactivate/route";
import { POST as reactivate } from "./reactivate/route";

vi.mock("@/features/auth/data/member-deactivation", () => ({
  deactivateMember: vi.fn(),
  reactivateMember: vi.fn(),
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const organizationId = "00000000-0000-4000-8000-000000000001";
const targetProfileId = "00000000-0000-4000-8000-000000000002";
const client = { rpc: vi.fn() };
const body = {
  restaurantSlug: "sample",
  targetProfileId,
  reason: "Manager request",
};

function request() {
  return new Request("http://localhost/api/team/transition", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("Team transition route status mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: "00000000-0000-4000-8000-000000000003",
      organizationId,
    } as Awaited<ReturnType<typeof getCurrentUser>>);
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );
  });

  it.each([
    ["28000", 401],
    ["42501", 403],
    ["P0002", 404],
    ["22023", 400],
    ["P0001", 500],
  ])("maps database error %s to HTTP %i", async (code, status) => {
    vi.mocked(deactivateMember).mockResolvedValue({ ok: false, code });
    const response = await deactivate(request());
    expect(response.status).toBe(status);
    expect((await response.json()).sessionInvalid).toBe(
      status === 401 ? true : undefined,
    );
    expect(deactivateMember).toHaveBeenCalledWith(client, {
      organizationId,
      profileId: targetProfileId,
      reason: body.reason,
    });
  });

  it("reports an already active membership as a conflict", async () => {
    vi.mocked(reactivateMember).mockResolvedValue({
      ok: true,
      outcome: "already_in_state",
    });
    expect((await reactivate(request())).status).toBe(409);
  });

  it("reports reactivation success only after the RPC changes state", async () => {
    vi.mocked(reactivateMember).mockResolvedValue({
      ok: true,
      outcome: "changed",
    });
    const response = await reactivate(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
