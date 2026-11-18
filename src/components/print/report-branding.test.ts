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
    // Verified official address: Webster, TEXAS (never New York).
    expect(brand.streetAddress).toBe("1416 FM 528 Rd, Suite D");
    expect(brand.cityState).toBe("Webster, TX 77598");
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
    expect(brand.cityState).toBeUndefined(); // no address on record: not guessed
    expect(brand.streetAddress).toBeUndefined();
    expect(brand.website).toBeUndefined();
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
    expect(brand.cityState).toBeUndefined();
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

  it("prefers the canonical location address over the verified Monks fallback", () => {
    const brand = resolveReportBrand({
      organizationName: "The Monk's",
      organizationSlug: "the-monks",
      locationName: "Webster",
      locationAddress: {
        line1: "1 Other Rd",
        city: "Webster",
        region: "TX",
        postalCode: "77598",
      },
    });
    expect(brand.streetAddress).toBe("1 Other Rd");
    expect(brand.cityState).toBe("Webster, TX 77598");
  });

  it("does not print the Webster address for another Monks branch without an address", () => {
    const brand = resolveReportBrand({
      organizationName: "The Monk's",
      organizationSlug: "the-monks",
      locationName: "Katy",
    });
    expect(brand.branchName).toBe("Katy");
    expect(brand.streetAddress).toBeUndefined();
    expect(brand.cityState).toBeUndefined();
  });

  it("keeps Liquor Tap League City and NASA distinct and free of Monks branding", () => {
    const lc = resolveReportBrand({
      organizationName: "Liquor Tap",
      organizationSlug: "liquor-tap",
      locationName: "League City",
    });
    const nasa = resolveReportBrand({
      organizationName: "Liquor Tap",
      organizationSlug: "liquor-tap",
      locationName: "NASA",
    });
    expect(lc.branchName).toBe("League City");
    expect(nasa.branchName).toBe("NASA");
    for (const b of [lc, nasa]) {
      expect(b.organizationName).toBe("Liquor Tap");
      expect(b.logoMarkup).toBeNull();
      expect(b.website).toBeUndefined();
      expect(b.streetAddress).toBeUndefined();
      expect(JSON.stringify(b)).not.toMatch(/monk|webster|1416/i);
    }
  });

  it("never lets caller input become logo markup", () => {
    const brand = resolveReportBrand({
      organizationName: "Evil Bistro",
      logoMarkup: "<script>alert(1)</script>",
    } as never);
    expect(brand.logoMarkup).toBeNull();
    const monks = resolveReportBrand({
      organizationName: "The Monk's",
      logoMarkup: "<script>alert(1)</script>",
    } as never);
    expect(monks.logoMarkup).toBe(THE_MONKS_LOGO_MARKUP);
  });

  it("falls back to Monks when no input is provided (backward compatibility)", () => {
    const brand = resolveReportBrand();
    expect(brand.organizationName).toBe(
      VERIFIED_BRAND_CONFIGS.monks.organizationName,
    );
    expect(brand.logoMarkup).toBe(THE_MONKS_LOGO_MARKUP);
  });
});
