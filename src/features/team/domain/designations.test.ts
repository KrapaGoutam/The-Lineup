import { describe, expect, it } from "vitest";

import {
  assignableDesignations,
  canChangeDesignation,
  canDeactivateMember,
  canPurgeMember,
  designationLabel,
} from "./designations";

describe("canChangeDesignation", () => {
  it("lets an owner change anyone's designation, including another owner's", () => {
    expect(
      canChangeDesignation({
        actorDesignation: "owner",
        targetCurrentDesignation: "staff",
      }),
    ).toBe(true);
    expect(
      canChangeDesignation({
        actorDesignation: "owner",
        targetCurrentDesignation: "manager",
      }),
    ).toBe(true);
    expect(
      canChangeDesignation({
        actorDesignation: "owner",
        targetCurrentDesignation: "owner",
      }),
    ).toBe(true);
  });

  it("lets a manager toggle staff and assistant_manager, in either direction", () => {
    expect(
      canChangeDesignation({
        actorDesignation: "manager",
        targetCurrentDesignation: "staff",
      }),
    ).toBe(true);
    expect(
      canChangeDesignation({
        actorDesignation: "manager",
        targetCurrentDesignation: "assistant_manager",
      }),
    ).toBe(true);
  });

  it("never lets a manager touch an owner or a fellow manager", () => {
    expect(
      canChangeDesignation({
        actorDesignation: "manager",
        targetCurrentDesignation: "owner",
      }),
    ).toBe(false);
    expect(
      canChangeDesignation({
        actorDesignation: "manager",
        targetCurrentDesignation: "manager",
      }),
    ).toBe(false);
  });

  it("never lets an assistant manager or staff change any designation, despite an assistant manager's full operational access", () => {
    for (const target of [
      "owner",
      "manager",
      "assistant_manager",
      "staff",
    ] as const) {
      expect(
        canChangeDesignation({
          actorDesignation: "assistant_manager",
          targetCurrentDesignation: target,
        }),
      ).toBe(false);
      expect(
        canChangeDesignation({
          actorDesignation: "staff",
          targetCurrentDesignation: target,
        }),
      ).toBe(false);
    }
  });
});

describe("assignableDesignations", () => {
  it("offers an owner every other designation", () => {
    expect(
      assignableDesignations({
        actorDesignation: "owner",
        targetCurrentDesignation: "staff",
      }),
    ).toEqual(["owner", "manager", "assistant_manager"]);
  });

  it("offers a manager only the single opposite of staff/assistant_manager", () => {
    expect(
      assignableDesignations({
        actorDesignation: "manager",
        targetCurrentDesignation: "staff",
      }),
    ).toEqual(["assistant_manager"]);
    expect(
      assignableDesignations({
        actorDesignation: "manager",
        targetCurrentDesignation: "assistant_manager",
      }),
    ).toEqual(["staff"]);
  });

  it("never offers a manager the ability to grant manager or owner", () => {
    const offered = assignableDesignations({
      actorDesignation: "manager",
      targetCurrentDesignation: "staff",
    });
    expect(offered).not.toContain("manager");
    expect(offered).not.toContain("owner");
  });

  it("offers nothing to an actor who cannot change this target at all", () => {
    expect(
      assignableDesignations({
        actorDesignation: "manager",
        targetCurrentDesignation: "owner",
      }),
    ).toEqual([]);
    expect(
      assignableDesignations({
        actorDesignation: "assistant_manager",
        targetCurrentDesignation: "staff",
      }),
    ).toEqual([]);
  });
});

describe("canDeactivateMember", () => {
  it("refuses self-targeting unconditionally, for every role including owner", () => {
    for (const designation of [
      "owner",
      "manager",
      "assistant_manager",
      "staff",
    ] as const) {
      expect(
        canDeactivateMember({
          actorProfileId: "same-person",
          actorDesignation: designation,
          targetProfileId: "same-person",
          targetCurrentDesignation: designation,
        }),
      ).toBe(false);
    }
  });

  it("otherwise mirrors canChangeDesignation exactly for a different target", () => {
    expect(
      canDeactivateMember({
        actorProfileId: "owner-1",
        actorDesignation: "owner",
        targetProfileId: "manager-1",
        targetCurrentDesignation: "manager",
      }),
    ).toBe(true);
    expect(
      canDeactivateMember({
        actorProfileId: "manager-1",
        actorDesignation: "manager",
        targetProfileId: "owner-1",
        targetCurrentDesignation: "owner",
      }),
    ).toBe(false);
    expect(
      canDeactivateMember({
        actorProfileId: "manager-1",
        actorDesignation: "manager",
        targetProfileId: "staff-1",
        targetCurrentDesignation: "staff",
      }),
    ).toBe(true);
    expect(
      canDeactivateMember({
        actorProfileId: "am-1",
        actorDesignation: "assistant_manager",
        targetProfileId: "staff-1",
        targetCurrentDesignation: "staff",
      }),
    ).toBe(false);
  });
});

describe("canPurgeMember", () => {
  const base = {
    actorProfileId: "owner-1",
    actorDesignation: "owner" as const,
    targetProfileId: "staff-1",
    targetCurrentDesignation: "staff" as const,
  };

  it("refuses an active target -- purge requires deactivation first", () => {
    expect(
      canPurgeMember({ ...base, targetIsActive: true, targetIsPurged: false }),
    ).toBe(false);
  });

  it("refuses an already-purged target", () => {
    expect(
      canPurgeMember({ ...base, targetIsActive: false, targetIsPurged: true }),
    ).toBe(false);
  });

  it("allows an owner to purge an inactive, unpurged target", () => {
    expect(
      canPurgeMember({ ...base, targetIsActive: false, targetIsPurged: false }),
    ).toBe(true);
  });

  it("otherwise mirrors canDeactivateMember's role hierarchy exactly", () => {
    expect(
      canPurgeMember({
        actorProfileId: "manager-1",
        actorDesignation: "manager",
        targetProfileId: "owner-1",
        targetCurrentDesignation: "owner",
        targetIsActive: false,
        targetIsPurged: false,
      }),
    ).toBe(false);
    expect(
      canPurgeMember({
        actorProfileId: "manager-1",
        actorDesignation: "manager",
        targetProfileId: "staff-1",
        targetCurrentDesignation: "staff",
        targetIsActive: false,
        targetIsPurged: false,
      }),
    ).toBe(true);
    expect(
      canPurgeMember({
        actorProfileId: "am-1",
        actorDesignation: "assistant_manager",
        targetProfileId: "staff-1",
        targetCurrentDesignation: "staff",
        targetIsActive: false,
        targetIsPurged: false,
      }),
    ).toBe(false);
  });

  it("refuses self-targeting unconditionally, same as canDeactivateMember", () => {
    expect(
      canPurgeMember({
        actorProfileId: "same-person",
        actorDesignation: "owner",
        targetProfileId: "same-person",
        targetCurrentDesignation: "owner",
        targetIsActive: false,
        targetIsPurged: false,
      }),
    ).toBe(false);
  });
});

describe("designationLabel", () => {
  it("labels every designation for display", () => {
    expect(designationLabel("owner")).toBe("Owner");
    expect(designationLabel("manager")).toBe("Manager");
    expect(designationLabel("assistant_manager")).toBe("Assistant Manager");
    expect(designationLabel("staff")).toBe("Staff");
  });
});
