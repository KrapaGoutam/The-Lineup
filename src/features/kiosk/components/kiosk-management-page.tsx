"use client";

import * as React from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { LocationKioskManagement } from "./location-kiosk-management";
import { useManageableKioskLocations } from "./use-manageable-kiosk-locations";

/**
 * D7. Location-scoped Kiosks management, reachable from Settings without the
 * rest of Location Administration. It imports none of Location
 * Administration's components, so no unrelated capability can leak through UI
 * composition. It only ever offers locations the database says the caller may
 * manage, and re-fetches that answer every time it opens (a role removed
 * before opening yields the denied state). It does NOT re-check while open: a
 * device list already on screen stays visible until the next action, which the
 * database denies. Authority for every action is enforced server-side by the
 * kiosk RPCs/RLS, never by this page.
 */
export function KioskManagementPage({
  onBack,
}: {
  readonly onBack: () => void;
}) {
  const { state, locations, reload } = useManageableKioskLocations(true);
  const [pickedId, setPickedId] = React.useState<string>("");

  // Keep the selection valid against the latest server answer.
  const selected =
    locations.find((l) => l.locationId === pickedId) ?? locations[0] ?? null;

  const multipleOrganizations =
    new Set(locations.map((l) => l.organizationId)).size > 1;
  const optionLabel = (l: (typeof locations)[number]) =>
    multipleOrganizations
      ? `${l.organizationName} — ${l.locationName}`
      : l.locationName;

  // Only same-organization locations the caller can also manage are valid
  // reassignment targets (the RPC re-checks the destination regardless).
  const reassignTargets = selected
    ? locations
        .filter((l) => l.organizationId === selected.organizationId)
        .map((l) => ({ id: l.locationId, name: l.locationName }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="secondary"
          size="icon"
          onClick={onBack}
          aria-label="Back to Settings"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Kiosks
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pair, rename, revoke and reassign clock-in tablets at your
            locations.
          </p>
        </div>
      </div>

      {state.status === "loading" ? (
        <Card>
          <CardContent className="pt-5" role="status">
            Loading your kiosk locations…
          </CardContent>
        </Card>
      ) : state.status === "error" ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-5">
            <p role="alert">{state.message}</p>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !selected ? (
        <Card>
          <CardContent className="flex items-start gap-3 pt-5" role="alert">
            <ShieldAlert
              className="text-warn mt-0.5 size-5 flex-none"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                You don&apos;t have access to manage kiosk devices.
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Kiosk management is limited to location managers and
                administrators. If your access changed recently, ask an
                administrator, then reopen Kiosks.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {locations.length > 1 ? (
            <div className="max-w-sm space-y-2">
              <Label htmlFor="kiosk-location-select">Location</Label>
              <Select
                id="kiosk-location-select"
                value={selected.locationId}
                onChange={(e) => setPickedId(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {optionLabel(l)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {optionLabel(selected)}
            </p>
          )}
          <LocationKioskManagement
            key={selected.locationId}
            locationId={selected.locationId}
            locationName={selected.locationName}
            availableLocations={reassignTargets}
          />
        </div>
      )}
    </div>
  );
}
