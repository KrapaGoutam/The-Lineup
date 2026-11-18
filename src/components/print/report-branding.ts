import { THE_MONKS_LOGO_MARKUP } from "./the-monks-logo-markup";

/**
 * Report brand configuration contract for printed statements and letterheads.
 * Synchronous and network-independent: vector logos are inlined as raw SVG paths
 * so print preview and hardcopy output never depend on external network assets.
 *
 * SECURITY: `logoMarkup` reaches `dangerouslySetInnerHTML`. It may therefore only ever
 * come from the trusted, repo-controlled constants in this module. `resolveReportBrand`
 * deliberately has NO input for logo markup, so request, database or user data can never
 * become raw HTML.
 */
export interface ReportBrandConfig {
  readonly organizationName: string;
  readonly branchName?: string;
  /** Street line(s), e.g. "1416 FM 528 Rd, Suite D". */
  readonly streetAddress?: string;
  /** City / state / postal line, e.g. "Webster, TX 77598". */
  readonly cityState?: string;
  readonly website?: string;
  /** Inlined SVG path markup for synchronous printing (e.g. The Monk's crest). */
  readonly logoMarkup?: string | null;
  /** SVG viewBox string (defaults to "0 0 948 928" for Monks crest). */
  readonly logoViewBox?: string;
  readonly logoAriaLabel?: string;
  /** 1-3 letter initials for text fallback mark when no verified vector logo exists. */
  readonly fallbackMarkText?: string;
}

/** Shape of the canonical `locations.address` JSON (see `LocationAddress`). */
export interface LocationAddressLike {
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly [key: string]: unknown;
}

export interface ResolveBrandInput {
  readonly organizationName?: string | null;
  readonly organizationSlug?: string | null;
  readonly locationName?: string | null;
  /** Canonical location address. Preferred over any fallback when it has content. */
  readonly locationAddress?: LocationAddressLike | null;
  readonly cityState?: string | null;
  readonly website?: string | null;
}

/** Verified canonical brand configurations */
export const VERIFIED_BRAND_CONFIGS: Record<
  string,
  Partial<ReportBrandConfig>
> = {
  monks: {
    organizationName: "The Monk's",
    branchName: "Webster",
    // Official published address of The Monk's Indian Fusion, Webster (Texas).
    streetAddress: "1416 FM 528 Rd, Suite D",
    cityState: "Webster, TX 77598",
    website: "monkswebster.com",
    logoMarkup: THE_MONKS_LOGO_MARKUP,
    logoViewBox: "0 0 948 928",
    logoAriaLabel: "The Monk's Indian Fusion crest",
    fallbackMarkText: "TM",
  },
  "liquor-tap": {
    organizationName: "Liquor Tap",
    logoMarkup: null, // No verified logo asset in repo — organization-name fallback used
    fallbackMarkText: "LT",
  },
  "the-lineup": {
    organizationName: "The Lineup",
    branchName: "Operations",
    cityState: "Restaurant Management Platform",
    logoMarkup: null,
    fallbackMarkText: "TL",
  },
};

