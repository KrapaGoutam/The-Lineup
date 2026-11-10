/**
 * V2-006 R2 — the TypeScript side of the native Payroll identity / consumption boundary.
 *
 * Everything that decides money lives in the database (`payroll_generate_native_period`,
 * the consumption ledger, the cross-key guard). This module only translates the database's
 * stable error prefixes into safe, human messages and never computes hours, rates or pay.
 */

export type NativePayrollErrorCode =
  | "not_activated"
  | "denied"
  | "dual_identity"
  | "mixed_source_month"
  | "not_payable"
  | "no_hours"
  | "no_rate"
  | "period_frozen"
  | "period_not_final"
  | "stale_version"
  | "source_transition_blocked"
  | "identity_link_in_use"
  | "invalid"
  | "unknown";

export interface NativePayrollError {
  readonly code: NativePayrollErrorCode;
  readonly message: string;
}

/** The subset of a PostgREST / Postgres error this mapper reads. */
export interface DbErrorLike {
  readonly code?: string | null;
  readonly message?: string | null;
}

export interface NotPayableCounts {
  readonly open: number;
  readonly autoClockOut: number;
  readonly unresolvedBreaks: number;
  readonly crossesMonthEnd: number;
  readonly moduleDisabled: number;
}

/**
 * Parses `ATTENDANCE_NOT_PAYABLE: open 1, auto clock-out 0, unclassified or open breaks 2,
 * crosses month end 0, module disabled 0.` Returns null when the text is not that message.
 */
export function parseNotPayableCounts(
  message: string | null | undefined,
): NotPayableCounts | null {
  if (!message) return null;
  const match =
    /ATTENDANCE_NOT_PAYABLE: open (\d+), auto clock-out (\d+), unclassified or open breaks (\d+), crosses month end (\d+), module disabled (\d+)/.exec(
      message,
    );
  if (!match) return null;
  const [, open, auto, unresolved, boundary, module] = match;
  return {
    open: Number(open),
    autoClockOut: Number(auto),
    unresolvedBreaks: Number(unresolved),
    crossesMonthEnd: Number(boundary),
    moduleDisabled: Number(module),
  };
}

function describeNotPayable(counts: NotPayableCounts | null): string {
  if (!counts) {
    return "This employee's attendance is not ready for payroll yet.";
  }
  const parts: string[] = [];
  if (counts.open > 0) parts.push(`${counts.open} shift(s) still open`);
  if (counts.autoClockOut > 0) {
    parts.push(`${counts.autoClockOut} automatic clock-out(s) need review`);
  }
  if (counts.unresolvedBreaks > 0) {
    parts.push(`${counts.unresolvedBreaks} shift(s) with unclassified breaks`);
  }
  if (counts.crossesMonthEnd > 0) {
    parts.push(`${counts.crossesMonthEnd} shift(s) crossing the month end`);
  }
  if (counts.moduleDisabled > 0) {
    parts.push(
      `${counts.moduleDisabled} shift(s) at a location without Attendance`,
    );
  }
  return `Attendance is not ready for payroll: ${parts.join(", ")}.`;
}

/**
 * Maps a database error to a stable code and a message that reveals nothing about other
 * employees or organizations. An authority failure is deliberately uniform (the database
 * itself does not distinguish "not found" from "not allowed").
 */
export function mapNativePayrollError(
  error: DbErrorLike | null | undefined,
): NativePayrollError {
  const message = error?.message ?? "";
  const code = error?.code ?? "";

  if (message.startsWith("NOT_ACTIVATED")) {
    return {
      code: "not_activated",
      message:
        "Native attendance is not enabled for payroll yet. Nothing was changed.",
    };
  }
  if (message.startsWith("DUAL_IDENTITY_DUPLICATE")) {
    return {
      code: "dual_identity",
      message:
        "This employee already has a payroll record for that month under their other identity. Nothing was changed.",
    };
  }
  if (message.startsWith("MIXED_SOURCE_MONTH")) {
    return {
      code: "mixed_source_month",
      message:
        "This employee has attendance from the new system in that month, so it cannot also be paid from the external system. Resolve it first.",
    };
  }
  if (message.startsWith("ATTENDANCE_NOT_PAYABLE")) {
    return {
      code: "not_payable",
      message: describeNotPayable(parseNotPayableCounts(message)),
    };
  }
  if (message.startsWith("NO_ATTENDANCE_HOURS")) {
    return {
      code: "no_hours",
      message: "There is no payable attendance for that employee and month.",
    };
  }
  if (message.startsWith("NO_RATE_CONFIGURED")) {
    return {
      code: "no_rate",
      message:
        "No pay rate is configured for this person, and there's no organization default set. Set a rate first.",
    };
  }
  if (message.startsWith("PERIOD_FROZEN")) {
    return {
      code: "period_frozen",
      message:
        "That payroll period is locked or already has payments. Changes to its attendance go through the adjustment review.",
    };
  }
  if (
    message.startsWith("PERIOD_NOT_FINAL") ||
    message.startsWith("PERIOD_NOT_RECONCILED")
  ) {
    return {
      code: "period_not_final",
      message:
        "The attendance behind this period changed or is unresolved. Regenerate the draft before locking it.",
    };
  }
  if (message.startsWith("SOURCE_TRANSITION_BLOCKED")) {
    return {
      code: "source_transition_blocked",
      message:
        "The attendance source cannot be changed yet. Resolve the listed items and switch at the start of a payroll month.",
    };
  }
  if (message.startsWith("IDENTITY_LINK_IN_USE")) {
    return {
      code: "identity_link_in_use",
      message:
        "This link protects an employee with native payroll history or attendance and cannot be changed.",
    };
  }
  if (code === "42501") {
    return { code: "denied", message: "You don't have access to payroll." };
  }
  if (code === "P0004") {
    return {
      code: "stale_version",
      message:
        "That attendance record changed. Reload and review the newer version.",
    };
  }
  if (code === "22023") {
    return { code: "invalid", message: "That payroll request is invalid." };
  }
  return {
    code: "unknown",
    message: "Unable to reach payroll data right now.",
  };
}

/** `period_month` for any date: the first day of its calendar month (no time zone math). */
export function firstOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${year}-${month}-01`;
}

/** Blockers the database reports for an attendance-source change, in a stable display order. */
export const SOURCE_TRANSITION_BLOCKER_LABELS: Readonly<
  Record<string, string>
> = {
  not_period_boundary: "Switch only on the first day of a payroll month",
  open_sessions: "Employees are still clocked in",
  unresolved_breaks: "Some breaks are not classified yet",
  pending_consumption: "Payable attendance has not been through payroll yet",
  current_month_activity: "This month already has attendance at this location",
  unresolved_adjustment_reviews:
    "Attendance corrections are waiting for review",
  ambiguous_identity: "An employee with two identities needs resolving",
};

export function labelSourceTransitionBlockers(
  blockers: readonly string[],
): string[] {
  return Object.keys(SOURCE_TRANSITION_BLOCKER_LABELS)
    .filter((key) => blockers.includes(key))
    .map((key) => SOURCE_TRANSITION_BLOCKER_LABELS[key]!);
}
