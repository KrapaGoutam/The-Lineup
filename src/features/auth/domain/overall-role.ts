/**
 * V2-001.001 Overall Roles Foundation.
 * System-wide roles applying across all organizations and locations.
 */

export type OverallRole = "owner" | "manager" | "assistant_manager";

export const OVERALL_ROLES: readonly OverallRole[] = [
  "owner",
  "manager",
  "assistant_manager",
] as const;

export const OVERALL_ROLE_LABELS: Readonly<Record<OverallRole, string>> = {
  owner: "Overall Owner",
  manager: "Overall Manager",
  assistant_manager: "Overall Assistant Manager",
} as const;

/**
 * Type guard for OverallRole.
 */
export function isOverallRole(value: unknown): value is OverallRole {
  return (
    typeof value === "string" &&
    (OVERALL_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Normalizes input strings (including UI display forms and legacy aliases)
 * to canonical OverallRole or returns null if invalid.
 */
export function normalizeOverallRole(value: unknown): OverallRole | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "owner":
    case "overall_owner":
      return "owner";
    case "manager":
    case "overall_manager":
      return "manager";
    case "assistant_manager":
    case "overall_assistant_manager":
      return "assistant_manager";
    default:
      return null;
  }
}

/**
 * Returns human-readable UI label for an overall role.
 */
export function labelForOverallRole(
  role: OverallRole | null | undefined,
): string | null {
  if (!role || !isOverallRole(role)) return null;
  return OVERALL_ROLE_LABELS[role];
}
