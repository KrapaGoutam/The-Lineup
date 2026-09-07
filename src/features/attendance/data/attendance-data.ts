import "server-only";

import { neon } from "@neondatabase/serverless";

export type NeonUser = {
  id: number;
  fullName: string;
  role: string;
  phone: string | null;
  createdAt: string;
  isActive: boolean;
};

export type NeonAttendanceRow = {
  id: number;
  userId: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: number | null;
  autoClockedOut: boolean;
};

export type AttendanceFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// A hard timeout on every Neon call -- generous for a simple indexed read,
// tight enough that a manager isn't left staring at a feature that looks
// broken. Neon's driver merges `fetchOptions` into the underlying fetch()
// call, so a standard AbortSignal is the actual enforcement mechanism --
// confirmed against the installed driver's real type definitions, not
// assumed from its docs alone.
const QUERY_TIMEOUT_MS = 5000;

// The exact, explicit column list this app will ever request from Neon's
// `users` table -- deliberately never `select *`. `pin_hash` is a real
// column on that table and must never cross the wire. This string is the
// literal query text (not a separately-maintained column array that could
// drift out of sync with it), so a test asserting on it is asserting on
// what actually gets sent, not on a comment's promise about it.
export const USERS_QUERY_SQL =
  "select id, full_name, role, phone, created_at, is_active " +
  "from users where is_active = true order by full_name asc";

export const ATTENDANCE_QUERY_SQL =
  "select id, user_id, date, clock_in, clock_out, hours_worked, auto_clocked_out " +
  "from attendance where user_id = ANY($1) and date >= $2 and date <= $3 " +
  "order by date asc, clock_in asc nulls last";

/**
 * Never a module-level singleton -- created fresh inside each call, so
 * `process.env.NEON_DATABASE_URL` is only ever read at request time, the
 * same lazy-read rule every other data-layer module in this app already
 * follows (see docs/features/018-neon-attendance-report.md's "Read before
 * assuming this is greenfield" for why this is what keeps `npm run build`
 * passing in CI with the variable unset). Also means the query timeout's
 * AbortSignal, which starts counting the moment it's created, always
 * covers exactly the one query it's attached to.
 */
function getNeonSql() {
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error("NEON_DATABASE_URL is not set.");
  }
  return neon(connectionString, {
    fetchOptions: { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) },
  });
}

const UNAVAILABLE_ERROR = "Attendance data unavailable. Try again shortly.";

export async function getActiveNeonUsers(): Promise<
  AttendanceFetchResult<NeonUser[]>
> {
  try {
    const sql = getNeonSql();
    const rows = (await sql.query(USERS_QUERY_SQL)) as Array<{
      id: number;
      full_name: string;
      role: string;
      phone: string | null;
      created_at: string;
      is_active: boolean;
    }>;
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        role: row.role,
        phone: row.phone,
        createdAt: row.created_at,
        isActive: row.is_active,
      })),
    };
  } catch (error) {
    console.error("getActiveNeonUsers failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
}

export async function getAttendanceRows(input: {
  userIds: number[];
  startDate: string;
  endDate: string;
}): Promise<AttendanceFetchResult<NeonAttendanceRow[]>> {
  if (input.userIds.length === 0) return { ok: true, data: [] };
  try {
    const sql = getNeonSql();
    const rows = (await sql.query(ATTENDANCE_QUERY_SQL, [
      input.userIds,
      input.startDate,
      input.endDate,
    ])) as Array<{
      id: number;
      user_id: number;
      date: string;
      clock_in: string | null;
      clock_out: string | null;
      hours_worked: string | number | null;
      auto_clocked_out: boolean;
    }>;
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        date: row.date,
        clockIn: row.clock_in,
        clockOut: row.clock_out,
        // Postgres numeric/decimal columns come back as strings over the
        // wire (avoiding float precision loss) -- converted here, once,
        // rather than leaving every caller to remember to do it.
        hoursWorked:
          row.hours_worked === null ? null : Number(row.hours_worked),
        autoClockedOut: row.auto_clocked_out,
      })),
    };
  } catch (error) {
    console.error("getAttendanceRows failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
}
