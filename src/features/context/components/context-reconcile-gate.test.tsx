import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  setActiveContextAction: vi.fn(),
  clearActiveContextAction: vi.fn(),
}));
const sync = vi.hoisted(() => ({ publishContextEvent: vi.fn() }));
const nav = vi.hoisted(() => ({
  origin: "fresh" as "fresh" | "reload" | "history",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/r/the-monks",
}));
vi.mock("@/features/context/actions/context-actions", () => actions);
vi.mock("@/features/context/components/context-sync-channel", () => sync);
vi.mock("@/features/context/components/history-traversal", () => ({
  currentNavigationOrigin: () => nav.origin,
}));

import { ContextReconcileGate } from "./context-reconcile-gate";

const TARGET = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  organizationSlug: "the-monks",
  locationId: "22222222-2222-4222-8222-222222222222",
};
const workspace = <div data-testid="workspace">workspace</div>;

beforeEach(() => {
  nav.origin = "fresh";
  sync.publishContextEvent.mockClear();
  router.refresh.mockClear();
  router.replace.mockClear();
  actions.setActiveContextAction.mockReset();
  actions.clearActiveContextAction.mockReset().mockResolvedValue({ ok: true });
  window.history.replaceState(null, "", "/");
});

describe("ContextReconcileGate (V2-003.004)", () => {
  it("renders the workspace immediately when nothing needs reconciling and never calls the server", () => {
    render(
      <ContextReconcileGate target={null}>{workspace}</ContextReconcileGate>,
    );
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(actions.setActiveContextAction).not.toHaveBeenCalled();
  });

  it("PERSIST-20: keeps the workspace UNMOUNTED until the server verified and persisted the selection", async () => {
    let release: (value: unknown) => void = () => {};
    actions.setActiveContextAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    expect(screen.getByTestId("context-reconciling")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(actions.setActiveContextAction).toHaveBeenCalledWith({
      organizationId: TARGET.organizationId,
      locationId: TARGET.locationId,
    });
    await act(async () => {
      release({ ok: true, destination: "/ignored" });
    });
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("context-reconciling")).toBeNull();
  });

  it.each([
    ["refused", async () => ({ ok: false, code: "not_available" })],
    [
      "thrown",
      async () => {
        throw new Error("network");
      },
    ],
  ])(
    "PERSIST-20: a %s reconciliation never opens the workspace and offers recovery",
    async (_name, impl) => {
      actions.setActiveContextAction.mockImplementation(impl);
      render(
        <ContextReconcileGate target={TARGET}>
          {workspace}
        </ContextReconcileGate>,
      );
      expect(
        await screen.findByTestId("context-reconcile-failed"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("workspace")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /nothing has been loaded or changed/i,
      );
    },
  );

  it("retry re-verifies; success then opens the workspace", async () => {
    actions.setActiveContextAction
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: true, destination: "/x" });
    const user = userEvent.setup();
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    await user.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(actions.setActiveContextAction).toHaveBeenCalledTimes(2);
  });

  it("'Choose a location' clears the saved preference and returns to the organization route (no location param)", async () => {
    actions.setActiveContextAction.mockResolvedValue({
      ok: false,
      code: "not_available",
    });
    const user = userEvent.setup();
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    await user.click(
      await screen.findByRole("button", { name: /choose a location/i }),
    );
    expect(actions.clearActiveContextAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/r/the-monks"),
    );
  });

  it("a new target (different verified location) closes the workspace again until it is reconciled", async () => {
    actions.setActiveContextAction.mockResolvedValue({ ok: true });
    const { rerender } = render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    let release: (value: unknown) => void = () => {};
    actions.setActiveContextAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    rerender(
      <ContextReconcileGate
        target={{
          ...TARGET,
          locationId: "33333333-3333-4333-8333-333333333333",
        }}
      >
        {workspace}
      </ContextReconcileGate>,
    );
    expect(screen.queryByTestId("workspace")).toBeNull();
    await act(async () => release({ ok: true }));
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
  });

  it("canonicalizes a workspace URL without ?location= so Server Actions carry the location on screen", () => {
    window.history.replaceState(null, "", "/r/the-monks?tab=tasks");
    render(
      <ContextReconcileGate target={null} activeLocationId={TARGET.locationId}>
        {workspace}
      </ContextReconcileGate>,
    );
    expect(window.location.pathname).toBe("/r/the-monks");
    expect(new URLSearchParams(window.location.search).get("location")).toBe(
      TARGET.locationId,
    );
    expect(new URLSearchParams(window.location.search).get("tab")).toBe(
      "tasks",
    );
  });

  it("does not rewrite non-workspace URLs, existing selections or a still-closed workspace", () => {
    window.history.replaceState(null, "", "/?tab=tasks");
    const { unmount } = render(
      <ContextReconcileGate target={null} activeLocationId={TARGET.locationId}>
        {workspace}
      </ContextReconcileGate>,
    );
    expect(window.location.search).toBe("?tab=tasks");
    unmount();

    const existing = `/r/the-monks?location=${"44444444-4444-4444-8444-444444444444"}`;
    window.history.replaceState(null, "", existing);
    render(
      <ContextReconcileGate target={null} activeLocationId={TARGET.locationId}>
        {workspace}
      </ContextReconcileGate>,
    );
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      existing,
    );
  });
});

