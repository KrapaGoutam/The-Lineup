import { describe, expect, it } from "vitest";

import {
  buildContextSyncMessage,
  CONTEXT_SYNC_EVENT_TYPES,
  parseContextSyncMessage,
} from "@/features/context/domain/context-sync";

const SOURCE = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("context-sync message contract", () => {
  it.each(CONTEXT_SYNC_EVENT_TYPES)("round-trips %s", (type) => {
    const message = buildContextSyncMessage(type, SOURCE, 123);
    expect(parseContextSyncMessage(message)).toEqual(message);
  });

  it("a message carries NO organization, location, profile, role or cookie value", () => {
    const message = buildContextSyncMessage("context_changed", SOURCE, 1);
    expect(Object.keys(message).sort()).toEqual(["at", "source", "type", "v"]);
  });

  it.each([
    ["null", null],
    ["a string", "context_changed"],
    ["an array", []],
    [
      "a wrong version",
      { v: 2, type: "context_changed", source: SOURCE, at: 1 },
    ],
    ["an unknown type", { v: 1, type: "grant_access", source: SOURCE, at: 1 }],
    ["a short source", { v: 1, type: "signed_out", source: "x", at: 1 }],
    [
      "a source with illegal characters",
      { v: 1, type: "signed_out", source: "<script>alert(1)</script>", at: 1 },
    ],
    [
      "a non-finite time",
      { v: 1, type: "signed_out", source: SOURCE, at: NaN },
    ],
    [
      "a smuggled location id (extra key)",
      {
        v: 1,
        type: "context_changed",
        source: SOURCE,
        at: 1,
        locationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    ],
    ["a missing key", { v: 1, type: "context_changed", source: SOURCE }],
  ])("drops %s", (_name, data) => {
    expect(parseContextSyncMessage(data)).toBeNull();
  });
});
