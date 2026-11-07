import { z } from "zod";

import {
  designationForRoles,
  designationToRole,
} from "@/features/auth/domain/passcode";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import type { TeamMember } from "@/lib/demo-data";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * V2-005.003 -- pure read model for the Tips page.
 *
 * Everything the Tips page shows comes from two location-authorized,
 * SECURITY DEFINER RPCs (`tips_location_roster`, `tips_get_day_data`). When
 * either one is missing (old schema, e.g. a Preview deployed before the
 * migration), denies the caller, or returns something unexpected, the Tips
 * view FAILS CLOSED: it carries no people and no money. It never falls back
 * to an organization-wide roster or to direct table reads.
 */

export type TipsUnavailableReason =
  | "backend_not_ready"
  | "access_denied"
  | "unavailable";

export const TIPS_UNAVAILABLE_MESSAGES: Record<TipsUnavailableReason, string> =
  {
    backend_not_ready:
      "Tips isn't available yet for this environment. The latest database update hasn't been applied.",
    access_denied: "You don't have access to Tips for this location.",
    unavailable: "Tips couldn't be loaded right now. Please try again.",
  };

type PostgrestLikeError = { code?: string | null; message?: string | null };

/**
 * Maps an RPC error to a fail-closed reason. A missing function (PostgREST
 * schema-cache miss PGRST202, or Postgres undefined_function 42883) means the
 * backend is not migrated; 42501 is the RPCs' own authorization denial.
 */
export function classifyTipsReadError(
  error: PostgrestLikeError,
): TipsUnavailableReason {
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "42883") return "backend_not_ready";
  if (code === "42501") return "access_denied";
  return "unavailable";
}

const rosterRowSchema = z.object({
  profile_id: z.string().min(1),
  display_name: z.string(),
  roles: z.array(z.string()).nullable(),
  active: z.boolean(),
  eligible: z.boolean(),
});
export const tipsRosterSchema = z.array(rosterRowSchema);

const dayDataSchema = z.object({
  tip_pool_id: z.number().int().nullable(),
  status: z.enum(["estimating", "finalized"]),
  intervals: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      starts_at: z.string(),
      ends_at: z.string(),
      amount_cents: z.number().int(),
      participant_ids: z.array(z.string()),
    }),
  ),
  audit_log: z.array(
    z.object({
      action: z.string(),
      actor_profile_id: z.string().nullable(),
      reason: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});

const COLOR_SLOTS = ["one", "two", "three", "four", "five", "six", "seven"];

export type TipsReadModel = {
  tipPoolId: number | null;
  status: TipsDayStatus;
  /** Name directory: current workforce AND historical-only people. */
  team: TeamMember[];
  /** Only these people may be offered for a NEW interval. */
  selectableIds: string[];
  intervals: TipIntervalInput[];
  auditLog: TipsAuditEntry[];
};

export type TipsReadResult =
  | { ok: true; model: TipsReadModel }
  | { ok: false; reason: TipsUnavailableReason };

export function buildTipsReadModel(input: {
  roster: unknown;
  dayData: unknown;
  timeZone: string;
}): TipsReadResult {
  const roster = tipsRosterSchema.safeParse(input.roster);
  const day = dayDataSchema.safeParse(input.dayData);
  if (!roster.success || !day.success) {
    return { ok: false, reason: "unavailable" };
  }

  const team: TeamMember[] = roster.data.map((row, index) => {
    const designation = designationForRoles(row.roles ?? []);
    return {
      id: row.profile_id,
      name: row.display_name,
      shortName: row.display_name.split(" ")[0] || row.display_name,
      role: designationToRole(designation),
      designation,
      active: row.active,
      color: `var(--server-${COLOR_SLOTS[index % COLOR_SLOTS.length]})`,
    };
  });
  const selectableIds = roster.data
    .filter((row) => row.eligible && row.active)
    .map((row) => row.profile_id);

  const nameById = new Map(team.map((member) => [member.id, member.name]));

  const intervals: TipIntervalInput[] = day.data.intervals.map((row) => ({
    id: String(row.id),
    start: zonedWallTimeFromInstant(new Date(row.starts_at), input.timeZone)
      .time,
    end: zonedWallTimeFromInstant(new Date(row.ends_at), input.timeZone).time,
    amountCents: row.amount_cents,
    participantIds: row.participant_ids,
  }));

  const auditLog: TipsAuditEntry[] = day.data.audit_log
    .filter(
      (row): row is typeof row & { action: "finalized" | "reopened" } =>
        row.action === "finalized" || row.action === "reopened",
    )
    .map((row) => ({
      action: row.action,
      actorName: nameById.get(row.actor_profile_id ?? "") ?? "Unknown",
      reason: row.reason ?? undefined,
      at: row.created_at,
    }));

  return {
    ok: true,
    model: {
      tipPoolId: day.data.tip_pool_id,
      status: day.data.status,
      team,
      selectableIds,
      intervals,
      auditLog,
    },
  };
}
