import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  verifyWorkspaceContextAction: vi.fn(),
  setActiveContextAction: vi.fn(),
}));
const sync = vi.hoisted(() => ({
  handler: null as null | ((message: unknown) => void),
  unsubscribe: vi.fn(),
  publishContextEvent: vi.fn(),
}));
const prior = vi.hoisted(() => ({ noteWorkspaceOpened: vi.fn() }));
const nav = vi.hoisted(() => ({
  origin: "fresh" as "fresh" | "reload" | "history",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/r/the-monks",
}));
vi.mock("@/features/context/actions/context-actions", () => actions);
vi.mock("@/features/context/components/context-sync-channel", () => ({
  subscribeContextEvents: (handler: (message: unknown) => void) => {
    sync.handler = handler;
    return sync.unsubscribe;
  },
  publishContextEvent: sync.publishContextEvent,
}));
vi.mock("@/features/context/components/prior-session", () => prior);
vi.mock("@/features/context/components/history-traversal", () => ({
  currentNavigationOrigin: () => nav.origin,
}));

import {
  ContextSyncGuard,
  PASSIVE_CHECK_MIN_INTERVAL_MS,
  useReportStaleContext,
} from "./context-sync-guard";

const EXPECTED = {
  profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  locationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const CONTEXTS = [
  {
    organizationId: EXPECTED.organizationId,
    organizationSlug: "the-monks",
    organizationName: "The Monks",
    locationId: EXPECTED.locationId,
    locationName: "Aaa Bar",
    timeZone: "America/Chicago",
  },
  {
    organizationId: EXPECTED.organizationId,
    organizationSlug: "the-monks",
    organizationName: "The Monks",
    locationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    locationName: "Bbb Bar",
    timeZone: "America/Chicago",
  },
];
const STALE = { status: "stale", reason: "location_changed" } as const;

let now = 1_000_000;
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}
const onRecovered = vi.fn();
function Workspace() {
  const report = useReportStaleContext();
  return (
    <div data-testid="workspace">
      <button onClick={report}>simulate refused action</button>
    </div>
  );
}
function mount(props: Partial<Parameters<typeof ContextSyncGuard>[0]> = {}) {
  return render(
    <ContextSyncGuard
      expected={EXPECTED}
      contexts={CONTEXTS}
      onRecovered={onRecovered}
      {...props}
    >
      <Workspace />
    </ContextSyncGuard>,
  );
}
const calls = () => actions.verifyWorkspaceContextAction.mock.calls.length;
const broadcast = () =>
  act(async () => {
    sync.handler?.({ v: 1, type: "context_changed" });
  });

