import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";
import { createClient } from "@/lib/supabase/server";

import {
  buildModuleConfigSnapshot,
  mapModuleConfigRow,
  type LocationLifecycle,
  type LocationModuleConfig,
  type ModuleConfigReadResult,
} from "../domain/module-config";

/**
 * V2-004.001 — server-authoritative reader of one location's module
 * configuration.
 *
 * V2-004.003 consumes this at the verified server entry for navigation.
 * Demo mode never calls it; backend module enforcement remains V2-004.004.
 *
 * Contract (the reason this is not shaped like the other location readers):
 *   • It NEVER throws and NEVER turns a failure into an empty successful
 *     configuration. Existing location readers return `[]`/`null` on any
 *     error, which would read as "nothing configured"; here every failure is
 *     its own result status (see `ModuleConfigReadResult`).
 *   • It never trusts a row that violates the contract: one malformed row
 *     fails the whole read (`error: invalid_row`) instead of being skipped.
 *   • A module key this build does not know (a newer database) is ignored —
 *     it cannot enable anything this build understands.
 *   • Authority comes from the database. Row Level Security filters what the
 *     caller may read; the `locationId` argument is untrusted input and
 *     grants nothing. A location the caller cannot see is reported as
 *     `location_unavailable` (no tenant enumeration).
 *   • Known limit (documented in PLAN.md §6): RLS cannot distinguish "no rows"
 *     from "rows you may not read". Callers must obtain location access from
 *     the active-context resolver first; `missing` is fail-closed regardless.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QueryError {
  readonly code?: string;
  readonly message?: string;
}

/** PostgREST / Postgres codes that mean "the table is not there (yet)". */
const SCHEMA_MISSING_CODES: ReadonlySet<string> = new Set([
  "42P01", // undefined_table
  "PGRST205", // table not found in the schema cache
  "PGRST200", // relationship not found (stale cache after a migration)
]);

/** Postgres/PostgREST codes meaning "you are not allowed". */
const PERMISSION_CODES: ReadonlySet<string> = new Set([
  "42501", // insufficient_privilege
  "PGRST301", // JWT invalid / expired
  "PGRST302", // anonymous access disabled
]);

type FailureResult = Extract<
  ModuleConfigReadResult,
  { status: "unauthorized" | "unavailable" }
>;

function classifyQueryError(error: QueryError): FailureResult {
  const code = error.code ?? "";
  if (SCHEMA_MISSING_CODES.has(code)) {
    return { status: "unavailable", reason: "schema_missing" };
  }
  if (PERMISSION_CODES.has(code)) {
    return { status: "unauthorized", reason: "permission_denied" };
  }
  return { status: "unavailable", reason: "database_error" };
}

function lifecycleOf(row: {
  active: boolean;
  archived_at: string | null;
}): LocationLifecycle {
  if (row.archived_at !== null) return "archived";
  return row.active ? "active" : "inactive";
}

export async function readLocationModuleConfigs(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<ModuleConfigReadResult> {
  const id = typeof locationId === "string" ? locationId.trim() : "";
  if (!UUID_PATTERN.test(id)) {
    return {
      status: "location_unavailable",
      locationId: id,
      reason: "not_found",
    };
  }

  try {
    const supabase = client ?? (await createClient());

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return authError.name === "AuthRetryableFetchError"
        ? { status: "unavailable", reason: "database_error" }
        : { status: "unauthorized", reason: "unauthenticated" };
    }
    if (!authData?.user) {
      return { status: "unauthorized", reason: "unauthenticated" };
    }

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id, active, archived_at")
      .eq("id", id)
      .maybeSingle();
    if (locationError) return classifyQueryError(locationError);
    if (!location) {
      return {
        status: "location_unavailable",
        locationId: id,
        reason: "not_found",
      };
    }

    const { data: rows, error: rowsError } = await supabase
      .from("location_module_configs")
      .select(
        "location_id, module_key, is_enabled, metadata, created_at, updated_at, updated_by",
      )
      .eq("location_id", id);
    if (rowsError) return classifyQueryError(rowsError);
    if (!rows) return { status: "unavailable", reason: "database_error" };

    const configs: LocationModuleConfig[] = [];
    for (const row of rows) {
      const mapped = mapModuleConfigRow(row);
      if (mapped.kind === "ok") {
        configs.push(mapped.config);
      } else if (mapped.kind === "invalid") {
        return {
          status: "error",
          code: "invalid_row",
          message: `Module configuration for "${mapped.moduleKey}" violates the contract`,
        };
      }
      // unrecognized_module: a newer database than this build -- ignore.
    }

    return buildModuleConfigSnapshot(id, lifecycleOf(location), configs);
  } catch {
    // Transport failure, missing env, etc. Never an empty success.
    return { status: "unavailable", reason: "database_error" };
  }
}
