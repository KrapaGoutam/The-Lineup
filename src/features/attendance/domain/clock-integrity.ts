/**
 * V2-006.003 — Clock Integrity Rules (pure domain, no I/O).
 *
 * Enforces strict state transitions, invariant validation,
 * and timezone/service_date assignment for native clock events.
 */

import { zonedWallTimeFromInstant } from "@/lib/timezone";
import type {
  AttendanceEventType,
  AttendanceSessionStatus,
} from "./attendance-session";

export interface ClockStateTransitionResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * Validates whether an employee can perform a clock event given their current session status.
 *
 * Permitted transitions:
 *   [none / completed / auto_clocked_out] -> clock_in    (allowed)
 *   active                                -> break_start (allowed)
 *   active                                -> clock_out   (allowed)
 *   on_break                              -> break_end   (allowed)
 *   on_break                              -> clock_out   (allowed — auto-closes break)
 *
 * Prohibited transitions:
 *   active / on_break                     -> clock_in    (denied: already open)
 *   none / completed                      -> clock_out   (denied: no open session)
 *   on_break                              -> break_start (denied: already on break)
 *   active / none / completed             -> break_end   (denied: not on break)
 */
export function validateClockTransition(
  eventType: AttendanceEventType,
  currentStatus?: AttendanceSessionStatus | null,
): ClockStateTransitionResult {
  const isOpen = currentStatus === "active" || currentStatus === "on_break";

  switch (eventType) {
    case "clock_in":
      if (isOpen) {
        return {
          allowed: false,
          reason: "Employee already has an open attendance session.",
        };
      }
      return { allowed: true };

    case "clock_out":
      if (!isOpen) {
        return {
          allowed: false,
          reason: "No active attendance session found to clock out.",
        };
      }
      return { allowed: true };

    case "break_start":
      if (!isOpen) {
        return {
          allowed: false,
          reason: "Cannot start a break without an active attendance session.",
        };
      }
      if (currentStatus === "on_break") {
        return {
          allowed: false,
          reason: "Session is already on break.",
        };
      }
      return { allowed: true };

    case "break_end":
      if (!isOpen || currentStatus !== "on_break") {
        return {
          allowed: false,
          reason: "Session is not currently on break.",
        };
      }
      return { allowed: true };

    case "manager_edit":
      return { allowed: true };

    default:
      return {
        allowed: false,
        reason: `Unsupported event type: ${String(eventType)}`,
      };
  }
}

/**
 * Computes the restaurant's operational business date (service_date)
 * for an instant in the location's specific IANA timezone.
 *
 * Example:
 *   2026-11-14 05:30 UTC for America/Chicago (CDT UTC-5 or CST UTC-6)
 *   -> 2026-11-13 (still Friday night local time before 6 AM)
 */
export function computeServiceDate(instant: Date, timeZone: string): string {
  return zonedWallTimeFromInstant(instant, timeZone).date;
}

/**
 * Validates timestamp ordering:
 * Ensures event time is not in the distant future (clock skew tolerance of 60 seconds).
 */
export function isTimestampSane(
  eventInstant: Date,
  nowInstant = new Date(),
  toleranceMs = 60_000,
): boolean {
  return eventInstant.getTime() <= nowInstant.getTime() + toleranceMs;
}
