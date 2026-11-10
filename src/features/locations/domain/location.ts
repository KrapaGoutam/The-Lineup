/**
 * V2-002.002 — Location Model
 * Canonical domain entities, contracts, validation, and normalization for restaurant locations (branches).
 */

import type { Database } from "@/types/database.generated";

export type DatabaseLocationRow =
  Database["public"]["Tables"]["locations"]["Row"];

export type DatabaseOperatingHoursRow =
  Database["public"]["Tables"]["operating_hours"]["Row"];

/**
 * Structured physical address contract for a restaurant location.
 */
export interface LocationAddress {
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly [key: string]: unknown;
}

/**
 * Weekly operating hours per day of week (0 = Sunday ... 6 = Saturday).
 */
export interface DayOperatingHours {
  readonly dayOfWeek: number;
  readonly openingLocal: string | null;
  readonly closingLocal: string | null;
  readonly closed: boolean;
  readonly isOvernight?: boolean;
}

/**
 * Canonical domain entity for a restaurant branch/location.
 */
export interface Location {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly address: LocationAddress;
  readonly coverWeight: number;
  readonly active: boolean;
  /**
   * V2-002.005: non-null only for ARCHIVED locations (`active` is then false).
   * Optional for backward compatibility; use `getLocationLifecycleStatus`.
   */
  readonly archivedAt?: string | null;
  /**
   * V2-006.001: Per-location attendance mode configuration.
   * Null if unconfigured (legacy/unmigrated).
   */
  readonly attendanceMode?:
    | "external"
    | "internal_the_lineup"
    | "disabled"
    | null;
  readonly openingLocal: string;
  readonly closingLocal: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Lightweight summary contract for location listings, multi-location readers,
 * and future active context switcher (V2-003).
 */
export interface LocationSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly active: boolean;
  readonly coverWeight?: number;
  readonly openingLocal?: string;
  readonly closingLocal?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const LOCAL_TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

let ianaZonesCache: Set<string> | null = null;

function getIanaZones(): Set<string> {
  if (!ianaZonesCache) {
    try {
      ianaZonesCache = new Set(Intl.supportedValuesOf("timeZone"));
    } catch {
      ianaZonesCache = new Set();
    }
  }
  return ianaZonesCache;
}

/**
 * Validates that a location name is non-empty, non-whitespace, and 1–120 characters.
 */
export function isValidLocationName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 120;
}

/**
 * Normalizes a location name by trimming and collapsing consecutive whitespace.
 */
export function normalizeLocationName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Validates that a time-zone string is an authoritative IANA time zone identifier.
 * Accepts canonical named zones (e.g. 'America/Chicago', 'America/New_York', 'UTC').
 * Rejects ambiguous abbreviations ('CST', 'EST', 'GMT-6') and arbitrary text ('Texas').
 */
