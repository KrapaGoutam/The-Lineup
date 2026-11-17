"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_COMBINED_MODE,
  parseCombinedMode,
  type CombinedMode,
} from "@/features/allocation/domain/combined-view";

/**
 * V2.0.4: the Combined View's display mode (Split Screen / Floor Focus /
 * Rotation Focus), remembered per device AND branch. The app has no
 * server-side per-device preference mechanism, so this follows the existing
 * lightweight client pattern (recipes `use-view-preference`): localStorage
 * with a session fallback when storage is blocked. It is a display
 * preference only -- changing it never touches assignments, history or the
 * selected branch.
 */
const KEY_PREFIX = "lineup.allocation.combined-mode";
const CHANGE_EVENT = "lineup-combined-mode-change";

// Set only after a failed write (storage blocked); cleared by the next success.
const sessionFallback = new Map<string, CombinedMode>();

export function combinedModeKey(scope: string) {
  return `${KEY_PREFIX}.${scope}`;
}

export function readCombinedMode(scope: string): CombinedMode {
  const key = combinedModeKey(scope);
  const fallback = sessionFallback.get(key);
  if (fallback) return fallback;
  if (typeof window === "undefined") return DEFAULT_COMBINED_MODE;
  try {
    return (
      parseCombinedMode(window.localStorage.getItem(key)) ??
      DEFAULT_COMBINED_MODE
    );
  } catch {
    return DEFAULT_COMBINED_MODE;
  }
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useCombinedMode(
  scope: string,
): [CombinedMode, (mode: CombinedMode) => void] {
  const mode = useSyncExternalStore(
    subscribe,
    () => readCombinedMode(scope),
    () => DEFAULT_COMBINED_MODE,
  );
  const setMode = useCallback(
    (next: CombinedMode) => {
      const key = combinedModeKey(scope);
      try {
        window.localStorage.setItem(key, next);
        sessionFallback.delete(key);
      } catch {
        sessionFallback.set(key, next);
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [scope],
  );
  return [mode, setMode];
}
