/** Presentation policy only. Existing server/RLS permissions remain authoritative. */
import type { AppTab, TabAccess } from "@/lib/app-tab";
import type { WorkspaceExpectation } from "@/features/context/domain/workspace-expectation";
import {
  buildModuleConfigSnapshot,
  isModuleUsable,
  resolveModuleState,
  type LocationModuleConfig,
  type ModuleConfigReadResult,
} from "./module-config";
import { moduleForAppTab } from "./module-registry";

type SerializedConfigResult =
  | (Omit<Extract<ModuleConfigReadResult, { status: "ok" }>, "configs"> & {
      readonly configs: readonly LocationModuleConfig[];
    })
  | Exclude<ModuleConfigReadResult, { status: "ok" }>;

export interface ModuleNavigationSnapshot {
  readonly identity: WorkspaceExpectation;
  readonly result: SerializedConfigResult;
}

export function serializeModuleNavigation(
  identity: WorkspaceExpectation,
  result: ModuleConfigReadResult,
): ModuleNavigationSnapshot {
  return {
    identity,
    result:
      result.status === "ok"
        ? { ...result, configs: [...result.configs.values()] }
        : result,
  };
}

// Existing shell order, with the accepted default first. Registry owns module
// identity/state; this order owns only presentation and deterministic fallback.
const NAVIGATION_ORDER: readonly AppTab[] = [
  "tasks",
  "allocation",
  "schedule",
  "team",
  "attendance",
  "barInventory",
  "recipes",
  "tips",
  "payroll",
  "settings",
];

export interface ModuleNavigationPolicy {
  readonly tabs: readonly AppTab[];
  readonly fallback: AppTab;
  readonly configurationStatus:
    | ModuleConfigReadResult["status"]
    | "demo"
    | "stale";
}

export function moduleNavigationPolicy(
  snapshot: ModuleNavigationSnapshot | null | undefined,
  expected: WorkspaceExpectation | null,
  access: TabAccess,
): ModuleNavigationPolicy {
  let result: ModuleConfigReadResult | null = null;
  const identityMatches =
    !!snapshot &&
    !!expected &&
    snapshot.identity.profileId === expected.profileId &&
    snapshot.identity.organizationId === expected.organizationId &&
    snapshot.identity.locationId === expected.locationId;
  if (identityMatches) {
    const serialized = snapshot.result;
    if (serialized.status !== "ok") result = serialized;
    else if (
      serialized.locationId === expected.locationId &&
      serialized.configs.every(
        (config) => config.locationId === expected.locationId,
      )
    ) {
      result = buildModuleConfigSnapshot(
        serialized.locationId,
        serialized.lifecycle,
        serialized.configs,
      );
    }
  }
  const tabs = NAVIGATION_ORDER.filter((tab) => {
    if (tab === "settings") return true;
    if ((tab === "team" || tab === "barInventory") && !access.isManager)
      return false;
    if (tab === "payroll" && access.demoMode) return false;
    return (
      access.demoMode ||
      (!!result &&
        isModuleUsable(resolveModuleState(result, moduleForAppTab(tab).key)))
    );
  });
  return {
    tabs,
    fallback: tabs[0] ?? "settings",
    configurationStatus: access.demoMode ? "demo" : (result?.status ?? "stale"),
  };
}

export function resolveNavigationTab(
  requested: AppTab | null,
  policy: ModuleNavigationPolicy,
): AppTab {
  return requested && policy.tabs.includes(requested)
    ? requested
    : policy.fallback;
}
