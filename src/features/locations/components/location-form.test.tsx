import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocationForm } from "./location-form";
import type { Location } from "@/features/locations/domain/location";

const MOCK_LOCATION: Location = {
  id: "loc-1",
  organizationId: "org-1",
  name: "Webster Branch",
  timeZone: "America/Chicago",
  address: {
    line1: "123 Main St",
    line2: "Ste 100",
    city: "Webster",
    region: "TX",
    postalCode: "77598",
    countryCode: "US",
  },
  coverWeight: 0.25,
  active: true,
  openingLocal: "11:00",
  closingLocal: "23:00",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("LocationForm", () => {
  it("renders creation form with default values", () => {
    render(
      <LocationForm
        mode="create"
        organizationId="org-1"
        organizationName="The Monk's"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Location Name")).toHaveValue("");
    expect(screen.getByLabelText("Organization")).toHaveValue("The Monk's");
    expect(screen.getByLabelText("Street address")).toHaveValue("");
    expect(screen.getByLabelText("Time Zone")).toHaveValue("America/Chicago");
    expect(
      screen.getByRole("button", { name: "Create Location" }),
    ).toBeInTheDocument();
  });

  it("validates required name field and rejects blank or empty string (UI-014)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <LocationForm
        mode="create"
        organizationId="org-1"
        organizationName="The Monk's"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Location" }));

    expect(
      screen.getByText("Location name must be between 1 and 120 characters."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid form with normalized address and timezone (UI-013)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <LocationForm
        mode="create"
        organizationId="org-1"
        organizationName="The Monk's"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Location Name"), "  NASA Branch  ");
    await user.type(
      screen.getByLabelText("Street address"),
      "18100 Upper Bay Rd",
    );
    await user.type(screen.getByLabelText("City"), "Houston");
    await user.type(screen.getByLabelText("State / Region"), "TX");
    await user.type(screen.getByLabelText("Postal Code"), "77058");

    await user.click(screen.getByRole("button", { name: "Create Location" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "NASA Branch",
      timeZone: "America/Chicago",
      address: {
        line1: "18100 Upper Bay Rd",
        city: "Houston",
        region: "TX",
        postalCode: "77058",
        countryCode: "US",
      },
      coverWeight: 0.25,
      openingLocal: "11:00",
      closingLocal: "23:00",
    });
  });

  it("handles duplicate name collision and preserves entered values (UI-016)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      code: "23505",
      error: "Location name already exists in organization",
    });

    render(
      <LocationForm
        mode="create"
        organizationId="org-1"
        organizationName="The Monk's"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Location Name"), "Webster Branch");
    await user.type(screen.getByLabelText("Street address"), "123 Main St");
    await user.click(screen.getByRole("button", { name: "Create Location" }));

    expect(
      screen.getByText(
        "A location with this name already exists in this organization.",
      ),
    ).toBeInTheDocument();
    // Entered fields preserved
    expect(screen.getByLabelText("Street address")).toHaveValue("123 Main St");
  });

  it("hydrates existing data in edit mode and updates permitted fields (UI-018, UI-019)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <LocationForm
        mode="edit"
        organizationId="org-1"
        organizationName="The Monk's"
        initialLocation={MOCK_LOCATION}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Location Name")).toHaveValue(
      "Webster Branch",
    );
    expect(screen.getByLabelText("Street address")).toHaveValue("123 Main St");
    expect(screen.getByLabelText("Apartment / Suite (optional)")).toHaveValue(
      "Ste 100",
    );
    expect(screen.getByLabelText("City")).toHaveValue("Webster");

    const nameInput = screen.getByLabelText("Location Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Webster Downtown");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Webster Downtown",
        timeZone: "America/Chicago",
      }),
    );
  });

  it("calls onCancel when Cancel button is clicked (UI-012)", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <LocationForm
        mode="create"
        organizationId="org-1"
        organizationName="The Monk's"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
