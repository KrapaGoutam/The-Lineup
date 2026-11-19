/**
 * V2.0.9 — Daily Operations Dashboard read model (pure domain, no I/O).
 *
 * The Dashboard owns no data and no money rules. Each card is the result of a read the
 * owning module already trusts, reduced here to a small, honest summary:
 *
 *   Attendance  open native sessions at the branch (distinct employees)
 *   Payroll     `payroll_periods` + `summarizePeriodLedger`, `derivePeriodStatus`,
 *               `computeOverallBalanceOwedCents`
 *   Tips        V2.0.8 `tips_get_range` model (`buildTipsRange`, `liveIntervals`)
 *   Low stock   Bar Inventory `buildInventoryRows`, `buildKpis`, `needsOrdering`
 *
 * HONESTY RULES (each is covered by a test):
 *  - A source that cannot answer is `unavailable`, NEVER `0` and never `$0.00`.
 *  - A valid empty answer is `ok` with a real zero.
 *  - A card the viewer may not see is absent from the payload, not hidden by the client.
 *  - Money is integer cents; legacy tips with no cash/card split stay `unclassified`.
 */

import type { AppTab } from "@/lib/app-tab";
import { buildInventoryRows } from "@/features/bar-inventory/domain/inventory-rows";
import {
  buildKpis,
  needsOrdering,
} from "@/features/bar-inventory/domain/dashboard";
import type {
  ProductView,
  StockView,
} from "@/features/bar-inventory/domain/inventory-types";
import {
  computeOverallBalanceOwedCents,
  derivePeriodStatus,
} from "@/features/payroll/domain/payroll-balance-metrics";
import {
  liveIntervals,
  sumShares,
  type TipsRange,
} from "@/features/tips/domain/tips-range-model";
/** The modules the Dashboard reads or links to (same keys as the module registry). */
export type DashboardModuleKey =
  | "attendance"
  | "payroll"
  | "tips"
  | "bar_inventory"
  | "tasks"
  | "table_allocation";

// ── Card envelopes ─────────────────────────────────────────────────────────────────────

export type CardResult<T> =
  | { readonly status: "ok"; readonly data: T }
  /** The owning source could not answer. Never rendered as zero. */
  | { readonly status: "unavailable"; readonly reason: string }
  /** The module is turned off for this branch: shown muted, with no link. */
  | { readonly status: "module_off" };

export type AttendanceCard = {
  /** Distinct employees with an open session (active or on a break). */
  readonly clockedIn: number;
  readonly onBreak: number;
  readonly sourceLabel: string;
};

export type PayrollCard = {
  /** Draft (not locked) periods of the current accounting month at this branch. */
  readonly draftPeriods: number;
  /** `YYYY-MM-01`, the branch-local accounting month the count is for. */
  readonly periodMonth: string;
  /** Money still owed across this branch's periods; overpaid periods never offset. */
  readonly outstandingBalanceCents: number;
  /** Every period of the branch the balance covers (all months). */
  readonly periodsCounted: number;
};

export type TipsManagerCard = {
  readonly view: "manager";
  readonly serviceDate: string;
  readonly totalCents: number;
  readonly cashCents: number;
  readonly cardCents: number;
  /** Legacy money that was never classified: kept visible, never split. */
  readonly notSplitCents: number;
  readonly intervalCount: number;
  readonly lastUpdatedAt: string | null;
};

export type TipsStaffCard = {
  readonly view: "staff";
  readonly serviceDate: string;
  /** The viewer's OWN allocated tips only. */
  readonly totalCents: number;
  readonly cashCents: number;
  readonly cardCents: number;
  readonly notSplitCents: number;
};

export type TipsCard = TipsManagerCard | TipsStaffCard;

export type LowStockCard = {
  readonly needsOrdering: number;
  readonly critical: number;
  readonly low: number;
};

export type QuickAction = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly target:
    | { readonly kind: "tab"; readonly tab: AppTab }
    | { readonly kind: "href"; readonly href: string };
};

