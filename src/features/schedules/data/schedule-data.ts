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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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

// The exact column list/embed constraints every shifts read in this
// module needs -- `shifts` has two foreign keys to `schedule_periods`
// (a plain one and a tenant-composite one) and two to
// `shift_assignments`'s parent side likewise -- PostgREST refuses to
// embed either without picking a constraint name explicitly, confirmed
// against the live project (a bare `schedule_periods(status)` returns a
// PGRST201 "more than one relationship found" error, not the rows).
// Picking the tenant-composite constraint for both matches this
// schema's general defense-in-depth pattern.
const SHIFTS_SELECT =
  "id, service_date, end_date, kind, starts_at, ends_at, uses_default_time, notes, series_id, is_recurring, schedule_periods!shifts_period_tenant_fk(status), shift_assignments!shift_assignments_shift_tenant_fk(profile_id)";

/**
 * `shiftRows -> DemoShift[]`, the one place this mapping lives -- shared
 * by the Server Component's own initial load (`getScheduleContext`,
 * below) and the client-triggered week-navigation read
 * (`getShiftsForWeek`), Feature 027, so the two can never quietly drift
 * apart into two different ideas of what a shift row means.
 */
function mapShiftRows(
  shiftRows: Array<{
    id: number;
    service_date: string;
    end_date: string;
    kind: ShiftKind;
    starts_at: string;
    ends_at: string;
    uses_default_time: boolean;
    notes: string | null;
    series_id: string | null;
    is_recurring: boolean;
    schedule_periods: unknown;
    shift_assignments: Array<{ profile_id: string }> | null;
  }>,
  timeZone: string,
): DemoShift[] {
  return shiftRows
    .map((row): DemoShift | null => {
      const assignment = row.shift_assignments?.[0];
      if (!assignment) return null; // a shift with no assignment can't render as one person's row
      const start = zonedWallTimeFromInstant(new Date(row.starts_at), timeZone);
      const end = zonedWallTimeFromInstant(new Date(row.ends_at), timeZone);
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
        seriesId: row.series_id ?? undefined,
        isRecurring: row.is_recurring,
      };
    })
    .filter((shift): shift is DemoShift => shift !== null);
}

/**
 * The shared shift read: one organization, one inclusive date range.
 * Errors are logged, not thrown -- an empty array here must never be
 * confused with "the query itself failed", so the caller degrades to an
 * empty schedule rather than blanking the whole page.
 */
async function getShiftsInRange(
  supabase: SupabaseClient,
  organizationId: string,
  timeZone: string,
  startDate: string,
  endDate: string,
): Promise<DemoShift[]> {
  const { data: shiftRows, error } = await supabase
    .from("shifts")
    .select(SHIFTS_SELECT)
    .eq("organization_id", organizationId)
    .gte("service_date", startDate)
    .lte("service_date", endDate);
  if (error) console.error("getShiftsInRange: shifts", error);
  return mapShiftRows(shiftRows ?? [], timeZone);
}

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
    shifts,
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
    getShiftsInRange(
      supabase,
      organizationId,
      location.time_zone,
      queryStart,
      queryEnd,
    ),
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

export type WeekScheduleData = {
  weekDates: string[];
  shifts: DemoShift[];
};

/**
 * Feature 027. The client-triggered counterpart to `getScheduleContext`'s
 * own initial-load read, for browsing to any other week -- mirrors the
 * `AttendanceReport`/`AllocationWorkspace` navigator pattern already
 * built twice this session: the Server Component's own initial read
 * always means "today" (unchanged, still the only caller of
 * `getScheduleContext`), and this is what a later Prev/Next/date jump
 * calls instead. Only `weekDates`/`shifts` are re-fetched -- operating
 * hours, shift defaults, and the team roster don't vary by week, so the
 * caller keeps using what it already has.
 */
export async function getWeekScheduleData(
  organizationId: string,
  weekStartDate: string,
): Promise<WeekScheduleData | null> {
  const supabase = await createClient();
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const weekDates = getWeekDates(weekStartDate);
  const shifts = await getShiftsInRange(
    supabase,
    organizationId,
    location.time_zone,
    weekDates[0],
    weekDates.at(-1)!,
  );
  return { weekDates, shifts };
}
