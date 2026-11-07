import { describe, expect, it } from "vitest";

import {
  TIPS_UNAVAILABLE_MESSAGES,
  buildTipsReadModel,
  classifyTipsReadError,
} from "@/features/tips/domain/tips-read-model";

const TZ = "America/New_York";

const roster = [
  {
    profile_id: "p-current",
    display_name: "Casey Current",
    roles: ["server"],
    active: true,
    eligible: true,
  },
  {
    profile_id: "p-moved",
    display_name: "Morgan Moved",
    roles: ["server"],
    active: true,
    eligible: false, // historical participant, no longer at this location
  },
  {
    profile_id: "p-former",
    display_name: "Frankie Former",
    roles: ["server"],
    active: false, // deactivated member
    eligible: false,
  },
];

const day = {
  tip_pool_id: 7,
  status: "finalized",
  intervals: [
    {
      id: "11",
      starts_at: "2026-11-07T16:00:00Z",
      ends_at: "2026-11-07T18:30:00Z",
      amount_cents: 12345,
      participant_ids: ["p-current", "p-moved"],
    },
  ],
  audit_log: [
    {
      action: "finalized",
      actor_profile_id: "p-current",
      reason: null,
      created_at: "2026-11-07T20:00:00Z",
    },
    {
      action: "something_else",
      actor_profile_id: "p-current",
      reason: null,
      created_at: "2026-11-07T20:01:00Z",
    },
    {
      action: "reopened",
      actor_profile_id: "p-overall-not-in-roster",
      reason: "fix",
      created_at: "2026-11-07T20:02:00Z",
    },
  ],
};

describe("classifyTipsReadError", () => {
  it.each([
    ["PGRST202", "backend_not_ready"],
    ["42883", "backend_not_ready"],
    ["42501", "access_denied"],
    ["P0002", "unavailable"],
    [undefined, "unavailable"],
  ])("maps %s to %s", (code, expected) => {
    expect(classifyTipsReadError({ code })).toBe(expected);
  });

  it("has a user-facing message for every reason", () => {
    for (const reason of [
      "backend_not_ready",
      "access_denied",
      "unavailable",
    ] as const) {
      expect(TIPS_UNAVAILABLE_MESSAGES[reason].length).toBeGreaterThan(10);
    }
  });
});

describe("buildTipsReadModel", () => {
  it("separates current selectable workforce from historical-only names", () => {
    const result = buildTipsReadModel({ roster, dayData: day, timeZone: TZ });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Everyone stays in the name directory so history renders names ...
    expect(result.model.team.map((m) => m.id)).toEqual([
      "p-current",
      "p-moved",
      "p-former",
    ]);
    // ... but only the current, eligible, active person can be offered.
    expect(result.model.selectableIds).toEqual(["p-current"]);
  });

  it("keeps cents, participants and location-zone wall times of the day data", () => {
    const result = buildTipsReadModel({ roster, dayData: day, timeZone: TZ });
    if (!result.ok) throw new Error("expected ok");
    expect(result.model.tipPoolId).toBe(7);
    expect(result.model.status).toBe("finalized");
    expect(result.model.intervals).toEqual([
      {
        id: "11",
        start: "11:00",
        end: "13:30",
        amountCents: 12345,
        participantIds: ["p-current", "p-moved"],
      },
    ]);
  });

  it("maps only finalized/reopened audit entries and resolves actor names", () => {
    const result = buildTipsReadModel({ roster, dayData: day, timeZone: TZ });
    if (!result.ok) throw new Error("expected ok");
    expect(result.model.auditLog).toEqual([
      {
        action: "finalized",
        actorName: "Casey Current",
        reason: undefined,
        at: "2026-11-07T20:00:00Z",
      },
      {
        action: "reopened",
        actorName: "Unknown",
        reason: "fix",
        at: "2026-11-07T20:02:00Z",
      },
    ]);
  });

  it("represents a day with no pool as an empty estimate", () => {
    const result = buildTipsReadModel({
      roster,
      dayData: {
        tip_pool_id: null,
        status: "estimating",
        intervals: [],
        audit_log: [],
      },
      timeZone: TZ,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.model.tipPoolId).toBeNull();
    expect(result.model.intervals).toEqual([]);
  });

  it("fails closed on a malformed roster or day payload", () => {
    expect(
      buildTipsReadModel({ roster: null, dayData: day, timeZone: TZ }),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      buildTipsReadModel({ roster, dayData: { nope: true }, timeZone: TZ }),
    ).toEqual({ ok: false, reason: "unavailable" });
    // A roster row that predates `eligible` (old function shape) is rejected
    // rather than silently treated as eligible.
    expect(
      buildTipsReadModel({
        roster: [
          {
            profile_id: "x",
            display_name: "X",
            roles: [],
            active: true,
          },
        ],
        dayData: day,
        timeZone: TZ,
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});
