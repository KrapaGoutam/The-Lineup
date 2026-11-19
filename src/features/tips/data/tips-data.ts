import "server-only";

import {
  buildTipsReadModel,
  buildTipsTeam,
  classifyTipsReadError,
  type TipsUnavailableReason,
} from "@/features/tips/domain/tips-read-model";
import {
  buildTipsRange,
  type TipsRange,
} from "@/features/tips/domain/tips-range-model";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { locationForLoader } from "@/features/locations/data/primary-location";
import type { TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TipsContext = {
  locationId: string;
  timeZone: string;
  serviceDate: string;
  tipPoolId: number | null;
  /**
   * Legacy lock state of TODAY'S pool. New days are never finalized; this only
   * reflects a day finalized by the earlier workflow (it still locks the allocation
   * board until an audited correction reopens it).
   */
  status: TipsDayStatus;
  /** Name directory (current workforce + historical-only people). */
  team: TeamMember[];
  /** Profiles that may be offered for a NEW interval (current workforce). */
  selectableIds: string[];
  /** Legacy finalize/reopen entries of today's pool (board lock history). */
  auditLog: TipsAuditEntry[];
  /** Today's saved distribution (intervals, allocations, revisions). */
  today: TipsRange | null;
  /**
   * Set when the location-authorized Tips RPCs could not be read (backend not
   * migrated, caller denied, unexpected response). The context then carries
   * no people and no money -- the page shows a notice, never a fallback.
   */
  unavailable?: TipsUnavailableReason;
};

export type TipsRangeLoad =
  | {
      ok: true;
      range: TipsRange;
      team: TeamMember[];
      selectableIds: string[];
      /** The unparsed roster payload, for the legacy day model. */
      rosterRaw: unknown;
    }
  | { ok: false; reason: TipsUnavailableReason };

/**
 * V2.0.8. The ONE reader for saved distributions and history: the location-authorized
 * `tips_get_range` RPC plus the location roster, both bound to the server-verified
 * location. What each caller may see (all intervals + audit trail for managers; only
 * their own days and shares for staff) is decided inside the database. There is no
 * fallback to direct table reads.
 */
export async function loadTipsRange(
  supabase: Supabase,
  input: {
    organizationId: string;
    locationId: string;
    from: string;
    to: string;
    includeRevisions: boolean;
  },
): Promise<TipsRangeLoad> {
  const [rosterResult, rangeResult] = await Promise.all([
    supabase.rpc("tips_location_roster", {
      p_organization_id: input.organizationId,
      p_location_id: input.locationId,
    }),
    supabase.rpc("tips_get_range", {
      p_organization_id: input.organizationId,
      p_location_id: input.locationId,
      p_from: input.from,
      p_to: input.to,
      p_include_revisions: input.includeRevisions,
    }),
  ]);
  if (rosterResult.error) {
    return { ok: false, reason: classifyTipsReadError(rosterResult.error) };
  }
  if (rangeResult.error) {
    return { ok: false, reason: classifyTipsReadError(rangeResult.error) };
  }
  const people = buildTipsTeam(rosterResult.data);
  const range = buildTipsRange(rangeResult.data);
  if (!people || !range) return { ok: false, reason: "unavailable" };
  return { ok: true, range, ...people, rosterRaw: rosterResult.data };
}

/**
 * V2-005.003 / V2.0.8. The ONLY read path for the Tips page is the location-authorized
 * SECURITY DEFINER RPCs bound to the server-verified active location. If any is missing
 * (old schema), denies the caller, or returns an unexpected shape, the view fails closed.
 */
export async function getTipsContext(
  organizationId: string,
  verifiedLocation?: VerifiedLocationScope,
): Promise<TipsContext | null> {
  const supabase = await createClient();
  const location = await locationForLoader(organizationId, verifiedLocation);
  if (!location) return null;

  const serviceDate = zonedWallTimeFromInstant(
    new Date(),
    location.time_zone,
  ).date;

  const failClosed = (unavailable: TipsUnavailableReason): TipsContext => ({
    locationId: location.id,
    timeZone: location.time_zone,
    serviceDate,
    tipPoolId: null,
    status: "estimating",
    team: [],
    selectableIds: [],
    auditLog: [],
    today: null,
    unavailable,
  });

  const [loaded, dayResult] = await Promise.all([
    loadTipsRange(supabase, {
      organizationId,
      locationId: location.id,
      from: serviceDate,
      to: serviceDate,
      includeRevisions: true,
    }),
    supabase.rpc("tips_get_day_data", {
      p_organization_id: organizationId,
      p_location_id: location.id,
      p_service_date: serviceDate,
    }),
  ]);

  if (!loaded.ok) return failClosed(loaded.reason);
  if (dayResult.error) {
    return failClosed(classifyTipsReadError(dayResult.error));
  }

  const built = buildTipsReadModel({
    roster: loaded.rosterRaw,
    dayData: dayResult.data,
    timeZone: location.time_zone,
  });
  if (!built.ok) return failClosed(built.reason);

  return {
    locationId: location.id,
    timeZone: location.time_zone,
    serviceDate,
    tipPoolId: built.model.tipPoolId,
    status: built.model.status,
    team: loaded.team,
    selectableIds: loaded.selectableIds,
    auditLog: built.model.auditLog,
    today: loaded.range,
  };
}
