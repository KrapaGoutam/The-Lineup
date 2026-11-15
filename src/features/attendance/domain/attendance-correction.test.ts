import { describe, expect, it } from "vitest";

import {
  buildCorrectionPreview,
  correctionInputSchema,
  type CorrectionSessionState,
} from "./attendance-correction";

const SESSION = "00000000-0000-0000-0000-00000000aaaa";
const NOW = Date.parse("2026-11-09T20:00:00Z");

const closed: CorrectionSessionState = {
  status: "completed",
  clockInAt: "2026-11-09T14:00:00Z",
  clockOutAt: "2026-11-09T22:00:00Z".replace("22", "19"), // 19:00Z, in the past of NOW
  breaks: [
    {
      id: 1,
      startTime: "2026-11-09T16:00:00Z",
      endTime: "2026-11-09T16:30:00Z",
      payClassification: "unclassified",
    },
    {
      id: 2,
      startTime: "2026-11-09T17:30:00Z",
      endTime: "2026-11-09T17:45:00Z",
      payClassification: "unclassified",
    },
  ],
};

describe("correctionInputSchema", () => {
  const base = {
    sessionId: SESSION,
    expectedVersion: 1,
    reason: "Forgot to clock out",
  };

  it("requires a real reason", () => {
    for (const reason of ["", "   ", "ab"]) {
      const r = correctionInputSchema.safeParse({
        ...base,
        reason,
        clockOutAt: "2026-11-09T19:00:00Z",
      });
      expect(r.success).toBe(false);
    }
  });

  it("requires some change, and rejects void combined with edits", () => {
    expect(correctionInputSchema.safeParse(base).success).toBe(false);
    expect(
      correctionInputSchema.safeParse({
        ...base,
        void: true,
        clockOutAt: "2026-11-09T19:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      correctionInputSchema.safeParse({ ...base, void: true }).success,
    ).toBe(true);
  });

  it("rejects duplicate break ids, empty break edits and malformed instants", () => {
    expect(
      correctionInputSchema.safeParse({
        ...base,
        breaks: [
          { id: 1, payClassification: "paid" },
          { id: 1, payClassification: "unpaid" },
        ],
      }).success,
    ).toBe(false);
    expect(
      correctionInputSchema.safeParse({ ...base, breaks: [{ id: 1 }] }).success,
    ).toBe(false);
    expect(
      correctionInputSchema.safeParse({ ...base, clockInAt: "yesterday" })
        .success,
    ).toBe(false);
  });

  it("trims the reason and applies defaults", () => {
    const r = correctionInputSchema.parse({
      ...base,
      reason: "  fix it  ",
      clockInAt: "2026-11-09T13:00:00Z",
    });
    expect(r.reason).toBe("fix it");
    expect(r.void).toBe(false);
    expect(r.breaks).toEqual([]);
  });
});

describe("buildCorrectionPreview", () => {
  it("lists exactly what changes and projects totals from absolute instants", () => {
    const p = buildCorrectionPreview(
      closed,
      { clockOutAt: "2026-11-09T19:30:00Z" },
      NOW,
    );
    expect(p.errors).toEqual([]);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]).toMatchObject({
      field: "clock_out",
      before: closed.clockOutAt,
      after: "2026-11-09T19:30:00Z",
    });
    expect(p.projected.grossElapsedSeconds).toBe(5.5 * 3600);
    expect(p.projected.totalBreakSeconds).toBe(2700);
  });

  it("never reports payable time while a break is unclassified", () => {
    const p = buildCorrectionPreview(
      closed,
      { clockOutAt: "2026-11-09T19:30:00Z" },
      NOW,
    );
    expect(p.projected.netPayableSeconds).toBeNull();
    expect(p.projected.breakPolicyResolved).toBe(false);
  });

  it("resolves payable time only after every break is classified", () => {
    const p = buildCorrectionPreview(
      closed,
      {
        breaks: [
          { id: 1, payClassification: "unpaid" },
          { id: 2, payClassification: "paid" },
        ],
      },
      NOW,
    );
    expect(p.errors).toEqual([]);
    expect(p.projected.breakPolicyResolved).toBe(true);
    expect(p.projected.netPayableSeconds).toBe(5 * 3600 - 1800);
  });

  it("rejects a clock-out before clock-in and future times", () => {
    expect(
      buildCorrectionPreview(
        closed,
        {
          clockInAt: "2026-11-09T18:00:00Z",
          clockOutAt: "2026-11-09T17:00:00Z",
        },
        NOW,
      ).errors,
    ).toContain("Clock-out cannot be before clock-in.");
    expect(
      buildCorrectionPreview(
        closed,
        { clockOutAt: "2026-11-09T23:00:00Z" },
        NOW,
      ).errors,
    ).toContain("Corrected times cannot be in the future.");
  });

  it("rejects breaks outside the shift, overlapping breaks and reopened breaks", () => {
    expect(
      buildCorrectionPreview(closed, { clockInAt: "2026-11-09T17:00:00Z" }, NOW)
        .errors,
    ).toContain("Every break must fall inside the corrected shift.");
    expect(
      buildCorrectionPreview(
        closed,
        {
          breaks: [
            {
              id: 2,
              startTime: "2026-11-09T16:10:00Z",
              endTime: "2026-11-09T16:20:00Z",
            },
          ],
        },
        NOW,
      ).errors,
    ).toContain("Breaks cannot overlap.");
    expect(
      buildCorrectionPreview(
        closed,
        {
          breaks: [
            {
              id: 1,
              startTime: "2026-11-09T16:30:00Z",
              endTime: "2026-11-09T16:00:00Z",
            },
          ],
        },
        NOW,
      ).errors,
    ).toContain("Break end cannot be before break start.");
  });

  it("closing an open session ends a still-open break with the shift", () => {
    const open: CorrectionSessionState = {
      status: "on_break",
      clockInAt: "2026-11-09T14:00:00Z",
      clockOutAt: null,
      breaks: [
        {
          id: 9,
          startTime: "2026-11-09T17:00:00Z",
          endTime: null,
          payClassification: "unclassified",
        },
      ],
    };
    const p = buildCorrectionPreview(
      open,
      { clockOutAt: "2026-11-09T18:00:00Z" },
      NOW,
    );
    expect(p.errors).toEqual([]);
    expect(p.projected.status).toBe("completed");
    expect(p.projected.totalBreakSeconds).toBe(3600);
    expect(p.changes[0].label).toBe("Clock-out (was missing)");
  });

  it("refuses to preview changes to a voided session", () => {
    const p = buildCorrectionPreview(
      { ...closed, status: "voided" },
      { clockOutAt: "2026-11-09T19:30:00Z" },
      NOW,
    );
    expect(p.errors).toContain("A voided session cannot be corrected.");
  });

  it("previews a void as a single change with no payable time", () => {
    const p = buildCorrectionPreview(closed, { void: true }, NOW);
    expect(p.changes).toEqual([
      expect.objectContaining({ field: "void", after: "voided" }),
    ]);
    expect(p.projected.netPayableSeconds).toBeNull();
  });
});
