import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  flush,
  fakeSupabase,
} from "../../../../tests/fixtures/realtime/fake-supabase";
import {
  inventoryChannel,
  startInventoryRealtime,
  useInventoryRealtime,
} from "./use-inventory-realtime";

const LOCATION = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the async session lookup settle while timers are faked. */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe("inventoryChannel", () => {
  it("listens to exactly the stock and ledger tables of the one location", () => {
    expect(inventoryChannel(LOCATION)).toEqual({
      name: `bar-inventory-${LOCATION}`,
      bindings: [
        { table: "inventory_stock", filter: `location_id=eq.${LOCATION}` },
        {
          table: "inventory_adjustments",
          filter: `location_id=eq.${LOCATION}`,
        },
      ],
    });
  });
});

describe("startInventoryRealtime (BI-RT-002/003/004)", () => {
  it("never subscribes without a session (never as anon)", async () => {
    const fake = fakeSupabase({ session: null });
    startInventoryRealtime(fake.client, LOCATION, vi.fn());
    await settle();
    expect(fake.channelsCreated()).toBe(0);
    expect(fake.raw.realtime.setAuth).not.toHaveBeenCalled();
  });

  it("applies the JWT, then joins one channel with both bindings", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    startInventoryRealtime(fake.client, LOCATION, vi.fn());
    await settle();
    expect(fake.calls.indexOf("setAuth:jwt-1")).toBeLessThan(
      fake.calls.indexOf(`channel:bar-inventory-${LOCATION}`),
    );
    expect(fake.channelsCreated()).toBe(1);
    expect(fake.bindings.map((b) => b.table)).toEqual([
      "inventory_stock",
      "inventory_adjustments",
    ]);
  });

  it("a change asks for one re-read; the payload is never used (forged payloads change nothing)", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const onInvalidate = vi.fn();
    startInventoryRealtime(fake.client, LOCATION, onInvalidate);
    await settle();

    fake.emitChange("inventory_stock", {
      new: { on_hand: 99999, product_id: "forged" },
    });
    expect(onInvalidate).not.toHaveBeenCalled(); // folded, not immediate
    await vi.advanceTimersByTimeAsync(400);
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    // The callback receives nothing to apply -- a re-read has no arguments.
    expect(onInvalidate.mock.calls[0]).toEqual([]);
  });

  it("an 800-event burst across both tables is one re-read", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const onInvalidate = vi.fn();
    startInventoryRealtime(fake.client, LOCATION, onInvalidate);
    await settle();
    for (let i = 0; i < 400; i += 1) {
      fake.emitChange("inventory_stock");
      fake.emitChange("inventory_adjustments");
      await vi.advanceTimersByTimeAsync(1);
    }
    await vi.advanceTimersByTimeAsync(400);
    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it("every (re)join re-reads, so events missed while offline are recovered", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const onInvalidate = vi.fn();
    startInventoryRealtime(fake.client, LOCATION, onInvalidate);
    await settle();
    fake.emitStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(400);
    expect(onInvalidate).toHaveBeenCalledTimes(1);

    fake.emitStatus("CHANNEL_ERROR"); // not a join: nothing happens
    await vi.advanceTimersByTimeAsync(1000);
    expect(onInvalidate).toHaveBeenCalledTimes(1);

    fake.emitStatus("SUBSCRIBED"); // reconnected
    await vi.advanceTimersByTimeAsync(400);
    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });

  it("a refreshed token only refreshes the JWT; it never opens a second channel", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    startInventoryRealtime(fake.client, LOCATION, vi.fn());
    await settle();
    fake.emitAuth("TOKEN_REFRESHED", { access_token: "jwt-2" });
    fake.emitAuth("SIGNED_IN", { access_token: "jwt-2" });
    expect(fake.calls).toContain("setAuth:jwt-2");
    expect(fake.channelsCreated()).toBe(1);
  });

  it("sign-out removes the channel; stopping cancels a pending re-read", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const onInvalidate = vi.fn();
    const stop = startInventoryRealtime(fake.client, LOCATION, onInvalidate);
    await settle();
    fake.emitAuth("SIGNED_OUT", null);
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);

    fake.emitChange("inventory_stock");
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("waits for a dying channel with the same topic before joining again", async () => {
    vi.useRealTimers();
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    fake.holdRemovals();
    const stopFirst = startInventoryRealtime(fake.client, LOCATION, vi.fn());
    await flush();
    stopFirst(); // removal pending
    startInventoryRealtime(fake.client, LOCATION, vi.fn());
    await flush();
    expect(fake.channelsCreated()).toBe(1); // second waits
    fake.finishRemovals();
    await flush();
    await flush();
    expect(fake.channelsCreated()).toBe(2);
  });
});

describe("useInventoryRealtime (no resubscribe loop, #134 class)", () => {
  it("does nothing when disabled (demo) or without a location", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    renderHook(() =>
      useInventoryRealtime({
        enabled: false,
        userId: "u1",
        locationId: LOCATION,
        onInvalidate: vi.fn(),
        createClient: () => fake.client,
      }),
    );
    renderHook(() =>
      useInventoryRealtime({
        enabled: true,
        userId: "u1",
        locationId: null,
        onInvalidate: vi.fn(),
        createClient: () => fake.client,
      }),
    );
    await settle();
    expect(fake.channelsCreated()).toBe(0);
  });

  it("re-rendering with a new callback and a new createClient never rebuilds the subscription", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useInventoryRealtime({
          enabled: true,
          userId: "u1",
          locationId: LOCATION,
          // New identities on every render, like the shell's per-second clock.
          onInvalidate: () => seen.push(tag),
          createClient: () => fake.client,
        }),
      { initialProps: { tag: "a" } },
    );
    await settle();
    for (let i = 0; i < 25; i += 1)
      rerender({ tag: i === 24 ? "latest" : "x" });
    await settle();
    expect(fake.channelsCreated()).toBe(1);
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();

    // The newest callback is the one that runs.
    fake.emitChange("inventory_stock");
    await vi.advanceTimersByTimeAsync(400);
    expect(seen).toEqual(["latest"]);
  });

  it("a different person rebuilds the channel (new JWT); unmount removes it", async () => {
    const fake = fakeSupabase({ session: { access_token: "jwt-1" } });
    const { rerender, unmount } = renderHook(
      ({ userId }: { userId: string }) =>
        useInventoryRealtime({
          enabled: true,
          userId,
          locationId: LOCATION,
          onInvalidate: vi.fn(),
          createClient: () => fake.client,
        }),
      { initialProps: { userId: "u1" } },
    );
    await settle();
    rerender({ userId: "u2" });
    await settle();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
    unmount();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(2);
  });
});
