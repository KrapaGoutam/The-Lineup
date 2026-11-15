import { describe, expect, it } from "vitest";
import {
  fromDbAttendanceMode,
  getAttendanceModeLabel,
  resolveAttendanceMode,
  toDbAttendanceMode,
} from "./attendance-mode";

describe("attendance-mode domain contract", () => {
  it("converts canonical uppercase modes to database enum values", () => {
    expect(toDbAttendanceMode("EXTERNAL")).toBe("external");
    expect(toDbAttendanceMode("INTERNAL_THE_LINEUP")).toBe(
      "internal_the_lineup",
    );
    expect(toDbAttendanceMode("DISABLED")).toBe("disabled");
  });

  it("converts database enum values to canonical uppercase modes", () => {
    expect(fromDbAttendanceMode("external")).toBe("EXTERNAL");
    expect(fromDbAttendanceMode("internal_the_lineup")).toBe(
      "INTERNAL_THE_LINEUP",
    );
    expect(fromDbAttendanceMode("disabled")).toBe("DISABLED");
  });

  it("returns null for unrecognized or empty database modes", () => {
    expect(fromDbAttendanceMode(null)).toBeNull();
    expect(fromDbAttendanceMode(undefined)).toBeNull();
    expect(fromDbAttendanceMode("")).toBeNull();
    expect(fromDbAttendanceMode("unknown_mode")).toBeNull();
  });

  it("resolves unconfigured / missing modes with safe legacy compatibility", () => {
    const resolved = resolveAttendanceMode(null);
    expect(resolved.isConfigured).toBe(false);
    expect(resolved.canClockInternal).toBe(false); // strictly fails closed
    expect(resolved.canReadExternal).toBe(true); // preserves legacy read path
    expect(resolved.isTrackingDisabled).toBe(false);
    expect(resolved.mode).toBe("EXTERNAL");
  });

  it("resolves INTERNAL_THE_LINEUP mode correctly", () => {
    const resolved = resolveAttendanceMode("internal_the_lineup");
    expect(resolved.isConfigured).toBe(true);
    expect(resolved.canClockInternal).toBe(true);
    expect(resolved.canReadExternal).toBe(false);
    expect(resolved.isTrackingDisabled).toBe(false);
    expect(resolved.mode).toBe("INTERNAL_THE_LINEUP");
  });

  it("resolves EXTERNAL mode correctly", () => {
    const resolved = resolveAttendanceMode("external");
    expect(resolved.isConfigured).toBe(true);
    expect(resolved.canClockInternal).toBe(false);
    expect(resolved.canReadExternal).toBe(true);
    expect(resolved.isTrackingDisabled).toBe(false);
    expect(resolved.mode).toBe("EXTERNAL");
  });

  it("resolves DISABLED mode correctly", () => {
    const resolved = resolveAttendanceMode("disabled");
    expect(resolved.isConfigured).toBe(true);
    expect(resolved.canClockInternal).toBe(false);
    expect(resolved.canReadExternal).toBe(false);
    expect(resolved.isTrackingDisabled).toBe(true);
    expect(resolved.mode).toBe("DISABLED");
  });

  it("provides human-readable labels", () => {
    expect(getAttendanceModeLabel("EXTERNAL")).toContain("External");
    expect(getAttendanceModeLabel("INTERNAL_THE_LINEUP")).toContain("Internal");
    expect(getAttendanceModeLabel("DISABLED")).toBe("Disabled");
  });
});
