import { describe, expect, it } from "vitest";
import {
  EMPTY_RETAINED_COUNTS,
  LIFECYCLE_ACTIONS,
  LIFECYCLE_REASON_MAX_LENGTH,
  acceptsOperationalWork,
  archiveConfirmationMatches,
  evaluateLocationLifecycle,
  formatBlockedHeadline,
  formatLifecycleBlockers,
  formatRetainedSummary,
  getAvailableLifecycleActions,
  getLocationLifecycleStatus,
  isConsistentLifecycleState,
  parseBlockedDetail,
  parseLifecycleReadiness,
  validateLifecycleReason,
  validateLifecycleTransition,
  type LifecycleBlocker,
} from "./location-lifecycle";

const SESSION: LifecycleBlocker = {
  code: "ACTIVE_SERVICE_SESSIONS",
  count: 1,
  capped: false,
  deactivate: "hard",
  archive: "hard",
};
const TASKS: LifecycleBlocker = {
  code: "OPEN_TASKS",
  count: 2,
  capped: false,
  deactivate: "warning",
  archive: "hard",
};

describe("location lifecycle domain (V2-002.005)", () => {
  describe("status mapping (LC-DOM-001…)", () => {
    it("maps active/archivedAt to ACTIVE, INACTIVE and ARCHIVED", () => {
      expect(getLocationLifecycleStatus({ active: true })).toBe("active");
      expect(
        getLocationLifecycleStatus({ active: true, archivedAt: null }),
      ).toBe("active");
      expect(getLocationLifecycleStatus({ active: false })).toBe("inactive");
      expect(
        getLocationLifecycleStatus({ active: false, archivedAt: null }),
      ).toBe("inactive");
      expect(
        getLocationLifecycleStatus({
          active: false,
          archivedAt: "2026-01-01T00:00:00Z",
        }),
      ).toBe("archived");
    });

    it("flags the contradictory active + archived state as inconsistent", () => {
      expect(
        isConsistentLifecycleState({
          active: true,
          archivedAt: "2026-01-01T00:00:00Z",
        }),
      ).toBe(false);
      expect(
        isConsistentLifecycleState({ active: false, archivedAt: "x" }),
      ).toBe(true);
      expect(isConsistentLifecycleState({ active: true })).toBe(true);
    });

    it("only an ACTIVE location accepts operational work", () => {
      expect(acceptsOperationalWork("active")).toBe(true);
      expect(acceptsOperationalWork("inactive")).toBe(false);
      expect(acceptsOperationalWork("archived")).toBe(false);
    });
  });

  describe("transition validation", () => {
    it("supports exactly the four approved transitions", () => {
      expect(validateLifecycleTransition("active", "deactivate")).toEqual({
        valid: true,
        nextStatus: "inactive",
      });
      expect(validateLifecycleTransition("inactive", "reactivate")).toEqual({
        valid: true,
        nextStatus: "active",
      });
      expect(validateLifecycleTransition("inactive", "archive")).toEqual({
        valid: true,
        nextStatus: "archived",
      });
      expect(
        validateLifecycleTransition("archived", "restore_archive"),
      ).toEqual({
        valid: true,
        nextStatus: "inactive",
      });
    });

    it("rejects every other (status, action) pair", () => {
      const supported = new Set([
        "active:deactivate",
        "inactive:reactivate",
        "inactive:archive",
        "archived:restore_archive",
      ]);
      for (const status of ["active", "inactive", "archived"] as const) {
        for (const action of LIFECYCLE_ACTIONS) {
          expect(validateLifecycleTransition(status, action).valid).toBe(
            supported.has(`${status}:${action}`),
          );
        }
      }
    });

    it("never lets an archived location jump straight to active", () => {
      const res = validateLifecycleTransition("archived", "reactivate");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/restore it from the archive/i);
    });

    it("rejects unknown actions such as delete", () => {
      expect(
        validateLifecycleTransition("active", "delete" as never).valid,
      ).toBe(false);
    });

    it("offers only actions valid for the status and never a delete", () => {
      expect(getAvailableLifecycleActions("active")).toEqual(["deactivate"]);
      expect(getAvailableLifecycleActions("inactive")).toEqual([
        "reactivate",
        "archive",
      ]);
      expect(getAvailableLifecycleActions("archived")).toEqual([
        "restore_archive",
      ]);
    });
  });

  describe("reason validation", () => {
    it("requires a non-blank reason of 3–500 trimmed characters", () => {
      expect(validateLifecycleReason(undefined).valid).toBe(false);
      expect(validateLifecycleReason("").valid).toBe(false);
      expect(validateLifecycleReason("     ").valid).toBe(false);
      expect(validateLifecycleReason("ab").valid).toBe(false);
      expect(validateLifecycleReason("  ab  ").valid).toBe(false);
      expect(validateLifecycleReason("abc").valid).toBe(true);
      expect(
        validateLifecycleReason("x".repeat(LIFECYCLE_REASON_MAX_LENGTH)).valid,
      ).toBe(true);
      expect(
        validateLifecycleReason("x".repeat(LIFECYCLE_REASON_MAX_LENGTH + 1))
          .valid,
      ).toBe(false);
    });
  });

  describe("archive confirmation", () => {
    it("requires the exact location name (trimmed, case-sensitive)", () => {
      expect(archiveConfirmationMatches("NASA", "NASA")).toBe(true);
      expect(archiveConfirmationMatches("NASA", "  NASA ")).toBe(true);
      expect(archiveConfirmationMatches("NASA", "nasa")).toBe(false);
      expect(archiveConfirmationMatches("NASA", "")).toBe(false);
      expect(archiveConfirmationMatches("", "")).toBe(false);
    });
  });

  describe("blocker evaluation and wording", () => {
    it("treats hard blockers as blocking and warnings as non-blocking", () => {
      const ev = evaluateLocationLifecycle(
        { status: "active", blockers: [SESSION, TASKS] },
        "deactivate",
      );
      expect(ev.allowed).toBe(false);
      expect(ev.hardBlockers).toEqual([SESSION]);
      expect(ev.warnings).toEqual([TASKS]);

      const warningsOnly = evaluateLocationLifecycle(
        { status: "active", blockers: [TASKS] },
        "deactivate",
      );
      expect(warningsOnly.allowed).toBe(true);
      expect(warningsOnly.warnings).toEqual([TASKS]);
    });

    it("escalates warnings to hard blockers for archive", () => {
      const ev = evaluateLocationLifecycle(
        { status: "inactive", blockers: [TASKS] },
        "archive",
      );
      expect(ev.allowed).toBe(false);
      expect(ev.hardBlockers).toEqual([TASKS]);
    });

    it("never blocks reactivation or restore on operational records", () => {
      expect(
        evaluateLocationLifecycle(
          { status: "inactive", blockers: [SESSION] },
          "reactivate",
        ).allowed,
      ).toBe(true);
      expect(
        evaluateLocationLifecycle(
          { status: "archived", blockers: [SESSION] },
          "restore_archive",
        ).allowed,
      ).toBe(true);
    });

    it("reports an unsupported transition even with no blockers", () => {
      const ev = evaluateLocationLifecycle(
        { status: "archived", blockers: [] },
        "deactivate",
      );
      expect(ev.allowed).toBe(false);
      expect(ev.transitionError).toBeTruthy();
    });

    it("formats only real counts with correct pluralization", () => {
      expect(formatLifecycleBlockers([SESSION, TASKS])).toEqual([
        "1 active service session",
        "2 unresolved tasks",
      ]);
      expect(formatLifecycleBlockers([{ ...TASKS, count: 0 }])).toEqual([]);
      expect(
        formatLifecycleBlockers([{ ...TASKS, count: 1000, capped: true }]),
      ).toEqual(["1000+ unresolved tasks"]);
      expect(formatBlockedHeadline("NASA", "deactivate")).toBe(
        "Cannot deactivate NASA.",
      );
    });

    it("summarizes only the retained categories that exist", () => {
      expect(formatRetainedSummary(EMPTY_RETAINED_COUNTS)).toEqual([]);
      expect(
        formatRetainedSummary({
          ...EMPTY_RETAINED_COUNTS,
          finalizedTipPools: 4,
          shifts: 9,
        }),
      ).toEqual(["9 shifts", "4 finalized tip pools"]);
    });
  });

  describe("readiness parsing (fail closed)", () => {
    const base = {
      locationId: "l1",
      organizationId: "o1",
      status: "inactive",
      canDeactivate: false,
      canReactivate: true,
      canArchive: true,
      canRestoreArchive: false,
      blockers: [],
      retained: {},
    };

    it("parses a well-formed database payload", () => {
      const parsed = parseLifecycleReadiness({
        ...base,
        blockers: [
          {
            code: "OPEN_TASKS",
            count: 3,
            capped: false,
            deactivate: "warning",
            archive: "hard",
          },
          {
            code: "OPEN_TASKS",
            count: 0,
            capped: false,
            deactivate: "hard",
            archive: "hard",
          },
        ],
        retained: { shifts: 5 },
      });
      expect(parsed?.status).toBe("inactive");
      expect(parsed?.blockers).toHaveLength(1);
      expect(parsed?.retained.shifts).toBe(5);
      expect(parsed?.retained.finalizedTipPools).toBe(0);
    });

    it("rejects malformed payloads", () => {
      expect(parseLifecycleReadiness(null)).toBeNull();
      expect(parseLifecycleReadiness("x")).toBeNull();
      expect(parseLifecycleReadiness([])).toBeNull();
      expect(
        parseLifecycleReadiness({ ...base, status: "deleted" }),
      ).toBeNull();
      expect(parseLifecycleReadiness({ ...base, locationId: 5 })).toBeNull();
    });

    it("treats an unrecognised severity as a hard blocker", () => {
      const parsed = parseLifecycleReadiness({
        ...base,
        blockers: [
          { code: "OPEN_TASKS", count: 1, deactivate: "???", archive: "" },
        ],
      });
      expect(parsed?.blockers[0].deactivate).toBe("hard");
      expect(parsed?.blockers[0].archive).toBe("hard");
    });

    it("parses LC001 blocker detail and ignores garbage", () => {
      expect(
        parseBlockedDetail(
          JSON.stringify([
            {
              code: "ACTIVE_SERVICE_SESSIONS",
              count: 2,
              capped: false,
              deactivate: "hard",
              archive: "hard",
            },
          ]),
        ),
      ).toHaveLength(1);
      expect(parseBlockedDetail("not json")).toEqual([]);
      expect(parseBlockedDetail(undefined)).toEqual([]);
      expect(parseBlockedDetail("{}")).toEqual([]);
    });
  });
});
