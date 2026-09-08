"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SignedInUser } from "@/components/login-screen";
import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonAttendanceRow,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import {
  getOwnAttendanceLink,
  listAttendanceIdentityLinks,
  removeAttendanceIdentityLink,
  upsertAttendanceIdentityLink,
} from "@/features/attendance/data/identity-links";
import {
  aggregateHours,
  resolvePeriodRange,
  type AttendancePeriodSelection,
  type HoursAggregate,
} from "@/features/attendance/domain/attendance-report";
import { getWeekDates } from "@/features/schedules/domain/shift-planning";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; sessionInvalid?: true };

const NOT_SIGNED_IN_ERROR = "You need to sign in to see attendance.";
const NOT_MANAGER_ERROR = "You don't have access to the attendance report.";
const INVALID_REQUEST_ERROR = "That attendance request is invalid.";

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const profileIdSchema = z.uuid();
const localDateSchema = z.iso.date();
const attendancePeriodSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("this-month") }),
  z.object({ type: z.literal("previous-month") }),
  z
    .object({
      type: z.literal("custom"),
      start: localDateSchema,
      end: localDateSchema,
    })
    .refine(({ start, end }) => start <= end),
  // Feature 025: the month/year navigator's own selection. Bounded to
  // 2024-2100 (the acceptance criterion's own "2024-present" floor, with
  // a generous ceiling rather than hardcoding "present" into a schema
  // that would need editing every year) and a real calendar month --
  // still fails closed to "that attendance request is invalid" for
  // anything else, the same as every other branch here.
  z.object({
    type: z.literal("month"),
    year: z.number().int().min(2024).max(2100),
    month: z.number().int().min(1).max(12),
  }),
]);

function invalidRequest<T>(): ActionResult<T> {
  return { ok: false, error: INVALID_REQUEST_ERROR };
}

export type AttendanceAccess =
  | { scope: "all" }
  | { scope: "self"; neonUserId: number }
  | { scope: "unlinked" };

/**
 * Feature 019. The sole authority for "what can this signed-in person
 * see in Attendance" -- resolved fresh, server-side, on every action
 * below, never trusted from the client. Neon has no RLS/tenancy of its
 * own to fall back on (see the original Feature 018 note this replaces),
 * so this function, plus every action actually honoring what it returns,
 * is the entire authorization boundary.
 *
 * An owner/manager/assistant manager always gets "all" -- unchanged from
 * Feature 018. A server gets "self" only when `attendance_identity_links`
 * has a row for them; otherwise "unlinked". A lookup error is treated
 * identically to "no match" -- fail closed, never open, so a transient
 * Supabase hiccup can never widen a server's access to everyone's data.
 */
async function resolveAttendanceAccess(
  restaurantSlug: string,
): Promise<{ user: SignedInUser; access: AttendanceAccess } | null> {
  const currentUser = await getCurrentUser(restaurantSlug);
  if (!currentUser) return null;
  if (currentUser.role !== "server") {
    return { user: currentUser, access: { scope: "all" } };
  }

  const supabase = await createClient();
  const link = await getOwnAttendanceLink(supabase, {
    organizationId: currentUser.organizationId,
    profileId: currentUser.profileId,
  });
  if (!link.ok || !link.data) {
    return { user: currentUser, access: { scope: "unlinked" } };
  }
  return {
    user: currentUser,
    access: { scope: "self", neonUserId: link.data.neonUserId },
  };
}

export type AttendanceAccessView =
  | { scope: "all" }
  | { scope: "self"; neonUserId: number; person: NeonUser | null }
  | { scope: "unlinked" };

/**
 * Tells the client what to render -- never what to enforce. Every other
 * action below re-resolves access itself server-side rather than trusting
 * whatever this returned; this exists only so the UI can show the right
 * shape (picker vs. one person vs. the unlinked panel) without guessing
 * from `user.role` alone, which would drift from the real, link-based
 * answer for a server.
 */
export async function getAttendanceAccessAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<AttendanceAccessView>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  const { access } = resolved;
  if (access.scope !== "self") return { ok: true, data: access };

  const usersResult = await getActiveNeonUsers();
  const person = usersResult.ok
    ? (usersResult.data.find((user) => user.id === access.neonUserId) ?? null)
    : null;
  return {
    ok: true,
    data: { scope: "self", neonUserId: access.neonUserId, person },
  };
}

export async function getAttendanceUsersAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<NeonUser[]>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved || resolved.access.scope !== "all") {
    return { ok: false, error: NOT_MANAGER_ERROR };
  }

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
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      userIds: z.array(z.number().int().positive()).max(1000),
      period: attendancePeriodSchema,
      todayLocalDate: localDateSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  const { access } = resolved;

  // Unlinked: never even build a query. There is no id to run one with,
  // not an empty result that happens to match nobody -- see
  // docs/features/019-attendance-access-and-dashboard.md.
  if (access.scope === "unlinked") return { ok: true, data: { rows: [] } };

  // A non-privileged caller's requested userIds are never honored --
  // silently replaced by the one id their own link resolves to. A
  // tampered request asking for someone else's id gets the caller's own
  // data back, never an error (an error would confirm the requested id
  // was valid, which is more than a caller with no legitimate reason to
  // probe other ids should learn).
  const userIds =
    access.scope === "all" ? parsed.data.userIds : [access.neonUserId];

  const { start, end } = resolvePeriodRange(
    parsed.data.period,
    parsed.data.todayLocalDate,
  );
  const result = await getAttendanceRows({
    userIds,
    startDate: start,
    endDate: end,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { rows: result.data } };
}

