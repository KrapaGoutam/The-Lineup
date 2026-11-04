import { describe, expect, it } from "vitest";

import type { DatabaseOrganizationRow } from "./organization";
import {
  containsSecretPattern,
  isValidHexColor,
  isValidLogoPath,
  isValidOrganizationName,
  isValidOrganizationSlug,
  mapOrganizationRow,
  mergeOrganizationSettings,
  normalizeOrganizationName,
  normalizeOrganizationSlug,
  validateOrganizationBranding,
  validateOrganizationSettings,
} from "./organization";

describe("Organization Domain Model & Validation", () => {
  describe("Name Validation & Normalization (DOM-001 - DOM-004)", () => {
    it("DOM-001: accepts valid organization names", () => {
      expect(isValidOrganizationName("Monks")).toBe(true);
      expect(isValidOrganizationName("Liquor Tap")).toBe(true);
      expect(isValidOrganizationName("Monks Indian Restaurant & Bar")).toBe(
        true,
      );
      expect(isValidOrganizationName("A")).toBe(true);
    });

    it("DOM-002: rejects empty organization names", () => {
      expect(isValidOrganizationName("")).toBe(false);
      expect(isValidOrganizationName(null)).toBe(false);
      expect(isValidOrganizationName(undefined)).toBe(false);
    });

    it("DOM-003: rejects whitespace-only organization names", () => {
      expect(isValidOrganizationName("   ")).toBe(false);
      expect(isValidOrganizationName("\t\n  ")).toBe(false);
    });

    it("DOM-004: rejects names exceeding 120 characters", () => {
      const longName = "A".repeat(121);
      expect(isValidOrganizationName(longName)).toBe(false);
      expect(isValidOrganizationName("A".repeat(120))).toBe(true);
    });

    it("normalizes organization names by trimming and collapsing extra whitespace", () => {
      expect(normalizeOrganizationName("  Monks   Pub  ")).toBe("Monks Pub");
      expect(normalizeOrganizationName("Liquor\t\nTap")).toBe("Liquor Tap");
    });
  });

  describe("Slug Model & Normalization (DOM-005 - DOM-008)", () => {
    it("DOM-005: accepts valid canonical slugs", () => {
      expect(isValidOrganizationSlug("monks")).toBe(true);
      expect(isValidOrganizationSlug("liquor-tap")).toBe(true);
      expect(isValidOrganizationSlug("bar-123-abc")).toBe(true);
    });

    it("DOM-006: rejects uppercase characters in slug", () => {
      expect(isValidOrganizationSlug("Monks")).toBe(false);
      expect(isValidOrganizationSlug("LIQUOR-TAP")).toBe(false);
      expect(normalizeOrganizationSlug("Monks Pub")).toBe("monks-pub");
    });

    it("DOM-007: rejects invalid separators (leading, trailing, or double hyphens)", () => {
      expect(isValidOrganizationSlug("-monks")).toBe(false);
      expect(isValidOrganizationSlug("monks-")).toBe(false);
      expect(isValidOrganizationSlug("monks--pub")).toBe(false);
      expect(isValidOrganizationSlug("monks pub")).toBe(false);
      expect(isValidOrganizationSlug("monks_pub")).toBe(false);
    });

    it("DOM-008: slug normalization is deterministic and handles dirty strings", () => {
      expect(normalizeOrganizationSlug("  Liquor Tap! & Bar  ")).toBe(
        "liquor-tap-bar",
      );
      expect(normalizeOrganizationSlug("---Monks---")).toBe("monks");
      expect(normalizeOrganizationSlug("Monks & Son's")).toBe("monks-son-s");
      expect(normalizeOrganizationSlug("")).toBe("");
    });
  });

  describe("Branding & Settings Validation (DOM-009 - DOM-012)", () => {
    it("DOM-009: rejects non-object settings", () => {
      expect(validateOrganizationSettings(null).valid).toBe(false);
      expect(validateOrganizationSettings(undefined).valid).toBe(false);
      expect(validateOrganizationSettings("string").valid).toBe(false);
      expect(validateOrganizationSettings([1, 2, 3]).valid).toBe(false);
      expect(validateOrganizationSettings(123).valid).toBe(false);
      expect(validateOrganizationSettings({}).valid).toBe(true);
    });

    it("DOM-010: validates branding fields correctly", () => {
      expect(isValidHexColor("#fff")).toBe(true);
      expect(isValidHexColor("#123456")).toBe(true);
      expect(isValidHexColor("#AABBCC")).toBe(true);
      expect(isValidHexColor("red")).toBe(false);
      expect(isValidHexColor("#12345")).toBe(false);
      expect(isValidHexColor("#1234567")).toBe(false);

      expect(isValidLogoPath("/logos/monks.png")).toBe(true);
      expect(isValidLogoPath("https://cdn.example.com/logo.png")).toBe(true);
      expect(isValidLogoPath("javascript:alert(1)")).toBe(false);
      expect(isValidLogoPath("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);

      const validBranding = validateOrganizationBranding({
        displayName: "Monks Tavern",
        primaryColor: "#ffaa00",
        logoPath: "/storage/v1/s3/logos/monks.png",
      });
      expect(validBranding.valid).toBe(true);

      const invalidBranding = validateOrganizationBranding({
        displayName: "   ",
        primaryColor: "not-a-hex",
        logoPath: "javascript:void(0)",
      });
      expect(invalidBranding.valid).toBe(false);
      expect(invalidBranding.errors.length).toBe(3);
    });

    it("DOM-011: preserves safe unknown settings during merge", () => {
      const existing = {
        customPreference: true,
        notificationChannel: "slack",
        branding: {
          primaryColor: "#112233",
          displayName: "Old Name",
        },
      };

      const patch = {
        branding: {
          displayName: "New Name",
        },
        newSetting: 42,
      };

      const merged = mergeOrganizationSettings(existing, patch);
      expect(merged.customPreference).toBe(true);
      expect(merged.notificationChannel).toBe("slack");
      expect(merged.newSetting).toBe(42);
      expect(merged.branding?.displayName).toBe("New Name");
      expect(merged.branding?.primaryColor).toBe("#112233"); // Preserved
    });

    it("DOM-012: rejects settings containing secret-like keys or values", () => {
      expect(containsSecretPattern({ service_role_key: "abc" })).toBe(true);
      expect(containsSecretPattern({ apiKey: "123" })).toBe(true);
      expect(containsSecretPattern({ supabase_access_token: "xyz" })).toBe(
        true,
      );
      expect(containsSecretPattern({ nested: { password: "p" } })).toBe(true);
      expect(
        containsSecretPattern({ key: "sbp_abcdefghijklmnopqrstuvwxyz" }),
      ).toBe(true);
      expect(
        containsSecretPattern({
          token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotPrint",
        }),
      ).toBe(true);
      expect(
        containsSecretPattern({ publicTheme: "dark", locale: "en-US" }),
      ).toBe(false);

      const secretSettings = validateOrganizationSettings({
        api_key: "secret-value",
      });
      expect(secretSettings.valid).toBe(false);
      expect(secretSettings.errors[0]).toContain("secrets");
    });
  });

  describe("Database Row Mapper", () => {
    it("maps raw database rows to immutable canonical Organization domain entity", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Monks",
        slug: "monks",
        created_by: "00000000-0000-0000-0000-000000000099",
        settings: {
          branding: {
            displayName: "Monks Pub",
            primaryColor: "#ff0000",
          },
        },
        created_at: "2026-11-03T00:00:00Z",
        updated_at: "2026-11-03T01:00:00Z",
      };

      const org = mapOrganizationRow(row);
      expect(org.id).toBe(row.id);
      expect(org.name).toBe("Monks");
      expect(org.slug).toBe("monks");
      expect(org.createdBy).toBe(row.created_by);
      expect(org.settings.branding?.primaryColor).toBe("#ff0000");
      expect(Object.isFrozen(org.settings)).toBe(true);
    });

    it("handles null or non-object settings defensively", () => {
      const row = {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Liquor Tap",
        slug: "liquor-tap",
        created_by: "00000000-0000-0000-0000-000000000099",
        settings: null as unknown as DatabaseOrganizationRow["settings"],
        created_at: "2026-11-03T00:00:00Z",
        updated_at: "2026-11-03T01:00:00Z",
      };

      const org = mapOrganizationRow(row);
      expect(org.settings).toEqual({});
    });
  });
});
