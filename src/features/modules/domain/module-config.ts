/**
 * V2-004.001 — Per-location module configuration contract (pure domain).
 *
 * Types and total, I/O-free helpers shared by the future settings UI
 * (V2-004.002), navigation (V2-004.003) and backend enforcement (V2-004.004).
 * Nothing here reads a database or changes behaviour; nothing consumes it yet.
 *
 * ── The six answers a consumer must be able to tell apart ─────────────────
 *   enabled              a row exists and is_enabled = true
 *   disabled             a row exists and is_enabled = false (explicit decision)
 *   missing              the location is readable but has NO row: "not
 *                        configured". NEVER the same as enabled.
 *   location_unavailable the location does not exist / is not visible to the
 *                        caller (no tenant enumeration), or is not ACTIVE
 *   unauthorized         no session, or the database refused the read
 *   unavailable | error  the database/schema could not be consulted, or it
 *                        returned data this build cannot trust. A failure is
 *                        NEVER reported as an empty (successful) configuration.
 * plus `system_required` for modules (Settings) that no location can disable.
 *
 * ── Fail-closed rule for consumers ────────────────────────────────────────
 * `isModuleUsable` is true ONLY for `enabled` and `system_required`. `missing`
 * and every failure state are NOT usable. How legacy locations without rows
 * keep working is a rollout concern, not a read-time default: V2-008.004
 * reconciles legacy locations (explicit rows) BEFORE V2-004.004 enforcement
 * is activated anywhere with live data (PLAN.md §6).
 *
 * ── Configuration is not authorization ────────────────────────────────────
 * `metadata` is informational only. A config row never grants, removes or
 * implies a role, membership or location assignment.
 */

import type { Database } from "@/types/database.generated";

import {
  CONFIGURABLE_MODULES,
  MODULES,
  isConfigurableModuleKey,
  type ConfigurableModuleKey,
  type ModuleDefinition,
  type ModuleKey,
} from "./module-registry";

export type LocationModuleConfigRow =
  Database["public"]["Tables"]["location_module_configs"]["Row"];

// ── Metadata (informational envelope; mirrors the database validator) ──────

export const MODULE_METADATA_MAX_BYTES = 2048;
export const MODULE_METADATA_NOTE_MAX_LENGTH = 280;
export const MODULE_METADATA_SCHEMA_VERSION = 1;

/**
 * Informational envelope. `settings` is RESERVED for typed per-module settings
 * and must be empty until a later phase defines them; it is not a place for
 * roles, credentials or any authorization data (unknown keys are rejected by
 * the database and by `parseModuleMetadata`).
 */
export interface ModuleMetadata {
  readonly schemaVersion?: typeof MODULE_METADATA_SCHEMA_VERSION;
  readonly note?: string;
  readonly settings?: Readonly<Record<string, never>>;
}

const ALLOWED_METADATA_KEYS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "note",
  "settings",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted JSON value against the same envelope the database
 * enforces (`private.location_module_metadata_valid`). Returns null when the
 * value is not an acceptable envelope.
 */
export function parseModuleMetadata(value: unknown): ModuleMetadata | null {
  if (!isPlainObject(value)) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (new TextEncoder().encode(serialized).length > MODULE_METADATA_MAX_BYTES) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) return null;
  }

  const result: {
    schemaVersion?: typeof MODULE_METADATA_SCHEMA_VERSION;
    note?: string;
    settings?: Readonly<Record<string, never>>;
  } = {};

  if ("schemaVersion" in value) {
    if (value.schemaVersion !== MODULE_METADATA_SCHEMA_VERSION) return null;
    result.schemaVersion = MODULE_METADATA_SCHEMA_VERSION;
  }
  if ("note" in value) {
    const note = value.note;
    if (typeof note !== "string") return null;
    // Mirrors the database: btrim() trims spaces only; char_length counts
    // characters (code points), not UTF-16 units.
    const trimmedLength = [...note.replace(/^ +| +$/g, "")].length;
    if (
      trimmedLength < 1 ||
      [...note].length > MODULE_METADATA_NOTE_MAX_LENGTH
    ) {
      return null;
    }
    result.note = note;
  }
  if ("settings" in value) {
    const settings = value.settings;
    if (!isPlainObject(settings) || Object.keys(settings).length > 0) {
      return null;
    }
    result.settings = {};
  }
  return result;
}

// ── Records ────────────────────────────────────────────────────────────────

export interface LocationModuleConfig {
  readonly locationId: string;
  readonly moduleKey: ConfigurableModuleKey;
  readonly isEnabled: boolean;
  readonly metadata: ModuleMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Last writer (server-stamped from auth.uid()); null for privileged writes. */
  readonly updatedBy: string | null;
}

export type ModuleConfigRowMapping =
  | { readonly kind: "ok"; readonly config: LocationModuleConfig }
  /** A module key this build does not know (newer database than application). */
  | { readonly kind: "unrecognized_module"; readonly moduleKey: string }
  /** The row violates the contract (metadata envelope). Never trusted. */
  | { readonly kind: "invalid"; readonly moduleKey: string };

