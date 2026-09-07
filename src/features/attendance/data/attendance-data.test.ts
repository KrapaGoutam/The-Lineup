import { describe, expect, it } from "vitest";

import { ATTENDANCE_QUERY_SQL, USERS_QUERY_SQL } from "./attendance-data";

describe("Neon query text", () => {
  it("never requests pin_hash", () => {
    // Asserted against the literal query text that actually gets sent,
    // not a separately-maintained column list that could drift out of
    // sync with it -- see the acceptance criteria in
    // docs/features/018-neon-attendance-report.md.
    expect(USERS_QUERY_SQL.toLowerCase()).not.toContain("pin_hash");
    expect(ATTENDANCE_QUERY_SQL.toLowerCase()).not.toContain("pin_hash");
  });

  it("never selects every column with *", () => {
    expect(USERS_QUERY_SQL).not.toContain("*");
    expect(ATTENDANCE_QUERY_SQL).not.toContain("*");
  });

  it("filters users to is_active = true", () => {
    expect(USERS_QUERY_SQL.toLowerCase()).toContain("is_active = true");
  });

  it("filters attendance strictly by user_id, never by name", () => {
    expect(ATTENDANCE_QUERY_SQL.toLowerCase()).toContain("user_id = any($1)");
    expect(ATTENDANCE_QUERY_SQL.toLowerCase()).not.toContain("full_name");
  });
});
