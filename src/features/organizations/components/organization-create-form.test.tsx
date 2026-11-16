import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrganizationAction } from "@/features/organizations/actions/organization-admin-actions";
import { OrganizationCreateForm } from "./organization-create-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/organizations/actions/organization-admin-actions", () => ({
  createOrganizationAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrganizationCreateForm", () => {
  it("generates an editable slug and navigates to saved branch management", async () => {
    const user = userEvent.setup();
    vi.mocked(createOrganizationAction).mockResolvedValue({
      ok: true,
      data: { id: "org-1", name: "Liquor Tap" },
    });
    render(<OrganizationCreateForm />);
    await user.type(screen.getByLabelText("Organization name"), "Liquor Tap");
    expect(screen.getByLabelText("Organization slug")).toHaveValue(
      "liquor-tap",
    );
    await user.clear(screen.getByLabelText("Organization slug"));
    await user.type(
      screen.getByLabelText("Organization slug"),
      "liquor-tap-houston",
    );
    await user.click(
      screen.getByRole("button", { name: "Create Organization" }),
    );
    expect(createOrganizationAction).toHaveBeenCalledWith({
      name: "Liquor Tap",
      slug: "liquor-tap-houston",
    });
    expect(push).toHaveBeenCalledWith(
      "/system-administration/organizations/org-1?created=1",
    );
  });

  it("rejects invalid name and slug before calling the server", async () => {
    const user = userEvent.setup();
    render(<OrganizationCreateForm />);
    await user.click(
      screen.getByRole("button", { name: "Create Organization" }),
    );
    expect(
      screen.getByText(/Organization name must be between/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Use 1–120 lowercase/)).toBeInTheDocument();
    expect(createOrganizationAction).not.toHaveBeenCalled();
  });

  it("keeps entered values on duplicate slug so the owner can choose another", async () => {
    const user = userEvent.setup();
    vi.mocked(createOrganizationAction).mockResolvedValue({
      ok: false,
      error: "An organization with that slug already exists.",
      code: "DUPLICATE_SLUG",
    });
    render(<OrganizationCreateForm />);
    await user.type(screen.getByLabelText("Organization name"), "Liquor Tap");
    await user.click(
      screen.getByRole("button", { name: "Create Organization" }),
    );
    expect(
      await screen.findByText("An organization with that slug already exists."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Liquor Tap",
    );
    expect(screen.getByLabelText("Organization slug")).toHaveValue(
      "liquor-tap",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("blocks a second submission while the first is processing", async () => {
    const user = userEvent.setup();
    let complete!: (value: { ok: false; error: string }) => void;
    vi.mocked(createOrganizationAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    render(<OrganizationCreateForm />);
    await user.type(screen.getByLabelText("Organization name"), "Liquor Tap");
    const form = screen
      .getByRole("button", { name: "Create Organization" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createOrganizationAction).toHaveBeenCalledTimes(1);
    complete({ ok: false, error: "Try again" });
    expect(await screen.findByText("Try again")).toBeInTheDocument();
  });
});
