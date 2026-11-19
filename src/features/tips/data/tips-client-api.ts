import {
  getClockedInRosterAction,
  getTipsRangeAction,
  recalculateTipsAction,
  reopenTipsAction,
  saveTipIntervalAction,
  voidTipIntervalAction,
} from "@/features/tips/actions/tips-actions";
import type { TipsApi } from "@/features/tips/domain/tips-api";

/**
 * Real-mode `TipsApi`: a thin adapter over the server actions. It sends only the route
 * slug, the workspace expectation (stale-tab check) and the user's own inputs; the
 * organization, location and time zone are re-derived on the server every time.
 */
export function createTipsApi(context: {
  restaurantSlug: string;
  expectedContext: unknown;
  locationId: string | null;
}): TipsApi {
  const base = {
    restaurantSlug: context.restaurantSlug,
    expectedContext: context.expectedContext,
    locationId: context.locationId ?? undefined,
  };
  return {
    saveInterval: (values) => saveTipIntervalAction({ ...base, ...values }),
    voidInterval: (values) => voidTipIntervalAction({ ...base, ...values }),
    recalculate: (tipPoolId) => recalculateTipsAction({ ...base, tipPoolId }),
    loadRange: (input) => getTipsRangeAction({ ...base, ...input }),
    reopenLegacy: (tipPoolId, reason) =>
      reopenTipsAction({ ...base, tipPoolId, reason }),
    pullClockedIn: async () => {
      const result = await getClockedInRosterAction({
        restaurantSlug: context.restaurantSlug,
        expectedContext: context.expectedContext,
      });
      return result.ok ? { ok: true, data: result.data.profileIds } : result;
    },
  };
}
