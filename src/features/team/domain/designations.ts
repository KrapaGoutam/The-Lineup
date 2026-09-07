import type { Designation } from "@/features/auth/domain/passcode";

/**
 * Feature 014. Replaces the earlier 3-value `canChangeRole`/
 * `otherAssignableRole` (Feature 005) now that designation is the thing
 * the Team tab actually manages, with `AppRole` derived from it
 * (`designationToRole` in passcode.ts).
 *
 * Mirrors the real `memberships_update_manager` / `memberships_insert_manager`
 * RLS policies (supabase/migrations/20260905065702_initial_schema.sql)
 * exactly, not an approximation of them:
 *   - owner: unrestricted (`using`/`with check` have no target condition
 *     for the owner branch).
 *   - general_manager ("manager" designation): may act only when the
 *     target's CURRENT roles don't include owner or general_manager
 *     (the `using` clause), and may never WRITE owner or general_manager
 *     into the target's roles either (the `with check` clause). Net
 *     effect: a manager can toggle assistant_manager <-> staff, but can
 *     never touch an owner or a fellow manager, and can never grant
 *     "manager" or "owner" to anyone.
 *   - shift_manager ("assistant_manager" designation): not present in
 *     either policy's actor check at all. Despite full operational
 *     access elsewhere, an assistant manager has zero membership-write
 *     capability -- personnel/HR capability is a separate grant from
 *     operational capability in the real schema, and this deliberately
 *     does not add one.
 *   - staff (server/host): never had this capability.
 *
 * This is a fix, not just a port, of one thing the earlier 3-role demo
 * approximation got wrong: `canChangeRole` let a manager change another
 * manager's role, which the real RLS `using` clause has never allowed.
 */
export function canChangeDesignation(input: {
  actorDesignation: Designation;
  targetCurrentDesignation: Designation;
}): boolean {
  if (input.actorDesignation === "owner") return true;
  if (input.actorDesignation !== "manager") return false;
  return (
    input.targetCurrentDesignation !== "owner" &&
    input.targetCurrentDesignation !== "manager"
  );
}

const ALL_DESIGNATIONS: Designation[] = [
  "owner",
  "manager",
  "assistant_manager",
  "staff",
];

/**
 * The designations an actor could set a given target to right now,
 * excluding the target's current one. An owner sees every other value,
 * including handing off ownership -- an existing, unchanged real-mode
 * behavior (the owner branch of the RLS policies has no restriction),
 * not something this feature adds or should quietly tighten. A manager,
 * when allowed at all, only ever sees the single opposite value between
 * assistant_manager and staff, since the `with check` clause blocks
 * writing owner or general_manager under any circumstance.
 */
export function assignableDesignations(input: {
  actorDesignation: Designation;
  targetCurrentDesignation: Designation;
}): Designation[] {
  if (!canChangeDesignation(input)) return [];
  if (input.actorDesignation === "owner") {
    return ALL_DESIGNATIONS.filter(
      (designation) => designation !== input.targetCurrentDesignation,
    );
  }
  return input.targetCurrentDesignation === "staff"
    ? ["assistant_manager"]
    : ["staff"];
}

const DESIGNATION_LABELS: Record<Designation, string> = {
  owner: "Owner",
  manager: "Manager",
  assistant_manager: "Assistant Manager",
  staff: "Staff",
};

export function designationLabel(designation: Designation): string {
  return DESIGNATION_LABELS[designation];
}

/**
 * Feature 017. Authorization for deactivating (or reactivating) a member
 * is the same predicate as a designation change or a passcode reset --
 * canChangeDesignation, reused directly rather than re-derived a third
 * time -- plus one rule neither of those needed: deactivating yourself
 * is refused unconditionally, for every role including owner. An owner
 * who wants to stop using the app can just stop signing in; there is no
 * legitimate reason to self-deactivate, and a real lockout risk if it
 * happens by mistake or via a compromised session covering its tracks.
 */
export function canDeactivateMember(input: {
  actorProfileId: string;
  actorDesignation: Designation;
  targetProfileId: string;
  targetCurrentDesignation: Designation;
}): boolean {
  if (input.actorProfileId === input.targetProfileId) return false;
  return canChangeDesignation({
    actorDesignation: input.actorDesignation,
    targetCurrentDesignation: input.targetCurrentDesignation,
  });
}
