import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./history-traversal");
}

function stubNavigationType(type: string | null) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    type === null ? [] : ([{ type }] as unknown as PerformanceEntryList),
  );
}

beforeEach(() => {
  vi.spyOn(performance, "now").mockReturnValue(60_000);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("currentNavigationOrigin (V2-003.005)", () => {
  it("a fresh navigation long after load is 'fresh'", async () => {
    stubNavigationType("navigate");
    const { currentNavigationOrigin } = await load();
    expect(currentNavigationOrigin()).toBe("fresh");
  });

  it("MT-09: a popstate just before the render makes it 'history'", async () => {
    stubNavigationType("navigate");
    const { currentNavigationOrigin } = await load();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(currentNavigationOrigin()).toBe("history");
  });

  it("the popstate explanation expires", async () => {
    stubNavigationType("navigate");
    const { currentNavigationOrigin } = await load();
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.spyOn(performance, "now").mockReturnValue(60_000 + 6_000);
    expect(currentNavigationOrigin()).toBe("fresh");
  });

  it("a document that was reloaded or restored by back/forward is classified only while it is young", async () => {
    vi.spyOn(performance, "now").mockReturnValue(2_000);
    stubNavigationType("reload");
    let mod = await load();
    expect(mod.currentNavigationOrigin()).toBe("reload");
    stubNavigationType("back_forward");
    mod = await load();
    expect(mod.currentNavigationOrigin()).toBe("history");
    // 40 s later the same document type no longer describes a new mount.
    vi.spyOn(performance, "now").mockReturnValue(40_000);
    expect(mod.currentNavigationOrigin()).toBe("fresh");
  });

  it("no navigation timing entry (older browsers / jsdom) -> 'fresh'", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    stubNavigationType(null);
    const { currentNavigationOrigin } = await load();
    expect(currentNavigationOrigin()).toBe("fresh");
  });
});
