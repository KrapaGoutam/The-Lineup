"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "serviceflow-theme";
const PREFERENCE_CHANGE_EVENT = "serviceflow-theme-preference-change";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private browsing / storage blocked — behave as "system".
  }
  return "system";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return preference;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFERENCE_CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): ResolvedTheme {
  return resolveTheme(readStoredPreference());
}

// Matches the blocking script's own fallback in layout.tsx when nothing is
// stored yet — keeps the very first client render consistent with the
// server-rendered markup (no hydration mismatch), corrected on the next
// tick once useSyncExternalStore reads the real client-side value.
function getServerSnapshot(): ResolvedTheme {
  return "dark";
}

/**
 * Three-state preference (light/dark/system) under the hood, presented as
 * a simple two-way toggle. Built on useSyncExternalStore rather than
 * useState+useEffect — this is exactly React's purpose-built hook for
 * syncing to an external, possibly-absent-during-SSR source (localStorage/
 * matchMedia) without the setState-in-effect cascading-render pattern
 * eslint-plugin-react-hooks now flags.
 */
export function useTheme() {
  const resolved = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Legitimate use of an effect: synchronizing an external system (the DOM
  // attribute) with React's already-computed state, not deriving state.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked — the choice applies for this load only.
    }
    // The native "storage" event only fires in *other* tabs; dispatch our
    // own so this tab's toggle click is picked up by useSyncExternalStore
    // immediately.
    window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolved === "light" ? "dark" : "light");
  }, [resolved, setPreference]);

  return { resolved, setPreference, toggle };
}
