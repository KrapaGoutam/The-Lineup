import { describe, expect, it } from "vitest";

import type { TipsRevision } from "@/features/tips/domain/tips-range-model";
import { summarizeRevision } from "@/features/tips/domain/tips-revision-summary";

const TZ = "America/Chicago";
const names: Record<string, string> = { a: "Ava", b: "Ben" };
const nameOf = (id: string) => names[id] ?? "Unknown";

function revision(
  action: string,
  before: unknown,
  after: unknown,
): TipsRevision {
  return {
    id: 1,
    action,
    source: "rpc",
    editorProfileId: "m",
    reason: null,
    intervalId: 1,
    before,
    after,
    affectedProfileIds: [],
    at: "2026-11-18T20:00:00Z",
  };
}
const interval = (over: Record<string, unknown> = {}) => ({
  starts_at: "2026-11-18T17:00:00Z",
  ends_at: "2026-11-18T19:00:00Z",
  cash_cents: 1001,
  card_cents: 500,
  amount_cents: 1501,
  participant_ids: ["a", "b"],
  ...over,
});

describe("summarizeRevision", () => {
  it("describes a creation", () => {
    expect(
      summarizeRevision(
        revision(
          "interval_created",
          { interval: null },
          { interval: interval() },
        ),
        TZ,
        nameOf,
      ),
    ).toBe("Added 11:00–13:00: cash $10.01, card $5.00.");
  });

  it("describes exactly what an update changed, with names", () => {
    const text = summarizeRevision(
      revision(
        "interval_updated",
        { interval: interval() },
        {
          interval: interval({
            cash_cents: 1200,
            card_cents: 300,
            ends_at: "2026-11-18T20:00:00Z",
            participant_ids: ["a"],
          }),
        },
      ),
      TZ,
      nameOf,
    );
    expect(text).toContain("time 11:00–13:00 → 11:00–14:00");
    expect(text).toContain("cash $10.01 → $12.00");
    expect(text).toContain("card $5.00 → $3.00");
    expect(text).toContain("removed Ben");
    expect(text).not.toContain("added");
  });

  it("marks a cross-midnight interval", () => {
    const text = summarizeRevision(
      revision("interval_created", null, {
        interval: interval({
          starts_at: "2026-11-19T05:00:00Z",
          ends_at: "2026-11-19T07:00:00Z",
        }),
      }),
      TZ,
      nameOf,
    );
    expect(text).toContain("23:00–01:00 (+1)");
  });

  it("describes the earlier workflow's finalize and reopen entries", () => {
    expect(
      summarizeRevision(revision("legacy_finalized", null, null), TZ, nameOf),
    ).toContain("finalized and locked");
    expect(
      summarizeRevision(revision("legacy_reopened", null, null), TZ, nameOf),
    ).toContain("unlocked");
  });

  it("describes a void and tolerates missing or malformed snapshots", () => {
    expect(
      summarizeRevision(
        revision("interval_voided", { interval: interval() }, {}),
        TZ,
        nameOf,
      ),
    ).toBe("Voided 11:00–13:00 ($15.01).");
    expect(
      summarizeRevision(revision("interval_updated", "junk", null), TZ, nameOf),
    ).toContain("Updated");
    expect(
      summarizeRevision(revision("direct_interval_update", {}, {}), TZ, nameOf),
    ).toContain("older app");
  });
});
