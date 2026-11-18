import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listCurrentEligibleContextsWithAccess } from "@/features/context/data/active-context";
import {
  normalizeLocationAddress,
  type LocationAddress,
} from "@/features/locations/domain/location";
import {
  checkModuleAccess,
  readModuleEnforcementMode,
} from "@/features/modules/data/module-enforcement";
import { readLocationModuleConfigs } from "@/features/modules/data/module-config-reader";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import type { Database } from "@/types/database.generated";

import {
  resolveLocationAuthority,
  type LocationAuthority,
} from "../domain/report-authority";

export type ReportingAuthorityResult =
  | {
      readonly ok: true;
      readonly profileId: string;
      readonly authorities: readonly LocationAuthority[];
      /** Operable branches per organization the caller can reach (before module filtering). */
      readonly orgLocationCounts: Readonly<Record<string, number>>;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly sessionInvalid?: true;
    };

const CONCURRENCY = 6;

async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      out[index] = await work(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

/**
 * The ONE place a report's authority is established, server-side, from verified facts:
 *  1. a live Supabase session (a banned or revoked user fails here),
 *  2. the canonical three-layer resolver for every (organization, branch) the caller can
 *     reach — never a client-supplied organization, branch or role,
 *  3. the live database predicate `attendance_can_manage(branch)` (so a revoked or stale
 *     assignment loses management at once),
 *  4. the per-branch module verdicts for Attendance and Payroll.
 *
 * Any failure to establish a fact lowers authority (fail closed); an unreadable context
 * list is an error, never an empty-but-successful list. Branches where the caller can
 * report on neither Attendance nor Payroll are dropped.
 */
export async function loadReportingAuthorities(
  supabase: SupabaseClient<Database>,
): Promise<ReportingAuthorityResult> {
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const listed = await listCurrentEligibleContextsWithAccess({
    client: supabase,
  });
  if (listed.status === "unauthenticated") {
    return {
      ok: false,
      error: "Your session is no longer valid. Please sign in again.",
      sessionInvalid: true,
    };
  }
  if (listed.status === "error") {
    return { ok: false, error: "Unable to verify your access right now." };
  }
  const contexts = listed.contexts;
  if (contexts.length === 0) {
    return {
      ok: true,
      profileId: listed.profileId,
      authorities: [],
      orgLocationCounts: {},
    };
  }

  // Branch rows (attendance mode, address) — RLS-bound read; a missing row = no authority.
  const rows = new Map<
    string,
    { attendanceMode: string | null; address?: LocationAddress }
  >();
  const ids = contexts.map((c) => c.locationId);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, attendance_mode, address")
      .in("id", ids.slice(i, i + 100));
    if (error) {
      return { ok: false, error: "Unable to verify your access right now." };
    }
    for (const row of data ?? []) {
      rows.set(row.id, {
        attendanceMode: row.attendance_mode ?? null,
        address: normalizeLocationAddress(
          (row.address ?? undefined) as LocationAddress | undefined,
        ),
      });
    }
  }

  const mode = await readModuleEnforcementMode(supabase);
  const configCache = new Map<
    string,
    ReturnType<typeof readLocationModuleConfigs>
  >();
  const readConfigs = (locationId: string) => {
    let pending = configCache.get(locationId);
    if (!pending) {
      pending = readLocationModuleConfigs(locationId, supabase);
      configCache.set(locationId, pending);
    }
    return pending;
  };

  const usable = async (
    module: "attendance" | "payroll",
    organizationId: string,
    locationId: string,
  ): Promise<boolean> => {
    try {
      const verdict = await checkModuleAccess(
        { module, organizationId, location: { id: locationId } },
        { client: supabase, readMode: async () => mode, readConfigs },
      );
      return verdict.allowed;
    } catch {
      return false;
    }
  };

  const authorities = await mapBounded(contexts, CONCURRENCY, async (ctx) => {
    const row = rows.get(ctx.locationId);
    if (!row) return null;
    const [attendanceModuleUsable, payrollModuleUsable, manage] =
      await Promise.all([
        usable("attendance", ctx.organizationId, ctx.locationId),
        usable("payroll", ctx.organizationId, ctx.locationId),
        supabase.rpc("attendance_can_manage", {
          p_location_id: ctx.locationId,
        }),
      ]);
    return resolveLocationAuthority({
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      organizationSlug: ctx.organizationSlug,
      locationId: ctx.locationId,
      locationName: ctx.locationName,
      timeZone: ctx.timeZone,
      address: row.address,
      attendanceMode: row.attendanceMode,
      allowed: ctx.access.allowed,
      capabilities: ctx.access.capabilities,
      attendanceModuleUsable,
      payrollModuleUsable,
      dbAttendanceManage: manage.error ? false : manage.data === true,
    });
  });

  const orgLocationCounts: Record<string, number> = {};
  for (const ctx of contexts) {
    orgLocationCounts[ctx.organizationId] =
      (orgLocationCounts[ctx.organizationId] ?? 0) + 1;
  }

  return {
    ok: true,
    profileId: listed.profileId,
    orgLocationCounts,
    authorities: authorities.filter(
      (a): a is LocationAuthority =>
        a !== null && (a.attendance !== "none" || a.payroll !== "none"),
    ),
  };
}
