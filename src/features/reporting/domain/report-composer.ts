/**
 * V2.0.7 — combined report composition (pure).
 *
 * Takes ALREADY-AUTHORIZED, ALREADY-READ records and arranges them into one report. It
 * performs no I/O and no authorization; the server layer decides what may be read.
 *
 * Financial rules (the priority order of this release: correctness first):
 *  - Payroll snapshots are the source of financial truth. `baseCents` is the stored
 *    `gross_cents`; nothing is recalculated from hours or rates.
 *  - The balance is `computeBalanceCents` verbatim: base − confirmed payments − Σ adjustment
 *    deltas. Draft payments are listed but never counted.
 *  - Money is integer cents, time is integer seconds. Rounding happens only in the
 *    presentation helpers, never before a sum.
 *  - Two payroll records for the same person, organization and month from different sources
 *    are a CONFLICT: both are shown, neither enters any total, and the report is marked
 *    incomplete. They are never summed and never reconciled by guessing.
 *  - Employees are merged across sources ONLY through a verified identity link
 *    (`attendance_identity_links`) or an identical authenticated profile id. A name or a
 *    bare number is never a match; an unlinked external identity stays separate and is
 *    reported.
 *  - Different organizations are different employers: their totals are labelled
 *    informational and are never merged into one obligation.
 */

import { computeBalanceCents } from "@/features/payroll/domain/calculate-payroll";
import type { UnifiedAttendanceReport } from "@/features/attendance/domain/unified-attendance-report";
import {
  classifyReportPeriod,
  formatReportPeriodLabel,
  monthBounds,
} from "@/lib/report-period";
import {
  INFORMATIONAL_AGGREGATE_NOTE,
  REPORT_CONFIDENTIALITY_LABEL,
  REPORT_CURRENCY,
  neonKey,
  profileKey,
  type AdjustmentRecord,
  type AttendanceDetailRow,
  type AttendanceProvider,
  type AttendanceSliceSummary,
  type CombinedReport,
  type EmployeeKey,
  type ExecutiveSummary,
  type LedgerEntry,
  type PaymentRecord,
  type PaymentState,
  type PayrollEntry,
  type RegisterRow,
  type ReportBranchRef,
  type ReportEmployee,
  type ReportException,
  type ReportFilters,
  type ReportOrganizationRef,
  type ScopedTotals,
  type TotalsBlock,
} from "./report-types";

// ── Input contracts ─────────────────────────────────────────────────────────────────────

export interface AttendanceSliceInput {
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly provider: AttendanceProvider;
  readonly report: UnifiedAttendanceReport;
}

export type BranchAttribution =
  | "recorded"
  | "inferred_sole_branch"
  | "organization_level";

export interface PayrollPeriodInput {
  readonly periodId: number;
  readonly source: AttendanceProvider;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly branchAttribution: BranchAttribution;
  readonly profileId: string | null;
  readonly neonUserId: number | null;
  readonly periodMonth: string;
  readonly status: "draft" | "locked";
  readonly hoursSnapshot: number;
  readonly rateCents: number;
  readonly grossCents: number;
  readonly payments: readonly PaymentRecord[];
  readonly adjustments: readonly AdjustmentRecord[];
}

export interface IdentityLinkInput {
  readonly organizationId: string;
  readonly neonUserId: number;
  readonly profileId: string;
}

