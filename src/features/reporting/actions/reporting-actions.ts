"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { monthBounds, shiftMonth } from "@/lib/report-period";

import { loadReportingAuthorities } from "../data/reporting-authority";
import {
  loadRoster,
  readAttendance,
  readPayroll,
  type ReadContext,
} from "../data/report-data";
import {
  resolveReportSelection,
  validateEmployeeSelection,
  type CapabilityLevel,
} from "../domain/report-authority";
import { composeCombinedReport } from "../domain/report-composer";
import {
  REPORT_MAX_EMPLOYEE_SELECTION,
  REPORT_MAX_RANGE_DAYS,
  type CombinedReport,
  type ReportBranchRef,
  type ReportException,
} from "../domain/report-types";

export type ReportingActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly sessionInvalid?: true;
    };

export interface ReportingOptionsBranch {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly attendance: CapabilityLevel;
  readonly payroll: CapabilityLevel;
}

export interface ReportingOptions {
  readonly organizations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }>;
  readonly branches: readonly ReportingOptionsBranch[];
  readonly employees: ReadonlyArray<{
    readonly key: string;
    readonly displayName: string;
    readonly role?: string;
    readonly identity: "verified" | "unmapped_external";
    readonly organizationIds: readonly string[];
    readonly locationIds: readonly string[];
  }>;
  readonly canSeePayroll: boolean;
  readonly canSeeAttendance: boolean;
  /** `true` when the caller manages at least one branch (otherwise self-only). */
  readonly canManage: boolean;
  readonly maxRangeDays: number;
  readonly maxEmployees: number;
  readonly thisMonth: { readonly start: string; readonly end: string };
  readonly lastMonth: { readonly start: string; readonly end: string };
  readonly today: string;
}

const NOT_SIGNED_IN = "You need to sign in to see reports.";
const INVALID = "That report request is invalid.";

const uuid = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const employeeKey = z
  .string()
  .trim()
  .max(120)
  .regex(
    /^(profile:[0-9a-f-]{36}|neon:[0-9a-f-]{36}:\d{1,12})$/i,
    "invalid employee",
  );

const filtersSchema = z.object({
  organizationIds: z.array(uuid).max(50).nullable(),
  locationIds: z.array(uuid).max(200).nullable(),
  // Bounded by the selection rule below, but capped here too so a crafted request cannot
  // send an unbounded list. The domain refuses an over-limit selection (never truncates).
  employeeKeys: z
    .array(employeeKey)
    .max(REPORT_MAX_EMPLOYEE_SELECTION + 1)
    .nullable(),
  content: z.enum(["attendance", "payroll", "both"]),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  output: z.enum(["combined", "by_organization", "by_branch"]),
});

function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * What the Report Builder may offer. This is a convenience for the form only — every
 * selection is verified again by `generateCombinedReportAction`, which never trusts it.
 */
export async function getReportingOptionsAction(): Promise<
  ReportingActionResult<ReportingOptions>
