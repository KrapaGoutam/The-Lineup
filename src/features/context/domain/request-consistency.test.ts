import { describe, expect, it } from "vitest";

import {
  hintAgreesWithContext,
  parseRequestWorkspaceHint,
} from "./request-consistency";

const LOC = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const host = "app.test";
const hint = (referer: string | null, h: string | null = host) =>
  parseRequestWorkspaceHint({ referer, host: h });
const verified = { organizationSlug: "The-Monks", locationId: LOC };

describe("request-consistency hint (V2-003.004: reject-only, never a source)", () => {
  it("yields no hint for missing, unparsable, cross-origin, hostless or non-workspace referers", () => {
    for (const referer of [
      null,
      "",
      "not a url",
      `https://evil.test/r/the-monks?location=${LOC}`,
      `https://app.test/other?location=${LOC}`,
      "https://app.test/r/the-monks",
      "https://app.test/r/the-monks/extra?location=" + LOC,
    ]) {
      expect(hint(referer)).toEqual({ status: "none" });
    }
    expect(hint(`https://app.test/r/the-monks?location=${LOC}`, null)).toEqual({
      status: "none",
    });
  });

  it("reads the explicit workspace selection a same-origin page is showing", () => {
    expect(hint(`https://app.test/r/The-Monks?location=${LOC}`)).toEqual({
      status: "explicit",
      routeSlug: "the-monks",
      selection: { status: "present", locationId: LOC },
    });
  });

  it("malformed / repeated selections and undecodable slugs are not silently ignored", () => {
    expect(hint("https://app.test/r/the-monks?location=nope")).toMatchObject({
      status: "explicit",
      selection: { status: "malformed" },
    });
    expect(
      hint(`https://app.test/r/the-monks?location=${LOC}&location=${LOC}`),
    ).toMatchObject({ selection: { status: "malformed" } });
    expect(hint(`https://app.test/r/%E0%A4%A?location=${LOC}`)).toEqual({
      status: "unreadable",
    });
  });

  it("agrees only when there is nothing to contradict or the slug AND location both match", () => {
    expect(hintAgreesWithContext({ status: "none" }, verified)).toBe(true);
    expect(
      hintAgreesWithContext(
        hint(`https://app.test/r/the-monks?location=${LOC.toUpperCase()}`),
        verified,
      ),
    ).toBe(true);
    expect(
      hintAgreesWithContext(
        hint(`https://app.test/r/the-monks?location=${OTHER}`),
        verified,
      ),
    ).toBe(false);
    expect(
      hintAgreesWithContext(
        hint(`https://app.test/r/liquor-tap?location=${LOC}`),
        verified,
      ),
    ).toBe(false);
    expect(
      hintAgreesWithContext(
        hint("https://app.test/r/the-monks?location=x"),
        verified,
      ),
    ).toBe(false);
    expect(hintAgreesWithContext({ status: "unreadable" }, verified)).toBe(
      false,
    );
  });
});
