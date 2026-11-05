/**
 * V2-004.001 — Canonical module registry (pure domain, no I/O).
 *
 * THE single source of truth for "which application modules exist" and how
 * their three identities relate:
 *
 *   label    — what people read in the UI. May change at any time; nothing is
 *              stored under it, so renaming a label never needs a data migration.
 *   key      — the stable DATABASE identifier (`public.location_module_key`).
 *              Never renamed; new modules are appended with a migration.
 *   appTab   — the current client shell tab id (`AppTab`, camelCase). Kept
 *              separate on purpose: `barInventory` is a UI id, `bar_inventory`
 *              is the durable key.
 *
 * Compile-time guarantees (a failing `npm run typecheck`, not a runtime bug):
 *   • `ConfigurableModuleKey` IS the generated database enum, so adding a
 *     value to `public.location_module_key` makes this file stop compiling
 *     until the module is registered here.
 *   • Every `AppTab` must be claimed by exactly the registry (see
 *     `AssertEveryAppTabIsRegistered`); adding a tab without a module fails.
 *   • Duplicate keys are impossible in a `Record`; duplicate labels / tabs /
 *     sort orders are asserted by the unit tests.
 *
 * Authorization is NOT modelled here. A module being enabled at a location
 * never grants anything — roles, memberships and location assignments remain
 * the only authority (see docs: PLAN.md "Configuration is not authorization").
 *
 * ── System-required modules ───────────────────────────────────────────────
 * `settings` is `system_required`: it has no database key, so no row can ever
 * disable it, and a location can never lock its authorized administrators out
 * of organization/location administration, staff-assignment management or
 * module settings themselves. Platform plumbing (sign-in, sign-out, passcode
 * change, organization/location context switching) is not a module at all and
 * is never gated by this registry.
 */

import type { AppTab } from "@/lib/app-tab";
import type { Database } from "@/types/database.generated";

/** Modules that can have a per-location row. Mirrors the database enum 1:1. */
export type ConfigurableModuleKey =
  Database["public"]["Enums"]["location_module_key"];

/** Modules no location can disable. Never stored. */
export type SystemModuleKey = "settings";

export type ModuleKey = ConfigurableModuleKey | SystemModuleKey;

export type ModuleRequirement = "optional" | "system_required";

/** Where the module's DATA lives (docs/v2.0/MODULE_SCOPE_MATRIX.md). */
export type ModuleScope = "organization" | "location" | "hybrid";

/**
 * Organization-level data a module reads regardless of a location's own
 * toggle. Disabling a module at one location never removes or hides this data
 * for the organization — it only governs that location's access to the module.
 */
export type OrganizationDependency =
  | "memberships"
  | "attendance_identity_links"
  | "payroll_settings"
  | "inventory_catalog"
  | "recipe_book";

interface ModuleDefinitionBase {
  /** Position in every list; deterministic, unique, gaps allowed. */
  readonly sortOrder: number;
  /** User-facing label. Display only — never persisted. */
  readonly label: string;
  /** The client shell tab that renders this module. */
  readonly appTab: AppTab;
  readonly scope: ModuleScope;
  readonly organizationDependencies: readonly OrganizationDependency[];
  /**
   * True when the module's UI hosts an account-recovery flow (passcode
   * reset). Disabling it at a location must NOT remove that recovery
   * capability from authorized administrators: V2-004.003/.004 have to keep
   * the flow reachable (PLAN.md §5).
   */
  readonly hostsAccountRecovery: boolean;
}

export interface OptionalModuleDefinition extends ModuleDefinitionBase {
  readonly key: ConfigurableModuleKey;
  readonly requirement: "optional";
  /** Eligible for a per-location `location_module_configs` row. */
  readonly locationConfigurable: true;
}

export interface SystemRequiredModuleDefinition extends ModuleDefinitionBase {
  readonly key: SystemModuleKey;
  readonly requirement: "system_required";
  readonly locationConfigurable: false;
}

export type ModuleDefinition =
  | OptionalModuleDefinition
  | SystemRequiredModuleDefinition;

