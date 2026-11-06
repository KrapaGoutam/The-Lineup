import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocationModuleSettings } from "./location-module-settings";
import { createDemoModuleSettingsSource } from "./module-settings-source";
import { CONFIGURABLE_MODULES } from "../domain/module-registry";
import type { ModuleSettingsSource } from "../domain/module-settings";
import type { Location } from "@/features/locations/domain/location";
vi.mock("../actions/module-config-actions", () => ({
  loadModuleSettingsAction: vi.fn(),
  saveModuleSettingsAction: vi.fn(),
}));
const location: Location = {
  id: "a",
  organizationId: "org",
  name: "NASA",
  timeZone: "America/Chicago",
  address: {},
  active: true,
  coverWeight: 1,
  openingLocal: "11:00",
  closingLocal: "23:00",
  createdAt: "",
  updatedAt: "",
};
async function loaded(
  source = createDemoModuleSettingsSource(),
  override = {},
) {
  const view = render(
    <LocationModuleSettings
      location={{ ...location, ...override }}
      source={source}
      demoMode
    />,
  );
  await screen.findAllByText("Not configured");
  return { ...view, source };
}
describe("location module editor", () => {
  it("shows registry order, nine missing states, system required Settings and disclosure", async () => {
    await loaded();
    expect(
      screen
        .getAllByRole("listitem")
        .map((row) => within(row).getByRole("heading").textContent),
    ).toEqual(CONFIGURABLE_MODULES.map((m) => m.label));
    expect(screen.getAllByText("Not configured")).toHaveLength(9);
    expect(
      screen.queryByRole("button", { name: "Disable Settings" }),
    ).toBeNull();
    expect(screen.getByText(/Application-wide enforcement/)).toBeVisible();
  });
  it("explicit choices survive reopening and remain isolated by location and key", async () => {
    const user = userEvent.setup();
    const { source, unmount } = await loaded();
    await user.click(screen.getByRole("button", { name: "Enable Tasks" }));
    await screen.findByText("Enabled");
    await user.click(screen.getByRole("button", { name: "Disable Tasks" }));
    await screen.findByText("Disabled");
    expect(screen.getAllByText("Not configured")).toHaveLength(8);
    unmount();
    const next = await loaded(source);
    expect(screen.getByText("Disabled")).toBeVisible();
    next.unmount();
    await loaded(source, { id: "b" });
    expect(screen.getAllByText("Not configured")).toHaveLength(9);
  });
  it("does not call save on opening; failures retain the intended retry", async () => {
    const user = userEvent.setup();
    const demo = createDemoModuleSettingsSource();
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "database_error" })
      .mockImplementation(demo.save);
    await loaded({ ...demo, save });
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Disable Tasks" }));
    expect(
      await screen.findByText(/could not reach the database/),
    ).toBeVisible();
    expect(screen.queryByText("Disabled")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry disable" }));
    expect(await screen.findByText("Disabled")).toBeVisible();
  });
  it("read failure cannot show missing states", async () => {
    const source: ModuleSettingsSource = {
      read: async () => ({ ok: false, code: "schema_missing" }),
      save: vi.fn(),
    };
    render(<LocationModuleSettings location={location} source={source} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not installed/);
    expect(screen.queryByText("Not configured")).toBeNull();
  });
  it("archived read-only, inactive configurable", async () => {
    const first = await loaded(undefined, { archivedAt: "2026-01-01" });
    expect(screen.queryByRole("button", { name: "Enable Tasks" })).toBeNull();
    first.unmount();
    await loaded(undefined, { active: false });
    expect(screen.getByRole("button", { name: "Enable Tasks" })).toBeEnabled();
  });
  it("blocks duplicate submissions while saving", async () => {
    const demo = createDemoModuleSettingsSource();
    let release!: () => void;
    const save = vi.fn(async (input) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return demo.save(input);
    });
    await loaded({ ...demo, save });
    const button = screen.getByRole("button", { name: "Enable Tasks" });
    const user = userEvent.setup();
    await user.dblClick(button);
    expect(save).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    release();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
