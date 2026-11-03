import { describe, expect, it } from "vitest";
import {
  isOverallRole,
  labelForOverallRole,
  normalizeOverallRole,
  OVERALL_ROLE_LABELS,
  OVERALL_ROLES,
} from "./overall-role";

describe("overall-role domain", () => {
  describe("OVERALL_ROLES definition", () => {
    it("defines exactly the three approved platform overall roles", () => {
      expect(OVERALL_ROLES).toEqual(["owner", "manager", "assistant_manager"]);
    });

    it("has labels for every overall role", () => {
      for (const role of OVERALL_ROLES) {
        expect(OVERALL_ROLE_LABELS[role]).toBeTruthy();
      }
      expect(OVERALL_ROLE_LABELS.owner).toBe("Overall Owner");
      expect(OVERALL_ROLE_LABELS.manager).toBe("Overall Manager");
      expect(OVERALL_ROLE_LABELS.assistant_manager).toBe(
        "Overall Assistant Manager",
      );
    });
  });

  describe("isOverallRole", () => {
    it("returns true for valid overall roles", () => {
      expect(isOverallRole("owner")).toBe(true);
      expect(isOverallRole("manager")).toBe(true);
      expect(isOverallRole("assistant_manager")).toBe(true);
    });

    it("returns false for location/local roles, UI labels, and invalid values", () => {
      expect(isOverallRole("server")).toBe(false);
      expect(isOverallRole("host")).toBe(false);
      expect(isOverallRole("lead")).toBe(false);
      expect(isOverallRole("staff")).toBe(false);
      expect(isOverallRole("general_manager")).toBe(false);
      expect(isOverallRole("shift_manager")).toBe(false);
      expect(isOverallRole("Overall Owner")).toBe(false);
      expect(isOverallRole("")).toBe(false);
      expect(isOverallRole(null)).toBe(false);
      expect(isOverallRole(undefined)).toBe(false);
      expect(isOverallRole(123)).toBe(false);
    });
  });

  describe("normalizeOverallRole", () => {
    it("normalizes canonical database values to themselves", () => {
      expect(normalizeOverallRole("owner")).toBe("owner");
      expect(normalizeOverallRole("manager")).toBe("manager");
      expect(normalizeOverallRole("assistant_manager")).toBe(
        "assistant_manager",
      );
    });

    it("normalizes prefixed and case-insensitive aliases", () => {
      expect(normalizeOverallRole("overall_owner")).toBe("owner");
      expect(normalizeOverallRole("Overall Owner")).toBe("owner");
      expect(normalizeOverallRole("OVERALL_OWNER")).toBe("owner");

      expect(normalizeOverallRole("overall_manager")).toBe("manager");
      expect(normalizeOverallRole("Overall Manager")).toBe("manager");
      expect(normalizeOverallRole("OVERALL_MANAGER")).toBe("manager");

      expect(normalizeOverallRole("overall_assistant_manager")).toBe(
        "assistant_manager",
      );
      expect(normalizeOverallRole("Overall Assistant Manager")).toBe(
        "assistant_manager",
      );
      expect(normalizeOverallRole("assistant manager")).toBe(
        "assistant_manager",
      );
    });

    it("fails closed (returns null) for any unrecognized or elevated role", () => {
      expect(normalizeOverallRole("server")).toBe(null);
      expect(normalizeOverallRole("host")).toBe(null);
      expect(normalizeOverallRole("admin")).toBe(null);
      expect(normalizeOverallRole("root")).toBe(null);
      expect(normalizeOverallRole("superuser")).toBe(null);
      expect(normalizeOverallRole("")).toBe(null);
      expect(normalizeOverallRole("   ")).toBe(null);
      expect(normalizeOverallRole(null)).toBe(null);
      expect(normalizeOverallRole(undefined)).toBe(null);
      expect(normalizeOverallRole({})).toBe(null);
      expect(normalizeOverallRole(123)).toBe(null);
    });
  });

  describe("labelForOverallRole", () => {
    it("returns formatted display label for valid roles", () => {
      expect(labelForOverallRole("owner")).toBe("Overall Owner");
      expect(labelForOverallRole("manager")).toBe("Overall Manager");
      expect(labelForOverallRole("assistant_manager")).toBe(
        "Overall Assistant Manager",
      );
    });

    it("returns null for null, undefined or invalid values", () => {
      expect(labelForOverallRole(null)).toBe(null);
      expect(labelForOverallRole(undefined)).toBe(null);
      // @ts-expect-error testing invalid type
      expect(labelForOverallRole("server")).toBe(null);
    });
  });
});
