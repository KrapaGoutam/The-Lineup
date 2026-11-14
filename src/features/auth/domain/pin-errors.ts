export type PinFailureCode =
  | "global_collision"
  | "organization_collision"
  | "database_error"
  | "reconciliation_required";
export const PIN_IN_USE =
  "That PIN is already in use. Please choose a different PIN.";
export function isPinCollision(code: PinFailureCode | undefined) {
  return code === "global_collision" || code === "organization_collision";
}
