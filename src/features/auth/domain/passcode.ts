export type AppRole = "owner" | "manager" | "server";

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