export type AttendanceDashboardTotals = {
  day: HoursAggregate;
  week: HoursAggregate;
  month: HoursAggregate;
};

const ZERO_AGGREGATE: HoursAggregate = { totalHours: 0, excludedRowCount: 0 };

/**
 * Day/week/month always mean "today," "this week (Monday-Sunday, via
 * getWeekDates -- the same convention the schedule module already
 * uses)," and "this calendar month" -- independent of whatever
 * person/period the report body currently has selected. Scoped by the
 * identical `resolveAttendanceAccess` result as every other action here:
 * "all" sums every active Neon user, "self" is just the caller's own
 * three numbers, "unlinked" is all zeros with no query run at all.
 */
export async function getAttendanceDashboardTotalsAction(input: {
  restaurantSlug: string;
  todayLocalDate: string;
}): Promise<ActionResult<AttendanceDashboardTotals>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      todayLocalDate: localDateSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  const { access } = resolved;

  if (access.scope === "unlinked") {
    return {
      ok: true,
      data: {
        day: ZERO_AGGREGATE,
        week: ZERO_AGGREGATE,
        month: ZERO_AGGREGATE,
      },
    };
  }

  let userIds: number[];
  if (access.scope === "self") {
    userIds = [access.neonUserId];
  } else {
    const usersResult = await getActiveNeonUsers();
    if (!usersResult.ok) return { ok: false, error: usersResult.error };
    userIds = usersResult.data.map((user) => user.id);
  }

  const weekDates = getWeekDates(parsed.data.todayLocalDate);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const { start: monthStart, end: monthEnd } = resolvePeriodRange(
    { type: "this-month" },
    parsed.data.todayLocalDate,
  );

  const [dayResult, weekResult, monthResult] = await Promise.all([
    getAttendanceRows({
      userIds,
      startDate: parsed.data.todayLocalDate,
      endDate: parsed.data.todayLocalDate,
    }),
    getAttendanceRows({ userIds, startDate: weekStart, endDate: weekEnd }),
    getAttendanceRows({ userIds, startDate: monthStart, endDate: monthEnd }),
  ]);
  if (!dayResult.ok) return { ok: false, error: dayResult.error };
  if (!weekResult.ok) return { ok: false, error: weekResult.error };
  if (!monthResult.ok) return { ok: false, error: monthResult.error };

  return {
    ok: true,
    data: {
      day: aggregateHours(dayResult.data),
      week: aggregateHours(weekResult.data),
      month: aggregateHours(monthResult.data),
    },
  };
}

export type AttendanceLinkOptions = {
  users: NeonUser[];
  links: Array<{ profileId: string; neonUserId: number }>;
};

/**
 * Feature 019, Team tab. Privileged-only -- the same disambiguated Neon
 * user list Feature 018's report already shows, plus every existing link
 * in the organization, so the dialog can show "already linked to X" and
 * let a manager choose deliberately by the name they recognize, never a
 * raw id.
 */
export async function getAttendanceLinkOptionsAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<AttendanceLinkOptions>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved || resolved.access.scope !== "all") {
    return { ok: false, error: NOT_MANAGER_ERROR };
  }

  const usersResult = await getActiveNeonUsers();
  if (!usersResult.ok) return { ok: false, error: usersResult.error };

  const supabase = await createClient();
  const linksResult = await listAttendanceIdentityLinks(supabase, {
    organizationId: resolved.user.organizationId,
  });
  if (!linksResult.ok) return { ok: false, error: linksResult.error };

  return {
    ok: true,
    data: {
      users: usersResult.data,
      links: linksResult.data.map((link) => ({
        profileId: link.profileId,
        neonUserId: link.neonUserId,
      })),
    },
  };
}

export async function setAttendanceIdentityLinkAction(input: {
  restaurantSlug: string;
  targetProfileId: string;
  neonUserId: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      targetProfileId: profileIdSchema,
      neonUserId: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved || resolved.access.scope !== "all") {
    return { ok: false, error: NOT_MANAGER_ERROR };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const result = await upsertAttendanceIdentityLink(supabase, {
    organizationId: resolved.user.organizationId,
    targetProfileId: parsed.data.targetProfileId,
    neonUserId: parsed.data.neonUserId,
    actorProfileId: resolved.user.profileId,
  });
  if (!result.ok) return result;
  revalidatePath(`/r/${parsed.data.restaurantSlug}`);
  return result;
}

export async function removeAttendanceIdentityLinkAction(input: {
  restaurantSlug: string;
  targetProfileId: string;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      targetProfileId: profileIdSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolveAttendanceAccess(parsed.data.restaurantSlug);
  if (!resolved || resolved.access.scope !== "all") {
    return { ok: false, error: NOT_MANAGER_ERROR };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const result = await removeAttendanceIdentityLink(supabase, {
    organizationId: resolved.user.organizationId,
    targetProfileId: parsed.data.targetProfileId,
    actorProfileId: resolved.user.profileId,
  });
  if (!result.ok) return result;
  revalidatePath(`/r/${parsed.data.restaurantSlug}`);
  return result;
}
