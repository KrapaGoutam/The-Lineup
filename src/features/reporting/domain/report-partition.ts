/**
 * V2.0.7 — "separate reports grouped by organization or branch".
 *
 * Splitting happens on the COMPOSE INPUT, before totals exist, so every sub-report has its
 * own correctly computed totals, exceptions and completeness. A sub-report is never a
 * re-labelled slice of another report's totals.
 */

import type { ComposeInput } from "./report-composer";
import type { ReportException, ReportOutputMode } from "./report-types";

function groupKey(
  mode: ReportOutputMode,
  organizationId: string,
  locationId: string | null,
): string {
  return mode === "by_branch"
    ? `${organizationId}|${locationId ?? "-"}`
    : organizationId;
}

export function partitionComposeInput(
  input: ComposeInput,
  mode: ReportOutputMode,
): ComposeInput[] {
  if (mode === "combined") return [input];

  const groups = new Map<
    string,
    { organizationId: string; locationId: string | null }
  >();
  for (const s of input.attendance ?? []) {
    groups.set(groupKey(mode, s.organizationId, s.locationId), {
      organizationId: s.organizationId,
      locationId: s.locationId,
    });
  }
  for (const p of input.payroll ?? []) {
    groups.set(groupKey(mode, p.organizationId, p.locationId), {
      organizationId: p.organizationId,
      locationId: p.locationId,
    });
  }
  // A selected organization or branch that has NO rows but did report a problem (a failed
  // or truncated read, an authorization note) still gets its own report, so the problem is
  // never silently absent from every sub-report.
  for (const x of input.issues) {
    if (x.severity === "info" || !x.organizationId) continue;
    const locationId =
      mode === "by_branch"
        ? x.locationId === undefined
          ? null
          : x.locationId
        : null;
    const key = groupKey(mode, x.organizationId, locationId);
    if (!groups.has(key)) {
      groups.set(key, { organizationId: x.organizationId, locationId });
    }
  }
  if (groups.size === 0) return [input]; // nothing to split: one honest, empty report

  const orgName = (id: string) =>
    input.organizations.find((o) => o.id === id)?.name ?? "";
  const branchName = (orgId: string, loc: string | null) =>
    input.branches.find((b) => b.organizationId === orgId && b.id === loc)
      ?.name ?? "";

  const ordered = [...groups.entries()].sort(
    ([, a], [, b]) =>
      orgName(a.organizationId).localeCompare(orgName(b.organizationId)) ||
      branchName(a.organizationId, a.locationId).localeCompare(
        branchName(b.organizationId, b.locationId),
      ),
  );

  return ordered.map(([key, g]) => {
    const inGroup = (orgId: string, loc: string | null) =>
      groupKey(mode, orgId, loc) === key;
    const issues: ReportException[] = input.issues.filter((x) => {
      if (!x.organizationId) return true; // global read notes apply to every report
      if (x.organizationId !== g.organizationId) return false;
      if (mode === "by_branch" && x.locationId !== undefined) {
        return x.locationId === g.locationId;
      }
      return true;
    });
    return {
      ...input,
      organizations: input.organizations.filter(
        (o) => o.id === g.organizationId,
      ),
      branches: input.branches.filter(
        (b) =>
          b.organizationId === g.organizationId &&
          (mode === "by_organization" || b.id === g.locationId),
      ),
      attendance:
        input.attendance === null
          ? null
          : input.attendance.filter((s) =>
              inGroup(s.organizationId, s.locationId),
            ),
      payroll:
        input.payroll === null
          ? null
          : input.payroll.filter((p) =>
              inGroup(p.organizationId, p.locationId),
            ),
      issues,
    };
  });
}
