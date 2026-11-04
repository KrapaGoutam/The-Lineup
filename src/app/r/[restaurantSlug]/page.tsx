import { RestaurantEntry } from "@/components/restaurant-entry";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  return <RestaurantEntry restaurantSlug={restaurantSlug} />;
}