export type DashboardData = {
  readonly organizationName: string;
  readonly locationName: string;
  readonly timeZone: string;
  /** Branch-local calendar date the day-scoped cards are for. */
  readonly serviceDate: string;
  readonly generatedAt: string;
  readonly isManagement: boolean;
  readonly cards: {
    readonly attendance?: CardResult<AttendanceCard>;
    readonly payroll?: CardResult<PayrollCard>;
    readonly tips?: CardResult<TipsCard>;
    readonly lowStock?: CardResult<LowStockCard>;
  };
  readonly quickActions: readonly QuickAction[];
  readonly demo?: boolean;
};

// ── Attendance ─────────────────────────────────────────────────────────────────────────

export function summarizeOpenSessions(
  rows: ReadonlyArray<{ profile_id: string | null; status: string }>,
  sourceLabel: string,
): AttendanceCard {
  const open = new Set<string>();
  const onBreak = new Set<string>();
  for (const row of rows) {
    if (!row.profile_id) continue;
    if (row.status === "active" || row.status === "on_break") {
      open.add(row.profile_id);
    }
    if (row.status === "on_break") onBreak.add(row.profile_id);
  }
  // An employee with two open rows is one employee; if either is on a break they
  // are counted as on a break only when no other row is active.
  for (const row of rows) {
    if (row.profile_id && row.status === "active")
      onBreak.delete(row.profile_id);
  }
  return { clockedIn: open.size, onBreak: onBreak.size, sourceLabel };
}

// ── Payroll ────────────────────────────────────────────────────────────────────────────

export type PayrollPeriodInput = {
  readonly periodMonth: string;
  readonly status: "draft" | "locked";
  readonly grossCents: number;
  readonly balanceCents: number;
};

export function summarizePayroll(
  periods: readonly PayrollPeriodInput[],
  currentPeriodMonth: string,
): PayrollCard {
  const draftPeriods = periods.filter(
    (period) =>
      period.periodMonth === currentPeriodMonth &&
      derivePeriodStatus(period) === "draft",
  ).length;
  return {
    draftPeriods,
    periodMonth: currentPeriodMonth,
    outstandingBalanceCents: computeOverallBalanceOwedCents([...periods]),
    periodsCounted: periods.length,
  };
}

// ── Tips ───────────────────────────────────────────────────────────────────────────────

/**
 * Today's tips for one branch from the V2.0.8 range model. Managers see the location
 * totals of saved, non-void intervals; staff see only their own allocated shares (the
 * database already returns nothing else, and a foreign share is dropped here as well).
 * Returns null when the payload does not carry the requested service date's day.
 */
export function summarizeTipsToday(
  range: TipsRange,
  serviceDate: string,
  viewerProfileId: string,
): TipsCard {
  const day = range.days.find(
    (candidate) => candidate.serviceDate === serviceDate,
  );
  if (!range.isManager) {
    const own = sumShares(
      (day?.allocations ?? []).filter(
        (share) => share.profileId === viewerProfileId,
      ),
    );
    return {
      view: "staff",
      serviceDate,
      totalCents: own.totalCents,
      cashCents: own.cashCents,
      cardCents: own.cardCents,
      notSplitCents: own.unclassifiedCents,
    };
  }
  const live = day ? liveIntervals(day) : [];
  let total = 0;
  let cash = 0;
  let card = 0;
  let notSplit = 0;
  let last: string | null = null;
  for (const interval of live) {
    const amount = interval.amountCents ?? 0;
    total += amount;
    cash += interval.cashCents;
    card += interval.cardCents;
    if (!interval.tenderRecorded) notSplit += amount;
  }
  if (day && live.length > 0) last = day.updatedAt;
  return {
    view: "manager",
    serviceDate,
    totalCents: total,
    cashCents: cash,
    cardCents: card,
    notSplitCents: notSplit,
    intervalCount: live.length,
    lastUpdatedAt: last,
  };
}

// ── Low stock ──────────────────────────────────────────────────────────────────────────

export type StockProductInput = {
  readonly id: string;
  readonly active: boolean;
};

export type StockLevelInput = {
  readonly product_id: string;
  readonly on_hand: number;
  readonly backup: number;
  readonly cutoff: number | null;
  readonly warning: number | null;
  readonly par: number | null;
  readonly version: number;
  readonly updated_at: string | null;
};

/**
 * Critical + Low among the branch's ACTIVE products, using the Bar Inventory rules
 * (`evaluateStock` via `buildInventoryRows`). There is no threshold of its own here.
 * Archived products and products with no cutoff are never counted.
 */
