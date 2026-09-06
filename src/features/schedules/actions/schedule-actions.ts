"use server";

import { revalidatePath } from "next/cache";

import type { DayHours } from "@/hooks/use-restaurant-clock";
import type {
  ShiftDefaults,
  ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import { nextPublishedVersion } from "@/features/schedules/domain/schedule-versioning";
import type { DemoShift } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeToInstant } from "@/lib/timezone";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * One draft `schedule_periods` row per (location, calendar year), created
 * lazily. This is a deliberately simpler stand-in for the full
 * date-range-versioned model DATA_MODEL.md describes -- a single
 * year-long bucket per location instead of one period per publish batch
 * -- chosen because the UI has no period-scoped navigation yet to make
 * finer-grained periods meaningful. "A later change creates a new
 * version rather than rewriting" is still honored: if the year's most
 * recent period is already published, a fresh draft one is created
 * alongside it rather than reopening the published one.
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
  organizationId: string;
  locationId: string;
  timeZone: string;
  // Pre-computed by the same pure `createShiftInstances` the client
  // already calls for validation and preview (schedule-workspace.tsx's
  // ShiftEditor) -- re-deriving the same instances here from raw
  // fromDate/toDate fields would be the same business logic living in
  // two places. One request always carries one employee and one batch
  // of instances from a single date-range submission.
  shifts: Array<Omit<DemoShift, "id" | "status">>;
};

export async function addShiftAction(
  input: AddShiftInput,
): Promise<ActionResult<DemoShift[]>> {
  if (input.shifts.length === 0) {
    return { ok: false, error: "No shifts to add." };
  }

  const supabase = await createClient();
  const period = await getOrCreateDraftPeriod(
    supabase,
    input.organizationId,
    input.locationId,
    input.shifts[0].serviceDate,
  );
  if (!period) {
    return { ok: false, error: "Could not prepare a schedule period." };
  }

  const { data: createdShifts, error: shiftsError } = await supabase
    .from("shifts")
    .insert(
      input.shifts.map((shift) => {
        const startsAt = zonedWallTimeToInstant({
          date: shift.serviceDate,
          time: shift.startLocal,
          timeZone: input.timeZone,
        });
        const endsAt = zonedWallTimeToInstant({
          date: shift.endDate,
          time: shift.endLocal,
          timeZone: input.timeZone,
        });
        return {
          organization_id: input.organizationId,
          location_id: input.locationId,
          schedule_period_id: period.id,
          service_date: shift.serviceDate,
          end_date: shift.endDate,
          kind: shift.shiftKind,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          uses_default_time: shift.usesDefaultTime,
          // The schema's role_label was designed for the retained
          // multi-role floor system this app's simplified 3-shift model
          // doesn't expose yet -- "Server" is an honest placeholder, not
          // a hidden feature.
          role_label: "Server",
          notes: shift.note ?? null,
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
        organization_id: input.organizationId,
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

export async function publishScheduleAction(input: {
  restaurantSlug: string;
  locationId: string;
  timeZone: string;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const year = new Date().getFullYear().toString();
  // Deliberately not timezone-corrected to the exact location-local
  // year -- this only matters within a few hours of New Year's, and the
  // worst case is publishing next/last year's (empty, freshly created)
  // period, not any data loss.
  const startsOn = `${year}-01-01`;
  const endsOn = `${year}-12-31`;

  const { data: draft } = await supabase
    .from("schedule_periods")
    .select("id")
    .eq("location_id", input.locationId)
    .eq("starts_on", startsOn)
    .eq("ends_on", endsOn)
    .eq("status", "draft")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft) {
    return { ok: false, error: "No draft schedule to publish." };
  }

  // published_version is unique per (location_id, starts_on, ends_on),
  // not per row -- see nextPublishedVersion's doc comment. Every period
  // matching this location/year, published or still draft, has to be
  // considered, not just the row being published.
  const { data: periodsForRange } = await supabase
    .from("schedule_periods")
    .select("published_version")
    .eq("location_id", input.locationId)
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
    })
    .eq("id", draft.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export async function saveScheduleConfigAction(input: {
  restaurantSlug: string;
  organizationId: string;
  locationId: string;
  operatingHours: DayHours[];
  shiftDefaults: ShiftDefaults;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { error: hoursError } = await supabase.from("operating_hours").upsert(
    input.operatingHours.map((day, dayOfWeek) => ({
      organization_id: input.organizationId,
      location_id: input.locationId,
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
        organization_id: input.organizationId,
        location_id: input.locationId,
        kind,
        start_local: input.shiftDefaults[kind].start,
        end_local: input.shiftDefaults[kind].end,
      })),
      { onConflict: "location_id,kind" },
    );
  if (defaultsError) return { ok: false, error: defaultsError.message };

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}
