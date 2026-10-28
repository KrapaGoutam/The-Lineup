"use client";

import { useCallback, useSyncExternalStore } from "react";

export type RecipeViewMode = "list" | "picture";

export const RECIPES_VIEW_STORAGE_KEY = "recipes-view-preference";
const PREFERENCE_CHANGE_EVENT = "recipes-view-preference-change";

export function readStoredViewPreference(): RecipeViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const stored = window.localStorage.getItem(RECIPES_VIEW_STORAGE_KEY);
    if (stored === "picture" || stored === "list") return stored;
  } catch {
    // Private browsing or storage unavailable.
  }
  return "list";
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFERENCE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): RecipeViewMode {
  return readStoredViewPreference();
}

function getServerSnapshot(): RecipeViewMode {
  return "list";
}

export type ViewPreferenceResult = [
  RecipeViewMode,
  (mode: RecipeViewMode) => void,
] & {
  viewMode: RecipeViewMode;
  setViewMode: (mode: RecipeViewMode) => void;
};

export function useViewPreference(): ViewPreferenceResult {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setViewMode = useCallback((next: RecipeViewMode) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RECIPES_VIEW_STORAGE_KEY, next);
      }
    } catch {
      // Storage unavailable; fallback gracefully.
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
    }
  }, []);

  const result = [mode, setViewMode] as ViewPreferenceResult;
  result.viewMode = mode;
  result.setViewMode = setViewMode;
  return result;
}
