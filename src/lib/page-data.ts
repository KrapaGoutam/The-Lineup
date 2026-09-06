import "server-only";

import {
  getAllocationContext,
  type AllocationContext,
} from "@/features/allocation/data/allocation-data";
import type { SignedInUser } from "@/components/login-screen";
import {
  getScheduleContext,
  type ScheduleContext,
} from "@/features/schedules/data/schedule-data";
import {
  getTipsContext,
  type TipsContext,
} from "@/features/tips/data/tips-data";
import { getCurrentUser } from "@/lib/current-user";

export type PageData = {
  demoMode: boolean;
  initialUser: SignedInUser | null;
  scheduleContext: ScheduleContext | null;
  tipsContext: TipsContext | null;
  allocationContext: AllocationContext | null;
};

/**
 * Shared by both entry routes (`/` and `/r/[restaurantSlug]`, which
 * otherwise duplicate this exact orchestration) -- resolves demo mode,
 * the signed-in user, and (Feature 015 Phases B/C/D) the real schedule,
 * allocation, and tips data for their organization, all in one place so
 * both routes stay in sync as more phases land.
 */
export async function loadPageData(restaurantSlug: string): Promise<PageData> {
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (demoMode) {
    return {
      demoMode,
      initialUser: null,
      scheduleContext: null,
      tipsContext: null,
      allocationContext: null,
    };
  }

  const initialUser = await getCurrentUser(restaurantSlug);
  if (!initialUser) {
    return {
      demoMode,
      initialUser: null,
      scheduleContext: null,
      tipsContext: null,
      allocationContext: null,
    };
  }

  const [scheduleContext, tipsContext, allocationContext] = await Promise.all([
    getScheduleContext(initialUser.organizationId),
    getTipsContext(initialUser.organizationId),
    getAllocationContext(initialUser.organizationId),
  ]);

  return {
    demoMode,
    initialUser,
    scheduleContext,
    tipsContext,
    allocationContext,
  };
}
