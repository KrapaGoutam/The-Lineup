import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  createScheduleFixture,
  type ScheduleFixture,
  type ScheduleTestUser,
} from "./support/schedule-fixture";
import type { Designation } from "@/features/auth/domain/passcode";
import type { DemoShift } from "@/lib/demo-data";

let fx: ScheduleFixture;
const request = vi.hoisted(() => ({
  client: null as unknown,
  actor: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));
vi.mock("@/features/schedules/data/schedule-actor", () => ({
  getScheduleActor: async () => request.actor,
}));

import {
  addShiftAction,
  updateShiftAction,
  deleteShiftAction,
  publishScheduleAction,
  saveScheduleConfigAction,
} from "@/features/schedules/actions/schedule-actions";
import { renameTeamMemberAction } from "@/features/team/actions/member-actions";
import { updateTeamDesignationAction } from "@/features/team/actions/team-actions";

function bind(
  user: ScheduleTestUser,
  locationId: string,
  designation: Designation = "manager",
) {
  request.client = user.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: {
      organizationId: fx.org.id,
      locationId,
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: user.id,
      name: user.name,
      designation,
    },
  };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId,
  };
}

beforeAll(async () => {
  fx = await createScheduleFixture();
});

afterAll(async () => {
  if (fx) await fx.teardown();
});

it("Manager A can add, update, and delete shifts at Loc A", async () => {
  const expectedContext = bind(fx.managerA, fx.a, "manager");

  // 1. Add shift
  const shiftInput: Omit<DemoShift, "id" | "status"> = {
    employeeId: fx.staffA.id,
    serviceDate: "2026-11-09",
    endDate: "2026-11-09",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "22:00",
    usesDefaultTime: true,
    note: "Initial shift",
  };

  const addResult = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.a,
    shifts: [shiftInput],
  });

  expect(addResult.ok).toBe(true);
  if (!addResult.ok) return;
  expect(addResult.data).toHaveLength(1);
  const createdId = addResult.data[0].id;
  expect(createdId).toBeDefined();

  // 2. Update shift
  const updateResult = await updateShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.a,
    shiftId: createdId,
    employeeId: fx.staffA.id,
    shiftKind: "evening",
    startLocal: "17:00",
    endLocal: "23:00",
    note: "Updated shift",
  });

  expect(updateResult.ok).toBe(true);

  // 3. Delete shift
  const deleteResult = await deleteShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.a,
    shiftId: createdId,
  });

  expect(deleteResult.ok).toBe(true);
});

it("Manager A cannot add, update, or delete shifts at Loc B (cross-location rejection)", async () => {
  // managerA is only 'staff' at Loc B
  const expectedContext = bind(fx.managerA, fx.b, "staff");

  const shiftInput: Omit<DemoShift, "id" | "status"> = {
    employeeId: fx.staffB.id,
    serviceDate: "2026-11-09",
    endDate: "2026-11-09",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "22:00",
    usesDefaultTime: true,
  };

  // 1. Add shift at Loc B should be rejected
  const addResult = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.b,
    shifts: [shiftInput],
  });
  expect(addResult.ok).toBe(false);
  if (!addResult.ok) {
    expect(addResult.error).toContain(
      "Only an owner, manager or assistant manager",
    );
  }

  // 2. Direct PostgREST write at Loc B fails RLS
  const directInsert = await fx.managerA.client.from("shifts").insert({
    organization_id: fx.org.id,
    location_id: fx.b,
    schedule_period_id: 1,
    service_date: "2026-11-09",
    end_date: "2026-11-09",
    role_label: "Server",
    kind: "evening",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
  });
  expect(directInsert.error).not.toBeNull();
  expect(directInsert.error?.code).toBe("42501");
});

it("Staff A cannot add, update, or delete shifts at Loc A", async () => {
  const expectedContext = bind(fx.staffA, fx.a, "staff");

  const addResult = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.a,
    shifts: [
      {
        employeeId: fx.staffA.id,
        serviceDate: "2026-11-09",
        endDate: "2026-11-09",
        shiftKind: "morning",
        startLocal: "09:00",
        endLocal: "15:00",
        usesDefaultTime: true,
      },
    ],
  });
  expect(addResult.ok).toBe(false);
  if (!addResult.ok) {
    expect(addResult.error).toContain(
      "Only an owner, manager or assistant manager",
    );
  }
});

it("Manager A cannot assign Staff B to Loc A shift (workforce eligibility failure)", async () => {
  const expectedContext = bind(fx.managerA, fx.a, "manager");

  // staffB only belongs to Loc B, not Loc A
  const addResult = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    locationId: fx.a,
    shifts: [
      {
        employeeId: fx.staffB.id,
        serviceDate: "2026-11-09",
        endDate: "2026-11-09",
        shiftKind: "evening",
        startLocal: "16:00",
        endLocal: "22:00",
        usesDefaultTime: true,
      },
    ],
  });

  expect(addResult.ok).toBe(false);
  if (!addResult.ok) {
    expect(addResult.error).toContain("not eligible for this location");
  }
});

