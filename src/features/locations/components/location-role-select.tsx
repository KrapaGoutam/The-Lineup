"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { LocationRole } from "@/features/auth/domain/location-role";
import { isLocationRole } from "@/features/auth/domain/location-role";
import { LOCATION_ROLE_OPTIONS } from "@/features/locations/domain/staff-assignment";

export interface LocationRoleSelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: LocationRole;
  readonly onChange: (role: LocationRole) => void;
  readonly disabled?: boolean;
  /** Visually hide the label while keeping it available to assistive tech. */
  readonly hideLabel?: boolean;
  readonly className?: string;
}

/**
 * The only control that may choose a location role. Offers exactly the three
 * canonical values (manager, assistant_manager, staff) — never organization or
 * overall role vocabularies.
 */
export function LocationRoleSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  hideLabel,
  className,
}: LocationRoleSelectProps) {
  return (
    <div className={className}>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block"}>
        {label}
      </Label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          if (isLocationRole(next)) onChange(next);
        }}
      >
        {LOCATION_ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
