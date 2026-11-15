import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import type { Location } from "@/features/locations/domain/location";
import type { StaffRosterMember } from "@/features/locations/domain/staff-assignment";
import { LocationStaffManagement } from "./location-staff-management";
import { OrganizationStaffAssignments } from "./organization-staff-assignments";
import type { StaffAssignmentSource } from "./staff-assignment-source";

const LOCATION: Location = {
  id: "nasa",
  organizationId: "org",
  name: "NASA",
  timeZone: "America/Chicago",
  address: {},
  coverWeight: 0.25,
  active: true,
  openingLocal: "11:00",
  closingLocal: "23:00",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const ROSTER: StaffRosterMember[] = [
  {
    profileId: "john",
    displayName: "John",
    organizationRoles: ["general_manager"],
    membershipActive: true,
  },
  {
    profileId: "sam",
    displayName: "Sam",
    organizationRoles: ["server"],
    membershipActive: true,
  },
  {
    profileId: "priya",
    displayName: "Priya",
    organizationRoles: ["host"],
    membershipActive: true,
  },
  {
    profileId: "lee",
    displayName: "Lee",
    organizationRoles: ["server"],
    membershipActive: false,
  },
  {
    profileId: "tara",
    displayName: "Tara",
    organizationRoles: ["server"],
    membershipActive: true,
  },
];

function as(
  id: number,
  profileId: string,
  role: LocationRoleAssignment["role"],
  active = true,
): LocationRoleAssignment {
  return {
    id,
    profileId,
    locationId: "nasa",
    organizationId: "org",
    role,
    active,
  };
}

const ASSIGNMENTS = [
  as(1, "john", "manager"),
  as(2, "sam", "staff"),
  as(3, "tara", "assistant_manager", false),
  as(4, "lee", "staff", true),
];

const ORG_LOCATIONS = [
  { id: "nasa", name: "NASA", active: true },
  { id: "league", name: "League City", active: true },
];

function makeSource(
  over: Partial<StaffAssignmentSource> = {},
): StaffAssignmentSource & { applyChanges: ReturnType<typeof vi.fn> } {
  return {
    kind: "live",
    loadOrganizationStaff: vi
      .fn()
      .mockResolvedValue({ ok: true, data: ROSTER }),
    loadLocationStaff: vi.fn().mockResolvedValue({
      ok: true,
      data: { roster: ROSTER, assignments: ASSIGNMENTS },
    }),
    loadEmployeeAssignments: vi
      .fn()
      .mockImplementation(async (_o, profileId) => ({
        ok: true,
        data: {
          member: ROSTER.find((m) => m.profileId === profileId),
          assignments: ASSIGNMENTS.filter((a) => a.profileId === profileId),
        },
      })),
    applyChanges: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    ...over,
  } as never;
}

function renderMgmt(
  source: StaffAssignmentSource,
  props: Partial<React.ComponentProps<typeof LocationStaffManagement>> = {},
) {
  return render(
    <LocationStaffManagement
      source={source}
      organizationId="org"
      organizationName="Liquor Tap"
      location={LOCATION}
      organizationLocations={ORG_LOCATIONS}
      canManage
      {...props}
    />,
  );
}

describe("LocationStaffManagement", () => {
  it("UI-005/UI-007/UI-008: lists assigned staff with role and unambiguous status", async () => {
    renderMgmt(makeSource());

    const john = await screen.findByTestId("staff-row-john");
    expect(within(john).getByText("Manager")).toBeInTheDocument();
    expect(within(john).getByText("Assigned")).toBeInTheDocument();

    const tara = screen.getByTestId("staff-row-tara");
    expect(within(tara).getByText("Inactive Assignment")).toBeInTheDocument();
    expect(
      within(tara).getByText(/Previous role: Assistant Manager/),
    ).toBeInTheDocument();

    const lee = screen.getByTestId("staff-row-lee");
    expect(
      within(lee).getByText("Organization Membership Inactive"),
    ).toBeInTheDocument();
    // Inactive members cannot be reactivated or role-edited.
    expect(
      within(lee).queryByRole("button", { name: /Reactivate|Change role/i }),
    ).not.toBeInTheDocument();
  });

  it("never shows organization roles as location roles", async () => {
    renderMgmt(makeSource());
    await screen.findByTestId("staff-row-john");
    // General Manager is an organization role; it may appear as org context only.
    const john = screen.getByTestId("staff-row-john");
    expect(
      within(john).getByText(/Organization: General Manager/),
    ).toBeInTheDocument();
    expect(
      within(john).queryByText("General Manager", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("UI-006: search filters assigned staff by name", async () => {
    const user = userEvent.setup();
    renderMgmt(makeSource());
    await screen.findByTestId("staff-row-john");
    await user.type(screen.getByLabelText("Search assigned staff"), "sam");
    expect(screen.getByTestId("staff-row-sam")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-row-john")).not.toBeInTheDocument();
  });

  it("shows the empty state when nobody is assigned", async () => {
    renderMgmt(
      makeSource({
        loadLocationStaff: vi.fn().mockResolvedValue({
          ok: true,
          data: { roster: ROSTER, assignments: [] },
        }),
      }),
    );
    expect(
      await screen.findByText("No staff assigned to this location yet."),
    ).toBeInTheDocument();
  });

  it("UI-009: assign flow selects an eligible employee, reviews, and confirms via the RPC contract", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    await screen.findByTestId("staff-row-john");

    await user.click(screen.getByRole("button", { name: "+ Assign Staff" }));
    // Eligible = active members without an assignment row: only Priya.
    const eligible = screen.getByRole("list", { name: "Eligible staff" });
    expect(within(eligible).getAllByRole("listitem")).toHaveLength(1);
    expect(within(eligible).getByText("Priya")).toBeInTheDocument();
    // Inactive members are never offered as assignment candidates.
    expect(within(eligible).queryByText("Lee")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Select Priya to assign" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Location role"),
      "assistant_manager",
    );
    expect(screen.getByTestId("assign-review")).toHaveTextContent(
      "Priya will be assigned to NASA as Assistant Manager.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm Assignment" }),
    );

    await waitFor(() =>
      expect(source.applyChanges).toHaveBeenCalledWith("org", "priya", [
        { locationId: "nasa", action: "assign", role: "assistant_manager" },
      ]),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Priya assigned to NASA as Assistant Manager.",
    );
    // Refreshed from persisted data.
    expect(source.loadLocationStaff).toHaveBeenCalledTimes(2);
  });

  it("shows the no-eligible-staff message when the org has no active members", async () => {
    const user = userEvent.setup();
    renderMgmt(
      makeSource({
        loadLocationStaff: vi.fn().mockResolvedValue({
          ok: true,
          data: { roster: [ROSTER[3]], assignments: [] },
        }),
      }),
    );
    await screen.findByText("No staff assigned to this location yet.");
    await user.click(screen.getByRole("button", { name: "+ Assign Staff" }));
    expect(
      screen.getByText(
        /No eligible staff members are available\. Staff must have an active organization membership before assignment\./,
      ),
    ).toBeInTheDocument();
  });

  it("Change Role submits an update through the contract and refreshes (no optimistic update)", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    const sam = await screen.findByTestId("staff-row-sam");

    await user.click(
      within(sam).getByRole("button", { name: "Change role for Sam" }),
    );
    await user.selectOptions(
      within(sam).getByLabelText(/New location role for Sam/),
      "manager",
    );
    // Pending only: nothing persisted yet.
    expect(source.applyChanges).not.toHaveBeenCalled();
    await user.click(within(sam).getByRole("button", { name: "Save Role" }));

    await waitFor(() =>
      expect(source.applyChanges).toHaveBeenCalledWith("org", "sam", [
        { locationId: "nasa", action: "update", role: "manager" },
      ]),
    );
  });

  it("failed Change Role keeps the editor and pending role, and reports the error", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      applyChanges: vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Unauthorized: nope" }),
    });
    renderMgmt(source);
    const sam = await screen.findByTestId("staff-row-sam");
    await user.click(
      within(sam).getByRole("button", { name: "Change role for Sam" }),
    );
    await user.selectOptions(
      within(sam).getByLabelText(/New location role for Sam/),
      "manager",
    );
    await user.click(within(sam).getByRole("button", { name: "Save Role" }));

    expect(await screen.findByText("Unauthorized: nope")).toBeInTheDocument();
    expect(within(sam).getByLabelText(/New location role for Sam/)).toHaveValue(
      "manager",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("UI-012: Remove Access asks for confirmation and sends an explicit deactivate", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    const sam = await screen.findByTestId("staff-row-sam");

    await user.click(
      within(sam).getByRole("button", {
        name: "Remove assigned access for Sam",
      }),
    );
    expect(source.applyChanges).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Remove this employee's assigned access to NASA? Their organization membership and assignments to other locations will remain unchanged.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Access" }));
    await waitFor(() =>
      expect(source.applyChanges).toHaveBeenCalledWith("org", "sam", [
        { locationId: "nasa", action: "deactivate", role: undefined },
      ]),
    );
  });

  it("declining the removal confirmation changes nothing", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    const sam = await screen.findByTestId("staff-row-sam");
    await user.click(
      within(sam).getByRole("button", {
        name: "Remove assigned access for Sam",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(source.applyChanges).not.toHaveBeenCalled();
  });

  it("UI-013: Reactivate requires a role and sends action=reactivate", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    const tara = await screen.findByTestId("staff-row-tara");

    await user.click(
      within(tara).getByRole("button", { name: "Reactivate Tara" }),
    );
    await user.selectOptions(
      within(tara).getByLabelText(/New location role for Tara/),
      "staff",
    );
    await user.click(
      within(tara).getByRole("button", { name: "Reactivate Assignment" }),
    );

    await waitFor(() =>
      expect(source.applyChanges).toHaveBeenCalledWith("org", "tara", [
        { locationId: "nasa", action: "reactivate", role: "staff" },
      ]),
    );
  });

  it("UI-002: read-only mode hides every mutating control", async () => {
    renderMgmt(makeSource(), { canManage: false });
    await screen.findByTestId("staff-row-john");
    expect(
      screen.queryByRole("button", { name: /Assign Staff/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Change role/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove assigned access/ }),
    ).not.toBeInTheDocument();
  });

  it("SEC-011: an inactive location offers no assign / role / remove actions", async () => {
    renderMgmt(makeSource(), { location: { ...LOCATION, active: false } });
    await screen.findByTestId("staff-row-john");
    expect(screen.getByText(/This location is inactive/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Assign Staff/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Change role|Reactivate|Remove assigned/,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable error when the roster cannot be loaded", async () => {
    const user = userEvent.setup();
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: "Failed to load location staff.",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { roster: ROSTER, assignments: ASSIGNMENTS },
      });
    renderMgmt(makeSource({ loadLocationStaff: load }));
    expect(
      await screen.findByText("Failed to load location staff."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("staff-row-john")).toBeInTheDocument();
  });

  it("UI-017: a successful multi-location save refreshes persisted data", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderMgmt(source);
    const john = await screen.findByTestId("staff-row-john");
    await user.click(
      within(john).getByRole("button", { name: "Manage locations for John" }),
    );

    const dialog = await screen.findByRole("form", {
      name: /Location assignments for John/,
    });
    await user.click(within(dialog).getByLabelText("League City"));
    await user.click(
      within(dialog).getByRole("button", { name: "Save Assignments" }),
    );

    await waitFor(() =>
      expect(source.applyChanges).toHaveBeenCalledWith("org", "john", [
        { locationId: "league", action: "assign", role: "staff", active: true },
      ]),
    );
    await waitFor(() =>
      expect(source.loadLocationStaff).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved location assignments for John.",
    );
  });
});

describe("OrganizationStaffAssignments", () => {
  it("lists real members, supports search, and flags inactive membership", async () => {
    const user = userEvent.setup();
    render(
      <OrganizationStaffAssignments
        source={makeSource()}
        organizationId="org"
        organizationName="Liquor Tap"
        locations={ORG_LOCATIONS}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByTestId("org-staff-row-john")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("org-staff-row-lee")).getByText(
        "Organization Membership Inactive",
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search organization staff"), "pri");
    expect(screen.getByTestId("org-staff-row-priya")).toBeInTheDocument();
    expect(screen.queryByTestId("org-staff-row-john")).not.toBeInTheDocument();
  });

  it("shows the no-eligible-staff message for an empty roster", async () => {
    render(
      <OrganizationStaffAssignments
        source={makeSource({
          loadOrganizationStaff: vi
            .fn()
            .mockResolvedValue({ ok: true, data: [] }),
        })}
        organizationId="org"
        organizationName="Liquor Tap"
        locations={ORG_LOCATIONS}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/No eligible staff members are available/),
    ).toBeInTheDocument();
  });

  it("opens the multi-location editor for an employee and shows the success status only after persistence", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    render(
      <OrganizationStaffAssignments
        source={source}
        organizationId="org"
        organizationName="Liquor Tap"
        locations={ORG_LOCATIONS}
        onClose={vi.fn()}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Manage locations for Priya" }),
    );
    const form = await screen.findByRole("form", {
      name: /Location assignments for Priya/,
    });
    await user.click(within(form).getByLabelText("NASA"));
    await user.selectOptions(
      within(form).getByLabelText(/Location role at NASA/),
      "manager",
    );
    await user.click(within(form).getByLabelText("League City"));
    await user.selectOptions(
      within(form).getByLabelText(/Location role at League City/),
      "assistant_manager",
    );
    await user.click(
      within(form).getByRole("button", { name: "Save Assignments" }),
    );

    await waitFor(() => expect(source.applyChanges).toHaveBeenCalledTimes(1));
    expect(source.applyChanges).toHaveBeenCalledWith("org", "priya", [
      {
        locationId: "league",
        action: "assign",
        role: "assistant_manager",
        active: true,
      },
      { locationId: "nasa", action: "assign", role: "manager", active: true },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved location assignments for Priya.",
    );
  });
});
