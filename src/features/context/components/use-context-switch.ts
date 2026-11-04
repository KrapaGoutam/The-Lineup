"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import type { AvailableContextSummary } from "@/features/context/domain/active-context";
import { contextSwitchHref } from "@/features/context/domain/context-navigation";

/**
 * V2-003.002: explicit, server-verified context switching.
 *
 * Selecting a context NAVIGATES to the target organization's canonical route
 * with `?location=<id>`; the server re-authenticates and re-resolves the pair
 * and re-loads every location-dependent dataset. Nothing here changes what is
 * displayed on its own: the shell is re-keyed by the verified identity when
 * the new server response arrives. While the transition is pending, callers
 * hide the previous workspace (`switchingTo`).
 */
export function useContextSwitch() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<AvailableContextSummary | null>(null);

  const switchTo = useCallback(
    (next: AvailableContextSummary) => {
      setTarget(next);
      startTransition(() => {
        router.push(contextSwitchHref(next, window.location.search));
      });
    },
    [router],
  );

  return { switchingTo: isPending ? target : null, switchTo };
}
