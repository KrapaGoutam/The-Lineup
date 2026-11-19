import { describeInterval } from "@/features/tips/domain/interval-times";
import type { TipsRevision } from "@/features/tips/domain/tips-range-model";

type IntervalSnapshot = {
  starts_at?: string;
  ends_at?: string;
  cash_cents?: number;
  card_cents?: number;
  amount_cents?: number;
  participant_ids?: string[];
  void_reason?: string | null;
};
type RevisionState = {
  interval?: IntervalSnapshot | null;
  distribution?: Array<{ profile_id: string; amount_cents: number }>;
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (cents: number) => usd.format(cents / 100);

function asState(value: unknown): RevisionState {
  return value && typeof value === "object" ? (value as RevisionState) : {};
}

function range(
  snapshot: IntervalSnapshot | null | undefined,
  timeZone: string,
) {
  if (!snapshot?.starts_at || !snapshot.ends_at) return "an interval";
  const d = describeInterval(snapshot.starts_at, snapshot.ends_at, timeZone);
  return `${d.start}–${d.end}${d.endsNextDay ? " (+1)" : ""}`;
}

export const REVISION_TITLES: Record<string, string> = {
  interval_created: "Added",
  interval_updated: "Updated",
  interval_voided: "Voided",
  pool_recalculated: "Recalculated",
  legacy_finalized: "Finalized (earlier workflow)",
  legacy_reopened: "Reopened for correction",
  direct_interval_insert: "Added (direct database change)",
  direct_interval_update: "Changed (direct database change)",
  direct_interval_delete: "Deleted (direct database change)",
  direct_participant_change: "Participants changed (direct database change)",
  direct_pool_delete: "Day deleted (direct database change)",
};

/**
 * One plain-language line describing what a revision changed, from its stored
 * before/after snapshots. Used by the "Change history" panel and the printed report.
 */
export function summarizeRevision(
  revision: TipsRevision,
  timeZone: string,
  nameOf: (profileId: string) => string,
): string {
  const before = asState(revision.before);
  const after = asState(revision.after);
  const a = after.interval;
  const b = before.interval;

  switch (revision.action) {
    case "interval_created":
      return `Added ${range(a, timeZone)}: cash ${money(a?.cash_cents ?? 0)}, card ${money(a?.card_cents ?? 0)}.`;
    case "interval_voided":
      return `Voided ${range(b ?? a, timeZone)} (${money(b?.amount_cents ?? 0)}).`;
    case "interval_updated": {
      const parts: string[] = [];
      if (b?.starts_at !== a?.starts_at || b?.ends_at !== a?.ends_at) {
        parts.push(`time ${range(b, timeZone)} → ${range(a, timeZone)}`);
      }
      if (b?.cash_cents !== a?.cash_cents) {
        parts.push(
          `cash ${money(b?.cash_cents ?? 0)} → ${money(a?.cash_cents ?? 0)}`,
        );
      }
      if (b?.card_cents !== a?.card_cents) {
        parts.push(
          `card ${money(b?.card_cents ?? 0)} → ${money(a?.card_cents ?? 0)}`,
        );
      }
      const was = new Set(b?.participant_ids ?? []);
      const now = new Set(a?.participant_ids ?? []);
      const added = [...now].filter((id) => !was.has(id)).map(nameOf);
      const removed = [...was].filter((id) => !now.has(id)).map(nameOf);
      if (added.length) parts.push(`added ${added.join(", ")}`);
      if (removed.length) parts.push(`removed ${removed.join(", ")}`);
      return `Updated ${range(a, timeZone)}${parts.length ? `: ${parts.join("; ")}` : ""}.`;
    }
    case "legacy_finalized":
      return "The day was finalized and locked by the earlier workflow.";
    case "legacy_reopened":
      return "The locked day was unlocked for a correction.";
    case "pool_recalculated":
      return "Allocations were re-derived from the saved intervals.";
    default:
      return "Changed directly in the database (a maintenance or service-role write, outside the app).";
  }
}
