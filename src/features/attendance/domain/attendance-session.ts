/**
 * V2-006.002 — Internal Attendance Session & Event Domain Models (pure domain).
 *
 * Defines the core types, status transitions, duration computations,
 * and presentation formats for native Lineup attendance.
 */

import type { Database } from "@/types/database.generated";

export type AttendanceSessionStatus =
  Database["public"]["Enums"]["attendance_session_status"];
export type AttendanceEventType =
  Database["public"]["Enums"]["attendance_event_type"];
export type AttendanceEventSource =
  Database["public"]["Enums"]["attendance_event_source"];

export interface AttendanceBreakModel {
  readonly id: number;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly startTime: string; // ISO UTC instant
  readonly endTime: string | null; // ISO UTC instant or null if open
  readonly durationSeconds: number | null;
}

export interface AttendanceEventModel {
  readonly id: number;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly eventType: AttendanceEventType;
  readonly eventTime: string; // ISO UTC instant
  readonly serviceDate: string; // YYYY-MM-DD in location timezone
  readonly source: AttendanceEventSource;
  readonly idempotencyKey: string | null;
  readonly actorProfileId: string;
  readonly isManagerCorrection: boolean;
  readonly reversesEventId: number | null;
  readonly correctionReason: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface AttendanceSessionModel {
  readonly id: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly serviceDate: string; // YYYY-MM-DD
  readonly status: AttendanceSessionStatus;
  readonly clockInAt: string; // ISO UTC instant
  readonly clockOutAt: string | null; // ISO UTC instant
  readonly totalBreakSeconds: number;
  readonly totalWorkedSeconds: number | null;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Computes elapsed duration in seconds between two ISO timestamps,
 * subtracting any break seconds.
 *
 * Guaranteed to operate on real millisecond epochs — never string subtraction.
 */
export function computeSessionDurationSeconds(
  clockInIso: string | Date,
  clockOutIso: string | Date,
  totalBreakSeconds = 0,
): number {
  const clockInMs =
    clockInIso instanceof Date
      ? clockInIso.getTime()
      : new Date(clockInIso).getTime();
  const clockOutMs =
    clockOutIso instanceof Date
      ? clockOutIso.getTime()
      : new Date(clockOutIso).getTime();

  if (
    Number.isNaN(clockInMs) ||
    Number.isNaN(clockOutMs) ||
    clockOutMs < clockInMs
  ) {
    return 0;
  }

  const elapsedSeconds = Math.floor((clockOutMs - clockInMs) / 1000);
  return Math.max(0, elapsedSeconds - Math.max(0, totalBreakSeconds));
}

/**
 * Formats seconds into decimal hours with 2 decimal places (e.g. 7.50).
 */
export function formatWorkedHours(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "0.00";
  const hours = seconds / 3600;
  return hours.toFixed(2);
}

/**
 * Formats seconds into human-readable "Xh Ym" (e.g. "7h 30m").
 */
export function formatWorkedDuration(
  seconds: number | null | undefined,
): string {
  if (seconds == null || seconds <= 0) return "0m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
