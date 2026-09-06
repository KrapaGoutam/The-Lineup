import { RestaurantOperationsApp } from "@/components/restaurant-operations-app";
import { loadPageData } from "@/lib/page-data";

export default async function Home() {
  const restaurantSlug = process.env.NEXT_PUBLIC_RESTAURANT_SLUG ?? "the-monks";
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
