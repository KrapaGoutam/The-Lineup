import { RestaurantOperationsApp } from "@/components/restaurant-operations-app";
import { getCurrentUser } from "@/lib/current-user";

export default async function Home() {
  const restaurantSlug =
    process.env.NEXT_PUBLIC_RESTAURANT_SLUG ?? "autumn-house";
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const initialUser = demoMode ? null : await getCurrentUser(restaurantSlug);

  return (
    <RestaurantOperationsApp
      demoMode={demoMode}
      restaurantSlug={restaurantSlug}
      initialUser={initialUser}
    />
  );
}
