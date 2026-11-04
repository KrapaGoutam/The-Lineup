import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageData = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("@/lib/page-data", () => ({
  loadPageData: async () => pageData.value,
}));

vi.mock("@/components/restaurant-operations-app", () => ({
  RestaurantOperationsApp: (props: { demoMode: boolean }) => (
    <div data-testid="operations-app" data-demo={String(props.demoMode)} />
  ),
}));

import { ContextUnavailableNotice } from "./context-unavailable-notice";
import { RestaurantEntry } from "./restaurant-entry";

const base = {
  demoMode: false,
  initialUser: null,
  scheduleContext: null,
  tipsContext: null,
  allocationContext: null,
  activeContext: null,
  availableContexts: [],
  contextReason: null,
};

async function renderEntry() {
  render(await RestaurantEntry({ restaurantSlug: "the-monks" }));
}

describe("RestaurantEntry (V2-003.001)", () => {
  beforeEach(() => {
    pageData.value = null;
  });

  it.each(["selection_required", "invalid_context", "error"] as const)(
    "renders the non-interactive context-unavailable state for %s and never the app",
    async (status) => {
      pageData.value = { ...base, contextStatus: status };
      await renderEntry();
      expect(screen.getByTestId("context-unavailable")).toHaveAttribute(
        "data-context-status",
        status,
      );
      expect(screen.queryByTestId("operations-app")).toBeNull();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(screen.queryAllByRole("link")).toHaveLength(0);
    },
  );

  it.each(["resolved", "demo", "unauthenticated", "no_access"] as const)(
    "renders the operations app for %s (signed-out/demo/resolved presentation unchanged)",
    async (status) => {
      pageData.value = {
        ...base,
        demoMode: status === "demo",
        contextStatus: status,
      };
      await renderEntry();
      expect(screen.getByTestId("operations-app")).toBeInTheDocument();
      expect(screen.queryByTestId("context-unavailable")).toBeNull();
    },
  );
});

describe("ContextUnavailableNotice", () => {
  it("lists the eligible locations for selection_required without exposing controls", () => {
    render(
      <ContextUnavailableNotice
        status="selection_required"
        availableContexts={[
          {
            organizationId: "o1",
            organizationSlug: "liquor-tap",
            organizationName: "Liquor Tap",
            locationId: "l1",
            locationName: "NASA",
            timeZone: "America/Chicago",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Choose a location" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Liquor Tap — NASA")).toBeInTheDocument();
  });

  it("states that no data was loaded for invalid and error states", () => {
    const { rerender } = render(
      <ContextUnavailableNotice status="invalid_context" />,
    );
    expect(screen.getByText(/No data has been loaded/)).toBeInTheDocument();
    rerender(<ContextUnavailableNotice status="error" />);
    expect(screen.getByText(/No data has been loaded/)).toBeInTheDocument();
  });
});
