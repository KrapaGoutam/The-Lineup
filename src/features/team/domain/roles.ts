import type { AppRole } from "@/features/auth/domain/passcode";

/**
 * Demo-mode role-promotion rule for the Team tab (Feature 005). Mirrors the
 * spirit of the real `memberships_update_manager` RLS policy — owner is
 * unrestricted, a manager cannot touch an owner — but the app's simplified
 * three-role model (owner/manager/server) is coarser than the database's
 * five-role model (owner/general_manager/shift_manager/host/server). This
 * demo approximation folds general_manager and shift_manager into one
 * "manager" bucket; real-mode implementation must use the actual RLS-backed
 * roles, not this simplification.
 */
export function canChangeRole(input: {
  actorRole: AppRole;
  targetCurrentRole: AppRole;
}): boolean {
  if (input.actorRole === "server") return false;
  if (input.actorRole === "owner") return true;
  // A manager can promote/demote between manager and server, but never
  // touch an owner's role.
  return input.targetCurrentRole !== "owner";
}

export function otherAssignableRole(
  role: AppRole,
): "manager" | "server" | null {
  if (role === "server") return "manager";
  if (role === "manager") return "server";
  return null;
}
