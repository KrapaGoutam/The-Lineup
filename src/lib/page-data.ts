import "server-only";

import type { SignedInUser } from "@/components/login-screen";
import {
  getScheduleContext,
  type ScheduleContext,
} from "@/features/schedules/data/schedule-data";
import { getCurrentUser } from "@/lib/current-user";

export type PageData = {
  demoMode: boolean;
  initialUser: SignedInUser | null;
  scheduleContext: ScheduleContext | null;
};

/**
 * Shared by both entry routes (`/` and `/r/[restaurantSlug]`, which
 * otherwise duplicate this exact orchestration) -- resolves demo mode,
 * the signed-in user, and (Feature 015 Phase B) the real schedule data
 * for their organization, all in one place so both routes stay in sync
 * as more phases land.
 */
export async function loadPageData(restaurantSlug: string): Promise<PageData> {
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (demoMode) {
    return { demoMode, initialUser: null, scheduleContext: null };
  }

  const initialUser = await getCurrentUser(restaurantSlug);
  if (!initialUser) {
    return { demoMode, initialUser: null, scheduleContext: null };
  }

  const scheduleContext = await getScheduleContext(initialUser.organizationId);

  return { demoMode, initialUser, scheduleContext };
}
