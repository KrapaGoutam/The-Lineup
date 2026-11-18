import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import { listAttendanceIdentityLinks } from "@/features/attendance/data/identity-links";
import {
  listLocationEmployees,
  listNativeAttendance,
} from "@/features/attendance/data/native-report-data";
import {
  normalizeNativeAttendanceToUnified,
  normalizeNeonAttendanceToUnified,
} from "@/features/attendance/domain/unified-attendance-report";
import {
  classifyReportPeriod,
  formatReportPeriodLabel,
} from "@/lib/report-period";
import type { Database } from "@/types/database.generated";

import type { LocationAuthority } from "../domain/report-authority";
import type {
  AttendanceSliceInput,
  BranchAttribution,
  IdentityLinkInput,
  PayrollPeriodInput,
} from "../domain/report-composer";
import {
  REPORT_MAX_PAYROLL_PERIODS,
  neonKey,
  profileKey,
  type AdjustmentRecord,
  type EmployeeKey,
  type ExceptionCode,
  type PaymentRecord,
  type ReportException,
  type ReportFilters,
} from "../domain/report-types";

type Client = SupabaseClient<Database>;

const NEON_ROW_CAP = 5000;
const IN_CHUNK = 200;
const UNKNOWN_ORG_BRANCH = "Organization-level (no branch recorded)";

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export interface RosterEmployee {
  readonly key: EmployeeKey;
  readonly displayName: string;
  readonly role?: string;
  readonly identity: "verified" | "unmapped_external";
  readonly organizationIds: readonly string[];
  /** Branches the person is assigned to (or the external branch). Informational. */
  readonly locationIds: readonly string[];
}

export interface Roster {
  /** Every employee the caller may select, keyed canonically. */
  readonly employees: readonly RosterEmployee[];
  readonly authorizedKeys: ReadonlySet<EmployeeKey>;
  readonly profileNames: Readonly<Record<string, string>>;
  readonly neonUsers: Readonly<
    Record<string, { fullName: string; role?: string }>
  >;
  readonly identityLinks: readonly IdentityLinkInput[];
  /** Neon user ids the caller may read, per organization. */
  readonly neonVisible: Readonly<Record<string, readonly number[]>>;
  /** Caller's own Neon identity per organization (if linked). */
  readonly ownNeonIds: Readonly<Record<string, number>>;
  readonly issues: readonly ReportException[];
}

function issue(
  code: ExceptionCode,
  severity: ReportException["severity"],
  message: string,
  extra: Partial<ReportException> = {},
): ReportException {
  return { code, severity, message, ...extra };
}

async function fetchProfileNames(
  supabase: Client,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const unique = [...new Set(ids)];
  for (const part of chunk(unique, 100)) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", part);
    for (const p of data ?? [])
      names[p.id] = p.display_name?.trim() || "Employee";
  }
  return names;
}

/**
 * Builds the set of employees the caller may report on. Visibility is derived from the
 * caller's authority per branch and then enforced again by RLS on every read:
 *  - attendance `all` at a branch → the branch's active members (and, for an EXTERNAL branch,
 *    its Neon users: every Neon user for organization-wide authority, otherwise only those
 *    verifiably linked to a member of that branch);
 *  - `self` → the caller only.
 * A Neon person without a verified link is `unmapped_external` and is kept apart.
 */