export interface ComposeInput {
  readonly generatedAt: string;
  readonly filters: Pick<
    ReportFilters,
    "content" | "output" | "startDate" | "endDate"
  >;
  readonly organizations: readonly ReportOrganizationRef[];
  readonly branches: readonly ReportBranchRef[];
  /** null when attendance was not requested. */
  readonly attendance: readonly AttendanceSliceInput[] | null;
  /** null when payroll was not requested. */
  readonly payroll: readonly PayrollPeriodInput[] | null;
  readonly identityLinks: readonly IdentityLinkInput[];
  readonly profileNames: Readonly<Record<string, string>>;
  /** Keyed `${organizationId}:${neonUserId}`. */
  readonly neonUsers: Readonly<
    Record<string, { fullName: string; role?: string }>
  >;
  readonly actorNames: Readonly<Record<string, string>>;
  /** Issues found while reading (truncation, source failures, authorization notes). */
  readonly issues: readonly ReportException[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────

const HOURS_TOLERANCE_SECONDS = 36; // 0.01 h — below this the two figures agree to the cent-of-an-hour

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}$${grouped}.${rest}`;
}

export function formatSeconds(seconds: number): string {
  return `${Number((seconds / 3600).toFixed(2))}h`;
}

function localDate(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").toUpperCase();
}

function negate(value: number): number {
  return value === 0 ? 0 : -value;
}

function paymentState(
  balanceCents: number,
  confirmedCents: number,
): PaymentState {
  if (balanceCents < 0) return "overpaid";
  if (balanceCents === 0) return "paid";
  return confirmedCents > 0 ? "partially_paid" : "unpaid";
}

function payrollMonthsFor(start: string, end: string): string[] {
  const months: string[] = [];
  const first = monthBounds(start)?.start;
  const last = monthBounds(end)?.start;
  if (!first || !last) return months;
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  let cursor: string = first;
  while (cursor <= last && months.length < 24) {
    months.push(cursor);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    cursor = `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return months;
}

function monthLabel(periodMonth: string): string {
  const b = monthBounds(periodMonth);
  return b ? formatReportPeriodLabel(b.start, b.end) : periodMonth;
}

function emptyTotals(): MutableTotals {
  return {
    employees: new Set<EmployeeKey>(),
    attendanceSeconds: 0,
    unresolvedShifts: 0,
    baseCents: 0,
    adjustmentEffectCents: 0,
    grossAfterAdjustmentsCents: 0,
    confirmedPaymentsCents: 0,
    balanceOwedCents: 0,
    overpaidCents: 0,
    draftPaymentsCents: 0,
    pendingPeriods: 0,
    payrollRecords: 0,
  };
}

interface MutableTotals {
  employees: Set<EmployeeKey>;
  attendanceSeconds: number;
  unresolvedShifts: number;
  baseCents: number;
  adjustmentEffectCents: number;
  grossAfterAdjustmentsCents: number;
  confirmedPaymentsCents: number;
  balanceOwedCents: number;
  overpaidCents: number;
  draftPaymentsCents: number;
  pendingPeriods: number;
  payrollRecords: number;
}

function freeze(t: MutableTotals): TotalsBlock {
  return { ...t, employees: t.employees.size };
}

function addEntry(t: MutableTotals, e: PayrollEntry): void {
  t.employees.add(e.employeeKey);
  t.draftPaymentsCents += e.draftPaymentsCents;
  if (!e.includedInTotals) return;
  t.baseCents += e.baseCents;
  t.adjustmentEffectCents += e.adjustmentEffectCents;
  t.grossAfterAdjustmentsCents += e.grossAfterAdjustmentsCents;
  t.confirmedPaymentsCents += e.confirmedPaymentsCents;
  t.balanceOwedCents += Math.max(0, e.balanceCents);
  t.overpaidCents += Math.max(0, negate(e.balanceCents));
  t.payrollRecords += 1;
  if (e.status === "draft") t.pendingPeriods += 1;
}

function addAttendance(t: MutableTotals, r: AttendanceDetailRow): void {
  t.employees.add(r.employeeKey);
  if (r.workedSeconds !== null) t.attendanceSeconds += r.workedSeconds;
  else t.unresolvedShifts += 1;
}

// ── Composition ─────────────────────────────────────────────────────────────────────────

