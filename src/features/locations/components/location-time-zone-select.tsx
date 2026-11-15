"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { isValidIanaTimeZone } from "@/features/locations/domain/location";

const COMMON_TIME_ZONES = [
  {
    value: "America/Chicago",
    label: "Central Time (US & Canada) — America/Chicago",
  },
  {
    value: "America/New_York",
    label: "Eastern Time (US & Canada) — America/New_York",
  },
  {
    value: "America/Denver",
    label: "Mountain Time (US & Canada) — America/Denver",
  },
  {
    value: "America/Los_Angeles",
    label: "Pacific Time (US & Canada) — America/Los_Angeles",
  },
  { value: "America/Phoenix", label: "Arizona (no DST) — America/Phoenix" },
  { value: "America/Anchorage", label: "Alaska — America/Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Pacific/Honolulu" },
  { value: "UTC", label: "UTC — Coordinated Universal Time" },
  { value: "Europe/London", label: "London / GMT — Europe/London" },
  { value: "Europe/Paris", label: "Central European Time — Europe/Paris" },
  { value: "Asia/Tokyo", label: "Tokyo — Asia/Tokyo" },
  { value: "Australia/Sydney", label: "Sydney — Australia/Sydney" },
] as const;

export interface LocationTimeZoneSelectProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (timeZone: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function LocationTimeZoneSelect({
  id = "location-timezone",
  value,
  onChange,
  disabled = false,
  className,
}: LocationTimeZoneSelectProps) {
  // Get all supported IANA time zones
  const allIanaZones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return COMMON_TIME_ZONES.map((z) => z.value);
    }
  }, []);

  const isCustomZone =
    Boolean(value) &&
    !COMMON_TIME_ZONES.some((z) => z.value === value) &&
    isValidIanaTimeZone(value);

  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
      aria-label="Time Zone"
    >
      <optgroup label="Common Time Zones">
        {COMMON_TIME_ZONES.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </optgroup>
      {isCustomZone && (
        <optgroup label="Current Selection">
          <option value={value}>{value}</option>
        </optgroup>
      )}
      <optgroup label="All IANA Time Zones">
        {allIanaZones
          .filter((tz) => !COMMON_TIME_ZONES.some((z) => z.value === tz))
          .map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
      </optgroup>
    </Select>
  );
}
