/** Calendar values deliberately never pass through the browser's local zone. */
export type DatePrecision = "day" | "month";
export type InventoryDate = { date: string; precision: DatePrecision };
export type DateLot = {
  id: string;
  productId: string;
  quantity: number | null;
  manufacture: InventoryDate | null;
  expiration: InventoryDate | null;
  notes: string | null;
  active: boolean;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
};
export type FreshnessRule = {
  id: string;
  subcategoryId: string;
  trackingEnabled: boolean;
  maximumMonths: number;
  warningMonths: number;
  active: boolean;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
};
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const monthDays = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** YY is explicitly 2000–2099, never a moving-century heuristic. */
export function parseInventoryDate(
  input: string,
  kind: "manufacture" | "expiration",
): InventoryDate | null {
  const value = input.trim();
  if (!value) return null;
  const match = /^(\d{1,2})\/(?:(\d{1,2})\/)?(\d{2}|\d{4})$/.exec(value);
  if (!match) throw new Error("Use MM/DD/YY, MM/DD/YYYY, MM/YY or MM/YYYY.");
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const month = Number(match[1]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12)
    throw new Error("Enter a valid four-digit year, or YY for 2000–2099.");
  const day = match[2]
    ? Number(match[2])
    : kind === "expiration"
      ? monthDays(year, month)
      : 1;
  if (day < 1 || day > monthDays(year, month))
    throw new Error("That day does not exist in this month.");
  return { date: iso(year, month, day), precision: match[2] ? "day" : "month" };
}
export function displayInventoryDate(value: InventoryDate | null): string {
  if (!value) return "—";
  const [year, month, day] = value.date.split("-");
  const displayYear = year.startsWith("20") ? year.slice(2) : year;
  return value.precision === "month"
    ? `${month}/${displayYear}`
    : `${month}/${day}/${displayYear}`;
}
export function businessDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function calendarDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}
export function addCalendarMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  return iso(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    Math.min(day, monthDays(target.getUTCFullYear(), target.getUTCMonth() + 1)),
  );
}
export type ExpirationStatus =
  | "expired"
  | "today"
  | "urgent"
  | "warning"
  | "soon"
  | "normal"
  | "missing";
export type ManufactureStatus =
  | "fresh"
  | "aging"
  | "limit"
  | "no_rule"
  | "missing";
export function expirationStatus(
  date: InventoryDate | null,
  today: string,
): {
  status: ExpirationStatus;
  days: number | null;
  rank: number;
  text: string;
} {
  if (!date)
    return {
      status: "missing",
      days: null,
      rank: 6,
      text: "No expiration entered",
    };
  const days = calendarDays(today, date.date);
  const status =
    days < 0
      ? "expired"
      : days === 0
        ? "today"
        : days <= 7
          ? "urgent"
          : days <= 15
            ? "warning"
            : days <= 30
              ? "soon"
              : "normal";
  const detail =
    days < 0
      ? `Expired ${-days} days ago`
      : days === 0
        ? "Expires today"
        : `Expires in ${days} days`;
  const label = {
    expired: "Critical",
    today: "Critical",
    urgent: "Urgent",
    warning: "Warning",
    soon: "Expiring Soon",
    normal: "Normal",
  }[status];
  return {
    status,
    days,
    rank: ["expired", "today", "urgent", "warning", "soon", "normal"].indexOf(
      status,
    ),
    text: `${detail} · ${label}`,
  };
}
export function manufactureStatus(
  date: InventoryDate | null,
  rule: FreshnessRule | null,
  today: string,
): ManufactureStatus {
  const applicable = rule?.active && rule.trackingEnabled;
  if (!date) return "missing";
  if (!applicable) return "no_rule";
  if (today >= addCalendarMonths(date.date, rule.maximumMonths)) return "limit";
  if (
    today >=
    addCalendarMonths(date.date, rule.maximumMonths - rule.warningMonths)
  )
    return "aging";
  return "fresh";
}
export const MANUFACTURE_LABELS: Record<ManufactureStatus, string> = {
  fresh: "Fresh",
  aging: "Aging Soon",
  limit: "Freshness Limit",
  no_rule: "No Rule",
  missing: "No Manufacture Date",
};
export function dateSummary(
  lots: readonly DateLot[],
  rule: FreshnessRule | null,
  today: string,
  total: number,
  archived = false,
) {
  const active = archived ? [] : lots.filter((l) => l.active);
  const expires = active
    .filter((l) => l.expiration)
    .toSorted((a, b) => a.expiration!.date.localeCompare(b.expiration!.date));
  const manufactured = active
    .filter((l) => l.manufacture)
    .toSorted((a, b) => a.manufacture!.date.localeCompare(b.manufacture!.date));
  const expiration = expirationStatus(expires[0]?.expiration ?? null, today);
  const manufacture = manufactureStatus(
    manufactured[0]?.manufacture ?? null,
    rule,
    today,
  );
  const datedQuantity =
    Math.round(active.reduce((sum, l) => sum + (l.quantity ?? 0), 0) * 100) /
    100;
  return {
    lots: active,
    hasRule: !!(rule?.active && rule.trackingEnabled),
    nearest: expires[0] ?? null,
    oldest: manufactured[0] ?? null,
    expiration,
    manufacture,
    datedQuantity,
    withoutDate: Math.max(0, Math.round((total - datedQuantity) * 100) / 100),
    excess: Math.max(0, Math.round((datedQuantity - total) * 100) / 100),
    unknownQuantity: active.filter((l) => l.quantity === null).length,
    rank: Math.min(
      expiration.rank,
      manufacture === "limit" ? 2.5 : manufacture === "aging" ? 4.5 : 6,
    ),
  };
}
