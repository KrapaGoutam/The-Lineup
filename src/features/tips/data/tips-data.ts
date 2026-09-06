import "server-only";

import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import type { TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

export type TipsContext = {
  locationId: string;
  timeZone: string;
  serviceDate: string;
  tipPoolId: number | null;
  status: TipsDayStatus;
  team: TeamMember[];
  intervals: TipIntervalInput[];
  auditLog: TipsAuditEntry[];
};

export async function getTipsContext(
  organizationId: string,
): Promise<TipsContext | null> {
  const supabase = await createClient();
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const serviceDate = zonedWallTimeFromInstant(
    new Date(),
    location.time_zone,
  ).date;

  const [team, { data: tipPool }] = await Promise.all([
    getOrganizationRoster(organizationId),
    supabase
      .from("tip_pools")
      .select("id, status")
      .eq("location_id", location.id)
      .eq("service_date", serviceDate)
      .maybeSingle(),
  ]);

  if (!tipPool) {
    // No pool started for today yet -- an empty, all-draft context.
    // Creating the pool happens lazily on the first interval add
    // (addTipIntervalAction), same as schedule periods.
    return {
      locationId: location.id,
      timeZone: location.time_zone,
      serviceDate,
      tipPoolId: null,
      status: "estimating",
      team,
      intervals: [],
      auditLog: [],
    };
  }

  const [{ data: intervalRows }, { data: auditRows }] = await Promise.all([
    supabase
      .from("tip_intervals")
      .select(
        "id, starts_at, ends_at, amount_cents, tip_interval_participants(profile_id)",
      )
      .eq("tip_pool_id", tipPool.id),
    supabase
      .from("audit_events")
      .select("action, reason, created_at, actor_profile_id")
      .eq("entity_type", "tip_pool")
      .eq("entity_id", String(tipPool.id))
      .order("created_at", { ascending: true }),
  ]);

  const nameByProfileId = new Map(
    team.map((member) => [member.id, member.name]),
  );

  const intervals: TipIntervalInput[] = (intervalRows ?? []).map((row) => ({
    id: String(row.id),
    start: zonedWallTimeFromInstant(new Date(row.starts_at), location.time_zone)
      .time,
    end: zonedWallTimeFromInstant(new Date(row.ends_at), location.time_zone)
      .time,
    amountCents: row.amount_cents,
    participantIds: (row.tip_interval_participants ?? []).map(
      (p) => p.profile_id,
    ),
  }));

  const auditLog: TipsAuditEntry[] = (auditRows ?? [])
    .filter(
      (row): row is typeof row & { action: "finalized" | "reopened" } =>
        row.action === "finalized" || row.action === "reopened",
    )
    .map((row) => ({
      action: row.action,
      actorName: nameByProfileId.get(row.actor_profile_id ?? "") ?? "Unknown",
      reason: row.reason ?? undefined,
      at: row.created_at,
    }));

  return {
    locationId: location.id,
    timeZone: location.time_zone,
    serviceDate,
    tipPoolId: tipPool.id,
    status: tipPool.status === "finalized" ? "finalized" : "estimating",
    team,
    intervals,
    auditLog,
  };
}
