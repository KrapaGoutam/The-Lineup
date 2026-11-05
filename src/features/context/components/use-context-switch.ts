"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import { setActiveContextAction } from "@/features/context/actions/context-actions";
import type { AvailableContextSummary } from "@/features/context/domain/active-context";

/**
 * V2-003.004: explicit, server-verified, PERSISTED context switching.
 *
 * Sequence (nothing is shown or navigated optimistically):
 *  1. the user picks a location → "switching" state, previous workspace hidden;
 *  2. `setActiveContextAction` authenticates, verifies the pair with the
 *     canonical resolver and writes the HttpOnly cookie;
 *  3. only on success does the client navigate to the SERVER-BUILT destination
 *     it returned (`/r/<slug>?location=<id>`);
 *  4. the server re-resolves the context and re-loads every location-dependent
 *     dataset; the shell is re-keyed by the verified identity.
 * On failure nothing navigates, the previous cookie is untouched and the
 * previously active workspace stays active (the user sees an error).
 * Concurrent selections are ignored while one is in flight.
 */

export const SWITCH_FAILURE_MESSAGE =
  "We couldn't switch to that location. Your current location is unchanged. Please try again or choose another location.";

function carriedTab(): string | undefined {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(tab) ? tab : undefined;
}

export function useContextSwitch(): {
  switchingTo: AvailableContextSummary | null;
  switchError: string | null;
  dismissSwitchError: () => void;
  switchTo: (next: AvailableContextSummary) => Promise<void>;
} {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [target, setTarget] = useState<AvailableContextSummary | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const switchTo = useCallback(
    async (next: AvailableContextSummary) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSwitchError(null);
      setTarget(next);
      setSubmitting(true);
      try {
        const result = await setActiveContextAction({
          organizationId: next.organizationId,
          locationId: next.locationId,
          tab: carriedTab(),
        });
        if (!result.ok) {
          setTarget(null);
          setSwitchError(SWITCH_FAILURE_MESSAGE);
          return;
        }
        startTransition(() => {
          router.push(result.destination);
        });
      } catch {
        setTarget(null);
        setSwitchError(SWITCH_FAILURE_MESSAGE);
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [router],
  );

  return {
    switchingTo: submitting || isNavigating ? target : null,
    switchError,
    dismissSwitchError: () => setSwitchError(null),
    switchTo,
  };
}