export const MODULE_REGISTRY = {
  table_allocation: {
    key: "table_allocation",
    sortOrder: 10,
    label: "Table Allocation",
    appTab: "allocation",
    requirement: "optional",
    locationConfigurable: true,
    scope: "location",
    organizationDependencies: [],
    hostsAccountRecovery: false,
  },
  tasks: {
    key: "tasks",
    sortOrder: 20,
    label: "Tasks",
    appTab: "tasks",
    requirement: "optional",
    locationConfigurable: true,
    scope: "location",
    organizationDependencies: [],
    hostsAccountRecovery: false,
  },
  schedule: {
    key: "schedule",
    sortOrder: 30,
    label: "Schedule",
    appTab: "schedule",
    requirement: "optional",
    locationConfigurable: true,
    scope: "location",
    organizationDependencies: [],
    hostsAccountRecovery: false,
  },
  tips: {
    key: "tips",
    sortOrder: 40,
    label: "Tip Split",
    appTab: "tips",
    requirement: "optional",
    locationConfigurable: true,
    scope: "location",
    organizationDependencies: [],
    hostsAccountRecovery: false,
  },
  team: {
    key: "team",
    sortOrder: 50,
    label: "Team",
    appTab: "team",
    requirement: "optional",
    locationConfigurable: true,
    scope: "hybrid",
    organizationDependencies: ["memberships"],
    // The Team tab hosts the manager passcode-reset dialog.
    hostsAccountRecovery: true,
  },
  attendance: {
    key: "attendance",
    sortOrder: 60,
    label: "Attendance",
    appTab: "attendance",
    requirement: "optional",
    locationConfigurable: true,
    scope: "hybrid",
    organizationDependencies: ["attendance_identity_links"],
    hostsAccountRecovery: false,
  },
  payroll: {
    key: "payroll",
    sortOrder: 70,
    label: "Payroll",
    appTab: "payroll",
    requirement: "optional",
    locationConfigurable: true,
    scope: "hybrid",
    organizationDependencies: ["payroll_settings"],
    hostsAccountRecovery: false,
  },
  bar_inventory: {
    key: "bar_inventory",
    sortOrder: 80,
    label: "Bar Inventory",
    appTab: "barInventory",
    requirement: "optional",
    locationConfigurable: true,
    scope: "hybrid",
    organizationDependencies: ["inventory_catalog"],
    hostsAccountRecovery: false,
  },
  recipes: {
    key: "recipes",
    sortOrder: 90,
    label: "Recipes",
    appTab: "recipes",
    requirement: "optional",
    locationConfigurable: true,
    scope: "organization",
    organizationDependencies: ["recipe_book"],
    hostsAccountRecovery: false,
  },
  settings: {
    key: "settings",
    sortOrder: 100,
    label: "Settings",
    appTab: "settings",
    requirement: "system_required",
    locationConfigurable: false,
    scope: "hybrid",
    organizationDependencies: [],
    hostsAccountRecovery: false,
  },
} as const satisfies Record<ModuleKey, ModuleDefinition>;

/**
 * Compile-time proof that every client tab belongs to a registered module.
 * Resolves to `never` when complete; any unclaimed `AppTab` makes the
 * assignment below a type error.
 */
export type AssertEveryAppTabIsRegistered = Exclude<
  AppTab,
  (typeof MODULE_REGISTRY)[ModuleKey]["appTab"]
>;
const everyAppTabIsRegistered: [AssertEveryAppTabIsRegistered] extends [never]
  ? true
  : never = true;
void everyAppTabIsRegistered;

/** Every module in deterministic display order. Frozen. */
export const MODULES: readonly ModuleDefinition[] = Object.freeze(
  (Object.values(MODULE_REGISTRY) as ModuleDefinition[])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder),
);

/** Modules a location may enable or disable, in display order. */
export const CONFIGURABLE_MODULES: readonly OptionalModuleDefinition[] =
  Object.freeze(
    MODULES.filter(
      (definition): definition is OptionalModuleDefinition =>
        definition.locationConfigurable,
    ),
  );

export const MODULE_KEYS: readonly ModuleKey[] = Object.freeze(
  MODULES.map((definition) => definition.key),
);

export const CONFIGURABLE_MODULE_KEYS: readonly ConfigurableModuleKey[] =
  Object.freeze(CONFIGURABLE_MODULES.map((definition) => definition.key));

const KEY_SET: ReadonlySet<string> = new Set(MODULE_KEYS);
const CONFIGURABLE_KEY_SET: ReadonlySet<string> = new Set(
  CONFIGURABLE_MODULE_KEYS,
);

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && KEY_SET.has(value);
}

/** True only for keys that may be stored (never `settings`). */
export function isConfigurableModuleKey(
  value: unknown,
): value is ConfigurableModuleKey {
  return typeof value === "string" && CONFIGURABLE_KEY_SET.has(value);
}

export function getModuleDefinition<K extends ModuleKey>(
  key: K,
): (typeof MODULE_REGISTRY)[K] {
  return MODULE_REGISTRY[key];
}

const MODULE_BY_TAB: ReadonlyMap<AppTab, ModuleDefinition> = new Map(
  MODULES.map((definition) => [definition.appTab, definition]),
);

/**
 * The module that owns a client tab. Total: the compile-time assertion above
 * guarantees every `AppTab` is registered, so this never returns undefined for
 * a valid tab.
 */
export function moduleForAppTab(tab: AppTab): ModuleDefinition {
  const definition = MODULE_BY_TAB.get(tab);
  if (!definition) {
    // Unreachable while AssertEveryAppTabIsRegistered holds; fail loudly
    // rather than invent a module for an unknown tab.
    throw new Error(`No module is registered for app tab "${tab}"`);
  }
  return definition;
}
