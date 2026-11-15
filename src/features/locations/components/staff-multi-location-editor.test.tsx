import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import { StaffMultiLocationEditor } from "./staff-multi-location-editor";

const MEMBER = {
  profileId: "john",
  displayName: "John",
  organizationRoles: ["general_manager"],
  membershipActive: true,
};

const LOCATIONS = [
  { id: "nasa", name: "NASA", active: true },
  { id: "league", name: "League City", active: true },
  { id: "clear", name: "Clear Lake", active: true },
  { id: "closed", name: "Old Branch", active: false },
];

const BASELINE: LocationRoleAssignment[] = [
  {
    id: 1,
    profileId: "john",
    locationId: "nasa",
    role: "manager",
    active: true,
  },
  {
    id: 2,
    profileId: "john",
    locationId: "league",
    role: "assistant_manager",
    active: true,
  },
  {
    id: 3,
    profileId: "john",
    locationId: "clear",
    role: "staff",
    active: false,
  },
];

function setup(
  overrides: Partial<
    React.ComponentProps<typeof StaffMultiLocationEditor>
  > = {},
) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onCancel = vi.fn();
  render(
    <StaffMultiLocationEditor
      member={MEMBER}
      locations={LOCATIONS}
      baseline={BASELINE}
      onSave={onSave}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSave, onCancel };
}

const roleSelect = (name: RegExp) => screen.getByLabelText(name);

describe("StaffMultiLocationEditor", () => {
  it("UI-014: shows independent roles per location", () => {
    setup();
    expect(roleSelect(/Location role at NASA/)).toHaveValue("manager");
    expect(roleSelect(/Location role at League City/)).toHaveValue(
      "assistant_manager",
    );
    expect(screen.getByLabelText("Clear Lake")).not.toBeChecked();
  });

  it("UI-010: role selector offers only the three canonical roles", () => {
    setup();
    const select = roleSelect(/Location role at NASA/);
    const values = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["manager", "assistant_manager", "staff"]);
  });

  it("disables Save until there is a real change (UI-018 baseline)", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Save Assignments" }),
    ).toBeDisabled();
  });

  it("UI-011/UI-015: changing a role shows pending state and submits ONE change set with only changed locations", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    expect(screen.getByTestId("pending-changes")).toHaveTextContent(
      "Change role at NASA to Staff",
    );

    await user.click(screen.getByRole("button", { name: "Save Assignments" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([
      { locationId: "nasa", action: "update", role: "staff", active: true },
    ]);
  });

  it("assigns a new location and reactivates an inactive one in one atomic submission", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.click(screen.getByLabelText("Clear Lake")); // inactive → reactivate
    await user.selectOptions(
      roleSelect(/Location role at Clear Lake/),
      "manager",
    );
    await user.click(screen.getByRole("button", { name: "Save Assignments" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([
      {
        locationId: "clear",
        action: "reactivate",
        role: "manager",
        active: true,
      },
    ]);
  });

  it("requires confirmation before deactivating, with the spec'd message", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.click(screen.getByLabelText("League City"));
    await user.click(screen.getByRole("button", { name: "Save Assignments" }));

    expect(onSave).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      /Remove this employee's assigned access to League City\? Their organization membership and assignments to other locations will remain unchanged\./,
    );

    await user.click(screen.getByRole("button", { name: "Confirm and Save" }));
    expect(onSave).toHaveBeenCalledWith([
      {
        locationId: "league",
        action: "deactivate",
        role: "assistant_manager",
        active: false,
      },
    ]);
  });

  it("UI-016/AC-026: failed save preserves pending changes and shows the error", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Unauthorized: not allowed" });
    setup({ onSave });

    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    await user.click(screen.getByRole("button", { name: "Save Assignments" }));

    expect(
      await screen.findByText("Unauthorized: not allowed"),
    ).toBeInTheDocument();
    expect(roleSelect(/Location role at NASA/)).toHaveValue("staff");
    expect(screen.getByTestId("pending-changes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Assignments" }),
    ).toBeEnabled();
  });

  it("preserves pending changes when the save throws a network error", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    setup({ onSave });

    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    await user.click(screen.getByRole("button", { name: "Save Assignments" }));

    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
    expect(roleSelect(/Location role at NASA/)).toHaveValue("staff");
  });

  it("UI-018: Cancel with no changes closes without saving", async () => {
    const user = userEvent.setup();
    const { onSave, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("warns before discarding unsaved changes and supports Keep Editing / Discard", async () => {
    const user = userEvent.setup();
    const { onSave, onCancel } = setup();

    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep Editing" }));
    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    expect(roleSelect(/Location role at NASA/)).toHaveValue("staff");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("SEC-011: inactive locations are read-only with no controls", () => {
    setup();
    const row = screen.getByTestId("assignment-row-closed");
    expect(within(row).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(row).toHaveTextContent(/Inactive location/);
  });

  it("inactive organization members cannot be assigned or reactivated", () => {
    setup({ member: { ...MEMBER, membershipActive: false } });
    expect(
      screen.getByText(/Organization membership inactive/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Clear Lake")).toBeDisabled(); // inactive assignment
    // Existing active assignments can still be removed.
    expect(screen.getByLabelText("NASA")).toBeEnabled();
  });

  it("does not deactivate locations that are simply not displayed (no implicit revocation)", async () => {
    const user = userEvent.setup();
    // Baseline contains a Webster assignment from ANOTHER organization.
    const { onSave } = setup({
      baseline: [
        ...BASELINE,
        {
          id: 9,
          profileId: "john",
          locationId: "webster",
          role: "manager",
          active: true,
        },
      ],
    });
    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    await user.click(screen.getByRole("button", { name: "Save Assignments" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const changes = onSave.mock.calls[0][0] as Array<{ locationId: string }>;
    expect(changes.map((c) => c.locationId)).toEqual(["nasa"]);
  });

  it("host close request (dialog X / ESC) shows the discard confirmation when dirty", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const props = {
      member: MEMBER,
      locations: LOCATIONS,
      baseline: BASELINE,
      onSave,
      onCancel,
    };
    const { rerender } = render(
      <StaffMultiLocationEditor {...props} discardRequest={0} />,
    );
    await user.selectOptions(roleSelect(/Location role at NASA/), "staff");
    rerender(<StaffMultiLocationEditor {...props} discardRequest={1} />);
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep Editing" }));
    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    expect(roleSelect(/Location role at NASA/)).toHaveValue("staff");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
