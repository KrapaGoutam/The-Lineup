/**
 * V2.0.7 — report authority (pure, fail-closed).
 *
 * The canonical three-layer resolver (`resolveUserAccess`) and the database predicates
 * (`attendance_can_manage`, RLS) stay the ONLY authority. This module only combines their
 * verdicts into one answer per (organization, branch) and checks a request against it:
 *
 *   attendance  all  — the database says the caller manages attendance at the branch
 *               self  — the caller may read only their own attendance
 *               none  — module off, or no access
 *   payroll     all  — attendance manager AND resolver management tier AND module on
 *               self  — own locked payroll only
 *               none  — module off, or no access
 *
 * A request naming anything outside the caller's authority is REFUSED as a whole (never
 * silently narrowed, never confirmed or denied with detail), so a forged organization,
 * branch or employee id cannot be used to probe other tenants.
 */

import type { LocationAddress } from "@/features/locations/domain/location";
import type { ResolverCapability } from "@/features/auth/domain/access-resolver";
import {
  REPORT_MAX_EMPLOYEE_SELECTION,
  REPORT_MAX_RANGE_DAYS,
  type EmployeeKey,
  type ReportContent,
  type ReportFilters,
} from "./report-types";
import { inclusiveDayCount } from "@/lib/report-period";

export type CapabilityLevel = "all" | "self" | "none";

export interface AuthorityFacts {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly timeZone: string;
  readonly address?: LocationAddress;
  /** `locations.attendance_mode` verbatim (null = never configured). */
  readonly attendanceMode: string | null;
  /** Canonical resolver output for exactly this (organization, location). */
  readonly allowed: boolean;
  readonly capabilities: readonly ResolverCapability[];
  readonly attendanceModuleUsable: boolean;
  readonly payrollModuleUsable: boolean;
  /** Live database verdict of `attendance_can_manage(location)`. */
  readonly dbAttendanceManage: boolean;
}

export interface LocationAuthority {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly timeZone: string;
  readonly address?: LocationAddress;
  readonly attendanceMode: string | null;
  readonly attendance: CapabilityLevel;
  readonly payroll: CapabilityLevel;
  /** Organization-wide authority (Overall owner/manager, org owner/GM). */
  readonly orgWide: boolean;
}

function has(
  capabilities: readonly ResolverCapability[],
  capability: ResolverCapability,
): boolean {
  return capabilities.includes(capability);
}

/** Combines resolver + module + database verdicts for one branch. Never throws. */
export function resolveLocationAuthority(
  facts: AuthorityFacts,
): LocationAuthority {
  const member = facts.allowed && has(facts.capabilities, "location:access");
  const managementTier =
    member && has(facts.capabilities, "location:assistant_manage");

  const attendance: CapabilityLevel = !member
    ? "none"
    : !facts.attendanceModuleUsable
      ? "none"
      : facts.dbAttendanceManage
        ? "all"
        : "self";

  const payroll: CapabilityLevel = !member
    ? "none"
    : !facts.payrollModuleUsable
      ? "none"
      : facts.dbAttendanceManage && managementTier
        ? "all"
        : "self";

  return {
    organizationId: facts.organizationId,
    organizationName: facts.organizationName,
    organizationSlug: facts.organizationSlug,
    locationId: facts.locationId,
    locationName: facts.locationName,
    timeZone: facts.timeZone,
    address: facts.address,
    attendanceMode: facts.attendanceMode,
    attendance,
    payroll,
    orgWide: member && has(facts.capabilities, "org:admin"),
  };
}

export type SelectionFailureCode =
  | "invalid_range"
  | "range_too_long"
  | "forbidden_selection"
  | "too_many_employees"
  | "nothing_authorized"
  | "content_not_authorized";

export type SelectionResult =
  | {
      readonly ok: true;
      readonly locations: readonly LocationAuthority[];
      /** Locations in the selection where the requested content is not authorized. */
      readonly notAuthorizedFor: ReadonlyArray<{
        readonly location: LocationAuthority;
        readonly content: "attendance" | "payroll";
      }>;
    }
  | {
      readonly ok: false;
      readonly code: SelectionFailureCode;
      /** Generic, non-disclosing text. */
      readonly message: string;
    };

const GENERIC_FORBIDDEN =
  "That selection includes something you don't have access to. Choose from the options shown.";

