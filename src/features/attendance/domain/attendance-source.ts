/**
 * V2-006.005 — Attendance report source selection (pure domain).
 *
 * Exactly one source is shown for a location at a time. Native and external records are
 * never merged or converted into one another; the UI must always label which source it is
 * displaying.
 *
 *   INTERNAL_THE_LINEUP → native records (this feature)
 *   EXTERNAL            → existing Neon-backed report, unchanged
 *   DISABLED            → nothing is shown and no clock operation is offered
 *   unconfigured (NULL) → existing Neon-backed report (legacy-compatible), labelled legacy;
 *                         internal attendance is NEVER assumed
 */

import type { DbAttendanceMode } from "./attendance-mode";

export type AttendanceReportSource =
  | "internal"
  | "external"
  | "disabled"
  | "unconfigured";

export interface ReportSourceDecision {
  readonly source: AttendanceReportSource;
  /** Badge text shown next to the report so the provenance is never ambiguous. */
  readonly label: string;
  readonly description: string;
  readonly readsNative: boolean;
  readonly readsExternal: boolean;
}

export function decideReportSource(
  rawMode: DbAttendanceMode | string | null | undefined,
): ReportSourceDecision {
  switch (rawMode) {
    case "internal_the_lineup":
      return {
        source: "internal",
        label: "TheLineup Internal",
        description: "Clock-ins recorded directly in The Lineup.",
        readsNative: true,
        readsExternal: false,
      };
    case "external":
      return {
        source: "external",
        label: "External",
        description: "Attendance imported from the external time clock.",
        readsNative: false,
        readsExternal: true,
      };
    case "disabled":
      return {
        source: "disabled",
        label: "Attendance off",
        description: "Attendance tracking is turned off for this location.",
        readsNative: false,
        readsExternal: false,
      };
    default:
      return {
        source: "unconfigured",
        label: "External (not configured)",
        description:
          "This location hasn't chosen an attendance source yet, so the existing external records are shown.",
        readsNative: false,
        readsExternal: true,
      };
  }
}
