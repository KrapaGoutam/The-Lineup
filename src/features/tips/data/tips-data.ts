import "server-only";

import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import {
  buildTipsReadModel,
  classifyTipsReadError,
  type TipsUnavailableReason,
} from "@/features/tips/domain/tips-read-model";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { locationForLoader } from "@/features/locations/data/primary-location";
import type { TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

export type TipsContext = {
  locationId: string;
  timeZone: string;
  serviceDate: string;
  tipPoolId: number | null;
  status: TipsDayStatus;
  /** Name directory (current workforce + historical-only people). */
  team: TeamMember[];
  /** Profiles that may be offered for a NEW interval (current workforce). */
  selectableIds: string[];
  intervals: TipIntervalInput[];
  auditLog: TipsAuditEntry[];
  /**
   * Set when the location-authorized Tips RPCs could not be read (backend not
   * migrated, caller denied, unexpected response). The context then carries
   * no people and no money -- the page shows a notice, never a fallback.
   */
  unavailable?: TipsUnavailableReason;
};

/**
 * V2-005.003. The ONLY read path for the Tips page is the pair of
 * location-authorized SECURITY DEFINER RPCs bound to the server-verified
 * active location:
 *
 *  - `tips_location_roster`: names for the location (current workforce flagged
 *    `eligible`, historical actors kept for display, staff see only themselves)
 *  - `tips_get_day_data`: the day's pool, intervals and audit log, with a
 *    manager/staff split enforced in the database
 *
 * There is deliberately NO fallback to an organization-wide roster or to
 * direct table reads: if either RPC is missing (old schema), denies the
 * caller, or returns an unexpected shape, the view fails closed.
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
    intervals: [],
    auditLog: [],
    unavailable,
  });

  const [rosterResult, dayResult] = await Promise.all([
    supabase.rpc("tips_location_roster", {
      p_organization_id: organizationId,
      p_location_id: location.id,
    }),
    supabase.rpc("tips_get_day_data", {
      p_organization_id: organizationId,
      p_location_id: location.id,
      p_service_date: serviceDate,
    }),
  ]);

  if (rosterResult.error) {
    return failClosed(classifyTipsReadError(rosterResult.error));
  }
  if (dayResult.error) {
    return failClosed(classifyTipsReadError(dayResult.error));
  }

  const built = buildTipsReadModel({
    roster: rosterResult.data,
    dayData: dayResult.data,
    timeZone: location.time_zone,
  });
  if (!built.ok) return failClosed(built.reason);

  return {
    locationId: location.id,
    timeZone: location.time_zone,
    serviceDate,
    ...built.model,
  };
}
