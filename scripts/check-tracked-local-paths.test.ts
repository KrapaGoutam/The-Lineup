import { describe, expect, it } from "vitest";
import { findForbiddenTracked } from "./check-tracked-local-paths.mjs";

describe("findForbiddenTracked", () => {
  it("flags local evidence paths", () => {
    expect(
      findForbiddenTracked([
        "docs/testing/report.md",
        ".bootstrap-owner-passcode.local.txt",
        "The Lineup.code-workspace",
      ]),
    ).toHaveLength(3);
  });

  it("allows ordinary paths", () => {
    expect(
      findForbiddenTracked([
        "docs/STATUS.md",
        "src/app/page.tsx",
        "tests/real/x.ts",
      ]),
    ).toEqual([]);
  });
});
