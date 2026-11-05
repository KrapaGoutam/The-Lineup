import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const actions = vi.hoisted(() => ({
  setActiveContextAction: vi.fn(),
  clearActiveContextAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/context/actions/context-actions", () => actions);

import { ContextReconcileGate } from "./context-reconcile-gate";

const TARGET = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  organizationSlug: "the-monks",
  locationId: "22222222-2222-4222-8222-222222222222",
};
const workspace = <div data-testid="workspace">workspace</div>;

beforeEach(() => {
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