beforeEach(() => {
  vi.spyOn(Date, "now").mockImplementation(() => now);
  now = 1_000_000;
  nav.origin = "fresh";
  prior.noteWorkspaceOpened.mockClear();
  sync.handler = null;
  sync.unsubscribe.mockClear();
  sync.publishContextEvent.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
  onRecovered.mockClear();
  actions.verifyWorkspaceContextAction
    .mockReset()
    .mockResolvedValue({ status: "consistent" });
  actions.setActiveContextAction.mockReset();
  setVisibility("visible");
  window.history.replaceState(null, "", "/r/the-monks?location=x&tab=tasks");
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextSyncGuard detection (V2-003.005)", () => {
  it("a consistent tab renders its workspace and asks the server nothing on mount (no polling)", async () => {
    mount();
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    await act(async () => {});
    expect(calls()).toBe(0);
  });

  it("MT-02: a broadcast triggers a SERVER check; a stale verdict unmounts the workspace and blocks it", async () => {
    actions.verifyWorkspaceContextAction.mockResolvedValue(STALE);
    mount();
    await broadcast();
    expect(await screen.findByTestId("context-stale")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(screen.getByRole("heading")).toHaveTextContent(
      "Your active location changed in another tab",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /refresh your workspace before continuing/i,
    );
    // Never the misleading "no location" copy for a stale workspace.
    expect(document.body).not.toHaveTextContent(/no location is set up/i);
  });

  it("the check sends only the on-screen expectation; the broadcast payload is never forwarded or trusted", async () => {
    mount();
    await act(async () => {
      sync.handler?.({
        v: 1,
        type: "context_changed",
        locationId: "99999999-9999-4999-8999-999999999999",
      });
    });
    expect(actions.verifyWorkspaceContextAction).toHaveBeenCalledWith(EXPECTED);
    expect(
      JSON.stringify(actions.verifyWorkspaceContextAction.mock.calls),
    ).not.toContain("99999999");
  });

  it("a consistent verdict after a broadcast leaves the workspace untouched (no refresh loop)", async () => {
    mount();
    await broadcast();
    await act(async () => {});
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("an outage (throw / unavailable) concludes nothing: the tab is NOT locked out", async () => {
    mount();
    actions.verifyWorkspaceContextAction.mockRejectedValueOnce(
      new Error("net"),
    );
    await broadcast();
    actions.verifyWorkspaceContextAction.mockResolvedValueOnce({
      status: "unavailable",
    });
    await broadcast();
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
  });

  it("MT-08: focus re-checks, but passive triggers are throttled and hidden tabs never check", async () => {
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(calls()).toBe(1);
    now += PASSIVE_CHECK_MIN_INTERVAL_MS - 1;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(calls()).toBe(1);
    now += 2;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(calls()).toBe(2);
    setVisibility("hidden");
    now += 60_000;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(calls()).toBe(2);
  });

  it("MT-08: a bfcache restore (pageshow persisted) re-checks immediately; an ordinary pageshow does not", async () => {
    mount();
    await act(async () => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: false }),
      );
    });
    expect(calls()).toBe(0);
    await act(async () => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(calls()).toBe(1);
  });

  it("MT-09: a workspace mounted after a history traversal is verified once", async () => {
    nav.origin = "history";
    actions.verifyWorkspaceContextAction.mockResolvedValue(STALE);
    mount();
    expect(await screen.findByTestId("context-stale")).toBeInTheDocument();
    expect(calls()).toBe(1);
  });

  it("MT-06: broadcasts arriving during a check are coalesced into exactly one follow-up", async () => {
    let release: (value: unknown) => void = () => {};
    actions.verifyWorkspaceContextAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    mount();
    await broadcast();
    await broadcast();
    await broadcast();
    expect(calls()).toBe(1);
    await act(async () => release({ status: "consistent" }));
    await waitFor(() => expect(calls()).toBe(2));
  });

  it("MT-11/12: a protected action the server refused blocks the workspace IMMEDIATELY, then refines the reason", async () => {
    const user = userEvent.setup();
    actions.verifyWorkspaceContextAction.mockResolvedValue({
      status: "stale",
      reason: "access_changed",
    });
    mount();
    await user.click(screen.getByRole("button", { name: /simulate refused/i }));
    expect(await screen.findByTestId("context-stale")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("context-stale")).toHaveAttribute(
        "data-stale-reason",
        "access_changed",
      ),
    );
  });

  it("MT-10: unmounting removes the subscription and every window/document listener", async () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const { unmount } = mount();
    unmount();
    expect(sync.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeWindow.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["focus", "online", "pageshow"]),
    );
    expect(removeDocument.mock.calls.map((c) => c[0])).toContain(
      "visibilitychange",
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(calls()).toBe(0);
  });

  it("MT-18: a real signed-in workspace is remembered so the next sign-in cannot inherit its location; demo never is", () => {
    mount();
    expect(prior.noteWorkspaceOpened).toHaveBeenCalledTimes(1);
  });

  it("demo / no context: pass-through, no subscription, no server calls", async () => {
    mount({ expected: null });
    expect(prior.noteWorkspaceOpened).not.toHaveBeenCalled();
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(sync.handler).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(calls()).toBe(0);
  });
});

