import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocationAdministration } from "./location-administration";
import * as actions from "@/features/locations/actions/location-admin-actions";

vi.mock("@/features/locations/actions/location-admin-actions", () => ({
  getLocationAdminContextAction: vi.fn(),
  listLocationsForAdminAction: vi.fn(),
  provisionLocationAction: vi.fn(),
  updateLocationDetailsAction: vi.fn(),
  getLocationOperatingHoursAction: vi.fn(),
  updateLocationOperatingHoursAction: vi.fn(),
}));

const MOCK_ORGS = [
  { id: "org-monks", name: "The Monk's", slug: "monks", role: "owner" },
  { id: "org-liquor", name: "Liquor Tap", slug: "liquor-tap", role: "owner" },
];

const MOCK_LOCATIONS = [
  {
    id: "loc-1",
    organizationId: "org-monks",
    name: "Webster Branch",
    timeZone: "America/Chicago",
    address: { line1: "123 Main St", city: "Webster", region: "TX" },
    coverWeight: 0.25,
    active: true,
    openingLocal: "11:00",
    closingLocal: "23:00",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "loc-2",
    organizationId: "org-monks",
    name: "NASA Branch",
    timeZone: "America/Chicago",
    address: { line1: "18100 Upper Bay Rd", city: "Houston", region: "TX" },
    coverWeight: 0.25,
    active: true,
    openingLocal: "11:00",
    closingLocal: "02:00",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

describe("LocationAdministration", () => {
  it("renders permission denied screen if user cannot administer locations (UI-002)", async () => {
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
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
      screen.getByText(
        /Only Overall Managers, Overall Owners, or Organization Owners\/General Managers are authorized/i,
      ),
    ).toBeInTheDocument();
  });

  it("auto-selects single organization and omits redundant dropdown (UI-003)", async () => {
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: false,
        organizations: [MOCK_ORGS[0]],
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: MOCK_LOCATIONS,
    });

    render(<LocationAdministration onBack={vi.fn()} />);

    expect(await screen.findByText("The Monk's")).toBeInTheDocument();
    // Dropdown selector is omitted when there is only 1 organization
    expect(
      screen.queryByLabelText("Select organization to administer"),
    ).not.toBeInTheDocument();

    expect(await screen.findByText("Webster Branch")).toBeInTheDocument();
    expect(screen.getByText("NASA Branch")).toBeInTheDocument();
  });

  it("displays organization selector for multi-org manager and switches target (UI-004)", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: true,
        organizations: MOCK_ORGS,
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockImplementation(
      (orgId) => {
        if (orgId === "org-monks") {
          return Promise.resolve({ ok: true, data: [MOCK_LOCATIONS[0]] });
        }
        return Promise.resolve({ ok: true, data: [MOCK_LOCATIONS[1]] });
      },
    );

    render(<LocationAdministration onBack={vi.fn()} />);

    const select = await screen.findByLabelText(
      "Select organization to administer",
    );
    expect(select).toBeInTheDocument();
    expect(await screen.findByText("Webster Branch")).toBeInTheDocument();

    // Switch to Liquor Tap
    await user.selectOptions(select, "org-liquor");

    await waitFor(() => {
      expect(screen.getByText("NASA Branch")).toBeInTheDocument();
    });
  });

  it("renders empty state when an organization has no locations (UI-008)", async () => {
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: true,
        organizations: [MOCK_ORGS[0]],
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: [],
    });

    render(<LocationAdministration onBack={vi.fn()} />);

    expect(await screen.findByText("No locations yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add your first restaurant location to configure its address, time zone and operating hours.",
      ),
    ).toBeInTheDocument();
  });

  it("filters locations in real-time by search query", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: true,
        organizations: [MOCK_ORGS[0]],
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: MOCK_LOCATIONS,
    });

    render(<LocationAdministration onBack={vi.fn()} />);

    expect(await screen.findByText("Webster Branch")).toBeInTheDocument();
    expect(screen.getByText("NASA Branch")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Search locations");
    await user.type(searchInput, "NASA");

    expect(screen.getByText("NASA Branch")).toBeInTheDocument();
    expect(screen.queryByText("Webster Branch")).not.toBeInTheDocument();
  });

  it("opens Add Location dialog and calls provisionLocationAction (UI-011, UI-017)", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: true,
        organizations: [MOCK_ORGS[0]],
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: [MOCK_LOCATIONS[0]],
    });
    vi.mocked(actions.provisionLocationAction).mockResolvedValue({
      ok: true,
      data: MOCK_LOCATIONS[1],
    });

    render(<LocationAdministration onBack={vi.fn()} />);

    const addBtn = await screen.findByRole("button", {
      name: "+ Add Location",
    });
    await user.click(addBtn);

    expect(
      screen.getByRole("heading", { name: "Add New Location" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Location Name"), "NASA Branch");
    await user.click(screen.getByRole("button", { name: "Create Location" }));

    await waitFor(() => {
      expect(actions.provisionLocationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-monks",
          name: "NASA Branch",
        }),
      );
    });
  });

  it("opens Manage Location dialog with Details and Operating Hours tabs (UI-018)", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAdminContextAction).mockResolvedValue({
      ok: true,
      data: {
        canAdministerLocations: true,
        isOverallAdmin: true,
        organizations: [MOCK_ORGS[0]],
      },
    });
    vi.mocked(actions.listLocationsForAdminAction).mockResolvedValue({
      ok: true,
      data: [MOCK_LOCATIONS[0]],
    });
    vi.mocked(actions.getLocationOperatingHoursAction).mockResolvedValue({
      ok: true,
      data: [],
    });

    render(<LocationAdministration onBack={vi.fn()} />);

    const manageBtn = await screen.findByRole("button", {
      name: "Manage Webster Branch",
    });
    await user.click(manageBtn);

    expect(
      screen.getByRole("heading", { name: "Manage Webster Branch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Location Details & Address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Operating Hours" }),
    ).toBeInTheDocument();

    // Switch to Operating Hours tab
    await user.click(screen.getByRole("button", { name: "Operating Hours" }));

    expect(screen.getByText("Weekly Operating Hours")).toBeInTheDocument();
  });
});
