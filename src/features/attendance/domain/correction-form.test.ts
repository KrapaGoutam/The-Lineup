import { describe, expect, it } from "vitest";

import {
  formToProposal,
  hasProposalChanges,
  initialFormValue,
  instantToLocalInput,
  localInputToInstant,
} from "./correction-form";
import type { CorrectionSessionState } from "./attendance-correction";

const TZ = "America/Chicago";

const session: CorrectionSessionState = {
  status: "completed",
  clockInAt: "2026-11-09T15:00:30Z", // 9:00:30 AM CST — has seconds
  clockOutAt: "2026-11-09T23:00:00Z",
  breaks: [
    {
      id: 5,
      startTime: "2026-11-09T18:00:00Z",
      endTime: "2026-11-09T18:30:00Z",
      payClassification: "unclassified",
    },
  ],
};

describe("local time conversion uses the location's zone", () => {
  it("round-trips an instant through the location wall clock", () => {
    expect(instantToLocalInput("2026-11-09T15:00:00Z", TZ)).toBe(
      "2026-11-09T09:00",
    );
    expect(localInputToInstant("2026-11-09T09:00", TZ)).toBe(
      "2026-11-09T15:00:00.000Z",
    );
    expect(instantToLocalInput(null, TZ)).toBe("");
    expect(instantToLocalInput("garbage", TZ)).toBe("");
  });

  it("is independent of the browser zone and correct on both sides of DST", () => {
    // CDT (UTC-5) before fall back, CST (UTC-6) after.
    expect(localInputToInstant("2026-10-31T09:00", TZ)).toBe(
      "2026-10-31T14:00:00.000Z",
    );
    expect(localInputToInstant("2026-11-02T09:00", TZ)).toBe(
      "2026-11-02T15:00:00.000Z",
    );
  });

  it("rejects repeated and nonexistent daylight-saving wall times", () => {
    expect(localInputToInstant("2026-11-01T01:30", TZ)).toBeNull();
    expect(localInputToInstant("2026-03-08T02:30", TZ)).toBeNull();
  });

  it("rejects incomplete text", () => {
    for (const bad of ["", "2026-11-09", "2026-11-09T9:00", "tomorrow"]) {
      expect(localInputToInstant(bad, TZ)).toBeNull();
    }
  });
});

describe("formToProposal", () => {
  const initial = initialFormValue(session, TZ);

  it("sends nothing when nothing changed (seconds are never rewritten)", () => {
    const r = formToProposal(initial, initial, TZ);
    expect(r).toEqual({ ok: true, proposal: {} });
    expect(hasProposalChanges({})).toBe(false);
  });

  it("sends only the fields that changed", () => {
    const r = formToProposal(
      initial,
      { ...initial, clockOut: "2026-11-09T17:30" },
      TZ,
    );
    expect(r).toEqual({
      ok: true,
      proposal: { clockOutAt: "2026-11-09T23:30:00.000Z" },
    });
  });

  it("includes break time and pay-class edits per break", () => {
    const r = formToProposal(
      initial,
      {
        ...initial,
        breaks: [
          {
            ...initial.breaks[0],
            end: "2026-11-09T12:45",
            payClassification: "unpaid",
          },
        ],
      },
      TZ,
    );
    expect(r.ok && r.proposal.breaks).toEqual([
      {
        id: 5,
        endTime: "2026-11-09T18:45:00.000Z",
        payClassification: "unpaid",
      },
    ]);
    expect(r.ok && hasProposalChanges(r.proposal)).toBe(true);
  });

  it("reports a cleared or half-typed field instead of ignoring it", () => {
    expect(
      formToProposal(initial, { ...initial, clockIn: "" }, TZ),
    ).toMatchObject({ ok: false });
    expect(
      formToProposal(initial, { ...initial, clockOut: "2026-11-09" }, TZ),
    ).toMatchObject({ ok: false });
  });

  it("asks for a clock-out time when repairing an open shift", () => {
    const open = initialFormValue(
      { ...session, status: "active", clockOutAt: null },
      TZ,
    );
    const r = formToProposal(open, { ...open, clockOut: "oops" }, TZ);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/leave it blank/);
  });
});
