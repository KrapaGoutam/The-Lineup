import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KioskManagementPage } from "./kiosk-management-page";
import * as adminActions from "../actions/kiosk-admin-actions";
import type { ManageableKioskLocation } from "../domain/kiosk-device";

vi.mock("../actions/kiosk-admin-actions", () => ({
  listManageableKioskLocationsAction: vi.fn(),
}));

const managementProps = vi.fn();
vi.mock("./location-kiosk-management", () => ({
  LocationKioskManagement: (props: {
    locationId: string;
    locationName: string;
    availableLocations?: readonly { id: string; name: string }[];
    demoMode?: boolean;
  }) => {
    managementProps(props);
    return (
      <div data-testid="kiosk-panel">
        Panel for {props.locationName} ({props.locationId})
      </div>
    );
  },
}));

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "99999999-9999-9999-9999-999999999999";
const loc = (
  id: string,
  name: string,
  org = ORG_A,
  orgName = "Org A",
): ManageableKioskLocation => ({
  locationId: id,
  locationName: name,
  organizationId: org,
  organizationName: orgName,
});

const list = vi.mocked(adminActions.listManageableKioskLocationsAction);

describe("KioskManagementPage (D7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading status, then the panel for a single manageable location", async () => {
    list.mockResolvedValueOnce({ ok: true, data: [loc("loc-1", "Downtown")] });
    render(<KioskManagementPage onBack={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading your kiosk locations/i,
    );

    expect(await screen.findByTestId("kiosk-panel")).toHaveTextContent(
      "Panel for Downtown (loc-1)",
    );
    // One location: no picker, just the location name.
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(managementProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: "loc-1",
        availableLocations: [{ id: "loc-1", name: "Downtown" }],
      }),
    );
    // Real data only: the page never opts into demo behaviour.
    expect(managementProps.mock.calls[0][0].demoMode).toBeUndefined();
  });

  it("renders a denied state and NO device UI when the caller manages nothing", async () => {
    list.mockResolvedValueOnce({ ok: true, data: [] });
    render(<KioskManagementPage onBack={vi.fn()} />);

    expect(
      await screen.findByText(/don't have access to manage kiosk devices/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("kiosk-panel")).not.toBeInTheDocument();
    expect(managementProps).not.toHaveBeenCalled();
  });

  it("fails closed on an error and recovers on retry", async () => {
    const user = userEvent.setup();
    list.mockResolvedValueOnce({
      ok: false,
      error: "Failed to load your kiosk locations.",
    });
    list.mockResolvedValueOnce({ ok: true, data: [loc("loc-1", "Downtown")] });
    render(<KioskManagementPage onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load your kiosk locations.",
    );
    expect(screen.queryByTestId("kiosk-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("kiosk-panel")).toBeInTheDocument();
  });

  it("treats a rejected action as a closed, retryable error", async () => {
    list.mockRejectedValueOnce(new Error("network"));
    render(<KioskManagementPage onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed to load your kiosk locations/i,
    );
    expect(screen.queryByTestId("kiosk-panel")).not.toBeInTheDocument();
  });

  it("lets a multi-location manager pick, offering only manageable same-org reassignment targets", async () => {
    const user = userEvent.setup();
    list.mockResolvedValueOnce({
      ok: true,
      data: [
        loc("a1", "Alpha"),
        loc("a2", "Beta"),
        loc("b1", "Gamma", ORG_B, "Org B"),
      ],
    });
    render(<KioskManagementPage onBack={vi.fn()} />);

    const picker = await screen.findByLabelText("Location");
    // Two organizations: options carry the organization name.
    expect(
      screen.getByRole("option", { name: "Org A — Alpha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Org B — Gamma" }),
    ).toBeInTheDocument();
    expect(picker).toHaveValue("a1");
    // Reassignment: same organization only (never Org B's Gamma).
    expect(managementProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: "a1",
        availableLocations: [
          { id: "a1", name: "Alpha" },
          { id: "a2", name: "Beta" },
        ],
      }),
    );

    await user.selectOptions(picker, "b1");
    expect(await screen.findByTestId("kiosk-panel")).toHaveTextContent(
      "Panel for Gamma (b1)",
    );
    expect(managementProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: "b1",
        availableLocations: [{ id: "b1", name: "Gamma" }],
      }),
    );
  });

  it("omits the organization prefix when every location is in one organization", async () => {
    list.mockResolvedValueOnce({
      ok: true,
      data: [loc("a1", "Alpha"), loc("a2", "Beta")],
    });
    render(<KioskManagementPage onBack={vi.fn()} />);
    expect(
      await screen.findByRole("option", { name: "Beta" }),
    ).toBeInTheDocument();
  });

  it("calls onBack from the Back control", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    list.mockResolvedValueOnce({ ok: true, data: [loc("a1", "Alpha")] });
    render(<KioskManagementPage onBack={onBack} />);
    await waitFor(() =>
      expect(screen.getByTestId("kiosk-panel")).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: /back to settings/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("imports nothing from Location Administration (no capability leaks through composition)", () => {
    const dir = import.meta.dirname;
    for (const file of [
      "kiosk-management-page.tsx",
      "use-manageable-kiosk-locations.ts",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/features\/locations/);
      expect(source, file).not.toMatch(
        /LocationAdministration|LocationForm|LocationStaffManagement|OperatingHours/,
      );
    }
  });
});
