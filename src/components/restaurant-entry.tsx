import { redirect } from "next/navigation";

import { ContextUnavailableNotice } from "@/components/context-unavailable-notice";
import { RestaurantOperationsApp } from "@/components/restaurant-operations-app";
import type { ExplicitLocationSelection } from "@/features/context/domain/active-context";
import { loadPageData } from "@/lib/page-data";

/**
 * Shared server entry for `/` and `/r/[restaurantSlug]`. Loads the verified
 * page data and renders either the operations app or -- when an authenticated
 * request has no single verified (organization, location) -- the
 * context-unavailable recovery state. Operational data is only ever
 * present for a `resolved` (or synthetic `demo`) context.
 */
export async function RestaurantEntry({
  restaurantSlug,
  explicitSelection,
  globalEntry = false,
}: {
  restaurantSlug: string;
  /** V2-003.002 `?location=` input (only the `/r/[slug]` route supplies it). */
  explicitSelection?: ExplicitLocationSelection;
  /** V2-003.003: the default-tenant `/` route (may redirect to the user's own org). */
  globalEntry?: boolean;
}) {
  const data = await loadPageData(restaurantSlug, explicitSelection, {
    globalEntry,
  });
  if (data.redirectTo) redirect(data.redirectTo);

  if (
    data.contextStatus === "selection_required" ||
    data.contextStatus === "invalid_context" ||
    data.contextStatus === "error"
  ) {
    return (
      <ContextUnavailableNotice
        status={data.contextStatus}
        availableContexts={data.availableContexts}
        availableContextsFailed={data.availableContextsFailed}
      />
    );
  }

  return (
    <RestaurantOperationsApp
      demoMode={data.demoMode}
      restaurantSlug={restaurantSlug}
      initialUser={data.initialUser}
      initialScheduleContext={data.scheduleContext}
      initialTipsContext={data.tipsContext}
      initialAllocationContext={data.allocationContext}
      activeContext={data.activeContext}
      availableContexts={data.availableContexts}
      availableContextsFailed={data.availableContextsFailed}
      contextReconcile={data.contextReconcile}
    />
  );
}