export function composeCombinedReport(input: ComposeInput): CombinedReport {
  const { filters } = input;
  const orgById = new Map(input.organizations.map((o) => [o.id, o]));
  const branchKey = (orgId: string, locationId: string | null) =>
    `${orgId}|${locationId ?? "-"}`;
  const branchByKey = new Map<string, ReportBranchRef>();
  for (const b of input.branches) {
    branchByKey.set(branchKey(b.organizationId, b.id), b);
  }
  const orgName = (id: string) => orgById.get(id)?.name ?? "Organization";
  const branchName = (orgId: string, locationId: string | null) =>
    branchByKey.get(branchKey(orgId, locationId))?.name ??
    (locationId === null
      ? "Organization-level (no branch recorded)"
      : "Branch");
  const branchZone = (orgId: string, locationId: string | null) =>
    branchByKey.get(branchKey(orgId, locationId))?.timeZone ??
    input.branches.find((b) => b.organizationId === orgId)?.timeZone ??
    null;

  const linkByNeon = new Map<string, string>();
  for (const l of input.identityLinks) {
    linkByNeon.set(`${l.organizationId}:${l.neonUserId}`, l.profileId);
  }

  const employees = new Map<EmployeeKey, ReportEmployee>();
  function registerEmployee(e: {
    key: EmployeeKey;
    name: string;
    role?: string;
    verified: boolean;
    profileId: string | null;
    organizationId: string;
  }): void {
    const existing = employees.get(e.key);
    if (existing) {
      if (!existing.organizationIds.includes(e.organizationId)) {
        employees.set(e.key, {
          ...existing,
          role: existing.role ?? e.role,
          organizationIds: [...existing.organizationIds, e.organizationId],
        });
      }
      return;
    }
    employees.set(e.key, {
      key: e.key,
      displayName: e.name,
      role: e.role,
      identity: e.verified ? "verified" : "unmapped_external",
      profileId: e.profileId,
      organizationIds: [e.organizationId],
    });
  }

  function resolveNeon(
    organizationId: string,
    neonUserId: number,
    fallbackName: string,
    role?: string,
  ): { key: EmployeeKey; name: string } {
    const profileId = linkByNeon.get(`${organizationId}:${neonUserId}`) ?? null;
    const neonUser = input.neonUsers[`${organizationId}:${neonUserId}`];
    if (profileId) {
      const name =
        input.profileNames[profileId] ?? neonUser?.fullName ?? fallbackName;
      const key = profileKey(profileId);
      registerEmployee({
        key,
        name,
        role: role ?? neonUser?.role,
        verified: true,
        profileId,
        organizationId,
      });
      return { key, name };
    }
    const name = neonUser?.fullName ?? fallbackName;
    const key = neonKey(organizationId, neonUserId);
    registerEmployee({
      key,
      name,
      role: role ?? neonUser?.role,
      verified: false,
      profileId: null,
      organizationId,
    });
    return { key, name };
  }

  function resolveProfile(
    organizationId: string,
    profileId: string,
    fallbackName: string,
  ): { key: EmployeeKey; name: string } {
    const name = input.profileNames[profileId] ?? fallbackName;
    const key = profileKey(profileId);
    registerEmployee({
      key,
      name,
      verified: true,
      profileId,
      organizationId,
    });
    return { key, name };
  }

  // ── Attendance ────────────────────────────────────────────────────────────────────────
  const attendanceRows: AttendanceDetailRow[] = [];
  const attendanceSlices: AttendanceSliceSummary[] = [];

  for (const slice of input.attendance ?? []) {
    const rows: AttendanceDetailRow[] = [];
    for (const section of slice.report.sections) {
      const identity =
        slice.provider === "external_neon"
          ? resolveNeon(
              slice.organizationId,
              Number(section.employeeId),
              section.employeeName,
              section.employeeRole,
            )
          : resolveProfile(
              slice.organizationId,
              String(section.employeeId),
              section.employeeName,
            );
      for (const r of section.rows) {
        rows.push({
          id: r.id,
          employeeKey: identity.key,
          employeeName: identity.name,
          organizationId: slice.organizationId,
          organization: orgName(slice.organizationId),
          locationId: slice.locationId,
          branch: branchName(slice.organizationId, slice.locationId),
          provider: slice.provider,
          sourceLabel: r.attendanceSource,
          timeZone: r.timeZone,
          businessDate: r.businessDate,
          weekday: r.weekday,
          clockIn: r.clockIn,
          clockOut: r.clockOut,
          workedSeconds: r.workedSeconds,
          hoursStatus: r.hoursStatus,
          missingPunches: r.missingPunches,
          corrected: r.correctionIndicators.isCorrected,
          correctionCount: r.correctionIndicators.count,
        });
      }
    }
    attendanceRows.push(...rows);
    attendanceSlices.push({
      organizationId: slice.organizationId,
      locationId: slice.locationId,
      branch: branchName(slice.organizationId, slice.locationId),
      provider: slice.provider,
      sourceLabel: slice.report.attendanceSource,
      hoursBasis: slice.report.hoursBasis,
      isPartial: slice.report.isPartial,
      excludedVoidedCount: slice.report.excludedVoidedCount,
      countedSeconds: rows.reduce((s, r) => s + (r.workedSeconds ?? 0), 0),
      shifts: rows.length,
      unresolvedShifts: rows.filter((r) => r.workedSeconds === null).length,
      missingPunches: rows.filter((r) => r.missingPunches).length,
      correctedShifts: rows.filter((r) => r.corrected).length,
    });
  }
  attendanceRows.sort(
    (a, b) =>
      a.employeeName.localeCompare(b.employeeName) ||
      a.organization.localeCompare(b.organization) ||
      a.branch.localeCompare(b.branch) ||
      a.businessDate.localeCompare(b.businessDate) ||
      (a.clockIn ?? "").localeCompare(b.clockIn ?? "") ||
      a.id.localeCompare(b.id),
  );

  // ── Payroll ───────────────────────────────────────────────────────────────────────────
  interface Prepared {
    input: PayrollPeriodInput;
    key: EmployeeKey;
    name: string;
  }
  const prepared: Prepared[] = [];
  const seenExact = new Set<string>();
  for (const p of input.payroll ?? []) {
    const exact = `${p.source}|${p.periodId}`;
    if (seenExact.has(exact)) continue; // the very same record twice is not a conflict
    seenExact.add(exact);
    const identity =
      p.source === "internal_the_lineup" && p.profileId
        ? resolveProfile(p.organizationId, p.profileId, "Employee")
        : p.neonUserId !== null
          ? resolveNeon(
              p.organizationId,
              p.neonUserId,
              `Employee #${p.neonUserId}`,
            )
          : { key: `unknown:${p.periodId}` as EmployeeKey, name: "Employee" };
    prepared.push({ input: p, key: identity.key, name: identity.name });
  }

  const groups = new Map<string, Prepared[]>();
  for (const p of prepared) {
    const gk = `${p.input.organizationId}|${p.key}|${p.input.periodMonth}`;
    const list = groups.get(gk) ?? [];
    list.push(p);
    groups.set(gk, list);
  }
  const conflicted = new Set<Prepared>();
  const conflictExceptions: ReportException[] = [];
  for (const list of groups.values()) {
    if (list.length > 1) {
      for (const p of list) conflicted.add(p);
      conflictExceptions.push({
        code: "payroll_source_conflict",
        severity: "warning",
        message: `${list[0].name} has ${list.length} payroll records for ${monthLabel(list[0].input.periodMonth)} in ${orgName(list[0].input.organizationId)} from different sources. All are shown; none is counted in any total until the duplicate is resolved.`,
        organizationId: list[0].input.organizationId,
        employeeKey: list[0].key,
        count: list.length,
      });
    }
  }

  const payrollEntries: PayrollEntry[] = prepared.map((p) => {
    const i = p.input;
    const confirmed = i.payments
      .filter((x) => x.status === "confirmed")
      .reduce((s, x) => s + x.amountCents, 0);
    const draft = i.payments
      .filter((x) => x.status === "draft")
      .reduce((s, x) => s + x.amountCents, 0);
    const delta = i.adjustments.reduce((s, x) => s + x.deltaCents, 0);
    const balance = computeBalanceCents({
      grossCents: i.grossCents,
      confirmedPaymentsCents: confirmed,
      adjustmentsCents: delta,
    });
    return {
      periodId: i.periodId,
      source: i.source,
      sourceRef: `${i.source === "external_neon" ? "neon" : "native"}-period-${i.periodId}`,
      organizationId: i.organizationId,
      locationId: i.locationId,
      employeeKey: p.key,
      employeeName: p.name,
      periodMonth: i.periodMonth,
      status: i.status,
      hoursSnapshot: i.hoursSnapshot,
      rateCents: i.rateCents,
      baseCents: i.grossCents,
      adjustmentDeltaCents: delta,
      adjustmentEffectCents: negate(delta),
      grossAfterAdjustmentsCents: i.grossCents + negate(delta),
      confirmedPaymentsCents: confirmed,
      draftPaymentsCents: draft,
      balanceCents: balance,
      paymentState: paymentState(balance, confirmed),
      payments: [...i.payments].sort(
        (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id,
      ),
      adjustments: [...i.adjustments].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
      ),
      includedInTotals: !conflicted.has(p),
      currency: REPORT_CURRENCY,
    };
  });
  payrollEntries.sort(
    (a, b) =>
      orgName(a.organizationId).localeCompare(orgName(b.organizationId)) ||
      branchName(a.organizationId, a.locationId).localeCompare(
        branchName(b.organizationId, b.locationId),
      ) ||
      a.employeeName.localeCompare(b.employeeName) ||
      a.periodMonth.localeCompare(b.periodMonth) ||
      a.periodId - b.periodId,
  );

  // ── Register (payroll rows + attendance-only rows) ────────────────────────────────────
  const consumed = new Set<string>();
  const register: RegisterRow[] = [];
  const attendanceRequested = input.attendance !== null;

  for (const e of payrollEntries) {
    let seconds: number | null = null;
    let unresolved = 0;
    if (attendanceRequested) {
      seconds = 0;
      for (const r of attendanceRows) {
        if (
          r.employeeKey === e.employeeKey &&
          r.organizationId === e.organizationId &&
          (e.locationId === null || r.locationId === e.locationId) &&
          r.businessDate.startsWith(e.periodMonth.slice(0, 7))
        ) {
          consumed.add(r.id);
          if (r.workedSeconds !== null) seconds += r.workedSeconds;
          else unresolved += 1;
        }
      }
    }
    register.push({
      key: `pay-${e.sourceRef}`,
      employeeKey: e.employeeKey,
      employeeName: e.employeeName,
      organizationId: e.organizationId,
      organization: orgName(e.organizationId),
      locationId: e.locationId,
      branch: branchName(e.organizationId, e.locationId),
      payrollPeriodMonth: e.periodMonth,
      attendanceSeconds: seconds,
      unresolvedShifts: unresolved,
      baseCents: e.baseCents,
      adjustmentEffectCents: e.adjustmentEffectCents,
      grossAfterAdjustmentsCents: e.grossAfterAdjustmentsCents,
      confirmedPaymentsCents: e.confirmedPaymentsCents,
      balanceCents: e.balanceCents,
      financialStatus: !e.includedInTotals
        ? "Excluded — source conflict"
        : e.status === "draft"
          ? "Draft"
          : e.paymentState === "paid"
            ? "Locked — paid"
            : e.paymentState === "overpaid"
              ? "Locked — overpaid"
              : e.paymentState === "partially_paid"
                ? "Locked — partially paid"
                : "Locked — unpaid",
      source: e.source,
      includedInTotals: e.includedInTotals,
    });
  }

  if (attendanceRequested) {
    const orphan = new Map<string, RegisterRow>();
    for (const r of attendanceRows) {
      if (consumed.has(r.id)) continue;
      const month = `${r.businessDate.slice(0, 7)}-01`;
      const k = `${r.employeeKey}|${r.organizationId}|${r.locationId ?? "-"}|${month}`;
      const prev = orphan.get(k);
      const add = r.workedSeconds ?? 0;
      const un = r.workedSeconds === null ? 1 : 0;
      orphan.set(k, {
        key: `att-${k}`,
        employeeKey: r.employeeKey,
        employeeName: r.employeeName,
        organizationId: r.organizationId,
        organization: r.organization,
        locationId: r.locationId,
        branch: r.branch,
        payrollPeriodMonth: null,
        attendanceSeconds: (prev?.attendanceSeconds ?? 0) + add,
        unresolvedShifts: (prev?.unresolvedShifts ?? 0) + un,
        baseCents: null,
        adjustmentEffectCents: null,
        grossAfterAdjustmentsCents: null,
        confirmedPaymentsCents: null,
        balanceCents: null,
        financialStatus: "No payroll record",
        source: r.provider,
        includedInTotals: true,
      });
    }
    register.push(...orphan.values());
  }
  register.sort(
    (a, b) =>
      a.organization.localeCompare(b.organization) ||
      a.branch.localeCompare(b.branch) ||
      a.employeeName.localeCompare(b.employeeName) ||
      (a.payrollPeriodMonth ?? "").localeCompare(b.payrollPeriodMonth ?? "") ||
      a.key.localeCompare(b.key),
  );

  // ── Ledger ────────────────────────────────────────────────────────────────────────────
  const ledger: LedgerEntry[] = [];
  for (const e of payrollEntries) {
    const zone = branchZone(e.organizationId, e.locationId);
    const events = [
      ...e.payments.map((p) => ({
        sortDate: p.paymentDate,
        order: 1,
        id: p.id,
        kind: "payment" as const,
        ref: `PAY-${p.id}`,
        amountCents: p.amountCents,
        effect: p.status === "confirmed" ? negate(p.amountCents) : 0,
        eventDate: p.paymentDate,
        status: p.status === "confirmed" ? "Confirmed" : "Draft (not counted)",
        description: p.reversesPaymentId
          ? `Payment reversal of PAY-${p.reversesPaymentId}${p.comment ? ` — ${p.comment}` : ""}`
          : `Payment${p.comment ? ` — ${p.comment}` : ""}`,
        actor: p.confirmedBy ?? p.createdBy,
      })),
      ...e.adjustments.map((a) => {
        const date = localDate(a.createdAt, zone);
        return {
          sortDate: date,
          order: 0,
          id: a.id,
          kind: "adjustment" as const,
          ref: `ADJ-${a.id}`,
          amountCents: a.deltaCents,
          effect: negate(a.deltaCents),
          eventDate: date,
          status: "Recorded",
          description: `Adjustment — ${a.reason}`,
          actor: a.createdBy,
        };
      }),
    ].sort(
      (a, b) =>
        a.sortDate.localeCompare(b.sortDate) ||
        a.order - b.order ||
        a.id - b.id,
    );
    let running = e.baseCents;
    for (const ev of events) {
      running += ev.effect;
      ledger.push({
        ref: ev.ref,
        kind: ev.kind,
        employeeKey: e.employeeKey,
        employeeName: e.employeeName,
        organizationId: e.organizationId,
        organization: orgName(e.organizationId),
        locationId: e.locationId,
        branch: branchName(e.organizationId, e.locationId),
        periodMonth: e.periodMonth,
        effectCents: ev.effect,
        amountCents: ev.amountCents,
        eventDate: ev.eventDate,
        status: ev.status,
        description: ev.description,
        actor: ev.actor ? (input.actorNames[ev.actor] ?? null) : null,
        remainingBalanceCents: running,
        includedInTotals: e.includedInTotals,
      });
    }
  }
  ledger.sort(
    (a, b) =>
      a.organization.localeCompare(b.organization) ||
      a.branch.localeCompare(b.branch) ||
      a.employeeName.localeCompare(b.employeeName) ||
      a.periodMonth.localeCompare(b.periodMonth) ||
      a.eventDate.localeCompare(b.eventDate) ||
      a.ref.localeCompare(b.ref),
  );

  // ── Totals ────────────────────────────────────────────────────────────────────────────
  const overall = emptyTotals();
  const byOrg = new Map<string, MutableTotals>();
  const byBranch = new Map<string, MutableTotals>();
  const orgBucket = (id: string) => {
    let t = byOrg.get(id);
    if (!t) byOrg.set(id, (t = emptyTotals()));
    return t;
  };
  const branchBucket = (orgId: string, locationId: string | null) => {
    const k = branchKey(orgId, locationId);
    let t = byBranch.get(k);
    if (!t) byBranch.set(k, (t = emptyTotals()));
    return t;
  };
  for (const r of attendanceRows) {
    addAttendance(overall, r);
    addAttendance(orgBucket(r.organizationId), r);
    addAttendance(branchBucket(r.organizationId, r.locationId), r);
  }
  for (const e of payrollEntries) {
    addEntry(overall, e);
    addEntry(orgBucket(e.organizationId), e);
    addEntry(branchBucket(e.organizationId, e.locationId), e);
  }

  const scoped = (
    map: Map<string, MutableTotals>,
    withBranch: boolean,
  ): ScopedTotals[] =>
    [...map.entries()]
      .map(([k, t]) => {
        const [orgId, loc] = k.split("|");
        const locationId = withBranch ? (loc === "-" ? null : loc) : null;
        return {
          ...freeze(t),
          organizationId: orgId,
          organization: orgName(orgId),
          locationId,
          branch: withBranch ? branchName(orgId, locationId) : null,
        };
      })
      .sort(
        (a, b) =>
          a.organization.localeCompare(b.organization) ||
          (a.branch ?? "").localeCompare(b.branch ?? ""),
      );

  // ── Exceptions ────────────────────────────────────────────────────────────────────────
  const exceptions: ReportException[] = [
    ...input.issues,
    ...conflictExceptions,
  ];

  for (const emp of employees.values()) {
    if (emp.identity === "unmapped_external") {
      exceptions.push({
        code: "unmapped_identity",
        severity: "warning",
        message: `${emp.displayName} is from the external time clock and is not linked to a verified employee. Their records are kept separate and are not combined with any other source.`,
        employeeKey: emp.key,
        organizationId: emp.organizationIds[0],
      });
    }
  }
  for (const s of attendanceSlices) {
    if (s.isPartial) {
      exceptions.push({
        code: "attendance_truncated",
        severity: "blocking",
        message: `Attendance for ${orgName(s.organizationId)} · ${s.branch} has more records than can be loaded. Its hours are incomplete and must not be used as a statement.`,
        organizationId: s.organizationId,
        locationId: s.locationId,
      });
    }
    if (s.unresolvedShifts > 0) {
      exceptions.push({
        code: "unresolved_hours",
        severity: "warning",
        message: `${s.unresolvedShifts} shift(s) at ${orgName(s.organizationId)} · ${s.branch} have no countable hours (open, or break pay unresolved). They are listed, not counted.`,
        organizationId: s.organizationId,
        locationId: s.locationId,
        count: s.unresolvedShifts,
      });
    }
    if (s.missingPunches > 0) {
      exceptions.push({
        code: "missing_punches",
        severity: "info",
        message: `${s.missingPunches} shift(s) at ${orgName(s.organizationId)} · ${s.branch} have a missing or open punch.`,
        organizationId: s.organizationId,
        locationId: s.locationId,
        count: s.missingPunches,
      });
    }
    if (s.excludedVoidedCount > 0) {
      exceptions.push({
        code: "voided_excluded",
        severity: "info",
        message: `${s.excludedVoidedCount} voided shift(s) at ${orgName(s.organizationId)} · ${s.branch} are excluded.`,
        organizationId: s.organizationId,
        locationId: s.locationId,
        count: s.excludedVoidedCount,
      });
    }
  }

  const rangeStart = filters.startDate;
  const rangeEnd = filters.endDate;
  for (const e of payrollEntries) {
    const bounds = monthBounds(e.periodMonth);
    const covers =
      !!bounds && rangeStart <= bounds.start && rangeEnd >= bounds.end;
    if (attendanceRequested && covers) {
      const slicesPartial = attendanceSlices.some(
        (s) => s.isPartial && s.organizationId === e.organizationId,
      );
      if (!slicesPartial) {
        const row = register.find((r) => r.key === `pay-${e.sourceRef}`);
        const seconds = row?.attendanceSeconds ?? 0;
        const snapshotSeconds = Math.round(e.hoursSnapshot * 3600);
        if (Math.abs(snapshotSeconds - seconds) > HOURS_TOLERANCE_SECONDS) {
          exceptions.push({
            code: "payroll_hours_differ",
            severity: "warning",
            message: `${e.employeeName} · ${monthLabel(e.periodMonth)}: the payroll snapshot recorded ${formatSeconds(snapshotSeconds)} but attendance now shows ${formatSeconds(seconds)}. Both are reported as stored; nothing was recalculated.`,
            organizationId: e.organizationId,
            locationId: e.locationId,
            employeeKey: e.employeeKey,
          });
        }
      }
    } else if (filters.content !== "attendance" && !covers) {
      exceptions.push({
        code: "partial_payroll_month",
        severity: "info",
        message: `${e.employeeName} · ${monthLabel(e.periodMonth)}: the report dates cover only part of this payroll month; the payroll snapshot is always for the whole month.`,
        organizationId: e.organizationId,
        employeeKey: e.employeeKey,
      });
    }
    if (e.locationId === null) {
      exceptions.push({
        code: "no_branch_provenance",
        severity: "info",
        message: `${e.employeeName} · ${monthLabel(e.periodMonth)}: this payroll record carries no branch, so it is shown at organization level.`,
        organizationId: e.organizationId,
        employeeKey: e.employeeKey,
      });
    }
  }
  const draftPeriods = payrollEntries.filter(
    (e) => e.status === "draft",
  ).length;
  if (draftPeriods > 0) {
    exceptions.push({
      code: "pending_payroll",
      severity: "info",
      message: `${draftPeriods} payroll record(s) are still Draft (not locked).`,
      count: draftPeriods,
    });
  }
  const draftPayments = payrollEntries.reduce(
    (n, e) => n + e.payments.filter((p) => p.status === "draft").length,
    0,
  );
  if (draftPayments > 0) {
    exceptions.push({
      code: "draft_payments",
      severity: "info",
      message: `${draftPayments} payment(s) are Draft (unconfirmed). They are listed but not counted as paid.`,
      count: draftPayments,
    });
  }
  const crossOrganization = input.organizations.length > 1;
  if (crossOrganization) {
    exceptions.push({
      code: "cross_organization",
      severity: "info",
      message: INFORMATIONAL_AGGREGATE_NOTE,
    });
  }

  // ── Completeness ──────────────────────────────────────────────────────────────────────
  const reasons = exceptions
    .filter(
      (x) =>
        x.severity === "blocking" ||
        x.code === "payroll_source_conflict" ||
        x.code === "source_unavailable" ||
        x.code === "payroll_truncated",
    )
    .map((x) => x.message);

  const employeeList = [...employees.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  const verified = employeeList.filter((e) => e.identity === "verified").length;
  const unmapped = employeeList.length - verified;

  const periodKind = classifyReportPeriod(filters.startDate, filters.endDate);
  const payrollMonths = payrollMonthsFor(filters.startDate, filters.endDate);
  const period = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    label: formatReportPeriodLabel(filters.startDate, filters.endDate),
    kind: periodKind,
    payrollMonths,
    payrollLabel: payrollMonths.map(monthLabel).join(", "),
  };

  const included = [
    ...new Set([
      ...attendanceRows.map((r) => r.organizationId),
      ...payrollEntries.map((e) => e.organizationId),
    ]),
  ];
  const includedBranchKeys = new Set([
    ...attendanceRows.map((r) => branchKey(r.organizationId, r.locationId)),
    ...payrollEntries.map((e) => branchKey(e.organizationId, e.locationId)),
  ]);

  const summary: ExecutiveSummary = {
    ...freeze(overall),
    employees: employeeList.length,
    verifiedEmployees: verified,
    unmappedIdentities: unmapped,
    organizationCount: included.length,
    branchCount: includedBranchKeys.size,
    exceptionCount: exceptions.filter((x) => x.severity !== "info").length,
    informationalAggregate: crossOrganization,
  };

  const title =
    filters.content === "attendance"
      ? "Attendance Report"
      : filters.content === "payroll"
        ? "Payroll Report"
        : "Combined Attendance & Payroll Report";
  const reference = `RPT-${filters.startDate.replace(/-/g, "")}-${fnv1a(
    JSON.stringify([
      filters,
      included.sort(),
      [...includedBranchKeys].sort(),
      input.generatedAt,
    ]),
  )}`;

  return {
    reference,
    generatedAt: input.generatedAt,
    title,
    content: filters.content,
    output: filters.output,
    period,
    organizations:
      included.length === 0
        ? input.organizations
        : input.organizations.filter((o) => included.includes(o.id)),
    branches: input.branches,
    employees: employeeList,
    attendanceSlices,
    attendanceRows,
    payrollEntries,
    register,
    ledger,
    summary,
    byOrganization: scoped(byOrg, false),
    byBranch: scoped(byBranch, true),
    exceptions,
    completeness: { complete: reasons.length === 0, reasons },
    confidentiality: REPORT_CONFIDENTIALITY_LABEL,
  };
}
