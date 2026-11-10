import { describe, expect, it } from "vitest";

import { decideReportSource } from "./attendance-source";

describe("decideReportSource", () => {
  it("reads native records only for internal mode", () => {
    const d = decideReportSource("internal_the_lineup");
    expect(d).toMatchObject({
      source: "internal",
      readsNative: true,
      readsExternal: false,
    });
    expect(d.label).toBe("TheLineup Internal");
  });

  it("keeps the existing external reader for external mode, never native", () => {
    expect(decideReportSource("external")).toMatchObject({
      source: "external",
      readsNative: false,
      readsExternal: true,
      label: "External",
    });
  });

  it("reads nothing when disabled", () => {
    expect(decideReportSource("disabled")).toMatchObject({
      source: "disabled",
      readsNative: false,
      readsExternal: false,
    });
  });

  it("treats a missing/unknown mode as legacy-external and never assumes internal", () => {
    for (const raw of [null, undefined, "", "INTERNAL_THE_LINEUP", "garbage"]) {
      const d = decideReportSource(raw);
      expect(d.source).toBe("unconfigured");
      expect(d.readsNative).toBe(false);
      expect(d.readsExternal).toBe(true);
    }
  });

  it("never selects two sources at once", () => {
    for (const raw of ["internal_the_lineup", "external", "disabled", null]) {
      const d = decideReportSource(raw);
      expect(d.readsNative && d.readsExternal).toBe(false);
    }
  });
});