it("Manager A cannot save operating hours or shift defaults at Loc B", async () => {
  // Try saving schedule config at Loc B
  const expectedContextB = bind(fx.managerA, fx.b, "staff");
  const configResult = await saveScheduleConfigAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expectedContextB,
    locationId: fx.b,
    operatingHours: Array.from({ length: 7 }, () => ({
      opening: "08:00",
      closing: "22:00",
      closed: false,
    })),
    shiftDefaults: {
      morning: { start: "08:00", end: "16:00" },
      evening: { start: "16:00", end: "23:00" },
      full_day: { start: "09:00", end: "21:00" },
    },
  });
  expect(configResult.ok).toBe(false);
  if (!configResult.ok) {
    expect(configResult.error).toContain(
      "Only an owner, manager or assistant manager",
    );
  }

  // Direct PostgREST write to operating_hours at Loc B fails RLS
  const directHours = await fx.managerA.client.from("operating_hours").insert({
    organization_id: fx.org.id,
    location_id: fx.b,
    day_of_week: 1,
    opening_local: "08:00",
    closing_local: "22:00",
  });
  expect(directHours.error).not.toBeNull();
  expect(directHours.error?.code).toBe("42501");

  // Direct PostgREST write to shift_kind_defaults at Loc B fails RLS
  const directDefaults = await fx.managerA.client
    .from("shift_kind_defaults")
    .insert({
      organization_id: fx.org.id,
      location_id: fx.b,
      kind: "morning",
      start_local: "08:00",
      end_local: "16:00",
    });
  expect(directDefaults.error).not.toBeNull();
  expect(directDefaults.error?.code).toBe("42501");
});

it("Stale workspace expectation returns contextStale: true", async () => {
  bind(fx.managerA, fx.a, "manager");

  // Caller is at Loc A, but client sends expectation for Loc B
  const staleContext = {
    profileId: fx.managerA.id,
    organizationId: fx.org.id,
    locationId: fx.b, // Stale!
  };

  const result = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext: staleContext,
    locationId: fx.a,
    shifts: [
      {
        employeeId: fx.staffA.id,
        serviceDate: "2026-11-09",
        endDate: "2026-11-09",
        shiftKind: "evening",
        startLocal: "16:00",
        endLocal: "22:00",
        usesDefaultTime: true,
      },
    ],
  });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.contextStale).toBe(true);
    expect(result.error).toContain("active restaurant or location changed");
  }
});

it("Overall Manager can manage schedules at Loc A and Loc B", async () => {
  // Overall manager at Loc A
  const expectedContextA = bind(fx.overallManager, fx.a, "manager");
  const addResultA = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expectedContextA,
    locationId: fx.a,
    shifts: [
      {
        employeeId: fx.staffA.id,
        serviceDate: "2026-11-10",
        endDate: "2026-11-10",
        shiftKind: "morning",
        startLocal: "09:00",
        endLocal: "15:00",
        usesDefaultTime: true,
      },
    ],
  });
  expect(addResultA.ok).toBe(true);

  // Overall manager at Loc B
  const expectedContextB = bind(fx.overallManager, fx.b, "manager");
  const addResultB = await addShiftAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expectedContextB,
    locationId: fx.b,
    shifts: [
      {
        employeeId: fx.staffB.id,
        serviceDate: "2026-11-10",
        endDate: "2026-11-10",
        shiftKind: "morning",
        startLocal: "09:00",
        endLocal: "15:00",
        usesDefaultTime: true,
      },
    ],
  });
  expect(addResultB.ok).toBe(true);

  // Overall manager can publish schedule at Loc A
  const rebindA = bind(fx.overallManager, fx.a, "manager");
  const publishResult = await publishScheduleAction({
    restaurantSlug: fx.org.slug,
    expectedContext: rebindA,
    locationId: fx.a,
  });
  expect(publishResult.ok).toBe(true);
});

