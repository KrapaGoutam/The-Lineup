import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageData = vi.hoisted(() => ({ value: null as unknown }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);

vi.mock("next/navigation", () => ({ useRouter: () => router, redirect }));

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
  availableContextsFailed: false,
  redirectTo: null,
};

async function renderEntry() {
  render(await RestaurantEntry({ restaurantSlug: "the-monks" }));
}

describe("RestaurantEntry (V2-003.001)", () => {
  beforeEach(() => {
    pageData.value = null;
  });

  it.each(["selection_required", "invalid_context", "error"] as const)(
    "renders the context-unavailable state for %s and never the app",
    async (status) => {
      pageData.value = { ...base, contextStatus: status };
      await renderEntry();
      expect(screen.getByTestId("context-unavailable")).toHaveAttribute(
        "data-context-status",
        status,
      );
      expect(screen.queryByTestId("operations-app")).toBeNull();
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

describe("ContextUnavailableNotice (V2-003.002 recovery)", () => {
  const nasa = {
    organizationId: "o1",
    organizationSlug: "liquor-tap",
    organizationName: "Liquor Tap",
    locationId: "l1",
    locationName: "NASA",
    timeZone: "America/Chicago",
  };
  const webster = {
    organizationId: "o2",
    organizationSlug: "the-monks",
    organizationName: "Monks",
    locationId: "l2",
    locationName: "Webster",
    timeZone: "America/Chicago",
  };

  beforeEach(() => {
    router.push.mockClear();
    router.refresh.mockClear();
  });

  it("SW-14: selection_required offers authorized choices, grouped, and navigates with the explicit location", async () => {
    const user = userEvent.setup();
    render(
      <ContextUnavailableNotice
        status="selection_required"
        availableContexts={[nasa, webster]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Choose a location" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Liquor Tap" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Webster" }));
    expect(router.push).toHaveBeenCalledWith("/r/the-monks?location=l2");
    // Only authorized contexts were ever offered.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("invalid_context offers reselection and a revalidating retry", async () => {
    const user = userEvent.setup();
    render(
      <ContextUnavailableNotice
        status="invalid_context"
        availableContexts={[nasa]}
      />,
    );
    expect(screen.getByText(/No data has been loaded/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "NASA" }));
    expect(router.push).toHaveBeenCalledWith("/r/liquor-tap?location=l1");
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("invalid_context with no eligible list does not invent a context", () => {
    render(<ContextUnavailableNotice status="invalid_context" />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("error shows retry only and never lists locations", async () => {
    const user = userEvent.setup();
    render(
      <ContextUnavailableNotice status="error" availableContexts={[nasa]} />,
    );
    expect(screen.queryByRole("button", { name: "NASA" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("a failed location load is announced, not shown as an empty list", () => {
    render(
      <ContextUnavailableNotice
        status="selection_required"
        availableContextsFailed
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t load/i);
  });

  it("V2-003.003: redirects to the server-built destination and renders nothing else", async () => {
    pageData.value = {
      ...base,
      contextStatus: "no_access",
      redirectTo: "/r/liquor-tap?location=loc-1",
    };
    await expect(
      RestaurantEntry({ restaurantSlug: "the-monks", globalEntry: true }),
    ).rejects.toThrow("NEXT_REDIRECT:/r/liquor-tap?location=loc-1");
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("V2-003.003: never redirects without a server-provided destination", async () => {
    redirect.mockClear();
    pageData.value = { ...base, contextStatus: "no_access" };
    await renderEntry();
    expect(redirect).not.toHaveBeenCalled();
  });
});