interface FormattedAddress {
  readonly streetAddress?: string;
  readonly cityState?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Formats the canonical address; returns {} when it carries nothing printable. */
function formatAddress(addr?: LocationAddressLike | null): FormattedAddress {
  if (!addr || typeof addr !== "object") return {};
  const line1 = str(addr.line1);
  const line2 = str(addr.line2);
  const city = str(addr.city);
  const region = str(addr.region) ?? str(addr.state);
  const postal = str(addr.postalCode);

  const streetAddress = [line1, line2].filter(Boolean).join(", ") || undefined;
  const regionPostal = [region, postal].filter(Boolean).join(" ") || undefined;
  const cityState =
    [city, regionPostal].filter(Boolean).join(", ") || undefined;
  return { streetAddress, cityState };
}

/** The address to print: location record first, then an explicit city/state override. */
function resolveAddress(input: ResolveBrandInput): FormattedAddress {
  const fromLocation = formatAddress(input.locationAddress);
  if (fromLocation.streetAddress || fromLocation.cityState) return fromLocation;
  const explicit = str(input.cityState);
  return explicit ? { cityState: explicit } : {};
}

function isWebsterBranch(branch?: string | null): boolean {
  const b = branch?.trim().toLowerCase();
  return !b || b === "webster";
}

/**
 * Resolves dynamic organization and branch branding for letterheads and report statements.
 * Preference order:
 * 1. Canonical location address (never overridden by a fallback).
 * 2. Verified organization constants (Monks Webster address/logo/website only).
 * 3. Nothing — an address is omitted rather than guessed from a location name.
 * Without any organization input the canonical Monks Webster identity is used for
 * backward compatibility with older print surfaces.
 */
export function resolveReportBrand(
  input?: ResolveBrandInput | null,
): ReportBrandConfig {
  const hasOrg = Boolean(
    input?.organizationName?.trim() || input?.organizationSlug?.trim(),
  );
  if (!input || !hasOrg) {
    const base = VERIFIED_BRAND_CONFIGS.monks;
    const addr = input ? resolveAddress(input) : {};
    const hasAddr = Boolean(addr.streetAddress || addr.cityState);
    return {
      organizationName: base.organizationName!,
      branchName: input?.locationName?.trim() || base.branchName,
      streetAddress: hasAddr ? addr.streetAddress : base.streetAddress,
      cityState: hasAddr ? addr.cityState : base.cityState,
      website: input?.website?.trim() || base.website,
      logoMarkup: base.logoMarkup,
      logoViewBox: base.logoViewBox,
      logoAriaLabel: base.logoAriaLabel,
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  const slug = (input.organizationSlug ?? "").trim().toLowerCase();
  const rawOrgName = (input.organizationName ?? "").trim();
  const orgNameLower = rawOrgName.toLowerCase();

  // Match canonical brand configuration
  const isMonks =
    slug === "the-monks" || slug === "monks" || orgNameLower.includes("monk");
  const isLiquorTap =
    slug === "liquor-tap" || orgNameLower.includes("liquor tap");
  const isLineup = slug === "the-lineup" || orgNameLower.includes("lineup");

  const addr = resolveAddress(input);
  const hasAddr = Boolean(addr.streetAddress || addr.cityState);

  if (isMonks) {
    const base = VERIFIED_BRAND_CONFIGS.monks;
    const branch = input.locationName?.trim() || base.branchName;
    // The verified Webster address is a fallback for the Webster branch only; another
    // Monks branch with no address on record prints no address rather than Webster's.
    const useWebsterFallback = !hasAddr && isWebsterBranch(input.locationName);
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: branch,
      streetAddress: hasAddr
        ? addr.streetAddress
        : useWebsterFallback
          ? base.streetAddress
          : undefined,
      cityState: hasAddr
        ? addr.cityState
        : useWebsterFallback
          ? base.cityState
          : undefined,
      website: input.website?.trim() || base.website,
      logoMarkup: base.logoMarkup,
      logoViewBox: base.logoViewBox,
      logoAriaLabel: base.logoAriaLabel,
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  if (isLiquorTap) {
    const base = VERIFIED_BRAND_CONFIGS["liquor-tap"];
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: input.locationName?.trim() || undefined,
      streetAddress: addr.streetAddress,
      cityState: addr.cityState,
      website: input.website?.trim() || undefined,
      logoMarkup: null, // Do not invent an unverified logo
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  if (isLineup) {
    const base = VERIFIED_BRAND_CONFIGS["the-lineup"];
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: input.locationName?.trim() || base.branchName,
      streetAddress: addr.streetAddress,
      cityState: hasAddr ? addr.cityState : base.cityState,
      website: input.website?.trim() || undefined,
      logoMarkup: null,
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  // Generic dynamic organization
  const orgName = rawOrgName || "The Lineup";
  const initials = orgName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return {
    organizationName: orgName,
    branchName: input.locationName?.trim() || undefined,
    streetAddress: addr.streetAddress,
    cityState: addr.cityState,
    website: input.website?.trim() || undefined,
    logoMarkup: null,
    fallbackMarkText: initials || "TL",
  };
}
