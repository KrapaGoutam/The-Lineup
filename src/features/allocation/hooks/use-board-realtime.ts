"use client";

import { useEffect, useRef } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * Table Rotation V2 Part 1 / D-03 -- an authenticated Realtime lifecycle.
 *
 * The old code created and subscribed the channel immediately. On a fresh
 * page load the browser client has not resolved its session from cookies
 * yet, so the websocket joined as `anon`; Supabase then answers the
 * postgres_changes join with "invalid column for filter service_session_id"
 * (anon cannot see the table) and the page never receives a live update.
 * Only a channel created after an in-place login happened to work.
 *
 * Correct lifecycle, implemented here and unit-tested in
 * use-board-realtime.test.ts (+ use-board-realtime.hook.test.tsx for the
 * React binding):
 *
 *   1. resolve the session  (supabase.auth.getSession)
 *   2. no session            -> do NOT subscribe (never as anon)
 *   3. apply the user's JWT  (supabase.realtime.setAuth)
 *   4. subscribe             (board_events for the session, or the
 *                             organization's service_sessions until a
 *                             session exists)
 *   5. keep the JWT fresh    (setAuth on TOKEN_REFRESHED)
 *   6. sign-out / user change / session change -> remove the channel
 *   7. one channel per lifecycle -- a second subscribe request (the
 *                             auth listener's SIGNED_IN and the initial
 *                             getSession both fire on load) only refreshes
 *                             the JWT, and a channel is never created while
 *                             a previous channel with the same topic is
 *                             still being removed (supabase-js hands back
 *                             the dying instance for an identical topic)
 *   8. every (re)subscribe   -> `onInvalidate` (events missed before the
 *                             join, or while disconnected, are recovered
 *                             by an authoritative refetch -- Realtime is
 *                             an invalidation signal, never the source of
 *                             truth)
 */
export type BoardRealtimeTarget = {
  organizationId: string;
  serviceSessionId: number | null;
};

// supabase-js keeps a channel registered under its topic until the async
// leave completes, and `channel(topic)` returns that registered instance.
// Removals are therefore tracked per client so a rebuild of the same topic
// waits for the previous channel to be fully gone.
const pendingRemovals = new WeakMap<SupabaseClient, Promise<unknown>>();

export function startBoardRealtime(
  supabase: SupabaseClient,
  target: BoardRealtimeTarget,
  onInvalidate: () => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  // True while the signed-in person wants a channel; false after sign-out.
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

  const join = () => {
    const config =
      target.serviceSessionId !== null
        ? {
            name: `allocation-board-${target.serviceSessionId}`,
            table: "board_events",
            filter: `service_session_id=eq.${target.serviceSessionId}`,
          }
        : {
            name: `allocation-session-watch-${target.organizationId}`,
            table: "service_sessions",
            filter: `organization_id=eq.${target.organizationId}`,
          };

    channel = supabase
      .channel(config.name)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", ...config },
        () => onInvalidate(),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Every successful (re)join refetches authoritative state: the
        // first one closes the window between the page's server render and
        // the subscription becoming live (a session or event created in
        // that gap would otherwise never be seen); later ones are
        // reconnects that may have missed events while offline.
        onInvalidate();
      });
  };

  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (cancelled) return;
    const token = data.session?.access_token;
    if (!token) return; // signed out: never join as anon
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

/**
 * React binding. Re-runs (unsubscribing the old channel first) whenever the
 * signed-in person, organization or board session changes, so a user switch
 * can never keep listening with the previous user's context.
 */
export function useBoardRealtime({
  enabled,
  userId,
  organizationId,
  serviceSessionId,
  onInvalidate,
  createClient = createBrowserSupabaseClient,
}: {
  enabled: boolean;
  userId: string;
  organizationId: string;
  serviceSessionId: number | null;
  onInvalidate: () => void;
  createClient?: () => SupabaseClient;
}) {
  const invalidateRef = useRef(onInvalidate);
  useEffect(() => {
    invalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  // Held in a ref, never an effect dependency: a production bundle inlines
  // the default `createClient` into this parameter list, giving it a new
  // identity on every render. As a dependency that rebuilt the subscription
  // on every render -- and every (re)join refetches, which re-renders: a
  // refetch/resubscribe loop that left the channel dead at the moment
  // another device's change arrived (#134).
  const createClientRef = useRef(createClient);
  useEffect(() => {
    createClientRef.current = createClient;
  }, [createClient]);

  useEffect(() => {
    if (!enabled) return;
    return startBoardRealtime(
      createClientRef.current(),
      { organizationId, serviceSessionId },
      () => invalidateRef.current(),
    );
    // userId is a dependency on purpose: a different person means a
    // different JWT, so the channel must be rebuilt from scratch.
  }, [enabled, userId, organizationId, serviceSessionId]);
}
