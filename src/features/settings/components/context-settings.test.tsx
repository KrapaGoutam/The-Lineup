import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), admin: vi.fn() }));
vi.mock("../actions/account-recovery-actions", () => ({
  loadAccountRecoveryAction: mocks.account,
}));
vi.mock("@/features/locations/actions/location-admin-actions", () => ({
  getLocationAdminContextAction: mocks.admin,
}));
vi.mock("@/features/locations/components/location-administration", () => ({
  LocationAdministration: () => <div>Location administration</div>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ContextSettings } from "./context-settings";
beforeEach(() => {
  vi.clearAllMocks();
});
it("keeps canonical Overall location administration independent of legacy passcode membership", async () => {
  mocks.account.mockResolvedValue({ ok: false });
  mocks.admin.mockResolvedValue({
    ok: true,
    data: { canAdministerLocations: true },
  });
  render(<ContextSettings restaurantSlug="verified-route" onBack={() => {}} />);
  expect(
    await screen.findByRole("button", { name: "Manage locations and modules" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Staff / Account Recovery" }),
  ).toBeNull();
});
it("staff retains account controls without administrative recovery targets", async () => {
  mocks.account.mockResolvedValue({
    ok: true,
    user: {
      profileId: "staff",
      organizationId: "org",
      name: "Staff",
      role: "server",
      designation: "staff",
    },
    team: [],
  });
  mocks.admin.mockResolvedValue({
    ok: true,
    data: { canAdministerLocations: false },
  });
  render(<ContextSettings restaurantSlug="verified-route" onBack={() => {}} />);
  expect(
    await screen.findByRole("button", { name: "Change your passcode" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Manage locations and modules" }),
  ).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Staff / Account Recovery" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
});
it("failed reads leave recovery and sign-out usable without admin controls", async () => {
  mocks.account.mockRejectedValue(new Error("unavailable"));
  mocks.admin.mockRejectedValue(new Error("unavailable"));
  render(<ContextSettings restaurantSlug="verified-route" onBack={() => {}} />);
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Back to location recovery" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Manage locations and modules" }),
  ).toBeNull();
});
