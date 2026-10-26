import { describe, expect, it } from "vitest";

import analytics from "../../../../tests/fixtures/bar-inventory/analytics-vectors.json";
import keys from "../../../../tests/fixtures/bar-inventory/keys-vectors.json";
import status from "../../../../tests/fixtures/bar-inventory/status-vectors.json";

/**
 * BI-0 fixture integrity. These tests prove that the shared golden vectors
 * agree with the written business rules (PRD section 5, DATA_MODEL section 4,
 * ANALYTICS_SPEC sections 1-4) using a deliberately independent oracle:
 * integer-cent arithmetic for quantities, plain string rules for keys.
 *
 * The production domain modules (BI-1 keys, BI-2 status, BI-7 analytics) and
 * the SQL functions are proven against the same JSON files; they must not
 * import this oracle.
 */

const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;

function statusOracle(input: (typeof status.vectors)[number]["input"]) {
  const total = cents(input.on_hand) + cents(input.backup);
  const cutoff = input.cutoff === null ? null : cents(input.cutoff);
  const explicitWarning = input.warning === null ? null : cents(input.warning);
  let effectiveWarning: number | null = explicitWarning;
  if (explicitWarning === null && cutoff !== null) {
    // cutoff + max(1, ceil(cutoff * 0.25)) in whole units
    effectiveWarning =
      cutoff + Math.max(100, Math.ceil((cutoff * 0.25) / 100) * 100);
  }
  let state: string;
  if (input.archived) state = "archived";
  else if (cutoff === null) state = "no_cutoff";
  else if (total <= cutoff) state = "critical";
  else if (total <= (effectiveWarning as number)) state = "low";
  else state = "healthy";

  const actionable = state === "critical" || state === "low";
  const par = input.par === null ? null : cents(input.par);
  return {
    total: fromCents(total),
    effective_warning:
      effectiveWarning === null ? null : fromCents(effectiveWarning),
    status: state,
    suggested_order:
      actionable && par !== null ? fromCents(Math.max(0, par - total)) : null,
    order_needed: actionable && par === null,
  };
}

describe("status golden vectors", () => {
  it("has unique ids and covers every status", () => {
    const ids = status.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Set(status.vectors.map((v) => v.expected.status));
    expect([...seen].sort()).toEqual(
      ["archived", "critical", "healthy", "low", "no_cutoff"].sort(),
    );
  });

  it.each(status.vectors)("$id matches the written rules", (vector) => {
    expect(statusOracle(vector.input)).toEqual(vector.expected);
  });

  it("never lets IEEE addition decide a boundary", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; the vector requires cent arithmetic.
    expect(0.1 + 0.2).not.toBe(0.3);
    const trap = status.vectors.find((v) => v.id === "float-trap-0.1-plus-0.2");
    expect(trap?.expected.status).toBe("critical");
  });
});