export function mapModuleConfigRow(
  row: LocationModuleConfigRow,
): ModuleConfigRowMapping {
  if (!isConfigurableModuleKey(row.module_key)) {
    return { kind: "unrecognized_module", moduleKey: String(row.module_key) };
  }
  const metadata = parseModuleMetadata(row.metadata);
  if (metadata === null || typeof row.is_enabled !== "boolean") {
    return { kind: "invalid", moduleKey: row.module_key };
  }
  return {
    kind: "ok",
    config: {
      locationId: row.location_id,
      moduleKey: row.module_key,
      isEnabled: row.is_enabled,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    },
  };
}

// ── Read result (what a reader returns for one location) ───────────────────

export type LocationLifecycle = "active" | "inactive" | "archived";

export type ModuleConfigUnauthorizedReason =
  | "unauthenticated"
  | "permission_denied";

export type ModuleConfigUnavailableReason =
  /** The table does not exist yet (migration not applied in this environment). */
  | "schema_missing"
  /** The database could not be reached or returned a transport/server error. */
  | "database_error";

export type ModuleConfigErrorCode =
  /** A returned row violated the contract and was not trusted. */
  "invalid_row" | "unexpected";

export type ModuleConfigReadResult =
  | {
      readonly status: "ok";
      readonly locationId: string;
      readonly lifecycle: LocationLifecycle;
      readonly configs: ReadonlyMap<
        ConfigurableModuleKey,
        LocationModuleConfig
      >;
    }
  | {
      readonly status: "location_unavailable";
      readonly locationId: string;
      /** Missing OR not visible to the caller; the two are deliberately not distinguished. */
      readonly reason: "not_found";
    }
  | {
      readonly status: "unauthorized";
      readonly reason: ModuleConfigUnauthorizedReason;
    }
  | {
      readonly status: "unavailable";
      readonly reason: ModuleConfigUnavailableReason;
    }
  | {
      readonly status: "error";
      readonly code: ModuleConfigErrorCode;
      readonly message: string;
    };

// ── Per-module state (what a consumer asks) ────────────────────────────────

export type ModuleState =
  | { readonly status: "enabled"; readonly config: LocationModuleConfig }
  | { readonly status: "disabled"; readonly config: LocationModuleConfig }
  | { readonly status: "missing" }
  | { readonly status: "system_required" }
  | {
      readonly status: "location_unavailable";
      readonly reason: "not_found" | "inactive" | "archived";
    }
  | {
      readonly status: "unauthorized";
      readonly reason: ModuleConfigUnauthorizedReason;
    }
  | {
      readonly status: "unavailable";
      readonly reason: ModuleConfigUnavailableReason;
    }
  | {
      readonly status: "error";
      readonly code: ModuleConfigErrorCode;
      readonly message: string;
    };

export type ModuleStatus = ModuleState["status"];

/**
 * The OPERATIONAL question: may `key` be used at the read location right now?
 *
 *  • `settings` (system-required) is always `system_required`, independent of
 *    the read result — a database failure must never lock administrators out.
 *  • Any failed or non-ok read passes its failure through unchanged; it is
 *    never converted into `missing`, `disabled` or `enabled`.
 *  • A location that is not ACTIVE is `location_unavailable` for operational
 *    use. A management screen that must still SHOW an inactive location's
 *    configuration reads `result.configs` directly instead.
 */
export function resolveModuleState(
  result: ModuleConfigReadResult,
  key: ModuleKey,
): ModuleState {
  if (!isConfigurableModuleKey(key)) {
    return { status: "system_required" };
  }

  switch (result.status) {
    case "ok": {
      if (result.lifecycle !== "active") {
        return { status: "location_unavailable", reason: result.lifecycle };
      }
      const config = result.configs.get(key);
      if (!config) return { status: "missing" };
      return config.isEnabled
        ? { status: "enabled", config }
        : { status: "disabled", config };
    }
    case "location_unavailable":
      return { status: "location_unavailable", reason: result.reason };
    case "unauthorized":
      return { status: "unauthorized", reason: result.reason };
    case "unavailable":
      return { status: "unavailable", reason: result.reason };
    case "error":
      return { status: "error", code: result.code, message: result.message };
  }
}

/** True ONLY when the module may be used: explicitly enabled, or system-required. */
export function isModuleUsable(state: ModuleState): boolean {
  return state.status === "enabled" || state.status === "system_required";
}

export interface ModuleStateEntry {
  readonly module: ModuleDefinition;
  readonly state: ModuleState;
}

/** Every registered module with its resolved state, in registry order. */
export function listModuleStates(
  result: ModuleConfigReadResult,
): readonly ModuleStateEntry[] {
  return MODULES.map((definition) => ({
    module: definition,
    state: resolveModuleState(result, definition.key),
  }));
}

/** Configurable modules with no row at a readable location (candidates for backfill). */
export function listMissingConfigurableModules(
  result: ModuleConfigReadResult,
): readonly ConfigurableModuleKey[] {
  if (result.status !== "ok") return [];
  return CONFIGURABLE_MODULES.filter(
    (definition) => !result.configs.has(definition.key),
  ).map((definition) => definition.key);
}

/** Builds an `ok` read result from already-validated configs. */
export function buildModuleConfigSnapshot(
  locationId: string,
  lifecycle: LocationLifecycle,
  configs: readonly LocationModuleConfig[],
): Extract<ModuleConfigReadResult, { status: "ok" }> {
  return {
    status: "ok",
    locationId,
    lifecycle,
    configs: new Map(configs.map((config) => [config.moduleKey, config])),
  };
}
