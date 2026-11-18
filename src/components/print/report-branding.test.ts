import { describe, expect, it } from "vitest";

import { resolveReportBrand, VERIFIED_BRAND_CONFIGS } from "./report-branding";
import { THE_MONKS_LOGO_MARKUP } from "./the-monks-logo-markup";

describe("resolveReportBrand", () => {
  it("resolves Monks Webster with verified vector crest and website", () => {
    const brand = resolveReportBrand({
      organizationName: "The Monk's",
      organizationSlug: "the-monks",
      locationName: "Webster",
    });

    expect(brand.organizationName).toBe("The Monk's");
    expect(brand.branchName).toBe("Webster");
    expect(brand.cityState).toBe("Webster, New York");
    expect(brand.website).toBe("monkswebster.com");
    expect(brand.logoMarkup).toBe(THE_MONKS_LOGO_MARKUP);
    expect(brand.logoAriaLabel).toContain("Indian Fusion crest");
  });

  it("resolves Liquor Tap League City with organization-name fallback and no unverified logo", () => {
    const brand = resolveReportBrand({
      organizationName: "Liquor Tap",
      organizationSlug: "liquor-tap",
      locationName: "League City",
    });

    expect(brand.organizationName).toBe("Liquor Tap");
    expect(brand.branchName).toBe("League City");
    expect(brand.cityState).toBe("League City, Texas");
    expect(brand.logoMarkup).toBeNull(); // Requirement B4: do not invent or download unverified logo
    expect(brand.fallbackMarkText).toBe("LT");
  });

  it("resolves Liquor Tap NASA with correct branch and city", () => {
    const brand = resolveReportBrand({
      organizationName: "Liquor Tap",
      organizationSlug: "liquor-tap",
      locationName: "NASA",
    });

    expect(brand.organizationName).toBe("Liquor Tap");
    expect(brand.branchName).toBe("NASA");
    expect(brand.cityState).toBe("Houston, Texas");
    expect(brand.logoMarkup).toBeNull();
  });

  it("resolves The Lineup platform fallback", () => {
    const brand = resolveReportBrand({
      organizationName: "The Lineup",
      organizationSlug: "the-lineup",
      locationName: "Operations",
    });

    expect(brand.organizationName).toBe("The Lineup");
    expect(brand.branchName).toBe("Operations");
    expect(brand.cityState).toBe("Restaurant Management Platform");
    expect(brand.logoMarkup).toBeNull();
    expect(brand.fallbackMarkText).toBe("TL");
  });

  it("formats structured location address when supplied", () => {
    const brand = resolveReportBrand({
      organizationName: "Custom Bistro",
      locationName: "Downtown",
      locationAddress: {
        city: "Austin",
        region: "Texas",
      },
    });

    expect(brand.organizationName).toBe("Custom Bistro");
    expect(brand.branchName).toBe("Downtown");
    expect(brand.cityState).toBe("Austin, Texas");
    expect(brand.fallbackMarkText).toBe("CB");
  });

  it("falls back to Monks when no input is provided (backward compatibility)", () => {
    const brand = resolveReportBrand();
    expect(brand.organizationName).toBe(
      VERIFIED_BRAND_CONFIGS.monks.organizationName,
    );
    expect(brand.logoMarkup).toBe(THE_MONKS_LOGO_MARKUP);
  });
});
