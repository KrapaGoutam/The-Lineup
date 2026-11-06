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

/** The document-load navigation type only describes mounts right after load. */
const DOCUMENT_LOAD_WINDOW_MS = 15_000;

let historyContext: string | null = null;
let installed = false;

// Module fallback can replace ?tab= while the RSC response is still loading.
// Keep the traversal signal attached to its context, rather than a timer that
// can expire before a slow server response/hydration reaches reconciliation.
function contextKey(url: URL): string {
  return `${url.pathname}:${url.searchParams.get("location")?.toLowerCase() ?? ""}`;
}

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", () => {
    historyContext = contextKey(new URL(window.location.href));
  });
}
install();

function documentNavigation(): PerformanceNavigationTiming | null {
  if (typeof performance === "undefined") return null;
  const entry = performance.getEntriesByType?.("navigation")?.[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry ?? null;
}

export function currentNavigationOrigin(): NavigationOrigin {
  install();
  const currentKey =
    typeof window === "undefined"
      ? null
      : contextKey(new URL(window.location.href));
  if (historyContext !== null && historyContext === currentKey)
    return "history";
  const entry = documentNavigation();
  // A full-document reload/history load may hydrate after the timing window.
  // Its destination remains a stored preference until the context changes.
  if (entry?.name && currentKey === contextKey(new URL(entry.name))) {
    if (entry.type === "back_forward") return "history";
    if (entry.type === "reload") return "reload";
  }
  const now = performance.now();
  if (now <= DOCUMENT_LOAD_WINDOW_MS) {
    const type = entry?.type;
    if (type === "back_forward") return "history";
    if (type === "reload") return "reload";
  }
  return "fresh";
}