export async function loadRoster(
  supabase: Client,
  profileId: string,
  authorities: readonly LocationAuthority[],
): Promise<Roster> {
  const issues: ReportException[] = [];
  const entries = new Map<
    EmployeeKey,
    {
      name: string;
      role?: string;
      identity: RosterEmployee["identity"];
      orgs: Set<string>;
      locs: Set<string>;
    }
  >();
  const add = (
    key: EmployeeKey,
    name: string,
    identity: RosterEmployee["identity"],
    org: string,
    loc: string | null,
    role?: string,
  ) => {
    const e = entries.get(key) ?? {
      name,
      role,
      identity,
      orgs: new Set<string>(),
      locs: new Set<string>(),
    };
    e.orgs.add(org);
    if (loc) e.locs.add(loc);
    entries.set(key, e);
  };

  const profileNames: Record<string, string> = {};
  const memberProfilesByLocation = new Map<string, string[]>();

  // Native / assigned members of every branch the caller manages attendance for.
  for (const a of authorities) {
    if (a.attendance !== "all" && a.payroll !== "all") continue;
    const res = await listLocationEmployees(supabase, a.locationId);
    if (!res.ok) {
      issues.push(
        issue(
          "source_unavailable",
          "warning",
          `Employees for ${a.organizationName} · ${a.locationName} could not be loaded.`,
          {
            organizationId: a.organizationId,
            locationId: a.locationId,
          },
        ),
      );
      continue;
    }
    memberProfilesByLocation.set(
      a.locationId,
      res.employees.map((e) => e.profileId),
    );
    for (const e of res.employees) {
      profileNames[e.profileId] = e.displayName;
      add(
        profileKey(e.profileId),
        e.displayName,
        "verified",
        a.organizationId,
        a.locationId,
      );
    }
  }

  // The caller can always select themself where they have any access.
  if (authorities.length > 0) {
    const own = await fetchProfileNames(supabase, [profileId]);
    const name = own[profileId] ?? "You";
    profileNames[profileId] = name;
    for (const a of authorities) {
      add(
        profileKey(profileId),
        name,
        "verified",
        a.organizationId,
        a.locationId,
      );
    }
  }

  // External (Neon) people, per organization that has an explicitly external branch.
  const neonUsersRecord: Record<string, { fullName: string; role?: string }> =
    {};
  const identityLinks: IdentityLinkInput[] = [];
  const neonVisible: Record<string, number[]> = {};
  const ownNeonIds: Record<string, number> = {};
  const externalOrgs = [
    ...new Set(
      authorities
        .filter((a) => a.attendanceMode === "external")
        .map((a) => a.organizationId),
    ),
  ];
  let neonUsers: NeonUser[] | null = null;

  // Verified identity links for EVERY organization in scope, not only those with an
  // external branch: payroll records keyed by an external (Neon) id outlive a switch to
  // internal attendance, and their owner is still identified through the verified link.
  // (RLS lets a manager read the organization's links and anyone else only their own.)
  const linkRowsByOrg = new Map<
    string,
    Array<{ neonUserId: number; profileId: string }>
  >();
  for (const orgId of new Set(authorities.map((a) => a.organizationId))) {
    const links = await listAttendanceIdentityLinks(supabase, {
      organizationId: orgId,
    });
    if (!links.ok) {
      issues.push(
        issue(
          "source_unavailable",
          "warning",
          `Identity links for ${authorities.find((a) => a.organizationId === orgId)!.organizationName} could not be loaded; people recorded under an external id stay unlinked in this report.`,
          { organizationId: orgId },
        ),
      );
    }
    const rows = links.ok ? links.data : [];
    linkRowsByOrg.set(orgId, rows);
    for (const l of rows) {
      identityLinks.push({
        organizationId: orgId,
        neonUserId: l.neonUserId,
        profileId: l.profileId,
      });
      if (l.profileId === profileId) ownNeonIds[orgId] = l.neonUserId;
    }
  }

  for (const orgId of externalOrgs) {
    const orgExternal = authorities.filter(
      (a) => a.organizationId === orgId && a.attendanceMode === "external",
    );
    const linkRows = linkRowsByOrg.get(orgId) ?? [];

    const managesAll = orgExternal.filter((a) => a.attendance === "all");
    const orgWide = managesAll.some((a) => a.orgWide);
    if (managesAll.length === 0) {
      // Self only: the caller's own external identity, if verifiably linked.
      if (ownNeonIds[orgId] !== undefined)
        neonVisible[orgId] = [ownNeonIds[orgId]!];
      else neonVisible[orgId] = [];
      continue;
    }

    if (neonUsers === null) {
      const res = await getActiveNeonUsers();
      if (!res.ok) {
        issues.push(
          issue(
            "source_unavailable",
            "blocking",
            "The external time clock could not be reached. External attendance is not included.",
            { organizationId: orgId },
          ),
        );
        neonUsers = [];
      } else {
        neonUsers = res.data;
      }
    }

    const memberSet = new Set<string>();
    for (const a of managesAll) {
      for (const p of memberProfilesByLocation.get(a.locationId) ?? [])
        memberSet.add(p);
    }
    const linkedProfileByNeon = new Map(
      linkRows.map((l) => [l.neonUserId, l.profileId]),
    );
    const visible: number[] = [];
    for (const u of neonUsers) {
      const linkedProfile = linkedProfileByNeon.get(u.id) ?? null;
      // Organization-wide authority sees every Neon user; a branch manager only people
      // verifiably linked to a member of their branch (no provenance → not visible).
      if (!orgWide && !(linkedProfile && memberSet.has(linkedProfile)))
        continue;
      visible.push(u.id);
      neonUsersRecord[`${orgId}:${u.id}`] = {
        fullName: u.fullName,
        role: u.role,
      };
      const loc = managesAll[0]!.locationId;
      if (linkedProfile) {
        const name = profileNames[linkedProfile] ?? u.fullName;
        profileNames[linkedProfile] = name;
        add(profileKey(linkedProfile), name, "verified", orgId, loc, u.role);
      } else {
        add(
          neonKey(orgId, u.id),
          u.fullName,
          "unmapped_external",
          orgId,
          loc,
          u.role,
        );
      }
    }
    neonVisible[orgId] = visible;
    if (
      ownNeonIds[orgId] !== undefined &&
      !visible.includes(ownNeonIds[orgId]!)
    ) {
      visible.push(ownNeonIds[orgId]!);
    }
  }

  const employees: RosterEmployee[] = [...entries.entries()]
    .map(([key, e]) => ({
      key,
      displayName: e.name,
      role: e.role,
      identity: e.identity,
      organizationIds: [...e.orgs],
      locationIds: [...e.locs],
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    employees,
    authorizedKeys: new Set(employees.map((e) => e.key)),
    profileNames,
    neonUsers: neonUsersRecord,
    identityLinks,
    neonVisible,
    ownNeonIds,
    issues,
  };
}

export interface ReadContext {
  readonly supabase: Client;
  readonly profileId: string;
  /** Every branch the caller has any reporting authority at. */
  readonly authorities: readonly LocationAuthority[];
  /** The branches selected for this report (already verified). */
  readonly selected: readonly LocationAuthority[];
  readonly orgLocationCounts: Readonly<Record<string, number>>;
  readonly filters: Pick<
    ReportFilters,
    "content" | "startDate" | "endDate" | "employeeKeys"
  >;
  readonly roster: Roster;
}

function employeeFilter(ctx: ReadContext) {
  const keys = ctx.filters.employeeKeys;
  if (!keys) return null;
  const profiles = new Set<string>();
  const neonByOrg = new Map<string, Set<number>>();
  for (const key of keys) {
    if (key.startsWith("profile:")) {
      const id = key.slice("profile:".length);
      profiles.add(id);
      for (const l of ctx.roster.identityLinks) {
        if (l.profileId === id) {
          const s = neonByOrg.get(l.organizationId) ?? new Set<number>();
          s.add(l.neonUserId);
          neonByOrg.set(l.organizationId, s);
        }
      }
    } else if (key.startsWith("neon:")) {
      const [, orgId, id] = key.split(":");
      const s = neonByOrg.get(orgId!) ?? new Set<number>();
      s.add(Number(id));
      neonByOrg.set(orgId!, s);
    }
  }
  return { profiles, neonByOrg };
}

export interface AttendanceReadResult {
  readonly slices: AttendanceSliceInput[];
  readonly issues: ReportException[];
}

/** Attendance for the selected branches only, through the caller's own RLS-bound client. */
export async function readAttendance(
  ctx: ReadContext,
): Promise<AttendanceReadResult> {
  const slices: AttendanceSliceInput[] = [];
  const issues: ReportException[] = [];
  const filter = employeeFilter(ctx);
  const { startDate, endDate } = ctx.filters;
  const label = formatReportPeriodLabel(startDate, endDate);
  const kind = classifyReportPeriod(startDate, endDate);

  const externalByOrg = new Map<string, LocationAuthority[]>();
  for (const a of ctx.selected) {
    if (a.attendance === "none") continue;
    if (a.attendanceMode === "internal_the_lineup") {
      const profileIds =
        a.attendance === "self"
          ? [ctx.profileId]
          : filter
            ? [...filter.profiles]
            : null;
      if (profileIds !== null && profileIds.length === 0) continue; // selection names nobody here
      const res = await listNativeAttendance(ctx.supabase, {
        locationId: a.locationId,
        startDate,
        endDate,
        timeZone: a.timeZone,
        profileIds,
      });
      if (!res.ok) {
        issues.push(
          issue(
            "source_unavailable",
            "blocking",
            `Attendance for ${a.organizationName} · ${a.locationName} could not be loaded.`,
            {
              organizationId: a.organizationId,
              locationId: a.locationId,
            },
          ),
        );
        continue;
      }
      slices.push({
        organizationId: a.organizationId,
        locationId: a.locationId,
        provider: "internal_the_lineup",
        report: normalizeNativeAttendanceToUnified(res.rows, {
          organization: a.organizationName,
          branch: a.locationName,
          reportingPeriod: label,
          reportingPeriodKind: kind,
          timeZone: a.timeZone,
          truncated: res.truncated,
        }),
      });
    } else if (a.attendanceMode === "external") {
      const list = externalByOrg.get(a.organizationId) ?? [];
      list.push(a);
      externalByOrg.set(a.organizationId, list);
    } else {
      issues.push(
        issue(
          "source_unavailable",
          "info",
          `Attendance is ${a.attendanceMode === "disabled" ? "turned off" : "not configured"} for ${a.organizationName} · ${a.locationName}, so no attendance is included for it.`,
          {
            organizationId: a.organizationId,
            locationId: a.locationId,
          },
        ),
      );
    }
  }

  for (const [orgId, selectedExternal] of externalByOrg) {
    const visible = ctx.roster.neonVisible[orgId] ?? [];
    const wanted = filter
      ? (filter.neonByOrg.get(orgId) ?? new Set<number>())
      : null;
    const ids = wanted ? visible.filter((id) => wanted.has(id)) : [...visible];
    if (ids.length === 0) continue;

    const allExternalHere = ctx.authorities.filter(
      (a) => a.organizationId === orgId && a.attendanceMode === "external",
    );
    // The external clock records no branch. Attribute to a branch only when exactly one
    // external branch exists for the organization; never guess among several.
    const branch =
      allExternalHere.length === 1 && selectedExternal.length === 1
        ? selectedExternal[0]!
        : null;
    const anchor = branch ?? selectedExternal[0]!;
    if (!branch) {
      issues.push(
        issue(
          "no_branch_provenance",
          "info",
          `${anchor.organizationName} has several external branches and its external clock records no branch, so external attendance is shown at organization level.`,
          {
            organizationId: orgId,
          },
        ),
      );
    }

    const res = await getAttendanceRows({ userIds: ids, startDate, endDate });
    if (!res.ok) {
      issues.push(
        issue(
          "source_unavailable",
          "blocking",
          `External attendance for ${anchor.organizationName} could not be loaded.`,
          { organizationId: orgId },
        ),
      );
      continue;
    }
    const truncated = res.data.length > NEON_ROW_CAP;
    const rows = truncated ? res.data.slice(0, NEON_ROW_CAP) : res.data;
    slices.push({
      organizationId: orgId,
      locationId: branch ? branch.locationId : null,
      provider: "external_neon",
      report: normalizeNeonAttendanceToUnified(rows, {
        organization: anchor.organizationName,
        branch: branch ? branch.locationName : UNKNOWN_ORG_BRANCH,
        reportingPeriod: label,
        reportingPeriodKind: kind,
        timeZone: anchor.timeZone,
        truncated,
        users: Object.entries(ctx.roster.neonUsers)
          .filter(([k]) => k.startsWith(`${orgId}:`))
          .map(([k, u]) => ({
            id: Number(k.split(":")[1]),
            fullName: u.fullName,
            role: u.role ?? "",
            phone: null,
            createdAt: "",
            isActive: true,
          })),
      }),
    });
  }

  return { slices, issues };
}

function monthsFor(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let y = Number(startDate.slice(0, 4));
  let m = Number(startDate.slice(5, 7));
  const endY = Number(endDate.slice(0, 4));
  const endM = Number(endDate.slice(5, 7));
  while ((y < endY || (y === endY && m <= endM)) && out.length < 24) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface PayrollReadResult {
  readonly periods: PayrollPeriodInput[];
  readonly issues: ReportException[];
  readonly actorNames: Record<string, string>;
}

/**
 * Existing payroll snapshots with their ledgers — read only. Two independent checks apply
 * to every row: the database's RLS (which rows this session may read at all) and this
 * function's own authority check (which branch the row belongs to and whether the caller
 * has Payroll authority there). A row failing either is simply not part of the report.
 */
export async function readPayroll(
  ctx: ReadContext,
): Promise<PayrollReadResult> {
  const issues: ReportException[] = [];
  const periods: PayrollPeriodInput[] = [];
  const filter = employeeFilter(ctx);
  const months = monthsFor(ctx.filters.startDate, ctx.filters.endDate);

  const byLocation = new Map(ctx.authorities.map((a) => [a.locationId, a]));
  const selectedIds = new Set(ctx.selected.map((a) => a.locationId));
  const orgs = [
    ...new Set(
      ctx.selected
        .filter((a) => a.payroll !== "none")
        .map((a) => a.organizationId),
    ),
  ];

  const rows: Array<
    Database["public"]["Tables"]["payroll_periods"]["Row"] & {
      attribution: BranchAttribution;
      locationIdResolved: string | null;
    }
  > = [];
  let excludedOrgLevel = 0;

  for (const orgId of orgs) {
    const { data, error } = await ctx.supabase
      .from("payroll_periods")
      .select(
        "id, organization_id, location_id, attendance_source, profile_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
      )
      .eq("organization_id", orgId)
      .in("period_month", months)
      .order("period_month", { ascending: true })
      .order("id", { ascending: true })
      .limit(REPORT_MAX_PAYROLL_PERIODS + 1);
    if (error) {
      issues.push(
        issue(
          "source_unavailable",
          "blocking",
          "Payroll records could not be loaded for one organization.",
          { organizationId: orgId },
        ),
      );
      continue;
    }
    if ((data ?? []).length > REPORT_MAX_PAYROLL_PERIODS) {
      issues.push(
        issue(
          "payroll_truncated",
          "blocking",
          "There are more payroll records than can be loaded for one organization. Narrow the report.",
          { organizationId: orgId },
        ),
      );
    }

    const orgAuthorities = ctx.authorities.filter(
      (a) => a.organizationId === orgId,
    );
    const orgWideAll = orgAuthorities.some(
      (a) => a.orgWide && a.payroll === "all",
    );
    const payrollCapable = orgAuthorities.some((a) => a.payroll !== "none");
    const soleBranch =
      ctx.orgLocationCounts[orgId] === 1 && orgAuthorities.length === 1
        ? orgAuthorities[0]!
        : null;
    const selectedOfOrg = ctx.selected.filter(
      (a) => a.organizationId === orgId,
    );
    const allBranchesSelected =
      selectedOfOrg.length > 0 &&
      selectedOfOrg.length === (ctx.orgLocationCounts[orgId] ?? -1);

    for (const row of (data ?? []).slice(0, REPORT_MAX_PAYROLL_PERIODS)) {
      // Defense in depth: a row of another organization is never part of this one's report.
      if (row.organization_id !== orgId) continue;
      let locationId = row.location_id;
      let attribution: BranchAttribution = "recorded";
      if (locationId === null) {
        if (soleBranch) {
          locationId = soleBranch.locationId;
          attribution = "inferred_sole_branch";
        } else {
          attribution = "organization_level";
        }
      }

      const branchAuthority = locationId
        ? byLocation.get(locationId)
        : undefined;
      if (
        locationId &&
        (!branchAuthority || branchAuthority.payroll === "none")
      )
        continue;

      const managed = locationId
        ? branchAuthority!.payroll === "all"
        : orgWideAll;
      const own =
        row.profile_id === ctx.profileId ||
        (row.neon_user_id !== null &&
          ctx.roster.ownNeonIds[orgId] === row.neon_user_id);
      const allowed =
        managed || (own && row.status === "locked" && payrollCapable);
      if (!allowed) continue;

      if (locationId) {
        if (!selectedIds.has(locationId)) continue;
      } else if (!allBranchesSelected) {
        excludedOrgLevel += 1;
        continue;
      }

      if (filter) {
        const okProfile = row.profile_id
          ? filter.profiles.has(row.profile_id)
          : false;
        const linkedProfile =
          row.neon_user_id !== null
            ? ctx.roster.identityLinks.find(
                (l) =>
                  l.organizationId === orgId &&
                  l.neonUserId === row.neon_user_id,
              )?.profileId
            : undefined;
        const okNeon =
          row.neon_user_id !== null &&
          (filter.neonByOrg.get(orgId)?.has(row.neon_user_id) === true ||
            (linkedProfile ? filter.profiles.has(linkedProfile) : false));
        if (!okProfile && !okNeon) continue;
      }

      rows.push({ ...row, attribution, locationIdResolved: locationId });
    }
  }

  if (excludedOrgLevel > 0) {
    issues.push(
      issue(
        "org_level_payroll_excluded",
        "info",
        `${excludedOrgLevel} organization-level payroll record(s) carry no branch and were left out because not every branch of that organization is selected.`,
        { count: excludedOrgLevel },
      ),
    );
  }

  // Ledgers, in bounded IN-lists (never one unbounded query).
  const paymentsBy = new Map<number, PaymentRecord[]>();
  const adjustmentsBy = new Map<number, AdjustmentRecord[]>();
  const ids = rows.map((r) => r.id);
  const actorIds = new Set<string>();
  for (const part of chunk(ids, IN_CHUNK)) {
    const [pay, adj] = await Promise.all([
      ctx.supabase
        .from("payroll_payments")
        .select(
          "id, payroll_period_id, amount_cents, payment_date, comment, status, created_by, confirmed_by, confirmed_at, reverses_payment_id",
        )
        .in("payroll_period_id", part),
      ctx.supabase
        .from("payroll_adjustments")
        .select(
          "id, payroll_period_id, delta_cents, reason, created_at, created_by",
        )
        .in("payroll_period_id", part),
    ]);
    if (pay.error || adj.error) {
      issues.push(
        issue(
          "source_unavailable",
          "blocking",
          "Payments or adjustments could not be loaded. Payroll figures are incomplete.",
          {},
        ),
      );
      continue;
    }
    for (const p of pay.data ?? []) {
      const list = paymentsBy.get(p.payroll_period_id) ?? [];
      list.push({
        id: p.id,
        amountCents: p.amount_cents,
        paymentDate: p.payment_date,
        status: p.status as "draft" | "confirmed",
        comment: p.comment,
        createdBy: p.created_by,
        confirmedBy: p.confirmed_by,
        confirmedAt: p.confirmed_at,
        reversesPaymentId: p.reverses_payment_id,
      });
      paymentsBy.set(p.payroll_period_id, list);
    }
    for (const a of adj.data ?? []) {
      const list = adjustmentsBy.get(a.payroll_period_id) ?? [];
      list.push({
        id: a.id,
        deltaCents: a.delta_cents,
        reason: a.reason,
        createdAt: a.created_at,
        createdBy: a.created_by,
      });
      adjustmentsBy.set(a.payroll_period_id, list);
    }
  }

  for (const r of rows) {
    const branchAuthority = r.locationIdResolved
      ? byLocation.get(r.locationIdResolved)
      : undefined;
    const managed = branchAuthority
      ? branchAuthority.payroll === "all"
      : ctx.authorities.some(
          (a) =>
            a.organizationId === r.organization_id &&
            a.orgWide &&
            a.payroll === "all",
        );
    // A person reading their own record sees confirmed payments only and no staff names.
    const payments = (paymentsBy.get(r.id) ?? []).filter(
      (p) => managed || p.status === "confirmed",
    );
    const adjustments = adjustmentsBy.get(r.id) ?? [];
    for (const p of payments) {
      if (managed) {
        if (p.createdBy) actorIds.add(p.createdBy);
        if (p.confirmedBy) actorIds.add(p.confirmedBy);
      }
    }
    if (managed)
      for (const a of adjustments) if (a.createdBy) actorIds.add(a.createdBy);

    periods.push({
      periodId: r.id,
      source:
        r.attendance_source === "internal_the_lineup"
          ? "internal_the_lineup"
          : "external_neon",
      organizationId: r.organization_id,
      locationId: r.locationIdResolved,
      branchAttribution: r.attribution,
      profileId: r.profile_id,
      neonUserId: r.neon_user_id,
      periodMonth: r.period_month,
      status: r.status === "locked" ? "locked" : "draft",
      hoursSnapshot: Number(r.hours_snapshot),
      rateCents: r.rate_cents_snapshot,
      grossCents: r.gross_cents,
      payments: managed
        ? payments
        : payments.map((p) => ({ ...p, createdBy: null, confirmedBy: null })),
      adjustments: managed
        ? adjustments
        : adjustments.map((a) => ({ ...a, createdBy: null })),
    });
  }

  const actorNames = actorIds.size
    ? await fetchProfileNames(ctx.supabase, [...actorIds])
    : {};
  return { periods, issues, actorNames };
}
