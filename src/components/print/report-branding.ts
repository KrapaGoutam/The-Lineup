import { THE_MONKS_LOGO_MARKUP } from "./the-monks-logo-markup";

/**
 * Report brand configuration contract for printed statements and letterheads.
 * Synchronous and network-independent: vector logos are inlined as raw SVG paths
 * so print preview and hardcopy output never depend on external network assets.
 */
export interface ReportBrandConfig {
  readonly organizationName: string;
  readonly branchName?: string;
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

export interface LocationAddressLike {
  readonly city?: string;
  readonly region?: string;
  readonly state?: string;
  readonly [key: string]: unknown;
}

export interface ResolveBrandInput {
  readonly organizationName?: string | null;
  readonly organizationSlug?: string | null;
  readonly locationName?: string | null;
  readonly locationAddress?: LocationAddressLike | null;
  readonly cityState?: string | null;
  readonly website?: string | null;
  readonly logoMarkup?: string | null;
}

/** Verified canonical brand configurations */
export const VERIFIED_BRAND_CONFIGS: Record<
  string,
  Partial<ReportBrandConfig>
> = {
  monks: {
    organizationName: "The Monk's",
    branchName: "Webster",
    cityState: "Webster, New York",
    website: "monkswebster.com",
    logoMarkup: THE_MONKS_LOGO_MARKUP,
    logoViewBox: "0 0 948 928",
    logoAriaLabel: "The Monk's Indian Fusion crest",
    fallbackMarkText: "TM",
  },
  "liquor-tap": {
    organizationName: "Liquor Tap",
    branchName: "League City",
    cityState: "League City, Texas",
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

function formatCityState(
  addr?: LocationAddressLike | null,
): string | undefined {
  if (!addr) return undefined;
  const city = addr.city?.trim();
  const state = (addr.region || addr.state)?.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || undefined;
}

/**
 * Resolves dynamic organization and branch branding for letterheads and report statements.
 * Preference order:
 * 1. Explicit verified organization config (Monks, Liquor Tap, The Lineup).
 * 2. Dynamic organization metadata and location address provided in input.
 * 3. Default fallback to canonical Monks Webster for backward compatibility.
 */
export function resolveReportBrand(
  input?: ResolveBrandInput | null,
): ReportBrandConfig {
  const hasOrg = Boolean(
    input?.organizationName?.trim() || input?.organizationSlug?.trim(),
  );
  if (!input || !hasOrg) {
    const base = VERIFIED_BRAND_CONFIGS.monks;
    return {
      organizationName: base.organizationName!,
      branchName: input?.locationName?.trim() || base.branchName,
      cityState:
        input?.cityState?.trim() ||
        formatCityState(input?.locationAddress) ||
        base.cityState,
      website: input?.website?.trim() || base.website,
      logoMarkup:
        input?.logoMarkup !== undefined ? input?.logoMarkup : base.logoMarkup,
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

  const addressCityState =
    input.cityState?.trim() || formatCityState(input.locationAddress);

  if (isMonks) {
    const base = VERIFIED_BRAND_CONFIGS.monks;
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: input.locationName?.trim() || base.branchName,
      cityState: addressCityState || base.cityState,
      website: input.website?.trim() || base.website,
      logoMarkup:
        input.logoMarkup !== undefined ? input.logoMarkup : base.logoMarkup,
      logoViewBox: base.logoViewBox,
      logoAriaLabel: base.logoAriaLabel,
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  if (isLiquorTap) {
    const base = VERIFIED_BRAND_CONFIGS["liquor-tap"];
    const branch = input.locationName?.trim() || base.branchName;
    let cityState = addressCityState;
    if (!cityState) {
      if (branch?.toLowerCase().includes("nasa")) {
        cityState = "Houston, Texas";
      } else {
        cityState = "League City, Texas";
      }
    }
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: branch,
      cityState,
      website: input.website?.trim() || undefined,
      logoMarkup: input.logoMarkup ?? null, // Do not invent an unverified logo
      fallbackMarkText: base.fallbackMarkText,
    };
  }

  if (isLineup) {
    const base = VERIFIED_BRAND_CONFIGS["the-lineup"];
    return {
      organizationName: rawOrgName || base.organizationName!,
      branchName: input.locationName?.trim() || base.branchName,
      cityState: addressCityState || base.cityState,
      website: input.website?.trim() || undefined,
      logoMarkup: input.logoMarkup ?? null,
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
    cityState: addressCityState,
    website: input.website?.trim() || undefined,
    logoMarkup: input.logoMarkup ?? null,
    fallbackMarkText: initials || "TL",
  };
}
