import { Badge } from "@/components/ui/badge";
import {
  describeLifecycleStatus,
  type LocationLifecycleStatus,
} from "@/features/locations/domain/location-lifecycle";

const TONES: Readonly<
  Record<LocationLifecycleStatus, "success" | "warning" | "neutral">
> = {
  active: "success",
  inactive: "warning",
  archived: "neutral",
};

/** Status is always conveyed as text, never by colour alone. */
export function LocationLifecycleBadge({
  status,
  className,
}: {
  readonly status: LocationLifecycleStatus;
  readonly className?: string;
}) {
  return (
    <Badge
      tone={TONES[status]}
      className={className ?? "shrink-0 text-xs font-medium"}
      data-testid={`lifecycle-badge-${status}`}
    >
      {describeLifecycleStatus(status)}
    </Badge>
  );
}
