import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { useBoardRealtime } from "./use-board-realtime";

/** The slice of supabase-js the hook touches; one shared instance like the browser singleton. */
function fakeClient() {
  const removed: string[] = [];
  const created: string[] = [];
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "jwt-1" } },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    realtime: { setAuth: vi.fn() },
    channel: vi.fn((name: string) => {
      created.push(name);
      const chain = {
        on: vi.fn(() => chain),
        subscribe: vi.fn(() => chain),
        name,
      };
      return chain;
    }),
    removeChannel: vi.fn(async (channel: { name: string }) => {
      removed.push(channel.name);
    }),
  };
  return { client: client as unknown as SupabaseClient, created, removed };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const baseProps = {
  enabled: true,
  userId: "user-1",
  organizationId: "org-1",
  serviceSessionId: 7 as number | null,
  onInvalidate: () => {},
};

describe("useBoardRealtime (React binding, #134)", () => {
  it("keeps ONE channel across re-renders even when createClient is a new function every render", async () => {
    // A production bundle inlines the default `createClient` into the hook's
    // parameter list, so its identity changes on every render. The
    // subscription must not be rebuilt for that: each rebuild re-joins the
    // same topic and each (re)join refetches, which re-renders again.
    const fake = fakeClient();
    const { rerender } = renderHook(
      (props) =>
        useBoardRealtime({ ...props, createClient: () => fake.client }),
      { initialProps: baseProps },
    );
    await flush();
    expect(fake.created).toEqual(["allocation-board-7"]);

    for (let i = 0; i < 3; i += 1) {
      rerender({ ...baseProps, onInvalidate: () => {} });
      await flush();
    }

    expect(fake.created).toEqual(["allocation-board-7"]);
    expect(fake.removed).toEqual([]);
  });

  it("rebuilds when the person, organization or board session changes", async () => {
    const fake = fakeClient();
    const { rerender, unmount } = renderHook(
      (props) =>
        useBoardRealtime({ ...props, createClient: () => fake.client }),
      { initialProps: baseProps },
    );
    await flush();

    rerender({ ...baseProps, serviceSessionId: 8 });
    await flush();
    expect(fake.created).toEqual(["allocation-board-7", "allocation-board-8"]);
    expect(fake.removed).toEqual(["allocation-board-7"]);

    rerender({ ...baseProps, serviceSessionId: 8, userId: "user-2" });
    await flush();
    expect(fake.removed).toEqual(["allocation-board-7", "allocation-board-8"]);
    expect(fake.created).toHaveLength(3);

    unmount();
    expect(fake.removed).toHaveLength(3);
  });

  it("does not subscribe while disabled (demo mode)", async () => {
    const fake = fakeClient();
    renderHook(() =>
      useBoardRealtime({
        ...baseProps,
        enabled: false,
        createClient: () => fake.client,
      }),
    );
    await flush();
    expect(fake.created).toEqual([]);
  });
});
