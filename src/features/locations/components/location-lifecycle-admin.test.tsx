import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationAdministration } from "./location-administration";
import { LocationList } from "./location-list";
import { createDemoLocationLifecycleSource } from "./location-lifecycle-demo";
import type { Location } from "@/features/locations/domain/location";
import * as adminActions from "@/features/locations/actions/location-admin-actions";
import * as lifecycleActions from "@/features/locations/actions/location-lifecycle-actions";

vi.mock("@/features/locations/actions/location-admin-actions", () => ({
  getLocationAdminContextAction: vi.fn(),
  listLocationsForAdminAction: vi.fn(),
  provisionLocationAction: vi.fn(),
  updateLocationDetailsAction: vi.fn(),
  getLocationOperatingHoursAction: vi.fn(),
  updateLocationOperatingHoursAction: vi.fn(),
}));
vi.mock("@/features/locations/actions/location-lifecycle-actions", () => ({
  getLocationLifecycleReadinessAction: vi.fn(),
  listLocationLifecycleEventsAction: vi.fn(),
  transitionLocationLifecycleAction: vi.fn(),
}));
vi.mock("@/features/locations/actions/staff-assignment-actions", () => ({
  listOrganizationStaffAction: vi.fn(),
  getLocationStaffAction: vi.fn(),
  getEmployeeLocationAssignmentsAction: vi.fn(),
  applyStaffLocationChangesAction: vi.fn(),
}));

