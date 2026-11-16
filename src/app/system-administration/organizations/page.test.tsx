import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listOrganizationsForAdministrationAction } from "@/features/organizations/actions/organization-admin-actions";
import OrganizationsPage from "./page";

vi.mock("@/features/organizations/actions/organization-admin-actions", () => ({
  listOrganizationsForAdministrationAction: vi.fn(),
}));
vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/organizations/components/organization-create-form", () => ({
  OrganizationCreateForm: () => <div data-testid="create-form" />,
}));

beforeEach(() => vi.clearAllMocks());

describe("OrganizationsPage", () => {
  it("shows authorized organizations, branch counts, and management destinations", async () => {
    vi.mocked(listOrganizationsForAdministrationAction).mockResolvedValue({
      ok: true,
      data: [
        { id: "org-1", name: "Liquor Tap", slug: "liquor-tap", branchCount: 2 },
      ],
    });
    render(await OrganizationsPage());
    expect(
      screen.getByRole("heading", { name: "Organizations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Liquor Tap")).toBeInTheDocument();
    expect(screen.getByText("liquor-tap")).toBeInTheDocument();
    expect(screen.getByText("2 branches")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage Liquor Tap" }),
    ).toHaveAttribute("href", "/system-administration/organizations/org-1");
  });

  it("does not render creation controls to an unauthorized user", async () => {
    vi.mocked(listOrganizationsForAdministrationAction).mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
      error: "Overall Owner authority is required.",
    });
    render(await OrganizationsPage());
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("create-form")).not.toBeInTheDocument();
  });
});
