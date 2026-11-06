import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  buildModuleConfigSnapshot,
  type ModuleConfigReadResult,
} from "@/features/modules/domain/module-config";
import { serializeModuleNavigation } from "@/features/modules/domain/module-navigation";
import type { ConfigurableModuleKey } from "@/features/modules/domain/module-registry";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const unread = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, unread: 4 }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/r/test",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/features/context/components/context-sync-guard", () => ({
  ContextSyncGuard: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/context/components/context-reconcile-gate", () => ({
  ContextReconcileGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/context/components/use-context-switch", () => ({
  useContextSwitch: () => ({
    switchingTo: null,
    switchTo: vi.fn(),
    switchError: null,
    dismissSwitchError: vi.fn(),
  }),
}));
vi.mock("@/features/tasks/actions/tasks-actions", () => ({
  getTasksUnreadCountAction: unread,
}));
vi.mock("@/features/tasks/components/tasks-module", () => ({
  TasksModule: () => <div data-testid="workspace-tasks" />,
}));
vi.mock("@/features/tasks/components/opening-reminder-prompt", () => ({
  OpeningReminderPrompt: () => <div data-testid="task-reminder" />,
}));
vi.mock("@/features/allocation/components/allocation-workspace", () => ({
  AllocationWorkspace: () => <div data-testid="workspace-allocation" />,
}));
vi.mock("@/features/recipes/components/recipes-module", () => ({
  RecipesModule: () => <div data-testid="workspace-recipes" />,
}));
vi.mock("@/features/bar-inventory/components/inventory-module", () => ({
  InventoryModule: () => <div data-testid="workspace-inventory" />,
}));
vi.mock("@/features/schedules/components/schedule-workspace", () => ({
  ScheduleWorkspace: () => <div data-testid="workspace-schedule" />,
}));
vi.mock("@/features/team/components/team-workspace", () => ({
  TeamWorkspace: () => <div data-testid="workspace-team" />,
}));
vi.mock("@/features/settings/components/pay-rates-section", () => ({
  PayRatesSection: () => <div />,
}));
vi.mock("@/features/locations/components/location-administration", () => ({
  LocationAdministration: () => <div />,
}));