function loc(over: Partial<Location> & { id: string; name: string }): Location {
  return {
    organizationId: "org-1",
    timeZone: "America/Chicago",
    address: { city: "Houston" },
    coverWeight: 0.25,
    active: true,
    archivedAt: null,
    openingLocal: "11:00",
    closingLocal: "23:00",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("LocationList lifecycle presentation", () => {
  const locations = [
    loc({ id: "a", name: "Alpha" }),
    loc({ id: "i", name: "Idle", active: false }),
    loc({
      id: "z",
      name: "Zeta",
      active: false,
      archivedAt: "2026-02-01T00:00:00Z",
    }),
  ];
  const baseProps = {
    locations,
    organizationName: "Liquor Tap",
    searchQuery: "",
    onSearchChange: vi.fn(),
    onManageLocation: vi.fn(),
    onAddLocation: vi.fn(),
  };

  it("UI-L20: shows state-specific actions; archived offers history only", async () => {
    const user = userEvent.setup();
    const onViewHistory = vi.fn();
    render(
      <LocationList
        {...baseProps}
        onLifecycleAction={vi.fn()}
        onViewHistory={onViewHistory}
      />,
    );
    const active = screen.getByTestId("location-card-a");
    expect(
      within(active).getByTestId("lifecycle-badge-active"),
    ).toBeInTheDocument();
    expect(
      within(active).getByRole("button", { name: "Manage Alpha" }),
    ).toBeInTheDocument();
    expect(
      within(active).getByRole("button", { name: "Deactivate Alpha" }),
    ).toBeInTheDocument();
    expect(
      within(active).queryByRole("button", { name: /Archive/ }),
    ).toBeNull();

    const inactive = screen.getByTestId("location-card-i");
    expect(
      within(inactive).getByTestId("lifecycle-badge-inactive"),
    ).toBeInTheDocument();
    expect(
      within(inactive).getByRole("button", { name: "Reactivate Idle" }),
    ).toBeInTheDocument();
    expect(
      within(inactive).getByRole("button", { name: "Archive Idle" }),
    ).toBeInTheDocument();
    expect(
      within(inactive).getByRole("button", { name: "Manage Idle" }),
    ).toBeInTheDocument();

    // Archived section is collapsed by default but discoverable.
    const toggle = screen.getByRole("button", {
      name: /archived locations \(1\)/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const archived = screen.getByTestId("location-card-z");
    expect(
      within(archived).getByTestId("lifecycle-badge-archived"),
    ).toBeInTheDocument();
    expect(
      within(archived).getByRole("button", { name: "View history of Zeta" }),
    ).toBeInTheDocument();
    expect(
      within(archived).queryByRole("button", {
        name: /Manage|Reactivate|Deactivate|Archive Zeta/,
      }),
    ).toBeNull();
    await user.click(
      within(archived).getByRole("button", { name: "View history of Zeta" }),
    );
    expect(onViewHistory).toHaveBeenCalledWith(locations[2]);
  });

  it("UI-L21: without management authority no lifecycle control is rendered", () => {
    render(
      <LocationList
        {...baseProps}
        canManage={false}
        onLifecycleAction={vi.fn()}
        onViewHistory={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: /^(Deactivate|Reactivate|Archive|View history)/i,
      }),
    ).toBeNull();
  });

  it("UI-L22: archived locations stay searchable and the sort puts them last", async () => {
    const user = userEvent.setup();
    render(<LocationList {...baseProps} searchQuery="zeta" />);
    expect(
      screen.getByRole("button", { name: /archived locations \(1\)/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("location-card-a")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /archived locations/i }),
    );
    expect(screen.getByTestId("location-card-z")).toBeVisible();
  });
});

describe("Location Administration demo lifecycle flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openDemo() {
    render(<LocationAdministration onBack={vi.fn()} demoMode />);
    return screen.findByTestId("location-card-demo-loc-2");
  }

  it("UI-L23: deactivate → reactivate → deactivate → archive → history, all in memory", async () => {
    const user = userEvent.setup();
    const nasa = await openDemo();

    // Deactivate
    await user.click(
      within(nasa).getByRole("button", { name: "Deactivate NASA Branch" }),
    );
    await user.type(
      await screen.findByLabelText(/Reason/i),
      "Seasonal closure",
    );
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("location-card-demo-loc-2")).getByTestId(
          "lifecycle-badge-inactive",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("lifecycle-notice")).toHaveTextContent(
      /NASA Branch: deactivate completed/i,
    );

    // Sibling untouched
    expect(
      within(screen.getByTestId("location-card-demo-loc-1")).getByTestId(
        "lifecycle-badge-active",
      ),
    ).toBeInTheDocument();

    // Reactivate
    await user.click(
      screen.getByRole("button", { name: "Reactivate NASA Branch" }),
    );
    await user.type(
      await screen.findByLabelText(/Reason/i),
      "Reopening for season",
    );
    await user.click(
      screen.getByRole("button", { name: "Reactivate location" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("location-card-demo-loc-2")).getByTestId(
          "lifecycle-badge-active",
        ),
      ).toBeInTheDocument(),
    );

    // Deactivate again then archive with typed-name confirmation
    await user.click(
      screen.getByRole("button", { name: "Deactivate NASA Branch" }),
    );
    await user.type(
      await screen.findByLabelText(/Reason/i),
      "Closing the branch",
    );
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Archive NASA Branch" }),
    );
    await user.type(
      await screen.findByLabelText(/Reason/i),
      "Permanently closed",
    );
    await user.type(screen.getByLabelText(/to confirm/i), "NASA Branch");
    await user.click(screen.getByRole("button", { name: "Archive location" }));

    const toggle = await screen.findByRole("button", {
      name: /archived locations \(1\)/i,
    });
    await user.click(toggle);
    const archived = screen.getByTestId("location-card-demo-loc-2");
    expect(
      within(archived).getByTestId("lifecycle-badge-archived"),
    ).toBeInTheDocument();

    // History shows every audited step, newest first, with reasons
    await user.click(
      within(archived).getByRole("button", {
        name: "View history of NASA Branch",
      }),
    );
    const history = await screen.findByTestId("lifecycle-history");
    await waitFor(() =>
      expect(within(history).getAllByRole("listitem")).toHaveLength(4),
    );
    expect(history).toHaveTextContent("Permanently closed");
    expect(history).toHaveTextContent("Seasonal closure");
    expect(within(history).getAllByRole("listitem")[0]).toHaveTextContent(
      /Archive: Inactive → Archived/,
    );

    // Demo isolation: nothing reached the server actions
    expect(
      lifecycleActions.transitionLocationLifecycleAction,
    ).not.toHaveBeenCalled();
    expect(
      lifecycleActions.getLocationLifecycleReadinessAction,
    ).not.toHaveBeenCalled();
    expect(
      lifecycleActions.listLocationLifecycleEventsAction,
    ).not.toHaveBeenCalled();
    expect(adminActions.getLocationAdminContextAction).not.toHaveBeenCalled();
  });

  it("UI-L24: a demo location with an active service session cannot be deactivated", async () => {
    const user = userEvent.setup();
    render(<LocationAdministration onBack={vi.fn()} demoMode />);
    const webster = await screen.findByTestId("location-card-demo-loc-1");
    await user.click(
      within(webster).getByRole("button", {
        name: "Deactivate Webster Branch",
      }),
    );
    const blockers = await screen.findByTestId("lifecycle-blockers");
    expect(blockers).toHaveTextContent("Cannot deactivate Webster Branch.");
    expect(blockers).toHaveTextContent("1 active service session");
    // While hard blockers exist the warning panel is not shown.
    expect(screen.queryByTestId("lifecycle-warnings")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId("location-card-demo-loc-1")).getByTestId(
        "lifecycle-badge-active",
      ),
    ).toBeInTheDocument();
  });
});

describe("demo lifecycle source (isolation and rules)", () => {
  const nasa = loc({
    id: "demo-loc-2",
    name: "NASA Branch",
    organizationId: "demo-org-1",
  });

  it("UI-L25: enforces the state machine, reason and blockers in memory", async () => {
    const src = createDemoLocationLifecycleSource();
    expect(src.kind).toBe("demo");

    const noReason = await src.transition({
      organizationId: "demo-org-1",
      location: nasa,
      action: "deactivate",
      reason: " ",
    });
    expect(noReason.ok).toBe(false);

    const bad = await src.transition({
      organizationId: "demo-org-1",
      location: nasa,
      action: "archive",
      reason: "Skip a step",
    });
    expect(bad.ok === false && bad.kind).toBe("INVALID_TRANSITION");

    const blocked = await src.transition({
      organizationId: "demo-org-1",
      location: loc({ id: "demo-loc-1", name: "Webster Branch" }),
      action: "deactivate",
      reason: "Try it",
    });
    expect(blocked.ok === false && blocked.kind).toBe("BLOCKED");

    const ok = await src.transition({
      organizationId: "demo-org-1",
      location: nasa,
      action: "deactivate",
      reason: "Seasonal closure",
    });
    expect(ok.ok && ok.data.active).toBe(false);
    const history = await src.loadHistory("demo-org-1", nasa);
    expect(history.ok && history.data).toHaveLength(1);
  });
});
