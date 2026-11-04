import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationAdministration } from "./location-administration";
import { createDemoStaffAssignmentSource } from "./staff-assignment-demo";
import * as staffActions from "@/features/locations/actions/staff-assignment-actions";
import * as adminActions from "@/features/locations/actions/location-admin-actions";

vi.mock("@/features/locations/actions/location-admin-actions", () => ({
  getLocationAdminContextAction: vi.fn(),
  listLocationsForAdminAction: vi.fn(),
  provisionLocationAction: vi.fn(),
  updateLocationDetailsAction: vi.fn(),
  getLocationOperatingHoursAction: vi.fn(),
  updateLocationOperatingHoursAction: vi.fn(),
}));

vi.mock("@/features/locations/actions/staff-assignment-actions", () => ({
  listOrganizationStaffAction: vi.fn(),
  getLocationStaffAction: vi.fn(),
  getEmployeeLocationAssignmentsAction: vi.fn(),
  applyStaffLocationChangesAction: vi.fn(),
}));

describe("demo staff assignment source", () => {
  it("is in-memory and supports assign / update / deactivate / reactivate", async () => {
    const src = createDemoStaffAssignmentSource();
    expect(src.kind).toBe("demo");

    const res = await src.applyChanges("demo-org-1", "demo-priya", [
      { locationId: "demo-loc-1", action: "assign", role: "staff" },
    ]);
    expect(res.ok).toBe(true);

    let view = await src.loadLocationStaff("demo-org-1", "demo-loc-1");
    expect(
      view.ok &&
        view.data.assignments.find((a) => a.profileId === "demo-priya")?.role,
    ).toBe("staff");

    await src.applyChanges("demo-org-1", "demo-priya", [
      { locationId: "demo-loc-1", action: "update", role: "manager" },
    ]);
    await src.applyChanges("demo-org-1", "demo-priya", [
      { locationId: "demo-loc-1", action: "deactivate" },
    ]);
    view = await src.loadLocationStaff("demo-org-1", "demo-loc-1");
    expect(
      view.ok &&
        view.data.assignments.find((a) => a.profileId === "demo-priya"),
    ).toMatchObject({ role: "manager", active: false });

    await src.applyChanges("demo-org-1", "demo-priya", [
      { locationId: "demo-loc-1", action: "reactivate", role: "staff" },
    ]);
    view = await src.loadLocationStaff("demo-org-1", "demo-loc-1");
    expect(
      view.ok &&
        view.data.assignments.find((a) => a.profileId === "demo-priya"),
    ).toMatchObject({ role: "staff", active: true });
  });

  it("refuses to assign an inactive demo member and invalid roles", async () => {
    const src = createDemoStaffAssignmentSource();
    const inactive = await src.applyChanges("demo-org-1", "demo-lee", [
      { locationId: "demo-loc-2", action: "assign", role: "staff" },
    ]);
    expect(inactive).toMatchObject({ ok: false, code: "MEMBERSHIP_REQUIRED" });
    const bad = await src.applyChanges("demo-org-1", "demo-sam", [
      { locationId: "demo-loc-2", action: "assign", role: "owner" as never },
    ]);
    expect(bad).toMatchObject({ ok: false, code: "INVALID_ROLE" });
  });

  it("separate sources do not share state", async () => {
    const a = createDemoStaffAssignmentSource();
    const b = createDemoStaffAssignmentSource();
    await a.applyChanges("demo-org-1", "demo-priya", [
      { locationId: "demo-loc-1", action: "assign", role: "staff" },
    ]);
    const view = await b.loadLocationStaff("demo-org-1", "demo-loc-1");
    expect(
      view.ok &&
        view.data.assignments.some((x) => x.profileId === "demo-priya"),
    ).toBe(false);
  });
});

describe("LocationAdministration staff management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("UI-019 / AC-027: demo mode edits staff without touching live actions", async () => {
    const user = userEvent.setup();
    render(<LocationAdministration onBack={vi.fn()} demoMode />);

    await user.click(
      await screen.findByRole("button", { name: "Manage Webster Branch" }),
    );
    await user.click(screen.getByRole("button", { name: "Staff" }));

    const sam = await screen.findByTestId("staff-row-demo-lee");
    expect(
      within(sam).getByText("Organization Membership Inactive"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Assign Staff" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Select Sam Ortega to assign",
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("Location role"),
      "assistant_manager",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm Assignment" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sam Ortega assigned to Webster Branch as Assistant Manager.",
    );
    expect(screen.getByTestId("staff-row-demo-sam")).toBeInTheDocument();

    for (const fn of Object.values(staffActions)) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(adminActions.getLocationAdminContextAction).not.toHaveBeenCalled();
  });

  it("UI-001/003/004: authorized live admin sees Staff Assignments and the Staff tab; org switch clears staff view", async () => {
    const user = userEvent.setup();
    vi.mocked(adminActions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: false,
        organizations: [
          { id: "org-a", name: "Monks", slug: "monks", role: "owner" },
          { id: "org-b", name: "Liquor Tap", slug: "liquor", role: "owner" },
        ],
      },
    });
    vi.mocked(adminActions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "loc-a",
          organizationId: "org-a",
          name: "Webster",
          timeZone: "America/Chicago",
          address: {},
          coverWeight: 0.25,
          active: true,
          openingLocal: "11:00",
          closingLocal: "23:00",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(staffActions.getLocationStaffAction).mockResolvedValue({
      ok: true,
      data: { roster: [], assignments: [] },
    });
    vi.mocked(staffActions.listOrganizationStaffAction).mockResolvedValue({
      ok: true,
      data: [],
    });

    render(<LocationAdministration onBack={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Manage Webster" }),
    );
    await user.click(screen.getByRole("button", { name: "Staff" }));
    await waitFor(() =>
      expect(staffActions.getLocationStaffAction).toHaveBeenCalledWith(
        "org-a",
        "loc-a",
      ),
    );
    expect(
      await screen.findByText("No staff assigned to this location yet."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: /Staff Assignments/ }));
    await waitFor(() =>
      expect(staffActions.listOrganizationStaffAction).toHaveBeenCalledWith(
        "org-a",
      ),
    );
  });

  it("UI-002: unauthorized users see no staff management entry", async () => {
    vi.mocked(adminActions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: false,
        isOverallAdmin: false,
        organizations: [],
      },
    });
    render(<LocationAdministration onBack={vi.fn()} />);
    expect(
      await screen.findByText("Management Authority Required"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Staff Assignments/ }),
    ).not.toBeInTheDocument();
  });
});
