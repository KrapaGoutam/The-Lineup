/**
 * Contextual links into the Reporting Center (from Attendance and Payroll) and the parsing
 * of them. A link only PRE-FILLS the builder; it carries no authority. Every id in it is
 * intersected with what the server offered, and the server verifies the final request
 * again, so a hand-edited link can never reach another organization, branch or employee.
 */

import type { ReportViewKey } from "./report-views";

export const REPORTING_PATH = "/reporting";

export interface ReportingLinkParams {
  readonly view?: ReportViewKey;
  readonly organizationIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly employeeKeys?: readonly string[];
  readonly startDate?: string;
  readonly endDate?: string;
}

const VIEWS: readonly ReportViewKey[] = [
  "combined",
  "attendance",
  "payroll",
  "ledger",
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-zA-Z:_-]{1,120}$/;
const MAX_IDS = 50;

export function buildReportingHref(params: ReportingLinkParams = {}): string {
  const q = new URLSearchParams();
  if (params.view && params.view !== "combined") q.set("view", params.view);
  if (params.organizationIds?.length)
    q.set("org", params.organizationIds.join(","));
  if (params.locationIds?.length)
    q.set("location", params.locationIds.join(","));
  if (params.employeeKeys?.length)
    q.set("employee", params.employeeKeys.join(","));
  if (params.startDate && DATE.test(params.startDate))
    q.set("from", params.startDate);
  if (params.endDate && DATE.test(params.endDate)) q.set("to", params.endDate);
  const s = q.toString();
  return s ? `${REPORTING_PATH}?${s}` : REPORTING_PATH;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] {
  const raw = first(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID.test(s))
    .slice(0, MAX_IDS);
}

/** Untrusted query string → pre-fill values (shape-checked only). */
export function parseReportingSearchParams(
  sp: Record<string, string | string[] | undefined>,
): ReportingLinkParams {
  const view = first(sp.view);
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    view: VIEWS.find((v) => v === view),
    organizationIds: list(sp.org),
    locationIds: list(sp.location),
    employeeKeys: list(sp.employee),
    startDate: from && DATE.test(from) ? from : undefined,
    endDate: to && DATE.test(to) ? to : undefined,
  };
}