function wants(content: ReportContent): {
  attendance: boolean;
  payroll: boolean;
} {
  return {
    attendance: content === "attendance" || content === "both",
    payroll: content === "payroll" || content === "both",
  };
}

/**
 * Resolves a request against the caller's authority. Organization and branch ids not in
 * `authorities` are refused as a whole; a branch the caller can reach but not for the
 * requested content is reported (not silently dropped) so the report can say so.
 */
export function resolveReportSelection(
  authorities: readonly LocationAuthority[],
  filters: Pick<
    ReportFilters,
    | "organizationIds"
    | "locationIds"
    | "employeeKeys"
    | "content"
    | "startDate"
    | "endDate"
  >,
): SelectionResult {
  const days = inclusiveDayCount(filters.startDate, filters.endDate);
  if (days === null) {
    return {
      ok: false,
      code: "invalid_range",
      message: "Choose a valid date range.",
    };
  }
  if (days > REPORT_MAX_RANGE_DAYS) {
    return {
      ok: false,
      code: "range_too_long",
      message: `Choose a range of ${REPORT_MAX_RANGE_DAYS} days or fewer.`,
    };
  }
  if (
    filters.employeeKeys &&
    filters.employeeKeys.length > REPORT_MAX_EMPLOYEE_SELECTION
  ) {
    return {
      ok: false,
      code: "too_many_employees",
      message: `Select ${REPORT_MAX_EMPLOYEE_SELECTION} employees or fewer, or choose all employees.`,
    };
  }

  const known = new Set(authorities.map((a) => a.locationId));
  const knownOrgs = new Set(authorities.map((a) => a.organizationId));
  if (filters.organizationIds?.some((id) => !knownOrgs.has(id))) {
    return {
      ok: false,
      code: "forbidden_selection",
      message: GENERIC_FORBIDDEN,
    };
  }
  if (filters.locationIds?.some((id) => !known.has(id))) {
    return {
      ok: false,
      code: "forbidden_selection",
      message: GENERIC_FORBIDDEN,
    };
  }

  const selected = authorities.filter(
    (a) =>
      (!filters.organizationIds ||
        filters.organizationIds.includes(a.organizationId)) &&
      (!filters.locationIds || filters.locationIds.includes(a.locationId)),
  );
  // An explicit location must belong to an explicitly selected organization.
  if (
    filters.organizationIds &&
    filters.locationIds &&
    filters.locationIds.some((id) => {
      const owner = authorities.find((a) => a.locationId === id);
      return !owner || !filters.organizationIds!.includes(owner.organizationId);
    })
  ) {
    return {
      ok: false,
      code: "forbidden_selection",
      message: GENERIC_FORBIDDEN,
    };
  }

  const need = wants(filters.content);
  const notAuthorizedFor: Array<{
    location: LocationAuthority;
    content: "attendance" | "payroll";
  }> = [];
  const usable: LocationAuthority[] = [];
  for (const location of selected) {
    const attendanceOk = !need.attendance || location.attendance !== "none";
    const payrollOk = !need.payroll || location.payroll !== "none";
    if (need.attendance && location.attendance === "none") {
      notAuthorizedFor.push({ location, content: "attendance" });
    }
    if (need.payroll && location.payroll === "none") {
      notAuthorizedFor.push({ location, content: "payroll" });
    }
    if (attendanceOk || payrollOk) usable.push(location);
  }

  if (selected.length === 0) {
    return {
      ok: false,
      code: "nothing_authorized",
      message: "There is nothing you can report on for that selection.",
    };
  }
  // At least one requested kind of content must be authorized somewhere.
  const anyAuthorized = usable.some(
    (l) =>
      (need.attendance && l.attendance !== "none") ||
      (need.payroll && l.payroll !== "none"),
  );
  if (!anyAuthorized) {
    return {
      ok: false,
      code: "content_not_authorized",
      message:
        "You don't have access to that kind of report for the selected branches.",
    };
  }

  return { ok: true, locations: usable, notAuthorizedFor };
}

/** Whether `employeeKey` is selectable given the authorized roster (forgery check). */
export function validateEmployeeSelection(
  selection: readonly EmployeeKey[] | null,
  authorizedKeys: ReadonlySet<EmployeeKey>,
): { ok: true } | { ok: false; message: string } {
  if (!selection) return { ok: true };
  for (const key of selection) {
    if (!authorizedKeys.has(key)) {
      return { ok: false, message: GENERIC_FORBIDDEN };
    }
  }
  return { ok: true };
}
