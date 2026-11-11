/**
 * V2-006.008 — Manual Attendance Entry contract (pure domain, no I/O).
 *
 * Explicit-time native shift creation. Validates local time zone rules,
 * future punch limits, 48h duration, open shift local-date restrictions,
 * and multi-row batch integrity. The database function attendance_manual_entry
 * remains the final authority for all rules.
 */

import { z } from "zod";

import { zonedWallTimeFromInstant } from "@/lib/timezone";

export const MANUAL_ENTRY_REASON_MIN = 3;
export const MANUAL_ENTRY_REASON_MAX = 500;
export const MAX_BULK_ENTRIES = 50;
export const MAX_SHIFT_DURATION_HOURS = 48;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isoInstant = z.string().datetime({ offset: true });

export const manualEntryInputSchema = z
  .object({
    profileId: z.string().trim().regex(uuidRegex, "Select an employee."),
    serviceDate: z.iso.date("Enter a valid service date (YYYY-MM-DD)."),
    clockInAt: isoInstant,
    clockOutAt: isoInstant.nullable().optional(),
    reason: z
      .string()
      .trim()
      .min(
        MANUAL_ENTRY_REASON_MIN,
        `Enter a reason (at least ${MANUAL_ENTRY_REASON_MIN} characters).`,
      )
      .max(
        MANUAL_ENTRY_REASON_MAX,
        `Keep the reason under ${MANUAL_ENTRY_REASON_MAX} characters.`,
      ),
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Operation key is required.")
      .max(128, "Operation key cannot exceed 128 characters."),
  })
  .superRefine((val, ctx) => {
    const inTime = Date.parse(val.clockInAt);
    if (Number.isNaN(inTime)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid clock-in time." });
      return;
    }
    if (val.clockOutAt) {
      const outTime = Date.parse(val.clockOutAt);
      if (Number.isNaN(outTime)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid clock-out time.",
        });
        return;
      }
      if (outTime <= inTime) {
        ctx.addIssue({
          code: "custom",
          message: "Clock-out must follow clock-in.",
        });
      }
      if (outTime > inTime + MAX_SHIFT_DURATION_HOURS * 3600 * 1000) {
        ctx.addIssue({
          code: "custom",
          message: `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours.`,
        });
      }
    }
  });

export type ManualEntryInput = z.infer<typeof manualEntryInputSchema>;

export const bulkRowSchema = z
  .object({
    rowId: z.string().min(1, "Row ID is required."),
    profileId: z.string().trim().regex(uuidRegex, "Select an employee."),
    serviceDate: z.iso.date("Enter a valid service date (YYYY-MM-DD)."),
    clockInAt: isoInstant,
    clockOutAt: isoInstant.nullable().optional(),
    reason: z
      .string()
      .trim()
      .min(
        MANUAL_ENTRY_REASON_MIN,
        `Enter a reason (at least ${MANUAL_ENTRY_REASON_MIN} characters).`,
      )
      .max(
        MANUAL_ENTRY_REASON_MAX,
        `Keep the reason under ${MANUAL_ENTRY_REASON_MAX} characters.`,
      ),
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Operation key is required.")
      .max(128, "Operation key cannot exceed 128 characters."),
  })
  .superRefine((val, ctx) => {
    const inTime = Date.parse(val.clockInAt);
    if (Number.isNaN(inTime)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid clock-in time." });
      return;
    }
    if (val.clockOutAt) {
      const outTime = Date.parse(val.clockOutAt);
      if (Number.isNaN(outTime)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid clock-out time.",
        });
        return;
      }
      if (outTime <= inTime) {
        ctx.addIssue({
          code: "custom",
          message: "Clock-out must follow clock-in.",
        });
      }
      if (outTime > inTime + MAX_SHIFT_DURATION_HOURS * 3600 * 1000) {
        ctx.addIssue({
          code: "custom",
          message: `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours.`,
        });
      }
    }
  });

export type BulkRowInput = z.infer<typeof bulkRowSchema>;

export const bulkEntryInputSchema = z.object({
  entries: z
    .array(bulkRowSchema)
    .min(1, "Add at least one entry.")
    .max(MAX_BULK_ENTRIES, `Maximum ${MAX_BULK_ENTRIES} entries per batch.`),
});

export type BulkEntryInput = z.infer<typeof bulkEntryInputSchema>;

