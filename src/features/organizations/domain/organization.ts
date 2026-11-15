/**
 * V2-002.001 — Organization Model
 * Canonical domain entities, contracts, validation, and normalization for organizations.
 */

import type { Database } from "@/types/database.generated";

export type DatabaseOrganizationRow =
  Database["public"]["Tables"]["organizations"]["Row"];

/**
 * Organization branding configuration stored inside organization settings.
 */
export interface OrganizationBranding {
  readonly logoPath?: string | null;
  readonly displayName?: string | null;
  readonly primaryColor?: string | null;
}

/**
 * Strongly-typed organization settings contract.
 * Preserves safe custom keys while strictly validating known contracts like branding.
 */
export interface OrganizationSettings {
  readonly branding?: OrganizationBranding;
  readonly [key: string]: unknown;
}

/**
 * Canonical domain model for an organization tenant in The Lineup V2.
 */
export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdBy: string;
  readonly settings: OrganizationSettings;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Lightweight summary contract for organization listings and future context switcher (V2-003).
 */
export interface UserOrganizationSummary {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly role?: string;
  readonly isOverallAuthorized: boolean;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FORBIDDEN_URL_SCHEMES = /^(?:javascript|data|vbscript):/i;

const SECRET_KEY_PATTERNS = [
  /access[-_]?token/i,
  /api[-_]?key/i,
  /secret/i,
  /service[-_]?role/i,
  /password/i,
  /bearer/i,
];

const SECRET_VALUE_PATTERNS = [
  /^sbp_[a-zA-Z0-9_-]{20,}/,
  /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT pattern
  /^ghp_[a-zA-Z0-9]{20,}/,
  /^sk_live_[a-zA-Z0-9]+/,
];

/**
 * Validates that an organization name is non-empty, non-whitespace, and within 1–120 characters.
 */
export function isValidOrganizationName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 120;
}

/**
 * Normalizes an organization name by trimming and collapsing multiple spaces.
 */
export function normalizeOrganizationName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Validates that an organization slug strictly adheres to the canonical slug format:
 * lowercase alphanumeric with single internal hyphens, 1–120 characters.
 */
export function isValidOrganizationSlug(slug: unknown): boolean {
  if (typeof slug !== "string") return false;
  if (slug.length < 1 || slug.length > 120) return false;
  return SLUG_REGEX.test(slug);
}

/**
 * Deterministically normalizes a raw string into a canonical organization slug.
 * Transforms to lowercase, converts spaces and invalid characters to hyphens,
 * removes consecutive hyphens, and trims leading/trailing hyphens.
 */
export function normalizeOrganizationSlug(raw: string): string {
  if (!raw) return "";
  const lower = raw.trim().toLowerCase();
  const hyphenated = lower.replace(/[^a-z0-9]+/g, "-");
  return hyphenated.replace(/^-+|-+$/g, "").slice(0, 120);
}

/**
 * Validates whether a string is a valid CSS hex color code (e.g. #fff, #123456).
 */
export function isValidHexColor(color: unknown): boolean {
  if (typeof color !== "string") return false;
  return HEX_COLOR_REGEX.test(color.trim());
}

/**
 * Validates whether a brand logo path is safe and conforms to storage constraints.
 * Rejects executable schemes (javascript:, data:) and excessive length.
 */
export function isValidLogoPath(path: unknown): boolean {
  if (path === null || path === undefined) return true;
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  return !FORBIDDEN_URL_SCHEMES.test(trimmed);
}

/**
 * Recursively inspects an object to ensure no credentials or secrets are stored.
 */
export function containsSecretPattern(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretPattern(item));
  }

  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(k))) {
        return true;
      }
      if (containsSecretPattern(v)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates an OrganizationBranding contract.
 */
export function validateOrganizationBranding(
  branding: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (branding === null || branding === undefined) {
    return { valid: true, errors: [] };
  }

  if (typeof branding !== "object" || Array.isArray(branding)) {
    return { valid: false, errors: ["Branding must be a valid JSON object."] };
  }

  const b = branding as Record<string, unknown>;

  if (
    "displayName" in b &&
    b.displayName !== null &&
    b.displayName !== undefined
  ) {
    if (
      typeof b.displayName !== "string" ||
      b.displayName.trim().length === 0
    ) {
      errors.push(
        "Branding displayName must be a non-empty string when provided.",
      );
    } else if (b.displayName.length > 120) {
      errors.push("Branding displayName cannot exceed 120 characters.");
    }
  }

  if (
    "primaryColor" in b &&
    b.primaryColor !== null &&
    b.primaryColor !== undefined
  ) {
    if (!isValidHexColor(b.primaryColor)) {
      errors.push(
        "Branding primaryColor must be a valid hex color code (e.g. #1a2b3c).",
      );
    }
  }

  if ("logoPath" in b && b.logoPath !== null && b.logoPath !== undefined) {
    if (!isValidLogoPath(b.logoPath)) {
      errors.push(
        "Branding logoPath must be a valid, safe path or URL without executable schemes.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an OrganizationSettings object.
 * Enforces that settings is an object, does not contain secrets, and validates branding.
 */
export function validateOrganizationSettings(
  settings: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (settings === null || settings === undefined) {
    return { valid: false, errors: ["Settings cannot be null or undefined."] };
  }

  if (typeof settings !== "object" || Array.isArray(settings)) {
    return { valid: false, errors: ["Settings must be a JSON object."] };
  }

  if (containsSecretPattern(settings)) {
    errors.push(
      "Settings must not contain secrets, tokens, or credential keys.",
    );
  }

  const s = settings as Record<string, unknown>;
  if ("branding" in s && s.branding !== undefined) {
    const brandingResult = validateOrganizationBranding(s.branding);
    if (!brandingResult.valid) {
      errors.push(...brandingResult.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merges new settings into existing settings safely, preserving existing keys.
 */
export function mergeOrganizationSettings(
  existing: OrganizationSettings | null | undefined,
  patch: Partial<OrganizationSettings>,
): OrganizationSettings {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  const mergedBranding = patch.branding
    ? {
        ...(base.branding ?? {}),
        ...patch.branding,
      }
    : base.branding;

  return {
    ...base,
    ...patch,
    ...(mergedBranding ? { branding: mergedBranding } : {}),
  };
}

/**
 * Maps a raw database row from public.organizations to the canonical domain Organization.
 */
export function mapOrganizationRow(row: DatabaseOrganizationRow): Organization {
  const settingsObj =
    row.settings &&
    typeof row.settings === "object" &&
    !Array.isArray(row.settings)
      ? (row.settings as unknown as OrganizationSettings)
      : {};

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdBy: row.created_by,
    settings: Object.freeze(settingsObj),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
