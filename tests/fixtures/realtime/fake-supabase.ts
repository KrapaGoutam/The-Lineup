import { vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

type AuthCallback = (
  event: string,
  session: { access_token: string } | null,
) => void;

export type FakeBinding = { name: string; table: string; filter: string };

/**
 * A minimal fake of the slice of supabase-js the Realtime lifecycle touches:
 * the session, `setAuth`, channels with several `postgres_changes` bindings,
 * their subscribe status, and removal (optionally held pending, like the real
 * client's async leave handshake).
 */
export function fakeSupabase(options: {
  session: { access_token: string } | null;
}) {
  const calls: string[] = [];
  let holdRemoval = false;
  const heldRemovals: (() => void)[] = [];
  let authCallback: AuthCallback = () => {};
  const statusCallbacks: ((status: string) => void)[] = [];
  const changeCallbacks: { table: string; run: (payload: unknown) => void }[] =
    [];
  const bindings: FakeBinding[] = [];

  const client = {
    auth: {
      getSession: vi.fn(async () => {
        calls.push("getSession");
        return { data: { session: options.session } };
      }),
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        calls.push("onAuthStateChange");
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(() => calls.push("unsubscribe-auth")),
            },
          },
        };
      }),
    },
    realtime: {
      setAuth: vi.fn((token: string) => calls.push(`setAuth:${token}`)),
    },
    channel: vi.fn((name: string) => {
      calls.push(`channel:${name}`);
      const chain = {
        on: vi.fn(
          (
            _type: string,
            config: { table: string; filter: string },
            callback: (payload: unknown) => void,
          ) => {
            bindings.push({ name, table: config.table, filter: config.filter });
            changeCallbacks.push({ table: config.table, run: callback });
            return chain;
          },
        ),
        subscribe: vi.fn((callback: (status: string) => void) => {
          calls.push("subscribe");
          statusCallbacks.push(callback);
          return chain;
        }),
      };
      return chain;
    }),
    removeChannel: vi.fn(async () => {
      calls.push("removeChannel");
      if (holdRemoval) {
        await new Promise<void>((resolve) => heldRemovals.push(resolve));
      }
    }),
  };

  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    calls,
    bindings,
    channelsCreated: () => client.channel.mock.calls.length,
    emitAuth: (event: string, session: { access_token: string } | null) =>
      authCallback(event, session),
    /** The latest channel's subscribe status (SUBSCRIBED, CHANNEL_ERROR, ...). */
    emitStatus: (status: string) =>
      statusCallbacks[statusCallbacks.length - 1]?.(status),
    /** A change on `table`, with whatever payload the test wants to forge. */
    emitChange: (table: string, payload: unknown = {}) =>
      changeCallbacks
        .filter((c) => c.table === table)
        .forEach((c) => c.run(payload)),
    holdRemovals: () => {
      holdRemoval = true;
    },
    finishRemovals: () => {
      holdRemoval = false;
      heldRemovals.splice(0).forEach((resolve) => resolve());
    },
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