/**
 * Validates timezone-dependent constraints for a manual attendance punch:
 * 1. Clock-in local date must equal service date.
 * 2. Punches cannot be in the future, matching the database RPC.
 * 3. Open entries are permitted ONLY for today's local date.
 */
export function validateManualEntryLocalTime(params: {
  serviceDate: string;
  clockInAt: string;
  clockOutAt?: string | null;
  timeZone: string;
  nowMs?: number;
}): { ok: true } | { ok: false; error: string } {
  const { serviceDate, clockInAt, clockOutAt, timeZone } = params;
  const nowMs = params.nowMs ?? Date.now();

  const inDate = new Date(clockInAt);
  if (Number.isNaN(inDate.getTime())) {
    return { ok: false, error: "Enter a valid clock-in time." };
  }

  // 1. Service date must match local clock-in date in location's time zone.
  const localInWall = zonedWallTimeFromInstant(inDate, timeZone);
  if (localInWall.date !== serviceDate) {
    return {
      ok: false,
      error: `Service date (${serviceDate}) must match the clock-in date (${localInWall.date}) in ${timeZone}.`,
    };
  }

  // 2. The database rejects every future instant, including small clock skew.
  const maxAllowedMs = nowMs;
  if (inDate.getTime() > maxAllowedMs) {
    return { ok: false, error: "Clock-in time cannot be in the future." };
  }

  if (clockOutAt) {
    const outDate = new Date(clockOutAt);
    if (Number.isNaN(outDate.getTime())) {
      return { ok: false, error: "Enter a valid clock-out time." };
    }
    if (outDate.getTime() > maxAllowedMs) {
      return { ok: false, error: "Clock-out time cannot be in the future." };
    }
    if (outDate.getTime() <= inDate.getTime()) {
      return { ok: false, error: "Clock-out must follow clock-in." };
    }
    if (
      outDate.getTime() >
      inDate.getTime() + MAX_SHIFT_DURATION_HOURS * 3600 * 1000
    ) {
      return {
        ok: false,
        error: `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours.`,
      };
    }
  } else {
    // 3. Open punch check: allowed only on the current local date.
    const todayLocal = zonedWallTimeFromInstant(new Date(nowMs), timeZone).date;
    if (serviceDate !== todayLocal) {
      return {
        ok: false,
        error: `Only shifts for today (${todayLocal}) can be left open. Completed shifts require a clock-out time.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Calculates gross elapsed seconds between clock-in and clock-out, or null if open.
 */
export function calculateGrossElapsed(
  clockInAt: string,
  clockOutAt?: string | null,
): number | null {
  if (!clockOutAt) return null;
  const inMs = Date.parse(clockInAt);
  const outMs = Date.parse(clockOutAt);
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs < inMs) return null;
  return Math.floor((outMs - inMs) / 1000);
}

/**
 * Detects internal interval overlaps between entries for the same employee
 * within a batch. Returns a Map of rowId -> overlap warning message.
 */
export function detectBatchOverlaps(
  entries: Array<{
    rowId: string;
    profileId: string;
    clockInAt: string;
    clockOutAt?: string | null;
  }>,
): Map<string, string> {
  const errors = new Map<string, string>();
  const byEmployee = new Map<
    string,
    Array<{
      rowId: string;
      startMs: number;
      endMs: number;
    }>
  >();

  for (const entry of entries) {
    const startMs = Date.parse(entry.clockInAt);
    if (Number.isNaN(startMs)) continue;
    const endMs = entry.clockOutAt
      ? Date.parse(entry.clockOutAt)
      : Number.POSITIVE_INFINITY;
    if (Number.isNaN(endMs)) continue;

    const list = byEmployee.get(entry.profileId) ?? [];
    list.push({ rowId: entry.rowId, startMs, endMs });
    byEmployee.set(entry.profileId, list);
  }

  for (const list of byEmployee.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        // [start, end) overlap: startA < endB && startB < endA
        if (a.startMs < b.endMs && b.startMs < a.endMs) {
          errors.set(
            a.rowId,
            "This entry overlaps another entry for the same employee in this batch.",
          );
          errors.set(
            b.rowId,
            "This entry overlaps another entry for the same employee in this batch.",
          );
        }
      }
    }
  }

  return errors;
}
