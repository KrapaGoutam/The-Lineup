import { describe, expect, it } from "vitest";

import { entryDesignation } from "./current-user";

describe("entryDesignation (V2-003.001)", () => {
  it("is exactly the legacy membership designation when there is no Overall role", () => {
    expect(
      entryDesignation({ membershipRoles: ["owner"], overallRole: null }),
    ).toBe("owner");
    expect(
      entryDesignation({
        membershipRoles: ["general_manager"],
        overallRole: null,
      }),
    ).toBe("manager");
    expect(
      entryDesignation({
        membershipRoles: ["shift_manager"],
        overallRole: null,
      }),
    ).toBe("assistant_manager");
    expect(
      entryDesignation({ membershipRoles: ["server"], overallRole: null }),
    ).toBe("staff");
    expect(
      entryDesignation({ membershipRoles: ["host"], overallRole: null }),
    ).toBe("staff");
  });

  it("maps an Overall role with no membership to the matching tier", () => {
    expect(
      entryDesignation({ membershipRoles: null, overallRole: "owner" }),
    ).toBe("owner");
    expect(
      entryDesignation({ membershipRoles: null, overallRole: "manager" }),
    ).toBe("manager");
    expect(
      entryDesignation({
        membershipRoles: null,
        overallRole: "assistant_manager",
      }),
    ).toBe("assistant_manager");
  });

  it("takes the higher of Overall role and membership", () => {
    expect(
      entryDesignation({
        membershipRoles: ["owner"],
        overallRole: "assistant_manager",
      }),
    ).toBe("owner");
    expect(
      entryDesignation({ membershipRoles: ["server"], overallRole: "manager" }),
    ).toBe("manager");
  });

  it("no membership and no Overall role degrades to staff (never elevates)", () => {
    expect(entryDesignation({ membershipRoles: null, overallRole: null })).toBe(
      "staff",
    );
  });
});
