/**
 * V2-006.001 — Attendance Mode Configuration Contract (pure domain, no I/O).
 *
 * Defines the canonical per-location attendance mode:
 *   EXTERNAL            — Uses external Neon attendance system (legacy).
 *   INTERNAL_THE_LINEUP — Uses native Lineup attendance (attendance_sessions, attendance_events).
 *   DISABLED            — Attendance tracking is unavailable for this location.
 *
 * Missing / Unconfigured mode:
 *   When a location has attendance_mode = null, it is UNCONFIGURED.
 *   - Internal attendance operations fail closed (never permit internal clocking).
 *   - Legacy operations continue to treat unconfigured locations as external-compatible
 *     until the owner-approved backfill phase.
 */

import { z } from "zod";
import type { Database } from "@/types/database.generated";

export type DbAttendanceMode = Database["public"]["Enums"]["attendance_mode"];

export const ATTENDANCE_MODES = [
  "EXTERNAL",
  "INTERNAL_THE_LINEUP",
  "DISABLED",
] as const;

export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const attendanceModeSchema = z.enum(ATTENDANCE_MODES);

export const dbAttendanceModeSchema = z.enum([
  "external",
  "internal_the_lineup",
  "disabled",
]);

/** Maps internal canonical uppercase mode to database lowercase enum. */
export function toDbAttendanceMode(mode: AttendanceMode): DbAttendanceMode {
  switch (mode) {
    case "EXTERNAL":
      return "external";
    case "INTERNAL_THE_LINEUP":
      return "internal_the_lineup";
    case "DISABLED":
      return "disabled";
  }
}

/** Maps database lowercase enum to canonical uppercase mode. Returns null if invalid or unset. */
export function fromDbAttendanceMode(
  mode: DbAttendanceMode | string | null | undefined,
): AttendanceMode | null {
  if (!mode) return null;
  const normalized = mode.trim().toLowerCase();
  switch (normalized) {
    case "external":
      return "EXTERNAL";
    case "internal_the_lineup":
      return "INTERNAL_THE_LINEUP";
    case "disabled":
      return "DISABLED";
    default:
      return null;
  }
}

export interface ResolvedAttendanceMode {
  readonly mode: AttendanceMode;
  readonly isConfigured: boolean;
  readonly canClockInternal: boolean;
  readonly canReadExternal: boolean;
  readonly isTrackingDisabled: boolean;
}

/**
 * Resolves effective attendance mode for a location.
 *
 * Safest compatibility behavior:
 * - If unconfigured (null/undefined):
 *   `isConfigured: false`
 *   `canClockInternal: false` (strictly fails closed)
 *   `canReadExternal: true` (preserves legacy reads until explicit migration)
 *   `mode: "EXTERNAL"` (compatibility presentation)
 */
export function resolveAttendanceMode(
  rawMode: DbAttendanceMode | string | null | undefined,
): ResolvedAttendanceMode {
  const parsed = fromDbAttendanceMode(rawMode);
  if (!parsed) {
    return {
      mode: "EXTERNAL",
      isConfigured: false,
      canClockInternal: false,
      canReadExternal: true,
      isTrackingDisabled: false,
    };
  }

  return {
    mode: parsed,
    isConfigured: true,
    canClockInternal: parsed === "INTERNAL_THE_LINEUP",
    canReadExternal: parsed === "EXTERNAL",
    isTrackingDisabled: parsed === "DISABLED",
  };
}

/** User-friendly label for UI presentation. */
export function getAttendanceModeLabel(mode: AttendanceMode): string {
  switch (mode) {
    case "EXTERNAL":
      return "External (Neon)";
    case "INTERNAL_THE_LINEUP":
      return "Internal (The Lineup Native)";
    case "DISABLED":
      return "Disabled";
  }
}