import { RestaurantOperationsApp } from "./restaurant-operations-app";
const identity = {
  profileId: "owner",
  organizationId: "org",
  locationId: "loc",
};
const user = {
  ...identity,
  name: "Owner",
  role: "owner" as const,
  designation: "owner" as const,
};
const context = {
  organizationId: "org",
  organizationName: "Test",
  organizationSlug: "test",
  locationId: "loc",
  locationName: "A",
  timeZone: "America/Chicago",
  selectedBy: "sole_eligible_location",
};
function snapshot(
  keys: ConfigurableModuleKey[] = [],
  result?: ModuleConfigReadResult,
) {
  return serializeModuleNavigation(
    identity,
    result ??
      buildModuleConfigSnapshot(
        "loc",
        "active",
        keys.map((moduleKey) => ({
          locationId: "loc",
          moduleKey,
          isEnabled: true,
          metadata: {},
          createdAt: "",
          updatedAt: "",
          updatedBy: null,
        })),
      ),
  );
}
const props = {
  demoMode: false,
  restaurantSlug: "test",
  initialUser: user,
  activeContext: context,
};
describe("module navigation shell", () => {
  it("a canceled badge read cannot reject across a context/document switch", async () => {
    unread.mockRejectedValueOnce(new Error("transport canceled"));
    render(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot(["tasks"])}
      />,
    );
    await act(async () => {});
    expect(screen.queryByTestId("tasks-unread-badge")).toBeNull();
  });
  beforeEach(() => {
    window.history.replaceState(null, "", "/r/test");
    vi.clearAllMocks();
  });
  it.each([
    [
      ["tasks", "table_allocation"],
      ["Table Allocation", "Tasks"],
    ],
    [["table_allocation"], ["Table Allocation"]],
    [["tasks"], ["Tasks"]],
    [[], []],
  ] as [ConfigurableModuleKey[], string[]][])(
    "filters primary nav and mobile dock for %j",
    async (keys, labels) => {
      const { container } = render(
        <RestaurantOperationsApp
          {...props}
          moduleNavigation={snapshot(keys)}
        />,
      );
      await act(async () => {});
      expect(
        [...container.querySelectorAll('[data-nav-tier="primary"]')].map((n) =>
          n.textContent?.replace(/4$/, ""),
        ),
      ).toEqual(labels);
      const dock = screen.getByRole("navigation", {
        name: "Mobile navigation",
      });
      expect(within(dock).getAllByRole("button")).toHaveLength(keys.length + 1);
      expect(
        within(dock).getByRole("button", { name: "More" }),
      ).toBeInTheDocument();
      if (!keys.includes("tasks")) {
        expect(screen.queryByTestId("task-reminder")).toBeNull();
        expect(screen.queryByTestId("tasks-unread-badge")).toBeNull();
        expect(unread).not.toHaveBeenCalled();
      }
      if (keys.length === 0) {
        expect(
          screen.getByText(
            "No operational modules are enabled for this location.",
          ),
        ).toBeVisible();
        expect(container.querySelector('[data-nav-tier="primary"]')).toBeNull();
      }
    },
  );
  it("rejects recipe deep links before mount, cleans details and retains location", async () => {
    window.history.replaceState(
      null,
      "",
      "/r/test?location=loc&tab=recipes&recipe=secret&mode=edit",
    );
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <RestaurantOperationsApp {...props} moduleNavigation={snapshot()} />,
    );
    expect(screen.queryByTestId("workspace-recipes")).toBeNull();
    await waitFor(() =>
      expect(window.location.search).toBe("?location=loc&tab=settings"),
    );
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });
  it("browser history cannot mount a missing tab", async () => {
    render(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot(["tasks"])}
      />,
    );
    act(() => {
      window.history.pushState(null, "", "/r/test?tab=recipes&recipe=old");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByTestId("workspace-recipes")).toBeNull();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByTestId("workspace-tasks")).toBeVisible();
  });
  it("server refresh unmounts a disabled tab immediately", async () => {
    window.history.replaceState(null, "", "/r/test?tab=bar-inventory");
    const view = render(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot(["bar_inventory", "tasks"])}
      />,
    );
    await act(async () => {});
    expect(screen.getByTestId("workspace-inventory")).toBeVisible();
    view.rerender(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot(["tasks"])}
      />,
    );
    expect(screen.queryByTestId("workspace-inventory")).toBeNull();
    expect(screen.getByTestId("workspace-tasks")).toBeVisible();
  });
  it("does not rewrite a history destination using the previous context snapshot", () => {
    window.history.replaceState(
      null,
      "",
      "/r/test?location=other&tab=recipes&recipe=old",
    );
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot(["tasks"])}
      />,
    );
    expect(screen.getByText("Loading verified location…")).toBeVisible();
    expect(screen.queryByTestId("workspace-tasks")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });
  it("Settings-only More preserves Settings, passcode, appearance and sign-out", async () => {
    render(
      <RestaurantOperationsApp {...props} moduleNavigation={snapshot()} />,
    );
    await userEvent.click(
      within(
        screen.getByRole("navigation", { name: "Mobile navigation" }),
      ).getByRole("button", { name: "More" }),
    );
    const more = screen.getByRole("dialog", { name: "More" });
    expect(
      within(more).getByRole("button", { name: /Settings/ }),
    ).toBeVisible();
    expect(
      within(more).getByRole("button", { name: "Change passcode" }),
    ).toBeVisible();
    expect(
      within(more).getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
    expect(within(more).queryByRole("button", { name: "Recipes" })).toBeNull();
  });
  it("read failure exposes a distinct recovery state", async () => {
    render(
      <RestaurantOperationsApp
        {...props}
        moduleNavigation={snapshot([], {
          status: "unavailable",
          reason: "database_error",
        })}
      />,
    );
    expect(
      screen.getByText(
        "Module availability could not be verified for this location.",
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh module availability" }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });
});