it("Local manager cannot rename members or change team designations", async () => {
  // Bind managerA client
  request.client = fx.managerA.client;

  // 1. Rename member action rejected
  const renameResult = await renameTeamMemberAction({
    restaurantSlug: fx.org.slug,
    organizationId: fx.org.id,
    targetProfileId: fx.staffA.id,
    previousDisplayName: fx.staffA.name,
    nextDisplayName: "Hacked Display Name",
  });
  expect(renameResult.ok).toBe(false);
  if (!renameResult.ok) {
    expect(renameResult.error).toContain(
      "Only an owner or general manager can rename",
    );
  }

  // 2. Change designation action rejected
  const roleResult = await updateTeamDesignationAction({
    restaurantSlug: fx.org.slug,
    organizationId: fx.org.id,
    targetProfileId: fx.staffA.id,
    previousDesignation: "staff",
    nextDesignation: "manager",
  });
  expect(roleResult.ok).toBe(false);
  if (!roleResult.ok) {
    expect(roleResult.error).toContain(
      "Only an owner or general manager can change designations",
    );
  }

  // 3. Direct PostgREST attempt to update memberships updates 0 rows
  const directRoleUpdate = await fx.managerA.client
    .from("memberships")
    .update({ roles: ["owner"] })
    .eq("organization_id", fx.org.id)
    .eq("profile_id", fx.staffA.id)
    .select();
  expect(directRoleUpdate.data).toHaveLength(0);

  // 4. Direct PostgREST attempt to update profiles updates 0 rows
  const directProfileUpdate = await fx.managerA.client
    .from("profiles")
    .update({ display_name: "Hacked By Manager A" })
    .eq("id", fx.staffA.id)
    .select();
  expect(directProfileUpdate.data).toHaveLength(0);
});

it("Org Owner CAN rename members and change designations", async () => {
  request.client = fx.owner.client;

  const roleResult = await updateTeamDesignationAction({
    restaurantSlug: fx.org.slug,
    organizationId: fx.org.id,
    targetProfileId: fx.staffA.id,
    previousDesignation: "staff",
    nextDesignation: "assistant_manager",
  });
  expect(roleResult.ok).toBe(true);

  const renameResult = await renameTeamMemberAction({
    restaurantSlug: fx.org.slug,
    organizationId: fx.org.id,
    targetProfileId: fx.staffA.id,
    previousDisplayName: fx.staffA.name,
    nextDisplayName: "Staff A Promoted",
  });
  expect(renameResult.ok).toBe(true);
});

it("direct client: publisher identity cannot be forged; the previous app's own-stamp publish sequence still works", async () => {
  // The previous (deployed) app writes straight through PostgREST: draft period,
  // shift, assignment, then a publish stamped with the caller's own profile id.
  const m = fx.managerA.client;
  const period = await m
    .from("schedule_periods")
    .insert({
      organization_id: fx.org.id,
      location_id: fx.a,
      starts_on: "2031-01-01",
      ends_on: "2031-12-31",
      status: "draft",
    })
    .select("id")
    .single();
  expect(period.error).toBeNull();
  const periodId = period.data!.id;

  const shift = await m
    .from("shifts")
    .insert({
      organization_id: fx.org.id,
      location_id: fx.a,
      schedule_period_id: periodId,
      service_date: "2031-03-03",
      end_date: "2031-03-03",
      kind: "evening",
      starts_at: "2031-03-03T22:00:00Z",
      ends_at: "2031-03-04T04:00:00Z",
      role_label: "Server",
    })
    .select("id")
    .single();
  expect(shift.error).toBeNull();
  const assignment = await m.from("shift_assignments").insert({
    organization_id: fx.org.id,
    shift_id: shift.data!.id,
    profile_id: fx.staffA.id,
  });
  expect(assignment.error).toBeNull();

  const publish = (publishedBy: string) =>
    m
      .from("schedule_periods")
      .update({
        status: "published",
        published_version: 1,
        published_at: new Date().toISOString(),
        published_by: publishedBy,
      })
      .eq("id", periodId)
      .select("id, status, published_by");

  // Forged attribution (to another real profile) is refused and changes nothing.
  const forged = await publish(fx.staffA.id);
  expect(forged.error?.code).toBe("42501");
  const stillDraft = await fx.admin
    .from("schedule_periods")
    .select("status, published_by")
    .eq("id", periodId)
    .single();
  expect(stillDraft.data).toEqual({ status: "draft", published_by: null });

  // A forged stamp at creation time is refused too.
  const forgedInsert = await m.from("schedule_periods").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    starts_on: "2032-01-01",
    ends_on: "2032-12-31",
    status: "draft",
    published_by: fx.staffA.id,
  });
  expect(forgedInsert.error?.code).toBe("42501");

  // The honest sequence works and is attributed to the real caller.
  const honest = await publish(fx.managerA.id);
  expect(honest.error).toBeNull();
  expect(honest.data?.[0]).toMatchObject({
    status: "published",
    published_by: fx.managerA.id,
  });

  // Staff can now read the published shift; the publisher stays distinguishable.
  const staffView = await fx.staffA.client
    .from("shifts")
    .select("id")
    .eq("id", shift.data!.id);
  expect(staffView.data).toHaveLength(1);
});
