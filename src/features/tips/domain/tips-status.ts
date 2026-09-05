/**
 * Lifted to RestaurantOperationsApp (Feature 011) so both the tips module
 * and the allocation board can read/react to the same finalized state —
 * the board freezes once tips are finalized for the day, and unfreezes
 * when a manager/owner reopens them.
 */
export type TipsDayStatus = "estimating" | "finalized";

export type TipsAuditEntry = {
  action: "finalized" | "reopened";
  actorName: string;
  reason?: string;
  at: string;
};
