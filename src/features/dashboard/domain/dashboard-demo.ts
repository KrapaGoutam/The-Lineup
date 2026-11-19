import { buildQuickActions, type DashboardData } from "./dashboard-model";

/**
 * Demo workspace only (there is no database to read). Clearly labelled "Sample data" by the
 * Dashboard, deterministic, and shaped exactly like a real payload so the same screen renders
 * both. Payroll is not part of the demo workspace (its tab is real-mode only), so neither its
 * card nor its shortcut exists here.
 */
export function buildDemoDashboard(input: {
  isManagement: boolean;
  serviceDate: string;
  timeZone: string;
  organizationName: string;
  locationName: string;
}): DashboardData {
  const modules = {
    attendance: true,
    payroll: false,
    tips: true,
    bar_inventory: true,
    tasks: true,
    table_allocation: true,
  } as const;
  return {
    organizationName: input.organizationName,
    locationName: input.locationName,
    timeZone: input.timeZone,
    serviceDate: input.serviceDate,
    generatedAt: new Date().toISOString(),
    isManagement: input.isManagement,
    demo: true,
    cards: input.isManagement
      ? {
          attendance: {
            status: "ok",
            data: { clockedIn: 3, onBreak: 1, sourceLabel: "Demo workspace" },
          },
          tips: {
            status: "ok",
            data: {
              view: "manager",
              serviceDate: input.serviceDate,
              totalCents: 18_001,
              cashCents: 10_001,
              cardCents: 8_000,
              notSplitCents: 0,
              intervalCount: 2,
              lastUpdatedAt: null,
            },
          },
          lowStock: {
            status: "ok",
            data: { needsOrdering: 5, critical: 2, low: 3 },
          },
        }
      : {
          tips: {
            status: "ok",
            data: {
              view: "staff",
              serviceDate: input.serviceDate,
              totalCents: 4_500,
              cashCents: 2_500,
              cardCents: 2_000,
              notSplitCents: 0,
            },
          },
        },
    quickActions: buildQuickActions({
      isManagement: input.isManagement,
      modules,
      canManagePayroll: false,
      canUseInventory: input.isManagement,
      canUseTips: true,
    }),
  };
}
