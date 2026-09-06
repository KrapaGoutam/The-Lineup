import "server-only";

import type { DayHours } from "@/hooks/use-restaurant-clock";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import {
  getMonthDates,
  getWeekDates,
} from "@/features/schedules/domain/shift-planning";
import type {
  ShiftDefaults,
  ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import { getOrganizationRoster } from "@/features/team/data/roster";
import type { DemoShift, TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

// Matches today's hardcoded demo defaults exactly -- used only until an
// owner/manager actually configures real operating_hours/shift_kind_defaults
// rows for their location (bootstrap deliberately doesn't seed them; see
// docs/features/015-hosted-supabase-persistence.md, Phase A).
const FALLBACK_OPERATING_HOURS: DayHours[] = Array.from({ length: 7 }, () => ({
  opening: "11:00",
  closing: "23:00",
  closed: false,
}));
const FALLBACK_SHIFT_DEFAULTS: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

function truncateToMinutes(value: string): string {
  return value.slice(0, 5);
}

export type ScheduleContext = {
  locationId: string;
  timeZone: string;
  operatingHours: DayHours[];
  shiftDefaults: ShiftDefaults;
  team: TeamMember[];
  weekDates: string[];
  monthDates: string[];
  shifts: DemoShift[];
};

export async function getScheduleContext(
  organizationId: string,
): Promise<ScheduleContext | null> {
  const supabase = await createClient();
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const today = zonedWallTimeFromInstant(new Date(), location.time_zone).date;
  const weekDates = getWeekDates(today);
  const monthDates = getMonthDates(today);
  // The week and month grids need the same underlying rows; query the
  // union of both ranges once rather than twice. A week only ever
  // crosses a month boundary at its very start or end, so this is just
  // the widest of the two ranges on each side, not a real edge case to
  // special-case further.
  const queryStart =
    weekDates[0] < monthDates[0] ? weekDates[0] : monthDates[0];
  const queryEnd =
    weekDates[6] > monthDates.at(-1)! ? weekDates[6] : monthDates.at(-1)!;

  const [
    { data: hoursRows, error: hoursError },
    { data: defaultsRows, error: defaultsError },
    team,
    { data: shiftRows, error: shiftsError },
  ] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("day_of_week, opening_local, closing_local, closed")
      .eq("location_id", location.id),
    supabase
      .from("shift_kind_defaults")
      .select("kind, start_local, end_local")
      .eq("location_id", location.id),
    getOrganizationRoster(organizationId),
    supabase
      .from("shifts")
      // `shifts` has two foreign keys to `schedule_periods` (a plain
      // one and a tenant-composite one) and two to `shift_assignments`'
      // parent side likewise -- PostgREST refuses to embed either
      // without picking a constraint name explicitly, confirmed
      // against the live project (a bare `schedule_periods(status)`
      // returns a PGRST201 "more than one relationship found" error,
      // not the rows). Picking the tenant-composite constraint for
      // both matches this schema's general defense-in-depth pattern.
      .select(
        "id, service_date, end_date, kind, starts_at, ends_at, uses_default_time, notes, schedule_periods!shifts_period_tenant_fk(status), shift_assignments!shift_assignments_shift_tenant_fk(profile_id)",
      )
      .eq("organization_id", organizationId)
      .gte("service_date", queryStart)
      .lte("service_date", queryEnd),
  ]);

  // None of these should ever silently become an empty array -- that
  // failure mode is indistinguishable from "nothing was saved" to
  // whoever is looking at the UI. Logged, not thrown: a partial
  // failure here still degrades to sensible fallbacks below rather
  // than blanking the whole page.
  if (hoursError)
    console.error("getScheduleContext: operating_hours", hoursError);
  if (defaultsError)
    console.error("getScheduleContext: shift_kind_defaults", defaultsError);
  if (shiftsError) console.error("getScheduleContext: shifts", shiftsError);

  const operatingHours = FALLBACK_OPERATING_HOURS.map((fallback, day) => {
    const row = hoursRows?.find((candidate) => candidate.day_of_week === day);
    if (!row) return fallback;
    return {
      opening: row.opening_local
        ? truncateToMinutes(row.opening_local)
        : fallback.opening,
      closing: row.closing_local
        ? truncateToMinutes(row.closing_local)
        : fallback.closing,
      closed: row.closed,
    };
  });

  const shiftDefaults: ShiftDefaults = { ...FALLBACK_SHIFT_DEFAULTS };
  for (const row of defaultsRows ?? []) {
    shiftDefaults[row.kind as ShiftKind] = {
      start: truncateToMinutes(row.start_local),
      end: truncateToMinutes(row.end_local),
    };
  }

  const shifts: DemoShift[] = (shiftRows ?? [])
    .map((row): DemoShift | null => {
      const assignment = row.shift_assignments?.[0];
      if (!assignment) return null; // a shift with no assignment can't render as one person's row
      const start = zonedWallTimeFromInstant(
        new Date(row.starts_at),
        location.time_zone,
      );
      const end = zonedWallTimeFromInstant(
        new Date(row.ends_at),
        location.time_zone,
      );
      // Supabase's generated types mark this embed as an array because
      // the underlying FK's `isOneToOne` metadata is false -- but at
      // runtime PostgREST always returns a single object for an embed
      // across the *embedding* table's own FK column (many shifts to
      // one schedule_period), confirmed against the live project
      // directly (`schedule_periods!shifts_period_tenant_fk(status)`
      // returns `{"status": "..."}`, not an array). The array typing
      // is a known supabase-js/postgrest-js type-inference gap, not
      // the actual response shape -- see DATA_MODEL.md's "PostgREST
      // embed cardinality" section.
      const period = row.schedule_periods as unknown as {
        status: string;
      } | null;
      return {
        id: String(row.id),
        employeeId: assignment.profile_id,
        serviceDate: row.service_date,
        endDate: row.end_date,
        shiftKind: row.kind,
        startLocal: start.time,
        endLocal: end.time,
        usesDefaultTime: row.uses_default_time,
        status: period?.status === "draft" ? "draft" : "published",
        note: row.notes ?? undefined,
      };
    })
    .filter((shift): shift is DemoShift => shift !== null);

  return {
    locationId: location.id,
    timeZone: location.time_zone,
    operatingHours,
    shiftDefaults,
    team,
    weekDates,
    monthDates,
    shifts,
  };
}
