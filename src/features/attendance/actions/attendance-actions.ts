"use server";

import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonAttendanceRow,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import type { AttendancePeriodSelection } from "@/features/attendance/domain/attendance-report";
import { resolvePeriodRange } from "@/features/attendance/domain/attendance-report";
import { getCurrentUser } from "@/lib/current-user";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NOT_MANAGER_ERROR = "You don't have access to the attendance report.";

/**
 * Feature 018. Both actions re-check the caller's role server-side --
 * the tab is hidden client-side for a server (isManager, matching Team),
 * but that's a UI convenience, not the authorization boundary. Neon has
 * no RLS of its own to fall back on (it's outside this app's Supabase
 * tenancy model entirely -- see the spec's Data and authorization
 * section), so this application-layer check is the only thing standing
 * between a signed-in server and Neon data if they called these actions
 * directly.
 */
async function requireManager(restaurantSlug: string) {
  const currentUser = await getCurrentUser(restaurantSlug);
  if (!currentUser || currentUser.role === "server") return null;
  return currentUser;
}

export async function getAttendanceUsersAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<NeonUser[]>> {
  const currentUser = await requireManager(input.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const result = await getActiveNeonUsers();
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function getAttendanceReportAction(input: {
  restaurantSlug: string;
  userIds: number[];
  period: AttendancePeriodSelection;
  todayLocalDate: string;
}): Promise<ActionResult<{ rows: NeonAttendanceRow[] }>> {
  const currentUser = await requireManager(input.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const { start, end } = resolvePeriodRange(input.period, input.todayLocalDate);
  const result = await getAttendanceRows({
    userIds: input.userIds,
    startDate: start,
    endDate: end,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { rows: result.data } };
}
