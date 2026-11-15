import { RestaurantEntry } from "@/components/restaurant-entry";
import { parseExplicitLocationSelection } from "@/features/context/domain/active-context";

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { restaurantSlug } = await params;
  // V2-003.002: `?location=` is an untrusted preference, validated server-side.
  const { location } = await searchParams;
  return (
    <RestaurantEntry
      restaurantSlug={restaurantSlug}
      explicitSelection={parseExplicitLocationSelection(location)}
    />
  );
}
