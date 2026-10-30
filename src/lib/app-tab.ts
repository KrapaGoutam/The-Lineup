export type AppTab =
  | "schedule"
  | "allocation"
  | "tasks"
  | "tips"
  | "team"
  | "attendance"
  | "barInventory"
  | "recipes"
  | "payroll"
  | "settings";

/**
 * Tasks V1.1 / D-1: a normal launch lands on Tasks (Today). The app is a
 * single client shell with no per-module routes, so an explicitly requested
 * module travels as `?tab=<module>`; without it, this is where you start.
 */
export const DEFAULT_APP_TAB: AppTab = "tasks";

const PARAM_BY_TAB: Record<AppTab, string> = {
  schedule: "schedule",
  allocation: "allocation",
  tasks: "tasks",
  tips: "tips",
  team: "team",
  attendance: "attendance",
  barInventory: "bar-inventory",
  recipes: "recipes",
  payroll: "payroll",
  settings: "settings",
};

const TAB_BY_PARAM = new Map<string, AppTab>(
  (Object.entries(PARAM_BY_TAB) as [AppTab, string][]).map(([tab, param]) => [
    param,
    tab,
  ]),
);

/** The module a `?tab=` value names, or null when absent or unknown. */
export function tabFromParam(value: string | null | undefined): AppTab | null {
  return value ? (TAB_BY_PARAM.get(value) ?? null) : null;
}

export function tabToParam(tab: AppTab): string {
  return PARAM_BY_TAB[tab];
}

export type TabAccess = { isManager: boolean; demoMode: boolean };

/**
 * Convenience only, never authorization (the server enforces roles): a module
 * the viewer cannot open falls back to the default landing instead of
 * rendering an empty page.
 */
export function resolveTab(tab: AppTab, access: TabAccess): AppTab {
  if ((tab === "team" || tab === "barInventory") && !access.isManager) {
    return DEFAULT_APP_TAB;
  }
  if (tab === "payroll" && access.demoMode) return DEFAULT_APP_TAB;
  return tab;
}

/**
 * The URL for showing `tab`, keeping the path and every other query
 * parameter. The default landing carries no `tab` parameter, so `/` stays `/`.
 */
export function tabHref(pathname: string, search: string, tab: AppTab): string {
  const params = new URLSearchParams(search);
  if (tab !== "recipes") {
    params.delete("recipe");
    params.delete("mode");
  }
  if (tab === DEFAULT_APP_TAB) params.delete("tab");
  else params.set("tab", tabToParam(tab));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
