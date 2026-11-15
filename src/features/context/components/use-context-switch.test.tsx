import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const actions = vi.hoisted(() => ({ setActiveContextAction: vi.fn() }));
const sync = vi.hoisted(() => ({ publishContextEvent: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/context/actions/context-actions", () => actions);
vi.mock("@/features/context/components/context-sync-channel", () => sync);

import { SWITCH_FAILURE_MESSAGE, useContextSwitch } from "./use-context-switch";

const TARGET = {
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organizationSlug: "the-monks",
  organizationName: "The Monks",
  locationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  locationName: "Bbb Bar",
  timeZone: "America/Chicago",
};

beforeEach(() => {
  router.push.mockClear();
  sync.publishContextEvent.mockClear();
  actions.setActiveContextAction.mockReset();
  window.history.replaceState(null, "", "/r/the-monks?tab=tasks");
});

describe("useContextSwitch notifications (V2-003.005)", () => {
  it("announces to other tabs only after the server persisted the switch, then navigates", async () => {
    actions.setActiveContextAction.mockResolvedValue({
      ok: true,
      destination: "/r/the-monks?tab=tasks&location=d",
    });
    const { result } = renderHook(() => useContextSwitch());
    await act(async () => {
      await result.current.switchTo(TARGET);
    });
    expect(sync.publishContextEvent).toHaveBeenCalledTimes(1);
    expect(sync.publishContextEvent).toHaveBeenCalledWith("context_changed");
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/r/the-monks?tab=tasks&location=d",
      ),
    );
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
    "MT-05: a %s switch publishes no success signal and does not navigate",
    async (_name, impl) => {
      actions.setActiveContextAction.mockImplementation(impl);
      const { result } = renderHook(() => useContextSwitch());
      await act(async () => {
        await result.current.switchTo(TARGET);
      });
      expect(sync.publishContextEvent).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(result.current.switchError).toBe(SWITCH_FAILURE_MESSAGE);
      expect(result.current.switchingTo).toBeNull();
    },
  );

  it("MT-06: a second selection while one is in flight is ignored (one request, one announcement)", async () => {
    let release: (value: unknown) => void = () => {};
    actions.setActiveContextAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useContextSwitch());
    let first!: Promise<void>;
    act(() => {
      first = result.current.switchTo(TARGET);
    });
    await act(async () => {
      await result.current.switchTo({ ...TARGET, locationName: "Other" });
    });
    expect(actions.setActiveContextAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ ok: true, destination: "/r/the-monks?location=d" });
      await first;
    });
    expect(sync.publishContextEvent).toHaveBeenCalledTimes(1);
  });
});
