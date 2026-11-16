import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOverallRole } from "@/features/auth/data/overall-role";
import { listUserOrganizations } from "@/features/organizations/data/organization-reader";
import { provisionNewOrganization } from "@/features/organizations/data/organization-mutation";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import {
  createOrganizationAction,
  getSystemAdministrationAccessAction,
  listOrganizationsForAdministrationAction,
} from "./organization-admin-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/data/overall-role", () => ({
  getOverallRole: vi.fn(),
}));
vi.mock("@/features/organizations/data/organization-reader", () => ({
  listUserOrganizations: vi.fn(),
}));
vi.mock("@/features/organizations/data/organization-mutation", () => ({
  provisionNewOrganization: vi.fn(),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const org = {
  id: "org-1",
  name: "Liquor Tap",
  slug: "liquor-tap",
  createdBy: "owner-1",
  settings: {},
  createdAt: "2026-11-16T00:00:00Z",
  updatedAt: "2026-11-16T00:00:00Z",
};

const countQuery = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => countQuery()),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ error: null, count: 1 }),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(requireLiveSession).mockResolvedValue(null);
  vi.mocked(getOverallRole).mockResolvedValue("owner");
  vi.mocked(listUserOrganizations).mockResolvedValue([org]);
  countQuery.mockResolvedValue({ count: 2, error: null });
  vi.mocked(provisionNewOrganization).mockResolvedValue({
    success: true,
    data: org,
  });
});

describe("System Administration actions", () => {
  it("lists authorized organizations with branch counts", async () => {
    expect(await listOrganizationsForAdministrationAction()).toEqual({
      ok: true,
      data: [
        { id: "org-1", name: "Liquor Tap", slug: "liquor-tap", branchCount: 2 },
      ],
    });
    expect(from).toHaveBeenCalledWith("locations");
  });

  it("allows a live Overall Owner to create using the existing atomic mutation", async () => {
    expect(
      await createOrganizationAction({
        name: "Liquor Tap",
        slug: "liquor-tap",
      }),
    ).toEqual({
      ok: true,
      data: { id: "org-1", name: "Liquor Tap" },
    });
    expect(provisionNewOrganization).toHaveBeenCalledWith(
      { name: "Liquor Tap", slug: "liquor-tap" },
      expect.any(Object),
    );
  });

  it("denies Overall Manager and never invokes provisioning", async () => {
    vi.mocked(getOverallRole).mockResolvedValue("manager");
    const result = await createOrganizationAction({
      name: "Other",
      slug: "other",
    });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(provisionNewOrganization).not.toHaveBeenCalled();
    expect(await getSystemAdministrationAccessAction()).toEqual({
      ok: true,
      data: false,
    });
  });

  it("denies an invalid live session", async () => {
    vi.mocked(requireLiveSession).mockResolvedValue({
      ok: false,
      error: "Expired",
      sessionInvalid: true,
    });
    expect(
      await createOrganizationAction({ name: "Other", slug: "other" }),
    ).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
    expect(provisionNewOrganization).not.toHaveBeenCalled();
  });

  it("preserves duplicate-slug feedback from the mutation", async () => {
    vi.mocked(provisionNewOrganization).mockResolvedValue({
      success: false,
      error: "An organization with that slug already exists.",
      code: "DUPLICATE_SLUG",
    });
    expect(
      await createOrganizationAction({
        name: "Liquor Tap",
        slug: "liquor-tap",
      }),
    ).toMatchObject({
      ok: false,
      code: "DUPLICATE_SLUG",
    });
  });
});
