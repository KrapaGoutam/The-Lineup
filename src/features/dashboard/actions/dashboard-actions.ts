"use server";

import { z } from "zod";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import { checkModulesAccess } from "@/features/modules/data/module-enforcement";
import { derivePayrollAuthority } from "@/features/payroll/data/payroll-actor";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  readAttendanceCard,
  readLowStockCard,
  readPayrollCard,
  readTipsCard,
} from "../data/dashboard-readers";
import {
  buildQuickActions,
  type CardResult,
  type DashboardData,
  type DashboardModuleKey,
} from "../domain/dashboard-model";

export type DashboardActionResult =
  | { ok: true; data: DashboardData }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

const inputSchema = z.object({
  restaurantSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  expectedContext: z.unknown().optional(),
});

const DASHBOARD_MODULES = [
  "attendance",
  "payroll",
  "tips",
  "bar_inventory",
  "tasks",
  "table_allocation",
] as const satisfies readonly DashboardModuleKey[];

const GENERIC_ERROR = "The dashboard couldn't be loaded. Try again shortly.";

/**
 * V2.0.9 — the Daily Operations Dashboard read.
 *
 * Order (nothing module-specific runs before the caller is proven):
 *   live session → canonical active context for THIS slug (organization, branch, profile,
 *   capabilities, all server-verified) → stale-tab expectation → ONE module-configuration
 *   read → each card's own authorization → only the authorized, enabled cards are read.
 *
 * Organization, branch, time zone and profile come only from the verified context; the
 * request supplies a slug and an untrusted expectation to compare, nothing else. A card
 * the viewer may not see is absent from the payload (never sent and hidden). Read-only:
 * no table is written.
 */
export async function getDashboardAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<DashboardActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  try {
    const supabase = await createClient();
    const session = await requireLiveSession(supabase);
    if (session) return session;

    const resolved = await resolveCurrentActiveContext({
      routeSlug: parsed.data.restaurantSlug,
    });
    if (
      resolved.status !== "resolved" ||
      !resolved.context.access.allowed ||
      !resolved.context.access.effectiveLevel
    ) {
      return { ok: false, error: "You can't view the dashboard here." };
    }
    const context = resolved.context;
    const { organizationId, locationId, timeZone, profileId } = context;

    const workspace = await assertWorkspaceExpectation(
      parsed.data.expectedContext ?? {
        profileId,
        organizationId,
        locationId,
      },
      { profileId, organizationId },
      {
        resolveLocation: async () => ({ id: locationId, time_zone: timeZone }),
      },
    );
    if (!workspace.ok) {
      return workspace.code === "invalid"
        ? { ok: false, error: "That request is invalid." }
        : { ok: false, error: STALE_CONTEXT_MESSAGE, contextStale: true };
    }

    // ONE module-configuration read decides every module's availability (the verified
    // location is passed in, never taken from the request).
    const verdicts = await checkModulesAccess(DASHBOARD_MODULES, {
      organizationId,
      location: { id: locationId },
    });
    const modules: Partial<Record<DashboardModuleKey, boolean>> = {};
    for (const key of DASHBOARD_MODULES) {
      modules[key] = verdicts[key]?.allowed === true;
    }

    const capabilities = context.access.capabilities;
    const isManagement =
      capabilities.includes("location:manage") ||
      capabilities.includes("location:assistant_manage");
    const payrollAuthority = derivePayrollAuthority(context.access);

    // Each module's own location authority (the same RPCs its actor calls).
    const scope = {
      p_organization_id: organizationId,
      p_location_id: locationId,
    };
    const [tipsAuth, payrollAuth, inventoryAuth] = await Promise.all([
      capabilities.includes("location:operate")
        ? supabase.rpc("tips_location_authorized", scope)
        : Promise.resolve(null),
      isManagement && payrollAuthority.canManage
        ? supabase.rpc("payroll_location_authorized", scope)
        : Promise.resolve(null),
      isManagement
        ? supabase.rpc("inventory_location_authorized", scope)
        : Promise.resolve(null),
    ]);
    const canUseTips = tipsAuth?.data === true;
    const canManagePayroll = payrollAuth?.data === true;
    const canUseInventory = inventoryAuth?.data === true;

    const serviceDate = zonedWallTimeFromInstant(new Date(), timeZone).date;
    const off = { status: "module_off" } as const satisfies CardResult<never>;

    const [attendance, payroll, tips, lowStock] = await Promise.all([
      isManagement
        ? modules.attendance
          ? readAttendanceCard(supabase, { organizationId, locationId })
          : Promise.resolve(off)
        : Promise.resolve(undefined),
      canManagePayroll
        ? modules.payroll
          ? readPayrollCard(supabase, {
              organizationId,
              locationId,
              serviceDate,
            })
          : Promise.resolve(off)
        : Promise.resolve(undefined),
      canUseTips
        ? modules.tips
          ? readTipsCard(supabase, {
              organizationId,
              locationId,
              serviceDate,
              profileId,
            })
          : isManagement
            ? Promise.resolve(off)
            : Promise.resolve(undefined)
        : Promise.resolve(undefined),
      canUseInventory
        ? modules.bar_inventory
          ? readLowStockCard(supabase, { organizationId, locationId, timeZone })
          : Promise.resolve(off)
        : Promise.resolve(undefined),
    ]);

    return {
      ok: true,
      data: {
        organizationName: context.organizationName,
        locationName: context.locationName,
        timeZone,
        serviceDate,
        generatedAt: new Date().toISOString(),
        isManagement,
        cards: {
          ...(attendance ? { attendance } : {}),
          ...(payroll ? { payroll } : {}),
          ...(tips ? { tips } : {}),
          ...(lowStock ? { lowStock } : {}),
        },
        quickActions: buildQuickActions({
          isManagement,
          modules,
          canManagePayroll,
          canUseInventory,
          canUseTips,
        }),
      },
    };
  } catch (error) {
    console.error("getDashboardAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
