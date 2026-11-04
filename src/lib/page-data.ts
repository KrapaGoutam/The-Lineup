import "server-only";

import {
  getAllocationContext,
  type AllocationContext,
} from "@/features/allocation/data/allocation-data";
import type { SignedInUser } from "@/components/login-screen";
import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import type {
  AvailableContextSummary,
  ContextResolutionResult,
} from "@/features/context/domain/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import {
  getScheduleContext,
  type ScheduleContext,
} from "@/features/schedules/data/schedule-data";
import {
  getTipsContext,
  type TipsContext,
} from "@/features/tips/data/tips-data";
import { getEntryUser } from "@/lib/current-user";

/**
 * V2-003.001: what the entry route knows about the active context.
 *  - `demo`: synthetic data, no hosted calls, no real context.
 *  - `resolved`: a verified (organization, location) pair; operational
 *    contexts below were all loaded for that exact pair.
 *  - `selection_required` / `invalid_context` / `error`: authenticated, but
 *    NO operational data was loaded; the page renders a context-unavailable
 *    state.
 *  - `unauthenticated` / `no_access`: signed-out presentation (login screen),
 *    exactly as before; NO operational data was loaded.
 */
export type PageContextStatus = "demo" | ContextResolutionResult["status"];

/** Serializable, display-safe active context (reusable by V2-003.002). */
export type ActiveContextDisplay = AvailableContextSummary & {
  selectedBy: "cookie_preference" | "sole_eligible_location";
};

export type PageData = {
  demoMode: boolean;
  initialUser: SignedInUser | null;
  scheduleContext: ScheduleContext | null;
  tipsContext: TipsContext | null;
  allocationContext: AllocationContext | null;
  contextStatus: PageContextStatus;
  activeContext: ActiveContextDisplay | null;
  availableContexts: readonly AvailableContextSummary[];
  contextReason: string | null;
};

const EMPTY_OPERATIONAL = {
  initialUser: null,
  scheduleContext: null,
  tipsContext: null,
  allocationContext: null,
  activeContext: null,
  availableContexts: [],
  contextReason: null,
} as const;

/**
 * Shared by both entry routes (`/` and `/r/[restaurantSlug]`, which
 * otherwise duplicate this exact orchestration).
 *
 * V2-003.001: the active (organization, location) context is resolved FIRST,
 * server-side, from the verified session plus the untrusted route slug and
 * cookie preference. Operational loaders run only for a fully `resolved`
 * context and ALL receive the same verified location + time zone -- no loader
 * chooses a location on its own, so schedule/tips/allocation can never
 * disagree about which branch they describe. A partially resolved context
 * never invokes a loader.
 */
export async function loadPageData(restaurantSlug: string): Promise<PageData> {
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Demo identity is synthetic and never mixed with real authorization: no
  // hosted Supabase call and no active-context cookie is consulted.
  if (demoMode) {
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: "demo",
    };
  }

  const resolution = await resolveCurrentActiveContext({
    routeSlug: restaurantSlug,
  });

  if (resolution.status === "selection_required") {
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: "selection_required",
      availableContexts: resolution.availableContexts,
    };
  }

  if (
    resolution.status === "invalid_context" ||
    resolution.status === "error"
  ) {
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: resolution.status,
      contextReason: resolution.reason,
    };
  }

  if (resolution.status !== "resolved") {
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: resolution.status,
    };
  }

  const { context } = resolution;
  const scope = toVerifiedLocationScope(context);

  const initialUser = await getEntryUser(context);
  if (!initialUser) {
    // Verified access but no readable profile: present as signed out rather
    // than loading data for an identity we cannot display.
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: "no_access",
    };
  }

  const [scheduleContext, tipsContext, allocationContext] = await Promise.all([
    getScheduleContext(context.organizationId, scope),
    getTipsContext(context.organizationId, scope),
    getAllocationContext(context.organizationId, undefined, scope),
  ]);

  return {
    demoMode,
    initialUser,
    scheduleContext,
    tipsContext,
    allocationContext,
    contextStatus: "resolved",
    activeContext: {
      organizationId: context.organizationId,
      organizationSlug: context.organizationSlug,
      organizationName: context.organizationName,
      locationId: context.locationId,
      locationName: context.locationName,
      timeZone: context.timeZone,
      selectedBy: context.selectedBy,
    },
    availableContexts: [],
    contextReason: null,
  };
}
