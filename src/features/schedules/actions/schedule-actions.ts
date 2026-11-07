"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { DayHours } from "@/hooks/use-restaurant-clock";
import {
  getWeekScheduleData,
  type WeekScheduleData,
} from "@/features/schedules/data/schedule-data";
import { getScheduleActor } from "@/features/schedules/data/schedule-actor";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import {
  addDays,
  type ShiftDefaults,
  type ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import { nextPublishedVersion } from "@/features/schedules/domain/schedule-versioning";
import { writeAuditEvent } from "@/features/team/data/audit-log";
import { guardModule } from "@/features/modules/data/module-enforcement";
import type { DemoShift } from "@/lib/demo-data";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeToInstant } from "@/lib/timezone";

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const localDateSchema = z.iso.date();

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

const STALE_CONTEXT_MESSAGE =
  "Your active restaurant or location changed in another tab. Please reload before saving.";

function isManagerRole(designation: string): boolean {
  return (
    designation === "owner" ||
    designation === "manager" ||
    designation === "assistant_manager"
  );
}

type Caller = NonNullable<Awaited<ReturnType<typeof getScheduleActor>>>;

type ScheduleLocationRosterRow = {
  profile_id: string;
  display_name: string | null;
  roles: string[] | null;
  active: boolean;
  eligible: boolean;
};

/**
 * Server-side request-context consistency check (V2-003.005 / V2-005.004).
 * Validates that the client's expected context matches the server-verified caller.
 */
async function checkWorkspace(
  raw: unknown,
  caller: Caller,
  claimedLocationId?: string,
) {
  const expectationRaw = raw ?? {
    profileId: caller.viewer.profileId,
    organizationId: caller.organizationId,
    locationId: claimedLocationId ?? caller.scope.locationId,
  };
  const outcome = await assertWorkspaceExpectation(
    expectationRaw,
    {
      profileId: caller.viewer.profileId,
      organizationId: caller.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: caller.scope.locationId,
        time_zone: caller.scope.timeZone,
      }),
    },
  );
  if (outcome.ok) return { ok: true as const, location: outcome.location };
  if (outcome.code === "invalid") {
    return {
      ok: false as const,
      result: { ok: false as const, error: "That request is invalid." },
    };
  }
  return {
    ok: false as const,
    result: {
      ok: false as const,
      error: STALE_CONTEXT_MESSAGE,
      contextStale: true as const,
    },
  };
}

/**
 * One draft `schedule_periods` row per (location, calendar year), created
 * lazily. Bound strictly to the verified location.
 */
async function getOrCreateDraftPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  locationId: string,
  targetDate: string,
) {
  const year = targetDate.slice(0, 4);
  const startsOn = `${year}-01-01`;
  const endsOn = `${year}-12-31`;

  const { data: existing } = await supabase
    .from("schedule_periods")
    .select("id, status")
    .eq("location_id", locationId)
    .eq("starts_on", startsOn)
    .eq("ends_on", endsOn)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status === "draft") return existing;

  const { data: created, error } = await supabase
    .from("schedule_periods")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "draft",
    })
    .select("id, status")
    .single();
  if (error || !created) return null;
  return created;
}

export type AddShiftInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  timeZone?: string;
  shifts: Array<Omit<DemoShift, "id" | "status">>;
};