> {
  try {
    const supabase = await createClient();
    const auth = await loadReportingAuthorities(supabase);
    if (!auth.ok) {
      return {
        ok: false,
        error: auth.sessionInvalid ? NOT_SIGNED_IN : auth.error,
        ...(auth.sessionInvalid ? { sessionInvalid: true as const } : {}),
      };
    }
    const roster = await loadRoster(supabase, auth.profileId, auth.authorities);

    const orgs = new Map<string, { id: string; name: string; slug: string }>();
    for (const a of auth.authorities) {
      orgs.set(a.organizationId, {
        id: a.organizationId,
        name: a.organizationName,
        slug: a.organizationSlug,
      });
    }
    const today = todayIn(auth.authorities[0]?.timeZone ?? "America/Chicago");
    const thisMonth = monthBounds(today) ?? { start: today, end: today };
    const lastMonth = shiftMonth(today, -1) ?? thisMonth;

    return {
      ok: true,
      data: {
        organizations: [...orgs.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        branches: auth.authorities
          .map((a) => ({
            id: a.locationId,
            organizationId: a.organizationId,
            name: a.locationName,
            timeZone: a.timeZone,
            attendance: a.attendance,
            payroll: a.payroll,
          }))
          .sort(
            (a, b) =>
              a.organizationId.localeCompare(b.organizationId) ||
              a.name.localeCompare(b.name),
          ),
        employees: roster.employees.map((e) => ({ ...e })),
        canSeeAttendance: auth.authorities.some((a) => a.attendance !== "none"),
        canSeePayroll: auth.authorities.some((a) => a.payroll !== "none"),
        canManage: auth.authorities.some(
          (a) => a.attendance === "all" || a.payroll === "all",
        ),
        maxRangeDays: REPORT_MAX_RANGE_DAYS,
        maxEmployees: REPORT_MAX_EMPLOYEE_SELECTION,
        thisMonth,
        lastMonth,
        today,
      },
    };
  } catch (err: unknown) {
    console.error("getReportingOptionsAction unexpected error", err);
    return {
      ok: false,
      error: "Reporting options are unavailable. Try again.",
    };
  }
}

/**
 * Composes ONE report from existing attendance and payroll records.
 *
 * Authority is re-established here from verified facts on every call; the request is only
 * a set of narrowing choices. A selection naming anything outside the caller's authority is
 * refused as a whole. Reads use the caller's own RLS-bound client and every row is checked
 * again against the caller's per-branch authority. Nothing is written: no payroll snapshot,
 * payment, adjustment, attendance record or Neon row is created or changed.
 */
export async function generateCombinedReportAction(
  input: unknown,
): Promise<ReportingActionResult<CombinedReport>> {
  try {
    const parsed = filtersSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID };
    const filters = parsed.data;

    const supabase = await createClient();
    const auth = await loadReportingAuthorities(supabase);
    if (!auth.ok) {
      return {
        ok: false,
        error: auth.sessionInvalid ? NOT_SIGNED_IN : auth.error,
        ...(auth.sessionInvalid ? { sessionInvalid: true as const } : {}),
      };
    }

    const selection = resolveReportSelection(auth.authorities, filters);
    if (!selection.ok) return { ok: false, error: selection.message };

    const roster = await loadRoster(supabase, auth.profileId, auth.authorities);
    const employeeCheck = validateEmployeeSelection(
      filters.employeeKeys,
      roster.authorizedKeys,
    );
    if (!employeeCheck.ok) return { ok: false, error: employeeCheck.message };

    const ctx: ReadContext = {
      supabase,
      profileId: auth.profileId,
      authorities: auth.authorities,
      selected: selection.locations,
      orgLocationCounts: auth.orgLocationCounts,
      filters,
      roster,
    };

    const needAttendance = filters.content !== "payroll";
    const needPayroll = filters.content !== "attendance";
    const [attendance, payroll] = await Promise.all([
      needAttendance ? readAttendance(ctx) : Promise.resolve(null),
      needPayroll ? readPayroll(ctx) : Promise.resolve(null),
    ]);

    const issues: ReportException[] = [
      ...roster.issues,
      ...(attendance?.issues ?? []),
      ...(payroll?.issues ?? []),
    ];
    for (const miss of selection.notAuthorizedFor) {
      issues.push({
        code:
          miss.content === "payroll"
            ? "payroll_not_authorized"
            : "attendance_not_authorized",
        severity: "info",
        message: `${miss.content === "payroll" ? "Payroll" : "Attendance"} is not included for ${miss.location.organizationName} · ${miss.location.locationName} because it isn't available to you there.`,
        organizationId: miss.location.organizationId,
        locationId: miss.location.locationId,
      });
    }

    // Names for payroll people who are not in the selectable roster (never guessed).
    const profileNames = { ...roster.profileNames };
    const missing = (payroll?.periods ?? [])
      .map((p) => p.profileId)
      .filter((id): id is string => !!id && !profileNames[id]);
    if (missing.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", [...new Set(missing)].slice(0, 200));
      for (const p of data ?? []) {
        profileNames[p.id] = p.display_name?.trim() || "Employee";
      }
    }

    const branches: ReportBranchRef[] = selection.locations.map((a) => ({
      id: a.locationId,
      organizationId: a.organizationId,
      name: a.locationName,
      timeZone: a.timeZone,
      address: a.address,
    }));
    const orgsWithOrgLevel = new Set<string>();
    for (const s of attendance?.slices ?? []) {
      if (s.locationId === null) orgsWithOrgLevel.add(s.organizationId);
    }
    for (const p of payroll?.periods ?? []) {
      if (p.locationId === null) orgsWithOrgLevel.add(p.organizationId);
    }
    for (const orgId of orgsWithOrgLevel) {
      const any = selection.locations.find((a) => a.organizationId === orgId);
      branches.push({
        id: null,
        organizationId: orgId,
        name: "Organization-level (no branch recorded)",
        timeZone: any?.timeZone ?? null,
      });
    }

    const organizations = [
      ...new Map(
        selection.locations.map((a) => [
          a.organizationId,
          {
            id: a.organizationId,
            name: a.organizationName,
            slug: a.organizationSlug,
          },
        ]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const report = composeCombinedReport({
      generatedAt: new Date().toISOString(),
      filters,
      organizations,
      branches,
      attendance: attendance?.slices ?? null,
      payroll: payroll?.periods ?? null,
      identityLinks: roster.identityLinks,
      profileNames,
      neonUsers: roster.neonUsers,
      actorNames: payroll?.actorNames ?? {},
      issues,
    });
    return { ok: true, data: report };
  } catch (err: unknown) {
    console.error("generateCombinedReportAction unexpected error", err);
    return {
      ok: false,
      error: "The report could not be generated. Try again.",
    };
  }
}
