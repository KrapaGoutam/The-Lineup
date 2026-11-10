/**
 * V2-006.004 — Manager correction contract (pure domain, no I/O).
 *
 * The database function `attendance_correct_session` is the authority for every rule
 * below. This module mirrors them so the UI can explain a problem BEFORE a round trip and
 * show the manager exactly what will change. A client-side pass never replaces the
 * server-side check.
 */

import { z } from "zod";

import { summarizeSessionBreakPay } from "./attendance-session";
import type {
  AttendanceBreakPayClassification,
  AttendanceSessionStatus,
} from "./attendance-session";

export const CORRECTION_REASON_MIN = 3;
export const CORRECTION_REASON_MAX = 500;
/** Matches the database's tolerance for client/server clock skew. */
export const FUTURE_TOLERANCE_MS = 60_000;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isoInstant = z.string().datetime({ offset: true });

export const breakCorrectionSchema = z
  .object({
    id: z.number().int().positive(),
    startTime: isoInstant.optional(),
    endTime: isoInstant.optional(),
    payClassification: z.enum(["unclassified", "paid", "unpaid"]).optional(),
  })
  .refine(
    (b) =>
      b.startTime !== undefined ||
      b.endTime !== undefined ||
      b.payClassification !== undefined,
    "A break correction must change something.",
  );

export const correctionInputSchema = z
  .object({
    sessionId: z.string().trim().regex(uuidRegex, "Invalid session ID"),
    expectedVersion: z.number().int().min(1),
    reason: z
      .string()
      .trim()
      .min(CORRECTION_REASON_MIN, "Enter a reason (at least 3 characters).")
      .max(CORRECTION_REASON_MAX, "Keep the reason under 500 characters."),
    clockInAt: isoInstant.optional(),
    clockOutAt: isoInstant.optional(),
    breaks: z.array(breakCorrectionSchema).max(50).default([]),
    void: z.boolean().default(false),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    const hasEdit =
      value.clockInAt !== undefined ||
      value.clockOutAt !== undefined ||
      value.breaks.length > 0;
    if (value.void && hasEdit) {
      ctx.addIssue({
        code: "custom",
        message: "Voiding a session cannot be combined with other changes.",
      });
    }
    if (!value.void && !hasEdit) {
      ctx.addIssue({ code: "custom", message: "No change was requested." });
    }
    const ids = value.breaks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each break can be corrected only once per request.",
      });
    }
  });

export type CorrectionInput = z.input<typeof correctionInputSchema>;
export type ParsedCorrectionInput = z.output<typeof correctionInputSchema>;

export interface CorrectionBreakState {
  readonly id: number;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly payClassification: AttendanceBreakPayClassification;
}

export interface CorrectionSessionState {
  readonly status: AttendanceSessionStatus;
  readonly clockInAt: string;
  readonly clockOutAt: string | null;
  readonly breaks: readonly CorrectionBreakState[];
}

export interface CorrectionProposal {
  readonly clockInAt?: string;
  readonly clockOutAt?: string;
  readonly breaks?: ReadonlyArray<{
    readonly id: number;
    readonly startTime?: string;
    readonly endTime?: string;
    readonly payClassification?: AttendanceBreakPayClassification;
  }>;
  readonly void?: boolean;
}

export interface CorrectionChange {
  readonly field: "clock_in" | "clock_out" | "break" | "void";
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly breakId?: number;
}

export interface CorrectionPreview {
  readonly changes: readonly CorrectionChange[];
  readonly errors: readonly string[];
  readonly projected: {
    readonly status: AttendanceSessionStatus;
    readonly grossElapsedSeconds: number | null;
    readonly totalBreakSeconds: number;
    readonly netPayableSeconds: number | null;
    readonly breakPolicyResolved: boolean;
  };
}

const ms = (iso: string) => new Date(iso).getTime();
const secs = (from: string, to: string) =>
  Math.max(0, Math.floor((ms(to) - ms(from)) / 1000));

/**
 * Applies a proposal to a session snapshot WITHOUT mutating anything and returns the list
 * of changes, every violated rule, and the resulting totals. The rules are the database's:
 * non-negative intervals, no future times, breaks inside the shift and not overlapping,
 * finished breaks cannot be reopened, voided sessions cannot change.
 */
