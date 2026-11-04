"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, MapPin, Search } from "lucide-react";
import type {
  Location,
  LocationAddress,
} from "@/features/locations/domain/location";

export function formatAddressSummary(
  address: LocationAddress | undefined | null,
): string {
  if (!address || typeof address !== "object") return "Address not configured";
  const parts: string[] = [];
  if (address.line1) parts.push(address.line1);
  if (address.city) parts.push(address.city);
  if (address.region) parts.push(address.region);
  if (address.postalCode) parts.push(address.postalCode);
  return parts.length > 0 ? parts.join(", ") : "Address not configured";
}

export interface LocationListProps {
  readonly locations: readonly Location[];
  readonly organizationName: string;
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly onManageLocation: (location: Location) => void;
  readonly onAddLocation: () => void;
  readonly canManage?: boolean;
}

export function LocationList({
  locations,
  organizationName,
  searchQuery,
  onSearchChange,
  onManageLocation,
  onAddLocation,
  canManage = true,
}: LocationListProps) {
  // Deterministic sort: Active first, then alphabetical by name
  const sortedLocations = React.useMemo(() => {
    return [...locations].sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [locations]);

  // Client-side search filtering by name or city
  const filteredLocations = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedLocations;
    return sortedLocations.filter((loc) => {
      const nameMatch = loc.name.toLowerCase().includes(q);
      const cityMatch = loc.address.city
        ? loc.address.city.toLowerCase().includes(q)
        : false;
      return nameMatch || cityMatch;
    });
  }, [sortedLocations, searchQuery]);

  if (locations.length === 0) {
    return (
      <Card className="border-dashed p-8 text-center">
        <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-2xl">
          <MapPin className="size-6" aria-hidden="true" />
        </div>
        <h3 className="text-foreground mt-4 text-base font-semibold">
          No locations yet
        </h3>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          Add your first restaurant location to configure its address, time zone
          and operating hours.
        </p>
        {canManage && (
          <div className="mt-5">
            <Button onClick={onAddLocation} size="sm">
              Add Location
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search locations by name or city..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="border-input bg-background text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 h-10 w-full rounded-xl border pr-3.5 pl-10 text-sm transition outline-none focus-visible:ring-2"
            aria-label="Search locations"
          />
        </div>

        {canManage && (
          <Button onClick={onAddLocation} size="sm" className="shrink-0">
            + Add Location
          </Button>
        )}
      </div>

      {filteredLocations.length === 0 ? (
        <Card className="text-muted-foreground p-6 text-center text-sm">
          No locations match &ldquo;{searchQuery}&rdquo;.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {filteredLocations.map((loc) => {
            const addressSummary = formatAddressSummary(loc.address);
            return (
              <Card
                key={loc.id}
                data-testid={`location-card-${loc.id}`}
                className="hover:border-primary/40 flex flex-col justify-between overflow-hidden p-5 transition"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-foreground text-base font-semibold">
                        {loc.name}
                      </h4>
                      <p className="text-muted-foreground text-xs">
                        {organizationName}
                      </p>
                    </div>
                    <Badge
                      tone={loc.active ? "success" : "neutral"}
                      className="shrink-0 text-xs font-medium"
                    >
                      {loc.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="text-muted-foreground space-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <MapPin
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{addressSummary}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {loc.timeZone} · {loc.openingLocal} – {loc.closingLocal}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-border mt-4 flex items-center justify-end border-t pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onManageLocation(loc)}
                    aria-label={`Manage ${loc.name}`}
                  >
                    Manage
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
