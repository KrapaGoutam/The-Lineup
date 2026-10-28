import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogSnapshot } from "../domain/inventory-types";

const getSnapshot = vi.fn();
const runCommand = vi.fn();
vi.mock("../actions/inventory-actions", () => ({
  getCatalogSnapshotAction: (...args: unknown[]) => getSnapshot(...args),
  runCatalogCommandAction: (...args: unknown[]) => runCommand(...args),
}));

import {
  OFFLINE_READ_MESSAGE,
  OFFLINE_WRITE_MESSAGE,
  useCatalogController,
} from "./use-catalog-controller";

const viewer = {
  profileId: "p1",
  name: "Mona",
  designation: "manager",
} as const;

const snapshot = (tag: string): CatalogSnapshot => ({
  vendors: [],
  categories: [],
  subcategories: [],
  products: [],
  stock: [],
  loadedAt: tag,
});

/** A read the test finishes by hand, so overlap can be arranged. */
function deferred() {
  let finish!: (tag: string) => void;
  const promise = new Promise((resolve) => {
    finish = (tag) => resolve({ ok: true, data: snapshot(tag) });
  });
  return { promise, finish };
}

const mount = () =>
  renderHook(() =>
    useCatalogController({
      demo: null,
      restaurantSlug: "the-lineup",
      viewer,
      onSessionInvalid: undefined,
    }),
  );

beforeEach(() => {
  getSnapshot.mockReset();
  runCommand.mockReset();
});

describe("useCatalogController re-reads (BI-9: notify -> refetch)", () => {
  it("loads once on mount", async () => {
    getSnapshot.mockResolvedValue({ ok: true, data: snapshot("first") });
    const { result } = mount();
    await act(async () => {});
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot?.loadedAt).toBe("first");
    expect(result.current.loading).toBe(false);
  });

  it("a background re-read never shows the Refreshing state", async () => {
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("first") });
    const { result } = mount();
    await act(async () => {});

    const second = deferred();
    getSnapshot.mockReturnValueOnce(second.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh({ background: true });
    });
    expect(result.current.loading).toBe(false);
    await act(async () => {
      second.finish("second");
      await pending;
    });
    expect(result.current.snapshot?.loadedAt).toBe("second");
    expect(result.current.loading).toBe(false);
  });

  it("a manual refresh does show it, and clears it afterwards", async () => {
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("first") });
    const { result } = mount();
    await act(async () => {});

    const second = deferred();
    getSnapshot.mockReturnValueOnce(second.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      second.finish("second");
      await pending;
    });
    expect(result.current.loading).toBe(false);
  });

  it("a signal that arrives mid-read is not lost: exactly one more read follows", async () => {
    const first = deferred();
    getSnapshot.mockReturnValueOnce(first.promise);
    const { result } = mount();
    await act(async () => {});
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    // Three change signals while the first read is still out.
    const reread = deferred();
    getSnapshot.mockReturnValueOnce(reread.promise);
    let calls!: Promise<void>[];
    act(() => {
      calls = [
        result.current.refresh({ background: true }),
        result.current.refresh({ background: true }),
        result.current.refresh({ background: true }),
      ];
    });
    expect(getSnapshot).toHaveBeenCalledTimes(1); // still only the first read

    await act(async () => {
      first.finish("stale");
      await Promise.resolve();
    });
    // The first read may predate the change, so a second one runs -- once.
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => {
      reread.finish("fresh");
      await Promise.all(calls);
    });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot?.loadedAt).toBe("fresh");
  });

  it("a failed background re-read keeps the last good snapshot on screen", async () => {
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("first") });
    const { result } = mount();
    await act(async () => {});

    getSnapshot.mockResolvedValueOnce({ ok: false, error: "Network down" });
    await act(async () => {
      await result.current.refresh({ background: true });
    });
    expect(result.current.snapshot?.loadedAt).toBe("first");
    expect(result.current.loadError).toBe("Network down");

    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("third") });
    await act(async () => {
      await result.current.refresh({ background: true });
    });
    expect(result.current.loadError).toBeNull();
    expect(result.current.snapshot?.loadedAt).toBe("third");
  });

  it("re-rendering with a new onSessionInvalid every time never re-reads (the shell re-renders every second)", async () => {
    getSnapshot.mockResolvedValue({ ok: true, data: snapshot("first") });
    const { rerender } = renderHook(() =>
      useCatalogController({
        demo: null,
        restaurantSlug: "the-lineup",
        viewer,
        // A fresh function on every render, like the shell's forceSignOut.
        onSessionInvalid: () => {},
      }),
    );
    await act(async () => {});
    for (let i = 0; i < 30; i += 1) rerender();
    await act(async () => {});
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("the newest onSessionInvalid is the one that runs", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("first") });
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useCatalogController({
          demo: null,
          restaurantSlug: "the-lineup",
          viewer,
          onSessionInvalid: cb,
        }),
      { initialProps: { cb: first } },
    );
    await act(async () => {});
    rerender({ cb: latest });
    getSnapshot.mockResolvedValueOnce({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    await act(async () => {
      await result.current.refresh({ background: true });
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("a first load that cannot reach the server says so, instead of showing a skeleton forever", async () => {
    getSnapshot.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = mount();
    await act(async () => {});
    expect(result.current.snapshot).toBeNull();
    expect(result.current.loadError).toBe(OFFLINE_READ_MESSAGE);
    expect(result.current.loading).toBe(false);

    // And it recovers when the connection does.
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("back") });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.loadError).toBeNull();
    expect(result.current.snapshot?.loadedAt).toBe("back");
  });

  it("an offline background re-read keeps the data and reports the problem", async () => {
    getSnapshot.mockResolvedValueOnce({ ok: true, data: snapshot("first") });
    const { result } = mount();
    await act(async () => {});
    getSnapshot.mockRejectedValueOnce(new Error("Failed to fetch"));
    await act(async () => {
      await result.current.refresh({ background: true });
    });
    expect(result.current.snapshot?.loadedAt).toBe("first");
    expect(result.current.loadError).toBe(OFFLINE_READ_MESSAGE);
  });

  it("a write that cannot reach the server returns an error to its caller, never a rejection", async () => {
    getSnapshot.mockResolvedValue({ ok: true, data: snapshot("first") });
    runCommand.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = mount();
    await act(async () => {});
    let outcome: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      outcome = await result.current.run({
        type: "vendorCreate",
        name: "X",
        notes: null,
      } as never);
    });
    expect(outcome).toEqual({ ok: false, error: OFFLINE_WRITE_MESSAGE });
  });

  it("in demo mode the snapshot keeps one identity while the shell rebuilds the binding every second", () => {
    const state = {
      vendors: [],
      categories: [],
      subcategories: [],
      products: [],
      stock: [],
    };
    const { result, rerender } = renderHook(() =>
      useCatalogController({
        // A new binding object each render, like the shell's per-second clock.
        demo: { state, setState: vi.fn() },
        restaurantSlug: "the-lineup",
        viewer,
      }),
    );
    const first = result.current.snapshot;
    for (let i = 0; i < 10; i += 1) rerender();
    expect(result.current.snapshot).toBe(first);
  });

  it("an invalid session signs out and stops re-reading", async () => {
    const onSessionInvalid = vi.fn();
    getSnapshot.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    renderHook(() =>
      useCatalogController({
        demo: null,
        restaurantSlug: "the-lineup",
        viewer,
        onSessionInvalid,
      }),
    );
    await act(async () => {});
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });
});
