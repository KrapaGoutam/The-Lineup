/**
 * Opening reminder contract (Tasks V1.1 T-4, PLAN D-4).
 *
 * The database decides whether a reminder exists (public.task_opening_reminders_sweep
 * -> private.tasks_opening_reminders_run) and stores it as a `task_notifications`
 * row of type `opening_reminder` with a machine-readable `payload`. This module is
 * the typed shape of that payload for the UI that will present it (T-5); it never
 * decides timing.
 */

export const OPENING_REMINDER_STAGES = ["open", "plus_15", "plus_30"] as const;
export type OpeningReminderStage = (typeof OPENING_REMINDER_STAGES)[number];

/** Minutes after the location's opening instant at which each stage is due. */
export const OPENING_REMINDER_OFFSET_MINUTES: Record<
  OpeningReminderStage,
  number
> = { open: 0, plus_15: 15, plus_30: 30 };

/**
 * What a reminder says, and nothing about anyone else's work: the stage, the
 * service date and location it belongs to, the absolute instant the stage fell
 * due, and the recipient's own counts (at that instant, and now).
 */
export type OpeningReminder = {
  stage: OpeningReminderStage;
  /** Location-local operational date (YYYY-MM-DD). */
  serviceDate: string;
  locationId: string;
  /** The absolute instant the stage fell due (UTC, ISO 8601). */
  stageAt: string;
  /** Incomplete required Opening items in the recipient's scope at `stageAt`. */
  incompleteCount: number;
  /** Incomplete required Opening items in the recipient's scope when stored. */
  incompleteNow: number;
};

/** The per-recipient idempotency key; mirrors the SQL gate in private.tasks_notify. */
export function openingReminderDedupeKey(
  locationId: string,
  serviceDate: string,
  stage: OpeningReminderStage,
): string {
  return `opening_reminder:${locationId}:${serviceDate}:${stage}`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Parses a stored payload; anything malformed is not a reminder (null). */
export function parseOpeningReminder(raw: unknown): OpeningReminder | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const { stage, service_date, location_id, stage_at } = value;
  if (
    typeof stage !== "string" ||
    !(OPENING_REMINDER_STAGES as readonly string[]).includes(stage) ||
    typeof service_date !== "string" ||
    !DATE_PATTERN.test(service_date) ||
    typeof location_id !== "string" ||
    location_id.length === 0 ||
    typeof stage_at !== "string" ||
    Number.isNaN(Date.parse(stage_at)) ||
    !isCount(value.incomplete_count) ||
    !isCount(value.incomplete_now)
  ) {
    return null;
  }
  return {
    stage: stage as OpeningReminderStage,
    serviceDate: service_date,
    locationId: location_id,
    stageAt: stage_at,
    incompleteCount: value.incomplete_count,
    incompleteNow: value.incomplete_now,
  };
}
