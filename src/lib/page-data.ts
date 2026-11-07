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
import { readActiveContextCookieValue } from "@/features/context/data/context-cookie-reader";
import {
  cookieNamesPair,
  parseActiveContextCookie,
} from "@/features/context/domain/context-cookie";
import { contextSwitchHref } from "@/features/context/domain/context-navigation";
import {
  getScheduleContext,
  type ScheduleContext,
} from "@/features/schedules/data/schedule-data";
import {
  getTipsContext,
  type TipsContext,
} from "@/features/tips/data/tips-data";
import { getEntryUser } from "@/lib/current-user";
import { readLocationModuleConfigs } from "@/features/modules/data/module-config-reader";
import { readModuleEnforcementMode } from "@/features/modules/data/module-enforcement";
import { decideModuleAccess } from "@/features/modules/domain/module-enforcement";
import {
  serializeModuleNavigation,
  type ModuleNavigationSnapshot,
} from "@/features/modules/domain/module-navigation";

/**
 * V2-003.001: what the entry route knows about the active context.
 *  - `demo`: synthetic data, no hosted calls, no real context.
 *  - `resolved`: a verified (organization, location) pair; operational
 *    contexts below were all loaded for that exact pair.
 *  - `no_access` / `selection_required` / `invalid_context` / `error`:
 *    authenticated, but NO operational data was loaded; the page renders a
 *    context-unavailable state (`no_access` = "no restaurant location
 *    assigned", with retry + sign-out).
 *  - `unauthenticated`: signed-out presentation (login screen); NO
 *    operational data was loaded.
 */
export type PageContextStatus = "demo" | ContextResolutionResult["status"];

/** Serializable, display-safe active context (reusable by V2-003.002). */
export type ActiveContextDisplay = AvailableContextSummary & {
  /** Tasks-only effective branch tier; unrelated modules retain their contracts. */
  tasksDesignation?: SignedInUser["designation"] | null;
  selectedBy:
    | "cookie_preference"
    | "sole_eligible_location"
    | "explicit_selection";
};

export type PageData = {
  moduleNavigation: ModuleNavigationSnapshot | null;
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
  /**
   * V2-003.003: server-built canonical destination (`/r/<verified-slug>
   * ?location=<verified-id>`) for the global `/` entry when the caller is
   * not in the default tenant but has exactly one verified context elsewhere.
   * Never derived from input; null otherwise.
   */
  redirectTo: string | null;
  /**
   * V2-003.004: set when the verified page context came from an explicit
   * `?location=` that the persisted (cookie) context does not match, so module
   * Server Actions would not operate on what is on screen. The client keeps the
   * workspace closed until the selection action re-verifies and persists it.
   */
  contextReconcile: {
    organizationId: string;
    organizationSlug: string;
    locationId: string;
  } | null;
};

const EMPTY_OPERATIONAL = {
  moduleNavigation: null,
  initialUser: null,
  scheduleContext: null,
  tipsContext: null,
  allocationContext: null,
  activeContext: null,
  availableContexts: [],
  contextReason: null,
  availableContextsFailed: false,
  redirectTo: null,
  contextReconcile: null,
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
  options: { globalEntry?: boolean } = {},
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

  if (resolution.status === "no_access" && options.globalEntry) {
    // V2-003.003: `/` is scoped to the configured default tenant. A signed-in
    // user with no access there may still have exactly ONE verified context
    // in their own organization; send them to that canonical route. Only a
    // fully `resolved` result (unique eligibility, or a valid stored
    // preference) redirects; ambiguity, stale/malformed input and errors keep
    // the existing presentation. The destination is built from verified data.
    const global = await resolveCurrentActiveContext({ routeSlug: null });
    if (global.status === "resolved") {
      return {
        demoMode,
        ...EMPTY_OPERATIONAL,
        contextStatus: "no_access",
        redirectTo: contextSwitchHref(global.context, ""),
      };
    }
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

  // V2-004.004: read the activation switch and this location's module
  // configuration FIRST, so a module that is turned off at the verified
  // location never has its data loaded into the page. While enforcement is
  // staged every module is allowed and the loaders run exactly as before.
  const [enforcement, moduleConfigs, switcher] = await Promise.all([
    readModuleEnforcementMode(),
    readLocationModuleConfigs(context.locationId),
    listCurrentEligibleContexts(),
  ]);
  const moduleAllowed = (module: "schedule" | "tips" | "table_allocation") =>
    decideModuleAccess({
      module,
      enforcement,
      configuration: moduleConfigs,
    }).allowed;
  const [scheduleContext, tipsContext, allocationContext] = await Promise.all([
    moduleAllowed("schedule")
      ? getScheduleContext(context.organizationId, scope)
      : Promise.resolve(null),
    moduleAllowed("tips")
      ? getTipsContext(context.organizationId, scope)
      : Promise.resolve(null),
    moduleAllowed("table_allocation")
      ? getAllocationContext(context.organizationId, undefined, scope)
      : Promise.resolve(null),
  ]);

  // V2-003.004 reconciliation: an explicit selection only needs persisting
  // when module actions would otherwise resolve to a DIFFERENT (or no)
  // location. With no cookie and exactly one eligible location in the
  // organization, actions resolve to that same location, so nothing is
  // written (single-context users never need a cookie).
  let needsReconcile = false;
  if (context.selectedBy === "explicit_selection") {
    const cookie = parseActiveContextCookie(
      await readActiveContextCookieValue(),
    );
    if (cookie.status === "present") {
      needsReconcile = !cookieNamesPair(cookie, context);
    } else if (cookie.status === "malformed") {
      needsReconcile = true;
    } else {
      needsReconcile =
        switcher.status !== "ok" ||
        switcher.contexts.filter(
          (candidate) => candidate.organizationId === context.organizationId,
        ).length !== 1;
    }
  }

  return {
    demoMode,
    initialUser,
    moduleNavigation: serializeModuleNavigation(
      {
        profileId: initialUser.profileId,
        organizationId: context.organizationId,
        locationId: context.locationId,
      },
      moduleConfigs,
    ),
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
      tasksDesignation: context.access.effectiveLevel,
    },
    availableContexts: switcher.status === "ok" ? switcher.contexts : [],
    contextReason: null,
    availableContextsFailed: switcher.status !== "ok",
    redirectTo: null,
    contextReconcile: needsReconcile
      ? {
          organizationId: context.organizationId,
          organizationSlug: context.organizationSlug,
          locationId: context.locationId,
        }
      : null,
  };
}