describe("ContextSyncGuard stale panel and recovery", () => {
  async function goStale(verdict: unknown = STALE) {
    actions.verifyWorkspaceContextAction.mockResolvedValue(verdict);
    const view = mount();
    await broadcast();
    await screen.findByTestId("context-stale");
    return view;
  }

  it("moves focus to the primary action and offers 44px-high controls", async () => {
    await goStale();
    const refresh = screen.getByRole("button", { name: /refresh workspace/i });
    await waitFor(() => expect(refresh).toHaveFocus());
    expect(refresh.className).toContain("min-h-11");
    expect(
      screen.getByRole("button", { name: /choose a location/i }).className,
    ).toContain("min-h-11");
  });

  it("MT-17: signed_out and different_user show only the refresh action and no location list", async () => {
    await goStale({ status: "signed_out" });
    expect(screen.getByRole("heading")).toHaveTextContent(/signed out/i);
    expect(
      screen.queryByRole("button", { name: /choose a location/i }),
    ).toBeNull();
  });

  it("MT-18: a different account shows no names or ids and no location picker", async () => {
    await goStale({ status: "stale", reason: "different_user" });
    expect(screen.getByRole("heading")).toHaveTextContent(
      /different account is signed in/i,
    );
    expect(document.body).not.toHaveTextContent(/Aaa Bar|Bbb Bar|The Monks/);
    expect(
      screen.queryByRole("button", { name: /choose a location/i }),
    ).toBeNull();
  });

  it("the picker is withheld when the location list could not be loaded", async () => {
    actions.verifyWorkspaceContextAction.mockResolvedValue(STALE);
    mount({ contextsUnavailable: true });
    await broadcast();
    await screen.findByTestId("context-stale");
    expect(
      screen.queryByRole("button", { name: /choose a location/i }),
    ).toBeNull();
  });

  it("MT-03: Refresh navigates to the SAME path WITHOUT ?location= (tab kept), never writing the cookie, then re-seeds once the server agrees", async () => {
    const user = userEvent.setup();
    await goStale();
    actions.verifyWorkspaceContextAction.mockResolvedValue({
      status: "consistent",
    });
    await user.click(
      screen.getByRole("button", { name: /refresh workspace/i }),
    );
    expect(router.replace).toHaveBeenCalledWith("/r/the-monks?tab=tasks");
    expect(router.refresh).toHaveBeenCalled();
    await waitFor(() => expect(onRecovered).toHaveBeenCalledTimes(1));
    expect(actions.setActiveContextAction).not.toHaveBeenCalled();
    expect(sync.publishContextEvent).not.toHaveBeenCalled();
  });

  it("MT-15: when the server now operates on another organization, Refresh goes to THAT organization route (not the old slug)", async () => {
    const user = userEvent.setup();
    await goStale({
      status: "stale",
      reason: "location_changed",
      organizationSlug: "liquor-tap",
    });
    await user.click(
      screen.getByRole("button", { name: /refresh workspace/i }),
    );
    expect(router.replace).toHaveBeenCalledWith("/r/liquor-tap?tab=tasks");
  });

  it("a refresh the server still disagrees with stays closed and explains it (no loop, no re-seed)", async () => {
    const user = userEvent.setup();
    await goStale();
    await user.click(
      screen.getByRole("button", { name: /refresh workspace/i }),
    );
    expect(
      await screen.findByText(/couldn.t confirm your workspace yet/i),
    ).toBeInTheDocument();
    expect(onRecovered).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("MT-04: Choose a location uses the existing server-verified selection and announces only on success", async () => {
    const user = userEvent.setup();
    await goStale();
    actions.setActiveContextAction.mockResolvedValue({
      ok: true,
      destination: "/r/the-monks?location=dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    await user.click(
      screen.getByRole("button", { name: /choose a location/i }),
    );
    await user.click(screen.getByRole("button", { name: "Bbb Bar" }));
    expect(actions.setActiveContextAction).toHaveBeenCalledWith({
      organizationId: EXPECTED.organizationId,
      locationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      tab: "tasks",
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/r/the-monks?location=dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ),
    );
    expect(sync.publishContextEvent).toHaveBeenCalledWith("context_changed");
  });

  it("MT-04: choosing the location this tab ALREADY shows (it was moved back) lifts the block instead of leaving it stuck", async () => {
    const user = userEvent.setup();
    await goStale();
    actions.verifyWorkspaceContextAction.mockResolvedValue({
      status: "consistent",
    });
    actions.setActiveContextAction.mockResolvedValue({
      ok: true,
      destination: "/r/the-monks?location=" + EXPECTED.locationId,
    });
    await user.click(
      screen.getByRole("button", { name: /choose a location/i }),
    );
    await user.click(screen.getByRole("button", { name: "Aaa Bar" }));
    await waitFor(() => expect(onRecovered).toHaveBeenCalledTimes(1));
  });

  it("a refused selection does NOT lift the block", async () => {
    const user = userEvent.setup();
    await goStale();
    actions.setActiveContextAction.mockResolvedValue({
      ok: false,
      code: "not_available",
    });
    await user.click(
      screen.getByRole("button", { name: /choose a location/i }),
    );
    await user.click(screen.getByRole("button", { name: "Aaa Bar" }));
    await screen.findAllByRole("alert");
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("MT-05: a refused selection shows the error, navigates nowhere and publishes nothing", async () => {
    const user = userEvent.setup();
    await goStale();
    actions.setActiveContextAction.mockResolvedValue({
      ok: false,
      code: "not_available",
    });
    await user.click(
      screen.getByRole("button", { name: /choose a location/i }),
    );
    await user.click(screen.getByRole("button", { name: "Bbb Bar" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(document.body).toHaveTextContent(
      /couldn.t switch to that location/i,
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(sync.publishContextEvent).not.toHaveBeenCalled();
  });
});
