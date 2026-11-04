"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationTimeZoneSelect } from "./location-time-zone-select";
import type {
  Location,
  LocationAddress,
} from "@/features/locations/domain/location";
import {
  isValidIanaTimeZone,
  isValidLocalTimeString,
  isValidLocationName,
  normalizeLocationAddress,
  normalizeLocationName,
} from "@/features/locations/domain/location";

export interface LocationFormProps {
  readonly mode: "create" | "edit";
  readonly organizationId: string;
  readonly organizationName: string;
  readonly initialLocation?: Location;
  readonly onSubmit: (data: {
    readonly name: string;
    readonly timeZone: string;
    readonly address: LocationAddress;
    readonly coverWeight: number;
    readonly openingLocal: string;
    readonly closingLocal: string;
  }) => Promise<{ ok: boolean; error?: string; code?: string }>;
  readonly onCancel: () => void;
  readonly disabled?: boolean;
}

export function LocationForm({
  mode,
  organizationName,
  initialLocation,
  onSubmit,
  onCancel,
  disabled = false,
}: LocationFormProps) {
  const [name, setName] = React.useState(initialLocation?.name ?? "");
  const [timeZone, setTimeZone] = React.useState(
    initialLocation?.timeZone ?? "America/Chicago",
  );
  const [line1, setLine1] = React.useState(
    initialLocation?.address.line1 ?? "",
  );
  const [line2, setLine2] = React.useState(
    initialLocation?.address.line2 ?? "",
  );
  const [city, setCity] = React.useState(initialLocation?.address.city ?? "");
  const [region, setRegion] = React.useState(
    initialLocation?.address.region ?? "",
  );
  const [postalCode, setPostalCode] = React.useState(
    initialLocation?.address.postalCode ?? "",
  );
  const [countryCode, setCountryCode] = React.useState(
    initialLocation?.address.countryCode ?? "US",
  );
  const [openingLocal, setOpeningLocal] = React.useState(
    initialLocation?.openingLocal ?? "11:00",
  );
  const [closingLocal, setClosingLocal] = React.useState(
    initialLocation?.closingLocal ?? "23:00",
  );
  const [coverWeight, setCoverWeight] = React.useState(
    initialLocation?.coverWeight !== undefined
      ? String(initialLocation.coverWeight)
      : "0.25",
  );
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    const trimmedName = normalizeLocationName(name);
    if (!isValidLocationName(trimmedName)) {
      errors.name = "Location name must be between 1 and 120 characters.";
    }

    if (!isValidIanaTimeZone(timeZone)) {
      errors.timeZone = "Please select a valid IANA time zone identifier.";
    }

    if (!isValidLocalTimeString(openingLocal)) {
      errors.openingLocal = "Opening time must be a valid 24h format (HH:mm).";
    }

    if (!isValidLocalTimeString(closingLocal)) {
      errors.closingLocal = "Closing time must be a valid 24h format (HH:mm).";
    }

    if (openingLocal === closingLocal) {
      errors.closingLocal = "Opening and closing times cannot be identical.";
    }

    const weightNum = Number(coverWeight);
    if (Number.isNaN(weightNum) || weightNum < 0 || weightNum > 10) {
      errors.coverWeight = "Cover weight must be a number between 0 and 10.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || isSubmitting) return;

    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const addressPayload = normalizeLocationAddress({
        line1: line1.trim() || undefined,
        line2: line2.trim() || undefined,
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
      });

      const res = await onSubmit({
        name: normalizeLocationName(name),
        timeZone: timeZone.trim(),
        address: addressPayload,
        coverWeight: Number(coverWeight),
        openingLocal: openingLocal.trim(),
        closingLocal: closingLocal.trim(),
      });

      if (!res.ok) {
        if (res.code === "23505" || res.error?.includes("already exists")) {
          setFieldErrors((prev) => ({
            ...prev,
            name: "A location with this name already exists in this organization.",
          }));
        } else {
          setFormError(res.error || "Failed to save location details.");
        }
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {formError && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-3 text-xs font-medium"
        >
          {formError}
        </div>
      )}

      {/* Section 1: Basic Information */}
      <div className="space-y-3">
        <h3 className="text-foreground text-sm font-semibold">
          1. Basic Information
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="location-name">Location Name</Label>
            <Input
              id="location-name"
              type="text"
              placeholder="e.g. Downtown, NASA, North Campus"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: "" }));
                }
              }}
              disabled={disabled || isSubmitting}
              className={
                fieldErrors.name
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              autoFocus
            />
            {fieldErrors.name && (
              <p className="text-destructive text-xs font-medium">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-org">Organization</Label>
            <Input
              id="location-org"
              type="text"
              value={organizationName}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Physical Address */}
      <div className="space-y-3 pt-1">
        <h3 className="text-foreground text-sm font-semibold">
          2. Physical Address
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="address-line1">Street address</Label>
            <Input
              id="address-line1"
              type="text"
              placeholder="123 Main St"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              disabled={disabled || isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address-line2">Apartment / Suite (optional)</Label>
            <Input
              id="address-line2"
              type="text"
              placeholder="Suite 200, Bay A"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              disabled={disabled || isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="col-span-2 space-y-1.5 sm:col-span-2">
              <Label htmlFor="address-city">City</Label>
              <Input
                id="address-city"
                type="text"
                placeholder="Houston"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={disabled || isSubmitting}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="address-region">State / Region</Label>
              <Input
                id="address-region"
                type="text"
                placeholder="TX"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={disabled || isSubmitting}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="address-postal">Postal Code</Label>
              <Input
                id="address-postal"
                type="text"
                placeholder="77058"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={disabled || isSubmitting}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="address-country">Country</Label>
              <Input
                id="address-country"
                type="text"
                placeholder="US"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                disabled={disabled || isSubmitting}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Time Zone */}
      <div className="space-y-3 pt-1">
        <h3 className="text-foreground text-sm font-semibold">3. Time Zone</h3>
        <div className="space-y-1.5">
          <Label htmlFor="location-timezone">IANA Time Zone</Label>
          <LocationTimeZoneSelect
            id="location-timezone"
            value={timeZone}
            onChange={(val) => {
              setTimeZone(val);
              if (fieldErrors.timeZone) {
                setFieldErrors((prev) => ({ ...prev, timeZone: "" }));
              }
            }}
            disabled={disabled || isSubmitting}
          />
          {fieldErrors.timeZone && (
            <p className="text-destructive text-xs font-medium">
              {fieldErrors.timeZone}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Used for store schedules, shifts, and timestamps local to this
            restaurant.
          </p>
        </div>
      </div>

      {/* Section 4: Operating Defaults & Advanced Settings */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">
            4. Operating Defaults
          </h3>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-primary text-xs font-medium hover:underline"
          >
            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="opening-default">Fallback Opening Time</Label>
            <Input
              id="opening-default"
              type="time"
              value={openingLocal}
              onChange={(e) => setOpeningLocal(e.target.value)}
              disabled={disabled || isSubmitting}
            />
            {fieldErrors.openingLocal && (
              <p className="text-destructive text-xs font-medium">
                {fieldErrors.openingLocal}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-default">Fallback Closing Time</Label>
            <Input
              id="closing-default"
              type="time"
              value={closingLocal}
              onChange={(e) => setClosingLocal(e.target.value)}
              disabled={disabled || isSubmitting}
            />
            {fieldErrors.closingLocal && (
              <p className="text-destructive text-xs font-medium">
                {fieldErrors.closingLocal}
              </p>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="border-border bg-muted/40 mt-2 space-y-2 rounded-xl border p-3">
            <Label htmlFor="cover-weight">Cover Weight (0.00 – 10.00)</Label>
            <Input
              id="cover-weight"
              type="number"
              step="0.05"
              min="0"
              max="10"
              value={coverWeight}
              onChange={(e) => setCoverWeight(e.target.value)}
              disabled={disabled || isSubmitting}
              className="h-9 w-36 text-xs"
            />
            <p className="text-muted-foreground text-xs">
              Operational weight factor for table rotation balancing (default:
              0.25).
            </p>
            {fieldErrors.coverWeight && (
              <p className="text-destructive text-xs font-medium">
                {fieldErrors.coverWeight}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="border-border flex items-center justify-end gap-3 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={disabled || isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled || isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Location"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
