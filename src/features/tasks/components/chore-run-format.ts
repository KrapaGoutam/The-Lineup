import { formatBusinessTime } from "@/lib/date-time";

/** "Nov 20, 2026" for a location-local business date (no time zone shift: it is already a calendar day). */
export function formatBusinessDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Nov 20 · 4:12 PM" for an instant, in the location's time zone. */
export function formatRunStamp(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
  return `${day} · ${formatBusinessTime(iso, timeZone)}`;
}
