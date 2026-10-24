import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { startBoardRealtime } from "./use-board-realtime";

type AuthCallback = (
  event: string,
  session: { access_token: string } | null,
) => void;

/** A minimal fake of the slice of supabase-js the lifecycle touches. */
function fakeClient(options: { session: { access_token: string } | null }) {
  const calls: string[] = [];
  let authCallback: AuthCallback = () => {};
  let statusCallback: (status: string) => void = () => {};
  let onChange: () => void = () => {};
  const channelConfigs: { name: string; filter: string; table: string }[] = [];

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
            callback: () => void,
          ) => {
            channelConfigs.push({
              name,
              table: config.table,
              filter: config.filter,
            });
            onChange = callback;
            return chain;
          },
        ),
        subscribe: vi.fn((callback: (status: string) => void) => {
          calls.push("subscribe");
          statusCallback = callback;
          return chain;
        }),
      };
      return chain;
    }),
    removeChannel: vi.fn(async () => {
      calls.push("removeChannel");
    }),
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    channelConfigs,
    emitAuth: (event: string, session: { access_token: string } | null) =>
      authCallback(event, session),
    emitStatus: (status: string) => statusCallback(status),
    emitChange: () => onChange(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startBoardRealtime (D-03 authenticated lifecycle)", () => {
  it("applies the user's JWT BEFORE the channel is created and subscribed", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      vi.fn(),
    );
    await flush();

    const setAuthAt = fake.calls.indexOf("setAuth:jwt-1");
    const channelAt = fake.calls.indexOf("channel:allocation-board-7");
    const subscribeAt = fake.calls.indexOf("subscribe");
    expect(setAuthAt).toBeGreaterThan(-1);
    expect(setAuthAt).toBeLessThan(channelAt);
    expect(channelAt).toBeLessThan(subscribeAt);
    expect(fake.channelConfigs[0]).toMatchObject({
      table: "board_events",
      filter: "service_session_id=eq.7",
    });
  });

  it("never subscribes as anon when there is no session", async () => {
    const fake = fakeClient({ session: null });
    startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      vi.fn(),
    );
    await flush();
    expect(fake.client.channel).not.toHaveBeenCalled();
    expect(fake.client.realtime.setAuth).not.toHaveBeenCalled();
  });

  it("before a session exists, watches the organization's service_sessions instead", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    startBoardRealtime(
      fake.client,
      { organizationId: "org-9", serviceSessionId: null },
      vi.fn(),
    );
    await flush();
    expect(fake.channelConfigs[0]).toMatchObject({
      name: "allocation-session-watch-org-9",
      table: "service_sessions",
      filter: "organization_id=eq.org-9",
    });
  });

  it("invalidates on a board event and on EVERY successful (re)join", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    const onInvalidate = vi.fn();
    startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      onInvalidate,
    );
    await flush();

    // First join: closes the gap between the server render and the join.
    fake.emitStatus("SUBSCRIBED");
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    fake.emitChange(); // someone else changed the board
    expect(onInvalidate).toHaveBeenCalledTimes(2);
    fake.emitStatus("CHANNEL_ERROR"); // no refetch while still disconnected
    expect(onInvalidate).toHaveBeenCalledTimes(2);
    fake.emitStatus("SUBSCRIBED"); // reconnect: refetch what was missed
    expect(onInvalidate).toHaveBeenCalledTimes(3);
  });

  it("keeps the JWT fresh on token refresh", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      vi.fn(),
    );
    await flush();
    fake.emitAuth("TOKEN_REFRESHED", { access_token: "jwt-2" });
    expect(fake.client.realtime.setAuth).toHaveBeenLastCalledWith("jwt-2");
  });

  it("tears the channel down on sign-out and on cleanup (user change)", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    const stop = startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      vi.fn(),
    );
    await flush();

    fake.emitAuth("SIGNED_OUT", null);
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);

    // A later sign-in (new person) re-subscribes with the new JWT...
    fake.emitAuth("SIGNED_IN", { access_token: "jwt-user-2" });
    expect(fake.client.realtime.setAuth).toHaveBeenLastCalledWith("jwt-user-2");
    expect(fake.client.channel).toHaveBeenCalledTimes(2);

    // ...and cleanup (React unmount / dependency change) removes it.
    stop();
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(2);
    expect(fake.calls).toContain("unsubscribe-auth");
  });

  it("does nothing if cleaned up before the session resolves", async () => {
    const fake = fakeClient({ session: { access_token: "jwt-1" } });
    const stop = startBoardRealtime(
      fake.client,
      { organizationId: "org", serviceSessionId: 7 },
      vi.fn(),
    );
    stop();
    await flush();
    expect(fake.client.channel).not.toHaveBeenCalled();
  });
});
