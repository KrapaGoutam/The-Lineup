import "server-only";

import {
  getAllocationContext,
  type AllocationContext,
} from "@/features/allocation/data/allocation-data";
import type { SignedInUser } from "@/components/login-screen";
import {
  listCurrentEligibleContexts,
  resolveCurrentActiveContext,
} from "@/features/context/data/active-context";
import type {
  AvailableContextSummary,
  ContextResolutionResult,
  ExplicitLocationSelection,
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
  selectedBy:
    | "cookie_preference"
    | "sole_eligible_location"
    | "explicit_selection";
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
  /**
   * V2-003.002: true when the switcher candidate list could not be loaded.
   * Never interpreted as "no other locations": the switcher is then shown as
   * unavailable instead of silently empty.
   */
  availableContextsFailed: boolean;
};

const EMPTY_OPERATIONAL = {
  initialUser: null,
  scheduleContext: null,
  tipsContext: null,
  allocationContext: null,
  activeContext: null,
  availableContexts: [],
  contextReason: null,
  availableContextsFailed: false,
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
export async function loadPageData(
  restaurantSlug: string,
  explicitSelection?: ExplicitLocationSelection,
): Promise<PageData> {
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
    explicitSelection,
  });

  if (
    resolution.status === "selection_required" ||
    resolution.status === "invalid_context"
  ) {
    // Recovery list: the user's verified eligible contexts (any organization),
    // so a stale/invalid selection can be replaced by an explicit one. No
    // operational data is loaded. A failed list is surfaced, not hidden.
    const list = await listCurrentEligibleContexts();
    const listed = list.status === "ok" ? list.contexts : null;
    return {
      demoMode,
      ...EMPTY_OPERATIONAL,
      contextStatus: resolution.status,
      contextReason:
        resolution.status === "invalid_context" ? resolution.reason : null,
      availableContexts:
        listed ??
        (resolution.status === "selection_required"
          ? resolution.availableContexts
          : []),
      availableContextsFailed: listed === null,
    };
  }

  if (resolution.status === "error") {
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

  const [scheduleContext, tipsContext, allocationContext, switcher] =
    await Promise.all([
      getScheduleContext(context.organizationId, scope),
      getTipsContext(context.organizationId, scope),
      getAllocationContext(context.organizationId, undefined, scope),
      listCurrentEligibleContexts(),
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
    availableContexts: switcher.status === "ok" ? switcher.contexts : [],
    contextReason: null,
    availableContextsFailed: switcher.status !== "ok",
  };
}