export function buildCorrectionPreview(
  original: CorrectionSessionState,
  proposal: CorrectionProposal,
  nowMs: number = Date.now(),
): CorrectionPreview {
  const errors: string[] = [];
  const changes: CorrectionChange[] = [];

  if (original.status === "voided") {
    errors.push("A voided session cannot be corrected.");
  }

  if (proposal.void) {
    changes.push({
      field: "void",
      label: "Void this session",
      before: original.status,
      after: "voided",
    });
    return {
      changes,
      errors,
      projected: {
        status: "voided",
        grossElapsedSeconds: null,
        totalBreakSeconds: 0,
        netPayableSeconds: null,
        breakPolicyResolved: false,
      },
    };
  }

  const newIn = proposal.clockInAt ?? original.clockInAt;
  const newOut = proposal.clockOutAt ?? original.clockOutAt;

  if (proposal.clockInAt && proposal.clockInAt !== original.clockInAt) {
    changes.push({
      field: "clock_in",
      label: "Clock-in",
      before: original.clockInAt,
      after: proposal.clockInAt,
    });
  }
  if (proposal.clockOutAt && proposal.clockOutAt !== original.clockOutAt) {
    changes.push({
      field: "clock_out",
      label: original.clockOutAt ? "Clock-out" : "Clock-out (was missing)",
      before: original.clockOutAt,
      after: proposal.clockOutAt,
    });
  }

  if (Number.isNaN(ms(newIn)) || (newOut && Number.isNaN(ms(newOut)))) {
    errors.push("Enter valid times.");
  } else {
    if (newOut && ms(newOut) < ms(newIn)) {
      errors.push("Clock-out cannot be before clock-in.");
    }
    if (
      ms(newIn) > nowMs + FUTURE_TOLERANCE_MS ||
      (newOut && ms(newOut) > nowMs + FUTURE_TOLERANCE_MS)
    ) {
      errors.push("Corrected times cannot be in the future.");
    }
  }

  const proposedById = new Map((proposal.breaks ?? []).map((b) => [b.id, b]));
  for (const id of proposedById.keys()) {
    if (!original.breaks.some((b) => b.id === id)) {
      errors.push("A break in this request does not belong to this session.");
    }
  }

  const finalBreaks = original.breaks.map((b) => {
    const p = proposedById.get(b.id);
    if (!p) return b;
    const next: CorrectionBreakState = {
      id: b.id,
      startTime: p.startTime ?? b.startTime,
      endTime: p.endTime ?? b.endTime,
      payClassification: p.payClassification ?? b.payClassification,
    };
    if (
      next.startTime !== b.startTime ||
      next.endTime !== b.endTime ||
      next.payClassification !== b.payClassification
    ) {
      const parts: string[] = [];
      if (next.startTime !== b.startTime) parts.push("start");
      if (next.endTime !== b.endTime) parts.push("end");
      if (next.payClassification !== b.payClassification) parts.push("pay");
      changes.push({
        field: "break",
        breakId: b.id,
        label: `Break (${parts.join(", ")})`,
        before: `${b.startTime}→${b.endTime ?? "open"} · ${b.payClassification}`,
        after: `${next.startTime}→${next.endTime ?? "open"} · ${next.payClassification}`,
      });
    }
    if (b.endTime !== null && next.endTime === null) {
      errors.push("A finished break cannot be reopened.");
    }
    if (next.endTime && ms(next.endTime) < ms(next.startTime)) {
      errors.push("Break end cannot be before break start.");
    }
    return next;
  });

  // Closing an open session also ends a still-open break at the clock-out instant.
  const closing = original.clockOutAt === null && newOut !== null;
  const settled = finalBreaks.map((b) =>
    closing && b.endTime === null && newOut && ms(b.startTime) <= ms(newOut)
      ? { ...b, endTime: newOut }
      : b,
  );

  for (const b of settled) {
    if (ms(b.startTime) < ms(newIn)) {
      errors.push("Every break must fall inside the corrected shift.");
      break;
    }
    if (newOut && (b.endTime === null || ms(b.endTime) > ms(newOut))) {
      errors.push("Every break must fall inside the corrected shift.");
      break;
    }
  }

  const sorted = [...settled].sort((a, b) => ms(a.startTime) - ms(b.startTime));
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = sorted[i - 1].endTime;
    if (prevEnd === null || ms(prevEnd) > ms(sorted[i].startTime)) {
      errors.push("Breaks cannot overlap.");
      break;
    }
  }

  const breakInputs = settled.map((b) => ({
    durationSeconds: b.endTime ? secs(b.startTime, b.endTime) : null,
    endTime: b.endTime,
    payClassification: b.payClassification,
  }));
  const totalBreakSeconds = breakInputs.reduce(
    (sum, b) => sum + (b.durationSeconds ?? 0),
    0,
  );
  const gross = newOut ? secs(newIn, newOut) : null;
  if (gross !== null && totalBreakSeconds > gross) {
    errors.push("Total break time cannot exceed the shift.");
  }

  let status = original.status;
  if (newOut) status = "completed";
  else if (status === "on_break" && settled.every((b) => b.endTime !== null))
    status = "active";

  const summary = summarizeSessionBreakPay({
    status,
    grossElapsedSeconds: gross,
    breaks: breakInputs,
  });

  return {
    changes,
    errors: [...new Set(errors)],
    projected: {
      status,
      grossElapsedSeconds: gross,
      totalBreakSeconds,
      netPayableSeconds: summary.netPayableSeconds,
      breakPolicyResolved: summary.breakPolicyResolved,
    },
  };
}
