"use client";

import { useCallback, useSyncExternalStore } from "react";

export type RecipeViewMode = "list" | "picture";

export const RECIPES_VIEW_STORAGE_KEY = "recipes-view-preference";
const PREFERENCE_CHANGE_EVENT = "recipes-view-preference-change";

// Session fallback for browsers where localStorage throws (blocked site data,
// some private modes): the toggle still works until the page is closed.
// Set only after a failed write; cleared by the next successful one.
let sessionPreference: RecipeViewMode | null = null;

export function readStoredViewPreference(): RecipeViewMode {
  if (typeof window === "undefined") return "list";
  if (sessionPreference) return sessionPreference;
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
      sessionPreference = null;
    } catch {
      // Storage unavailable; keep the choice for this page session.
      sessionPreference = next;
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
