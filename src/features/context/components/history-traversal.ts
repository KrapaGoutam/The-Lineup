/**
 * V2-003.005 -- was THIS render caused by the browser's history rather than by
 * a fresh, deliberate navigation?
 *
 * An explicit `?location=` in the address bar is a deliberate selection only
 * for a fresh navigation (typed, bookmarked, shared or in-app link). After a
 * reload or back/forward the URL is merely what the app (or an old history
 * entry) left there, so silently persisting it would reinstate a previously
 * selected context and flip other tabs back and forth. Callers use this to ask
 * for confirmation instead.
 *
 * Browser-only; call from effects/handlers, never during render.
 */

export type NavigationOrigin = "fresh" | "reload" | "history";

/** A popstate within this window explains the render that is happening now. */
const POPSTATE_WINDOW_MS = 5_000;
/** The document-load navigation type only describes mounts right after load. */
const DOCUMENT_LOAD_WINDOW_MS = 15_000;

let lastPopstateAt = Number.NEGATIVE_INFINITY;
let installed = false;

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", () => {
    lastPopstateAt = performance.now();
  });
}
install();

function documentNavigationType(): string | null {
  if (typeof performance === "undefined") return null;
  const entry = performance.getEntriesByType?.("navigation")?.[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? null;
}

export function currentNavigationOrigin(): NavigationOrigin {
  install();
  const now = performance.now();
  if (now - lastPopstateAt <= POPSTATE_WINDOW_MS) return "history";
  if (now <= DOCUMENT_LOAD_WINDOW_MS) {
    const type = documentNavigationType();
    if (type === "back_forward") return "history";
    if (type === "reload") return "reload";
  }
  return "fresh";
}