export async function addShiftAction(
  input: AddShiftInput,
): Promise<ActionResult<DemoShift[]>> {
  if (input.shifts.length === 0) {
    return { ok: false, error: "No shifts to add." };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const actor = await getScheduleActor(input.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to edit the schedule." };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    actor,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  if (!isManagerRole(actor.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can add shifts.",
    };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  // Validate workforce eligibility for all assignees at this location
  const employeeIds = Array.from(
    new Set(input.shifts.map((s) => s.employeeId)),
  );
  const { data: roster, error: rosterError } = await supabase.rpc(
    "schedule_location_roster",
    {
      p_organization_id: actor.organizationId,
      p_location_id: actor.scope.locationId,
    },
  );
  if (rosterError) return { ok: false, error: rosterError.message };
  const rosterRows =
    (roster as unknown as ScheduleLocationRosterRow[] | null) ?? [];
  const eligibleSet = new Set(
    rosterRows.filter((r) => r.eligible && r.active).map((r) => r.profile_id),
  );
  for (const id of employeeIds) {
    if (!eligibleSet.has(id)) {
      return {
        ok: false,
        error:
          "One or more assigned employees are not eligible for this location.",
      };
    }
  }

  const period = await getOrCreateDraftPeriod(
    supabase,
    actor.organizationId,
    actor.scope.locationId,
    input.shifts[0].serviceDate,
  );
  if (!period) {
    return { ok: false, error: "Could not prepare a schedule period." };
  }

  const targetTimeZone = input.timeZone ?? actor.scope.timeZone;
  const { data: createdShifts, error: shiftsError } = await supabase
    .from("shifts")
    .insert(
      input.shifts.map((shift) => {
        const startsAt = zonedWallTimeToInstant({
          date: shift.serviceDate,
          time: shift.startLocal,
          timeZone: targetTimeZone,
        });
        const endsAt = zonedWallTimeToInstant({
          date: shift.endDate,
          time: shift.endLocal,
          timeZone: targetTimeZone,
        });
        return {
          organization_id: actor.organizationId,
          location_id: actor.scope.locationId,
          schedule_period_id: period.id,
          service_date: shift.serviceDate,
          end_date: shift.endDate,
          kind: shift.shiftKind,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          uses_default_time: shift.usesDefaultTime,
          role_label: "Server",
          notes: shift.note ?? null,
          series_id: shift.seriesId ?? null,
          is_recurring: shift.isRecurring ?? false,
        };
      }),
    )
    .select("id");
  if (shiftsError || !createdShifts) {
    return {
      ok: false,
      error: `Could not create the shift: ${shiftsError?.message}`,
    };
  }

  const { error: assignError } = await supabase
    .from("shift_assignments")
    .insert(
      createdShifts.map((shift, index) => ({
        organization_id: actor.organizationId,
        shift_id: shift.id,
        profile_id: input.shifts[index].employeeId,
      })),
    );
  if (assignError) {
    await supabase
      .from("shifts")
      .delete()
      .in(
        "id",
        createdShifts.map((shift) => shift.id),
      );
    return {
      ok: false,
      error: `Could not assign the shift: ${assignError.message}`,
    };
  }

  revalidatePath(`/r/${input.restaurantSlug}`);

  return {
    ok: true,
    data: createdShifts.map((shift, index) => ({
      id: String(shift.id),
      status: "draft" as const,
      ...input.shifts[index],
    })),
  };
}

export type PublishScheduleInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  locationId?: string;
  timeZone?: string;
};

