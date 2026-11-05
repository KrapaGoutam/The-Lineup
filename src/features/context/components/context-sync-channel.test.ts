import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeChannel {
  static instances: FakeChannel[] = [];
  static throwOnConstruct = false;
  static throwOnPost = false;
  posted: unknown[] = [];
  listeners = new Set<(event: { data: unknown }) => void>();
  constructor(public name: string) {
    if (FakeChannel.throwOnConstruct) throw new Error("blocked");
    FakeChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    if (FakeChannel.throwOnPost) throw new Error("closed");
    this.posted.push(data);
  }
  addEventListener(_type: string, fn: (event: { data: unknown }) => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_type: string, fn: (event: { data: unknown }) => void) {
    this.listeners.delete(fn);
  }
  emit(data: unknown) {
    for (const listener of [...this.listeners]) listener({ data });
  }
}

const OTHER = "11111111-2222-4333-8444-555555555555";

async function load() {
  vi.resetModules();
  return import("./context-sync-channel");
}

beforeEach(() => {
  FakeChannel.instances = [];
  FakeChannel.throwOnConstruct = false;
  FakeChannel.throwOnPost = false;
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("context-sync-channel (V2-003.005)", () => {
  it("MT-01: publishes a minimal, id-free message on the versioned channel", async () => {
    const { publishContextEvent } = await load();
    publishContextEvent("context_changed");
    const channel = FakeChannel.instances[0];
    expect(channel.name).toBe("lineup:active-context:v1");
    expect(channel.posted).toHaveLength(1);
    const message = channel.posted[0] as Record<string, unknown>;
    expect(Object.keys(message).sort()).toEqual(["at", "source", "type", "v"]);
    expect(message.type).toBe("context_changed");
  });

  it("uses ONE channel per document however many subscribers come and go", async () => {
    const { publishContextEvent, subscribeContextEvents } = await load();
    const off1 = subscribeContextEvents(() => {});
    const off2 = subscribeContextEvents(() => {});
    publishContextEvent("signed_out");
    off1();
    off2();
    expect(FakeChannel.instances).toHaveLength(1);
  });

  it("delivers a valid message from ANOTHER tab to a subscriber", async () => {
    const { subscribeContextEvents } = await load();
    const handler = vi.fn();
    subscribeContextEvents(handler);
    FakeChannel.instances[0].emit({
      v: 1,
      type: "context_changed",
      source: OTHER,
      at: 5,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ type: "context_changed" });
  });

  it("ignores its own events (no echo loop) and malformed/forged messages", async () => {
    const { publishContextEvent, subscribeContextEvents } = await load();
    const handler = vi.fn();
    subscribeContextEvents(handler);
    publishContextEvent("context_changed");
    const channel = FakeChannel.instances[0];
    // Re-deliver our own message as the channel might in another instance.
    channel.emit(channel.posted[0]);
    channel.emit({ v: 1, type: "grant_access", source: OTHER, at: 1 });
    channel.emit({
      v: 1,
      type: "context_changed",
      source: OTHER,
      at: 1,
      locationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    channel.emit("context_changed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("MT-10: unsubscribing removes the listener (no dangling handlers after unmount) and is idempotent", async () => {
    const { subscribeContextEvents } = await load();
    const handler = vi.fn();
    const off = subscribeContextEvents(handler);
    off();
    off();
    FakeChannel.instances[0].emit({
      v: 1,
      type: "signed_out",
      source: OTHER,
      at: 1,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(FakeChannel.instances[0].listeners.size).toBe(0);
  });

  it("MT-07: BroadcastChannel unavailable -> everything is a silent no-op", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const {
      isContextSyncSupported,
      publishContextEvent,
      subscribeContextEvents,
    } = await load();
    expect(isContextSyncSupported()).toBe(false);
    expect(() => publishContextEvent("context_changed")).not.toThrow();
    const off = subscribeContextEvents(() => {});
    expect(() => off()).not.toThrow();
  });

  it("MT-07: a constructor that throws (blocked by the browser) degrades the same way", async () => {
    FakeChannel.throwOnConstruct = true;
    const { isContextSyncSupported, publishContextEvent } = await load();
    expect(isContextSyncSupported()).toBe(false);
    expect(() => publishContextEvent("context_changed")).not.toThrow();
  });

  it("a postMessage failure never breaks the user's action", async () => {
    FakeChannel.throwOnPost = true;
    const { publishContextEvent } = await load();
    expect(() => publishContextEvent("session_changed")).not.toThrow();
  });
});
