"use client";

import { useRouter } from "next/navigation";

import { LocationAdministration } from "@/features/locations/components/location-administration";
import { useContextSwitch } from "@/features/context/components/use-context-switch";

export function OrganizationBranchAdministration({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const { switchingTo, switchTo, switchError } = useContextSwitch();
  return (
    <div className="space-y-3">
      {switchError ? (
        <p role="alert" className="text-destructive text-sm">
          {switchError}
        </p>
      ) : null}
      {switchingTo ? (
        <p role="status" className="text-muted-foreground text-sm">
          Opening {switchingTo.locationName}…
        </p>
      ) : null}
      <LocationAdministration
        initialOrganizationId={organizationId}
        backLabel="Back to Organizations"
        onBack={() => router.push("/system-administration/organizations")}
        onOpenWorkspace={(organization, location) => {
          void switchTo({
            organizationId: organization.id,
            organizationSlug: organization.slug,
            organizationName: organization.name,
            locationId: location.id,
            locationName: location.name,
            timeZone: location.timeZone,
          });
        }}
      />
    </div>
  );
}
