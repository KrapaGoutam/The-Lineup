import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listOrganizationsForAdministrationAction } from "@/features/organizations/actions/organization-admin-actions";
import {
  addExistingEmployeeAction,
  listExistingEmployeesAction,
} from "@/features/organizations/actions/cross-organization-staff-actions";
import { AddExistingEmployeeDialog } from "./add-existing-employee-dialog";

vi.mock("@/features/organizations/actions/organization-admin-actions", () => ({
  listOrganizationsForAdministrationAction: vi.fn(),
}));
vi.mock(
  "@/features/organizations/actions/cross-organization-staff-actions",
  () => ({
    addExistingEmployeeAction: vi.fn(),
    listExistingEmployeesAction: vi.fn(),
  }),
);

const sourceId = "11111111-1111-4111-8111-111111111111";
const destinationId = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const employee = {
  profileId,
  displayName: "Sam",
  organizationRoles: ["host"],
  membershipActive: true,
  destinationStatus: "absent" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOrganizationsForAdministrationAction).mockResolvedValue({
    ok: true,
    data: [
      { id: sourceId, name: "The Monk's", slug: "monks", branchCount: 1 },
      {
        id: destinationId,
        name: "Liquor Tap",
        slug: "liquor-tap",
        branchCount: 1,
      },
    ],
  });
  vi.mocked(listExistingEmployeesAction).mockResolvedValue({
    ok: true,
    data: [employee],
  });
  vi.mocked(addExistingEmployeeAction).mockResolvedValue({
    ok: true,
    data: { profileId, outcome: "added" },
  });
});

function setup() {
  const onLinked = vi.fn();
  const onAssign = vi.fn();
  render(
    <AddExistingEmployeeDialog
      destinationOrganizationId={destinationId}
      destinationOrganizationName="Liquor Tap"
      nextBranchName="League City"
      onClose={vi.fn()}
      onLinked={onLinked}
      onAssign={onAssign}
    />,
  );
  return { onLinked, onAssign };
}

describe("Add Existing Employee dialog", () => {
  it("requires an explicit source, reason and confirmation, then hands off to branch assignment", async () => {
    const user = userEvent.setup();
    const { onLinked, onAssign } = setup();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.selectOptions(
      await screen.findByLabelText("Source organization"),
      sourceId,
    );
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    await user.click(screen.getByRole("radio"));
    await user.type(screen.getByLabelText("Reason"), "New branch staffing");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Add Sam to Liquor Tap?")).toBeInTheDocument();
    expect(screen.getByText(/personal PIN remain/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm membership" }),
    );
    expect(addExistingEmployeeAction).toHaveBeenCalledWith({
      sourceOrganizationId: sourceId,
      destinationOrganizationId: destinationId,
      profileId,
      reason: "New branch staffing",
      reactivate: false,
    });
    expect(onLinked).toHaveBeenCalledWith(
      expect.objectContaining({ profileId }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Assign to League City" }),
    );
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ profileId }),
    );
  });

  it("labels an inactive membership and requires explicit reactivation", async () => {
    const user = userEvent.setup();
    vi.mocked(listExistingEmployeesAction).mockResolvedValue({
      ok: true,
      data: [{ ...employee, destinationStatus: "inactive" }],
    });
    setup();
    await user.selectOptions(
      await screen.findByLabelText("Source organization"),
      sourceId,
    );
    await user.click(await screen.findByRole("radio"));
    expect(screen.getByText("Inactive in destination")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason"), "Return to branch");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Reactivate Sam in Liquor Tap?"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm reactivation" }),
    );
    expect(addExistingEmployeeAction).toHaveBeenCalledWith(
      expect.objectContaining({ reactivate: true }),
    );
  });

  it("shows source roster failures without claiming the roster is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(listExistingEmployeesAction).mockResolvedValue({
      ok: false,
      error: "Unable to read source staff.",
      code: "SOURCE_ROSTER_FAILED",
    });
    setup();
    await user.selectOptions(
      await screen.findByLabelText("Source organization"),
      sourceId,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to read source staff.",
    );
    expect(
      screen.queryByText("No matching active employees."),
    ).not.toBeInTheDocument();
  });
});
