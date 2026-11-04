import { RestaurantEntry } from "@/components/restaurant-entry";

export default async function Home() {
  const restaurantSlug = process.env.NEXT_PUBLIC_RESTAURANT_SLUG ?? "the-monks";
  return <RestaurantEntry restaurantSlug={restaurantSlug} />;
}
