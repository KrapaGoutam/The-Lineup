import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Location } from "@/features/locations/domain/location";
import type {
  LocationLifecycleReadiness,
  LifecycleBlocker,
} from "@/features/locations/domain/location-lifecycle";
import { LocationLifecycleDialog } from "./location-lifecycle-dialog";
import type { LocationLifecycleSource } from "./location-lifecycle-source";

vi.mock("@/features/locations/actions/location-lifecycle-actions", () => ({
  getLocationLifecycleReadinessAction: vi.fn(),
  listLocationLifecycleEventsAction: vi.fn(),
  transitionLocationLifecycleAction: vi.fn(),
}));

const SESSION: LifecycleBlocker = {
  code: "ACTIVE_SERVICE_SESSIONS",
  count: 1,
  capped: false,
  deactivate: "hard",
  archive: "hard",
};
const TASKS: LifecycleBlocker = {
  code: "OPEN_TASKS",
  count: 2,
  capped: false,
  deactivate: "warning",
  archive: "hard",
};

function location(over: Partial<Location> = {}): Location {
  return {
    id: "loc-nasa",
    organizationId: "org-lt",
    name: "NASA",
    timeZone: "America/Chicago",
    address: {},
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

function readiness(
  status: LocationLifecycleReadiness["status"],
  blockers: LifecycleBlocker[] = [],
): LocationLifecycleReadiness {
  return {
    locationId: "loc-nasa",
    organizationId: "org-lt",
    status,
    canDeactivate: false,
    canReactivate: false,
    canArchive: false,
    canRestoreArchive: false,
    blockers,
    retained: {
      locationAssignments: 3,
      closedServiceSessions: 0,
      shifts: 7,
      finalizedTipPools: 0,
      completedTasks: 0,
      inventoryAdjustments: 0,
      lifecycleEvents: 0,
    },
  };
}

function makeSource(over: Partial<LocationLifecycleSource> = {}) {
  const source: LocationLifecycleSource = {
    kind: "demo",
    loadReadiness: vi.fn(async () => ({
      ok: true as const,
      data: readiness("active"),
    })),
    transition: vi.fn(async ({ location: loc }) => ({
      ok: true as const,
      data: { ...loc, active: false },
    })),
    loadHistory: vi.fn(async () => ({ ok: true as const, data: [] })),
    ...over,
  };
  return source;
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof LocationLifecycleDialog>> & {
    source: LocationLifecycleSource;
  },
) {
  const onClose = vi.fn();
  const onCompleted = vi.fn();
  const onStale = vi.fn();
  render(
    <LocationLifecycleDialog
      organizationId="org-lt"
      organizationName="Liquor Tap"
      location={location()}
      action="deactivate"
      onClose={onClose}
      onCompleted={onCompleted}
      onStale={onStale}
      {...props}
    />,
  );
  return { onClose, onCompleted, onStale };
}

describe("LocationLifecycleDialog (V2-002.005)", () => {
  it("UI-L01: shows location, organization, current state and impact warning", async () => {
    renderDialog({ source: makeSource() });
    expect(
      await screen.findByText("Liquor Tap", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Current state")).toBeInTheDocument();
    expect(screen.getByTestId("lifecycle-badge-active")).toHaveTextContent(
      "Active",
    );
    expect(screen.getByTestId("lifecycle-badge-inactive")).toHaveTextContent(
      "Inactive",
    );
    expect(
      screen.getByText(/Other locations are not affected/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason \(required\)/i)).toBeInTheDocument();
  });

  it("UI-L02: shows a loading state while blockers are being checked", async () => {
    let release!: (v: { ok: true; data: LocationLifecycleReadiness }) => void;
    const source = makeSource({
      loadReadiness: vi.fn(
        () =>
          new Promise<{ ok: true; data: LocationLifecycleReadiness }>(
            (resolve) => (release = resolve),
          ),
      ),
    });
    renderDialog({ source });
    expect(await screen.findByTestId("lifecycle-loading")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
    release({ ok: true, data: readiness("active") });
    await waitFor(() =>
      expect(screen.queryByTestId("lifecycle-loading")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeEnabled();
  });

  it("UI-L03: hard blockers use real counts, block confirmation and promise no auto-cancel", async () => {
    const source = makeSource({
      loadReadiness: vi.fn(async () => ({
        ok: true as const,
        data: readiness("active", [SESSION, TASKS]),
      })),
    });
    renderDialog({ source });
    const box = await screen.findByTestId("lifecycle-blockers");
    expect(box).toHaveTextContent("Cannot deactivate NASA.");
    expect(box).toHaveTextContent("1 active service session");
    expect(box).not.toHaveTextContent("unresolved tasks"); // a warning, not a blocker
    expect(box).toHaveTextContent(/Resolve these items before deactivation/);
    expect(box).toHaveTextContent(/never closed or cancelled for you/i);
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /cancel all|close all/i }),
    ).toBeNull();
  });

  it("UI-L04: warnings are listed but do not block confirmation", async () => {
    const source = makeSource({
      loadReadiness: vi.fn(async () => ({
        ok: true as const,
        data: readiness("active", [TASKS]),
      })),
    });
    renderDialog({ source });
    const warn = await screen.findByTestId("lifecycle-warnings");
    expect(warn).toHaveTextContent("2 unresolved tasks");
    expect(warn).toHaveTextContent(
      /Nothing is closed, cancelled or finalized automatically/,
    );
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeEnabled();
    expect(screen.getByTestId("lifecycle-retained")).toHaveTextContent(
      "7 shifts",
    );
  });

  it("UI-L05: requires a reason and never calls the source without one", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    renderDialog({ source });
    await screen.findByLabelText(/Reason \(required\)/i);
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    expect(
      await screen.findByText("A reason is required."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason/i), "ab");
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    expect(
      await screen.findByText(/at least 3 characters/i),
    ).toBeInTheDocument();
    expect(source.transition).not.toHaveBeenCalled();
  });

  it("UI-L06: success path shows pending text, sends the trimmed reason and reports completion", async () => {
    const user = userEvent.setup();
    let finish!: (v: { ok: true; data: Location }) => void;
    const source = makeSource({
      transition: vi.fn(
        () =>
          new Promise<{ ok: true; data: Location }>(
            (resolve) => (finish = resolve),
          ),
      ),
    });
    const { onCompleted } = renderDialog({ source });
    await screen.findByLabelText(/Reason/i);
    await user.type(screen.getByLabelText(/Reason/i), "  Seasonal closure  ");
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );

    const pending = await screen.findByRole("button", {
      name: "Deactivating…",
    });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(source.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-lt",
        action: "deactivate",
        reason: "Seasonal closure",
      }),
    );

    finish({ ok: true, data: location({ active: false }) });
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onCompleted.mock.calls[0][0]).toMatchObject({ active: false });
  });

  it("UI-L07: a failed transition keeps the dialog open with the error and the typed reason", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      transition: vi.fn(async () => ({
        ok: false as const,
        error: "Unauthorized: location lifecycle requires management authority",
        kind: "UNAUTHORIZED",
      })),
    });
    const { onCompleted } = renderDialog({ source });
    await screen.findByLabelText(/Reason/i);
    await user.type(screen.getByLabelText(/Reason/i), "Planned closure");
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    expect(
      await screen.findByText(/Unauthorized: location lifecycle/),
    ).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Reason/i)).toHaveValue("Planned closure");
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeEnabled();
  });

  it("UI-L08: a transactional blocker refusal (LC001) swaps in the blocker panel", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      transition: vi.fn(async () => ({
        ok: false as const,
        error:
          "Cannot deactivate this location while unresolved operational work exists",
        kind: "BLOCKED",
        blockers: [SESSION],
      })),
    });
    const { onCompleted } = renderDialog({ source });
    await screen.findByLabelText(/Reason/i);
    await user.type(screen.getByLabelText(/Reason/i), "Closing now");
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    const box = await screen.findByTestId("lifecycle-blockers");
    expect(box).toHaveTextContent("1 active service session");
    expect(onCompleted).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
  });

  it("UI-L09: a stale-state conflict asks the manager to refresh", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      transition: vi.fn(async () => ({
        ok: false as const,
        error: "Location state changed: expected active, found inactive",
        kind: "STATE_CONFLICT",
      })),
    });
    const { onStale } = renderDialog({ source });
    await screen.findByLabelText(/Reason/i);
    await user.type(screen.getByLabelText(/Reason/i), "Closing now");
    await user.click(
      screen.getByRole("button", { name: "Deactivate location" }),
    );
    expect(
      await screen.findByText(/changed while you were reviewing it/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh location" }));
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("UI-L10: archive needs the exact location name and a reason", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      loadReadiness: vi.fn(async () => ({
        ok: true as const,
        data: readiness("inactive"),
      })),
      transition: vi.fn(async ({ location: loc }) => ({
        ok: true as const,
        data: { ...loc, active: false, archivedAt: "2026-03-01T00:00:00Z" },
      })),
    });
    const { onCompleted } = renderDialog({
      source,
      location: location({ active: false }),
      action: "archive",
    });
    await screen.findByLabelText(/Type NASA to confirm|Type/i);
    await user.type(screen.getByLabelText(/Reason/i), "Permanently closed");
    await user.type(screen.getByLabelText(/to confirm/i), "nasa");
    await user.click(screen.getByRole("button", { name: "Archive location" }));
    expect(await screen.findByText(/name does not match/i)).toBeInTheDocument();
    expect(source.transition).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/to confirm/i));
    await user.type(screen.getByLabelText(/to confirm/i), "NASA");
    await user.click(screen.getByRole("button", { name: "Archive location" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onCompleted.mock.calls[0][0].archivedAt).toBe(
      "2026-03-01T00:00:00Z",
    );
  });

  it("UI-L11: reactivate and restore do not load blockers and need no typed name", async () => {
    const source = makeSource();
    renderDialog({
      source,
      location: location({ active: false }),
      action: "reactivate",
    });
    expect(
      await screen.findByRole("button", { name: "Reactivate location" }),
    ).toBeEnabled();
    expect(source.loadReadiness).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/to confirm/i)).toBeNull();
  });

  it("UI-L12: an archived location cannot be reactivated from the dialog", async () => {
    renderDialog({
      source: makeSource(),
      location: location({ active: false, archivedAt: "2026-03-01T00:00:00Z" }),
      action: "reactivate",
    });
    expect(
      await screen.findByText(/restore it from the archive first/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reactivate location" }),
    ).toBeDisabled();
  });

  it("UI-L13: a readiness load failure is announced with a working Retry", async () => {
    const user = userEvent.setup();
    const loadReadiness = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Network down" })
      .mockResolvedValueOnce({ ok: true, data: readiness("active") });
    renderDialog({ source: makeSource({ loadReadiness }) });
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Deactivate location" }),
      ).toBeEnabled(),
    );
  });

  it("UI-L14: is fully operable by keyboard (labelled fields, native buttons)", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    const { onCompleted } = renderDialog({ source });
    const reason = await screen.findByLabelText(/Reason/i);
    reason.focus();
    await user.keyboard("Seasonal closure");
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    const confirm = screen.getByRole("button", { name: "Deactivate location" });
    expect(confirm).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });
});
