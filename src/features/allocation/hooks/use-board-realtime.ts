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
 * use-board-realtime.test.ts:
 *
 *   1. resolve the session  (supabase.auth.getSession)
 *   2. no session            -> do NOT subscribe (never as anon)
 *   3. apply the user's JWT  (supabase.realtime.setAuth)
 *   4. subscribe             (board_events for the session, or the
 *                             organization's service_sessions until a
 *                             session exists)
 *   5. keep the JWT fresh    (setAuth on TOKEN_REFRESHED)
 *   6. sign-out / user change / session change -> remove the channel
 *   7. every (re)subscribe   -> `onInvalidate` (events missed before the
 *                             join, or while disconnected, are recovered
 *                             by an authoritative refetch -- Realtime is
 *                             an invalidation signal, never the source of
 *                             truth)
 */
export type BoardRealtimeTarget = {
  organizationId: string;
  serviceSessionId: number | null;
};

export function startBoardRealtime(
  supabase: SupabaseClient,
  target: BoardRealtimeTarget,
  onInvalidate: () => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;

  const teardownChannel = () => {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };

  const subscribe = (accessToken: string) => {
    supabase.realtime.setAuth(accessToken);
    teardownChannel();

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
        teardownChannel();
      } else if (
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") &&
        session
      ) {
        if (channel) supabase.realtime.setAuth(session.access_token);
        else subscribe(session.access_token);
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

  useEffect(() => {
    if (!enabled) return;
    return startBoardRealtime(
      createClient(),
      { organizationId, serviceSessionId },
      () => invalidateRef.current(),
    );
    // userId is a dependency on purpose: a different person means a
    // different JWT, so the channel must be rebuilt from scratch.
  }, [enabled, userId, organizationId, serviceSessionId, createClient]);
}
