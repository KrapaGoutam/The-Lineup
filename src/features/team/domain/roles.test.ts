import { describe, expect, it } from "vitest";

import { canChangeRole, otherAssignableRole } from "./roles";

describe("canChangeRole", () => {
  it("lets an owner change anyone's role", () => {
    expect(
      canChangeRole({ actorRole: "owner", targetCurrentRole: "server" }),
    ).toBe(true);
    expect(
      canChangeRole({ actorRole: "owner", targetCurrentRole: "manager" }),
    ).toBe(true);
    expect(
      canChangeRole({ actorRole: "owner", targetCurrentRole: "owner" }),
    ).toBe(true);
  });

  it("lets a manager change a server's or another manager's role", () => {
    expect(
      canChangeRole({ actorRole: "manager", targetCurrentRole: "server" }),
    ).toBe(true);
    expect(
      canChangeRole({ actorRole: "manager", targetCurrentRole: "manager" }),
    ).toBe(true);
  });

  it("never lets a manager touch an owner's role", () => {
    expect(
      canChangeRole({ actorRole: "manager", targetCurrentRole: "owner" }),
    ).toBe(false);
  });

  it("never lets a server change any role", () => {
    expect(
      canChangeRole({ actorRole: "server", targetCurrentRole: "server" }),
    ).toBe(false);
    expect(
      canChangeRole({ actorRole: "server", targetCurrentRole: "manager" }),
    ).toBe(false);
  });
});

describe("otherAssignableRole", () => {
  it("toggles between manager and server", () => {
    expect(otherAssignableRole("server")).toBe("manager");
    expect(otherAssignableRole("manager")).toBe("server");
  });

  it("has no toggle target for owner", () => {
    expect(otherAssignableRole("owner")).toBeNull();
  });
});