describe("ContextReconcileGate (V2-003.005 history / publishing)", () => {
  it.each(["reload", "history"] as const)(
    "NAV: after a %s the URL is NOT silently persisted -- the user is asked and nothing is written",
    async (origin) => {
      nav.origin = origin;
      render(
        <ContextReconcileGate target={TARGET} activeLocationName="Bbb Bar">
          {workspace}
        </ContextReconcileGate>,
      );
      expect(
        await screen.findByTestId("context-reconcile-confirm"),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading")).toHaveTextContent(
        "This page is for Bbb Bar",
      );
      expect(screen.queryByTestId("workspace")).toBeNull();
      expect(actions.setActiveContextAction).not.toHaveBeenCalled();
      expect(sync.publishContextEvent).not.toHaveBeenCalled();
    },
  );

  it("NAV: 'Switch to X' is the deliberate, server-verified action; only then is it persisted and announced", async () => {
    nav.origin = "history";
    actions.setActiveContextAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <ContextReconcileGate target={TARGET} activeLocationName="Bbb Bar">
        {workspace}
      </ContextReconcileGate>,
    );
    await user.click(
      await screen.findByRole("button", { name: /switch to bbb bar/i }),
    );
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(actions.setActiveContextAction).toHaveBeenCalledTimes(1);
    expect(actions.setActiveContextAction).toHaveBeenCalledWith({
      organizationId: TARGET.organizationId,
      locationId: TARGET.locationId,
    });
    expect(sync.publishContextEvent).toHaveBeenCalledWith("context_changed");
  });

  it("NAV: 'Stay on my current location' never writes and returns to the URL without ?location= (tab kept)", async () => {
    nav.origin = "history";
    window.history.replaceState(null, "", "/r/the-monks?location=x&tab=tasks");
    const user = userEvent.setup();
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    await user.click(
      await screen.findByRole("button", { name: /stay on my current/i }),
    );
    expect(actions.setActiveContextAction).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/r/the-monks?tab=tasks");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("PUB: a fresh deep link is persisted and announced to other tabs only after the server confirmed", async () => {
    actions.setActiveContextAction.mockResolvedValue({ ok: true });
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(sync.publishContextEvent).toHaveBeenCalledTimes(1);
    expect(sync.publishContextEvent).toHaveBeenCalledWith("context_changed");
  });

  it("PUB: a refused reconciliation announces nothing", async () => {
    actions.setActiveContextAction.mockResolvedValue({
      ok: false,
      code: "not_available",
    });
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    await screen.findByTestId("context-reconcile-failed");
    expect(sync.publishContextEvent).not.toHaveBeenCalled();
  });

  it("PUB: clearing the saved preference is announced as context_cleared", async () => {
    actions.setActiveContextAction.mockResolvedValue({
      ok: false,
      code: "not_available",
    });
    const user = userEvent.setup();
    render(
      <ContextReconcileGate target={TARGET}>{workspace}</ContextReconcileGate>,
    );
    await user.click(
      await screen.findByRole("button", { name: /choose a location/i }),
    );
    await waitFor(() =>
      expect(sync.publishContextEvent).toHaveBeenCalledWith("context_cleared"),
    );
  });
});
