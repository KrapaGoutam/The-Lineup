import { describe, expect, it } from "vitest";
import {
  isOvernightOperatingHours,
  isValidIanaTimeZone,
  isValidLocalTimeString,
  isValidLocationName,
  mapLocationRow,
  mapOperatingHoursRow,
  normalizeLocationAddress,
  normalizeLocationName,
  validateDayOperatingHours,
  validateLocationAddress,
  type DatabaseLocationRow,
  type DatabaseOperatingHoursRow,
  type Location,
} from "./location";

describe("Location Domain Model (V2-002.002)", () => {
  describe("Location Name Validation (DOM-001 to DOM-004)", () => {
    it("DOM-001: accepts valid location names", () => {
      expect(isValidLocationName("Webster")).toBe(true);
      expect(isValidLocationName("NASA")).toBe(true);
      expect(isValidLocationName("League City")).toBe(true);
      expect(isValidLocationName("Downtown - Main St.")).toBe(true);
    });

    it("DOM-002: rejects empty names", () => {
      expect(isValidLocationName("")).toBe(false);
      expect(isValidLocationName(null)).toBe(false);
      expect(isValidLocationName(undefined)).toBe(false);
    });

    it("DOM-003: rejects whitespace-only names", () => {
      expect(isValidLocationName("   ")).toBe(false);
      expect(isValidLocationName("\t\n")).toBe(false);
    });

    it("DOM-004: rejects overlength names (>120 characters)", () => {
      const longName = "A".repeat(121);
      expect(isValidLocationName(longName)).toBe(false);
      expect(isValidLocationName("A".repeat(120))).toBe(true);
    });

    it("normalizes location names properly", () => {
      expect(normalizeLocationName("  League   City  ")).toBe("League City");
      expect(normalizeLocationName("")).toBe("");
    });
  });

  describe("Physical Address Contract (DOM-005 to DOM-007)", () => {
    it("DOM-005: accepts valid physical addresses", () => {
      const result = validateLocationAddress({
        line1: "123 Main St",
        line2: "Suite 400",
        city: "Webster",
        region: "TX",
        postalCode: "77598",
        countryCode: "US",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("DOM-006: rejects malformed address payloads", () => {
      expect(validateLocationAddress(null).valid).toBe(false);
      expect(validateLocationAddress("123 Main St").valid).toBe(false);
      expect(validateLocationAddress([1, 2, 3]).valid).toBe(false);

      const invalidFields = validateLocationAddress({
        line1: "A".repeat(125),
        countryCode: "UNITED_STATES_OF_AMERICA",
      });
      expect(invalidFields.valid).toBe(false);
      expect(invalidFields.errors.length).toBeGreaterThanOrEqual(2);
    });

    it("DOM-007: safely reads legacy empty address object", () => {
      const emptyResult = validateLocationAddress({});
      expect(emptyResult.valid).toBe(true);
      expect(emptyResult.errors).toHaveLength(0);

      const normalized = normalizeLocationAddress({});
      expect(normalized).toEqual({});
    });

    it("normalizes addresses cleanly preserving safe custom keys", () => {
      const normalized = normalizeLocationAddress({
        line1: "  456 NASA Pkwy  ",
        city: "Houston ",
        countryCode: "us",
        suiteNotes: "Ring back bell",
      });
      expect(normalized.line1).toBe("456 NASA Pkwy");
      expect(normalized.city).toBe("Houston");
      expect(normalized.countryCode).toBe("US");
      expect(normalized.suiteNotes).toBe("Ring back bell");
    });
  });

  describe("Authoritative IANA Time Zones (DOM-008 to DOM-010)", () => {
    it("DOM-008: accepts valid canonical IANA time zones", () => {
      expect(isValidIanaTimeZone("America/Chicago")).toBe(true);
      expect(isValidIanaTimeZone("America/New_York")).toBe(true);
      expect(isValidIanaTimeZone("America/Los_Angeles")).toBe(true);
      expect(isValidIanaTimeZone("UTC")).toBe(true);
      expect(isValidIanaTimeZone("Europe/London")).toBe(true);
      expect(isValidIanaTimeZone("Asia/Tokyo")).toBe(true);
    });

    it("DOM-009: rejects invalid or non-existent time zone strings", () => {
      expect(isValidIanaTimeZone("Texas")).toBe(false);
      expect(isValidIanaTimeZone("America/Huston")).toBe(false);
      expect(isValidIanaTimeZone("")).toBe(false);
      expect(isValidIanaTimeZone("   ")).toBe(false);
      expect(isValidIanaTimeZone(12345)).toBe(false);
      expect(isValidIanaTimeZone(null)).toBe(false);
    });

    it("DOM-010: rejects ambiguous fixed abbreviations", () => {
      expect(isValidIanaTimeZone("CST")).toBe(false);
      expect(isValidIanaTimeZone("EST")).toBe(false);
      expect(isValidIanaTimeZone("PST")).toBe(false);
      expect(isValidIanaTimeZone("GMT-6")).toBe(false);
      expect(isValidIanaTimeZone("CDT")).toBe(false);
    });
  });

  describe("Weekly Operating Hours (DOM-011 to DOM-016)", () => {
    it("DOM-011: accepts valid weekly operating hours", () => {
      const day = {
        dayOfWeek: 1, // Monday
        openingLocal: "11:00",
        closingLocal: "22:00",
        closed: false,
      };
      const res = validateDayOperatingHours(day);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("DOM-012: represents closed day correctly", () => {
      const closedDay = {
        dayOfWeek: 0, // Sunday
        openingLocal: null,
        closingLocal: null,
        closed: true,
      };
      const res = validateDayOperatingHours(closedDay);
      expect(res.valid).toBe(true);

      const invalidClosed = {
        dayOfWeek: 0,
        openingLocal: "11:00",
        closingLocal: null,
        closed: true,
      };
      expect(validateDayOperatingHours(invalidClosed).valid).toBe(false);
    });

    it("DOM-013: distinguishes unconfigured from closed", () => {
      // In operating hours, an unconfigured day is absence of a record,
      // whereas a closed day has closed = true.
      const closedDay = {
        dayOfWeek: 0,
        closed: true,
        openingLocal: null,
        closingLocal: null,
      };
      expect(closedDay.closed).toBe(true);
      expect(closedDay.openingLocal).toBeNull();
    });

    it("DOM-014: represents overnight operating hours correctly", () => {
      const overnightDay = {
        dayOfWeek: 5, // Friday
        openingLocal: "17:00",
        closingLocal: "02:00",
        closed: false,
      };
      const res = validateDayOperatingHours(overnightDay);
      expect(res.valid).toBe(true);
      expect(isOvernightOperatingHours("17:00", "02:00")).toBe(true);
      expect(isOvernightOperatingHours("11:00", "22:00")).toBe(false);
    });

    it("DOM-015: rejects invalid time strings", () => {
      expect(isValidLocalTimeString("25:00")).toBe(false);
      expect(isValidLocalTimeString("noon")).toBe(false);
      expect(isValidLocalTimeString("12:60")).toBe(false);
      expect(isValidLocalTimeString("")).toBe(false);
      expect(isValidLocalTimeString(null)).toBe(false);
      expect(isValidLocalTimeString("11:00")).toBe(true);
      expect(isValidLocalTimeString("02:30:00")).toBe(true);
    });

    it("DOM-016: rejects invalid schedule shape and matching opening/closing times", () => {
      const sameTime = {
        dayOfWeek: 2,
        openingLocal: "11:00",
        closingLocal: "11:00",
        closed: false,
      };
      const res = validateDayOperatingHours(sameTime);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("identical");

      const invalidDayNumber = {
        dayOfWeek: 7,
        openingLocal: "11:00",
        closingLocal: "22:00",
        closed: false,
      };
      expect(validateDayOperatingHours(invalidDayNumber).valid).toBe(false);
    });
  });

  describe("Location Identity & Row Mapping (DOM-017 to DOM-020)", () => {
    const sampleRow: DatabaseLocationRow = {
      id: "a0000000-0000-0000-0000-000000000001",
      organization_id: "b0000000-0000-0000-0000-000000000001",
      name: "NASA",
      time_zone: "America/Chicago",
      address: {
        line1: "100 NASA Parkway",
        city: "Houston",
        region: "TX",
        postalCode: "77058",
        countryCode: "US",
      },
      cover_weight: 0.35,
      active: true,
      archived_at: null,
      opening_local: "11:00",
      closing_local: "23:00",
      created_at: "2026-11-03T12:00:00Z",
      updated_at: "2026-11-03T12:00:00Z",
    };

    it("DOM-017: location ID is mapped as readonly identity string", () => {
      const loc: Location = mapLocationRow(sampleRow);
      expect(loc.id).toBe("a0000000-0000-0000-0000-000000000001");
    });

    it("DOM-018: organization ownership is mapped correctly", () => {
      const loc = mapLocationRow(sampleRow);
      expect(loc.organizationId).toBe("b0000000-0000-0000-0000-000000000001");
    });

    it("DOM-019: existing cover weight and active flag are preserved", () => {
      const loc = mapLocationRow(sampleRow);
      expect(loc.coverWeight).toBe(0.35);
      expect(loc.active).toBe(true);
    });

    it("DOM-020: domain row mapping produces the complete typed result", () => {
      const loc = mapLocationRow(sampleRow);
      expect(loc.name).toBe("NASA");
      expect(loc.timeZone).toBe("America/Chicago");
      expect(loc.address.line1).toBe("100 NASA Parkway");
      expect(loc.address.city).toBe("Houston");
      expect(loc.openingLocal).toBe("11:00");
      expect(loc.closingLocal).toBe("23:00");
      expect(loc.createdAt).toBe("2026-11-03T12:00:00Z");
      expect(loc.updatedAt).toBe("2026-11-03T12:00:00Z");
    });

    it("maps operating hours row with overnight computation", () => {
      const hoursRow: DatabaseOperatingHoursRow = {
        id: 1,
        organization_id: "b0000000-0000-0000-0000-000000000001",
        location_id: "a0000000-0000-0000-0000-000000000001",
        day_of_week: 5,
        opening_local: "17:00",
        closing_local: "02:00",
        closed: false,
        created_at: "2026-11-03T12:00:00Z",
        updated_at: "2026-11-03T12:00:00Z",
      };
      const mapped = mapOperatingHoursRow(hoursRow);
      expect(mapped.dayOfWeek).toBe(5);
      expect(mapped.openingLocal).toBe("17:00");
      expect(mapped.closingLocal).toBe("02:00");
      expect(mapped.closed).toBe(false);
      expect(mapped.isOvernight).toBe(true);
    });
  });
});
