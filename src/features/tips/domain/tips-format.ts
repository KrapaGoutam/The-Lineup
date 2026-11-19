import type { TeamMember } from "@/lib/demo-data";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(cents: number): string {
  return currency.format(cents / 100);
}

/** Name lookup that never shows a raw id: unknown people are "Former team member". */
export function nameResolver(
  team: readonly TeamMember[],
): (profileId: string) => string {
  const byId = new Map(team.map((member) => [member.id, member.name]));
  return (profileId) => byId.get(profileId) ?? "Former team member";
}

/** Blank is $0.00; anything else must be a plain dollar amount with at most two decimals. */
export function parseMoneyInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
    throw new Error("Enter a valid dollar amount with at most two decimals.");
  }
  const [whole, decimal = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
