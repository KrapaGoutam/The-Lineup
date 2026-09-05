export type AppRole = "owner" | "manager" | "server";

/**
 * Feature 014: an organizational label, separate from `AppRole`. Owner,
 * manager, and assistant_manager all resolve to the SAME `AppRole`
 * ("manager") via `designationToRole` below -- they carry identical
 * capabilities. Designation exists so the Team tab can show and manage
 * the finer distinction the real schema already has
 * (owner/general_manager/shift_manager), without adding a fourth
 * permission tier that nothing else in the app needs.
 */
export type Designation = "owner" | "manager" | "assistant_manager" | "staff";

export type Capability =
  | "schedule:manage"
  | "schedule:view-team"
  | "allocation:manage"
  | "allocation:write-any"
  | "tips:manage"
  | "tips:view-own"
  | "settings:manage";

const roleCapabilities: Record<AppRole, ReadonlySet<Capability>> = {
  owner: new Set([
    "schedule:manage",
    "schedule:view-team",
    "allocation:manage",
    "allocation:write-any",
    "tips:manage",
    "tips:view-own",
    "settings:manage",
  ]),
  manager: new Set([
    "schedule:manage",
    "schedule:view-team",
    "allocation:manage",
    "allocation:write-any",
    "tips:manage",
    "tips:view-own",
  ]),
  server: new Set([
    "schedule:view-team",
    "allocation:write-any",
    "tips:view-own",
  ]),
};

export function isValidPasscode(passcode: string) {
  return /^\d{4}$/.test(passcode);
}

export function can(role: AppRole, capability: Capability) {
  return roleCapabilities[role].has(capability);
}

export function normalizeDatabaseRole(roles: string[]): AppRole {
  if (roles.includes("owner")) return "owner";
  if (roles.includes("general_manager") || roles.includes("shift_manager"))
    return "manager";
  return "server";
}

/**
 * The real-mode equivalent of `normalizeDatabaseRole`, at the finer
 * 4-value designation grain: general_manager -> "manager",
 * shift_manager -> "assistant_manager" (both already get identical
 * operational RLS grants in the real schema -- see
 * supabase/migrations/20260905065702_initial_schema.sql -- this only
 * relabels them). `host` has no current app flow that creates one; it
 * falls into "staff" alongside `server`, same as `normalizeDatabaseRole`
 * already folds it into "server".
 */
export function designationForRoles(roles: string[]): Designation {
  if (roles.includes("owner")) return "owner";
  if (roles.includes("general_manager")) return "manager";
  if (roles.includes("shift_manager")) return "assistant_manager";
  return "staff";
}

/**
 * The one place a designation maps down to the 3-value `AppRole` every
 * capability check (`can()`, `user.role !== "server"` gates throughout
 * the app) actually reads. Owner, manager, and assistant_manager all
 * resolve to "manager" -- identical capabilities, per Feature 014's
 * explicit requirement that all three get full permissions.
 */
export function designationToRole(designation: Designation): AppRole {
  if (designation === "owner") return "owner";
  if (designation === "staff") return "server";
  return "manager";
}
