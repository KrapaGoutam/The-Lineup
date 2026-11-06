import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import type { ModuleConfigReadResult } from "../domain/module-config";
import {
  decideModuleAccess,
  moduleDenialMessage,
  type EnforcementModeReadResult,
  type ModuleAccessVerdict,
  type ModuleDenialCode,
} from "../domain/module-enforcement";
import { readLocationModuleConfigs } from "./module-config-reader";

/**
 * V2-004.004 — THE server-side module guard.
 *
 * Every optional-module Server Action calls `guardModule` after its existing
 * authentication and role checks and before it reads or writes module data.
 *
 * Trust boundaries
 *   • The target location is NEVER taken from the request. It is either passed
 *     in by a caller that already verified it (Tasks, via the workspace
 *     expectation) or resolved here by `getPrimaryLocation`, the same verified
 *     persisted-context resolver every module action already uses. A stale tab
 *     therefore cannot select another location by changing its input.
 *   • The activation switch is read from the database with the caller's own
 *     session; the browser cannot supply, shadow or override it.
 *   • There is no `demoMode` parameter. Demo is decided by trusted server
 *     configuration upstream and never reaches this code (demo actions do not
 *     call the database).
 *   • This module never authorizes. It only adds the "is the module turned on
 *     here" restriction after the existing role/membership/location checks.
 *
 * While the switch is `staged` this performs ONE small read and otherwise
 * returns immediately, so activating the code before an environment is
 * reconciled changes nothing.
 */

interface QueryError {
  readonly code?: string;
}

/** Postgres/PostgREST codes meaning "the table is not there (yet)". */
const SCHEMA_MISSING_CODES: ReadonlySet<string> = new Set([
  "42P01",
  "PGRST205",
  "PGRST200",
]);

export async function readModuleEnforcementMode(
  client?: SupabaseClient<Database>,
): Promise<EnforcementModeReadResult> {
  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("module_enforcement_settings")
      .select("mode")
      .maybeSingle();
    if (error) {
      const code = (error as QueryError).code ?? "";
      // No switch table => no environment can be active: legacy behaviour.
      if (SCHEMA_MISSING_CODES.has(code)) {
        return { status: "ok", mode: "staged", source: "not_deployed" };
      }
      return { status: "unavailable" };
    }
    if (!data) return { status: "invalid" };
    if (data.mode === "staged" || data.mode === "active") {
      return { status: "ok", mode: data.mode, source: "database" };
    }
    return { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export interface ModuleGuardTarget {
  /** Module identifier (registry key). Validated at runtime. */
  readonly module: string;
  /** Server-verified organization the action operates on. */
  readonly organizationId: string;
  /**
   * A location the CALLER ALREADY VERIFIED (e.g. Tasks'
   * `assertWorkspaceExpectation`). When omitted the verified persisted
   * context is resolved here.
   */
  readonly location?: { readonly id: string } | null;
}

export interface ModuleGuardDeps {
  readonly client?: SupabaseClient<Database>;
  readonly resolveLocation?: (
    organizationId: string,
  ) => Promise<{ readonly id: string } | null>;
  readonly readConfigs?: (
    locationId: string,
  ) => Promise<ModuleConfigReadResult>;
  readonly readMode?: () => Promise<EnforcementModeReadResult>;
}

/** Typed verdict for callers that need the detail (and for tests). */
export async function checkModuleAccess(
  target: ModuleGuardTarget,
  deps: ModuleGuardDeps = {},
): Promise<ModuleAccessVerdict> {
  const enforcement = await (
    deps.readMode ?? (() => readModuleEnforcementMode(deps.client))
  )();

  // Staged (or an unreadable switch for a system module): no location work.
  if (enforcement.status === "ok" && enforcement.mode === "staged") {
    return decideModuleAccess({
      module: target.module,
      enforcement,
      configuration: null,
    });
  }

  let configuration: ModuleConfigReadResult | null = null;
  if (enforcement.status === "ok") {
    const location =
      target.location !== undefined
        ? target.location
        : await (deps.resolveLocation ?? getPrimaryLocation)(
            target.organizationId,
          );
    if (location) {
      configuration = await (
        deps.readConfigs ??
        ((id: string) => readLocationModuleConfigs(id, deps.client))
      )(location.id);
    }
  }

  return decideModuleAccess({
    module: target.module,
    enforcement,
    configuration,
  });
}

/**
 * The shape every module action can return as-is: it is structurally an
 * `{ ok: false; error: string }` branch of each action's own result union.
 * `moduleUnavailable` lets a client explain why; `sessionInvalid` /
 * `contextStale` reuse the existing client reactions.
 */
export interface ModuleGuardFailure {
  readonly ok: false;
  readonly error: string;
  readonly moduleUnavailable: true;
  readonly sessionInvalid?: true;
  readonly contextStale?: true;
}

export function toGuardFailure(code: ModuleDenialCode): ModuleGuardFailure {
  return {
    ok: false,
    error: moduleDenialMessage(code),
    moduleUnavailable: true,
    ...(code === "stale_context" ? { contextStale: true as const } : {}),
  };
}

/**
 * Returns `null` when the action may proceed, otherwise a ready-to-return
 * failure. Denials are logged server-side with a code and module only.
 */
export async function guardModule(
  target: ModuleGuardTarget,
  deps: ModuleGuardDeps = {},
): Promise<ModuleGuardFailure | null> {
  let verdict: ModuleAccessVerdict;
  try {
    verdict = await checkModuleAccess(target, deps);
  } catch {
    // Unexpected failure while deciding: never proceed on a guess.
    verdict = { allowed: false, code: "configuration_unavailable" };
  }
  if (verdict.allowed) return null;

  console.warn("module-enforcement: denied", {
    module: target.module,
    code: verdict.code,
  });
  const failure = toGuardFailure(verdict.code);
  return verdict.sessionInvalid
    ? { ...failure, sessionInvalid: true as const }
    : failure;
}
