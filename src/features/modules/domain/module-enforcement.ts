/**
 * V2-004.004 — Backend module enforcement: the pure decision (no I/O).
 *
 * One question, answered identically for every Server Action: "may this
 * server-verified request use module M at its server-verified location?"
 *
 * ── Two independent facts ──────────────────────────────────────────────────
 *   mode      `staged`  the database switch is off: legacy behaviour, every
 *                       module is allowed (the estate is not reconciled yet).
 *             `active`  an explicit Enabled row is required. Missing is NOT
 *                       enabled, and neither is any failure.
 *   state     the existing `resolveModuleState` result for (location, module).
 *
 * The switch lives in the database (`module_enforcement_settings`), so the
 * Server Action layer and the database layer can never disagree about whether
 * enforcement is on, and no client input can influence it.
 *
 * ── Fail-closed rules (active mode) ────────────────────────────────────────
 * Every state other than `enabled` / `system_required` is a denial, including
 * every read failure. If the switch itself cannot be read, the request is
 * denied: not knowing whether enforcement is on is not permission to proceed.
 * The ONE exception is a switch table that does not exist (migration not
 * applied in this environment): no environment can be active without it.
 *
 * ── Configuration is not authorization ─────────────────────────────────────
 * An `allowed` verdict means only "the module is not turned off here". Role,
 * membership and location authority are still decided by the existing checks,
 * which always run first.
 */

import {
  isModuleUsable,
  resolveModuleState,
  type ModuleConfigReadResult,
} from "./module-config";
import {
  isConfigurableModuleKey,
  isModuleKey,
  type ModuleKey,
} from "./module-registry";

export type EnforcementMode = "staged" | "active";

export type EnforcementModeReadResult =
  | {
      readonly status: "ok";
      readonly mode: EnforcementMode;
      /** `not_deployed`: the switch table does not exist in this database. */
      readonly source: "database" | "not_deployed";
    }
  | { readonly status: "unavailable" }
  /** A row this build cannot trust (unknown mode, no row). */
  | { readonly status: "invalid" };

export type ModuleDenialCode =
  | "module_disabled"
  | "module_missing"
  | "location_unavailable"
  | "unauthorized"
  | "stale_context"
  | "configuration_unavailable"
  | "invalid_configuration"
  | "invalid_module";

export type ModuleAccessVerdict =
  | {
      readonly allowed: true;
      readonly enforcement: EnforcementMode;
      readonly basis: "staged" | "enabled" | "system_required";
    }
  | {
      readonly allowed: false;
      readonly code: ModuleDenialCode;
      /** The caller has no valid session (the client should sign out). */
      readonly sessionInvalid?: true;
    };

export interface ModuleAccessInput {
  /** Untrusted at runtime: validated against the registry. */
  readonly module: string;
  readonly enforcement: EnforcementModeReadResult;
  /**
   * Read of the SERVER-VERIFIED location's configuration. `null` = no
   * verifiable operational location (stale / ambiguous / revoked context).
   * Only consulted when enforcement is active.
   */
  readonly configuration: ModuleConfigReadResult | null;
}

export function decideModuleAccess(
  input: ModuleAccessInput,
): ModuleAccessVerdict {
  if (!isModuleKey(input.module)) {
    return { allowed: false, code: "invalid_module" };
  }
  const key: ModuleKey = input.module;

  // Settings (and any future system module) is never gated: it is where an
  // administrator repairs configuration. Independent of the switch and of any
  // read failure.
  if (!isConfigurableModuleKey(key)) {
    return {
      allowed: true,
      enforcement: modeOf(input.enforcement),
      basis: "system_required",
    };
  }

  const enforcement = input.enforcement;
  if (enforcement.status !== "ok") {
    return {
      allowed: false,
      code:
        enforcement.status === "invalid"
          ? "invalid_configuration"
          : "configuration_unavailable",
    };
  }
  if (enforcement.mode === "staged") {
    return { allowed: true, enforcement: "staged", basis: "staged" };
  }

  if (input.configuration === null) {
    return { allowed: false, code: "stale_context" };
  }

  const state = resolveModuleState(input.configuration, key);
  if (isModuleUsable(state)) {
    return {
      allowed: true,
      enforcement: "active",
      basis: state.status === "enabled" ? "enabled" : "system_required",
    };
  }

  switch (state.status) {
    case "disabled":
      return { allowed: false, code: "module_disabled" };
    case "missing":
      return { allowed: false, code: "module_missing" };
    case "location_unavailable":
      return { allowed: false, code: "location_unavailable" };
    case "unauthorized":
      return {
        allowed: false,
        code: "unauthorized",
        ...(state.reason === "unauthenticated"
          ? { sessionInvalid: true as const }
          : {}),
      };
    case "unavailable":
      return { allowed: false, code: "configuration_unavailable" };
    case "error":
      return { allowed: false, code: "invalid_configuration" };
    default:
      // enabled / system_required are handled by isModuleUsable above.
      return { allowed: false, code: "invalid_configuration" };
  }
}

function modeOf(read: EnforcementModeReadResult): EnforcementMode {
  return read.status === "ok" ? read.mode : "active";
}

/**
 * Safe, user-facing wording. Never names another tenant, a location, a table
 * or a database error; a disabled and a never-configured module read the same
 * to the person using the app.
 */
export function moduleDenialMessage(code: ModuleDenialCode): string {
  switch (code) {
    case "module_disabled":
    case "module_missing":
    case "invalid_module":
      return "This feature is turned off for this location.";
    case "location_unavailable":
      return "This location is not available for that right now.";
    case "unauthorized":
      return "You do not have access to do that.";
    case "stale_context":
      return "Your active location changed. Refresh your workspace before continuing so your actions apply to the correct location.";
    case "configuration_unavailable":
    case "invalid_configuration":
      return "We couldn't confirm this feature is available. Please try again.";
  }
}
