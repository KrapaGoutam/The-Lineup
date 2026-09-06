import "server-only";

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
};

/**
 * Shared by both entry routes (`/` and `/r/[restaurantSlug]`, which
 * otherwise duplicate this exact orchestration) -- resolves demo mode,
 * the signed-in user, and (Feature 015 Phases B/D) the real schedule and
 * tips data for their organization, all in one place so both routes stay
 * in sync as more phases land.
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
    };
  }

  const initialUser = await getCurrentUser(restaurantSlug);
  if (!initialUser) {
    return {
      demoMode,
      initialUser: null,
      scheduleContext: null,
      tipsContext: null,
    };
  }

  const [scheduleContext, tipsContext] = await Promise.all([
    getScheduleContext(initialUser.organizationId),
    getTipsContext(initialUser.organizationId),
  ]);

  return { demoMode, initialUser, scheduleContext, tipsContext };
}
