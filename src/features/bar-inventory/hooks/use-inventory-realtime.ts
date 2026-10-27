"use client";

import { useEffect, useRef } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createInvalidationGate } from "@/lib/realtime/invalidation-gate";
import { startAuthenticatedChannel } from "@/lib/realtime/start-authenticated-channel";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * Bar Inventory Realtime (owner decision D7): database = truth, event =
 * invalidation, client = refetch. One channel for the location listens to the
 * stock and ledger tables; whatever arrives, the answer is "re-read the
 * snapshot" -- never "apply this payload". Bursts are folded into one re-read.
 *
 * Only management roles can read these tables (RLS), so only they receive
 * events; the module is not mounted for anyone else.
 */
export function inventoryChannel(locationId: string) {
  return {
    name: `bar-inventory-${locationId}`,
    bindings: [
      { table: "inventory_stock", filter: `location_id=eq.${locationId}` },
      {
        table: "inventory_adjustments",
        filter: `location_id=eq.${locationId}`,
      },
    ],
  };
}

export function startInventoryRealtime(
  supabase: SupabaseClient,
  locationId: string,
  onInvalidate: () => void,
  gate = createInvalidationGate(onInvalidate),
): () => void {
  const stop = startAuthenticatedChannel(
    supabase,
    inventoryChannel(locationId),
    () => gate.signal(),
  );
  return () => {
    gate.cancel();
    stop();
  };
}

export function useInventoryRealtime({
  enabled,
  userId,
  locationId,
  onInvalidate,
  createClient = createBrowserSupabaseClient,
}: {
  enabled: boolean;
  userId: string;
  locationId: string | null;
  onInvalidate: () => void;
  createClient?: () => SupabaseClient;
}) {
  // Both are read through refs so neither can rebuild the subscription: a
  // production bundle gives the inlined default `createClient` a new identity
  // every render, and a caller's callback is rarely stable. As dependencies
  // they caused the refetch/resubscribe loop of #134.
  const invalidateRef = useRef(onInvalidate);
  const createClientRef = useRef(createClient);
  useEffect(() => {
    invalidateRef.current = onInvalidate;
    createClientRef.current = createClient;
  });

  useEffect(() => {
    if (!enabled || !locationId) return;
    return startInventoryRealtime(createClientRef.current(), locationId, () =>
      invalidateRef.current(),
    );
    // userId is a dependency on purpose: a different person has a different
    // JWT, so the channel is rebuilt from scratch.
  }, [enabled, userId, locationId]);
}
