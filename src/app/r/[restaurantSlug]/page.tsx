import { RestaurantOperationsApp } from "@/components/restaurant-operations-app";
import { loadPageData } from "@/lib/page-data";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const {
    demoMode,
    initialUser,
    scheduleContext,
    tipsContext,
    allocationContext,
  } = await loadPageData(restaurantSlug);

  return (
    <RestaurantOperationsApp
      demoMode={demoMode}
      restaurantSlug={restaurantSlug}
      initialUser={initialUser}
      initialScheduleContext={scheduleContext}
      initialTipsContext={tipsContext}
      initialAllocationContext={allocationContext}
    />
  );
}