export function isValidIanaTimeZone(timeZone: unknown): boolean {
  if (typeof timeZone !== "string") return false;
  const trimmed = timeZone.trim();
  if (!trimmed) return false;
  if (trimmed === "UTC") return true;

  const supported = getIanaZones();
  if (supported.size > 0) {
    return supported.has(trimmed);
  }

  // Fallback if Intl.supportedValuesOf is unavailable
  if (!trimmed.includes("/")) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a valid 24-hour local wall-clock time string (HH:mm or HH:mm:ss).
 */
export function isValidLocalTimeString(time: unknown): boolean {
  if (typeof time !== "string") return false;
  return LOCAL_TIME_REGEX.test(time.trim());
}

/**
 * Validates a physical address payload.
 * Accepts legacy empty objects `{}` for backward compatibility.
 */
export function validateLocationAddress(address: unknown): ValidationResult {
  const errors: string[] = [];

  if (
    typeof address !== "object" ||
    address === null ||
    Array.isArray(address)
  ) {
    return { valid: false, errors: ["Address must be a JSON object."] };
  }

  const addr = address as Record<string, unknown>;

  if (addr.line1 !== undefined && addr.line1 !== null) {
    if (typeof addr.line1 !== "string" || addr.line1.length > 120) {
      errors.push(
        "Street address line 1 must be a string up to 120 characters.",
      );
    }
  }

  if (addr.line2 !== undefined && addr.line2 !== null) {
    if (typeof addr.line2 !== "string" || addr.line2.length > 120) {
      errors.push(
        "Street address line 2 must be a string up to 120 characters.",
      );
    }
  }

  if (addr.city !== undefined && addr.city !== null) {
    if (typeof addr.city !== "string" || addr.city.length > 100) {
      errors.push("City must be a string up to 100 characters.");
    }
  }

  if (addr.region !== undefined && addr.region !== null) {
    if (typeof addr.region !== "string" || addr.region.length > 100) {
      errors.push("Region / State must be a string up to 100 characters.");
    }
  }

  if (addr.postalCode !== undefined && addr.postalCode !== null) {
    if (typeof addr.postalCode !== "string" || addr.postalCode.length > 20) {
      errors.push("Postal code must be a string up to 20 characters.");
    }
  }

  if (addr.countryCode !== undefined && addr.countryCode !== null) {
    if (typeof addr.countryCode !== "string" || addr.countryCode.length > 10) {
      errors.push("Country code must be a string up to 10 characters.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes an address object, trimming strings and omitting empty fields.
 */
export function normalizeLocationAddress(
  address: LocationAddress | undefined | null,
): LocationAddress {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  if (typeof address.line1 === "string" && address.line1.trim()) {
    result.line1 = address.line1.trim();
  }
  if (typeof address.line2 === "string" && address.line2.trim()) {
    result.line2 = address.line2.trim();
  }
  if (typeof address.city === "string" && address.city.trim()) {
    result.city = address.city.trim();
  }
  if (typeof address.region === "string" && address.region.trim()) {
    result.region = address.region.trim();
  }
  if (typeof address.postalCode === "string" && address.postalCode.trim()) {
    result.postalCode = address.postalCode.trim();
  }
  if (typeof address.countryCode === "string" && address.countryCode.trim()) {
    result.countryCode = address.countryCode.trim().toUpperCase();
  }

  // Preserve other custom safe keys
  for (const [key, value] of Object.entries(address)) {
    if (
      ![
        "line1",
        "line2",
        "city",
        "region",
        "postalCode",
        "countryCode",
      ].includes(key) &&
      value !== undefined
    ) {
      result[key] = value;
    }
  }

  return result as LocationAddress;
}

/**
 * Validates a single day's operating hours schedule.
 * Supports overnight hours (openingLocal > closingLocal, e.g. 17:00 -> 02:00).
 */
export function validateDayOperatingHours(day: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof day !== "object" || day === null || Array.isArray(day)) {
    return { valid: false, errors: ["Day operating hours must be an object."] };
  }

  const d = day as Partial<DayOperatingHours>;

  if (
    typeof d.dayOfWeek !== "number" ||
    !Number.isInteger(d.dayOfWeek) ||
    d.dayOfWeek < 0 ||
    d.dayOfWeek > 6
  ) {
    errors.push(
      "Day of week must be an integer between 0 (Sunday) and 6 (Saturday).",
    );
  }

  if (typeof d.closed !== "boolean") {
    errors.push("Closed must be a boolean flag.");
  } else if (d.closed) {
    // If closed, opening and closing must be null or omitted
    if (d.openingLocal !== null && d.openingLocal !== undefined) {
      errors.push("Opening time must be null when location is closed.");
    }
    if (d.closingLocal !== null && d.closingLocal !== undefined) {
      errors.push("Closing time must be null when location is closed.");
    }
  } else {
    // If open, opening and closing must be valid time strings and different
    if (!isValidLocalTimeString(d.openingLocal)) {
      errors.push("Opening local time must be a valid HH:mm string.");
    }
    if (!isValidLocalTimeString(d.closingLocal)) {
      errors.push("Closing local time must be a valid HH:mm string.");
    }
    if (
      isValidLocalTimeString(d.openingLocal) &&
      isValidLocalTimeString(d.closingLocal) &&
      d.openingLocal === d.closingLocal
    ) {
      errors.push("Opening and closing times cannot be identical.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Determines whether a given open schedule crosses midnight (overnight business hours).
 */
export function isOvernightOperatingHours(
  openingLocal: string,
  closingLocal: string,
): boolean {
  if (
    !isValidLocalTimeString(openingLocal) ||
    !isValidLocalTimeString(closingLocal)
  ) {
    return false;
  }
  return closingLocal < openingLocal;
}

/**
 * Maps a database locations row to the canonical Location domain entity.
 */
export function mapLocationRow(row: DatabaseLocationRow): Location {
  const rawAddress =
    typeof row.address === "object" &&
    row.address !== null &&
    !Array.isArray(row.address)
      ? (row.address as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    timeZone: row.time_zone,
    address: {
      line1:
        typeof rawAddress.line1 === "string" ? rawAddress.line1 : undefined,
      line2:
        typeof rawAddress.line2 === "string" ? rawAddress.line2 : undefined,
      city: typeof rawAddress.city === "string" ? rawAddress.city : undefined,
      region:
        typeof rawAddress.region === "string" ? rawAddress.region : undefined,
      postalCode:
        typeof rawAddress.postalCode === "string"
          ? rawAddress.postalCode
          : undefined,
      countryCode:
        typeof rawAddress.countryCode === "string"
          ? rawAddress.countryCode
          : undefined,
      ...rawAddress,
    },
    coverWeight: Number(row.cover_weight),
    active: Boolean(row.active),
    archivedAt: (row as { archived_at?: string | null }).archived_at ?? null,
    attendanceMode:
      (
        row as {
          attendance_mode?:
            | "external"
            | "internal_the_lineup"
            | "disabled"
            | null;
        }
      ).attendance_mode ?? null,
    openingLocal: row.opening_local,
    closingLocal: row.closing_local,
    createdAt: row.created_at,
    updatedAt: (row as { updated_at?: string }).updated_at ?? row.created_at,
  };
}

/**
 * Maps a database operating_hours row to DayOperatingHours domain entity.
 */
export function mapOperatingHoursRow(
  row: DatabaseOperatingHoursRow,
): DayOperatingHours {
  const isOvernight =
    !row.closed && row.opening_local && row.closing_local
      ? isOvernightOperatingHours(row.opening_local, row.closing_local)
      : false;

  return {
    dayOfWeek: row.day_of_week,
    openingLocal: row.opening_local,
    closingLocal: row.closing_local,
    closed: row.closed,
    isOvernight,
  };
}