export async function publishScheduleAction(
  input: PublishScheduleInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const actor = await getScheduleActor(input.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to publish the schedule." };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    actor,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  if (!isManagerRole(actor.viewer.designation)) {
    return {
      ok: false,
      error:
        "Only an owner, manager or assistant manager can publish schedules.",
    };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  const year = new Date().getFullYear().toString();
  const startsOn = `${year}-01-01`;
  const endsOn = `${year}-12-31`;

  const { data: draft } = await supabase
    .from("schedule_periods")
    .select("id")
    .eq("location_id", actor.scope.locationId)
    .eq("starts_on", startsOn)
    .eq("ends_on", endsOn)
    .eq("status", "draft")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft) {
    return { ok: false, error: "No draft schedule to publish." };
  }

  const { data: periodsForRange } = await supabase
    .from("schedule_periods")
    .select("published_version")
    .eq("location_id", actor.scope.locationId)
    .eq("starts_on", startsOn)
    .eq("ends_on", endsOn);
  const nextVersion = nextPublishedVersion(
    (periodsForRange ?? []).map((row) => row.published_version),
  );

  const { error } = await supabase
    .from("schedule_periods")
    .update({
      status: "published",
      published_version: nextVersion,
      published_at: new Date().toISOString(),
      published_by: actor.viewer.profileId,
    })
    .eq("id", draft.id);
  if (error) return { ok: false, error: error.message };

  await writeAuditEvent(supabase, {
    organizationId: actor.organizationId,
    locationId: actor.scope.locationId,
    actorProfileId: actor.viewer.profileId,
    action: "publish_schedule",
    entityType: "schedule_period",
    entityId: String(draft.id),
    beforeState: { status: "draft" },
    afterState: { status: "published", publishedVersion: nextVersion },
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export type SaveScheduleConfigInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  operatingHours: DayHours[];
  shiftDefaults: ShiftDefaults;
};

export async function saveScheduleConfigAction(
  input: SaveScheduleConfigInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const actor = await getScheduleActor(input.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to save store settings." };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    actor,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  if (!isManagerRole(actor.viewer.designation)) {
    return {
      ok: false,
      error:
        "Only an owner, manager or assistant manager can save store settings.",
    };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  const { error: hoursError } = await supabase.from("operating_hours").upsert(
    input.operatingHours.map((day, dayOfWeek) => ({
      organization_id: actor.organizationId,
      location_id: actor.scope.locationId,
      day_of_week: dayOfWeek,
      opening_local: day.closed ? null : day.opening,
      closing_local: day.closed ? null : day.closing,
      closed: day.closed,
    })),
    { onConflict: "location_id,day_of_week" },
  );
  if (hoursError) return { ok: false, error: hoursError.message };

  const kinds: ShiftKind[] = ["morning", "evening", "full_day"];
  const { error: defaultsError } = await supabase
    .from("shift_kind_defaults")
    .upsert(
      kinds.map((kind) => ({
        organization_id: actor.organizationId,
        location_id: actor.scope.locationId,
        kind,
        start_local: input.shiftDefaults[kind].start,
        end_local: input.shiftDefaults[kind].end,
      })),
      { onConflict: "location_id,kind" },
    );
  if (defaultsError) return { ok: false, error: defaultsError.message };

  await writeAuditEvent(supabase, {
    organizationId: actor.organizationId,
    locationId: actor.scope.locationId,
    actorProfileId: actor.viewer.profileId,
    action: "save_schedule_config",
    entityType: "operating_hours",
    entityId: actor.scope.locationId,
    beforeState: null,
    afterState: {
      operatingHours: input.operatingHours,
      shiftDefaults: input.shiftDefaults,
    },
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export async function getScheduleContextForWeekAction(input: {
  restaurantSlug: string;
  weekStartDate: string;
}): Promise<ActionResult<WeekScheduleData>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      weekStartDate: localDateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That week request is invalid." };
  }

  const actor = await getScheduleActor(parsed.data.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to see the schedule." };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  const result = await getWeekScheduleData(
    actor.organizationId,
    parsed.data.weekStartDate,
    { id: actor.scope.locationId, time_zone: actor.scope.timeZone },
  );
  if (!result) {
    return { ok: false, error: "No location is set up yet." };
  }
  return { ok: true, data: result };
}

export type UpdateShiftInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  shiftId: string;
  timeZone?: string;
  employeeId: string;
  shiftKind: ShiftKind;
  startLocal: string;
  endLocal: string;
  note?: string;
};

export async function updateShiftAction(
  input: UpdateShiftInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const actor = await getScheduleActor(input.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to edit a shift." };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    actor,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  if (!isManagerRole(actor.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can edit shifts.",
    };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  const shiftId = Number(input.shiftId);
  if (!Number.isFinite(shiftId)) {
    return { ok: false, error: "That shift no longer exists." };
  }

  const { data: before, error: beforeError } = await supabase
    .from("shifts")
    .select(
      "id, location_id, service_date, end_date, kind, starts_at, ends_at, notes, shift_assignments!shift_assignments_shift_tenant_fk(profile_id)",
    )
    .eq("id", shiftId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (beforeError || !before || before.location_id !== actor.scope.locationId) {
    return { ok: false, error: "That shift no longer exists." };
  }
  const previousAssignment = before.shift_assignments as unknown as
    | { profile_id: string }[]
    | null;
  const previousEmployeeId = previousAssignment?.[0]?.profile_id ?? null;

  // If changing assignee, verify workforce eligibility
  if (previousEmployeeId !== input.employeeId) {
    const { data: roster, error: rosterError } = await supabase.rpc(
      "schedule_location_roster",
      {
        p_organization_id: actor.organizationId,
        p_location_id: actor.scope.locationId,
      },
    );
    if (rosterError) return { ok: false, error: rosterError.message };
    const rosterRows =
      (roster as unknown as ScheduleLocationRosterRow[] | null) ?? [];
    const isEligible = rosterRows.some(
      (r) => r.profile_id === input.employeeId && r.eligible && r.active,
    );
    if (!isEligible) {
      return {
        ok: false,
        error: "That employee is not eligible for this location.",
      };
    }
  }

  const targetTimeZone = input.timeZone ?? actor.scope.timeZone;
  const endDate =
    input.endLocal <= input.startLocal
      ? addDays(before.service_date, 1)
      : before.service_date;
  const startsAt = zonedWallTimeToInstant({
    date: before.service_date,
    time: input.startLocal,
    timeZone: targetTimeZone,
  });
  const endsAt = zonedWallTimeToInstant({
    date: endDate,
    time: input.endLocal,
    timeZone: targetTimeZone,
  });

  const { error: updateError } = await supabase
    .from("shifts")
    .update({
      end_date: endDate,
      kind: input.shiftKind,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      uses_default_time: false,
      notes: input.note ?? null,
    })
    .eq("id", shiftId)
    .eq("organization_id", actor.organizationId)
    .eq("location_id", actor.scope.locationId);
  if (updateError) return { ok: false, error: updateError.message };

  if (previousEmployeeId !== input.employeeId) {
    const { error: unassignError } = await supabase
      .from("shift_assignments")
      .delete()
      .eq("shift_id", shiftId);
    if (unassignError) return { ok: false, error: unassignError.message };
    const { error: assignError } = await supabase
      .from("shift_assignments")
      .insert({
        organization_id: actor.organizationId,
        shift_id: shiftId,
        profile_id: input.employeeId,
      });
    if (assignError) return { ok: false, error: assignError.message };
  }

  await writeAuditEvent(supabase, {
    organizationId: actor.organizationId,
    locationId: actor.scope.locationId,
    actorProfileId: actor.viewer.profileId,
    action: "update_shift",
    entityType: "shift",
    entityId: input.shiftId,
    beforeState: {
      kind: before.kind,
      startsAt: before.starts_at,
      endsAt: before.ends_at,
      employeeId: previousEmployeeId,
      notes: before.notes,
    },
    afterState: {
      kind: input.shiftKind,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      employeeId: input.employeeId,
      note: input.note ?? null,
    },
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export type DeleteShiftInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  shiftId: string;
};

export async function deleteShiftAction(
  input: DeleteShiftInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const actor = await getScheduleActor(input.restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You need to sign in to delete a shift." };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    actor,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  if (!isManagerRole(actor.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can delete shifts.",
    };
  }

  const blocked = await guardModule({
    module: "schedule",
    organizationId: actor.organizationId,
    claimedLocationId: actor.scope.locationId,
  });
  if (blocked) return blocked;

  const shiftId = Number(input.shiftId);
  if (!Number.isFinite(shiftId)) {
    return { ok: false, error: "That shift no longer exists." };
  }

  const { data: before, error: beforeError } = await supabase
    .from("shifts")
    .select(
      "id, location_id, service_date, end_date, kind, starts_at, ends_at, shift_assignments!shift_assignments_shift_tenant_fk(profile_id)",
    )
    .eq("id", shiftId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (beforeError || !before || before.location_id !== actor.scope.locationId) {
    return { ok: false, error: "That shift no longer exists." };
  }

  const { error: deleteError } = await supabase
    .from("shifts")
    .delete()
    .eq("id", shiftId)
    .eq("organization_id", actor.organizationId)
    .eq("location_id", actor.scope.locationId);
  if (deleteError) return { ok: false, error: deleteError.message };

  const assignment = before.shift_assignments as unknown as
    | { profile_id: string }[]
    | null;
  await writeAuditEvent(supabase, {
    organizationId: actor.organizationId,
    locationId: actor.scope.locationId,
    actorProfileId: actor.viewer.profileId,
    action: "delete_shift",
    entityType: "shift",
    entityId: input.shiftId,
    beforeState: {
      serviceDate: before.service_date,
      endDate: before.end_date,
      kind: before.kind,
      startsAt: before.starts_at,
      endsAt: before.ends_at,
      employeeId: assignment?.[0]?.profile_id ?? null,
    },
    afterState: null,
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}
