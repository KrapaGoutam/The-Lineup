import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * An authenticated Realtime subscription that only ever says "something
 * changed". It is the lifecycle proven by the Table Allocation board
 * (use-board-realtime.ts, #134) in a form any module can reuse:
 *
 *   1. resolve the session; none -> never subscribe (never as `anon`)
 *   2. apply the person's JWT, then subscribe
 *   3. keep the JWT fresh on TOKEN_REFRESHED
 *   4. sign-out / unmount -> remove the channel
 *   5. one channel per lifecycle -- a second subscribe request only refreshes
 *      the JWT, and a channel is never created while a previous one with the
 *      same topic is still being removed (supabase-js hands back the dying
 *      instance for an identical topic)
 *   6. every (re)join -> `onSignal`, because events missed before the join or
 *      while offline are recovered by an authoritative re-read
 *
 * `onSignal` receives NO data. Event payloads are deliberately never passed
 * on: the database is the truth and the caller re-reads it, so a forged or odd
 * payload cannot change what is shown.
 */
export type ChannelBinding = {
  table: string;
  /** PostgREST-style filter, e.g. `location_id=eq.<uuid>`. */
  filter: string;
};

export type ChannelTarget = {
  /** The channel topic; unique per module and scope. */
  name: string;
  bindings: ChannelBinding[];
};

const pendingRemovals = new WeakMap<SupabaseClient, Promise<unknown>>();

export function startAuthenticatedChannel(
  supabase: SupabaseClient,
  target: ChannelTarget,
  onSignal: () => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  let wantsChannel = false;
  let waitingForRemoval = false;

  const teardownChannel = () => {
    if (!channel) return;
    const removal = supabase.removeChannel(channel).catch(() => undefined);
    const tracked: Promise<unknown> = Promise.all([
      pendingRemovals.get(supabase),
      removal,
    ]).finally(() => {
      if (pendingRemovals.get(supabase) === tracked) {
        pendingRemovals.delete(supabase);
      }
    });
    pendingRemovals.set(supabase, tracked);
    channel = null;
  };

  const join = () => {
    let next = supabase.channel(target.name);
    for (const { table, filter } of target.bindings) {
      next = next.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => onSignal(),
      );
    }
    channel = next.subscribe((status) => {
      if (status === "SUBSCRIBED") onSignal();
    });
  };

  const subscribe = (accessToken: string) => {
    supabase.realtime.setAuth(accessToken);
    wantsChannel = true;
    if (channel || waitingForRemoval) return;

    const pending = pendingRemovals.get(supabase);
    if (!pending) {
      join();
      return;
    }
    waitingForRemoval = true;
    void pending.then(() => {
      waitingForRemoval = false;
      if (!cancelled && wantsChannel && !channel) join();
    });
  };

  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (cancelled) return;
    const token = data.session?.access_token;
    if (!token) return;
    subscribe(token);
  })();

  const { data: authListener } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        wantsChannel = false;
        teardownChannel();
      } else if (
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") &&
        session
      ) {
        subscribe(session.access_token);
      }
    },
  );

  return () => {
    cancelled = true;
    authListener.subscription.unsubscribe();
    teardownChannel();
  };
}