function nameKey(value: string | null): string | null {
  const key = (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  return key === "" ? null : key;
}

function sizeKey(value: string | null): string {
  const compact = (value ?? "").toLowerCase().replace(/\s+/g, "");
  return compact.replace(/^(\d+(?:\.\d+)?)/, (n) =>
    n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n,
  );
}

function skuKey(value: string | null): string | null {
  const key = (value ?? "").replace(/\s+/g, "").toUpperCase();
  return key === "" ? null : key;
}

function unitKey(type: string, label: string | null): string | null {
  if (type === "other") {
    const labelKey = nameKey(label);
    return labelKey === null ? null : `other:${labelKey}`;
  }
  return (keys.units.curated as string[]).includes(type) ? type : null;
}

describe("keys golden vectors", () => {
  it.each(keys.nameKey)(
    "nameKey($input) -> $expected",
    ({ input, expected }) => {
      expect(nameKey(input)).toBe(expected);
    },
  );

  it.each(keys.sameVendor)(
    "spellings collapse to one vendor key: %j",
    (...group) => {
      expect(new Set(group.map((v) => nameKey(v))).size).toBe(1);
    },
  );

  it.each(keys.sizeKey)(
    "sizeKey($input) -> $expected",
    ({ input, expected }) => {
      expect(sizeKey(input)).toBe(expected);
    },
  );

  it.each(keys.skuKey)("skuKey($input) -> $expected", ({ input, expected }) => {
    expect(skuKey(input)).toBe(expected);
  });

  it.each(keys.unitKey)(
    "unitKey($type, $label) -> $expected",
    ({ type, label, expected }) => {
      expect(unitKey(type, label)).toBe(expected);
    },
  );

  it("uses the D8 curated units plus Other", () => {
    expect(keys.units.curated).toEqual([
      "bottle",
      "can",
      "pack",
      "case",
      "keg",
    ]);
    expect(keys.units.other).toBe("other");
  });

  const identity = (p: {
    vendor: string;
    name: string;
    size: string;
    unit: string;
  }) =>
    [
      nameKey(p.vendor),
      nameKey(p.name),
      sizeKey(p.size),
      unitKey(p.unit, null),
    ].join("|");

  it("treats formatting variants of one product as the same identity", () => {
    for (const [a, b] of keys.identity.same) {
      expect(identity(a)).toBe(identity(b));
    }
  });

  it("never merges different size, vendor or unit", () => {
    for (const [a, b] of keys.identity.different) {
      expect(identity(a)).not.toBe(identity(b));
    }
  });
});

describe("analytics golden vectors", () => {
  type Event = { reason: string; delta_on_hand: number; delta_backup: number };

  function classify(reason: string, signedTotal: number) {
    const row = analytics.classification.find(
      (c) => c.reason === reason && c.sign === (signedTotal < 0 ? "-" : "+"),
    );
    return row?.kind ?? "other";
  }

  function depletionOracle(events: Event[], includeObserved = true) {
    const out = {
      confirmed_usage: 0,
      observed_depletion: 0,
      movement: 0,
      shrink: 0,
      restocked_quantity: 0,
      restock_count: 0,
      count_gain: 0,
    };
    for (const e of events) {
      const total = cents(e.delta_on_hand) + cents(e.delta_backup);
      if (total === 0) continue;
      const kind = classify(e.reason, total);
      const units = Math.abs(fromCents(total));
      if (kind === "confirmed_usage") out.confirmed_usage += units;
      else if (kind === "observed_depletion") out.observed_depletion += units;
      else if (kind === "shrink") out.shrink += units;
      else if (kind === "restock") {
        out.restocked_quantity += units;
        out.restock_count += 1;
      } else if (kind === "count_gain") out.count_gain += units;
    }
    out.movement =
      out.confirmed_usage + (includeObserved ? out.observed_depletion : 0);
    return out;
  }

  it.each(analytics.depletion)("$id", (vector) => {
    const includeObserved =
      (vector as { options?: { includeObservedDepletion?: boolean } }).options
        ?.includeObservedDepletion ?? true;
    const got = depletionOracle(vector.events, includeObserved);
    for (const [field, want] of Object.entries(vector.expected)) {
      expect(got[field as keyof typeof got]).toBe(want);
    }
  });

  it("classification never treats corrections, transfers or deliveries as movement", () => {
    for (const row of analytics.classification) {
      if (
        [
          "correction",
          "transfer_in",
          "transfer_out",
          "delivery_restock",
        ].includes(row.reason)
      ) {
        expect(row.inMovement).toBe(false);
      }
    }
    expect(
      analytics.classification
        .filter((c) => c.inMovement)
        .map((c) => c.kind)
        .sort(),
    ).toEqual(["confirmed_usage", "observed_depletion"]);
  });

  it.each(analytics.rates)("rate: $id", (vector) => {
    const enough = vector.depletion_events >= 3 && vector.item_age_days >= 14;
    const perDay = enough
      ? Math.round((vector.movement_total / vector.window_days) * 1000) / 1000
      : null;
    expect({
      enoughHistory: enough,
      perDay,
      perWeek: perDay === null ? null : Math.round(perDay * 7 * 1000) / 1000,
    }).toEqual(vector.expected);
  });

  function daysToCutoff(v: (typeof analytics.daysToCutoff)[number]): string {
    if (v.cutoff === null) return "No cutoff set";
    if (v.total <= v.cutoff) return "At or below cutoff";
    if (!v.enoughHistory || v.rate_7d === null || v.rate_30d === null) {
      return "Not enough history";
    }
    const fast = Math.max(v.rate_7d, v.rate_30d);
    const slow = Math.min(v.rate_7d, v.rate_30d);
    if (fast === 0) return "No recent movement";
    const room = v.total - v.cutoff;
    const low = Math.floor(room / fast);
    const highRaw = room / Math.max(slow, 0.0001);
    if (room / fast >= 30) return "30+ days";
    if (highRaw > 30) return `${low}–30+ days`;
    const high = Math.ceil(highRaw);
    return low === high ? `about ${low} days` : `${low}–${high} days`;
  }

  it.each(analytics.daysToCutoff)("days to cutoff: $id", (vector) => {
    expect(daysToCutoff(vector)).toBe(vector.expected);
  });

  it("counts a cutoff crossing only when the previous status was not critical", () => {
    for (const vector of analytics.cutoffCrossings) {
      let previous = "healthy";
      let crossings = 0;
      for (const row of vector.rows) {
        const prev =
          (row as { previous_status?: string }).previous_status ?? previous;
        if (row.status_after === "critical" && prev !== "critical") crossings++;
        previous = row.status_after;
      }
      expect({ crossings, chronic: crossings >= 2 }).toEqual(vector.expected);
    }
  });

  it.each(analytics.localDay)("local service date: $id", (vector) => {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: vector.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(vector.event_at_utc));
    expect(local).toBe(vector.expected_local_date);
  });
});
