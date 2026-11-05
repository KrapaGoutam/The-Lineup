import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./prior-session");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/r/the-monks?tab=tasks&location=old");
});

describe("prior-session (V2-003.005)", () => {
  it("MT-18: after a workspace was open, the next sign-in drops the leftover ?location= (and ?tab=) exactly once", async () => {
    const { noteWorkspaceOpened, clearPriorWorkspaceUrl } = await load();
    noteWorkspaceOpened();
    expect(clearPriorWorkspaceUrl("/r/the-monks")).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(
      "/r/the-monks",
    );
    // one-shot: the URL is not touched again by a later sign-in
    window.history.replaceState(null, "", "/r/the-monks?location=deliberate");
    expect(clearPriorWorkspaceUrl("/r/the-monks")).toBe(false);
    expect(window.location.search).toBe("?location=deliberate");
  });

  it("a deep link opened while signed out (no workspace was ever open) is honoured after sign-in", async () => {
    const { clearPriorWorkspaceUrl } = await load();
    expect(clearPriorWorkspaceUrl("/r/the-monks")).toBe(false);
    expect(window.location.search).toBe("?tab=tasks&location=old");
  });
});
