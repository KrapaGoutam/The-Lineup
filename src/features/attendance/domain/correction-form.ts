/**
 * V2-006.004 — Correction form helpers (pure).
 *
 * Managers type location-local wall-clock times ("2026-11-09T09:05"). The database stores
 * absolute instants. These helpers convert between the two with the location's own time zone
 * (never the browser's) and decide which fields the manager actually changed, so untouched
 * values keep their original seconds and are never re-sent.
 */

import {
  zonedWallTimeFromInstant,
  zonedWallTimeToInstant,
} from "@/lib/timezone";

import type {
  CorrectionBreakState,
  CorrectionProposal,
  CorrectionSessionState,
} from "./attendance-correction";
import type { AttendanceBreakPayClassification } from "./attendance-session";

const LOCAL_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** Instant → "YYYY-MM-DDTHH:mm" in the location's zone, or "" when absent. */
export function instantToLocalInput(
  iso: string | null,
  timeZone: string,
): string {
  if (!iso) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const { date, time } = zonedWallTimeFromInstant(instant, timeZone);
  return `${date}T${time}`;
}

/**
 * "YYYY-MM-DDTHH:mm" in the location's zone → ISO instant, or null when the text is not a
 * complete local date-time. A wall time that occurs twice (fall back) resolves to its first
 * occurrence; one that never happened (spring forward) resolves to the instant just after
 * the gap — see `zonedWallTimeToInstant`.
 */
export function localInputToInstant(
  value: string,
  timeZone: string,
): string | null {
  const match = LOCAL_INPUT.exec(value.trim());
  if (!match) return null;
  const instant = zonedWallTimeToInstant({
    date: match[1],
    time: match[2],
    timeZone,
  });
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export interface BreakFormValue {
  readonly id: number;
  readonly start: string; // local input
  readonly end: string; // local input ("" = still open)
  readonly payClassification: AttendanceBreakPayClassification;
}

export interface CorrectionFormValue {
  readonly clockIn: string;
  readonly clockOut: string;
  readonly breaks: readonly BreakFormValue[];
}

/** The form's starting values for a session. */
export function initialFormValue(
  session: CorrectionSessionState,
  timeZone: string,
): CorrectionFormValue {
  return {
    clockIn: instantToLocalInput(session.clockInAt, timeZone),
    clockOut: instantToLocalInput(session.clockOutAt, timeZone),
    breaks: session.breaks.map((b) => ({
      id: b.id,
      start: instantToLocalInput(b.startTime, timeZone),
      end: instantToLocalInput(b.endTime, timeZone),
      payClassification: b.payClassification,
    })),
  };
}

export type FormToProposalResult =
  | { readonly ok: true; readonly proposal: CorrectionProposal }
  | { readonly ok: false; readonly error: string };

/**
 * Builds the proposal from ONLY the fields whose local text changed. A field the manager
 * cleared or half-typed is an error, not a silent "no change".
 */
export function formToProposal(
  initial: CorrectionFormValue,
  current: CorrectionFormValue,
  timeZone: string,
): FormToProposalResult {
  const proposal: {
    clockInAt?: string;
    clockOutAt?: string;
    breaks?: Array<{
      id: number;
      startTime?: string;
      endTime?: string;
      payClassification?: AttendanceBreakPayClassification;
    }>;
  } = {};

  if (current.clockIn !== initial.clockIn) {
    const iso = localInputToInstant(current.clockIn, timeZone);
    if (!iso) return { ok: false, error: "Enter a valid clock-in time." };
    proposal.clockInAt = iso;
  }
  if (current.clockOut !== initial.clockOut) {
    const iso = localInputToInstant(current.clockOut, timeZone);
    if (!iso) {
      return {
        ok: false,
        error: initial.clockOut
          ? "Enter a valid clock-out time."
          : "Enter a valid clock-out time, or leave it blank to keep the shift open.",
      };
    }
    proposal.clockOutAt = iso;
  }

  const breaks: NonNullable<typeof proposal.breaks> = [];
  for (const b of current.breaks) {
    const before = initial.breaks.find((x) => x.id === b.id);
    if (!before) continue;
    const edit: {
      id: number;
      startTime?: string;
      endTime?: string;
      payClassification?: AttendanceBreakPayClassification;
    } = { id: b.id };
    if (b.start !== before.start) {
      const iso = localInputToInstant(b.start, timeZone);
      if (!iso) return { ok: false, error: "Enter a valid break start time." };
      edit.startTime = iso;
    }
    if (b.end !== before.end) {
      const iso = localInputToInstant(b.end, timeZone);
      if (!iso) {
        return {
          ok: false,
          error: before.end
            ? "Enter a valid break end time."
            : "Enter a valid break end time, or leave it blank to keep the break open.",
        };
      }
      edit.endTime = iso;
    }
    if (b.payClassification !== before.payClassification) {
      edit.payClassification = b.payClassification;
    }
    if (
      edit.startTime !== undefined ||
      edit.endTime !== undefined ||
      edit.payClassification !== undefined
    ) {
      breaks.push(edit);
    }
  }
  if (breaks.length > 0) proposal.breaks = breaks;

  return { ok: true, proposal };
}

export function hasProposalChanges(proposal: CorrectionProposal): boolean {
  return (
    proposal.void === true ||
    proposal.clockInAt !== undefined ||
    proposal.clockOutAt !== undefined ||
    (proposal.breaks?.length ?? 0) > 0
  );
}

/** Converts the server's break rows into the preview model. */
export function toCorrectionBreakStates(
  breaks: ReadonlyArray<{
    id: number;
    startTime: string;
    endTime: string | null;
    payClassification: AttendanceBreakPayClassification;
  }>,
): CorrectionBreakState[] {
  return breaks.map((b) => ({
    id: b.id,
    startTime: b.startTime,
    endTime: b.endTime,
    payClassification: b.payClassification,
  }));
}