export function summarizeLowStock(
  products: readonly StockProductInput[],
  stock: readonly StockLevelInput[],
  timeZone: string,
  now: Date,
): LowStockCard {
  const productViews: ProductView[] = products.map((product) => ({
    id: product.id,
    vendorId: "",
    name: product.id,
    categoryId: null,
    subcategoryId: null,
    size: null,
    unitType: "other",
    unitLabel: null,
    sku: null,
    notes: null,
    active: product.active,
    version: 1,
    updatedAt: "",
    updatedByName: null,
  }));
  const stockViews: StockView[] = stock.map((row) => ({
    productId: row.product_id,
    onHand: Number(row.on_hand),
    backup: Number(row.backup),
    cutoff: row.cutoff === null ? null : Number(row.cutoff),
    warning: row.warning === null ? null : Number(row.warning),
    par: row.par === null ? null : Number(row.par),
    version: row.version,
    updatedAt: row.updated_at,
    updatedByName: null,
    lastAdjustedAt: null,
  }));
  const rows = buildInventoryRows({
    vendors: [],
    categories: [],
    subcategories: [],
    products: productViews,
    stock: stockViews,
  });
  const kpis = buildKpis(rows, { timeZone, now });
  return {
    needsOrdering: needsOrdering(rows).length,
    critical: kpis.critical,
    low: kpis.low,
  };
}

// ── Quick actions ──────────────────────────────────────────────────────────────────────

export type QuickActionAccess = {
  /** Branch management (location manage / assistant manage), from canonical capabilities. */
  readonly isManagement: boolean;
  /** Modules the viewer may open at this branch right now (enforcement already applied). */
  readonly modules: Readonly<Partial<Record<DashboardModuleKey, boolean>>>;
  /** The viewer may manage payroll here (the Payroll module's own authority). */
  readonly canManagePayroll: boolean;
  /** The viewer is authorized for Bar Inventory here (the module's own authority). */
  readonly canUseInventory: boolean;
  /** The viewer is authorized for Tips here (the module's own authority). */
  readonly canUseTips: boolean;
};

/**
 * Shortcuts the viewer can actually use. Presentation only: every destination still
 * enforces its own authorization, and an action whose module is off or unauthorized is
 * simply not offered. No role label is consulted.
 */
export function buildQuickActions(access: QuickActionAccess): QuickAction[] {
  const on = (key: DashboardModuleKey) => access.modules[key] === true;
  const actions: QuickAction[] = [];
  const tab = (
    id: string,
    label: string,
    description: string,
    appTab: AppTab,
  ) =>
    actions.push({
      id,
      label,
      description,
      target: { kind: "tab", tab: appTab },
    });

  if (on("attendance")) {
    if (access.isManagement) {
      tab("attendance", "Attendance", "View clock-ins", "attendance");
    } else {
      tab(
        "attendance",
        "My Attendance",
        "Your clock-ins and hours",
        "attendance",
      );
    }
  }
  if (access.isManagement && on("payroll") && access.canManagePayroll) {
    tab("payroll", "Payroll", "Review draft periods", "payroll");
  }
  if (on("tips") && access.canUseTips) {
    if (access.isManagement) {
      tab("tips", "Tip Split", "Open today's distributions", "tips");
    } else {
      tab("tips", "My Tips", "Your tips and history", "tips");
    }
  }
  if (access.isManagement && on("bar_inventory") && access.canUseInventory) {
    tab("inventory", "Bar Inventory", "Review low stock", "barInventory");
  }
  if (on("tasks")) {
    if (access.isManagement) {
      tab("tasks", "Tasks", "Open Management Today", "tasks");
    } else {
      tab("tasks", "My Tasks", "Your assigned tasks", "tasks");
    }
  }
  if (on("table_allocation")) {
    tab(
      "allocation",
      "Table Allocation",
      "Open floor and rotation",
      "allocation",
    );
  }
  if (
    access.isManagement &&
    (on("attendance") || (on("payroll") && access.canManagePayroll))
  ) {
    actions.push({
      id: "reporting",
      label: "Reporting Center",
      description: "Open reports",
      target: { kind: "href", href: "/reporting" },
    });
  }
  return actions;
}
